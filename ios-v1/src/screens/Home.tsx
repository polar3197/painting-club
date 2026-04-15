import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Announcements from '../components/Announcements';
import { Colors, Fonts, FontSizes, Shadows } from '../constants/theme';

export default function Home() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.titleContainer}>
        <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>{'-\u2022 Painting Club \u2022-'}</Text>
      </View>

      <View style={styles.messageContainer}>
        <Text style={styles.messageText}>Welcome to Painting Club.</Text>
        <Text style={styles.spacer}>{' '}</Text>
        <Text style={styles.messageText}>I built this space for artists to share their art.</Text>
        <Text style={styles.spacer}>{' '}</Text>
        <Text style={styles.messageText}>
          The goal is to center art and sincerity. There are no likes nor algorithm. Just friends, art and conversations.
        </Text>
        <Text style={styles.spacer}>{' '}</Text>
        <Text style={styles.messageText}>
          {`It currently handles photography, painting, drawing, etc. \u2014 you get the idea, #2d-static-visual...`}
        </Text>
        <Text style={styles.spacer}>{' '}</Text>
        <Text style={styles.messageText}>
          For friends who film, write, sing, sculpt, and so on and on, I would love to chat about how Painting Club could best display your art form.
        </Text>
        <Text style={styles.spacer}>{' '}</Text>
        <Text style={styles.messageText}>
          {`It's true, we can all use instagram, but I lowkey hate instagram and highkey don't like zuckerberg.`}
        </Text>
        <Text style={styles.spacer}>{' '}</Text>
        <Text style={styles.messageText}>
          With a Painting Club account you can create custom portfolios with a few clicks and share them with anyone you want. You could also opt to hide all of your art so that only other members see it. Either way, your pick!
        </Text>
      </View>

      <Announcements />
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
    padding: 20,
    marginTop: 20,
    ...Shadows.card,
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
