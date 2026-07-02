import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Home from '../screens/Home';
import WeeklyPromptDetail from '../screens/WeeklyPromptDetail';
import About from '../screens/About';
import AboutSection from '../screens/AboutSection';
import AboutPost from '../screens/AboutPost';
import ComingSoon from '../screens/ComingSoon';
import RequestFeature from '../screens/RequestFeature';
import type { HomeStackParamList } from './types';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export default function HomeStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        // Swipe from anywhere on the left half of the screen to pop — not just
        // the hairline edge. Default gestureEnabled is true on iOS already.
        fullScreenGestureEnabled: true,
      }}
    >
      <Stack.Screen name="HomeFeed" component={Home} />
      <Stack.Screen name="About" component={About} />
      <Stack.Screen name="AboutSection" component={AboutSection} />
      <Stack.Screen name="AboutPost" component={AboutPost} />
      <Stack.Screen name="ComingSoon" component={ComingSoon} />
      <Stack.Screen name="RequestFeature" component={RequestFeature} />
      <Stack.Screen
        name="WeeklyPromptDetail"
        component={WeeklyPromptDetail}
        // Disable the full-screen (left-half) back gesture here so swiping
        // horizontally on the salon wall scrolls it instead of popping the
        // screen. The normal edge swipe still goes back.
        options={{ fullScreenGestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
