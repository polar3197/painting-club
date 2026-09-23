import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Paths, File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useAuth } from '../context/AuthContext';
import { appAlert } from '../components/AppAlert';
import ConfirmDialog from '../components/ConfirmDialog';
import DeleteAccountDialog from '../components/DeleteAccountDialog';
import { export_my_data } from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';

// Everything that acts on the account itself, in one place behind the kebab:
// logging out, taking your data with you, and deleting. Kept off the main
// settings list on purpose — two of these are hard to undo and one is
// impossible, so none of them should sit a single stray tap away.
//
// Deleting still goes through DeleteAccountDialog, which asks for the username
// back before it will proceed.
export default function AccountManagement() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { currentUser, currentRole, token, logout } = useAuth();

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Admins cannot self-delete: DELETE /members/me answers 403 for them, so
  // offering the button would only ever produce an error.
  const canDeleteAccount = !!currentUser && currentRole !== 'admin';

  const handleDownload = async () => {
    if (!token || downloading) return;
    setDownloading(true);
    try {
      const data = await export_my_data(token);
      const file = new File(Paths.cache, 'painting-club-export.json');
      if (file.exists) file.delete();
      file.create();
      file.write(JSON.stringify(data, null, 2));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: 'save your data',
          UTI: 'public.json',
        });
      }
    } catch (err: any) {
      appAlert('Download failed', err?.message || 'could not export your data');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <View style={styles.root}>
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

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>acc mgmt</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {navigation.canGoBack() && (
          <Pressable style={styles.backBtn} hitSlop={10} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnText}>‹ back</Text>
          </Pressable>
        )}

        <Pressable
          style={[styles.actionBtn, { backgroundColor: Colors.secondary }]}
          onPress={handleDownload}
        >
          {downloading ? (
            <ActivityIndicator color={Colors.black} />
          ) : (
            <Text style={styles.actionBtnText}>download your data</Text>
          )}
        </Pressable>

        <Pressable
          style={[styles.actionBtn, { backgroundColor: 'rgb(255, 215, 0)' }]}
          onPress={() => setShowLogoutConfirm(true)}
        >
          <Text style={styles.actionBtnText}>logout</Text>
        </Pressable>

        {canDeleteAccount && (
          <Pressable
            style={[styles.actionBtn, { backgroundColor: Colors.redLight }]}
            onPress={() => setShowDeleteDialog(true)}
          >
            <Text style={styles.actionBtnText}>delete account</Text>
          </Pressable>
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
  actionBtn: {
    borderWidth: 1,
    borderColor: '#000',
    padding: 14,
    marginBottom: 10,
    alignItems: 'center',
  },
  actionBtnText: { fontFamily: Fonts.serif, fontSize: FontSizes.base, color: Colors.black },
});
