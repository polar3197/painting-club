import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { list_my_bookmarks, add_bookmark, remove_bookmark } from '../api';
import { useAuth } from './AuthContext';
import { showToast } from '../components/Toast';

// Single source of truth for which art the viewer has bookmarked, so every
// bookmark button across the app can render its saved/unsaved state and toggle
// without each one fetching. The id set is seeded from the viewer's own
// bookmarks list (which returns art ids), so it works without any per-piece
// backend flag.

interface BookmarkContextValue {
  bookmarkedIds: Set<string>;
  isBookmarked: (id: string) => boolean;
  // Toggle one piece or a whole collection. A collection (multiple ids) is
  // treated as saved only when every piece is saved: tapping an all-saved
  // collection removes all; otherwise it adds the missing ones.
  toggle: (ids: string[]) => Promise<void>;
  refresh: () => Promise<void>;
}

const BookmarkContext = createContext<BookmarkContextValue | null>(null);

export function BookmarkProvider({ children }: { children: React.ReactNode }) {
  const { token, currentUser } = useAuth();
  const [ids, setIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!token) {
      setIds(new Set());
      return;
    }
    try {
      const items = await list_my_bookmarks(token);
      setIds(new Set(items.map((i) => i.art_id)));
    } catch {
      // Keep the last-known set on a failed refresh.
    }
  }, [token]);

  // Reload whenever the signed-in member changes (login / logout / switch).
  useEffect(() => {
    refresh();
  }, [refresh, currentUser]);

  const isBookmarked = useCallback((id: string) => ids.has(id), [ids]);

  const toggle = useCallback(
    async (targetIds: string[]) => {
      if (targetIds.length === 0) return;
      const allSaved = targetIds.every((id) => ids.has(id));

      // Optimistic flip so the button reflects the new state instantly.
      setIds((prev) => {
        const next = new Set(prev);
        if (allSaved) targetIds.forEach((id) => next.delete(id));
        else targetIds.forEach((id) => next.add(id));
        return next;
      });

      try {
        if (allSaved) {
          await Promise.all(targetIds.map((id) => remove_bookmark(id, token)));
          showToast('removed');
        } else {
          const toAdd = targetIds.filter((id) => !ids.has(id));
          await Promise.all(toAdd.map((id) => add_bookmark(id, token)));
          showToast('bookmarked');
        }
      } catch {
        showToast("couldn't save");
        // Re-sync from the server so the optimistic flip doesn't stick on error.
        refresh();
      }
    },
    [ids, token, refresh],
  );

  return (
    <BookmarkContext.Provider value={{ bookmarkedIds: ids, isBookmarked, toggle, refresh }}>
      {children}
    </BookmarkContext.Provider>
  );
}

export function useBookmarks(): BookmarkContextValue {
  const ctx = useContext(BookmarkContext);
  if (!ctx) throw new Error('useBookmarks must be used within a BookmarkProvider');
  return ctx;
}
