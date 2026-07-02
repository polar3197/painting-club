import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import { ABOUT_POSTS, ABOUT_SECTIONS } from '../constants/aboutContent';
import type { HomeStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'AboutSection'>;
type SectionRoute = RouteProp<HomeStackParamList, 'AboutSection'>;

// One section (e.g. "ethos"): the section title, then a box per post showing
// only the post title. Tapping a box opens the post's blog page.
export default function AboutSection() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { section } = useRoute<SectionRoute>().params;

  const label = ABOUT_SECTIONS.find((s) => s.key === section)?.label ?? section;
  const posts = ABOUT_POSTS[section] ?? [];
  const emptyText =
    section === 'art' ? 'currently artless'
    : section === 'aims' ? 'currently aimless'
    : 'nothing here yet';

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 12 }]}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
    >
      <Text style={styles.pageTitle}>{label}</Text>

      {posts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      ) : (
        posts.map((post, i) => (
          <Pressable
            key={`${post.title}-${i}`}
            style={[styles.postBtn, i === 0 && styles.postBtnFirst]}
            onPress={() => navigation.navigate('AboutPost', { section, postIndex: i })}
          >
            <Text style={styles.postBtnText}>{post.title}</Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
  },
  content: {},
  pageTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.lg,
    color: Colors.black,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  empty: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    color: Colors.textTertiary,
  },
  postBtn: {
    borderBottomWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.white,
    justifyContent: 'center',
    height: 84,
    paddingHorizontal: 16,
  },
  postBtnFirst: {
    borderTopWidth: 1,
  },
  postBtnText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.base,
    color: Colors.black,
  },
});
