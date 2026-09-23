import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions, ActivityIndicator } from 'react-native';
import Reanimated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { TextInput } from '../components/AppTextInput';
import { appAlert } from '../components/AppAlert';
import {
  submit_application,
  upload_application_art,
  check_username_available,
} from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';

// The application form — the iOS twin of the web's ApplicationFlow.
//
//   1. name · city · a piece of art       -> next
//   2. username · password · email        -> submit
//
// Same three structural choices as the web, for the same reasons:
//
// - The photo appears the instant it's picked, straight from the local asset
//   uri. Nothing about showing it touches the network.
// - The bytes are only SENT on "next". Nothing is ever in flight while they're
//   still choosing, so re-picking can't race; "back" aborts, and a seq the
//   server checks covers the rest.
// - Submit never depends on that upload. If it didn't land, submit sends the
//   file itself, so a dead zone costs a couple of seconds, not the application.
//
// One honest limit: this build has no expo-image-manipulator, so the picker's
// `quality` is the only compression available — it re-encodes but does NOT
// resize. Uploads are therefore a few hundred KB to ~1.5MB rather than the
// web's ~300KB. Fixing that needs a native build, not an OTA.
const PICK_QUALITY = 0.6;
const MIN_PASSWORD = 8;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Picked {
  uri: string;
  name: string;
  type: string;
  aspectRatio: number | null;
}

