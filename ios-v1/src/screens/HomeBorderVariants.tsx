import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavPref } from '../context/NavPrefContext';
import { Fonts } from '../constants/theme';

// Renders a word as a vertical stack of letters (one per line) for the left /
// right edges.
function VerticalWord({ word }: { word: string }) {
  return (
    <View>
      {word.split('').map((ch, i) => (
        <Text key={i} style={styles.vLetter}>{ch}</Text>
      ))}
    </View>
  );
}

// Names the neighbor at each edge of the Home cell: art wall (top) / events
// (bottom) as horizontal labels, profile (left) / people (right) as
// vertically-stacked letters running down each side. pointerEvents="none" so
// Home stays interactive; it scrolls away with the Home cell.
function NamedBorder() {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.hEdge, { top: insets.top + 6 }]}>
        <Text style={styles.edgeName}>art wall</Text>
      </View>
      <View style={[styles.hEdge, { bottom: 8 }]}>
        <Text style={styles.edgeName}>events</Text>
      </View>
      <View style={[styles.vEdge, styles.vLeft, { top: insets.top }]}>
        <VerticalWord word="profile" />
      </View>
      <View style={[styles.vEdge, styles.vRight, { top: insets.top }]}>
        <VerticalWord word="people" />
      </View>
    </View>
  );
}

export default function HomeBorder() {
  const { homeBorderVariant } = useNavPref();
  return homeBorderVariant === 'on' ? <NamedBorder /> : null;
}

const styles = StyleSheet.create({
  hEdge: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  vEdge: { position: 'absolute', bottom: 0, justifyContent: 'center' },
  vLeft: { left: 4 },
  vRight: { right: 4 },
  edgeName: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    letterSpacing: 2,
    color: '#000000',
    opacity: 1,
  },
  vLetter: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 13,
    textAlign: 'center',
    color: '#000000',
    opacity: 1,
  },
});
