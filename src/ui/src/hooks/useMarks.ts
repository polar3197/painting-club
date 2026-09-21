import { useEffect, useState } from "react";
import {
  add_bookmark,
  list_my_bookmarks,
  list_wall_pins,
  remove_bookmark,
  toggle_wall_pin,
  WallType,
} from "../profileApi";

// Module stores for the two per-piece marks the profile cards show — the
// signed-in member's bookmarks and everyone's wall pins — so every card shares
// one fetch and flips instantly (optimistic, reverted on failure).

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

let bookmarks = new Set<string>();
let bookmarksLoaded: Promise<void> | null = null;

// key `${username}::${type}` -> art id
let pins: Record<string, string> = {};
let pinsLoaded: Promise<void> | null = null;
const pinKey = (username: string, type: WallType) => `${username.toLowerCase()}::${type}`;

function loadBookmarks() {
  bookmarksLoaded ??= list_my_bookmarks()
    .then((rows) => { bookmarks = new Set(rows.map((r) => r.art_id)); notify(); })
    .catch(() => { bookmarksLoaded = null; });
}

function loadPins() {
  pinsLoaded ??= list_wall_pins()
    .then((rows) => {
      pins = {};
      for (const r of rows) pins[pinKey(r.username, r.art_type)] = r.art_id;
      notify();
    })
    .catch(() => { pinsLoaded = null; });
}

function useStore() {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
}

export function useBookmarked(artIds: string[]): [boolean, () => void] {
  useStore();
  useEffect(loadBookmarks, []);
  const on = artIds.length > 0 && artIds.every((id) => bookmarks.has(id));
  const toggle = () => {
    const next = !on;
    const before = new Set(bookmarks);
    for (const id of artIds) {
      if (next) bookmarks.add(id);
      else bookmarks.delete(id);
    }
    notify();
    Promise.all(artIds.map((id) => (next ? add_bookmark(id) : remove_bookmark(id)))).catch(() => {
      bookmarks = before;
      notify();
    });
  };
  return [on, toggle];
}

export function useWallPin(username: string, type: WallType, artId: string): [boolean, () => void] {
  useStore();
  useEffect(loadPins, []);
  const k = pinKey(username, type);
  const pinned = pins[k] === artId;
  const toggle = () => {
    const prev = pins[k];
    if (pinned) delete pins[k];
    else pins[k] = artId;
    notify();
    toggle_wall_pin(artId)
      .then(({ pinned: now }) => {
        if (now) pins[k] = artId;
        else if (pins[k] === artId) delete pins[k];
        notify();
      })
      .catch(() => {
        if (prev) pins[k] = prev;
        else delete pins[k];
        notify();
      });
  };
  return [pinned, toggle];
}

/** The art id this member pinned for this wall type (floats to the list top). */
export function usePinnedId(username: string, type: WallType): string | null {
  useStore();
  useEffect(loadPins, []);
  return pins[pinKey(username, type)] ?? null;
}
