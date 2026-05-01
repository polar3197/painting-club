import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { setup_account, get_profile, accept_terms } from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';

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
      await accept_terms(token);
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
    <View style={styles.page}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.heading}>set up your account</Text>
          <Text style={styles.sub}>pick a username and password</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={(v) => setUsername(v.toLowerCase())}
              autoCapitalize="none"
              autoCorrect={false}
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>confirm password</Text>
            <TextInput
              style={styles.input}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoCapitalize="none"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          <View style={styles.divider} />

          <Text style={styles.terms}>
            In accordance with App Store guidelines and Painting Club's ethos, we ask that you
            don't post anything pornographic, hateful, threatening, or harassing toward other
            members. In a real pinch we will resort to removing your account.
          </Text>

          <Pressable
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Text style={styles.submitBtnText}>
              {submitting ? 'saving...' : 'I agree — finish'}
            </Text>
          </Pressable>

          <Pressable onPress={handleCancel} style={styles.cancelWrap}>
            <Text style={styles.cancelText}>cancel + sign out</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 80,
    paddingBottom: 40,
  },
  heading: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  sub: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
    marginBottom: 32,
  },
  fieldGroup: {
    marginBottom: 22,
  },
  fieldLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.textTertiary,
    marginBottom: 6,
  },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    paddingVertical: 6,
    color: Colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginTop: 16,
    marginBottom: 24,
  },
  terms: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: 28,
  },
  submitBtn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: Colors.mainBg,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
  },
  cancelWrap: {
    marginTop: 18,
    alignItems: 'center',
  },
  cancelText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
    textDecorationLine: 'underline',
  },
});
