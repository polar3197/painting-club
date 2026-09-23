import React from 'react';
import { Pressable, Image, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useBookmarks } from '../context/BookmarkContext';
import { Colors } from '../constants/theme';

const icon = require('../../assets/imgs/bookmark.png');

interface BookmarkButtonProps {
  // Bookmark a single piece...
  artId?: string;
  // ...or every piece in a collection ("save all"). If both are given, artIds wins.
  artIds?: string[];
  size?: number;
  style?: StyleProp<ViewStyle>;
}

// Square, hand-drawn bookmark toggle matching the "saved" tab icon. Fills gold
// while saved; tapping saves or un-saves (a collection counts as saved only when
// every piece is). State + the transient toast are driven by BookmarkContext.
export default function BookmarkButton({ artId, artIds, size = 30, style }: BookmarkButtonProps) {
  const { isBookmarked, toggle } = useBookmarks();
  const ids = artIds ?? (artId ? [artId] : []);
  const active = ids.length > 0 && ids.every((id) => isBookmarked(id));

  return (
    <Pressable
      style={({ pressed }) => [
        styles.btn,
        { width: size, height: size },
        active && styles.btnActive,
        pressed && styles.pressed,
        style,
      ]}
      onPress={() => toggle(ids)}
      hitSlop={6}
    >
      <Image
        source={icon}
        style={{ width: size * 0.62, height: size * 0.62, opacity: active ? 1 : 0.85 }}
        resizeMode="contain"
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Filled state = saved. The gold matches the app's active/selected treatment
  // (search toggle, alert primary).
  btnActive: {
    backgroundColor: Colors.primaryGold,
  },
  pressed: {
    opacity: 0.7,
  },
});
