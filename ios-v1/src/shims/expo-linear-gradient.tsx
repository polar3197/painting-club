// OTA build-#8 compatibility shim — see metro.config.js.
// Stands in for expo-linear-gradient (native module absent from the live
// binary). Renders a plain View with a solid fill derived from the gradient
// colors so layouts that depend on the gradient filling space still look right.
import React from 'react';
import { View, ViewProps } from 'react-native';

type Props = ViewProps & {
  colors?: string[];
  // Accepted and ignored so call sites don't need to change.
  locations?: number[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
};

export function LinearGradient({ colors, locations, start, end, style, children, ...rest }: Props) {
  // Prefer the second stop (usually the dominant near-background tone) over the
  // first/last extreme; fall back through what's available.
  const bg = colors?.[1] ?? colors?.[0];
  return (
    <View style={[{ backgroundColor: bg }, style]} {...rest}>
      {children}
    </View>
  );
}

export default LinearGradient;
