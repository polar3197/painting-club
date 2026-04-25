import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';

interface TermsModalProps {
  visible: boolean;
  submitting?: boolean;
  onAgree: () => void;
  onDecline: () => void;
}

export default function TermsModal({ visible, submitting, onAgree, onDecline }: TermsModalProps) {
  const [checked, setChecked] = useState(false);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onDecline}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>house rules</Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.body}>
              In accordance with App Store guidelines and Painting Club's ethos, we ask that you
              don't post anything pornographic, hateful, threatening, or harassing toward other
              members. Artistic nudity is welcome. If an agreement can't be reached, the member
              is removed from the app.
            </Text>
          </ScrollView>

          <Pressable style={styles.checkRow} onPress={() => setChecked((v) => !v)}>
            <View style={[styles.checkbox, checked && styles.checkboxOn]}>
              {checked && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.checkLabel}>I agree</Text>
          </Pressable>

          <View style={styles.buttons}>
            <Pressable style={styles.declineBtn} onPress={onDecline} disabled={submitting}>
              <Text style={styles.declineText}>decline + sign out</Text>
            </Pressable>
            <Pressable
              style={[styles.agreeBtn, (!checked || submitting) && styles.agreeBtnDisabled]}
              onPress={onAgree}
              disabled={!checked || submitting}
            >
              <Text style={styles.agreeText}>{submitting ? 'saving...' : 'continue'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  dialog: {
    width: '100%',
    backgroundColor: 'lightgreen',
    borderWidth: 1,
    borderColor: '#000',
    padding: 22,
    ...Shadows.card,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    marginBottom: 12,
  },
  scroll: {
    maxHeight: 260,
  },
  scrollContent: {
    paddingBottom: 4,
  },
  body: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textPrimary,
    lineHeight: 22,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 16,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxOn: {
    backgroundColor: Colors.white,
  },
  checkmark: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
  checkLabel: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  declineBtn: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  declineText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
    textDecorationLine: 'underline',
  },
  agreeBtn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 8,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
  },
  agreeBtnDisabled: {
    opacity: 0.4,
  },
  agreeText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.textPrimary,
  },
});
