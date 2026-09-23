import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useAdminPending } from '../hooks';
import ContextPopup from '../components/ContextPopup';
import FeaturedArtistPicker from '../components/FeaturedArtistPicker';
import { appAlert } from '../components/AppAlert';
import { Colors, Fonts, FontSizes } from '../constants/theme';

// Reached from the gear button on one's own profile. Holds the account actions
// that used to live on the (now-removed) "more" tab: admin, delete account,
// logout.
export default function Settings() {
  const { currentUser, currentRole } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [moreAnchor, setMoreAnchor] = useState<{ x: number; y: number } | null>(null);
  // Red dot per admin row with pending work (and the gear dot upstream).
  const adminPending = useAdminPending();


  return (
    <View style={styles.root}>
    {/* Fixed above the scroll, not floating over it: the title bar carries the
        kebab (everything destructive lives behind it), and back sits beneath
        the rule on the left. Replaces the old back button that used to sit in
        the bottom-left thumb zone. */}
    <View style={[styles.headerBlock, { paddingTop: insets.top + 8 }]}>
      {/* The header bar itself: the page title, the kebab on the right, and
          the rule underneath. */}
      <View style={styles.headerRow}>
        <Text style={styles.title}>settings</Text>
        {/* Not gated: acc mgmt holds logout and the data download too, which
            every member needs — only DELETING is role-limited, and that check
            lives on the screen itself. */}
        {!!currentUser && (
          <Pressable
            style={styles.moreBtn}
            hitSlop={10}
            onPress={(e) => setMoreAnchor({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY })}
          >
            <Text style={styles.moreBtnText}>⋯</Text>
          </Pressable>
        )}
      </View>
    </View>

    {/* Two steps to reach anything destructive: the kebab offers "more", and
        deleting lives inside that sheet rather than one tap from the header. */}
    <ContextPopup visible={moreAnchor !== null} anchor={moreAnchor} onClose={() => setMoreAnchor(null)}>
      <Pressable
        style={({ pressed }) => [styles.popupItem, pressed && { backgroundColor: Colors.secondary }]}
        onPress={() => {
          setMoreAnchor(null);
          navigation.navigate('AccountManagement');
        }}
      >
        <Text style={styles.popupText}>acc mgmt</Text>
      </Pressable>
    </ContextPopup>

    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.container, { paddingTop: 12, paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Scrolls with the page rather than pinned under the header: only the
          title bar stays fixed. */}
      {navigation.canGoBack() && (
        <Pressable style={styles.backBtn} hitSlop={10} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>‹ back</Text>
        </Pressable>
      )}
      <FeaturedArtistPicker
        visible={showHighlightPicker}
        onClose={() => setShowHighlightPicker(false)}
        onConfirmed={(u) => appAlert('Highlighted artist set', `@${u} now shows on the home page.`)}
      />

      {/* Contributor menu: contributor is the top tier (= admin + docs / roles /
          announcements), so these are contributor-only — admins are below and
          don't see them. */}
      <Text style={styles.sectionTitle}>account</Text>
      <Pressable
        style={[styles.actionBtn, { backgroundColor: Colors.secondary }]}
        onPress={() => navigation.navigate('NotificationSettings')}
      >
        <Text style={styles.actionBtnText}>notifications</Text>
      </Pressable>
      {(currentRole === 'admin' || currentRole === 'contributor') && (
        <>
          <Text style={styles.sectionTitle}>admin</Text>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: Colors.primaryGold }]}
            onPress={() => navigation.navigate('Admin', { initialTab: 'applications' })}
          >
            <Text style={styles.actionBtnText}>applications</Text>
            {adminPending.applications > 0 && (
              <View style={styles.pendingBadgeWrap} pointerEvents="none">
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>{adminPending.applications}</Text>
                </View>
              </View>
            )}
          </Pressable>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: Colors.primaryGold }]}
            onPress={() => navigation.navigate('Admin', { initialTab: 'media-requests' })}
          >
            <Text style={styles.actionBtnText}>media requests</Text>
            {adminPending.media > 0 && (
              <View style={styles.pendingBadgeWrap} pointerEvents="none">
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>{adminPending.media}</Text>
                </View>
              </View>
            )}
          </Pressable>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: Colors.primaryGold }]}
            onPress={() => navigation.navigate('Admin', { initialTab: 'reports' })}
          >
            <Text style={styles.actionBtnText}>reports</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: Colors.primaryGold }]}
            onPress={() => navigation.navigate('Admin', { initialTab: 'prompts' })}
          >
            <Text style={styles.actionBtnText}>prompts</Text>
            {adminPending.prompts > 0 && (
              <View style={styles.pendingBadgeWrap} pointerEvents="none">
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>{adminPending.prompts}</Text>
                </View>
              </View>
            )}
          </Pressable>
        </>
      )}

      {currentRole === 'contributor' && (
        <>
          <Text style={styles.sectionTitle}>contributor</Text>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: Colors.purpleDocs }]}
            onPress={() => setShowHighlightPicker(true)}
          >
            <Text style={styles.actionBtnText}>set highlighted artist</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: Colors.purpleDocs }]}
            onPress={() => navigation.navigate('SignupQrCodes')}
          >
            <Text style={styles.actionBtnText}>QR codes</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: Colors.purpleDocs }]}
            onPress={() => navigation.navigate('Contributor')}
          >
            <Text style={styles.actionBtnText}>announcements</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: Colors.purpleDocs }]}
            onPress={() => navigation.navigate('UserRoles')}
          >
            <Text style={styles.actionBtnText}>user roles</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: Colors.purpleDocs }]}
            onPress={() => navigation.navigate('UserStats')}
          >
            <Text style={styles.actionBtnText}>user stats</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: Colors.purpleDocs }]}
            onPress={() => navigation.navigate('InfraStats')}
          >
            <Text style={styles.actionBtnText}>infra stats</Text>
          </Pressable>
        </>
      )}

    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Role section headings, as on the web settings page (Georgia 16, grey).
  sectionTitle: {
    fontFamily: Fonts.serif,
    fontSize: 16,
    color: 'rgb(100, 100, 100)',
    marginTop: 16,
    marginBottom: 6,
  },
  scroll: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  root: { flex: 1, backgroundColor: Colors.mainBg },
  headerBlock: {
    paddingHorizontal: 30,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 10,
    marginBottom: 12,
  },
  moreBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  moreBtnText: { fontFamily: Fonts.mono, fontSize: FontSizes.lg, color: Colors.black },
  popupItem: { paddingHorizontal: 14, paddingVertical: 10 },
  popupText: { fontFamily: Fonts.serif, fontSize: FontSizes.base, color: Colors.black },
  container: {
    flexGrow: 1,
    paddingHorizontal: 30,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
    // The rule now spans the whole bar (title + kebab), so it lives on the row
    // rather than on the text, and the gap below it is the back button's.
    flex: 1,
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: '#000',
    padding: 14,
    marginBottom: 10,
  },
  navPrefCaption: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginBottom: 3,
  },
  navPrefRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  navPrefBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#000',
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: Colors.mainBg,
  },
  navPrefBtnActive: {
    backgroundColor: Colors.accentGolden,
  },
  navPrefBtnText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.black,
  },
  // Full-height right-edge anchor so the count badge centers vertically in
  // the row regardless of the row's padding.
  pendingBadgeWrap: {
    position: 'absolute',
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  pendingBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.redBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBadgeText: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  actionBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
  // Bottom-left back button — under half the screen width, in the thumb zone.
  // The same treatment as the other settings buttons (black border, cream,
  // serif label) at a smaller size, hugging its label instead of spanning the
  // column. Sticky below the header rather than scrolling with the content.
  backBtn: {
    alignSelf: 'flex-start',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  backBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.black,
  },
});
