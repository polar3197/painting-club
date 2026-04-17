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
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { setup_account, get_profile } from '../api';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';

type Nav = NativeStackNavigationProp<any>;

export default function SetupAccount() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<any>();
  const auth = useAuth();
  const token: string | undefined = route.params?.token;

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const trimmed = username.trim().toLowerCase();
    if (trimmed.length < 3) {
      Alert.alert('Setup', 'username must be at least 3 characters');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Setup', 'password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Setup', "passwords don't match");
      return;
    }
    if (!token) {
      Alert.alert('Setup', 'missing auth token — please log in again');
      navigation.reset({ index: 0, routes: [{ name: 'LandingPage' }] });
      return;
    }

    setSubmitting(true);
    try {
      const result = await setup_account({ new_username: trimmed, new_password: password }, token);
      const profile = await get_profile(result.username, token);
      await auth.login(profile.username, token, profile.role);
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (err: any) {
      Alert.alert('Setup failed', err.message || 'could not complete setup');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    await auth.logout();
    navigation.reset({ index: 0, routes: [{ name: 'LandingPage' }] });
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

        <View style={styles.container}>
          <Text style={styles.heading}>welcome — pick a username + password</Text>

          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>un:</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={(v) => setUsername(v.toLowerCase())}
              autoCapitalize="none"
              autoCorrect={false}
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
              autoCapitalize="none"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>pw2:</Text>
            <TextInput
              style={styles.input}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoCapitalize="none"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          <Pressable style={styles.submitBtn} onPress={handleSubmit} disabled={submitting}>
            <Text style={styles.submitBtnText}>{submitting ? 'saving...' : 'finish'}</Text>
          </Pressable>

          <Pressable onPress={handleCancel}>
            <Text style={styles.cancelText}>cancel + sign out</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  bg: { flex: 1 },
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
  container: {
    backgroundColor: 'lightgreen',
    padding: 30,
    borderWidth: 1,
    borderColor: '#000',
    width: width * 0.85,
    ...Shadows.card,
  },
  heading: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    marginBottom: 16,
    lineHeight: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  inputLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.base,
    width: 48,
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
  submitBtn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 8,
    paddingHorizontal: 20,
    alignSelf: 'center',
    marginTop: 10,
    backgroundColor: 'transparent',
  },
  submitBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
  },
  cancelText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 16,
    textDecorationLine: 'underline',
  },
});
