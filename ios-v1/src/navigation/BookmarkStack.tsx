import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Bookmarks from '../screens/Bookmarks';
import UserProfile from '../screens/UserProfile';
import type { BookmarkStackParamList } from './types';

const Stack = createNativeStackNavigator<BookmarkStackParamList>();

export default function BookmarkStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Bookmarks" component={Bookmarks} />
      <Stack.Screen name="UserProfile" component={UserProfile} />
    </Stack.Navigator>
  );
}
