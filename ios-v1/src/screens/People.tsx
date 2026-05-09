import React, { useState, useMemo, useCallback, useRef } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Dimensions, RefreshControl, Keyboard } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Fuse from 'fuse.js';
import CentralFilter, { CentralFilterHandle } from '../components/CentralFilter';
import { useMembers, useOptions } from '../hooks';
import { resolveImageUrl, profileThumbUrl, Profile } from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import type { PeopleStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<PeopleStackParamList, 'PeopleList'>;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 60) / 2;

export default function People() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const [members, , , refetchMembers] = useMembers('', '');
  const [options] = useOptions();
  const [query, setQuery] = useState('');
  const [chips, setChips] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filterKey, setFilterKey] = useState(0);
  const filterRef = useRef<CentralFilterHandle>(null);

  const dismissDropdown = useCallback(() => {
    filterRef.current?.close();
    Keyboard.dismiss();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setQuery('');
    setChips([]);
    setFilterKey((k) => k + 1);
    try {
      await refetchMembers();
    } catch {}
    setRefreshing(false);
  }, [refetchMembers]);

  const allOptions = useMemo(() => {
    const o = options as any;
    return [
      ...(o.usernames || []),
      ...(o.fullnames || []),
      ...(o.cities || []),
      ...(o.mediums || []),
    ];
  }, [options]);

  const PEOPLE_KEYS = ['username', 'firstname', 'lastname', 'city', 'media'];

  const filtered = useMemo(() => {
    let result = members;
    for (const chip of chips) {
      result = new Fuse(result, { keys: PEOPLE_KEYS, threshold: 0.4 }).search(chip).map((r) => r.item);
    }
    if (query.trim()) {
      result = new Fuse(result, { keys: PEOPLE_KEYS, threshold: 0.4 }).search(query).map((r) => r.item);
    }
    return result;
  }, [members, chips, query]);

  const addChip = useCallback((value: string) => {
    setChips((prev) => (prev.includes(value) ? prev : [...prev, value]));
  }, []);
  const removeChip = useCallback((value: string) => {
    setChips((prev) => prev.filter((c) => c !== value));
  }, []);

  const renderCard = ({ item }: { item: Profile }) => (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => navigation.navigate('UserProfile', { username: item.username })}
    >
      <Image
        source={{ uri: item.profile_pic_path ? profileThumbUrl(item.id) : resolveImageUrl(`/imgs/${item.id}.png`) }}
        transition={200}
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
    <Pressable style={[styles.container, { paddingTop: insets.top }]} onPress={dismissDropdown}>
      <View style={styles.bannerWrap}>
        <Image
          source={require('../../assets/imgs/profiles.png')}
          style={styles.banner}
          contentFit="contain"
        />
      </View>
      <CentralFilter
        key={filterKey}
        ref={filterRef}
        header="members"
        options={allOptions}
        chips={chips}
        onAddChip={addChip}
        onRemoveChip={removeChip}
        onQueryChange={setQuery}
        placeholder="search people..."
      />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.username}
        renderItem={renderCard}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={dismissDropdown}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.darkerGold}
            colors={[Colors.darkerGold]}
          />
        }
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  bannerWrap: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
  },
  banner: {
    width: 80,
    height: 80,
    transform: [{ scale: 1.375 }],
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
