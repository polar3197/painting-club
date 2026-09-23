import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

// Which top-level navigation shell to render. 'tabs' is the shipped bottom-tab
// nav (what every member sees). 'swipeA'/'swipeB' are the two swipe-nav
// prototypes, exposed behind a contributor-only toggle so they can be compared
// on-device via one OTA without changing what members see.
export type NavModel = 'tabs' | 'swipeA' | 'swipeB';

const STORE_KEY = 'nav_model';

type NavPrefValue = {
  navModel: NavModel;
  setNavModel: (m: NavModel) => void;
  // False until the persisted value has been read, so the root navigator can
  // avoid a first-frame flash of the wrong shell.
  ready: boolean;
};

const NavPrefContext = createContext<NavPrefValue>({
  navModel: 'tabs',
  setNavModel: () => {},
  ready: false,
});

export function NavPrefProvider({ children }: { children: React.ReactNode }) {
  const [navModel, setNavModelState] = useState<NavModel>('tabs');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(STORE_KEY);
        if (alive && (stored === 'tabs' || stored === 'swipeA' || stored === 'swipeB')) {
          setNavModelState(stored);
        }
      } catch {
        // Non-fatal: fall back to the default 'tabs' shell.
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const setNavModel = useCallback((m: NavModel) => {
    setNavModelState(m);
    SecureStore.setItemAsync(STORE_KEY, m).catch(() => {
      // Non-fatal: the in-memory switch still takes effect this session.
    });
  }, []);

  return (
    <NavPrefContext.Provider value={{ navModel, setNavModel, ready }}>
      {children}
    </NavPrefContext.Provider>
  );
}

export function useNavPref() {
  return useContext(NavPrefContext);
}
