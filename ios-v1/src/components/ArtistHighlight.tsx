import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { profilePicSource, profileThumbSource, picVersion, resolveImageUrl, Profile } from '../api';
import { getFeaturedMember, getCachedFeaturedMember } from '../api/featured';
import { Colors, Fonts, FontSizes } from '../constants/theme';

const CARD_W = Math.min(Dimensions.get('window').width * 0.6, 230);

// Featured-artist card near the bottom of Home (always shown). Set by
// contributors in Settings. Shows a centered "highlighted artist"
// header, the artist's name + location and a photo snapshot, with a single row
// of their media below. Short (height hugs its content — not a square). The
// member is cached on-device (see api/featured) so it paints instantly on
// launch, then revalidates. Tap → profile.
export default function ArtistHighlight() {
  const nav = useNavigation<any>();
  const { token } = useAuth();
  const [member, setMember] = useState<Profile | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    // 1) paint whatever we have on-device immediately …
    getCachedFeaturedMember().then((m) => { if (alive && m) setMember(m); }).catch(() => {});
    // 2) … then revalidate from the network.
    getFeaturedMember(token).then((m) => { if (alive && m) setMember(m); }).catch(() => {});
    return () => { alive = false; };
  }, [token]);

  if (!member) return null;

  const useThumb = !!member.profile_pic_path && !thumbFailed;
  const picSrc = useThumb
    ? profileThumbSource(member.id, picVersion(member))
    : (profilePicSource(member) ?? { uri: resolveImageUrl(`/imgs/${member.id}.png`) });
  const fullName = `${member.firstname ?? ''} ${member.lastname ?? ''}`.trim();

  return (
    <Pressable style={styles.card} onPress={() => nav.navigate('UserProfile', { username: member.username })}>
      <Text style={styles.header}>highlighted artist</Text>
      <View style={styles.topRow}>
        <View style={styles.topLeft}>
          <Text style={styles.name} numberOfLines={2}>{fullName || `@${member.username}`}</Text>
          {member.city ? <Text style={styles.loc} numberOfLines={1}>{member.city}{member.state ? `, ${member.state}` : ''}</Text> : null}
        </View>
        <Image
          source={picSrc}
          style={styles.pic}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          onError={useThumb ? () => setThumbFailed(true) : undefined}
        />
      </View>
      <View style={styles.mediaRow}>
        {(member.media ?? []).slice(0, 3).map((m) => (
          <View key={m} style={styles.mediaBlock}><Text style={styles.mediaTxt} numberOfLines={1}>{m}</Text></View>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 120,
    borderWidth: 2,
    borderColor: Colors.secondary,
    backgroundColor: Colors.artCardBg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  header: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    textAlign: 'center',
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topLeft: { flex: 1, paddingRight: 10 },
  name: { fontFamily: Fonts.serif, fontSize: FontSizes.sm, color: Colors.black },
  loc: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  pic: { width: 52, height: 52, borderRadius: 8, borderWidth: 1, borderColor: Colors.black, backgroundColor: Colors.secondary },
  mediaRow: { flexDirection: 'row', flexWrap: 'nowrap', gap: 6, marginTop: 10, overflow: 'hidden' },
  mediaBlock: { borderWidth: 1, borderColor: Colors.black, borderRadius: 6, backgroundColor: Colors.secondary, paddingHorizontal: 8, paddingVertical: 4 },
  mediaTxt: { fontFamily: Fonts.mono, fontSize: 11, color: Colors.black },
});
