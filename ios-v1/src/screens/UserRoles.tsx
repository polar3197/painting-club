import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { TextInput } from '../components/AppTextInput';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { AdminMemberOut, get_admin_members } from '../api';

// Role-management surface (contributor-only). Lists every member with their
// role; search + tap opens a per-member screen to set the role. Reached from
// Settings ("user roles").
export default function UserRoles() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { token } = useAuth();
  const [members, setMembers] = useState<AdminMemberOut[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setMembers(await get_admin_members(token));
    } catch {
      // keep what's on screen; pull-to-refresh retries
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Refetch on focus so a role change on the detail screen shows on return.
  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const q = search.trim().toLowerCase();
  const filtered = q
    ? members.filter((m) =>
        `${m.firstname || ''} ${m.lastname || ''} ${m.username}`.toLowerCase().includes(q),
      )
    : members;

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={Colors.darkerGold} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.title}>user roles</Text>
      <TextInput
        style={styles.search}
        value={search}
        onChangeText={setSearch}
        placeholder="search members"
        placeholderTextColor={Colors.textMuted}
        autoCapitalize="none"
      />

      <ScrollView
        style={styles.list}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filtered.length === 0 ? (
          <Text style={styles.empty}>no members match.</Text>
        ) : (
          filtered.map((m) => (
            <Pressable
              key={m.username}
              style={styles.row}
              onPress={() => navigation.navigate('UserRoleDetail', { username: m.username })}
            >
              <View style={styles.rowMain}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {m.firstname || m.lastname
                    ? `${m.firstname || ''} ${m.lastname || ''}`.trim()
                    : m.username}
                </Text>
                <Text style={styles.rowUser}>@{m.username}</Text>
              </View>
              <RoleBadge role={m.role} />
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const bg =
    role === 'contributor' ? Colors.purpleDocs : role === 'admin' ? Colors.primaryGold : Colors.secondary;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={styles.badgeText}>{role}</Text>
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
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 10,
  },
  search: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    marginTop: 14,
    marginBottom: 12,
  },
  list: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.artCardBg,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  rowMain: {
    flex: 1,
    marginRight: 10,
  },
  rowName: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
  rowUser: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  badge: {
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.micro,
    color: Colors.black,
  },
  empty: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textMuted,
    marginTop: 16,
  },
});
