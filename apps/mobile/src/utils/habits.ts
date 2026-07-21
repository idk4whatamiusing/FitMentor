import AsyncStorage from '@react-native-async-storage/async-storage';
import type {DailyLog} from '@fitmentor/shared';

const KEY = 'fitmentor.habits.v1';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function loadLogs(): Promise<Record<string, DailyLog>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function saveLog(log: DailyLog): Promise<void> {
  const all = await loadLogs();
  all[log.date] = log;
  await AsyncStorage.setItem(KEY, JSON.stringify(all));
}

export async function ensureToday(): Promise<DailyLog> {
  const all = await loadLogs();
  const k = todayKey();
  if (!all[k]) {
    all[k] = {
      date: k,
      water: 0,
      sleep: 0,
      steps: 0,
      proteinG: 0,
      workoutDone: false,
    };
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
  }
  return all[k];
}

export async function computeStreak(): Promise<number> {
  const logs = await loadLogs();
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
