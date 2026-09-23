import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SwipeHub from '../screens/SwipeHub';
import AddArt from '../screens/AddArt';
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
import { ArtGridScreen } from '../screens/EverythingVariants';
import { PeopleScreen } from '../screens/People';
import PromptPanel from '../screens/PromptVariants';
import Bookmarks from '../screens/Bookmarks';

const Stack = createNativeStackNavigator();

// Model B host: the 4-directional SwipeHub is the root; every detail screen the
// hub's four panels push into is registered here (same set as HomeStack, plus
// UserProfile for tapping other members from the "everything" panel). Mounted
// inside the Home tab, so the bottom tab bar stays visible over it.
export default function SwipeBStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        // Edge-only back gesture (not the whole screen) so a small left-swipe
        // while scrolling/browsing doesn't accidentally pop back to the hub.
        fullScreenGestureEnabled: false,
      }}
    >
      <Stack.Screen name="SwipeHub" component={SwipeHub} />
      {/* "see everything" from the walls opens just the art grid. */}
      <Stack.Screen name="Everything" component={ArtGridScreen} />
      <Stack.Screen name="People" component={PeopleScreen} />
      <Stack.Screen name="Prompt" component={PromptPanel} />
      <Stack.Screen name="AddArt" component={AddArt} />
      {/* The profile's saved-pieces button. Registered here as well as in
          BookmarkStack: under navModel 'swipeB' the tab stacks never mount, so
          a navigate to a tab-only route is a silent no-op. */}
      <Stack.Screen name="Bookmarks" component={Bookmarks} />
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
      <Stack.Screen
        name="UserProfile"
        component={UserProfile}
        // Edge-only back gesture (not the full left half) so scrolling/swiping
        // through a profile doesn't accidentally pop back to the people page.
        options={{ fullScreenGestureEnabled: false }}
      />
      <Stack.Screen
        name="WeeklyPromptDetail"
        component={WeeklyPromptDetail}
        options={{ fullScreenGestureEnabled: false }}
      />
    </Stack.Navigator>
  );
}
