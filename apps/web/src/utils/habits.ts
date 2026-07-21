// Lightweight habit & streak tracking in localStorage.
const KEY = "fitmentor.habits.v1";

export type { DailyLog } from "@fitmentor/shared";
import type { DailyLog } from "@fitmentor/shared";

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function loadLogs(): Record<string, DailyLog> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function saveLog(log: DailyLog) {
  const all = loadLogs();
  all[log.date] = log;
  localStorage.setItem(KEY, JSON.stringify(all));
  window.dispatchEvent(new Event("fitmentor:logs"));
}

export function ensureToday(): DailyLog {
  const all = loadLogs();
  const k = todayKey();
  if (!all[k]) {
    all[k] = { date: k, water: 0, sleep: 0, steps: 0, proteinG: 0, workoutDone: false };
    localStorage.setItem(KEY, JSON.stringify(all));
  }
  return all[k];
}

export function computeStreak(): number {
  const logs = loadLogs();
  let streak = 0;
  const d = new Date();
  for (;;) {
    const k = d.toISOString().slice(0, 10);
    const log = logs[k];
    if (log && (log.workoutDone || log.water >= 6 || log.proteinG > 0)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else break;
  }
  return streak;
}

export function last7(): DailyLog[] {
  const logs = loadLogs();
  const out: DailyLog[] = [];
  const d = new Date();
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(d);
    dt.setDate(d.getDate() - i);
    const k = dt.toISOString().slice(0, 10);
    out.push(
      logs[k] ?? { date: k, water: 0, sleep: 0, steps: 0, proteinG: 0, workoutDone: false },
    );
  }
  return out;
}
