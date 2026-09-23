import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SwipeMain from '../screens/SwipeMain';
import WeeklyPromptDetail from '../screens/WeeklyPromptDetail';
import About from '../screens/About';
import AboutSection from '../screens/AboutSection';
import AboutPost from '../screens/AboutPost';
import AboutDoc from '../screens/AboutDoc';
import ComingSoon from '../screens/ComingSoon';
import RequestFeature from '../screens/RequestFeature';
import AnnouncementsFeed from '../screens/AnnouncementsFeed';
import AnnouncementDetail from '../screens/AnnouncementDetail';
import Events from '../screens/Events';
import EventDetail from '../screens/EventDetail';
import EventEdit from '../screens/EventEdit';
import UserProfile from '../screens/UserProfile';

const Stack = createNativeStackNavigator();

// Outer host for the swipe prototypes (Model A/B). SwipeMain is the root (the
// pager); every "tap into detail" target the four pages push is registered
// here so those pushes cover the pager full-screen with a normal back-swipe —
// the same screen set HomeStack exposes, plus UserProfile for tapping other
// members. Keeping these on the outer stack (not inside the pager pages) is
// what avoids the pager-swipe vs stack-back-swipe conflict.
export default function SwipeStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        fullScreenGestureEnabled: true,
      }}
    >
      <Stack.Screen name="SwipeMain" component={SwipeMain} />
      <Stack.Screen name="About" component={About} />
      <Stack.Screen name="AboutSection" component={AboutSection} />
      <Stack.Screen name="AboutPost" component={AboutPost} />
      <Stack.Screen name="AboutDoc" component={AboutDoc} />
      <Stack.Screen name="ComingSoon" component={ComingSoon} />
      <Stack.Screen name="RequestFeature" component={RequestFeature} />
      <Stack.Screen name="AnnouncementsFeed" component={AnnouncementsFeed} />
      <Stack.Screen name="AnnouncementDetail" component={AnnouncementDetail} />
      <Stack.Screen name="Events" component={Events} />
      <Stack.Screen name="EventDetail" component={EventDetail} />
      <Stack.Screen name="EventEdit" component={EventEdit} />
      <Stack.Screen name="UserProfile" component={UserProfile} />
      <Stack.Screen
        name="WeeklyPromptDetail"
        component={WeeklyPromptDetail}
        // Match HomeStack: disable the full-screen back gesture so a horizontal
        // swipe on the salon wall scrolls it instead of popping. The edge swipe
        // still goes back.
        options={{ fullScreenGestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
