import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  StatusBar,
} from 'react-native';
import type {Profile, DailyLog} from '@fitmentor/shared';
import {GOAL_LABEL} from '@fitmentor/shared';
import {loadProfile} from '../../utils/profile';
import {calcTargets} from '../../utils/profileCalc';
import {ensureToday, saveLog, computeStreak, loadLogs} from '../../utils/habits';

export default function ProgressScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [streak, setStreak] = useState(0);
  const [weight, setWeight] = useState('');

  useEffect(() => {
    loadProfile().then(setProfile);
    refresh();
  }, []);

  const refresh = async () => {
    const all = await loadLogs();
    const keys = Object.keys(all)
      .sort()
      .reverse()
      .slice(0, 7);
    setLogs(keys.map(k => all[k]));
    setStreak(await computeStreak());
  };

  const logWeight = async () => {
    if (!weight) return;
    const log = await ensureToday();
    await saveLog({...log, weightKg: Number(weight)});
    setWeight('');
    refresh();
  };

  const workoutsThisWeek = logs.filter(l => l.workoutDone).length;

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.label}>Tracking</Text>
        <Text style={s.title}>Progress</Text>
        <Text style={s.sub}>Last 7 days at a glance.</Text>

        {/* Streak & workouts */}
        <View style={s.cardsRow}>
          <View style={s.statCard}>
            <Text style={s.statEmoji}>🔥</Text>
            <Text style={s.statValue}>{streak}</Text>
            <Text style={s.statLabel}>Day streak</Text>
          </View>
          <View style={[s.statCard, s.statCardAccent]}>
            <Text style={s.statEmoji}>📈</Text>
            <Text style={s.statValue}>{workoutsThisWeek}</Text>
            <Text style={s.statLabel}>Workouts this week</Text>
          </View>
        </View>

        {/* Weight */}
        <View style={s.weightCard}>
          <Text style={s.weightTitle}>⚖️ Weight</Text>
          <Text style={s.weightSub}>Log it daily, same time.</Text>
          <View style={s.weightRow}>
            <TextInput
              style={s.weightInput}
              keyboardType="decimal-pad"
              placeholder={profile ? `${profile.weightKg} kg` : 'kg'}
              placeholderTextColor="#64748b"
              value={weight}
              onChangeText={setWeight}
            />
            <TouchableOpacity
              style={[s.logBtn, !weight && s.logBtnDisabled]}
              onPress={logWeight}
              disabled={!weight}>
              <Text style={s.logBtnText}>Log</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Protein chart (simple bar representation) */}
        <View style={s.chartCard}>
          <Text style={s.chartTitle}>🎯 Protein intake</Text>
          {profile && (
            <Text style={s.chartSub}>Target: {calcTargets(profile).protein}g/day</Text>
          )}
          <View style={s.barChart}>
            {logs.reverse().map((l, i) => {
              const h = Math.min(100, (l.proteinG / (profile ? calcTargets(profile).protein : 100)) * 100);
              const day = new Date(l.date).toLocaleDateString('en-IN', {weekday: 'short'});
              return (
                <View key={i} style={s.barCol}>
                  <View style={s.barBg}>
                    <View style={[s.barFill, {height: `${Math.max(5, h)}%`}]} />
                  </View>
                  <Text style={s.barLabel}>{day}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* 7-day log summary */}
        <View style={s.summaryCard}>
          <Text style={s.summaryTitle}>7-Day Summary</Text>
          {logs.map((l, i) => (
            <View key={i} style={s.summaryRow}>
              <Text style={s.summaryDate}>
                {new Date(l.date).toLocaleDateString('en-IN', {day: 'numeric', month: 'short'})}
              </Text>
              <Text style={s.summaryVal}>💧 {l.water}</Text>
              <Text style={s.summaryVal}>😴 {l.sleep}h</Text>
              <Text style={s.summaryVal}>🚶 {l.steps}</Text>
              <Text style={s.summaryVal}>🍖 {l.proteinG}g</Text>
              <Text style={s.summaryVal}>{l.workoutDone ? '✅' : '—'}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingTop: Platform.OS === 'ios' ? 44 : StatusBar.currentHeight ?? 0,
  },
  scroll: {padding: 20, paddingBottom: 40},
  label: {
    fontSize: 11,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontWeight: '600',
  },
  title: {fontSize: 28, fontWeight: 'bold', color: '#f8fafc', marginTop: 4},
  sub: {fontSize: 13, color: '#94a3b8', marginTop: 2},
  cardsRow: {flexDirection: 'row', gap: 10, marginTop: 20},
  statCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    padding: 16,
  },
  statCardAccent: {borderColor: 'rgba(99,102,241,0.3)'},
  statEmoji: {fontSize: 20, marginBottom: 8},
  statValue: {fontSize: 28, fontWeight: 'bold', color: '#f8fafc'},
  statLabel: {
    fontSize: 10,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 4,
  },
  weightCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    padding: 16,
    marginTop: 12,
  },
  weightTitle: {fontSize: 15, fontWeight: '600', color: '#f8fafc'},
  weightSub: {fontSize: 12, color: '#94a3b8', marginTop: 2},
  weightRow: {flexDirection: 'row', gap: 8, marginTop: 12},
  weightInput: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0f172a',
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#f8fafc',
  },
  logBtn: {
    paddingHorizontal: 20,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logBtnDisabled: {opacity: 0.5},
  logBtnText: {fontSize: 14, fontWeight: '700', color: '#f8fafc'},
  chartCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    padding: 16,
    marginTop: 12,
  },
  chartTitle: {fontSize: 15, fontWeight: '600', color: '#f8fafc'},
  chartSub: {fontSize: 12, color: '#94a3b8', marginTop: 2},
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginTop: 16,
    height: 120,
  },
  barCol: {flex: 1, alignItems: 'center', height: '100%'},
  barBg: {
    flex: 1,
    width: '100%',
    borderRadius: 6,
    backgroundColor: '#0f172a',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderRadius: 6,
    backgroundColor: '#6366f1',
  },
  barLabel: {fontSize: 9, color: '#64748b', marginTop: 4},
  summaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    padding: 16,
    marginTop: 12,
  },
  summaryTitle: {fontSize: 15, fontWeight: '600', color: '#f8fafc', marginBottom: 12},
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
  },
  summaryDate: {fontSize: 12, color: '#94a3b8', width: 50},
  summaryVal: {fontSize: 11, color: '#e2e8f0', flex: 1, textAlign: 'center'},
});
