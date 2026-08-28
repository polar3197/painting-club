import { createContext, useState, useContext, ReactNode, useEffect, useCallback } from "react";
import { get_blocks } from "../api";
import { readSession, writeSession, clearSession } from "../session";

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
