import React from 'react';
import { View, Text, Image, ActivityIndicator, StyleSheet, Pressable } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';

const tabIcons = {
  me: require('../../assets/imgs/me.png'),
  people: require('../../assets/imgs/profiles.png'),
  art: require('../../assets/imgs/art.png'),
};

import LandingPage from '../screens/LandingPage';
import SetupAccount from '../screens/SetupAccount';
import NotMember from '../screens/NotMember';
import UserProfile from '../screens/UserProfile';
import Admin from '../screens/Admin';
import Ethos from '../screens/Ethos';
import Portfolio from '../screens/Portfolio';
import SearchStack from './SearchStack';
import HomeStack from './HomeStack';
import AddArt from '../screens/AddArt';

import { Colors, Fonts, FontSizes } from '../constants/theme';
import ConfirmDialog from '../components/ConfirmDialog';
import DeleteAccountDialog from '../components/DeleteAccountDialog';
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

function MoreScreen() {
  const { logout, currentUser, currentRole } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.mainBg, paddingTop: insets.top + 20, paddingHorizontal: 30 }}>
      <ConfirmDialog
        visible={showLogoutConfirm}
        title="u sure?"
        confirmLabel="yes"
        cancelLabel="no. shit. stop"
        confirmColor={Colors.redLight}
        cancelColor={Colors.greenBright}
        confirmTextColor={Colors.black}
        cancelTextColor={Colors.black}
        onConfirm={async () => {
          setShowLogoutConfirm(false);
          await logout();
          navigation.navigate('LandingPage');
        }}
        onCancel={() => setShowLogoutConfirm(false)}
      />
      <DeleteAccountDialog
        visible={showDeleteDialog}
        username={currentUser ?? ''}
        onClose={() => setShowDeleteDialog(false)}
        onDeleted={async () => {
          setShowDeleteDialog(false);
          await logout();
          navigation.navigate('LandingPage');
        }}
      />
      <Text style={{ fontFamily: Fonts.serif, fontSize: FontSizes.xl, marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#000', paddingBottom: 10 }}>more</Text>

      {/* Delete account stays at the top-left — third-width, intentionally
          OUT of the thumb-friendly bottom zone so destructive action takes
          deliberate reach. */}
      {currentUser && currentRole !== 'admin' && (
        <Pressable
          style={{
            borderWidth: 1,
            borderColor: '#000',
            paddingHorizontal: 14,
            paddingVertical: 6,
            backgroundColor: Colors.redCoral,
            width: '33%',
            alignSelf: 'flex-start',
          }}
          onPress={() => setShowDeleteDialog(true)}
        >
          <Text style={{ fontFamily: Fonts.serif, fontSize: FontSizes.xs, color: Colors.black, textAlign: 'center' }}>
            delete acc
          </Text>
        </Pressable>
      )}

      {/* Spacer pushes the everyday action stack down to the thumb zone. */}
      <View style={{ flex: 1 }} />

      {currentRole === 'admin' && (
        <Pressable
          style={{ borderWidth: 1, borderColor: '#000', padding: 14, marginBottom: 10, backgroundColor: Colors.primaryGold }}
          onPress={() => navigation.navigate('Admin')}
        >
          <Text style={{ fontFamily: Fonts.serif, fontSize: FontSizes.base }}>admin</Text>
        </Pressable>
      )}

      <Pressable
        style={{ borderWidth: 1, borderColor: '#000', padding: 14, marginBottom: 10, backgroundColor: Colors.purpleDocs }}
        onPress={() => navigation.navigate('Ethos')}
      >
        <Text style={{ fontFamily: Fonts.serif, fontSize: FontSizes.base }}>ethos</Text>
      </Pressable>

      {currentUser ? (
        <Pressable
          // Cadmium yellow — saturated, slightly orange-leaning gold. Reads as
          // the primary thumb-zone action without competing with the
          // accentGolden tones used in the rest of the app.
          style={{ borderWidth: 1, borderColor: '#000', padding: 14, marginBottom: insets.bottom + 20, backgroundColor: 'rgb(255, 215, 0)' }}
          onPress={() => setShowLogoutConfirm(true)}
        >
          <Text style={{ fontFamily: Fonts.serif, fontSize: FontSizes.base, color: Colors.black }}>logout</Text>
        </Pressable>
      ) : (
        <Pressable
          style={{ borderWidth: 1, borderColor: '#000', padding: 14, marginBottom: insets.bottom + 20, backgroundColor: Colors.white }}
          onPress={() => navigation.navigate('LandingPage')}
        >
          <Text style={{ fontFamily: Fonts.serif, fontSize: FontSizes.base }}>login</Text>
        </Pressable>
      )}
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
          if (route.name === 'More') {
            return <Ionicons name={focused ? 'ellipsis-horizontal' : 'ellipsis-horizontal-outline'} size={size} color={color} />;
          }
          return <Ionicons name="home-outline" size={size} color={color} />;
        },
        tabBarActiveTintColor: Colors.darkerGold,
        // Inactive labels share the active color so unselected tabs read at
        // full presence — no "muted/disabled" treatment for unselected.
        tabBarInactiveTintColor: Colors.darkerGold,
        tabBarStyle: {
          backgroundColor: Colors.secondary,
          borderTopWidth: 1,
          borderTopColor: '#000',
          height: 90,
          paddingTop: 8,
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={{
          // Render an empty (space) label so this tab reserves the same label
          // height as the others — that keeps the PC icon on the same line as
          // the labeled tab icons instead of centering lower.
          tabBarLabel: ' ',
        }}
      />
      <Tab.Screen name="SearchTab" component={SearchStack} options={{ tabBarLabel: 'stuff' }} />
      <Tab.Screen
        name="AddTab"
        component={AddArt}
        // Empty (space) label keeps the plus aligned with the labeled tabs.
        options={{ tabBarLabel: ' ' }}
      />
      <Tab.Screen
        name="Me"
        component={MeScreen}
        options={{ tabBarLabel: 'me' }}
      />
      <Tab.Screen name="More" component={MoreScreen} options={{ tabBarLabel: 'more' }} />
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
      <RootStack.Screen name="Main" component={MainTabs} />
      <RootStack.Screen name="LandingPage" component={LandingPage} />
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
