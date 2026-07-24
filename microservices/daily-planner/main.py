"""
Daily planner — scheduled batch job that generates AI meal & workout plans
for all users and saves to PostgreSQL. Runs once per day.

Environment variables:
  DATABASE_URL          — Postgres connection string
  CF_ACCOUNT_ID         — Cloudflare account ID
  CF_API_TOKEN          — Cloudflare API token (Workers AI:Run permission)
"""

import os
import json
import logging
from datetime import date
from typing import Any

import httpx
import psycopg2
import psycopg2.extras

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

CF_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct"
CF_API = f"https://api.cloudflare.com/client/v4/accounts/{os.environ['CF_ACCOUNT_ID']}/ai/run/{CF_MODEL}"


def get_users(conn) -> list[dict[str, Any]]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("SELECT id, cf_access_sub, email, name FROM users")
        return cur.fetchall()


def get_profile(conn, user_id) -> dict[str, Any] | None:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT * FROM profiles WHERE user_id = %s",
            (user_id,),
        )
        return cur.fetchone()


def get_recent_logs(conn, user_uuid, days: int = 7) -> list[dict[str, Any]]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """SELECT date, water, sleep, steps, protein_g, workout_done, weight_kg
               FROM daily_logs
               WHERE user_id = %s AND date >= CURRENT_DATE - INTERVAL '%s days'
               ORDER BY date DESC""",
            (user_uuid, days),
        )
        return cur.fetchall()


def get_recent_coach(conn, cf_sub: str, days: int = 7) -> list[dict[str, Any]]:
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            """SELECT messages FROM chat_sessions
               WHERE user_id = %s AND updated_at >= CURRENT_DATE - INTERVAL '%s days'
               ORDER BY updated_at DESC""",
            (cf_sub, days),
        )
        rows = cur.fetchall()
        msgs = []
        for r in rows:
            if isinstance(r["messages"], list):
                msgs.extend(r["messages"])
        return msgs


def call_cf_ai(system: str, prompt: str, max_tokens: int = 2048) -> str:
    with httpx.Client(timeout=120) as client:
        resp = client.post(
            CF_API,
            headers={"Authorization": f"Bearer {os.environ['CF_API_TOKEN']}"},
            json={
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
                "max_tokens": max_tokens,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        raw = (
            data.get("result", {})
            .get("choices", [{}])[0]
            .get("message", {})
            .get("content")
            or data.get("result", {}).get("response")
            or ""
        )
        return raw.replace("```json", "").replace("```", "").strip()


def generate_meal_plan(profile: dict) -> list[dict]:
    diet = profile.get("diet", "mixed")
    budget = profile.get("budget_per_day") or profile.get("budgetPerDay", 150)
    health = profile.get("health_conditions") or profile.get("healthConditions", [])
    health_str = ", ".join(health) if health else "none"

    system = (
        'You are a meal planner for Indian beginners. '
        'Return a JSON object with a "meals" array (4 items: Breakfast, Lunch, Snack, Dinner). '
        "Each meal has name (string), items (string), kcal (number), protein (number). "
        'Example: {"meals":[{"name":"Poha","items":"poha, peanuts, onion","kcal":400,"protein":12}]}. '
        "Return ONLY the JSON object, no markdown."
    )
    prompt = f"Diet: {diet}, budget: INR {budget}/day, health: {health_str}"

    raw = call_cf_ai(system, prompt, 2048)
    parsed = json.loads(raw)
    meals = parsed.get("meals") if isinstance(parsed, dict) and isinstance(parsed.get("meals"), list) else (parsed if isinstance(parsed, list) else [])
    plan_id = f"plan-{date.today().isoformat()}"
    return [{"id": plan_id, "title": "Today's Plan", "budgetPerDay": budget, "diet": diet, "meals": meals}]


def generate_workout_plan(profile: dict) -> list[dict]:
    days = profile.get("days_per_week") or profile.get("daysPerWeek", 3)
    goal = profile.get("goal", "fitness")
    place = profile.get("place", "home")
    exp = profile.get("experience", "beginner")
    health = profile.get("health_conditions") or profile.get("healthConditions", [])
    health_str = ", ".join(health) if health else "none"

    system = (
        f"You are a fitness coach for Indian beginners. "
        f"Generate a JSON workout plan ({days} days). "
        "Each day has title, focus, exercises[]. "
        "Each exercise has name (string), sets (number), reps (string), rest (string), "
        "muscles (string[]), tips (string), alt (string). "
        "Return ONLY the JSON array. Be very concise."
    )
    prompt = f"Goal: {goal}, place: {place}, experience: {exp}, health: {health_str}"

    raw = call_cf_ai(system, prompt, 4096)
    return json.loads(raw)


def save_plan(conn, table: str, cf_sub: str, plan: list[dict]) -> None:
    today = date.today()
    with conn.cursor() as cur:
        cur.execute(
            f"""INSERT INTO {table} (user_id, date, plan)
                VALUES (%s, %s, %s)
                ON CONFLICT (user_id, date) DO UPDATE SET
                    plan = EXCLUDED.plan,
                    updated_at = now()""",
            (cf_sub, today, json.dumps(plan)),
        )
    conn.commit()


def run():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    users = get_users(conn)
    logger.info("Loaded %d users", len(users))

    for user in users:
        cf_sub = user["cf_access_sub"]
        user_uuid = user["id"]
        logger.info("Processing user %s (%s)", user["name"], cf_sub)

        try:
            profile = get_profile(conn, user_uuid)
            if not profile:
                logger.warning("No profile for %s, skipping", cf_sub)
                continue

            # Generate meal plan
            meal_plan = generate_meal_plan(profile)
            save_plan(conn, "meal_plans", cf_sub, meal_plan)
            logger.info("  Meal plan saved")

            # Generate workout plan
            workout_plan = generate_workout_plan(profile)
            save_plan(conn, "workout_plans", cf_sub, workout_plan)
            logger.info("  Workout plan saved")

        except Exception as e:
            logger.error("Failed for user %s: %s", cf_sub, e)

    conn.close()
    logger.info("Done")


if __name__ == "__main__":
    run()
