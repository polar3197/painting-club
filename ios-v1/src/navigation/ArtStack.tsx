import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ArtGallery from '../screens/ArtGallery';
import UserProfile from '../screens/UserProfile';
import type { ArtStackParamList } from './types';

const Stack = createNativeStackNavigator<ArtStackParamList>();

export default function ArtStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ArtGallery" component={ArtGallery} />
      <Stack.Screen name="UserProfile" component={UserProfile} />
    </Stack.Navigator>
  );
}
