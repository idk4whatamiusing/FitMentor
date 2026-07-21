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
import {loadProfile} from '../../utils/profile';
import {ensureToday, saveLog, loadLogs} from '../../utils/habits';

type ToolTab = 'bmi' | 'sleep' | 'steps';

const TOOLS: {id: ToolTab; label: string; icon: string}[] = [
  {id: 'bmi', label: 'BMI', icon: '⚖️'},
  {id: 'sleep', label: 'Sleep', icon: '🌙'},
  {id: 'steps', label: 'Steps', icon: '👟'},
];

export default function ToolsScreen() {
  const [tab, setTab] = useState<ToolTab>('bmi');

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.title}>AI Tools</Text>
        <Text style={s.sub}>Smart tools to level up your fitness journey</Text>

        {/* Tab bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar}>
          {TOOLS.map(t => (
            <TouchableOpacity
              key={t.id}
              style={[s.tabBtn, tab === t.id && s.tabBtnActive]}
              onPress={() => setTab(t.id)}>
              <Text style={s.tabIcon}>{t.icon}</Text>
              <Text style={[s.tabText, tab === t.id && s.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {tab === 'bmi' && <BMIAnalyzer />}
        {tab === 'sleep' && <SleepTracker />}
        {tab === 'steps' && <StepsTracker />}
      </ScrollView>
    </View>
  );
}

function BMIAnalyzer() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [weight, setWeight] = useState('65');
  const [height, setHeight] = useState('170');

  useEffect(() => {
    loadProfile().then(p => {
      if (p) {
        setWeight(String(p.weightKg));
        setHeight(String(p.heightCm));
      }
    });
  }, []);

  const w = Number(weight) || 0;
  const h = Number(height) || 0;
  const hM = h / 100;
  const bmi = hM > 0 ? w / (hM * hM) : 0;
  const category =
    bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
  const categoryColor =
    bmi < 18.5 ? '#60a5fa' : bmi < 25 ? '#34d399' : bmi < 30 ? '#fb923c' : '#f87171';

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>⚖️ BMI Calculator</Text>
      <View style={s.inputRow}>
        <View style={s.inputGroup}>
          <Text style={s.inputLabel}>Weight (kg)</Text>
          <TextInput
            style={s.input}
            keyboardType="decimal-pad"
            value={weight}
            onChangeText={setWeight}
          />
        </View>
        <View style={s.inputGroup}>
          <Text style={s.inputLabel}>Height (cm)</Text>
          <TextInput
            style={s.input}
            keyboardType="decimal-pad"
            value={height}
            onChangeText={setHeight}
          />
        </View>
      </View>
      <View style={s.bmiResult}>
        <Text style={s.bmiLabel}>Your BMI</Text>
        <Text style={[s.bmiValue, {color: categoryColor}]}>{bmi.toFixed(1)}</Text>
        <Text style={[s.bmiCategory, {color: categoryColor}]}>{category}</Text>
      </View>
      <Text style={s.bmiTip}>
        • BMI doesn't account for muscle mass. Athletes may show higher BMI while being healthy.
      </Text>
    </View>
  );
}

function SleepTracker() {
  const [today, setToday] = useState<DailyLog | null>(null);
  const [logs, setLogs] = useState<Record<string, DailyLog>>({});
  const [sleepVal, setSleepVal] = useState(7);

  useEffect(() => {
    (async () => {
      const t = await ensureToday();
      setToday(t);
      setSleepVal(t.sleep || 7);
      setLogs(await loadLogs());
    })();
  }, []);

  const logSleep = async () => {
    if (!today) return;
    const updated = {...today, sleep: sleepVal};
    await saveLog(updated);
    setToday(updated);
  };

  const recentKeys = Object.keys(logs)
    .sort()
    .reverse()
    .slice(0, 7);
  const recentLogs = recentKeys.map(k => logs[k]);
  const avgSleep =
    recentLogs.reduce((s, l) => s + (l.sleep || 0), 0) /
      Math.max(1, recentLogs.filter(l => l.sleep).length) || 0;
  const score = Math.min(100, Math.round((avgSleep / 8) * 100));
  const status =
    avgSleep < 6 ? 'Poor' : avgSleep < 7.5 ? 'Fair' : avgSleep < 9 ? 'Good' : 'Excellent';
  const statusColor =
    avgSleep < 6 ? '#f87171' : avgSleep < 7.5 ? '#fb923c' : avgSleep < 9 ? '#34d399' : '#60a5fa';

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>🌙 Sleep Tracker</Text>
      <View style={s.bmiResult}>
        <Text style={s.bmiLabel}>7-Day Recovery Score</Text>
        <Text style={[s.bmiValue, {color: statusColor}]}>{isNaN(score) ? 0 : score}%</Text>
        <Text style={[s.bmiCategory, {color: statusColor}]}>{status}</Text>
      </View>
      <Text style={s.inputLabel}>
        Log tonight's sleep: <Text style={{color: '#6366f1'}}>{sleepVal}h</Text>
      </Text>
      <View style={s.sliderRow}>
        {[0, 2, 4, 6, 8, 10, 12].map(v => (
          <TouchableOpacity
            key={v}
            style={[s.sliderBtn, sleepVal === v && s.sliderBtnActive]}
            onPress={() => setSleepVal(v)}>
            <Text style={[s.sliderBtnText, sleepVal === v && s.sliderBtnTextActive]}>{v}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={s.logBtn} onPress={logSleep}>
        <Text style={s.logBtnText}>Log Sleep</Text>
      </TouchableOpacity>
      <Text style={s.cardTitle}>Last 7 days</Text>
      <View style={s.barChart}>
        {recentLogs.map((l, i) => {
          const h = l.sleep || 0;
          const pct = Math.min(100, (h / 10) * 100);
          const day = new Date(l.date).toLocaleDateString('en-IN', {weekday: 'short'});
          return (
            <View key={i} style={s.barCol}>
              <View style={s.barBg}>
                <View style={[s.barFill, {height: `${Math.max(5, pct)}%`}]} />
              </View>
              <Text style={s.barLabel}>{day}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function StepsTracker() {
  const [today, setToday] = useState<DailyLog | null>(null);
  const [stepsVal, setStepsVal] = useState(0);

  useEffect(() => {
    ensureToday().then(t => {
      setToday(t);
      setStepsVal(t.steps);
    });
  }, []);

  const addSteps = async (amount: number) => {
    if (!today) return;
    const updated = {...today, steps: Math.min(50000, today.steps + amount)};
    await saveLog(updated);
    setToday(updated);
    setStepsVal(updated.steps);
  };

  const goal = 10000;
  const pct = Math.min(100, (stepsVal / goal) * 100);

  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>👟 Steps Tracker</Text>
      <View style={s.bmiResult}>
        <Text style={s.bmiLabel}>Today's Steps</Text>
        <Text style={s.bmiValue}>{stepsVal.toLocaleString()}</Text>
        <Text style={s.bmiCategory}>Goal: {goal.toLocaleString()}</Text>
      </View>
      <View style={s.progressBg}>
        <View style={[s.progressFill, {width: `${pct}%`}]} />
      </View>
      <View style={s.stepsGrid}>
        <TouchableOpacity style={s.stepsBtn} onPress={() => addSteps(500)}>
          <Text style={s.stepsBtnText}>+500</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.stepsBtn} onPress={() => addSteps(1000)}>
          <Text style={s.stepsBtnText}>+1,000</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.stepsBtn} onPress={() => addSteps(2000)}>
          <Text style={s.stepsBtnText}>+2,000</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.stepsBtn} onPress={() => addSteps(5000)}>
          <Text style={s.stepsBtnText}>+5,000</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.bmiTip}>
        💡 Aim for 8,000–10,000 steps daily. Walking after meals helps digestion too.
      </Text>
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
  title: {fontSize: 24, fontWeight: 'bold', color: '#f8fafc'},
  sub: {fontSize: 13, color: '#94a3b8', marginTop: 4},
  tabBar: {marginTop: 16, flexGrow: 0},
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#1e293b',
    marginRight: 8,
  },
  tabBtnActive: {backgroundColor: '#6366f1'},
  tabIcon: {fontSize: 14},
  tabText: {fontSize: 12, fontWeight: '600', color: '#94a3b8'},
  tabTextActive: {color: '#f8fafc'},
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    padding: 20,
    marginTop: 16,
  },
  cardTitle: {fontSize: 16, fontWeight: 'bold', color: '#f8fafc'},
  inputRow: {flexDirection: 'row', gap: 12, marginTop: 16},
  inputGroup: {flex: 1},
  inputLabel: {fontSize: 12, color: '#94a3b8'},
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0f172a',
    backgroundColor: '#0f172a',
    paddingHorizontal: 12,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#f8fafc',
    marginTop: 6,
  },
  bmiResult: {
    borderRadius: 12,
    backgroundColor: '#0f172a',
    padding: 16,
    marginTop: 16,
    alignItems: 'center',
  },
  bmiLabel: {fontSize: 11, color: '#64748b'},
  bmiValue: {fontSize: 36, fontWeight: '900', color: '#f8fafc', marginTop: 4},
  bmiCategory: {fontSize: 14, fontWeight: '600', color: '#94a3b8', marginTop: 4},
  bmiTip: {fontSize: 11, color: '#64748b', marginTop: 12, lineHeight: 16},
  sliderRow: {flexDirection: 'row', gap: 6, marginTop: 12},
  sliderBtn: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderBtnActive: {backgroundColor: '#6366f1'},
  sliderBtnText: {fontSize: 12, color: '#94a3b8', fontWeight: '600'},
  sliderBtnTextActive: {color: '#f8fafc'},
  logBtn: {
    marginTop: 12,
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  logBtnText: {fontSize: 14, fontWeight: '700', color: '#f8fafc'},
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginTop: 12,
    height: 100,
  },
  barCol: {flex: 1, alignItems: 'center', height: '100%'},
  barBg: {
    flex: 1,
    width: '100%',
    borderRadius: 6,
    backgroundColor: '#0f172a',
    justifyContent: 'flex-end',
  },
  barFill: {width: '100%', borderRadius: 6, backgroundColor: '#6366f1'},
  barLabel: {fontSize: 9, color: '#64748b', marginTop: 4},
  progressBg: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0f172a',
    marginTop: 12,
  },
  progressFill: {height: 10, borderRadius: 5, backgroundColor: '#6366f1'},
  stepsGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16},
  stepsBtn: {
    flex: 1,
    minWidth: '45%',
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0f172a',
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepsBtnText: {fontSize: 13, fontWeight: '600', color: '#f8fafc'},
});
