import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Dimensions, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Fuse from 'fuse.js';
import Spinner from '../components/Spinner';
import { search_art, resolveImageUrl, thumbUrl, ArtResult } from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import type { SearchStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<SearchStackParamList, 'SearchTabs'>;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 4;
const COLUMN_GAP = 10;
// List has 20px horizontal padding on each side; the rest is split into the
// columns and the gaps between them.
const CARD_WIDTH = (SCREEN_WIDTH - 40 - COLUMN_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
const ART_KEYS = ['title', 'medium', 'song', 'creator_username', 'location', 'keywords'];

interface Props {
  // Search state is owned by SearchTabs so the bar can stay fixed above the
  // swiping lists; this screen just renders the filtered grid.
  query: string;
  onResetFilters: () => void;
  onListScroll: () => void;
}

export default function ArtGallery({ query, onResetFilters, onListScroll }: Props) {
  const navigation = useNavigation<Nav>();
  const [art, setArt] = useState<ArtResult[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    search_art('').then(setArt).catch(() => {});
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    onResetFilters();
    try {
      setArt(await search_art(''));
    } catch {}
    setRefreshing(false);
  }, [onResetFilters]);

  const filtered = useMemo(() => {
    if (!query.trim()) return art;
    return new Fuse(art, { keys: ART_KEYS, threshold: 0.4 }).search(query).map((r) => r.item);
  }, [art, query]);

  const renderCard = ({ item }: { item: ArtResult }) => (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() =>
        navigation.navigate('UserProfile', {
          username: item.creator_username,
          artId: item.id,
          medium: item.medium,
        })
      }
    >
      <Image
        source={{ uri: resolveImageUrl(item.file_path) }}
        placeholder={{ uri: thumbUrl(item.id) }}
        transition={200}
        style={styles.cardImage}
        contentFit="cover"
      />
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.cardMedium} numberOfLines={1}>{item.medium}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
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
  cardTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    fontWeight: '700',
  },
  cardMedium: {
    fontSize: FontSizes.tiny,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
