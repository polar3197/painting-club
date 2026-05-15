import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { get_comments_received } from '../api';
import type { CommentReceivedOut } from '../api/types';
import { Colors, Fonts, FontSizes } from '../constants/theme';

// Rendered as the second "page" of the paged-horizontal carousel beside the
// Artist Statement. Holds the 20 most recent comments others have left on
// the viewer's art, paginated forward via cursor=created_at as the user
// scrolls down.

const PAGE_SIZE = 20;
const VISIBLE_ROWS = 4;
// Just the block's own padding now (10 top + 10 bottom). The "Comments" label
// and divider were removed at the parent's request — the surrounding bordered
// page already frames the list visually.
const PANEL_CHROME = 20;

interface CommentsReceivedPanelProps {
  // Fires when the user taps a comment. Caller is responsible for routing to
  // the art piece (set medium, scroll to artId).
  onTapComment: (c: CommentReceivedOut) => void;
}

export default function CommentsReceivedPanel({ onTapComment }: CommentsReceivedPanelProps) {
  const { token } = useAuth();
  const [items, setItems] = useState<CommentReceivedOut[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  // Threshold captured from the server's response on the FIRST page only —
  // every row compares its created_at against this to render seen vs unseen.
  const thresholdRef = useRef<string | null>(null);

  const loadPage = useCallback(
    async (cursor: string | null) => {
      if (loading) return;
      setLoading(true);
      try {
        const page = await get_comments_received(token, cursor, PAGE_SIZE);
        if (cursor === null) {
          thresholdRef.current = page.previous_view_at;
          setItems(page.comments);
        } else {
          setItems((prev) => [...prev, ...page.comments]);
        }
        setNextCursor(page.next_cursor);
      } catch {
        // Network/auth errors are silently absorbed here — the empty state
        // below will surface "no comments yet" which is the right fallback.
      } finally {
        setLoading(false);
        setInitialLoaded(true);
      }
    },
    [token, loading],
  );

  useEffect(() => {
    loadPage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onEndReached = useCallback(() => {
    if (nextCursor && !loading) loadPage(nextCursor);
  }, [nextCursor, loading, loadPage]);

  // We measure ourselves rather than receiving height as a prop — the parent
  // sizes us via flex/alignItems, and depending on a prop here was what caused
  // the previous render-loop where each cycle added the border thickness.
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const rowHeight = Math.floor(Math.max(32, (measuredHeight - PANEL_CHROME) / VISIBLE_ROWS));

  const isUnseen = (createdAt: string) =>
    thresholdRef.current === null || createdAt > thresholdRef.current;

  const renderItem = ({ item }: { item: CommentReceivedOut }) => {
    const unseen = isUnseen(item.created_at);
    const who = item.commenter_firstname || item.commenter_username;
    return (
      <Pressable
        onPress={() => onTapComment(item)}
        style={[
          styles.row,
          { height: rowHeight, backgroundColor: unseen ? Colors.primaryGold : Colors.mainBg },
        ]}
      >
        <Text style={styles.rowText} numberOfLines={2} ellipsizeMode="tail">
          <Text style={styles.who}>{who}</Text>
          <Text style={styles.metaSep}> on </Text>
          <Text style={styles.artTitle}>{item.art_title || 'Untitled'}</Text>
          {'  '}
          <Text style={styles.commentText}>{item.text}</Text>
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      style={styles.block}
      onLayout={(e) => setMeasuredHeight(e.nativeEvent.layout.height)}
    >
      {initialLoaded && items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>ppls comments on ur posts will appear here</Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={items}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loading && initialLoaded ? (
              <View style={styles.footer}>
                <ActivityIndicator size="small" />
              </View>
            ) : null
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    flex: 1,
    padding: 10,
  },
  list: {
    flex: 1,
  },
  row: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#000',
  },
  rowText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.textPrimary,
  },
  who: {
    fontWeight: '600',
  },
  metaSep: {
    color: Colors.textTertiary,
  },
  artTitle: {
    fontStyle: 'italic',
  },
  commentText: {
    color: Colors.textSecondary,
  },
  footer: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.black,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
});