export default function ApplicationFlow({ route, navigation }: any) {
  const inviteToken: string | undefined = route?.params?.inviteToken;
  const insets = useSafeAreaInsets();

  const [page, setPage] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [firstname, setFirstname] = useState('');
  const [lastname, setLastname] = useState('');
  const [city, setCity] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');

  const [picked, setPicked] = useState<Picked | null>(null);
  const [uploading, setUploading] = useState(false);
  const [unameState, setUnameState] = useState<'idle' | 'checking' | 'free' | 'taken'>('idle');

  // Refs wherever an async flow reads a value back — submit has to see what is
  // true now, not what was captured when it rendered.
  const draftIdRef = useRef(
    `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`.padEnd(16, '0').slice(0, 32),
  );
  const pickSeqRef = useRef(0);
  const pickedRef = useRef<Picked | null>(null);
  const uploadDoneRef = useRef(false);
  const inflightRef = useRef<{ seq: number; controller: AbortController; promise: Promise<unknown> } | null>(null);

  // Keyboard-controller's native module drives this every frame, so the panel
  // tracks the keyboard welded to it. reanimated's own useAnimatedKeyboard does
  // NOT track on this New-Architecture build (see SearchTabs.tsx). Its height is
  // NEGATIVE while the keyboard is open, hence the negation below.
  const { height: kbHeight } = useReanimatedKeyboardAnimation();
  const panelStyle = useAnimatedStyle(() => ({ paddingBottom: -kbHeight.value }));
  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(-page * SCREEN_WIDTH, { duration: 280 }) }],
  }));

  useEffect(() => () => inflightRef.current?.controller.abort(), []);

  // --- picking --------------------------------------------------------------
  const pick = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // The only compression lever in this build. Also converts HEIC to JPEG.
      quality: PICK_QUALITY,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const a = result.assets[0];
    pickSeqRef.current += 1;
    const next: Picked = {
      uri: a.uri,
      name: a.uri.split('/').pop() || 'piece.jpg',
      type: a.mimeType || 'image/jpeg',
      // The picker hands back dimensions, so the aspect ratio costs nothing —
      // no decode, and the wall gets reserved boxes for free.
      aspectRatio: a.width && a.height ? a.width / a.height : null,
    };
    pickedRef.current = next;
    setPicked(next);
    uploadDoneRef.current = false;
    setError(null);
  }, []);

  // --- upload ---------------------------------------------------------------
  const startUpload = useCallback(() => {
    const file = pickedRef.current;
    if (!file) return;
    const seq = pickSeqRef.current;
    if (inflightRef.current?.seq === seq) return;
    inflightRef.current?.controller.abort();

    const controller = new AbortController();
    setUploading(true);
    const promise = upload_application_art(draftIdRef.current, seq, file, controller.signal)
      .then(() => {
        if (pickSeqRef.current === seq) uploadDoneRef.current = true;
      })
      .catch(() => {
        // Deliberately silent: page 2 has no photo to attach an error to, and
        // submit will carry the file itself if this never landed.
        if (pickSeqRef.current === seq) uploadDoneRef.current = false;
      })
      .finally(() => {
        if (pickSeqRef.current === seq) setUploading(false);
      });
    inflightRef.current = { seq, controller, promise };
  }, []);

  // --- username availability ------------------------------------------------
  useEffect(() => {
    const u = username.trim().toLowerCase();
    if (!u) {
      setUnameState('idle');
      return;
    }
    setUnameState('checking');
    const controller = new AbortController();
    const t = setTimeout(() => {
      check_username_available(u, controller.signal)
        .then((r) => setUnameState(r.available ? 'free' : 'taken'))
        .catch(() => setUnameState('idle'));
    }, 350);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [username]);

  // --- navigation -----------------------------------------------------------
  const goNext = () => {
    if (!firstname.trim() || !lastname.trim()) return setError('your name, please');
    if (!pickedRef.current) return setError('add a piece, anything at all');
    setError(null);
    startUpload();
    setPage(1);
  };

  const goBack = () => {
    // The one remaining way to get an out-of-order upload, so close it here
    // rather than leaning on the server's seq check alone.
    inflightRef.current?.controller.abort();
    inflightRef.current = null;
    setUploading(false);
    setError(null);
    setPage(0);
  };

  // --- submit ---------------------------------------------------------------
  const submit = async () => {
    if (submitting) return;
    const uname = username.trim().toLowerCase();
    if (!uname) return setError('pick a username');
    if (unameState === 'taken') return setError('that username is taken');
    if (password.length < MIN_PASSWORD) return setError(`password needs ${MIN_PASSWORD}+ characters`);
    if (!email.trim()) return setError('we need an email to reach you');

    setError(null);
    setSubmitting(true);
    try {
      if (!uploadDoneRef.current && inflightRef.current) {
        await inflightRef.current.promise.catch(() => {});
      }
      if (!uploadDoneRef.current && pickedRef.current) {
        await upload_application_art(draftIdRef.current, pickSeqRef.current, pickedRef.current);
        uploadDoneRef.current = true;
      }
      await submit_application({
        firstname: firstname.trim(),
        lastname: lastname.trim(),
        email: email.trim(),
        city: city.trim() || undefined,
        username: uname,
        password,
        invite_token: inviteToken,
        art_draft_id: draftIdRef.current,
        art_aspect_ratio: pickedRef.current?.aspectRatio ?? undefined,
      });
      setSubmitted(true);
    } catch (err: any) {
      const msg = err?.message || 'something went wrong';
      if (msg === 'art_missing') setError("your piece didn't finish uploading. go back and re-add it");
      else if (/is taken/.test(msg)) {
        setUnameState('taken');
        setError(msg);
      } else setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <View style={[styles.root, styles.done, { paddingTop: insets.top }]}>
        <Text style={styles.doneTitle}>you're in the queue, @{username.trim().toLowerCase()}.</Text>
        <Text style={styles.doneSub}>
          A member reads every application. Once you're approved, log in with the username and
          password you just picked. There's no code to wait for.
        </Text>
        <Pressable style={styles.primary} onPress={() => navigation.goBack()}>
          <Text style={styles.primaryText}>done</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Reanimated.View style={[styles.root, panelStyle, { paddingTop: insets.top }]}>
      <View style={styles.head}>
        <Text style={styles.headTitle}>-• Painting Club •-</Text>
        <Text style={styles.headStep}>{page === 0 ? '1 of 2' : '2 of 2'}</Text>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.headX}>x</Text>
        </Pressable>
      </View>

      <Reanimated.View style={[styles.track, trackStyle]}>
        {/* ---------- page 1 ---------- */}
        <View style={styles.page}>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.rowInput]}
              value={firstname}
              onChangeText={setFirstname}
              placeholder="first name"
              placeholderTextColor={Colors.textMuted}
            />
            <TextInput
              style={[styles.input, styles.rowInput]}
              value={lastname}
              onChangeText={setLastname}
              placeholder="last name"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            placeholder="city"
            placeholderTextColor={Colors.textMuted}
          />

          <Pressable style={styles.art} onPress={pick}>
            {picked ? (
              <>
                <Image
                  source={{ uri: picked.uri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  // Local file: no transition, it should simply be there.
                  transition={0}
                />
                {uploading && <View style={styles.artBar} />}
                <View style={styles.artChange}>
                  <Text style={styles.artChangeText}>change</Text>
                </View>
              </>
            ) : (
              <Text style={styles.artEmpty}>+ add a piece</Text>
            )}
          </Pressable>
          <Text style={styles.note}>a stick figure on a post it note is more than enough</Text>

          <Text style={styles.err}>{page === 0 ? error ?? '' : ''}</Text>
          <Pressable style={styles.primary} onPress={goNext}>
            <Text style={styles.primaryText}>next</Text>
          </Pressable>
        </View>

        {/* ---------- page 2 ---------- */}
        <View style={styles.page}>
          <View style={styles.field}>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="username"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {unameState === 'free' && <Text style={[styles.hint, styles.hintFree]}>free</Text>}
            {unameState === 'taken' && <Text style={[styles.hint, styles.hintTaken]}>taken</Text>}
          </View>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="password (8+ characters)"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="email"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <Text style={styles.note}>where we'll reach you when your account is approved</Text>

          <Text style={styles.err}>{page === 1 ? error ?? '' : ''}</Text>
          <View style={styles.actions}>
            <Pressable style={styles.secondary} onPress={goBack}>
              <Text style={styles.secondaryText}>back</Text>
            </Pressable>
            <Pressable style={[styles.primary, styles.actionPrimary]} onPress={submit} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color={Colors.black} />
              ) : (
                <Text style={styles.primaryText}>submit</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Reanimated.View>
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.secondary },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  headTitle: { flex: 1, fontFamily: Fonts.serif, fontSize: FontSizes.md },
  headStep: { fontFamily: Fonts.mono, fontSize: FontSizes.xs, color: Colors.textMuted },
  headX: { fontFamily: Fonts.mono, fontSize: FontSizes.md, paddingHorizontal: 6 },
  track: { flex: 1, flexDirection: 'row', width: SCREEN_WIDTH * 2 },
  page: { width: SCREEN_WIDTH, padding: 20, gap: 12 },
  row: { flexDirection: 'row', gap: 10 },
  rowInput: { flex: 1 },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    fontFamily: Fonts.mono,
    fontSize: FontSizes.base,
    paddingVertical: 10,
    color: Colors.black,
  },
  field: { position: 'relative', justifyContent: 'center' },
  hint: { position: 'absolute', right: 0, fontFamily: Fonts.mono, fontSize: FontSizes.xs },
  hintFree: { color: 'rgb(20,120,80)' },
  hintTaken: { color: 'rgb(200,60,60)' },
  art: {
    flex: 1,
    minHeight: 140,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  artEmpty: { fontFamily: Fonts.serif, fontSize: FontSizes.md, color: Colors.textMuted },
  artBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: Colors.primaryGold },
  artChange: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    backgroundColor: Colors.primaryGold,
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  artChangeText: { fontFamily: Fonts.mono, fontSize: FontSizes.xs, color: Colors.black },
  note: { fontFamily: Fonts.mono, fontSize: FontSizes.xs, color: Colors.textMuted, lineHeight: 16 },
  // Fixed height so the line appearing never reflows the form and shifts the
  // button out from under a thumb already on its way down.
  err: { minHeight: 18, fontFamily: Fonts.mono, fontSize: FontSizes.xs, color: 'rgb(200,60,60)' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 'auto' },
  actionPrimary: { flex: 1, marginTop: 0 },
  primary: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.primaryGold,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 'auto',
  },
  primaryText: { fontFamily: Fonts.serif, fontSize: FontSizes.base, color: Colors.black },
  secondary: { borderWidth: 1, borderColor: '#000', paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center' },
  secondaryText: { fontFamily: Fonts.serif, fontSize: FontSizes.base, color: Colors.black },
  done: { alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  doneTitle: { fontFamily: Fonts.serif, fontSize: FontSizes.lg, textAlign: 'center' },
  doneSub: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.sm,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
