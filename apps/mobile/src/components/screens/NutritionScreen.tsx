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
import {INDIAN_MEAL_PLANS, COMMON_FOODS} from '@fitmentor/shared';
import {loadProfile} from '../../utils/profile';
import {calcTargets} from '../../utils/profileCalc';
import {ensureToday, saveLog} from '../../utils/habits';

export default function NutritionScreen() {
  const [tab, setTab] = useState<'plans' | 'log'>('plans');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [today, setToday] = useState<DailyLog | null>(null);

  useEffect(() => {
    loadProfile().then(setProfile);
    ensureToday().then(setToday);
  }, []);

  const targets = profile ? calcTargets(profile) : null;
  const plans = INDIAN_MEAL_PLANS.filter(p =>
    profile?.diet === 'veg' ? p.diet === 'veg' : true,
  );

  const logFood = async (protein: number) => {
    if (!today) return;
    const updated = {...today, proteinG: today.proteinG + protein};
    await saveLog(updated);
    setToday(updated);
  };

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.label}>Fuel</Text>
        <Text style={s.title}>Nutrition</Text>
        <Text style={s.sub}>Affordable Indian meals built for your goal.</Text>

        {targets && today && (
          <View style={s.targetCard}>
            <Text style={s.targetLabel}>Your daily target</Text>
            <View style={s.macroRow}>
              <Macro label="kcal" value={targets.calories} />
              <Macro label="P" value={targets.protein} highlight />
              <Macro label="C" value={targets.carbs} />
              <Macro label="F" value={targets.fat} />
            </View>
            <View style={s.progressSection}>
              <View style={s.progressHeader}>
                <Text style={s.progressLabel}>Protein logged today</Text>
                <Text style={s.progressValue}>
                  {today.proteinG}g / {targets.protein}g
                </Text>
              </View>
              <View style={s.progressBg}>
                <View
                  style={[
                    s.progressFill,
                    {
                      width: `${Math.min(
                        100,
                        targets.protein > 0
                          ? (today.proteinG / targets.protein) * 100
                          : 0,
                      )}%`,
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        )}

        <View style={s.tabs}>
          <TouchableOpacity
            style={[s.tabBtn, tab === 'plans' && s.tabBtnActive]}
            onPress={() => setTab('plans')}>
            <Text style={[s.tabText, tab === 'plans' && s.tabTextActive]}>Meal plans</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabBtn, tab === 'log' && s.tabBtnActive]}
            onPress={() => setTab('log')}>
            <Text style={[s.tabText, tab === 'log' && s.tabTextActive]}>Quick log</Text>
          </TouchableOpacity>
        </View>

        {tab === 'plans' &&
          plans.map(plan => {
            const totals = plan.meals.reduce(
              (acc, m) => ({k: acc.k + m.kcal, p: acc.p + m.protein}),
              {k: 0, p: 0},
            );
            return (
              <View key={plan.id} style={s.planCard}>
                <View style={s.planHeader}>
                  <Text style={s.planTitle}>{plan.title}</Text>
                  <Text style={s.planTotal}>
                    {totals.k} kcal • {totals.p}g P
                  </Text>
                </View>
                {plan.meals.map((m, i) => (
                  <View key={i} style={s.mealRow}>
                    <View style={{flex: 1}}>
                      <Text style={s.mealName}>{m.name}</Text>
                      <Text style={s.mealItems}>{m.items}</Text>
                    </View>
                    <View style={s.mealRight}>
                      <Text style={s.mealKcal}>{m.kcal} kcal</Text>
                      <Text style={s.mealProtein}>{m.protein}g P</Text>
                    </View>
                  </View>
                ))}
              </View>
            );
          })}

        {tab === 'log' && (
          <View style={s.logSection}>
            <Text style={s.logHint}>Tap a food to log it for today.</Text>
            {COMMON_FOODS.map(f => (
              <TouchableOpacity key={f.name} style={s.foodCard} onPress={() => logFood(f.protein)}>
                <View style={{flex: 1}}>
                  <Text style={s.foodName}>{f.name}</Text>
                  <Text style={s.foodMeta}>
                    {f.kcal} kcal • {f.protein}g protein
                  </Text>
                </View>
                <View style={s.foodAdd}>
                  <Text style={s.foodAddText}>+</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Macro({label, value, highlight}: {label: string; value: number; highlight?: boolean}) {
  return (
    <View style={s.macro}>
      <Text style={[s.macroValue, highlight && s.macroValueHighlight]}>{value}</Text>
      <Text style={s.macroLabel}>{label}</Text>
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
  targetCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    padding: 20,
    marginTop: 20,
  },
  targetLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6366f1',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  macroRow: {flexDirection: 'row', justifyContent: 'space-around', marginTop: 16},
  macro: {alignItems: 'center'},
  macroValue: {fontSize: 20, fontWeight: 'bold', color: '#f8fafc'},
  macroValueHighlight: {color: '#6366f1'},
  macroLabel: {
    fontSize: 10,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  progressSection: {marginTop: 16},
  progressHeader: {flexDirection: 'row', justifyContent: 'space-between'},
  progressLabel: {fontSize: 11, color: '#94a3b8'},
  progressValue: {fontSize: 11, color: '#94a3b8', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'},
  progressBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0f172a',
    marginTop: 6,
  },
  progressFill: {height: 8, borderRadius: 4, backgroundColor: '#6366f1'},
  tabs: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    padding: 4,
    marginTop: 20,
  },
  tabBtn: {flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center'},
  tabBtnActive: {backgroundColor: '#0f172a'},
  tabText: {fontSize: 13, fontWeight: '600', color: '#94a3b8'},
  tabTextActive: {color: '#f8fafc'},
  planCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    marginTop: 12,
    overflow: 'hidden',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  planTitle: {fontSize: 15, fontWeight: 'bold', color: '#f8fafc', flex: 1},
  planTotal: {
    fontSize: 11,
    color: '#6366f1',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  mealRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#0f172a',
    padding: 12,
    gap: 8,
  },
  mealName: {fontSize: 13, fontWeight: '600', color: '#f8fafc'},
  mealItems: {fontSize: 11, color: '#94a3b8', marginTop: 2},
  mealRight: {alignItems: 'flex-end'},
  mealKcal: {fontSize: 11, color: '#94a3b8'},
  mealProtein: {fontSize: 11, color: '#6366f1', marginTop: 2},
  logSection: {marginTop: 12, gap: 8},
  logHint: {fontSize: 12, color: '#94a3b8', marginBottom: 4},
  foodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    padding: 14,
    gap: 10,
  },
  foodName: {fontSize: 14, fontWeight: '600', color: '#f8fafc'},
  foodMeta: {fontSize: 11, color: '#94a3b8', marginTop: 2},
  foodAdd: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.3)',
    backgroundColor: 'rgba(99,102,241,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  foodAddText: {color: '#6366f1', fontSize: 18, fontWeight: 'bold'},
});
