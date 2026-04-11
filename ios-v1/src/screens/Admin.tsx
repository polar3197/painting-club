import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { get_applications, update_application_status, ApplicationOut } from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';

function ApplicationRow({
  app,
  onUpdate,
}: {
  app: ApplicationOut;
  onUpdate: (id: string, status: string) => void;
}) {
  const statusBg =
    app.status === 'approved'
      ? 'lightgreen'
      : app.status === 'rejected'
      ? Colors.redCoral
      : Colors.primaryGold;

  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text style={styles.rowName}>
          {app.firstname} {app.lastname}
        </Text>
        <Text style={styles.rowEmail}>{app.email}</Text>
        {(app.city || app.state) && (
          <Text style={styles.rowMeta}>
            {[app.city, app.state].filter(Boolean).join(', ')}
          </Text>
        )}
        {!!app.known_member && (
          <Text style={styles.rowMeta}>knows: {app.known_member}</Text>
        )}
        {!!app.reason && (
          <Text style={[styles.rowMeta, { fontStyle: 'italic' }]}>{app.reason}</Text>
        )}
        <Text style={styles.rowDate}>
          {new Date(app.created_at).toLocaleDateString()}
        </Text>
      </View>
      <View style={styles.rowActions}>
        <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
          <Text style={styles.statusText}>{app.status}</Text>
        </View>
        {app.status === 'pending' && (
          <View style={styles.actionBtns}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: Colors.greenBright }]}
              onPress={() => onUpdate(app.id, 'approved')}
            >
              <Text style={styles.actionBtnText}>approve</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: Colors.redLight }]}
              onPress={() => onUpdate(app.id, 'rejected')}
            >
              <Text style={styles.actionBtnText}>reject</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

export default function Admin() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [applications, setApplications] = useState<ApplicationOut[]>([]);

  const fetchApps = () => {
    get_applications(token).then(setApplications).catch(() => {});
  };

  useEffect(() => {
    fetchApps();
  }, [token]);

  const handleUpdate = async (id: string, status: string) => {
    try {
      await update_application_status(id, status, token);
      fetchApps();
    } catch {
      // ignore
    }
  };

  const pending = applications.filter((a) => a.status === 'pending');
  const reviewed = applications.filter((a) => a.status !== 'pending');

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>applications</Text>

      <Text style={styles.sectionHeader}>pending</Text>
      {pending.length === 0 ? (
        <Text style={styles.emptyText}>no pending applications</Text>
      ) : (
        pending.map((a) => (
          <ApplicationRow key={a.id} app={a} onUpdate={handleUpdate} />
        ))
      )}

      <Text style={[styles.sectionHeader, { marginTop: 24 }]}>reviewed</Text>
      {reviewed.length === 0 ? (
        <Text style={styles.emptyText}>no reviewed applications</Text>
      ) : (
        reviewed.map((a) => (
          <ApplicationRow key={a.id} app={a} onUpdate={handleUpdate} />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
    fontWeight: '500',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 10,
    marginBottom: 20,
  },
  sectionHeader: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
    fontWeight: '600',
    marginBottom: 10,
  },
  emptyText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#000',
    padding: 14,
    paddingHorizontal: 16,
    backgroundColor: Colors.white,
    marginBottom: 8,
  },
  rowInfo: {
    flex: 1,
    marginRight: 10,
  },
  rowName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
  },
  rowEmail: {
    fontSize: FontSizes.xxs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  rowMeta: {
    fontSize: FontSizes.tiny,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  rowDate: {
    fontSize: FontSizes.tiny,
    color: Colors.textMuted,
    marginTop: 4,
  },
  rowActions: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
  },
  statusText: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  actionBtns: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  actionBtnText: {
    fontSize: FontSizes.tiny,
  },
});
