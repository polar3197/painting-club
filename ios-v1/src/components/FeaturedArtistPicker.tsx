import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, Pressable, StyleSheet, TextInput, FlatList, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useAuth } from '../context/AuthContext';
import {
  get_members, profileThumbSource, picVersion, resolveImageUrl, Profile,
} from '../api';
import { setFeaturedArtist } from '../api/featured';
import { Colors, Fonts, FontSizes } from '../constants/theme';

// Contributor dialog to choose the home-page highlighted artist: a search bar
// over the member roster, tappable rows, and a confirm button. Persists via
// setFeaturedArtist (device-local for now — see api/featured).
export default function FeaturedArtistPicker({
  visible, onClose, onConfirmed,
}: { visible: boolean; onClose: () => void; onConfirmed?: (username: string) => void }) {
  const { token } = useAuth();
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) { setQuery(''); setSelected(null); return; }
    let alive = true;
    setLoading(true);
    get_members('', '', token)
      .then((ms) => { if (alive) setMembers(ms); })
      .catch(() => { if (alive) setMembers([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [visible, token]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const name = `${m.firstname ?? ''} ${m.lastname ?? ''}`.toLowerCase();
      return m.username.toLowerCase().includes(q) || name.includes(q);
    });
  }, [members, query]);

  async function confirm() {
    if (!selected) return;
    setSaving(true);
    try {
      await setFeaturedArtist(selected, token);
      onConfirmed?.(selected);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.header}>highlighted artist</Text>

          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="search members"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.listWrap}>
            {loading ? (
              <ActivityIndicator color={Colors.black} style={{ marginTop: 24 }} />
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(m) => m.id}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={<Text style={styles.empty}>no members found</Text>}
                renderItem={({ item }) => {
                  const isSel = selected === item.username;
                  const src = item.profile_pic_path
                    ? profileThumbSource(item.id, picVersion(item))
                    : { uri: resolveImageUrl(`/imgs/${item.id}.png`) };
                  const name = `${item.firstname ?? ''} ${item.lastname ?? ''}`.trim();
                  return (
                    <Pressable
                      style={[styles.row, isSel && styles.rowSel]}
                      onPress={() => setSelected(item.username)}
                    >
                      <Image source={src} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" />
                      <View style={styles.rowText}>
                        <Text style={styles.rowName} numberOfLines={1}>{name || item.username}</Text>
                        <Text style={styles.rowHandle} numberOfLines={1}>@{item.username}</Text>
                      </View>
                      {isSel ? <Text style={styles.check}>✓</Text> : null}
                    </Pressable>
                  );
                }}
              />
            )}
          </View>

          <View style={styles.footer}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelTxt}>cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.confirmBtn, (!selected || saving) && { opacity: 0.4 }]}
              disabled={!selected || saving}
              onPress={confirm}
            >
              <Text style={styles.confirmTxt}>confirm</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: Colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: {
    width: '100%', maxWidth: 380, maxHeight: '80%', backgroundColor: Colors.mainBg,
    borderWidth: 2, borderColor: Colors.black, padding: 16,
  },
  header: { fontFamily: Fonts.serif, fontSize: FontSizes.md, color: Colors.black, textAlign: 'center', marginBottom: 12 },
  search: {
    borderWidth: 1, borderColor: Colors.black, backgroundColor: Colors.white,
    paddingHorizontal: 12, paddingVertical: 10, fontFamily: Fonts.mono, fontSize: 14, color: Colors.black,
  },
  listWrap: { flexGrow: 1, flexShrink: 1, marginTop: 10 },
  empty: { fontFamily: Fonts.mono, fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginTop: 24 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8,
    borderWidth: 1, borderColor: 'transparent',
  },
  rowSel: { borderColor: Colors.black, backgroundColor: Colors.secondary },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: Colors.black, backgroundColor: Colors.secondary },
  rowText: { flex: 1 },
  rowName: { fontFamily: Fonts.serif, fontSize: FontSizes.base, color: Colors.black },
  rowHandle: { fontFamily: Fonts.mono, fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  check: { fontFamily: Fonts.mono, fontSize: 18, color: Colors.black, paddingHorizontal: 6 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  cancelTxt: { fontFamily: Fonts.mono, fontSize: 14, color: Colors.textSecondary },
  confirmBtn: { borderWidth: 1, borderColor: Colors.black, backgroundColor: Colors.accentGolden, paddingHorizontal: 20, paddingVertical: 10 },
  confirmTxt: { fontFamily: Fonts.mono, fontSize: 14, color: Colors.black },
});
