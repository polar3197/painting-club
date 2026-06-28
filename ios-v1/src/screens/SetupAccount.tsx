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
  Dimensions,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { setup_account, get_profile, accept_terms } from '../api';
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
    if (trimmed.length < 1) {
      Alert.alert('Setup', 'username cannot be empty');
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
      // Drop the new member straight into their own profile (the Me tab).
      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'Main',
            state: {
              index: 2,
              routes: [
                { name: 'Home' },
                { name: 'SearchTab' },
                { name: 'Me' },
                { name: 'More' },
              ],
            },
          },
        ],
      });
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
    <View style={styles.backdrop}>
      <KeyboardAvoidingView
        style={styles.center}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.card}>
          {/* Scroll so the submit + cancel buttons ride above the keyboard
              instead of getting pushed off-screen with no way to reach them. */}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.cardContent}
          >
          <Text style={styles.heading}>set up your account</Text>

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
              autoComplete="off"
              textContentType="oneTimeCode"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          <View style={styles.inputRow}>
            <Text style={styles.inputLabel}>repeat pw:</Text>
            <TextInput
              style={styles.input}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="off"
              textContentType="oneTimeCode"
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          <Text style={styles.terms}>
            In accordance with App Store guidelines and Painting Club's ethos, we ask that you
            don't post anything pornographic, hateful, threatening, or harassing toward other
            members. In a real pinch we will resort to removing your account.
          </Text>

          <Pressable
            style={[styles.actionBtn, submitting && styles.actionBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            <Text style={styles.actionBtnText}>
              {submitting ? 'saving...' : 'I agree'}
            </Text>
          </Pressable>

          <Pressable style={styles.actionBtn} onPress={handleCancel}>
            <Text style={styles.actionBtnText}>no, i wanted to cause harm and create porn</Text>
          </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  card: {
    backgroundColor: Colors.secondary,
    padding: 24,
    borderWidth: 1,
    borderColor: '#000',
    width: width * 0.8,
    maxHeight: '85%',
    ...Shadows.card,
  },
  cardContent: {
    paddingBottom: 4,
  },
  heading: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  inputLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.base,
    width: 90,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    fontFamily: Fonts.mono,
    fontSize: FontSizes.base,
    paddingVertical: 4,
    color: Colors.textPrimary,
  },
  terms: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginTop: 16,
    marginBottom: 8,
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 10,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
});
