import { useEffect, useRef } from 'react';
import { Animated, Easing, ImageStyle, StyleProp } from 'react-native';

interface SpinnerProps {
  size?: number;
  style?: StyleProp<ImageStyle>;
}

export default function Spinner({ size = 64, style }: SpinnerProps) {
  const rotation = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [rotation]);
  const spin = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.Image
      source={require('../../assets/imgs/groups.png')}
      style={[{ width: size, height: size, transform: [{ rotate: spin }] }, style]}
      resizeMode="contain"
    />
  );
}
