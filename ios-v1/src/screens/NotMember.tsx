import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ApplicationDialog from '../components/ApplicationDialog';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';
import type { AuthStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'NotMember'>;

export default function NotMember() {
  const navigation = useNavigation<Nav>();
  const [showApplication, setShowApplication] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.heading}>you aren't a member</Text>
        <Text style={styles.subtext}>
          you can request access or login if you already have an account.
        </Text>
        <Pressable
          style={[styles.btn, { backgroundColor: Colors.primaryGold }]}
          onPress={() => setShowApplication(true)}
        >
          <Text style={styles.btnText}>request access</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, { backgroundColor: Colors.white }]}
          onPress={() => navigation.navigate('LandingPage')}
        >
          <Text style={styles.btnText}>login</Text>
        </Pressable>
      </View>

      {showApplication && (
        <ApplicationDialog onClose={() => setShowApplication(false)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 40,
    paddingHorizontal: 50,
    alignItems: 'center',
    ...Shadows.card,
  },
  heading: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    marginBottom: 12,
  },
  subtext: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  btn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 24,
    paddingVertical: 10,
    marginBottom: 10,
    width: '100%',
    alignItems: 'center',
  },
  btnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
  },
});
