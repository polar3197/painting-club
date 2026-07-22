import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Colors, Fonts } from '../constants/theme';

// Inspiration web (stub — canvas lands in the next commit).
export default function WebScreen() {
  const route = useRoute<any>();
  const artId: string = route.params?.artId;
  return (
    <View style={styles.container}>
      <Text style={styles.text}>web: {artId}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: Fonts.mono,
  },
});
