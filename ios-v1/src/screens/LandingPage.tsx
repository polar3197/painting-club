import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ImageBackground,
  StyleSheet,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { login_user, get_profile } from '../api';
import ApplicationDialog from '../components/ApplicationDialog';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';
import type { AuthStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'LandingPage'>;

export default function LandingPage() {
  const navigation = useNavigation<Nav>();
  const auth = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [notMember, setNotMember] = useState(false);
  const [showApplication, setShowApplication] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) return;
    try {
      const res = await login_user({ username: username.trim(), password: password.trim() });
      const profile = await get_profile(username.trim(), res.access_token);
      await auth.login(profile.username, res.access_token, profile.role);
    } catch (err: any) {
      Alert.alert('Login failed', err.message || 'Invalid credentials');
    }
  };

  return (
    <ImageBackground
      source={require('../../assets/imgs/klimpt.png')}
      style={styles.bg}
      resizeMode="cover"
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>-. Painting Club .-</Text>
        </View>

        <View style={styles.loginContainer}>
          {!notMember ? (
            <>
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>un:</Text>
                <TextInput
                  style={styles.input}
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              <View style={styles.inputRow}>
                <Text style={styles.inputLabel}>pw:</Text>
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              <Pressable style={styles.loginBtn} onPress={handleLogin}>
                <Text style={styles.loginBtnText}>login</Text>
              </Pressable>
              <Pressable onPress={() => setNotMember(true)}>
                <Text style={styles.notMemberText}>not a member?</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                style={styles.altBtn}
                onPress={() => {
                  setNotMember(false);
                  navigation.navigate('NotMember');
                }}
              >
                <Text style={styles.altBtnText}>view artists profiles</Text>
              </Pressable>
              <Pressable style={styles.altBtn} onPress={() => setShowApplication(true)}>
                <Text style={styles.altBtnText}>request account</Text>
              </Pressable>
              <Pressable onPress={() => setNotMember(false)}>
                <Text style={styles.notMemberText}>back to login</Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      {showApplication && (
        <ApplicationDialog onClose={() => setShowApplication(false)} />
      )}
    </ImageBackground>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  bg: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  titleWrap: {
    backgroundColor: 'lightgreen',
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 8,
    paddingHorizontal: 20,
    marginBottom: 40,
    ...Shadows.card,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xxl,
    color: Colors.black,
    textAlign: 'center',
  },
  loginContainer: {
    backgroundColor: 'lightgreen',
    padding: 30,
    borderWidth: 1,
    borderColor: '#000',
    width: width * 0.8,
    ...Shadows.card,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  inputLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.base,
    width: 40,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    fontFamily: Fonts.mono,
    fontSize: FontSizes.base,
    paddingVertical: 4,
  },
  loginBtn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 8,
    paddingHorizontal: 20,
    alignSelf: 'center',
    marginTop: 10,
    backgroundColor: 'transparent',
  },
  loginBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
  },
  notMemberText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 16,
    textDecorationLine: 'underline',
  },
  altBtn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 10,
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  altBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
  },
});
