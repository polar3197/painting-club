import React from 'react';
import { Text, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import { ABOUT_POSTS } from '../constants/aboutContent';
import type { HomeStackParamList } from '../navigation/types';

type PostRoute = RouteProp<HomeStackParamList, 'AboutPost'>;

// A single post as a clean white blog page — no card, no border. Back is the
// native swipe gesture.
export default function AboutPost() {
  const insets = useSafeAreaInsets();
  const { section, postIndex } = useRoute<PostRoute>().params;
  const post = ABOUT_POSTS[section]?.[postIndex];

  if (!post) return <View style={styles.page} />;

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 60 },
      ]}
    >
      <Text style={styles.title}>{post.title}</Text>

      {post.blocks.map((block, i) => {
        if (block.type === 'quote') {
          return (
            <View key={i}>
              <Text style={styles.quote}>{block.text}</Text>
              <Text style={styles.quoteAttrib}>{block.attrib}</Text>
            </View>
          );
        }
        if (block.type === 'bullets') {
          return (
            <View key={i} style={styles.list}>
              {block.items.map((item, j) => (
                <Text key={j} style={styles.listItem}>
                  <Text style={styles.bold}>{item}</Text>
                </Text>
              ))}
            </View>
          );
        }
        return (
          <Text key={i} style={styles.body}>
            {block.text}
          </Text>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  content: {
    paddingHorizontal: 24,
    gap: 18,
  },
  title: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.lg,
    color: Colors.black,
  },
  quote: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    fontStyle: 'italic',
    color: 'rgb(66, 65, 65)',
    lineHeight: 20,
  },
  quoteAttrib: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: 'rgb(66, 65, 65)',
    textAlign: 'right',
    marginTop: 6,
  },
  body: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    lineHeight: 20,
    color: Colors.textPrimary,
  },
  list: {
    paddingLeft: 24,
    gap: 6,
  },
  listItem: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    lineHeight: 20,
  },
  bold: {
    fontWeight: '700',
  },
});
