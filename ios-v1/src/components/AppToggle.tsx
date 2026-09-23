import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { Colors } from '../constants/theme';

// The club's toggle: a square track that reads green for on and red for off,
// with a gold square thumb. Square corners and black rules like everything
// else — React Native's <Switch> is a rounded iOS control and looked like it
// belonged to a different app.
//
// The shape is lifted from the "comments" toggle on the add-post form, which
// had been hand-rolled inline in PaintingForm, WrittenFormForm, AudioForm and
// AddArtDialog. This is the same control extracted so new screens stop
// reinventing it.
//
// One behavioural difference from those copies, and it matters: they animate
// inside their own press handler, so a value changed from OUTSIDE (a failed
// save rolling back, or a fetch landing) jumps without animating — or worse,
// leaves the thumb where the user put it while the state says otherwise. This
// drives the animation from `value`, so the thumb always tells the truth.
const TRAVEL = 18;

export default function AppToggle({
  value,
  onValueChange,
  disabled = false,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const pos = useRef(new Animated.Value(value ? TRAVEL : 0)).current;

  useEffect(() => {
    Animated.timing(pos, {
      toValue: value ? TRAVEL : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [value, pos]);

  return (
    <Pressable
      style={[
        styles.track,
        { backgroundColor: value ? Colors.greenBright : Colors.redLight },
        disabled && styles.disabled,
      ]}
      onPress={disabled ? undefined : () => onValueChange(!value)}
      hitSlop={10}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
    >
      <Animated.View style={[styles.thumb, { transform: [{ translateX: pos }] }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 36,
    height: 18,
    borderWidth: 1,
    borderColor: '#000',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  thumb: {
    width: 12,
    height: 12,
    backgroundColor: Colors.accentGolden,
    borderWidth: 1,
    borderColor: '#000',
  },
  disabled: { opacity: 0.45 },
});
