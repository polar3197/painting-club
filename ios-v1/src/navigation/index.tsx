import React from 'react';
import { View, Text, Image, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useNavPref } from '../context/NavPrefContext';

const tabIcons = {
  me: require('../../assets/imgs/me.png'),
  people: require('../../assets/imgs/profiles.png'),
  art: require('../../assets/imgs/art.png'),
  bookmark: require('../../assets/imgs/bookmark.png'),
};

import LandingPage from '../screens/LandingPage';
import ApplicationFlow from '../screens/ApplicationFlow';
import WebScreen from '../screens/WebScreen';
import SetupAccount from '../screens/SetupAccount';
import NotMember from '../screens/NotMember';
import UserProfile from '../screens/UserProfile';
import Admin from '../screens/Admin';
import Ethos from '../screens/Ethos';
import Portfolio from '../screens/Portfolio';
import SearchStack from './SearchStack';
import BookmarkStack from './BookmarkStack';
import HomeStack from './HomeStack';
import SwipeStack from './SwipeStack';
import SwipeBStack from './SwipeBStack';
import AddArt from '../screens/AddArt';
import Settings from '../screens/Settings';
import NotificationSettings from '../screens/NotificationSettings';
import SignupQrCodes from '../screens/SignupQrCodes';
import AccountManagement from '../screens/AccountManagement';
import UserStats from '../screens/UserStats';
import InfraStats from '../screens/InfraStats';
import UserRoles from '../screens/UserRoles';
import UserRoleDetail from '../screens/UserRoleDetail';
import Contributor from '../screens/Contributor';
import EditProfile from '../screens/EditProfile';
import Messages from '../screens/Messages';
import ConversationThread from '../screens/ConversationThread';
import { BackendGate } from '../components/BackendDownNotice';

import { Colors, Fonts, FontSizes } from '../constants/theme';
import type { MainTabParamList } from './types';

// Hand-drawn plus so we control line weight (Ionicons' stroke is baked into the
// font and can't be thinned). A simple thin black plus, no circle. Outer box is
// the standard icon `size` so it aligns with the other tab icons + labels.
function AddIcon({ size }: { size: number }) {
  const stroke = 1;
  const arm = Math.round(size * 0.8);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: arm, height: stroke, backgroundColor: '#000' }} />
      <View style={{ position: 'absolute', width: stroke, height: arm, backgroundColor: '#000' }} />
    </View>
  );
}

