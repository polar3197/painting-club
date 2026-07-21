import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { appAlert } from '../components/AppAlert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { Profile, MemberRole, get_profile, set_member_role, profilePicSource } from '../api';

const ROLES: MemberRole[] = ['member', 'admin', 'contributor'];

const ROLE_BLURB: Record<MemberRole, string> = {
  member: 'standard access',
  admin: 'admin tools',
  contributor: 'admin + docs, announcements & role management',
};

// Set one member's role (contributor-only). Shows their pic/name/username and a
// role selector; save writes via PATCH /admin/members/{username}/role.
export default function UserRoleDetail() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { token } = useAuth();
  const username: string = route.params.username;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<MemberRole>('member');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await get_profile(username, token);
        if (!alive) return;
        setProfile(p);
        setRole((p.role as MemberRole) || 'member');
      } catch (err: any) {
        appAlert('could not load member', err?.message || 'try again');
        navigation.goBack();
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [username, token, navigation]);

  const save = async () => {
    if (saving || !profile) return;
    if (role === (profile.role as MemberRole)) {
      navigation.goBack();
      return;
    }
    setSaving(true);
    try {
      await set_member_role(username, role, token);
      navigation.goBack();
    } catch (err: any) {
      appAlert('could not set role', err?.message || 'try again');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !profile) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={Colors.darkerGold} />
      </View>
    );
  }

  const pic = profilePicSource(profile);
  const name =
    profile.firstname || profile.lastname
      ? `${profile.firstname || ''} ${profile.lastname || ''}`.trim()
      : profile.username;
  const dirty = role !== (profile.role as MemberRole);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <View style={styles.head}>
        {pic ? (
          <Image source={pic} style={styles.pic} />
        ) : (
          <View style={[styles.pic, styles.picBlank]}>
            <Text style={styles.picInitial}>{(name[0] || '?').toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.user}>@{profile.username}</Text>
      </View>

      <Text style={styles.label}>role</Text>
      <View style={styles.roleCol}>
        {ROLES.map((r) => {
          const on = role === r;
          return (
            <Pressable
              key={r}
              style={[styles.roleRow, on && styles.roleRowOn]}
              onPress={() => setRole(r)}
            >
              <View style={[styles.radio, on && styles.radioOn]} />
              <View style={styles.roleText}>
                <Text style={[styles.roleName, on && styles.roleNameOn]}>{r}</Text>
                <Text style={styles.roleBlurb}>{ROLE_BLURB[r]}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        style={[styles.saveBtn, (!dirty || saving) && styles.saveBtnDisabled]}
        onPress={save}
        disabled={!dirty || saving}
      >
        <Text style={styles.saveBtnText}>{saving ? 'saving…' : dirty ? 'save role' : 'no change'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
    paddingHorizontal: 24,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  head: {
    alignItems: 'center',
    marginBottom: 28,
  },
  pic: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: '#000',
  },
  picBlank: {
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  picInitial: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xxl,
    color: Colors.textSecondary,
  },
  name: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    color: Colors.black,
    marginTop: 14,
  },
  user: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  label: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  roleCol: {
    gap: 10,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  roleRowOn: {
    backgroundColor: Colors.secondary,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
  },
  radioOn: {
    backgroundColor: Colors.black,
  },
  roleText: {
    flex: 1,
  },
  roleName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
  roleNameOn: {
    fontWeight: '700',
  },
  roleBlurb: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.micro,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  saveBtn: {
    marginTop: 32,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.primaryGold,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.55,
  },
  saveBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
});
