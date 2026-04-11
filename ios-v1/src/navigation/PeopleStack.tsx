import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import People from '../screens/People';
import UserProfile from '../screens/UserProfile';
import type { PeopleStackParamList } from './types';

const Stack = createNativeStackNavigator<PeopleStackParamList>();

export default function PeopleStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="PeopleList" component={People} />
      <Stack.Screen name="UserProfile" component={UserProfile} />
    </Stack.Navigator>
  );
}
