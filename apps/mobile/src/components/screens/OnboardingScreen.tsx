import React, {useState} from 'react';
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
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../navigation/RootNavigator';
import {saveProfile} from '../../utils/profile';
import type {Profile, Goal, Place, Experience, Diet, Gender} from '@fitmentor/shared';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;
type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const HEALTH_OPTIONS = [
  {v: 'none', l: "None (I'm healthy)", e: '✅'},
  {v: 'diabetes', l: 'Diabetes', e: '🩸'},
  {v: 'heart_disease', l: 'Heart Disease', e: '❤️'},
  {v: 'bp', l: 'High / Low BP', e: '🩺'},
  {v: 'thyroid', l: 'Thyroid', e: '🔬'},
  {v: 'asthma', l: 'Asthma', e: '🫁'},
  {v: 'joint', l: 'Joint / Back Pain', e: '🦴'},
  {v: 'other', l: 'Other', e: '📋'},
];

export default function OnboardingScreen({navigation}: Props) {
  const [step, setStep] = useState<Step>(0);
  const [draft, setDraft] = useState<Partial<Profile>>({
    daysPerWeek: 4,
    budgetPerDay: 150,
    diet: 'veg',
    place: 'gym',
    experience: 'beginner',
    gender: 'male',
    goal: 'muscle_gain',
    healthConditions: [],
  });

  const next = () => setStep((s) => Math.min(8, s + 1) as Step);
  const back = () => setStep((s) => Math.max(0, s - 1) as Step);

  const toggleHealth = (v: string) => {
    const current = draft.healthConditions ?? [];
    if (v === 'none') {
      setDraft({...draft, healthConditions: current.includes('none') ? [] : ['none']});
      return;
    }
    const filtered = current.filter(c => c !== 'none');
    if (filtered.includes(v)) {
      setDraft({...draft, healthConditions: filtered.filter(c => c !== v)});
    } else {
      setDraft({...draft, healthConditions: [...filtered, v]});
    }
  };

  const finish = async () => {
    const p: Profile = {
      name: draft.name ?? 'Friend',
      age: Number(draft.age ?? 22),
      gender: (draft.gender as Gender) ?? 'male',
      heightCm: Number(draft.heightCm ?? 170),
      weightKg: Number(draft.weightKg ?? 65),
      goal: (draft.goal as Goal) ?? 'muscle_gain',
      place: (draft.place as Place) ?? 'gym',
      experience: (draft.experience as Experience) ?? 'beginner',
      diet: (draft.diet as Diet) ?? 'veg',
      daysPerWeek: Number(draft.daysPerWeek ?? 4),
      budgetPerDay: Number(draft.budgetPerDay ?? 150),
      healthConditions: draft.healthConditions ?? [],
      createdAt: new Date().toISOString(),
    };
    await saveProfile(p);
    navigation.replace('Main');
  };

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" />
      {step > 0 && (
        <View style={s.progressBar}>
          {Array.from({length: 9}).map((_, i) => (
            <View
              key={i}
              style={[s.progressDot, i <= step && s.progressDotActive]}
            />
          ))}
        </View>
      )}

      <ScrollView style={s.content} contentContainerStyle={s.contentInner}>
        {step === 0 && <Welcome onNext={next} />}
        {step === 1 && (
          <Field title="What should we call you?" sub="Just a first name works.">
            <TextInput
              placeholder="Your name"
              placeholderTextColor="#64748b"
              value={draft.name ?? ''}
              onChangeText={v => setDraft({...draft, name: v})}
              style={s.input}
              autoFocus
            />
          </Field>
        )}
        {step === 2 && (
          <Field title="Tell us about you" sub="We'll calculate your needs.">
            <View style={s.grid}>
              <NumInput
                label="Age"
                value={draft.age}
                onChange={v => setDraft({...draft, age: v})}
                suffix="yrs"
              />
              <View style={s.gridCol}>
                <Text style={s.fieldLabel}>Gender</Text>
                <View style={s.chipRow}>
                  {(['male', 'female', 'other'] as Gender[]).map(g => (
                    <TouchableOpacity
                      key={g}
                      style={[s.chip, draft.gender === g && s.chipActive]}
                      onPress={() => setDraft({...draft, gender: g})}>
                      <Text style={[s.chipText, draft.gender === g && s.chipTextActive]}>
                        {g.charAt(0).toUpperCase() + g.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <NumInput
                label="Height"
                value={draft.heightCm}
                onChange={v => setDraft({...draft, heightCm: v})}
                suffix="cm"
              />
              <NumInput
                label="Weight"
                value={draft.weightKg}
                onChange={v => setDraft({...draft, weightKg: v})}
                suffix="kg"
              />
            </View>
          </Field>
        )}
        {step === 3 && (
          <Field title="What's your goal?" sub="Pick the one that matters most.">
            <Choices
              value={draft.goal}
              onChange={v => setDraft({...draft, goal: v as Goal})}
              options={[
                {v: 'muscle_gain', l: 'Build Muscle', e: '💪'},
                {v: 'fat_loss', l: 'Lose Fat', e: '🔥'},
                {v: 'strength', l: 'Get Stronger', e: '🏋️'},
                {v: 'recomp', l: 'Body Recomp', e: '⚖️'},
                {v: 'general', l: 'Stay Fit', e: '✨'},
              ]}
            />
          </Field>
        )}
        {step === 4 && (
          <Field title="Where will you train?" sub="We'll generate the right plan.">
            <Choices
              value={draft.place}
              onChange={v => setDraft({...draft, place: v as Place})}
              options={[
                {v: 'gym', l: 'Gym', e: '🏟️'},
                {v: 'home', l: 'Home (no equipment)', e: '🏠'},
              ]}
            />
          </Field>
        )}
        {step === 5 && (
          <Field title="How experienced are you?" sub="Be honest — we adjust everything.">
            <Choices
              value={draft.experience}
              onChange={v => setDraft({...draft, experience: v as Experience})}
              options={[
                {v: 'beginner', l: 'Beginner (< 6 months)', e: '🌱'},
                {v: 'intermediate', l: 'Intermediate (6m – 2y)', e: '🔥'},
                {v: 'advanced', l: 'Advanced (2y+)', e: '🚀'},
              ]}
            />
          </Field>
        )}
        {step === 6 && (
          <Field title="How many days per week?" sub={`${draft.daysPerWeek} days/week`}>
            <View style={s.sliderContainer}>
              {[2, 3, 4, 5, 6].map(d => (
                <TouchableOpacity
                  key={d}
                  style={[s.sliderDot, draft.daysPerWeek === d && s.sliderDotActive]}
                  onPress={() => setDraft({...draft, daysPerWeek: d})}>
                  <Text
                    style={[
                      s.sliderDotText,
                      draft.daysPerWeek === d && s.sliderDotTextActive,
                    ]}>
                    {d}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>
        )}
        {step === 7 && (
          <Field title="Any health conditions?" sub="Select all that apply.">
            {HEALTH_OPTIONS.map(o => {
              const selected = draft.healthConditions?.includes(o.v) ?? false;
              return (
                <TouchableOpacity
                  key={o.v}
                  style={[s.healthRow, selected && s.healthRowActive]}
                  onPress={() => toggleHealth(o.v)}>
                  <Text style={s.healthEmoji}>{o.e}</Text>
                  <Text style={s.healthLabel}>{o.l}</Text>
                  {selected && <Text style={s.healthCheck}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </Field>
        )}
        {step === 8 && (
          <Field title="Food & budget" sub="We'll suggest meals you can afford.">
            <Choices
              value={draft.diet}
              onChange={v => setDraft({...draft, diet: v as Diet})}
              options={[
                {v: 'veg', l: 'Vegetarian', e: '🥗'},
                {v: 'nonveg', l: 'Non-vegetarian', e: '🍗'},
                {v: 'egg', l: 'Eggetarian', e: '🥚'},
              ]}
            />
            <View style={s.budgetSection}>
              <Text style={s.budgetLabel}>Food budget: ₹{draft.budgetPerDay}/day</Text>
              <View style={s.sliderContainer}>
                {[80, 150, 200, 300, 400].map(b => (
                  <TouchableOpacity
                    key={b}
                    style={[
                      s.sliderDot,
                      draft.budgetPerDay === b && s.sliderDotActive,
                    ]}
                    onPress={() => setDraft({...draft, budgetPerDay: b})}>
                    <Text
                      style={[
                        s.sliderDotText,
                        draft.budgetPerDay === b && s.sliderDotTextActive,
                      ]}>
                      {b}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </Field>
        )}
      </ScrollView>

      {step > 0 && (
        <View style={s.bottomBar}>
          {step > 0 && (
            <TouchableOpacity style={s.backBtn} onPress={back}>
              <Text style={s.backBtnText}>← Back</Text>
            </TouchableOpacity>
          )}
          {step < 8 ? (
            <TouchableOpacity style={s.primaryBtn} onPress={next}>
              <Text style={s.primaryBtnText}>Continue</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={s.primaryBtn} onPress={finish}>
              <Text style={s.primaryBtnText}>Start my journey</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

function Welcome({onNext}: {onNext: () => void}) {
  return (
    <View style={s.welcomeContainer}>
      <View style={s.logoCircle}>
        <Text style={s.logoText}>🏋️</Text>
      </View>
      <Text style={s.welcomeTitle}>
        Welcome to{'\n'}FitMentor AI
      </Text>
      <Text style={s.welcomeSub}>
        Your pocket fitness coach. Personalized workouts, Indian meal plans, and a smart AI trainer
        — all for free.
      </Text>
      <TouchableOpacity style={s.primaryBtn} onPress={onNext}>
        <Text style={s.primaryBtnText}>Let's go</Text>
      </TouchableOpacity>
      <Text style={s.welcomeHint}>Takes less than 60 seconds</Text>
    </View>
  );
}

function Field({title, sub, children}: {title: string; sub?: string; children: React.ReactNode}) {
  return (
    <View>
      <Text style={s.fieldTitle}>{title}</Text>
      {sub && <Text style={s.fieldSub}>{sub}</Text>}
      <View style={s.fieldChildren}>{children}</View>
    </View>
  );
}

function NumInput({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: unknown;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <View style={s.numInput}>
      <Text style={s.numInputLabel}>{label}</Text>
      <View style={s.numInputRow}>
        <TextInput
          keyboardType="numeric"
          value={(value as string) ?? ''}
          onChangeText={v => onChange(Number(v))}
          style={s.numInputValue}
          placeholder="0"
          placeholderTextColor="#64748b"
        />
        {suffix && <Text style={s.numInputSuffix}>{suffix}</Text>}
      </View>
    </View>
  );
}

function Choices<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T | undefined;
  onChange: (v: T) => void;
  options: {v: T; l: string; e: string}[];
}) {
  return (
    <View>
      {options.map(o => (
        <TouchableOpacity
          key={o.v}
          style={[s.choiceRow, value === o.v && s.choiceRowActive]}
          onPress={() => onChange(o.v)}>
          <Text style={s.choiceEmoji}>{o.e}</Text>
          <Text style={s.choiceLabel}>{o.l}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingTop: Platform.OS === 'ios' ? 44 : StatusBar.currentHeight ?? 0,
  },
  progressBar: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 4,
    marginTop: 8,
  },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1e293b',
  },
  progressDotActive: {
    backgroundColor: '#6366f1',
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 24,
    paddingBottom: 120,
  },
  // Welcome
  welcomeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 48,
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#f8fafc',
    textAlign: 'center',
    marginTop: 32,
    lineHeight: 40,
  },
  welcomeSub: {
    fontSize: 15,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  welcomeHint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 16,
  },
  // Field
  fieldTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  fieldSub: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  fieldChildren: {
    marginTop: 24,
  },
  // Input
  input: {
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    paddingHorizontal: 16,
    fontSize: 18,
    color: '#f8fafc',
  },
  // Grid
  grid: {
    gap: 12,
  },
  gridCol: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 12,
    color: '#94a3b8',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
  },
  chipActive: {
    borderColor: '#6366f1',
    backgroundColor: 'rgba(99,102,241,0.15)',
  },
  chipText: {
    color: '#94a3b8',
    fontWeight: '600',
    fontSize: 14,
  },
  chipTextActive: {
    color: '#6366f1',
  },
  // NumInput
  numInput: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    padding: 12,
  },
  numInputLabel: {
    fontSize: 12,
    color: '#94a3b8',
  },
  numInputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
    gap: 4,
  },
  numInputValue: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f8fafc',
  },
  numInputSuffix: {
    fontSize: 12,
    color: '#94a3b8',
    paddingBottom: 4,
  },
  // Choices
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    padding: 16,
    marginBottom: 12,
  },
  choiceRowActive: {
    borderColor: '#6366f1',
    backgroundColor: 'rgba(99,102,241,0.15)',
  },
  choiceEmoji: {
    fontSize: 24,
  },
  choiceLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
  },
  // Health
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    padding: 16,
    marginBottom: 8,
  },
  healthRowActive: {
    borderColor: '#6366f1',
    backgroundColor: 'rgba(99,102,241,0.15)',
  },
  healthEmoji: {
    fontSize: 24,
  },
  healthLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#f8fafc',
  },
  healthCheck: {
    color: '#6366f1',
    fontSize: 18,
    fontWeight: 'bold',
  },
  // Slider
  sliderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  sliderDot: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sliderDotActive: {
    borderColor: '#6366f1',
    backgroundColor: '#6366f1',
  },
  sliderDotText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94a3b8',
  },
  sliderDotTextActive: {
    color: '#f8fafc',
  },
  // Budget
  budgetSection: {
    marginTop: 24,
  },
  budgetLabel: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 8,
  },
  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    flexDirection: 'row',
    gap: 12,
  },
  backBtn: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  backBtnText: {
    color: '#94a3b8',
    fontWeight: '600',
  },
  primaryBtn: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#6366f1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
