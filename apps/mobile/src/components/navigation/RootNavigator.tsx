import React, {useEffect, useState} from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import OnboardingScreen from '../screens/OnboardingScreen';
import ExerciseDetailScreen from '../screens/ExerciseDetailScreen';
import MainTabs from './MainTabs';
import {loadProfile} from '../../utils/profile';

export type RootStackParamList = {
  Onboarding: undefined;
  Main: undefined;
  ExerciseDetail: {name: string};
};

export type MainTabParamList = {
  Home: undefined;
  Train: undefined;
  Tools: undefined;
  Coach: undefined;
  Food: undefined;
  You: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);

  useEffect(() => {
    loadProfile().then(p => {
      setHasProfile(!!p);
      setLoading(false);
    });
  }, []);

  if (loading) return null;

  return (
    <Stack.Navigator screenOptions={{headerShown: false}}>
      {!hasProfile ? (
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen
            name="ExerciseDetail"
            component={ExerciseDetailScreen}
            options={{animation: 'slide_from_right'}}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
