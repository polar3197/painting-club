import React, { useState, useMemo, useRef } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Fuse from 'fuse.js';
import CentralFilter from '../components/CentralFilter';
import { useMembers, useOptions } from '../hooks';
import { resolveImageUrl, Profile } from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import type { PeopleStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<PeopleStackParamList, 'PeopleList'>;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 60) / 2;

export default function People() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const [members] = useMembers('', '');
  const [options] = useOptions();
  const [query, setQuery] = useState('');

  const allOptions = useMemo(() => {
    const o = options as any;
    return [
      ...(o.usernames || []),
      ...(o.fullnames || []),
      ...(o.cities || []),
    ];
  }, [options]);

  const fuse = useRef<Fuse<Profile> | null>(null);
  const fuseItems = useMemo(() => {
    fuse.current = new Fuse(members, {
      keys: ['username', 'firstname', 'lastname', 'city', 'media'],
      threshold: 0.4,
    });
    return fuse.current;
  }, [members]);

  const filtered = useMemo(() => {
    if (!query.trim()) return members;
    return fuseItems.search(query).map((r) => r.item);
  }, [query, members, fuseItems]);

  const renderCard = ({ item }: { item: Profile }) => (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => navigation.navigate('UserProfile', { username: item.username })}
    >
      <Image
        source={{ uri: resolveImageUrl(`/imgs/${item.username}.png`) }}
        style={styles.cardImage}
        contentFit="cover"
      />
      <View style={styles.cardBody}>
        <Text style={styles.cardUsername}>@{item.username}</Text>
        <Text style={styles.cardName}>
          {item.firstname} {item.lastname}
        </Text>
        {(item.city || item.state) && (
          <Text style={styles.cardLocation}>
            {[item.city, item.state].filter(Boolean).join(', ')}
          </Text>
        )}
        {item.media && item.media.length > 0 && (
          <Text style={styles.cardMedia}>{item.media.join(', ')}</Text>
        )}
      </View>
    </Pressable>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <CentralFilter
        header="members"
        options={allOptions}
        onSearch={setQuery}
        placeholder="search people..."
      />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.username}
        renderItem={renderCard}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  list: {
    padding: 20,
    paddingBottom: 40,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  card: {
    width: CARD_WIDTH,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
  },
  cardPressed: {
    transform: [{ scale: 0.97 }],
  },
  cardImage: {
    width: '100%',
    height: CARD_WIDTH,
  },
  cardBody: {
    padding: 8,
  },
  cardUsername: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  cardName: {
    fontSize: FontSizes.xxs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  cardLocation: {
    fontSize: FontSizes.tiny,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  cardMedia: {
    fontSize: FontSizes.tiny,
    fontStyle: 'italic',
    color: Colors.textTertiary,
    marginTop: 4,
  },
});
