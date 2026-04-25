import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Dimensions, RefreshControl, Keyboard } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Fuse from 'fuse.js';
import CentralFilter, { CentralFilterHandle } from '../components/CentralFilter';
import ContextPopup from '../components/ContextPopup';
import ReportDialog from '../components/ReportDialog';
import { useAuth } from '../context/AuthContext';
import { useOptions } from '../hooks';
import { search_art, resolveImageUrl, thumbUrl, ArtResult } from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import type { ArtStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<ArtStackParamList, 'ArtGallery'>;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 60) / 2;

export default function ArtGallery() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const [options] = useOptions();
  const [art, setArt] = useState<ArtResult[]>([]);
  const [query, setQuery] = useState('');
  const [chips, setChips] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filterKey, setFilterKey] = useState(0);
  const filterRef = useRef<CentralFilterHandle>(null);
  const { currentUser } = useAuth();
  const [popupAnchor, setPopupAnchor] = useState<{ x: number; y: number } | null>(null);
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);

  const dismissDropdown = useCallback(() => {
    filterRef.current?.close();
    Keyboard.dismiss();
  }, []);

  useEffect(() => {
    search_art('').then(setArt).catch(() => {});
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setQuery('');
    setChips([]);
    setFilterKey((k) => k + 1);
    try {
      const data = await search_art('');
      setArt(data);
    } catch {}
    setRefreshing(false);
  }, []);

  const allOptions = useMemo(() => {
    const o = options as any;
    return [
      ...(o.titles || []),
      ...(o.mediums || []),
      ...(o.keywords || []),
      ...(o.songs || []),
      ...(o.usernames || []),
      ...(o.cities || []),
    ];
  }, [options]);

  const ART_KEYS = ['title', 'medium', 'song', 'creator_username', 'location', 'keywords'];

  const filtered = useMemo(() => {
    let result = art;
    for (const chip of chips) {
      result = new Fuse(result, { keys: ART_KEYS, threshold: 0.4 }).search(chip).map((r) => r.item);
    }
    if (query.trim()) {
      result = new Fuse(result, { keys: ART_KEYS, threshold: 0.4 }).search(query).map((r) => r.item);
    }
    return result;
  }, [art, chips, query]);

  const addChip = useCallback((value: string) => {
    setChips((prev) => (prev.includes(value) ? prev : [...prev, value]));
  }, []);
  const removeChip = useCallback((value: string) => {
    setChips((prev) => prev.filter((c) => c !== value));
  }, []);

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
      {currentUser && currentUser !== item.creator_username && (
        <Pressable
          style={({ pressed }) => [styles.kebabBtn, pressed && { opacity: 0.6 }]}
          onPress={(e) => {
            setReportTarget(item.id);
            setPopupAnchor({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
          }}
          hitSlop={8}
        >
          <Text style={styles.kebabText}>⋮</Text>
        </Pressable>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.cardMedium}>{item.medium}</Text>
        <Pressable
          onPress={() =>
            navigation.navigate('UserProfile', { username: item.creator_username })
          }
        >
          <Text style={styles.cardCreator}>@{item.creator_username}</Text>
        </Pressable>
        {item.location && (
          <Text style={styles.cardLocation}>{item.location}</Text>
        )}
        {item.keywords && item.keywords.length > 0 && (
          <Text style={styles.cardKeywords} numberOfLines={1}>
            {item.keywords.join(', ')}
          </Text>
        )}
      </View>
    </Pressable>
  );

  return (
    <Pressable style={[styles.container, { paddingTop: insets.top }]} onPress={dismissDropdown}>
      <ContextPopup
        visible={popupAnchor !== null}
        anchor={popupAnchor}
        onClose={() => setPopupAnchor(null)}
      >
        <Pressable
          style={({ pressed }) => [
            { paddingVertical: 10, paddingHorizontal: 14 },
            pressed && { backgroundColor: Colors.secondary },
          ]}
          onPress={() => {
            setPopupAnchor(null);
            setShowReport(true);
          }}
        >
          <Text style={{ fontFamily: Fonts.serif, fontSize: FontSizes.base, color: Colors.black }}>
            report this
          </Text>
        </Pressable>
      </ContextPopup>
      <ReportDialog
        visible={showReport}
        targetType="art"
        targetId={reportTarget}
        onClose={() => {
          setShowReport(false);
          setReportTarget(null);
        }}
      />
      <View style={styles.bannerWrap}>
        <Image
          source={require('../../assets/imgs/art.png')}
          style={styles.banner}
          contentFit="contain"
        />
      </View>
      <CentralFilter
        key={filterKey}
        ref={filterRef}
        header="art"
        options={allOptions}
        chips={chips}
        onAddChip={addChip}
        onRemoveChip={removeChip}
        onQueryChange={setQuery}
        placeholder="search art..."
      />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
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
    backgroundColor: Colors.artCardBg,
    position: 'relative',
  },
  kebabBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    backgroundColor: 'rgba(255, 250, 245, 0.9)',
    borderWidth: 1,
    borderColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kebabText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    lineHeight: 14,
    color: Colors.black,
    fontWeight: '700',
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
  cardCreator: {
    fontSize: FontSizes.tiny,
    color: Colors.blueLink,
    textDecorationLine: 'underline',
    marginTop: 2,
  },
  cardLocation: {
    fontSize: FontSizes.tiny,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  cardKeywords: {
    fontSize: FontSizes.micro,
    fontStyle: 'italic',
    color: Colors.textTertiary,
    marginTop: 4,
  },
});
