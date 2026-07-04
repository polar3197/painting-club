import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { TextInput } from '../components/AppTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import {
  get_applications,
  update_application_status,
  delete_application,
  ApplicationOut,
  get_media_requests,
  update_media_request,
  MediaRequest,
  get_reports,
  update_report_status,
  ReportOut,
} from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import ConfirmDialog from '../components/ConfirmDialog';

function ApplicationRow({
  app,
  onUpdate,
  onDelete,
}: {
  app: ApplicationOut;
  onUpdate: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const statusBg =
    app.status === 'approved'
      ? 'lightgreen'
      : app.status === 'rejected'
      ? Colors.redCoral
      : Colors.primaryGold;

  return (
    <View style={styles.row}>
      <ConfirmDialog
        visible={confirmDelete}
        title="u sure?"
        confirmLabel="yes"
        cancelLabel="no. shit. stop"
        confirmColor={Colors.redLight}
        cancelColor={Colors.greenBright}
        confirmTextColor={Colors.black}
        cancelTextColor={Colors.black}
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete(app.id);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
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
        {app.status === 'pending_setup' && app.temp_password && (
          <View style={styles.tempCreds}>
            <Text style={styles.tempCredsLabel}>setup code:</Text>
            <Text style={styles.tempCredsValue} selectable>
              {app.temp_password}
            </Text>
          </View>
        )}
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
        <Pressable
          style={[styles.actionBtn, styles.deleteBtn]}
          onPress={() => setConfirmDelete(true)}
        >
          <Text style={styles.actionBtnText}>delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MediaRequestRow({
  req,
  onResolve,
}: {
  req: MediaRequest;
  onResolve: (id: string, status: 'approved' | 'rejected', type: string | null, name: string | null) => void;
}) {
  const [pickingType, setPickingType] = useState(false);
  const [editName, setEditName] = useState(req.requested_name);
  const statusBg =
    req.status === 'approved'
      ? 'lightgreen'
      : req.status === 'rejected'
      ? Colors.redCoral
      : Colors.primaryGold;

  const finalName = () => {
    const n = editName.trim();
    return n && n !== req.requested_name ? n : null;
  };

  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        {pickingType ? (
          <TextInput
            style={styles.rowEditInput}
            value={editName}
            onChangeText={setEditName}
            autoCapitalize="none"
          />
        ) : (
          <Text style={styles.rowName}>{req.requested_name}</Text>
        )}
        <Text style={styles.rowEmail}>@{req.username}</Text>
        {req.resolved_type && (
          <Text style={styles.rowMeta}>type: {req.resolved_type}</Text>
        )}
        <Text style={styles.rowDate}>
          {new Date(req.created_at).toLocaleDateString()}
        </Text>
      </View>
      <View style={styles.rowActions}>
        <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
          <Text style={styles.statusText}>{req.status}</Text>
        </View>
        {req.status === 'pending' && !pickingType && (
          <View style={styles.actionBtns}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: Colors.greenBright }]}
              onPress={() => setPickingType(true)}
            >
              <Text style={styles.actionBtnText}>approve</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: Colors.redLight }]}
              onPress={() => onResolve(req.id, 'rejected', null, null)}
            >
              <Text style={styles.actionBtnText}>reject</Text>
            </Pressable>
          </View>
        )}
        {req.status === 'pending' && pickingType && (
          <View style={styles.actionBtns}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: Colors.primaryGold }]}
              onPress={() => onResolve(req.id, 'approved', 'visual_2d', finalName())}
            >
              <Text style={styles.actionBtnText}>visual_2d</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: Colors.primaryGold }]}
              onPress={() => onResolve(req.id, 'approved', 'written_word', finalName())}
            >
              <Text style={styles.actionBtnText}>written_word</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: Colors.primaryGold }]}
              onPress={() => onResolve(req.id, 'approved', 'audio', finalName())}
            >
              <Text style={styles.actionBtnText}>audio</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

