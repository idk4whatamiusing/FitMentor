#!/usr/bin/env python3
"""Copy an exported D1 (SQLite) database into CockroachDB.

Prerequisites
-------------
1. Apply the CockroachDB schema:
     psql "$DATABASE_URL" -f api/migrations/cockroach/0001_init.sql
2. Export D1 (requires a valid `wrangler login` session):
     npx wrangler d1 export fitmentor --remote --output=d1-dump.sql
3. Run this script:
     python3 scripts/migrate-d1-to-crdb.py \
       --dump d1-dump.sql \
       --database-url "$DATABASE_URL" \
       --fresh

`--fresh` truncates the destination tables first. Without it, duplicate
primary keys will abort the import.
"""

from __future__ import annotations

import argparse
import csv
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import tempfile

# Insert order respects foreign keys.
TABLES = [
    "users",
    "profiles",
    "subscriptions",
    "daily_logs",
    "workout_completions",
    "coach_logs",
    "chat_sessions",
    "meal_plans",
    "workout_plans",
    "bmi_advice",
    "sleep_advice",
    "injury_advice",
    "form_advice",
    "ai_quota",
    "ai_quota_seen",
]

NULL_SENTINEL = "\\N"


def load_sqlite(dump: pathlib.Path) -> sqlite3.Connection:
    connection = sqlite3.connect(":memory:")
    script = dump.read_text(encoding="utf-8")
    connection.executescript(script)
    return connection


def tables_in(connection: sqlite3.Connection) -> set[str]:
    rows = connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    return {row[0] for row in rows}


def write_csv(connection: sqlite3.Connection, table: str, path: pathlib.Path) -> tuple[int, list[str]]:
    cursor = connection.execute(f"SELECT * FROM {table}")
    columns = [description[0] for description in cursor.description]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        count = 0
        for row in cursor:
            writer.writerow([NULL_SENTINEL if value is None else value for value in row])
            count += 1
    return count, columns


def psql(database_url: str, sql: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["psql", database_url, "-X", "-v", "ON_ERROR_STOP=1", "-c", sql],
        text=True,
        capture_output=True,
    )


def count_rows(database_url: str, table: str) -> int:
    result = subprocess.run(
        [
            "psql",
            database_url,
            "-X",
            "-A",
            "-t",
            "-v",
            "ON_ERROR_STOP=1",
            "-c",
            f"SELECT COUNT(*) FROM {table}",
        ],
        text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        return -1
    return int(result.stdout.strip())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dump", required=True, type=pathlib.Path, help="D1 SQL export file")
    parser.add_argument("--database-url", required=True, help="CockroachDB connection string")
    parser.add_argument(
        "--fresh",
        action="store_true",
        help="TRUNCATE destination tables before importing",
    )
    args = parser.parse_args()

    if shutil.which("psql") is None:
        print("error: psql is not installed", file=sys.stderr)
        return 1
    if not args.dump.exists():
        print(f"error: dump not found: {args.dump}", file=sys.stderr)
        return 1

    connection = load_sqlite(args.dump)
    present = tables_in(connection)

    missing = [table for table in TABLES if table not in present]
    if missing:
        print(f"warning: tables missing from dump: {', '.join(missing)}", file=sys.stderr)

    if args.fresh:
        truncate = ", ".join(TABLES)
        result = psql(args.database_url, f"TRUNCATE {truncate} CASCADE")
        if result.returncode != 0:
            print(result.stderr, file=sys.stderr)
            return 1
        print("truncated destination tables")

    with tempfile.TemporaryDirectory(prefix="fitmentor-migrate-") as temp_dir:
        temp = pathlib.Path(temp_dir)
        source_counts: dict[str, int] = {}

        for table in TABLES:
            if table not in present:
                continue
            csv_path = temp / f"{table}.csv"
            count, columns = write_csv(connection, table, csv_path)
            source_counts[table] = count
            if count == 0:
                print(f"{table}: 0 rows, skipped")
                continue

            column_list = ", ".join(f'"{column}"' for column in columns)
            copy_sql = (
                f"\\copy {table} ({column_list}) FROM '{csv_path}' "
                f"WITH (FORMAT csv, NULL '{NULL_SENTINEL}')"
            )
            result = subprocess.run(
                ["psql", args.database_url, "-X", "-v", "ON_ERROR_STOP=1", "-c", copy_sql],
                text=True,
                capture_output=True,
            )
            if result.returncode != 0:
                print(f"error importing {table}:\n{result.stderr}", file=sys.stderr)
                return 1
            print(f"{table}: {count} rows")

    print("\nrow-count check:")
    failed = False
    for table, expected in source_counts.items():
        actual = count_rows(args.database_url, table)
        status = "ok" if actual == expected else "MISMATCH"
        if actual != expected:
            failed = True
        print(f"  {table}: source={expected} destination={actual} {status}")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
