import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ImageBackground,
  StyleSheet,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { appAlert } from '../components/AppAlert';
import { TextInput } from '../components/AppTextInput';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { login_user, redeem_setup_code, get_profile, accept_terms, forgot_password } from '../api';
import TermsModal from '../components/TermsModal';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';
import type { AuthStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'LandingPage'>;

// Same four paintings the web landing page rotates through, each with the
// panel color the web pairs with it (Avery's is transparent on web; cream here
// so the form stays readable). Static requires so Metro bundles all four.
const LANDING_THEMES = [
  { image: require('../../assets/imgs/klimpt.jpg'), accent: 'lightgreen' },
  { image: require('../../assets/imgs/hopper-barn.jpg'), accent: 'rgb(216, 64, 25)' },
  { image: require('../../assets/imgs/diebenkorn.jpg'), accent: 'rgb(238, 114, 72)' },
  { image: require('../../assets/imgs/ma.jpg'), accent: 'rgb(250, 244, 202)' },
];

export default function LandingPage() {
  const navigation = useNavigation<Nav>();
  const auth = useAuth();
  // Picked once per mount so typing (re-renders) never swaps the painting.
  const [theme] = useState(() => LANDING_THEMES[Math.floor(Math.random() * LANDING_THEMES.length)]);
  const accent = { backgroundColor: theme.accent };

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [setupCode, setSetupCode] = useState('');
  // Forgot-password: single dialog — type username, tap the check, done.
  // The request lodges in the admin panel; the admin sends the code manually
  // and it's redeemed via the "secret code?" flow.
  const [showForgot, setShowForgot] = useState(false);
  const [forgotUname, setForgotUname] = useState('');
  // The forgot panel has two steps: ask for a code, then redeem the one an
  // admin sends back. Redemption used to be its own "secret code?" button on
  // this screen; it moved in here because the only people who ever need it are
  // the people who just asked for a code.
  const [forgotStep, setForgotStep] = useState<'ask' | 'redeem'>('ask');
  // Someone whose application hasn't been reviewed yet.
  const [underReview, setUnderReview] = useState(false);

  const handleForgotPress = () => {
    // Seed from the login box when they've already typed it there.
    setForgotUname(username.trim());
    setShowForgot(true);
  };

  const handleForgotSubmit = () => {
    const uname = forgotUname.trim();
    if (!uname) return;
    // Fire-and-forget: the endpoint always answers ok.
    forgot_password(uname).catch(() => {});
    setForgotStep('redeem');
  };

  const closeForgot = () => {
    setShowForgot(false);
    setForgotStep('ask');
    setForgotUname('');
    setSetupCode('');
  };
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
      // The backend answers "under_review" when the credentials belong to an
      // application nobody has got to yet. Saying "invalid credentials" there
      // is the one thing guaranteed to make them think they mistyped.
      if (err?.message === 'under_review') {
        setUnderReview(true);
        setPassword('');
        return;
      }
      appAlert('Login failed', err.message || 'Invalid credentials');
    }
  };

  const handleSetupCode = async () => {
    const code = setupCode.trim();
    if (!code) return;
    try {
      const res = await redeem_setup_code({ code });
      closeForgot();
      (navigation as any).navigate('SetupAccount', { token: res.access_token });
    } catch (err: any) {
      appAlert('Setup failed', err.message || 'Invalid or expired setup code');
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
      appAlert('Could not save', err.message || 'try again');
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
      source={theme.image}
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
        <View style={[styles.titleWrap, accent]}>
          <Text
            style={styles.title}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.6}
          >
            -• Painting Club •-
          </Text>
        </View>

        <View style={[styles.loginContainer, accent]}>
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
          {/* One onboarding path now. Setup codes only exist for password
              resets, so redeeming one lives inside the forgot-password panel
              instead of sitting here confusing people who never needed one. */}
          <Pressable
            style={styles.actionBtn}
            onPress={() => (navigation as any).navigate('ApplicationFlow')}
          >
            <Text style={styles.actionBtnText}>request acc</Text>
          </Pressable>
          <Pressable onPress={handleForgotPress} hitSlop={6}>
            <Text style={styles.forgotLink}>forgot password?</Text>
          </Pressable>
        </View>
        <View style={styles.flexSpacer} />
      </KeyboardAvoidingView>

      {/* Someone who applied and hasn't been reviewed yet. Reuses the secret
          panel chrome so it reads as part of the same surface. */}
      <Modal
        transparent
        visible={underReview}
        animationType="fade"
        onRequestClose={() => setUnderReview(false)}
      >
        <View style={styles.secretBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setUnderReview(false)} />
          <View style={[styles.secretPanel, accent]}>
            <Text style={styles.secretLabel}>still under review</Text>
            <Text style={styles.forgotBody}>
              Your application hasn't been looked at yet. A member reads every one. Once you're
              approved this same username and password will just work. There's nothing else to
              do and no code to wait for. Try again in a day.
            </Text>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={showForgot}
        animationType="fade"
        onRequestClose={closeForgot}
      >
        <View style={styles.secretBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeForgot} />
          <View style={[styles.secretPanel, accent]}>
            <Text style={styles.secretLabel}>forgot password</Text>
            {forgotStep === 'ask' ? (
              <>
                <Text style={styles.forgotBody}>
                  type your username and we'll send you a new secret code asap
                </Text>
                <View style={styles.secretCodeRow}>
                  <TextInput
                    style={styles.secretCodeInput}
                    value={forgotUname}
                    onChangeText={(v) => setForgotUname(v.toLowerCase())}
                    placeholder="username"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="send"
                    autoFocus
                    onSubmitEditing={handleForgotSubmit}
                  />
                  <Pressable style={styles.secretCodeBtn} onPress={handleForgotSubmit}>
                    <Text style={styles.secretCodeBtnArrow}>✓</Text>
                  </Pressable>
                </View>
                <Pressable onPress={() => setForgotStep('redeem')} hitSlop={6}>
                  <Text style={styles.forgotLink}>already have a code?</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.forgotBody}>
                  a member will send you a secret code. paste it here when it lands.
                </Text>
                <View style={styles.secretCodeRow}>
                  <TextInput
                    style={styles.secretCodeInput}
                    value={setupCode}
                    onChangeText={setSetupCode}
                    placeholder="paste it"
                    placeholderTextColor={Colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="go"
                    autoFocus
                    onSubmitEditing={handleSetupCode}
                  />
                  <Pressable style={styles.secretCodeBtn} onPress={handleSetupCode}>
                    <Text style={styles.secretCodeBtnArrow}>→</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

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
  splitRow: {
    flexDirection: 'row',
    gap: 8,
  },
  splitBtn: {
    flex: 1,
    // Tighter horizontal padding so longer labels ("secret code?") don't
    // wrap inside the half-width buttons.
    paddingHorizontal: 8,
  },
  secretBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  secretPanel: {
    width: '100%',
    backgroundColor: 'lightgreen',
    borderWidth: 1,
    borderColor: '#000',
    padding: 20,
    ...Shadows.card,
  },
  secretLabel: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    marginBottom: 8,
  },
  forgotLink: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.black,
    textAlign: 'center',
    textDecorationLine: 'underline',
    marginTop: 10,
  },
  forgotBody: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textPrimary,
    lineHeight: 18,
    marginBottom: 10,
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
