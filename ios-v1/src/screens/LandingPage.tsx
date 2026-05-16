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
import { login_user, redeem_setup_code, get_profile, accept_terms } from '../api';
import ApplicationDialog from '../components/ApplicationDialog';
import TermsModal from '../components/TermsModal';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';
import type { AuthStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'LandingPage'>;

export default function LandingPage() {
  const navigation = useNavigation<Nav>();
  const auth = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [notMember, setNotMember] = useState(false);
  const [setupCode, setSetupCode] = useState('');
  const [showApplication, setShowApplication] = useState(false);
  const [pendingTerms, setPendingTerms] = useState<{
    username: string;
    token: string;
    role: string;
  } | null>(null);
  const [acceptingTerms, setAcceptingTerms] = useState(false);

  const handleLogin = async () => {
    const normalized = username.trim().toLowerCase();
    if (!normalized || !password.trim()) return;
    try {
      const res = await login_user({ username: normalized, password: password.trim() });
      if (res.must_setup) {
        // Temp-password user: route to setup with the token; skip auth.login() until they've
        // chosen a real username + password.
        (navigation as any).navigate('SetupAccount', { token: res.access_token });
        return;
      }
      const profile = await get_profile(normalized, res.access_token);
      // Apple guideline 1.2: gate UGC access on terms acceptance.
      if (!profile.terms_accepted_at) {
        setPendingTerms({ username: profile.username, token: res.access_token, role: profile.role });
        return;
      }
      await auth.login(profile.username, res.access_token, profile.role);
      (navigation as any).reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (err: any) {
      Alert.alert('Login failed', err.message || 'Invalid credentials');
    }
  };

  const handleSetupCode = async () => {
    const code = setupCode.trim();
    if (!code) return;
    try {
      const res = await redeem_setup_code({ code });
      (navigation as any).navigate('SetupAccount', { token: res.access_token });
    } catch (err: any) {
      Alert.alert('Setup failed', err.message || 'Invalid or expired setup code');
    }
  };

  const handleAgreeTerms = async () => {
    if (!pendingTerms) return;
    setAcceptingTerms(true);
    try {
      await accept_terms(pendingTerms.token);
      await auth.login(pendingTerms.username, pendingTerms.token, pendingTerms.role);
      setPendingTerms(null);
      (navigation as any).reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (err: any) {
      Alert.alert('Could not save', err.message || 'try again');
    } finally {
      setAcceptingTerms(false);
    }
  };

  const handleDeclineTerms = () => {
    setPendingTerms(null);
    setPassword('');
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
        keyboardVerticalOffset={0}
      >
        {/* Flex spacers replace justifyContent: 'center' so that when KAV's
            padding-bottom animates with the keyboard, content slides smoothly
            instead of recentering every frame (which produces visible twitch). */}
        <View style={styles.flexSpacer} />
        <View style={styles.titleWrap}>
          {/* adjustsFontSizeToFit scales the title down on narrow screens so
              it stops at the box's inner edge. We bound it with a sensible
              minimumFontScale so it won't shrink to a hairline on very narrow
              devices. Re-adding this is fine now that the surrounding layout
              uses flex spacers instead of justifyContent:center — the title
              no longer re-fits on every keyboard-driven layout pass. */}
          <Text
            style={styles.title}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            -• Painting Club •-
          </Text>
        </View>

        <View style={styles.loginContainer}>
          {!notMember ? (
            <>
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
              <Pressable style={styles.actionBtn} onPress={handleLogin}>
                <Text style={styles.actionBtnText}>login</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={() => setNotMember(true)}>
                <Text style={styles.actionBtnText}>not a member?</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                style={styles.actionBtn}
                onPress={() => {
                  setNotMember(false);
                  (navigation as any).reset({
                    index: 0,
                    routes: [{ name: 'Main', state: { routes: [{ name: 'PeopleTab' }] } }],
                  });
                }}
              >
                <Text style={styles.actionBtnText}>view artists profiles</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={() => setShowApplication(true)}>
                <Text style={styles.actionBtnText}>request account</Text>
              </Pressable>
              <View style={styles.secretCodeRow}>
                <TextInput
                  style={styles.secretCodeInput}
                  value={setupCode}
                  onChangeText={setSetupCode}
                  placeholder="secret code?"
                  placeholderTextColor={Colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="go"
                  onSubmitEditing={handleSetupCode}
                />
                <Pressable style={styles.secretCodeBtn} onPress={handleSetupCode}>
                  <Text style={styles.secretCodeBtnArrow}>→</Text>
                </Pressable>
              </View>
              <Pressable style={styles.actionBtn} onPress={() => setNotMember(false)}>
                <Text style={styles.actionBtnText}>ur a member?</Text>
              </Pressable>
            </>
          )}
        </View>
        <View style={styles.flexSpacer} />
      </KeyboardAvoidingView>

      {showApplication && (
        <ApplicationDialog onClose={() => setShowApplication(false)} />
      )}

      <TermsModal
        visible={pendingTerms !== null}
        submitting={acceptingTerms}
        onAgree={handleAgreeTerms}
        onDecline={handleDeclineTerms}
      />
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
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  flexSpacer: {
    flex: 1,
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
  actionBtn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 10,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  actionBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    textAlign: 'center',
  },
  secretCodeRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    borderColor: '#000',
    marginTop: 10,
    backgroundColor: Colors.secondary,
  },
  secretCodeBtn: {
    aspectRatio: 1,
    backgroundColor: Colors.primaryGold,
    borderLeftWidth: 1,
    borderLeftColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secretCodeBtnArrow: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    color: Colors.black,
  },
  secretCodeInput: {
    flex: 1,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    textAlign: 'left',
    color: Colors.black,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
});
