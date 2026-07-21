import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import type {MainTabParamList} from './RootNavigator';
import HomeScreen from '../screens/HomeScreen';
import WorkoutsScreen from '../screens/WorkoutsScreen';
import ToolsScreen from '../screens/ToolsScreen';
import CoachScreen from '../screens/CoachScreen';
import NutritionScreen from '../screens/NutritionScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator<MainTabParamList>();

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#6366f1',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {backgroundColor: '#0f172a', borderTopColor: '#1e293b'},
        tabBarLabelStyle: {fontSize: 11, fontWeight: '600'},
      }}>
      <Tab.Screen name="Home" component={HomeScreen} options={{tabBarLabel: 'Home'}} />
      <Tab.Screen name="Train" component={WorkoutsScreen} options={{tabBarLabel: 'Train'}} />
      <Tab.Screen name="Tools" component={ToolsScreen} options={{tabBarLabel: 'Tools'}} />
      <Tab.Screen name="Coach" component={CoachScreen} options={{tabBarLabel: 'Coach'}} />
      <Tab.Screen name="Food" component={NutritionScreen} options={{tabBarLabel: 'Food'}} />
      <Tab.Screen name="You" component={ProfileScreen} options={{tabBarLabel: 'You'}} />
    </Tab.Navigator>
  );
}
