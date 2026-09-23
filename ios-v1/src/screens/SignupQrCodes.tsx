import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import qrcode from 'qrcode-generator';
import { useAuth } from '../context/AuthContext';
import {
  SignupInviteOut,
  list_signup_invites,
  create_signup_invite,
  getJoinUrl,
} from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';

// The club's two QR codes, and nothing else.
//
// They do very different things, which is the only reason this screen has any
// copy at all:
//   normal signup — scanning leads to the application form; a member reviews it
//   skip approval — scanning creates a live account on the spot, no review
//
// The difference is enforced server-side by signup_invite.instant, not by which
// image is on screen: /join/redeem refuses any token without the flag, so the
// normal code can't be turned into a skip-approval one by editing the URL.

const QR_SIZE = 240;

// Drawn as plain Views from a pure-JS module matrix — no native QR or SVG
// dependency, so this ships over OTA. Each row is merged into same-colour runs,
// which is ~10x fewer Views than one per module.
function QrPanel({ modules, danger }: { modules: boolean[][]; danger?: boolean }) {
  const n = modules.length;
  const cell = Math.max(2, Math.floor(QR_SIZE / n));
  const rows = modules.map((row) => {
    const runs: { dark: boolean; len: number }[] = [];
    for (const dark of row) {
      const last = runs[runs.length - 1];
      if (last && last.dark === dark) last.len += 1;
      else runs.push({ dark, len: 1 });
    }
    return runs;
  });
  return (
    <View style={[styles.qrPanel, danger && styles.qrPanelDanger, { padding: cell * 2 }]}>
      {rows.map((runs, r) => (
        <View key={r} style={{ flexDirection: 'row' }}>
          {runs.map((run, i) => (
            <View
              key={i}
              style={{ width: cell * run.len, height: cell, backgroundColor: run.dark ? '#000' : '#fff' }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const toModules = (url: string): boolean[][] => {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const rows: boolean[][] = [];
  for (let r = 0; r < n; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
    rows.push(row);
  }
  return rows;
};

const isLive = (i: SignupInviteOut) =>
  !i.revoked &&
  (i.expires_at === null || new Date(i.expires_at + 'Z') > new Date()) &&
  (i.max_uses === null || i.uses < i.max_uses);

export default function SignupQrCodes() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { token } = useAuth();

  const [normal, setNormal] = useState<boolean[][] | null>(null);
  const [skip, setSkip] = useState<boolean[][] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const invites = await list_signup_invites(token);
        // Reuse a live code of each kind; mint one the first time. These are
        // standing codes — they don't expire and have no use limit — so this
        // normally creates nothing at all.
        const apply =
          invites.find((i: SignupInviteOut) => isLive(i) && !i.instant) ??
          (await create_signup_invite(token, { label: 'club qr' }));
        const instant =
          invites.find((i: SignupInviteOut) => isLive(i) && i.instant) ??
          (await create_signup_invite(token, { label: 'trusted qr', instant: true }));
        if (cancelled) return;
        setNormal(toModules(getJoinUrl(apply.token)));
        setSkip(toModules(getJoinUrl(instant.token)));
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>QR codes</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {navigation.canGoBack() && (
          <Pressable style={styles.backBtn} hitSlop={10} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>‹ back</Text>
          </Pressable>
        )}

        <Text style={styles.label}>normal signup</Text>
        {normal ? (
          <QrPanel modules={normal} />
        ) : (
          <Text style={styles.empty}>{error ? "couldn't load the QR" : 'loading…'}</Text>
        )}

        <Text style={[styles.label, styles.labelGap]}>skip approval</Text>
        {skip ? (
          <QrPanel modules={skip} danger />
        ) : (
          <Text style={styles.empty}>{error ? "couldn't load the QR" : 'loading…'}</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.mainBg },
  header: {
    paddingHorizontal: 30,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  title: { fontFamily: Fonts.serif, fontSize: FontSizes.xl, color: Colors.black },
  body: { paddingHorizontal: 30, paddingTop: 12 },
  backBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  backBtnText: { fontFamily: Fonts.serif, fontSize: FontSizes.xs, color: Colors.black },
  label: { fontFamily: Fonts.serif, fontSize: FontSizes.md, color: Colors.black, marginBottom: 8 },
  labelGap: { marginTop: 32 },
  qrPanel: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#000',
    alignSelf: 'center',
  },
  // Red rule on the skip-approval code. At a meeting there is no second chance
  // to notice which one is on screen, and scanning this one means an account
  // nobody reviewed.
  qrPanelDanger: { borderWidth: 3, borderColor: 'rgb(170,40,40)' },
  empty: { fontFamily: Fonts.mono, fontSize: FontSizes.xs, color: Colors.textMuted },
});
