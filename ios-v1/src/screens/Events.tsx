import React, { useCallback, useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Fonts, FontSizes } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { EventOut, list_events, resolveImageUrl } from '../api';
import { formatEventWhen } from '../utils/date';

const EMPTY_ROWS = 6;

// Upcoming/all events the viewer can see (public + hosted/invited). Reached from
// the bouncing "event" ball on Home.
export default function Events() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { token } = useAuth();
  const [events, setEvents] = useState<EventOut[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await list_events(token);
      // Soonest first; events share a date fall back to created order.
      list.sort((a, b) => {
        const d = a.event_date.localeCompare(b.event_date);
        if (d !== 0) return d;
        return (a.event_time || '').localeCompare(b.event_time || '');
      });
      setEvents(list);
    } catch {
      // keep what's on screen; pull-to-refresh retries
    } finally {
      setLoaded(true);
    }
  }, [token]);

  // Refetch every time the screen focuses so edits/creates land on return.
  useLayoutEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>events</Text>
        <Pressable
          style={styles.addBtn}
          hitSlop={12}
          onPress={() => navigation.navigate('EventEdit', {})}
        >
          <Text style={styles.addBtnText}>+</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {events.length === 0
          ? loaded
            ? <Text style={styles.emptyText}>no events yet. tap + to host one.</Text>
            : Array.from({ length: EMPTY_ROWS }).map((_, i) => <View key={i} style={styles.rowEmpty} />)
          : events.map((e) => (
              <Pressable
                key={e.id}
                style={styles.row}
                onPress={() => navigation.navigate('EventDetail', { eventId: e.id })}
              >
                {e.image_path ? (
                  <Image source={{ uri: resolveImageUrl(e.image_path) }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, styles.thumbBlank, e.color ? { backgroundColor: e.color } : null]} />
                )}
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{e.title}</Text>
                  <Text style={styles.rowWhen}>{formatEventWhen(e.event_date, e.event_time)}</Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {e.is_public ? 'public' : 'invite-only'}
                    {e.hosts.length > 0 ? ` · @${e.hosts[0]}${e.hosts.length > 1 ? ` +${e.hosts.length - 1}` : ''}` : ''}
                  </Text>
                </View>
              </Pressable>
            ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.mainBg,
    paddingHorizontal: 24,
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
  list: {
    flex: 1,
  },
  listContent: {
    gap: 12,
  },
  emptyText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    marginTop: 24,
  },
  rowEmpty: {
    height: 88,
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.artCardBg,
  },
  row: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#000',
    backgroundColor: Colors.artCardBg,
    overflow: 'hidden',
  },
  thumb: {
    width: 88,
    height: 88,
  },
  thumbBlank: {
    backgroundColor: Colors.secondary,
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  rowMain: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    gap: 3,
  },
  rowTitle: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.md,
    color: Colors.black,
  },
  rowWhen: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textPrimary,
  },
  rowMeta: {
    fontFamily: Fonts.mono,
    fontSize: FontSizes.tiny,
    color: Colors.textSecondary,
  },
});
