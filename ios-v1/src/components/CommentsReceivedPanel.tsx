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
// Just the block's own padding now (4 top + 4 bottom). The "Comments" label
// and divider were removed at the parent's request — the surrounding bordered
// page already frames the list visually. Trimmed from 10 → 4 to give the
// bordered rows more horizontal room.
const PANEL_CHROME = 8;
// Small visual gap between bordered rows so they read as separate tiles
// rather than one continuous list. Matches the rest of the app's spacing.
const ROW_GAP = 4;

interface CommentsReceivedPanelProps {
  // The row height this panel is pinned to by the parent carousel (measured
  // from the artist-statement page). We derive rowHeight from this instead of
  // measuring ourselves — self-measurement fed back into the shared row height
  // and made the statement box oscillate.
  height: number;
  // Fires when the user taps a comment. Caller is responsible for routing to
  // the art piece (set medium, scroll to artId).
  onTapComment: (c: CommentReceivedOut) => void;
}

export default function CommentsReceivedPanel({ height, onTapComment }: CommentsReceivedPanelProps) {
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

  // Row height derived from the fixed height the parent pins us to. 4 bordered
  // rows + 3 gaps between them = available list height. ROW_GAP is applied via
  // marginBottom on each row (we tolerate one extra trailing gap because it
  // just lands inside the scrollable area).
  const rowHeight = Math.floor(
    Math.max(36, (height - PANEL_CHROME - VISIBLE_ROWS * ROW_GAP) / VISIBLE_ROWS),
  );

  const isUnseen = (createdAt: string) =>
    thresholdRef.current === null || createdAt > thresholdRef.current;

  const renderItem = ({ item }: { item: CommentReceivedOut }) => {
    const unseen = isUnseen(item.created_at);
    return (
      <Pressable
        onPress={() => onTapComment(item)}
        style={[
          styles.row,
          { height: rowHeight, backgroundColor: unseen ? Colors.primaryGold : Colors.secondary },
        ]}
      >
        {/* Comment text takes the remaining row width and truncates with an
            ellipsis if it doesn't fit. The " -username" tag is fixed-width on
            the right so it's always visible. Tap routes to the art piece
            (parent handles the medium switch + scroll). */}
        <Text style={styles.commentText} numberOfLines={1} ellipsizeMode="tail">
          {item.text}
        </Text>
        <Text style={styles.commenterTag} numberOfLines={1}>
          {` -${item.commenter_username}`}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.block}>
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
    padding: 4,
  },
  list: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#000',
    marginBottom: ROW_GAP,
  },
  commentText: {
    flex: 1,
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.black,
    textAlign: 'left',
  },
  commenterTag: {
    fontFamily: Fonts.serif,
    fontSize: FontSizes.xs,
    color: Colors.black,
    marginLeft: 4,
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
