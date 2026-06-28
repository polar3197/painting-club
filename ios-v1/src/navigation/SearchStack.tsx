import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SearchTabs from '../screens/SearchTabs';
import UserProfile from '../screens/UserProfile';
import type { SearchStackParamList } from './types';

const Stack = createNativeStackNavigator<SearchStackParamList>();

export default function SearchStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SearchTabs" component={SearchTabs} />
      <Stack.Screen name="UserProfile" component={UserProfile} />
    </Stack.Navigator>
  );
}
