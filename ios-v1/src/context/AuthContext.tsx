import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { get_blocks, refresh_token, get_profile, setAuthToken } from '../api';
import { setObservabilityToken, recordLogin } from '../api/observability';

interface AuthContextType {
  currentUser: string | null;
  currentRole: string | null;
  token: string | null;
  isLoading: boolean;
  blockedUsernames: string[];
  // The current user's shown media (artforms), prefetched at launch so surfaces
  // like the Share tab render their medium grid on first frame instead of
  // flashing empty while a per-entry profile fetch resolves. Screens that mutate
  // media push the updated list back via setMyMedia (see AddArt), which also
  // makes their focus-refetch double as a revalidate.
  myMedia: string[];
  setMyMedia: (media: string[]) => void;
  login: (user: string, token: string, role: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshBlocks: () => Promise<void>;
  noteBlocked: (username: string) => void;
  noteUnblocked: (username: string) => void;
  // Set to true on first-time login (after SetupAccount). A global modal in
  // App.tsx watches this and prompts the new user to upload a profile pic.
  // The modal clears the flag on dismiss or upload — kept off this context
  // for the rest of the session.
  needsProfilePicPrompt: boolean;
  triggerProfilePicPrompt: () => void;
  dismissProfilePicPrompt: () => void;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  currentRole: null,
  token: null,
  isLoading: true,
  blockedUsernames: [],
  myMedia: [],
  setMyMedia: () => {},
  login: async () => {},
  logout: async () => {},
  refreshBlocks: async () => {},
  noteBlocked: () => {},
  noteUnblocked: () => {},
  needsProfilePicPrompt: false,
  triggerProfilePicPrompt: () => {},
  dismissProfilePicPrompt: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [blockedUsernames, setBlockedUsernames] = useState<string[]>([]);
  const [myMedia, setMyMedia] = useState<string[]>([]);
  const [needsProfilePicPrompt, setNeedsProfilePicPrompt] = useState(false);

  const triggerProfilePicPrompt = useCallback(() => setNeedsProfilePicPrompt(true), []);
  const dismissProfilePicPrompt = useCallback(() => setNeedsProfilePicPrompt(false), []);

  const refreshBlocks = useCallback(async () => {
    try {
      const list = await get_blocks(token);
      setBlockedUsernames(list);
    } catch {
      // non-fatal — kebab UI just won't show "unblock" until next refresh
    }
  }, [token]);

  useEffect(() => {
    const hydrate = async () => {
      try {
        const storedToken = await SecureStore.getItemAsync('token');
        const storedUser = await SecureStore.getItemAsync('username');
        const storedRole = await SecureStore.getItemAsync('role');
        if (storedToken && storedUser) {
          setToken(storedToken);
          setCurrentUser(storedUser);
          setCurrentRole(storedRole);
          // Sliding session: swap the stored token for a fresh 30-day one on
          // every launch, so active members never hit the JWT expiry. Failures
          // are non-fatal — the stored token keeps working until it expires.
          refresh_token(storedToken)
            .then(async (res) => {
              const freshToken = res?.access_token || storedToken;
              if (res?.access_token) {
                await SecureStore.setItemAsync('token', res.access_token);
                setToken(res.access_token);
              }
              // Sync role from the server so a role change (e.g. promotion to
              // contributor) shows up without a full re-login.
              try {
                const profile = await get_profile(storedUser, freshToken);
                if (profile?.role && profile.role !== storedRole) {
                  await SecureStore.setItemAsync('role', profile.role);
                  setCurrentRole(profile.role);
                }
              } catch {
                // offline / transient — keep the cached role
              }
            })
            .catch(() => {});
        }
      } catch {
        // ignore hydration errors
      } finally {
        setIsLoading(false);
      }
    };
    hydrate();
  }, []);

  // Pull the blocks list whenever a fresh token lands (post-login or post-hydrate).
  useEffect(() => {
    if (token) refreshBlocks();
    else setBlockedUsernames([]);
  }, [token, refreshBlocks]);

  // Prefetch the current user's media list whenever auth is established (hydrate
  // or login), and clear it on logout. This is the cache the Share tab reads for
  // an instant medium grid; the screens that change media keep it fresh.
  useEffect(() => {
    if (!currentUser || !token) {
      setMyMedia([]);
      return;
    }
    let live = true;
    get_profile(currentUser, token)
      .then((p) => { if (live) setMyMedia(p.media ?? []); })
      .catch(() => {
        // non-fatal — the Share tab's own focus-refetch will seed it instead
      });
    return () => { live = false; };
  }, [currentUser, token]);

  // Keep the telemetry transport's token in sync with auth state so usage +
  // device events can flush (and get cleared on logout).
  useEffect(() => {
    setObservabilityToken(token);
    // Default bearer for token-less API calls (search, member art) now that the
    // art routes are member-gated.
    setAuthToken(token);
  }, [token]);

  const login = useCallback(async (user: string, tok: string, role: string) => {
    await SecureStore.setItemAsync('token', tok);
    await SecureStore.setItemAsync('username', user);
    await SecureStore.setItemAsync('role', role);
    setToken(tok);
    setCurrentUser(user);
    setCurrentRole(role);
    // Record the login for the behavioral trail (#5). The effect above sets the
    // transport token synchronously enough that the flush picks it up; if not,
    // it stays queued and flushes with the next screen event.
    setObservabilityToken(tok);
    recordLogin();
  }, []);

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync('token');
    await SecureStore.deleteItemAsync('username');
    await SecureStore.deleteItemAsync('role');
    setToken(null);
    setCurrentUser(null);
    setCurrentRole(null);
    setBlockedUsernames([]);
  }, []);

  const noteBlocked = useCallback((username: string) => {
    setBlockedUsernames((prev) => (prev.includes(username) ? prev : [...prev, username]));
  }, []);

  const noteUnblocked = useCallback((username: string) => {
    setBlockedUsernames((prev) => prev.filter((u) => u !== username));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentRole,
        token,
        isLoading,
        blockedUsernames,
        myMedia,
        setMyMedia,
        login,
        logout,
        refreshBlocks,
        noteBlocked,
        noteUnblocked,
        needsProfilePicPrompt,
        triggerProfilePicPrompt,
        dismissProfilePicPrompt,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
