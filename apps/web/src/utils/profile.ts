// ponytail: re-exports types from shared for backward compat
export type { Gender, Goal, Experience, Diet, Place, Profile } from "@fitmentor/shared";
import type { Profile } from "@fitmentor/shared";

let _profile: Profile | null = null;

export function loadProfile(): Profile | null {
  return _profile;
}

export function saveProfile(p: Profile) {
  _profile = p;
  window.dispatchEvent(new Event("fitmentor:profile"));
}

export function clearProfile() {
  _profile = null;
  window.dispatchEvent(new Event("fitmentor:profile"));
}

// Mifflin-St Jeor BMR + activity multiplier
export function calcBmr(p: Pick<Profile, "weightKg" | "heightCm" | "age" | "gender">) {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return p.gender === "male" ? base + 5 : base - 161;
}

export function calcTdee(p: Profile) {
  // Activity factor scales with workout days
  const factor = 1.35 + Math.min(p.daysPerWeek, 6) * 0.045; // 1.35..1.62
  return Math.round(calcBmr(p) * factor);
}

export function calcTargets(p: Profile) {
  const tdee = calcTdee(p);
  let calories = tdee;
  if (p.goal === "fat_loss") calories = tdee - 400;
  else if (p.goal === "muscle_gain") calories = tdee + 300;
  else if (p.goal === "recomp") calories = tdee - 150;
  // protein g/kg
  const proteinPerKg =
    p.goal === "muscle_gain" || p.goal === "strength" ? 1.8 : p.goal === "fat_loss" ? 2.0 : 1.6;
  const protein = Math.round(p.weightKg * proteinPerKg);
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { calories: Math.round(calories), protein, carbs, fat, tdee };
}

export { GOAL_LABEL } from "@fitmentor/shared";
