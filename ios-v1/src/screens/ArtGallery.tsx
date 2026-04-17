import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Fuse from 'fuse.js';
import CentralFilter from '../components/CentralFilter';
import { useOptions } from '../hooks';
import { search_art, thumbUrl, ArtResult } from '../api';
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

  useEffect(() => {
    search_art('').then(setArt).catch(() => {});
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

  const fuse = useRef<Fuse<ArtResult> | null>(null);
  const fuseItems = useMemo(() => {
    fuse.current = new Fuse(art, {
      keys: ['title', 'medium', 'song', 'creator_username', 'location', 'keywords'],
      threshold: 0.4,
    });
    return fuse.current;
  }, [art]);

  const filtered = useMemo(() => {
    if (!query.trim()) return art;
    return fuseItems.search(query).map((r) => r.item);
  }, [query, art, fuseItems]);

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
        source={{ uri: thumbUrl(item.id, 512) }}
        style={styles.cardImage}
        contentFit="cover"
      />
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.bannerWrap}>
        <Image
          source={require('../../assets/imgs/art.png')}
          style={styles.banner}
          contentFit="contain"
        />
      </View>
      <CentralFilter
        header="art"
        options={allOptions}
        onSearch={setQuery}
        placeholder="search art..."
      />
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
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
