import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { Colors, Fonts, FontSizes } from '../constants/theme';

// App-styled replacement for React Native's native `Alert.alert`, with the same
// call signature so it's a drop-in swap:
//   appAlert('title')
//   appAlert('title', 'message')
//   appAlert('title', 'message', [{ text, onPress?, style? }, ...])
// Render <AppAlertHost /> once at the app root. A module-level setter bridges the
// imperative call to the host's state (same pattern as the API client's auth
// handler), so any file can call appAlert without prop-drilling.

export type AppAlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type AlertReq = { title: string; message?: string; buttons?: AppAlertButton[] };

let pushAlert: ((req: AlertReq) => void) | null = null;

export function appAlert(title: string, message?: string, buttons?: AppAlertButton[]) {
  if (pushAlert) pushAlert({ title, message, buttons });
}

export function AppAlertHost() {
  const [req, setReq] = useState<AlertReq | null>(null);

  useEffect(() => {
    pushAlert = (r) => setReq(r);
    return () => {
      pushAlert = null;
    };
  }, []);

  if (!req) return null;

  const buttons: AppAlertButton[] = req.buttons && req.buttons.length ? req.buttons : [{ text: 'ok' }];
  const dismiss = (b?: AppAlertButton) => {
    setReq(null);
    b?.onPress?.();
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => dismiss()}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => dismiss()} />
        <View style={styles.card}>
          <Text style={styles.title}>{req.title}</Text>
          {!!req.message && <Text style={styles.message}>{req.message}</Text>}
          <View style={[styles.btnRow, buttons.length > 2 && styles.btnCol]}>
            {buttons.map((b, i) => (
              <Pressable
                key={i}
                style={[styles.btn, bgFor(b.style), buttons.length > 2 && styles.btnFull]}
                onPress={() => dismiss(b)}
              >
                <Text style={styles.btnText}>{b.text}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function bgFor(style?: AppAlertButton['style']) {
  if (style === 'destructive') return { backgroundColor: Colors.redCoral };
  if (style === 'cancel') return { backgroundColor: Colors.secondary };
  return { backgroundColor: Colors.primaryGold };
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 3,
    borderColor: '#000',
    backgroundColor: Colors.mainBg,
    padding: 20,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    color: Colors.black,
  },
  message: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 10,
    lineHeight: 22,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    justifyContent: 'flex-end',
  },
  btnCol: {
    flexDirection: 'column-reverse',
  },
  btn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 16,
    paddingVertical: 9,
    alignItems: 'center',
  },
  btnFull: {
    width: '100%',
  },
  btnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
});
