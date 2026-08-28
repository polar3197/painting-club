import { createContext, useState, useContext, ReactNode, useEffect, useCallback, useRef } from "react";
import { get_blocks, get_profile, refresh_token } from "../api";
import { readSession, writeSession, updateSession, clearSession } from "../session";

interface AuthContextType {
  // Session token, null when logged out. Components pass this to api calls
  // instead of reading storage themselves; session.ts owns persistence.
  token: string | null;
  currentUser: string | null;
  currentRole: string | null;
  blockedUsernames: string[];
  login: (user: string, token: string, role: string) => void;
  logout: () => void;
  refreshBlocks: () => Promise<void>;
  noteBlocked: (username: string) => void;
  noteUnblocked: (username: string) => void;
  // Per-member cache-bust counters. Bump on profile-pic re-upload so the same
  // canonical URL (`/static/profile/<id>.<ext>`) refetches.
  profilePicVersions: Record<string, number>;
  bumpProfilePic: (memberId: string) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readSession().token);
  const [currentUser, setCurrentUser] = useState<string | null>(() => readSession().username);
  const [currentRole, setCurrentRole] = useState<string | null>(() => readSession().role);
  const [blockedUsernames, setBlockedUsernames] = useState<string[]>([]);
  const [profilePicVersions, setProfilePicVersions] = useState<Record<string, number>>({});

  // Sliding session, mirroring the iOS app: on load — and when the tab comes
  // back after a day away — exchange the stored token for a fresh one so an
  // active member never reaches the JWT expiry. Before this the web never
  // refreshed, so every session died a fixed time after login regardless of
  // use. Failures are non-fatal: the stored token keeps working until it
  // actually expires (and a real 401 is handled by api.ts). Reads the stored
  // session rather than state so the effect isn't keyed on the token — a
  // refreshed token must not re-trigger it.
  const lastRefreshRef = useRef(0);
  useEffect(() => {
    const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;
    let cancelled = false;
    const refresh = async () => {
      const { token: tok, username: user, role } = readSession();
      if (!tok || !user) return;
      lastRefreshRef.current = Date.now();
      try {
        const res = await refresh_token(tok);
        if (cancelled || !res?.access_token) return;
        updateSession({ token: res.access_token });
        setToken(res.access_token);
        // Sync the role so a promotion shows up without a re-login.
        try {
          const profile = await get_profile(user, res.access_token);
          if (!cancelled && profile?.role && profile.role !== role) {
            updateSession({ role: profile.role });
            setCurrentRole(profile.role);
          }
        } catch {
          // offline / transient — keep the cached role
        }
      } catch {
        // keep the stored token; api.ts already cleared it if this was a 401
      }
    };
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRefreshRef.current > REFRESH_AFTER_MS) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  const bumpProfilePic = useCallback((memberId: string) => {
    setProfilePicVersions((prev) => ({ ...prev, [memberId]: Date.now() }));
  }, []);

  const refreshBlocks = useCallback(async () => {
    if (!token) {
      setBlockedUsernames([]);
      return;
    }
    try {
      const list = await get_blocks(token);
      setBlockedUsernames(list);
    } catch {
      // non-fatal — kebab UI just won't show "unblock" until next refresh
    }
  }, [token]);

  // Refresh blocks whenever the logged-in user changes (covers both initial mount
  // with a hydrated localStorage token and a fresh post-login state).
  useEffect(() => {
    if (currentUser) refreshBlocks();
    else setBlockedUsernames([]);
  }, [currentUser, refreshBlocks]);

  const login = (user: string, newToken: string, role: string) => {
    writeSession({ token: newToken, username: user, role });
    setToken(newToken);
    setCurrentUser(user);
    setCurrentRole(role);
    console.log("stored username and token in browser");
  };

  const logout = () => {
    clearSession();
    setToken(null);
    setCurrentUser(null);
    setCurrentRole(null);
    setBlockedUsernames([]);
  };

  const noteBlocked = (username: string) => {
    setBlockedUsernames((prev) => (prev.includes(username) ? prev : [...prev, username]));
  };

  const noteUnblocked = (username: string) => {
    setBlockedUsernames((prev) => prev.filter((u) => u !== username));
  };

  return (
    <AuthContext.Provider
      value={{ token, currentUser, currentRole, blockedUsernames, login, logout, refreshBlocks, noteBlocked, noteUnblocked, profilePicVersions, bumpProfilePic }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Kept alongside the provider so every consumer imports from one place. The
// react-refresh rule only concerns HMR granularity, not correctness.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