function HomeIcon({ focused, size }: { focused: boolean; size: number }) {
  return (
    <View style={{
      width: size + 4,
      height: size + 4,
      borderRadius: (size + 4) / 2,
      backgroundColor: Colors.accentGolden,
      borderWidth: 2,
      // Border stays blue whether the tab is selected or not — no muted
      // "inactive" treatment for the PC mark.
      borderColor: 'blue',
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <Text style={{
        fontFamily: Fonts.serif,
        fontSize: size * 0.45,
        fontWeight: '700',
        color: Colors.black,
      }}>PC</Text>
    </View>
  );
}

const Tab = createBottomTabNavigator<MainTabParamList>();
const RootStack = createNativeStackNavigator();

function MeScreen() {
  const { currentUser } = useAuth();
  if (!currentUser) return <NotMember />;
  return <UserProfile />;
}

// Each tab shows the "Pi is down" notice instead of a blank/broken screen when
// the backend is unreachable. Defined at module scope (not inline in the
// navigator) so the wrapped components keep a stable identity across renders.
const HomeStackGated = () => (
  <BackendGate>
    <HomeStack />
  </BackendGate>
);
const SearchStackGated = () => (
  <BackendGate>
    <SearchStack />
  </BackendGate>
);
const AddArtGated = () => (
  <BackendGate>
    <AddArt />
  </BackendGate>
);
const BookmarkStackGated = () => (
  <BackendGate>
    <BookmarkStack />
  </BackendGate>
);
const MeScreenGated = () => (
  <BackendGate>
    <MeScreen />
  </BackendGate>
);
const SwipeStackGated = () => (
  <BackendGate>
    <SwipeStack />
  </BackendGate>
);
const SwipeBStackGated = () => (
  <BackendGate>
    <SwipeBStack />
  </BackendGate>
);

// The Home tab picks its content from the nav-model preference: the shipped
// HomeStack by default, or a swipe prototype when a contributor has toggled one
// on (NavPrefContext). Keeping this switch at the Home-tab level (not the root)
// means the bottom tab bar stays put in every mode. Until the persisted value
// is read we render the normal HomeStack so there's no flash for members.
function HomeTabHost() {
  const { navModel, ready } = useNavPref();
  if (ready && navModel === 'swipeA') return <SwipeStackGated />;
  return <HomeStackGated />;
}

// swipe B (the 4-directional hub) is the default for everyone — chosen at the
// root, bypassing MainTabs' bottom bar. navModel's initial value is already
// 'swipeB', so this renders the hub on the first frame with no tab-bar flash;
// MainTabs only appears for a device that has a stored 'tabs'/'swipeA' pref.
function MainShell() {
  const { navModel } = useNavPref();
  if (navModel === 'swipeB') return <SwipeBStackGated />;
  return <MainTabs />;
}


function MainTabs() {

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size, focused }) => {
          if (route.name === 'Home') {
            return <HomeIcon focused={focused} size={size} />;
          }
          if (route.name === 'Me') {
            return <Image source={tabIcons.me} style={{ width: size, height: size }} />;
          }
          if (route.name === 'SearchTab') {
            // Consolidated art + people search keeps the art mark in the bar.
            return <Image source={tabIcons.art} style={{ width: size, height: size }} />;
          }
          if (route.name === 'AddTab') {
            return <AddIcon size={size} />;
          }
          if (route.name === 'Bookmark') {
            return <Image source={tabIcons.bookmark} style={{ width: size, height: size }} />;
          }
          return <Ionicons name="home-outline" size={size} color={color} />;
        },
        tabBarActiveTintColor: Colors.darkerGold,
        // Inactive labels share the active color so unselected tabs read at
        // full presence — no "muted/disabled" treatment for unselected.
        tabBarInactiveTintColor: Colors.darkerGold,
        tabBarStyle: {
          backgroundColor: Colors.secondary,
          // Bottom border removed per design — the tab bar now blends into the
          // page above it (the swipe hub draws its own directional frame).
          borderTopWidth: 0,
          height: 90,
          paddingTop: 8,
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeTabHost}
        options={{
          // Render an empty (space) label so this tab reserves the same label
          // height as the others — that keeps the PC icon on the same line as
          // the labeled tab icons instead of centering lower.
          tabBarLabel: ' ',
        }}
      />
      <Tab.Screen name="SearchTab" component={SearchStackGated} options={{ tabBarLabel: 'everything' }} />
      <Tab.Screen
        name="AddTab"
        component={AddArtGated}
        options={{ tabBarLabel: 'share' }}
      />
      <Tab.Screen
        name="Bookmark"
        component={BookmarkStackGated}
        options={{ tabBarLabel: 'saved' }}
      />
      <Tab.Screen
        name="Me"
        component={MeScreenGated}
        options={{ tabBarLabel: 'me' }}
      />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const { isLoading, currentUser } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.darkerGold} />
      </View>
    );
  }

  return (
    <RootStack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={currentUser ? 'Main' : 'LandingPage'}
    >
      <RootStack.Screen name="Main" component={MainShell} />
      <RootStack.Screen name="LandingPage" component={LandingPage} />
      {/* The application. Full-screen rather than a dialog: it is the first
          thing anyone sees of the club and has nothing to share a surface
          with. Opened from the landing page and from a scanned club QR. */}
      <RootStack.Screen
        name="ApplicationFlow"
        component={ApplicationFlow}
        options={{ animation: 'slide_from_bottom' }}
      />
      <RootStack.Screen
        name="SetupAccount"
        component={SetupAccount}
        // Plain card (not transparentModal): resetting the stack away from a
        // transparentModal leaves an invisible touch-blocking layer on iOS,
        // which made the app unresponsive after setup. SetupAccount paints its
        // own dim backdrop, so it still reads as an overlay.
        options={{ animation: 'fade' }}
      />
      <RootStack.Screen name="Ethos" component={Ethos} />
      <RootStack.Screen name="Web" component={WebScreen} />
      <RootStack.Screen name="Settings" component={Settings} />
      <RootStack.Screen name="NotificationSettings" component={NotificationSettings} />
      <RootStack.Screen name="SignupQrCodes" component={SignupQrCodes} />
      <RootStack.Screen name="AccountManagement" component={AccountManagement} />
      <RootStack.Screen name="UserStats" component={UserStats} />
      <RootStack.Screen name="InfraStats" component={InfraStats} />
      <RootStack.Screen name="UserRoles" component={UserRoles} />
      <RootStack.Screen name="UserRoleDetail" component={UserRoleDetail} />
      <RootStack.Screen name="Contributor" component={Contributor} />
      <RootStack.Screen name="EditProfile" component={EditProfile} />
      <RootStack.Screen name="Messages" component={Messages} />
      <RootStack.Screen name="ConversationThread" component={ConversationThread} />
      <RootStack.Group screenOptions={{ presentation: 'modal' }}>
        <RootStack.Screen name="Portfolio" component={Portfolio} />
        <RootStack.Screen name="Admin" component={Admin} />
      </RootStack.Group>
    </RootStack.Navigator>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.mainBg,
  },
});
