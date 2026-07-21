import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import type {Profile, DailyLog} from '@fitmentor/shared';
import {GOAL_LABEL} from '@fitmentor/shared';
import {loadProfile} from '../../utils/profile';
import {ensureToday, computeStreak, saveLog} from '../../utils/habits';
import {generateWorkoutPlan} from '../../utils/workouts';
import {calcTargets} from '../../utils/profileCalc';

export default function HomeScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [log, setLog] = useState<DailyLog | null>(null);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    (async () => {
      const p = await loadProfile();
      setProfile(p);
      const l = await ensureToday();
      setLog(l);
      const st = await computeStreak();
      setStreak(st);
    })();
  }, []);

  const refresh = async () => {
    const l = await ensureToday();
    setLog(l);
    const st = await computeStreak();
    setStreak(st);
  };

  if (!profile || !log) {
    return (
      <View style={s.loading}>
        <Text style={s.loadingText}>Loading…</Text>
      </View>
    );
  }

  const t = calcTargets(profile);
  const plan = generateWorkoutPlan(profile);
  const todayIdx = new Date().getDay() % plan.length;
  const todays = plan[todayIdx];

  const dateStr = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });

  const incrementWater = async () => {
    const updated = {...log, water: log.water + 1};
    await saveLog(updated);
    setLog(updated);
  };

  const incrementProtein = async () => {
    const updated = {...log, proteinG: log.proteinG + 20};
    await saveLog(updated);
    setLog(updated);
  };

  const toggleWorkout = async () => {
    const updated = {...log, workoutDone: !log.workoutDone};
    await saveLog(updated);
    setLog(updated);
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.dateText}>{dateStr}</Text>
            <Text style={s.greeting}>
              Hey, <Text style={s.greetingName}>{profile.name.split(' ')[0]}</Text>
            </Text>
            <Text style={s.goalText}>
              {GOAL_LABEL[profile.goal]} • {profile.daysPerWeek}x/week
            </Text>
          </View>
        </View>

        {/* Today's session card */}
        <TouchableOpacity style={s.sessionCard} activeOpacity={0.8}>
          <View style={s.sessionBadge}>
            <View style={s.sessionDot} />
            <Text style={s.sessionBadgeText}>Today's Session</Text>
          </View>
          <Text style={s.sessionTitle}>{todays.title}</Text>
          <Text style={s.sessionFocus}>{todays.focus}</Text>
          <View style={s.sessionMeta}>
            <View style={s.sessionMetaBadge}>
              <Text style={s.sessionMetaText}>{todays.exercises.length} moves</Text>
            </View>
            <View style={s.sessionMetaBadge}>
              <Text style={s.sessionMetaText}>~45 min</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Stats row */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statEmoji}>🔥</Text>
            <Text style={s.statValue}>{streak}</Text>
            <Text style={s.statLabel}>day streak</Text>
          </View>
          <View style={[s.statCard, s.statCardHighlight]}>
            <Text style={s.statLabel}>kcal</Text>
            <Text style={[s.statValue, s.statValueHighlight]}>{t.calories}</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statLabel}>protein g</Text>
            <Text style={s.statValue}>{t.protein}</Text>
          </View>
        </View>

        {/* Habits */}
        <View style={s.habitsSection}>
          <Text style={s.sectionTitle}>Today's habits</Text>
          <HabitRow
            emoji="💧"
            label="Water"
            value={`${log.water} / 10 glasses`}
            pct={Math.min(100, (log.water / 10) * 100)}
            onAdd={incrementWater}
          />
          <HabitRow
            emoji="🍎"
            label="Protein"
            value={`${log.proteinG} / ${t.protein} g`}
            pct={Math.min(100, (log.proteinG / t.protein) * 100)}
            onAdd={incrementProtein}
          />
          <HabitRow
            emoji="🏋️"
            label="Workout"
            value={log.workoutDone ? 'Done ✓' : 'Not yet'}
            pct={log.workoutDone ? 100 : 0}
            onAdd={toggleWorkout}
            done={log.workoutDone}
          />
        </View>

        {/* Quick actions */}
        <View style={s.actionsRow}>
          <TouchableOpacity style={s.actionCard}>
            <View style={s.actionIcon}>
              <Text style={s.actionIconText}>✨</Text>
            </View>
            <Text style={s.actionLabel}>Ask Coach</Text>
            <Text style={s.actionSub}>AI trainer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionCard}>
            <View style={s.actionIcon}>
              <Text style={s.actionIconText}>📈</Text>
            </View>
            <Text style={s.actionLabel}>Progress</Text>
            <Text style={s.actionSub}>Your stats</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function HabitRow({
  emoji,
  label,
  value,
  pct,
  onAdd,
  done,
}: {
  emoji: string;
  label: string;
  value: string;
  pct: number;
  onAdd: () => void;
  done?: boolean;
}) {
  return (
    <View style={s.habitRow}>
      <View style={s.habitLeft}>
        <View style={[s.habitIcon, done && s.habitIconDone]}>
          <Text style={s.habitIconText}>{emoji}</Text>
        </View>
        <View style={s.habitInfo}>
          <Text style={s.habitLabel}>{label}</Text>
          <Text style={s.habitValue}>{value}</Text>
        </View>
      </View>
      <TouchableOpacity style={s.habitAddBtn} onPress={onAdd}>
        <Text style={s.habitAddBtnText}>+</Text>
      </TouchableOpacity>
      {/* ponytail: simple progress bar via View width */}
      <View style={s.habitProgressBg}>
        <View style={[s.habitProgressFill, {width: `${pct}%`}]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingTop: Platform.OS === 'ios' ? 44 : StatusBar.currentHeight ?? 0,
  },
  loading: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 16,
  },
  scroll: {
    padding: 20,
    paddingBottom: 40,
  },
  // Header
  header: {
    marginTop: 24,
    marginBottom: 8,
  },
  dateText: {
    fontSize: 11,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '600',
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginTop: 4,
  },
  greetingName: {
    color: '#6366f1',
  },
  goalText: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
  },
  // Session card
  sessionCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#6366f1',
    padding: 24,
    marginTop: 16,
    overflow: 'hidden',
  },
  sessionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sessionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f8fafc',
  },
  sessionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(248,250,252,0.8)',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  sessionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginTop: 8,
  },
  sessionFocus: {
    fontSize: 14,
    color: 'rgba(248,250,252,0.8)',
    marginTop: 4,
  },
  sessionMeta: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  sessionMetaBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  sessionMetaText: {
    fontSize: 12,
    color: '#f8fafc',
    fontWeight: '600',
  },
  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    padding: 12,
  },
  statCardHighlight: {
    borderColor: 'rgba(99,102,241,0.4)',
    backgroundColor: 'rgba(99,102,241,0.15)',
  },
  statEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  statValueHighlight: {
    color: '#6366f1',
  },
  statLabel: {
    fontSize: 10,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  // Habits
  habitsSection: {
    marginTop: 28,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginBottom: 12,
  },
  habitRow: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    padding: 14,
    marginBottom: 10,
    overflow: 'hidden',
  },
  habitLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  habitIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  habitIconDone: {
    backgroundColor: '#6366f1',
  },
  habitIconText: {
    fontSize: 18,
  },
  habitInfo: {
    flex: 1,
  },
  habitLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f8fafc',
  },
  habitValue: {
    fontSize: 12,
    color: '#94a3b8',
  },
  habitAddBtn: {
    position: 'absolute',
    right: 14,
    top: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.3)',
    backgroundColor: 'rgba(99,102,241,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  habitAddBtnText: {
    color: '#6366f1',
    fontSize: 18,
    fontWeight: 'bold',
  },
  habitProgressBg: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#0f172a',
    marginTop: 10,
  },
  habitProgressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#6366f1',
  },
  // Actions
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  actionCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    padding: 16,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconText: {
    fontSize: 20,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f8fafc',
    marginTop: 12,
  },
  actionSub: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
});
