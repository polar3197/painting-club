import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Fonts, FontSizes } from '../constants/theme';

export default function Ethos() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.contentContainer}
    >
      <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.backBtnText}>{'<\u2014'}</Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.title}>Painting Club Ethos</Text>

        <View style={styles.hr} />

        <Text style={styles.quote}>
          {"\"Underlying [the Web's] whole infrastructure was the intention to allow for collaboration, foster compassion and generate creativity \u2014 what I term the 3 C's. It was to be a tool to empower humanity. [...] Yet in the past decade, instead of embodying these values, the web has instead played a part in eroding them.\""}
        </Text>
        <Text style={styles.quoteAttrib}>- Tim Berners-Lee (creator of the World Wide Web)</Text>

        <View style={styles.hr} />

        <Text style={styles.body}>
          This is a general introduction to the spirit of Painting Club. Actually this is all gibberish, an official and succinct doc will be written and placed here to communicate what is achieved here and why it is fun and philosophically important.
        </Text>

        <Text style={styles.body}>
          Painting Club is a big bet on my hope that community is more powerful than dopamine kicks.
        </Text>

        <Text style={styles.body}>
          {`Online participation has become co-opted and turned into continual and pervasive exploitation and mental-priming of vulnerable, isolated people, by powerful idiots. \u2014 why do we enter this contract? For a fun way to connect with our friends over the internet.`}
        </Text>

        <Text style={styles.body}>
          {`You have to be one sick mofo to prey upon people's desire to have connection and community. Connection is the purest and most fragile human desire \u2014and Zuck twists and corrupts it before it can even stand up on its own.`}
        </Text>

        <Text style={styles.body}>
          Social connection should not be monetized. Annnnd, that brings us to the four tenants of Painting Club
        </Text>

        <View style={styles.list}>
          <Text style={styles.listItem}>
            <Text style={styles.bold}>1. no dopamine hooks</Text>
          </Text>
          <Text style={styles.listItem}>
            <Text style={styles.bold}>2. sincerity as the metric</Text>
          </Text>
          <Text style={styles.listItem}>
            <Text style={styles.bold}>3. no advertising</Text>
          </Text>
          <Text style={styles.listItem}>
            <Text style={styles.bold}>4. no ai (not in a reactionary way, in a humanane way)</Text>
          </Text>
        </View>

        <Text style={styles.body}>
          {`Some people might say "no dopamine hooks? how will you get people to use the app?" or "why would people choose painting club over instagram/tiktok?". These questions miss the point. The goal is not to get users; the goal is not to harvest attention; the goal is not to coerce members into participating. The goal is to provide an alternative.`}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.secondary,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 60,
  },
  backBtn: {
    width: 30,
    height: 30,
    borderWidth: 1,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: '#000',
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  backBtnText: {
    fontSize: FontSizes.xs,
    fontWeight: '700',
  },
  card: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: '#000',
    paddingHorizontal: 30,
    paddingVertical: 40,
    gap: 20,
  },
  title: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.lg,
  },
  hr: {
    height: 1,
    backgroundColor: '#000',
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
  },
  body: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.xs,
    lineHeight: 20,
    color: Colors.textPrimary,
  },
  list: {
    paddingLeft: 30,
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
