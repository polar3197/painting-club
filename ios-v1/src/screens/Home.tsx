import React from 'react';
import { View, Text, ScrollView, Image, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';

export default function Home() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.titleContainer}>
        <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>{'-• Painting Club •-'}</Text>
      </View>

      <View style={styles.messageContainer}>
        <Image
          source={require('../../assets/imgs/groups.png')}
          style={styles.messageImage}
          resizeMode="contain"
        />
        <Text style={styles.messageText}>Welcome to Painting Club.</Text>
        <View style={styles.spacer} />
        <Text style={styles.messageText}>I built this space for artists to share their art.</Text>
        <View style={styles.spacer} />
        <Text style={styles.messageText}>The goal is to center art around sincerity.</Text>
        <View style={styles.spacer} />
        <Text style={styles.messageText}>
          I truly believe you see a person's intent in every brush stroke - and I am sure this goes for other mediums too.
        </Text>
        <View style={styles.spacer} />
        <Text style={styles.messageText}>
          As realism is conquered, abstract, impressionism, are all conquered as well, and AI can conquer the ones to come, it is the sincerity in art that shines through. Painting Club is for sincere art.
        </Text>
        <View style={styles.spacer} />
        <Text style={styles.messageText}>
          Its a random fun spot for art, a place to inspire and be inspired by others
        </Text>
        <View style={styles.spacer} />
        <Text style={styles.messageText}>
          — its kinda also my secret hope to create a internet haven, safe from algorithms and warped value systems.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.greenBg,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  titleContainer: {
    backgroundColor: Colors.greenPale,
    borderWidth: 2,
    borderColor: '#000',
    padding: 16,
    alignItems: 'center',
    ...Shadows.card,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xxl,
    color: Colors.textPrimary,
  },
  messageContainer: {
    backgroundColor: Colors.mainBg,
    borderWidth: 2,
    borderColor: '#000',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    marginTop: 20,
    ...Shadows.card,
  },
  messageImage: {
    alignSelf: 'center',
    width: 450,
    height: 582,
    marginTop: -30,
    marginBottom: 8,
  },
  messageText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    fontWeight: '600',
    lineHeight: 20,
    color: Colors.textPrimary,
  },
  spacer: {
    height: 14,
  },
});
