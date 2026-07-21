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
import type {Profile} from '@fitmentor/shared';
import {GOAL_LABEL} from '@fitmentor/shared';
import {loadProfile} from '../../utils/profile';
import {calcTargets} from '../../utils/profileCalc';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList>;
};

export default function ProfileScreen({navigation}: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    loadProfile().then(setProfile);
  }, []);

  if (!profile) {
    return (
      <View style={s.container}>
        <TouchableOpacity
          style={s.editBtn}
          onPress={() => navigation.navigate('Onboarding')}>
          <Text style={s.editBtnText}>Set up profile</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const t = calcTargets(profile);

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Avatar & name */}
        <View style={s.profileHeader}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{profile.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{flex: 1}}>
            <Text style={s.name}>{profile.name}</Text>
            <Text style={s.meta}>
              {GOAL_LABEL[profile.goal]} • {profile.experience}
            </Text>
          </View>
        </View>

        {/* Subscription */}
        <View style={s.subCard}>
          <Text style={s.subIcon}>👑</Text>
          <View style={{flex: 1}}>
            <Text style={s.subTitle}>Go Premium</Text>
            <Text style={s.subDesc}>
              Unlock unlimited AI coach, advanced meal plans, and form analyzer.
            </Text>
          </View>
        </View>

        {/* Targets */}
        <View style={s.sectionCard}>
          <Text style={s.sectionLabel}>Your targets</Text>
          <View style={s.targetsGrid}>
            <TargetItem label="Calories" value={`${t.calories} kcal`} />
            <TargetItem label="Protein" value={`${t.protein} g`} />
            <TargetItem label="Carbs" value={`${t.carbs} g`} />
            <TargetItem label="Fat" value={`${t.fat} g`} />
          </View>
        </View>

        {/* Stats */}
        <View style={s.sectionCard}>
          <Text style={s.sectionLabel}>Stats</Text>
          <View style={s.targetsGrid}>
            <TargetItem label="Age" value={`${profile.age} yrs`} />
            <TargetItem label="Height" value={`${profile.heightCm} cm`} />
            <TargetItem label="Weight" value={`${profile.weightKg} kg`} />
            <TargetItem label="Train" value={`${profile.daysPerWeek}x ${profile.place}`} />
            <TargetItem label="Diet" value={profile.diet} />
            <TargetItem label="Budget" value={`₹${profile.budgetPerDay}/day`} />
          </View>
        </View>

        {/* Edit */}
        <TouchableOpacity
          style={s.editBtn}
          onPress={() => navigation.navigate('Onboarding')}>
          <Text style={s.editBtnText}>✨ Edit profile</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function TargetItem({label, value}: {label: string; value: string}) {
  return (
    <View style={s.targetItem}>
      <Text style={s.targetLabel}>{label}</Text>
      <Text style={s.targetValue}>{value}</Text>
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
  profileHeader: {flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8},
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {fontSize: 28, fontWeight: 'bold', color: '#f8fafc'},
  name: {fontSize: 24, fontWeight: 'bold', color: '#f8fafc'},
  meta: {fontSize: 13, color: '#94a3b8', marginTop: 2},
  subCard: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(234,179,8,0.3)',
    backgroundColor: 'rgba(234,179,8,0.08)',
    padding: 16,
    marginTop: 24,
    gap: 12,
    alignItems: 'flex-start',
  },
  subIcon: {fontSize: 20},
  subTitle: {fontSize: 16, fontWeight: 'bold', color: '#f8fafc'},
  subDesc: {fontSize: 12, color: '#94a3b8', marginTop: 4, lineHeight: 16},
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    padding: 16,
    marginTop: 16,
  },
  sectionLabel: {
    fontSize: 10,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  targetsGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12},
  targetItem: {
    width: '47%',
    borderRadius: 12,
    backgroundColor: '#0f172a',
    padding: 12,
  },
  targetLabel: {fontSize: 11, color: '#64748b'},
  targetValue: {fontSize: 14, fontWeight: '600', color: '#f8fafc', marginTop: 2},
  editBtn: {
    marginTop: 24,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  editBtnText: {fontSize: 14, fontWeight: '700', color: '#f8fafc'},
});
