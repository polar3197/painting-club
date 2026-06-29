import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';
import DeleteAccountDialog from '../components/DeleteAccountDialog';
import { Colors, Fonts, FontSizes } from '../constants/theme';

// Reached from the gear button on one's own profile. Holds the account actions
// that used to live on the (now-removed) "more" tab: admin, delete account,
// logout.
export default function Settings() {
  const { logout, currentUser, currentRole } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <ConfirmDialog
        visible={showLogoutConfirm}
        title="u sure?"
        confirmLabel="yes"
        cancelLabel="no. shit. stop"
        confirmColor={Colors.redLight}
        cancelColor={Colors.greenBright}
        confirmTextColor={Colors.black}
        cancelTextColor={Colors.black}
        onConfirm={async () => {
          setShowLogoutConfirm(false);
          await logout();
          navigation.navigate('LandingPage');
        }}
        onCancel={() => setShowLogoutConfirm(false)}
      />
      <DeleteAccountDialog
        visible={showDeleteDialog}
        username={currentUser ?? ''}
        onClose={() => setShowDeleteDialog(false)}
        onDeleted={async () => {
          setShowDeleteDialog(false);
          await logout();
          navigation.navigate('LandingPage');
        }}
      />

      <Text style={styles.title}>settings</Text>

      {/* Delete account stays up top — intentionally out of the thumb zone so
          the destructive action takes deliberate reach. */}
      {currentUser && currentRole !== 'admin' && (
        <Pressable style={styles.deleteBtn} onPress={() => setShowDeleteDialog(true)}>
          <Text style={styles.deleteBtnText}>delete acc</Text>
        </Pressable>
      )}

      {/* Spacer pushes the everyday actions down to the thumb zone. */}
      <View style={{ flex: 1 }} />

      {currentRole === 'admin' && (
        <Pressable
          style={[styles.actionBtn, { backgroundColor: Colors.primaryGold }]}
          onPress={() => navigation.navigate('Admin')}
        >
          <Text style={styles.actionBtnText}>admin</Text>
        </Pressable>
      )}

      <Pressable
        style={[styles.actionBtn, { backgroundColor: 'rgb(255, 215, 0)', marginBottom: insets.bottom + 20 }]}
        onPress={() => setShowLogoutConfirm(true)}
      >
        <Text style={styles.actionBtnText}>logout</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
    paddingHorizontal: 30,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 10,
  },
  deleteBtn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: Colors.redCoral,
    width: '33%',
    alignSelf: 'flex-start',
  },
  deleteBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.black,
    textAlign: 'center',
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: '#000',
    padding: 14,
    marginBottom: 10,
  },
  actionBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
});
