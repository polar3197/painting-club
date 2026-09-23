import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { get_active_prompt, PromptOut } from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';

// Root of the "weekly prompt" swipe page. WeeklyPromptDetail wants a promptId
// route param, so this thin screen resolves the *active* prompt first, then
// hands off to the full detail screen (pushed on the outer swipe stack). Kept
// separate so the pager can host a stable leaf while the detail flow is
// unchanged.
export default function ActivePrompt() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { token } = useAuth();
  const [prompt, setPrompt] = useState<PromptOut | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setPrompt(await get_active_prompt(token));
    } catch {
      // Leave whatever we last had; the empty state covers a first-load failure.
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={Colors.darkerGold} />
      </View>
    );
  }

  if (!prompt) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emptyTitle}>no prompt this week</Text>
        <Text style={styles.emptySub}>check back soon</Text>
      </View>
    );
  }

  return (
    <View style={[styles.center, { paddingTop: insets.top }]}>
      <Text style={styles.kicker}>this week's prompt</Text>
      <Text style={styles.promptTitle}>{prompt.title}</Text>
      <Pressable
        style={styles.cta}
        onPress={() => navigation.navigate('WeeklyPromptDetail', { promptId: prompt.id })}
      >
        <Text style={styles.ctaText}>open</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: Colors.mainBg,
  },
  kicker: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.darkerGold,
    marginBottom: 10,
    textTransform: 'lowercase',
  },
  promptTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl ?? 28,
    color: Colors.black,
    textAlign: 'center',
    marginBottom: 28,
  },
  cta: {
    borderWidth: 1,
    borderColor: Colors.black,
    backgroundColor: Colors.primaryGold,
    paddingHorizontal: 26,
    paddingVertical: 10,
  },
  ctaText: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.black,
  },
  emptyTitle: {
    fontFamily: Fonts.serif,
    fontSize: 22,
    color: Colors.black,
    marginBottom: 6,
  },
  emptySub: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.textMuted,
  },
});
