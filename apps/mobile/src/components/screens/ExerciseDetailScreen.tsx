import React from 'react';
import {View, Text, ScrollView, StyleSheet, Platform, StatusBar} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../navigation/RootNavigator';
import {EXERCISE_LIBRARY} from '@fitmentor/shared';

type Props = NativeStackScreenProps<RootStackParamList, 'ExerciseDetail'>;

export default function ExerciseDetailScreen({route, navigation}: Props) {
  const {name} = route.params;
  const ex = EXERCISE_LIBRARY.find(e => e.name === name);

  if (!ex) {
    return (
      <View style={s.container}>
        <Text style={s.notFound}>Exercise not found.</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.back} onPress={() => navigation.goBack()}>
          ← Library
        </Text>

        <View style={s.hero}>
          <Text style={s.heroEmoji}>{ex.emoji}</Text>
          <Text style={s.heroName}>{ex.name}</Text>
          <Text style={s.heroMuscles}>{ex.muscles.join(' • ')}</Text>
        </View>

        <Section title="✅ How to do it">{ex.tips}</Section>
        <Section title="⚠️ Common mistake">{ex.mistakes}</Section>
        <Section title="🎯 Muscles worked">{ex.muscles.join(', ')}</Section>
      </ScrollView>
    </View>
  );
}

function Section({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <Text style={s.sectionBody}>{children}</Text>
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
  back: {fontSize: 14, color: '#94a3b8'},
  notFound: {color: '#94a3b8', textAlign: 'center', marginTop: 60},
  hero: {
    marginTop: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    padding: 32,
    alignItems: 'center',
  },
  heroEmoji: {fontSize: 56},
  heroName: {fontSize: 24, fontWeight: 'bold', color: '#f8fafc', marginTop: 12},
  heroMuscles: {fontSize: 13, color: '#94a3b8', marginTop: 4},
  section: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    padding: 16,
  },
  sectionTitle: {fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1},
  sectionBody: {fontSize: 14, color: '#f8fafc', marginTop: 8, lineHeight: 20},
});
