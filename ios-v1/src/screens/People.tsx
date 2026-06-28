import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Dimensions, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Fuse from 'fuse.js';
import Spinner from '../components/Spinner';
import { useMembers } from '../hooks';
import { resolveImageUrl, profilePicSrc, Profile } from '../api';
import { useAuth } from '../context/AuthContext';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import type { SearchStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<SearchStackParamList, 'SearchTabs'>;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 3;
const COLUMN_GAP = 10;
// List has 20px horizontal padding on each side; the rest is split into the
// columns and the gaps between them.
const CARD_WIDTH = (SCREEN_WIDTH - 40 - COLUMN_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
const PEOPLE_KEYS = ['username', 'firstname', 'lastname', 'city', 'media'];

interface Props {
  // Search state is owned by SearchTabs so the bar can stay fixed above the
  // swiping lists; this screen just renders the filtered grid.
  query: string;
  onResetFilters: () => void;
  onListScroll: () => void;
}

export default function People({ query, onResetFilters, onListScroll }: Props) {
  const navigation = useNavigation<Nav>();
  const { profilePicVersions } = useAuth();
  const [members, , , refetchMembers] = useMembers('', '');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    onResetFilters();
    try {
      await refetchMembers();
    } catch {}
    setRefreshing(false);
  }, [onResetFilters, refetchMembers]);

  const filtered = useMemo(() => {
    if (!query.trim()) return members;
    return new Fuse(members, { keys: PEOPLE_KEYS, threshold: 0.4 }).search(query).map((r) => r.item);
  }, [members, query]);

  const renderCard = ({ item }: { item: Profile }) => (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => navigation.navigate('UserProfile', { username: item.username })}
    >
      <Image
        source={{ uri: profilePicSrc(item, profilePicVersions) ?? resolveImageUrl(`/imgs/${item.id}.png`) }}
        transition={200}
        style={styles.cardImage}
        contentFit="cover"
      />
      <View style={styles.cardBody}>
        <Text style={styles.cardUsername} numberOfLines={1}>{item.username}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.username}
        renderItem={renderCard}
        numColumns={NUM_COLUMNS}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={onListScroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="transparent"
            colors={['transparent']}
          />
        }
      />
      {refreshing && (
        <View style={styles.refreshSpinnerOverlay} pointerEvents="none">
          <Spinner size={48} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  refreshSpinnerOverlay: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  list: {
    padding: 20,
    paddingBottom: 40,
  },
  row: {
    justifyContent: 'flex-start',
    gap: COLUMN_GAP,
    marginBottom: 12,
  },
  card: {
    width: CARD_WIDTH,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.artCardBg,
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
    // Match the art search card title color (black).
    color: Colors.textPrimary,
  },
});
