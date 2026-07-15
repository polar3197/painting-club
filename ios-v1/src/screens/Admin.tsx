import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Platform, Alert } from 'react-native';
import { TextInput } from '../components/AppTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import {
  get_applications,
  get_password_resets,
  update_application_status,
  delete_application,
  ApplicationOut,
  PasswordResetOut,
  get_media_requests,
  update_media_request,
  MediaRequest,
  get_reports,
  update_report_status,
  ReportOut,
  get_admin_prompt_queue,
  review_prompt_suggestion,
  activate_suggestion,
  get_active_prompt,
  PromptSuggestionOut,
  PromptOut,
  get_admin_members,
  set_member_role,
  AdminMemberOut,
  MemberRole,
} from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import ConfirmDialog from '../components/ConfirmDialog';

function PromptSuggestionRow({
  s,
  onReview,
  onActivate,
}: {
  s: PromptSuggestionOut;
  onReview?: (id: string, status: 'approved' | 'rejected') => void;
  onActivate?: (id: string) => void;
}) {
  return (
    <View style={styles.promptRow}>
      <Text style={styles.promptText}>{s.prompt_text}</Text>
      <Text style={styles.promptMeta}>
        {s.media_name ?? 'any medium'}
        {s.username ? `  ·  @${s.username}` : ''}
      </Text>
      {onReview && (
        <View style={styles.promptBtns}>
          <Pressable
            style={[styles.promptBtn, { backgroundColor: 'lightgreen' }]}
            onPress={() => onReview(s.id, 'approved')}
          >
            <Text style={styles.promptBtnText}>approve</Text>
          </Pressable>
          <Pressable
            style={[styles.promptBtn, { backgroundColor: Colors.redCoral }]}
            onPress={() => onReview(s.id, 'rejected')}
          >
            <Text style={styles.promptBtnText}>reject</Text>
          </Pressable>
        </View>
      )}
      {onActivate && (
        <View style={styles.promptBtns}>
          <Pressable
            style={[styles.promptBtn, { backgroundColor: Colors.primaryGold }]}
            onPress={() => onActivate(s.id)}
          >
            <Text style={styles.promptBtnText}>make this week's</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const ROLE_TIERS: MemberRole[] = ['member', 'contributor', 'admin'];

function MemberRoleRow({
  m,
  onSetRole,
}: {
  m: AdminMemberOut;
  onSetRole: (username: string, role: MemberRole) => void;
}) {
  const name = [m.firstname, m.lastname].filter(Boolean).join(' ');
  return (
    <View style={styles.memberRow}>
      <Text style={styles.memberName}>
        @{m.username}
        {name ? `  ·  ${name}` : ''}
      </Text>
      <View style={styles.roleChips}>
        {ROLE_TIERS.map((r) => (
          <Pressable
            key={r}
            style={[styles.roleChip, m.role === r && styles.roleChipOn]}
            onPress={() => m.role !== r && onSetRole(m.username, r)}
          >
            <Text style={[styles.roleChipText, m.role === r && styles.roleChipTextOn]}>
              {r}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

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
  // The requester now picks the type, so the admin just confirms. Entering
  // `confirming` reveals an editable name (admin may rename before approving).
  const [confirming, setConfirming] = useState(false);
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

  // Requester's chosen type (pending), or the type it was approved with (resolved).
  const typeLabel = req.resolved_type ?? req.requested_type;

  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        {confirming ? (
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
        {typeLabel && (
          <Text style={styles.rowMeta}>type: {typeLabel}</Text>
        )}
        <Text style={styles.rowDate}>
          {new Date(req.created_at).toLocaleDateString()}
        </Text>
      </View>
      <View style={styles.rowActions}>
        <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
          <Text style={styles.statusText}>{req.status}</Text>
        </View>
        {req.status === 'pending' && !confirming && (
          <View style={styles.actionBtns}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: Colors.greenBright }]}
              onPress={() => setConfirming(true)}
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
        {req.status === 'pending' && confirming && req.requested_type && (
          <View style={styles.actionBtns}>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: Colors.greenBright }]}
              onPress={() => onResolve(req.id, 'approved', null, finalName())}
            >
              <Text style={styles.actionBtnText}>confirm {req.requested_type}</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, { backgroundColor: Colors.white }]}
              onPress={() => setConfirming(false)}
            >
              <Text style={styles.actionBtnText}>cancel</Text>
            </Pressable>
          </View>
        )}
        {/* Legacy fallback: requests submitted before requesters picked their
            own type carry no requested_type, so the admin classifies them. */}
        {req.status === 'pending' && confirming && !req.requested_type && (
          <View style={styles.actionBtns}>
            {(['visual_2d', 'written_form', 'audio'] as const).map((t) => (
              <Pressable
                key={t}
                style={[styles.actionBtn, { backgroundColor: Colors.primaryGold }]}
                onPress={() => onResolve(req.id, 'approved', t, finalName())}
              >
                <Text style={styles.actionBtnText}>{t}</Text>
              </Pressable>
            ))}
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
  // Each admin section is reached from the admin's Settings menu, which passes
  // the section as `initialTab`. The old members tab is gone (role management
  // now lives in the contributor "user roles" page).
  const route = useRoute<any>();
  type AdminSection = 'applications' | 'media-requests' | 'reports' | 'prompts';
  const initialTab: AdminSection = route.params?.initialTab || 'applications';
  const [tab] = useState<AdminSection>(initialTab);
  const [applications, setApplications] = useState<ApplicationOut[]>([]);
  const [resets, setResets] = useState<PasswordResetOut[]>([]);
  const [mediaRequests, setMediaRequests] = useState<MediaRequest[]>([]);
  const [reports, setReports] = useState<ReportOut[]>([]);
  const [proposed, setProposed] = useState<PromptSuggestionOut[]>([]);
  const [upNext, setUpNext] = useState<PromptSuggestionOut[]>([]);
  const [activePrompt, setActivePrompt] = useState<PromptOut | null>(null);

  const fetchApps = () => {
    get_applications(token).then(setApplications).catch(() => {});
    get_password_resets(token).then(setResets).catch(() => {});
  };

  const fetchRequests = () => {
    get_media_requests(token).then(setMediaRequests).catch(() => {});
  };

  const fetchReports = () => {
    get_reports(token).then(setReports).catch(() => {});
  };

  const fetchPrompts = () => {
    get_admin_prompt_queue(token)
      .then((q) => {
        setProposed(q.proposed);
        setUpNext(q.up_next);
      })
      .catch(() => {});
    get_active_prompt(token).then(setActivePrompt).catch(() => {});
  };

  const handleActivateSuggestion = async (id: string) => {
    try {
      await activate_suggestion(id, token);
      fetchPrompts();
    } catch (err: any) {
      Alert.alert("Couldn't activate", err?.message || 'try again.');
    }
  };

  useEffect(() => {
    fetchApps();
    fetchRequests();
    fetchReports();
    fetchPrompts();
  }, [token]);


  const handleReviewPrompt = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await review_prompt_suggestion(id, status, token);
      fetchPrompts();
    } catch (err: any) {
      Alert.alert("Couldn't update", err?.message || 'try again.');
    }
  };

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
    } catch (err: any) {
      // Surface the failure instead of swallowing it — e.g. approving a
      // re-submitted application whose email already belongs to a member.
      Alert.alert(
        status === 'approved' ? "Couldn't approve" : "Couldn't update",
        err?.message || 'Something went wrong — try again.',
      );
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
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      // Reveal the inline media-request rename field above the keyboard even
      // when the list is short (nothing below to scroll into otherwise).
      automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>
          {tab === 'media-requests' ? 'media requests' : tab}
        </Text>
      </View>

      {tab === 'prompts' ? (
        <>
          <Text style={styles.sectionHeader}>this week's prompt</Text>
          {activePrompt ? (
            <View style={styles.activePromptRow}>
              <Text style={styles.promptText}>{activePrompt.title}</Text>
              <Text style={styles.promptMeta}>{activePrompt.media_name ?? 'any medium'}</Text>
            </View>
          ) : (
            <Text style={styles.emptyText}>no active prompt</Text>
          )}

          <Text style={[styles.sectionHeader, { marginTop: 24 }]}>up next</Text>
          <Text style={styles.hintText}>activate one to make it this week's (archives the current).</Text>
          {upNext.length === 0 ? (
            <Text style={styles.emptyText}>nothing approved yet</Text>
          ) : (
            upNext.map((s) => (
              <PromptSuggestionRow key={s.id} s={s} onActivate={handleActivateSuggestion} />
            ))
          )}

          <Text style={[styles.sectionHeader, { marginTop: 24 }]}>proposed</Text>
          {proposed.length === 0 ? (
            <Text style={styles.emptyText}>no proposed prompts</Text>
          ) : (
            proposed.map((s) => (
              <PromptSuggestionRow key={s.id} s={s} onReview={handleReviewPrompt} />
            ))
          )}
        </>
      ) : tab === 'reports' ? (
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
          {resets.length > 0 && (
            <>
              <Text style={styles.sectionHeader}>password resets</Text>
              {resets.map((r) => (
                <View key={r.username} style={styles.resetRow}>
                  <Text style={styles.resetName}>
                    {r.username}
                    {r.firstname ? `  (${r.firstname} ${r.lastname ?? ''})` : ''}
                  </Text>
                  {!!r.email && <Text style={styles.resetMeta}>{r.email}</Text>}
                  <Text style={styles.resetMeta}>send them this code (expires in 24h):</Text>
                  <Text selectable style={styles.resetCode}>{r.code}</Text>
                </View>
              ))}
            </>
          )}
          <Text style={[styles.sectionHeader, resets.length > 0 && { marginTop: 24 }]}>pending</Text>
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
  resetRow: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    padding: 12,
    marginBottom: 8,
    gap: 2,
  },
  resetName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    fontWeight: '600',
  },
  resetMeta: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xxs,
    color: Colors.textSecondary,
  },
  resetCode: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.md,
    letterSpacing: 1,
    marginTop: 4,
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
  promptRow: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    padding: 12,
    marginBottom: 8,
    gap: 6,
  },
  activePromptRow: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.greenBright,
    padding: 12,
    marginBottom: 8,
    gap: 6,
  },
  hintText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  promptText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
  },
  promptMeta: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  promptBtns: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  promptBtn: {
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  promptBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
  },
  memberRow: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  memberName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
  },
  roleChips: {
    flexDirection: 'row',
    gap: 8,
  },
  roleChip: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  roleChipOn: {
    backgroundColor: Colors.primaryGold,
  },
  roleChipText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
  roleChipTextOn: {
    color: '#000',
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
