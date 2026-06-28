import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
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

  const handleSubmit = async () => {
    if (!firstname.trim() || !lastname.trim() || !email.trim()) {
      Alert.alert('Required', 'Please fill in first name, last name, and email.');
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
      Alert.alert('Error', err.message || 'Something went wrong');
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
        <View style={styles.dialog}>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>x</Text>
          </Pressable>
          {/* Submit lives inside the scroll area so it rides above the keyboard
              with the rest of the form — outside, the keyboard would cover it. */}
          <ScrollView
            style={styles.form}
            contentContainerStyle={styles.formContent}
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
              numberOfLines={4}
              autoCapitalize="none"
            />
            <Pressable style={styles.submitBtn} onPress={handleSubmit}>
              <Text style={styles.submitBtnText}>submit</Text>
            </Pressable>
          </ScrollView>
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
  },
  formContent: {
    paddingBottom: 8,
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
    minHeight: 80,
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