function ReportRow({
  report,
  onResolve,
}: {
  report: ReportOut;
  onResolve: (id: string, status: 'resolved' | 'dismissed') => void;
}) {
  const statusBg =
    report.status === 'resolved'
      ? 'lightgreen'
      : report.status === 'dismissed'
      ? Colors.redCoral
      : Colors.primaryGold;

  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text style={styles.rowName}>
          {report.target_type}: {report.target_preview ?? '(target removed)'}
        </Text>
        <Text style={styles.rowEmail}>by @{report.reporter_username}</Text>
        {!!report.reason && (
          <Text style={[styles.rowMeta, { fontStyle: 'italic' }]}>{report.reason}</Text>
        )}
        <Text style={styles.rowDate}>
          {new Date(report.created_at).toLocaleDateString()}
        </Text>
      </View>
      <View style={styles.rowActions}>
        <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
          <Text style={styles.statusText}>{report.status}</Text>
        </View>
        {report.status === 'pending' && (
          <View style={styles.actionBtns}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: Colors.greenBright }]}
              onPress={() => onResolve(report.id, 'resolved')}
            >
              <Text style={styles.actionBtnText}>resolve</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: Colors.redLight }]}
              onPress={() => onResolve(report.id, 'dismissed')}
            >
              <Text style={styles.actionBtnText}>dismiss</Text>
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
  const [tab, setTab] = useState<'applications' | 'media-requests' | 'reports'>('applications');
  const [applications, setApplications] = useState<ApplicationOut[]>([]);
  const [mediaRequests, setMediaRequests] = useState<MediaRequest[]>([]);
  const [reports, setReports] = useState<ReportOut[]>([]);

  const fetchApps = () => {
    get_applications(token).then(setApplications).catch(() => {});
  };

  const fetchRequests = () => {
    get_media_requests(token).then(setMediaRequests).catch(() => {});
  };

  const fetchReports = () => {
    get_reports(token).then(setReports).catch(() => {});
  };

  useEffect(() => {
    fetchApps();
    fetchRequests();
    fetchReports();
  }, [token]);

  const handleResolveReport = async (id: string, status: 'resolved' | 'dismissed') => {
    try {
      await update_report_status(id, status, token);
      fetchReports();
    } catch {
      // ignore
    }
  };

  const handleUpdate = async (id: string, status: string) => {
    try {
      await update_application_status(id, status, token);
      fetchApps();
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: string) => {
    setApplications((apps) => apps.filter((a) => a.id !== id));
    try {
      await delete_application(id, token);
    } catch {
      fetchApps();
    }
  };

  const handleResolveRequest = async (
    id: string,
    status: 'approved' | 'rejected',
    type: string | null,
    name: string | null = null,
  ) => {
    try {
      await update_media_request(id, status, type, token, name);
      fetchRequests();
    } catch {
      // ignore
    }
  };

  const pending = applications.filter((a) => a.status === 'pending');
  const reviewed = applications.filter((a) => a.status !== 'pending');
  const pendingRequests = mediaRequests.filter((r) => r.status === 'pending');
  const reviewedRequests = mediaRequests.filter((r) => r.status !== 'pending');
  const pendingReports = reports.filter((r) => r.status === 'pending');
  const reviewedReports = reports.filter((r) => r.status !== 'pending');

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.titleRow}>
        <Pressable onPress={() => setTab('applications')}>
          <Text style={[styles.title, tab !== 'applications' && styles.titleInactive]}>
            applications
          </Text>
        </Pressable>
        <Pressable onPress={() => setTab('media-requests')}>
          <Text style={[styles.title, tab !== 'media-requests' && styles.titleInactive]}>
            media requests
          </Text>
        </Pressable>
        <Pressable onPress={() => setTab('reports')}>
          <Text style={[styles.title, tab !== 'reports' && styles.titleInactive]}>
            reports
          </Text>
        </Pressable>
      </View>

      {tab === 'reports' ? (
        <>
          <Text style={styles.sectionHeader}>pending</Text>
          {pendingReports.length === 0 ? (
            <Text style={styles.emptyText}>no pending reports</Text>
          ) : (
            pendingReports.map((r) => (
              <ReportRow key={r.id} report={r} onResolve={handleResolveReport} />
            ))
          )}

          <Text style={[styles.sectionHeader, { marginTop: 24 }]}>reviewed</Text>
          {reviewedReports.length === 0 ? (
            <Text style={styles.emptyText}>no reviewed reports</Text>
          ) : (
            reviewedReports.map((r) => (
              <ReportRow key={r.id} report={r} onResolve={handleResolveReport} />
            ))
          )}
        </>
      ) : tab === 'applications' ? (
        <>
          <Text style={styles.sectionHeader}>pending</Text>
          {pending.length === 0 ? (
            <Text style={styles.emptyText}>no pending applications</Text>
          ) : (
            pending.map((a) => (
              <ApplicationRow key={a.id} app={a} onUpdate={handleUpdate} onDelete={handleDelete} />
            ))
          )}

          <Text style={[styles.sectionHeader, { marginTop: 24 }]}>reviewed</Text>
          {reviewed.length === 0 ? (
            <Text style={styles.emptyText}>no reviewed applications</Text>
          ) : (
            reviewed.map((a) => (
              <ApplicationRow key={a.id} app={a} onUpdate={handleUpdate} onDelete={handleDelete} />
            ))
          )}
        </>
      ) : (
        <>
          <Text style={styles.sectionHeader}>pending</Text>
          {pendingRequests.length === 0 ? (
            <Text style={styles.emptyText}>no pending requests</Text>
          ) : (
            pendingRequests.map((r) => (
              <MediaRequestRow key={r.id} req={r} onResolve={handleResolveRequest} />
            ))
          )}

          <Text style={[styles.sectionHeader, { marginTop: 24 }]}>reviewed</Text>
          {reviewedRequests.length === 0 ? (
            <Text style={styles.emptyText}>no reviewed requests</Text>
          ) : (
            reviewedRequests.map((r) => (
              <MediaRequestRow key={r.id} req={r} onResolve={handleResolveRequest} />
            ))
          )}
        </>
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
  titleRow: {
    flexDirection: 'row',
    gap: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 10,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
    fontWeight: '500',
  },
  titleInactive: {
    opacity: 0.4,
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
  rowEditInput: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingVertical: 2,
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
    flexWrap: 'wrap',
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
  deleteBtn: {
    backgroundColor: Colors.redCoral,
    marginTop: 6,
    alignSelf: 'flex-end',
  },
  tempCreds: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    backgroundColor: Colors.secondary,
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  tempCredsLabel: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.textSecondary,
    marginRight: 6,
  },
  tempCredsValue: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textPrimary,
  },
});
