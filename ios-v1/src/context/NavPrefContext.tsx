import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

// Top-level nav shell. 'tabs' is the shipped bottom-tab nav (what members see).
// 'swipeA'/'swipeB' are the swipe-nav prototypes behind a contributor toggle.
export type NavModel = 'tabs' | 'swipeA' | 'swipeB';
// Per-surface prototype selectors, also contributor-only. 'default' keeps the
// shipped screen; A/B/C are the experiments compared on-device.
export type EventsVariant = 'default' | 'A' | 'B' | 'C';
export type PromptVariant = 'default' | 'A' | 'B' | 'C';
export type HomeBorderVariant = 'off' | 'on';
export type FeedVariant = 'web' | 'insta';
// User-facing toggle in the everything search bar: the classic grid vs the feed.
export type EverythingView = 'grid' | 'feed';
// Contributor-only prototypes for the "browse art by medium" page.
export type ArtBrowse = 'off' | 'A' | 'B' | 'C' | 'D';

const KEYS = {
  navModel: 'nav_model',
  eventsVariant: 'events_variant',
  promptVariant: 'prompt_variant',
  homeBorderVariant: 'home_border_variant',
  feedVariant: 'feed_variant',
  everythingView: 'everything_view',
  artBrowse: 'art_browse',
} as const;

type NavPrefValue = {
  navModel: NavModel;
  setNavModel: (m: NavModel) => void;
  eventsVariant: EventsVariant;
  setEventsVariant: (v: EventsVariant) => void;
  promptVariant: PromptVariant;
  setPromptVariant: (v: PromptVariant) => void;
  homeBorderVariant: HomeBorderVariant;
  setHomeBorderVariant: (v: HomeBorderVariant) => void;
  feedVariant: FeedVariant;
  setFeedVariant: (v: FeedVariant) => void;
  everythingView: EverythingView;
  setEverythingView: (v: EverythingView) => void;
  artBrowse: ArtBrowse;
  setArtBrowse: (v: ArtBrowse) => void;
  // False until persisted values are read, so the root nav avoids a first-frame
  // flash of the wrong shell.
  ready: boolean;
};

const NavPrefContext = createContext<NavPrefValue>({
  navModel: 'swipeB',
  setNavModel: () => {},
  eventsVariant: 'default',
  setEventsVariant: () => {},
  promptVariant: 'C',
  setPromptVariant: () => {},
  homeBorderVariant: 'on',
  setHomeBorderVariant: () => {},
  feedVariant: 'insta',
  setFeedVariant: () => {},
  everythingView: 'feed',
  setEverythingView: () => {},
  artBrowse: 'off',
  setArtBrowse: () => {},
  ready: false,
});

// Small helper: state + persisted setter for one string-union pref.
function usePersistedPref<T extends string>(key: string, allowed: readonly T[], initial: T) {
  const [value, setValue] = useState<T>(initial);
  const set = useCallback((v: T) => {
    setValue(v);
    SecureStore.setItemAsync(key, v).catch(() => {});
  }, [key]);
  const load = useCallback(async () => {
    try {
      const stored = await SecureStore.getItemAsync(key);
      if (stored && (allowed as readonly string[]).includes(stored)) setValue(stored as T);
    } catch {
      // fall back to initial
    }
  }, [key, allowed]);
  return { value, set, load };
}

export function NavPrefProvider({ children }: { children: React.ReactNode }) {
  // Defaults are what every user sees (the Settings selectors are contributor-
  // only overrides). Set to the chosen live experience: swipe-B hub, default
  // events, prompt C, home border on, and the everything page defaulting to the
  // insta feed.
  const nav = usePersistedPref<NavModel>(KEYS.navModel, ['tabs', 'swipeA', 'swipeB'], 'swipeB');
  const events = usePersistedPref<EventsVariant>(KEYS.eventsVariant, ['default', 'A', 'B', 'C'], 'default');
  const prompt = usePersistedPref<PromptVariant>(KEYS.promptVariant, ['default', 'A', 'B', 'C'], 'C');
  const border = usePersistedPref<HomeBorderVariant>(KEYS.homeBorderVariant, ['off', 'on'], 'on');
  const feed = usePersistedPref<FeedVariant>(KEYS.feedVariant, ['web', 'insta'], 'insta');
  const everything = usePersistedPref<EverythingView>(KEYS.everythingView, ['grid', 'feed'], 'feed');
  const artBrowse = usePersistedPref<ArtBrowse>(KEYS.artBrowse, ['off', 'A', 'B', 'C', 'D'], 'off');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.all([nav.load(), events.load(), prompt.load(), border.load(), feed.load(), everything.load(), artBrowse.load()]);
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <NavPrefContext.Provider
      value={{
        navModel: nav.value,
        setNavModel: nav.set,
        eventsVariant: events.value,
        setEventsVariant: events.set,
        promptVariant: prompt.value,
        setPromptVariant: prompt.set,
        homeBorderVariant: border.value,
        setHomeBorderVariant: border.set,
        feedVariant: feed.value,
        setFeedVariant: feed.set,
        everythingView: everything.value,
        setEverythingView: everything.set,
        artBrowse: artBrowse.value,
        setArtBrowse: artBrowse.set,
        ready,
      }}
    >
      {children}
    </NavPrefContext.Provider>
  );
}

export function useNavPref() {
  return useContext(NavPrefContext);
}
