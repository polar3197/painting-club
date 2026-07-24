import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { appAlert } from './AppAlert';
import { TextInput } from './AppTextInput';
import { submit_application } from '../api';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';

interface ApplicationDialogProps {
  onClose: () => void;
}

export default function ApplicationDialog({ onClose }: ApplicationDialogProps) {
  const [firstname, setFirstname] = useState('');
  const [lastname, setLastname] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [knownMember, setKnownMember] = useState('');
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Cap the dialog to the space the keyboard leaves, so KeyboardAvoidingView
  // can always fit the whole card (submit included) above it instead of
  // pushing the bottom out of reach.
  const { height: winH } = useWindowDimensions();
  const [kbHeight, setKbHeight] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvt, () => setKbHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);
  const dialogMaxHeight = Math.min(winH * 0.8, winH - kbHeight - 32);

  const handleSubmit = async () => {
    if (!firstname.trim() || !lastname.trim() || !email.trim()) {
      appAlert('Required', 'Please fill in first name, last name, and email.');
      return;
    }
    try {
      await submit_application({
        firstname: firstname.trim(),
        lastname: lastname.trim(),
        email: email.trim(),
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        known_member: knownMember.trim() || undefined,
        reason: reason.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err: any) {
      appAlert('Error', err.message || 'Something went wrong');
    }
  };

  if (submitted) {
    return (
      <Modal transparent visible animationType="fade" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>x</Text>
            </Pressable>
            <Text style={styles.successText}>
              a current member will review ur request and you'll get a secret code to enter on the login screen
            </Text>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.dialog, { maxHeight: dialogMaxHeight }]}>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>x</Text>
          </Pressable>
          {/* Fields scroll; submit lives OUTSIDE the scroll, pinned to the
              dialog's bottom edge, so it can never be below the fold or under
              the keyboard. */}
          <ScrollView
            style={styles.form}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TextInput
              style={styles.input}
              value={firstname}
              onChangeText={setFirstname}
              placeholder="first name *"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              value={lastname}
              onChangeText={setLastname}
              placeholder="last name *"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="email *"
              placeholderTextColor={Colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              value={city}
              onChangeText={setCity}
              placeholder="city"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              value={state}
              onChangeText={setState}
              placeholder="state"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              value={knownMember}
              onChangeText={setKnownMember}
              placeholder="know a member?"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.input, styles.multiline]}
              value={reason}
              onChangeText={setReason}
              placeholder="why do you want to join?"
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={2}
              autoCapitalize="none"
            />
          </ScrollView>
          <Pressable style={styles.submitBtn} onPress={handleSubmit}>
            <Text style={styles.submitBtnText}>submit</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialog: {
    width: '85%',
    maxHeight: '80%',
    backgroundColor: Colors.mainBg,
    borderWidth: 1,
    borderColor: '#000',
    padding: 20,
    ...Shadows.card,
  },
  closeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
  },
  form: {
    marginTop: 20,
    flexShrink: 1,
  },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    paddingVertical: 8,
    marginBottom: 12,
  },
  multiline: {
    minHeight: 44,
    textAlignVertical: 'top',
  },
  submitBtn: {
    alignSelf: 'flex-end',
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 10,
    backgroundColor: Colors.greenBright,
  },
  submitBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
  },
  successText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 20,
    lineHeight: 24,
  },
});
