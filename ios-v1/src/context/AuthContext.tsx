import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { get_blocks, refresh_token } from '../api';

interface AuthContextType {
  currentUser: string | null;
  currentRole: string | null;
  token: string | null;
  isLoading: boolean;
  blockedUsernames: string[];
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
              if (res?.access_token) {
                await SecureStore.setItemAsync('token', res.access_token);
                setToken(res.access_token);
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

  const login = useCallback(async (user: string, tok: string, role: string) => {
    await SecureStore.setItemAsync('token', tok);
    await SecureStore.setItemAsync('username', user);
    await SecureStore.setItemAsync('role', role);
    setToken(tok);
    setCurrentUser(user);
    setCurrentRole(role);
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
