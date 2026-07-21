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
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../navigation/RootNavigator';
import type {Profile, WorkoutDay} from '@fitmentor/shared';
import {EXERCISE_LIBRARY} from '@fitmentor/shared';
import {loadProfile} from '../../utils/profile';
import {generateWorkoutPlan} from '../../utils/workouts';
import {ensureToday, saveLog} from '../../utils/habits';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList>;
};

export default function WorkoutsScreen({navigation}: Props) {
  const [tab, setTab] = useState<'plan' | 'library'>('plan');
  const [plan, setPlan] = useState<WorkoutDay[]>([]);
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  useEffect(() => {
    loadProfile().then(p => {
      if (p) setPlan(generateWorkoutPlan(p));
    });
  }, []);

  const markComplete = async () => {
    const log = await ensureToday();
    await saveLog({...log, workoutDone: true});
  };

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.label}>Training</Text>
        <Text style={s.title}>Your Plan</Text>
        <Text style={s.sub}>Built around your goals.</Text>

        {/* Tabs */}
        <View style={s.tabs}>
          <TouchableOpacity
            style={[s.tabBtn, tab === 'plan' && s.tabBtnActive]}
            onPress={() => setTab('plan')}>
            <Text style={[s.tabText, tab === 'plan' && s.tabTextActive]}>This week</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tabBtn, tab === 'library' && s.tabBtnActive]}
            onPress={() => setTab('library')}>
            <Text style={[s.tabText, tab === 'library' && s.tabTextActive]}>Library</Text>
          </TouchableOpacity>
        </View>

        {tab === 'plan' &&
          plan.map((day, i) => (
            <View key={i} style={s.dayCard}>
              <TouchableOpacity
                style={s.dayHeader}
                onPress={() => setOpenIdx(openIdx === i ? null : i)}>
                <View style={s.dayBadge}>
                  <Text style={s.dayBadgeText}>Day {i + 1}</Text>
                </View>
                <View style={{flex: 1}}>
                  <Text style={s.dayTitle}>{day.title}</Text>
                  <Text style={s.dayFocus}>{day.focus}</Text>
                </View>
                <Text style={s.chevron}>{openIdx === i ? '▾' : '▸'}</Text>
              </TouchableOpacity>
              {openIdx === i && (
                <View style={s.dayBody}>
                  {day.exercises.map((ex, j) => (
                    <TouchableOpacity
                      key={j}
                      style={s.exerciseCard}
                      onPress={() =>
                        navigation.navigate('ExerciseDetail', {name: ex.name})
                      }>
                      <View style={{flex: 1}}>
                        <Text style={s.exerciseName}>{ex.name}</Text>
                        <Text style={s.exerciseMuscles}>{ex.muscles.join(' • ')}</Text>
                        <Text style={s.exerciseTip}>💡 {ex.tips}</Text>
                      </View>
                      <View style={s.exerciseRight}>
                        <Text style={s.exerciseSets}>
                          {ex.sets} × {ex.reps}
                        </Text>
                        <Text style={s.exerciseRest}>⏱ {ex.rest}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={s.completeBtn} onPress={markComplete}>
                    <Text style={s.completeBtnText}>✓ Mark complete</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}

        {tab === 'library' && (
          <View style={s.libraryGrid}>
            {EXERCISE_LIBRARY.map(ex => (
              <TouchableOpacity
                key={ex.name}
                style={s.libraryCard}
                onPress={() => navigation.navigate('ExerciseDetail', {name: ex.name})}>
                <Text style={s.libraryEmoji}>{ex.emoji}</Text>
                <Text style={s.libraryName}>{ex.name}</Text>
                <Text style={s.libraryMuscles}>{ex.muscles.slice(0, 2).join(', ')}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
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
  dayCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    marginTop: 12,
    overflow: 'hidden',
  },
  dayHeader: {flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12},
  dayBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#6366f1',
  },
  dayBadgeText: {fontSize: 10, fontWeight: '700', color: '#f8fafc'},
  dayTitle: {fontSize: 16, fontWeight: 'bold', color: '#f8fafc'},
  dayFocus: {fontSize: 12, color: '#94a3b8'},
  chevron: {fontSize: 18, color: '#94a3b8'},
  dayBody: {borderTopWidth: 1, borderTopColor: '#0f172a', padding: 12, gap: 8},
  exerciseCard: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0f172a',
    backgroundColor: '#0f172a',
    padding: 12,
    gap: 8,
  },
  exerciseName: {fontSize: 14, fontWeight: '600', color: '#f8fafc'},
  exerciseMuscles: {fontSize: 11, color: '#94a3b8', marginTop: 2},
  exerciseTip: {fontSize: 11, color: '#94a3b8', marginTop: 4},
  exerciseRight: {alignItems: 'flex-end', justifyContent: 'center'},
  exerciseSets: {fontSize: 14, fontWeight: 'bold', color: '#6366f1'},
  exerciseRest: {fontSize: 11, color: '#94a3b8', marginTop: 2},
  completeBtn: {
    marginTop: 8,
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  completeBtnText: {fontSize: 14, fontWeight: '700', color: '#f8fafc'},
  libraryGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16},
  libraryCard: {
    width: '47%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    padding: 12,
  },
  libraryEmoji: {fontSize: 28},
  libraryName: {fontSize: 13, fontWeight: '600', color: '#f8fafc', marginTop: 8},
  libraryMuscles: {fontSize: 11, color: '#94a3b8', marginTop: 4},
});
