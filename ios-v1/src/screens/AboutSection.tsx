import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { get_docs_by_section, DocOut } from '../api';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import { ABOUT_SECTIONS } from '../constants/aboutContent';
import type { HomeStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<HomeStackParamList, 'AboutSection'>;
type SectionRoute = RouteProp<HomeStackParamList, 'AboutSection'>;

// One About section: a ROW LIST of its docs (a section holds many). Any member
// reads; contributors get a "+" to add a new doc and can edit/delete each from
// the doc screen. Tapping a row opens the doc.
export default function AboutSection() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { section } = useRoute<SectionRoute>().params;
  const { token, currentRole } = useAuth();

  const label = ABOUT_SECTIONS.find((s) => s.key === section)?.label ?? section;
  const isContributor = currentRole === 'contributor';

  const [docs, setDocs] = useState<DocOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setDocs(await get_docs_by_section(section, token));
    } catch {
      // keep what's on screen
    } finally {
      setLoading(false);
    }
  }, [section, token]);

  // Refetch on focus so a create/edit/delete on the doc screen reflects here.
  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const emptyText =
    section === 'art' ? 'currently artless'
    : section === 'aims' ? 'currently aimless'
    : 'nothing here yet';

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{label}</Text>
        {isContributor && (
          <Pressable
            style={styles.addBtn}
            hitSlop={10}
            onPress={() => navigation.navigate('AboutDoc', { section, create: true })}
          >
            <Text style={styles.addBtnText}>+</Text>
          </Pressable>
        )}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.darkerGold} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {docs.length === 0 ? (
            <Text style={styles.empty}>{emptyText}</Text>
          ) : (
            docs.map((d) => (
              <Pressable
                key={d.slug}
                style={styles.row}
                onPress={() => navigation.navigate('AboutDoc', { slug: d.slug })}
              >
                <Text style={styles.rowTitle} numberOfLines={1}>{d.title}</Text>
                {!!d.body && <Text style={styles.rowBody} numberOfLines={2}>{d.body}</Text>}
              </Pressable>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
    paddingHorizontal: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
    paddingBottom: 10,
    marginBottom: 16,
  },
  title: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xl,
  },
  addBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    fontFamily: Fonts.serif,
    fontSize: 30,
    lineHeight: 32,
    color: Colors.black,
  },
  empty: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 24,
  },
  row: {
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.artCardBg,
    padding: 14,
    marginBottom: 10,
    gap: 4,
  },
  rowTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    color: Colors.black,
  },
  rowBody: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
  },
});
