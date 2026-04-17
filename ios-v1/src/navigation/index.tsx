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
import Home from '../screens/Home';
import UserProfile from '../screens/UserProfile';
import Admin from '../screens/Admin';
import Ethos from '../screens/Ethos';
import Portfolio from '../screens/Portfolio';
import PeopleStack from './PeopleStack';
import ArtStack from './ArtStack';

import { Colors, Fonts, FontSizes } from '../constants/theme';
import ConfirmDialog from '../components/ConfirmDialog';
import type { MainTabParamList } from './types';

function HomeIcon({ focused, size }: { focused: boolean; size: number }) {
  return (
    <View style={{
      width: size + 4,
      height: size + 4,
      borderRadius: (size + 4) / 2,
      backgroundColor: Colors.accentGolden,
      borderWidth: 2,
      borderColor: focused ? 'blue' : Colors.textTertiary,
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

  return (
    <View style={{ flex: 1, backgroundColor: Colors.mainBg, paddingTop: insets.top + 20, paddingHorizontal: 30 }}>
      <ConfirmDialog
        visible={showLogoutConfirm}
        title="logout"
        message="are you sure you want to logout?"
        confirmLabel="logout"
        onConfirm={async () => {
          setShowLogoutConfirm(false);
          await logout();
          navigation.navigate('LandingPage');
        }}
        onCancel={() => setShowLogoutConfirm(false)}
      />
      <Text style={{ fontFamily: Fonts.serif, fontSize: FontSizes.xl, marginBottom: 30, borderBottomWidth: 1, borderBottomColor: '#000', paddingBottom: 10 }}>more</Text>

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
          style={{ borderWidth: 1, borderColor: '#000', padding: 14, backgroundColor: Colors.redCoral }}
          onPress={() => setShowLogoutConfirm(true)}
        >
          <Text style={{ fontFamily: Fonts.serif, fontSize: FontSizes.base, color: Colors.white }}>logout</Text>
        </Pressable>
      ) : (
        <Pressable
          style={{ borderWidth: 1, borderColor: '#000', padding: 14, backgroundColor: Colors.white }}
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
            return <Image source={tabIcons.me} style={{ width: size, height: size, opacity: focused ? 1 : 0.5 }} />;
          }
          if (route.name === 'PeopleTab') {
            return <Image source={tabIcons.people} style={{ width: size, height: size, opacity: focused ? 1 : 0.5 }} />;
          }
          if (route.name === 'ArtTab') {
            return <Image source={tabIcons.art} style={{ width: size, height: size, opacity: focused ? 1 : 0.5 }} />;
          }
          if (route.name === 'More') {
            return <Ionicons name={focused ? 'ellipsis-horizontal' : 'ellipsis-horizontal-outline'} size={size} color={color} />;
          }
          return <Ionicons name="home-outline" size={size} color={color} />;
        },
        tabBarActiveTintColor: Colors.darkerGold,
        tabBarInactiveTintColor: Colors.textTertiary,
        tabBarStyle: {
          backgroundColor: Colors.secondary,
          borderTopWidth: 1,
          borderTopColor: '#000',
          height: 90,
          paddingTop: 8,
        },
      })}
    >
      <Tab.Screen name="Home" component={Home} options={{ tabBarLabel: 'home' }} />
      <Tab.Screen name="PeopleTab" component={PeopleStack} options={{ tabBarLabel: 'people' }} />
      <Tab.Screen name="ArtTab" component={ArtStack} options={{ tabBarLabel: 'art' }} />
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
      <RootStack.Screen name="SetupAccount" component={SetupAccount} />
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
