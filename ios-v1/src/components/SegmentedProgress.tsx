import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Fonts, FontSizes } from '../constants/theme';

// Vivid red lifted from the Kanye West "Stronger" single artwork — bold,
// slightly crimson. Tweak this one constant to retune the fill color.
export const KANYE_RED = '#E1132B';

interface SegmentedProgressProps {
  steps: string[];
  // Index of the current (active) step. Segments at or before it read as filled.
  currentIndex: number;
}

// A discrete, segmented progress bar: one chunk per step, filling in red as the
// stages complete. The active step's label is emphasized.
export default function SegmentedProgress({ steps, currentIndex }: SegmentedProgressProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        {steps.map((label, i) => (
          <View
            key={label}
            style={[
              styles.segment,
              i <= currentIndex ? styles.segmentFilled : styles.segmentEmpty,
            ]}
          />
        ))}
      </View>
      <View style={styles.labels}>
        {steps.map((label, i) => (
          <Text
            key={label}
            style={[styles.label, i === currentIndex && styles.labelActive]}
          >
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  track: {
    flexDirection: 'row',
    gap: 6,
  },
  segment: {
    flex: 1,
    height: 8,
    borderWidth: 1,
    borderColor: '#000',
  },
  segmentFilled: {
    backgroundColor: KANYE_RED,
  },
  segmentEmpty: {
    backgroundColor: Colors.mainBg,
  },
  labels: {
    flexDirection: 'row',
  },
  label: {
    flex: 1,
    textAlign: 'center',
    fontFamily: Fonts.mono,
    fontSize: FontSizes.micro,
    color: Colors.textMuted,
  },
  labelActive: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
});
