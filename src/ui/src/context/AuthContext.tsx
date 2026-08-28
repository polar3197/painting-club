import { createContext, useState, useContext, ReactNode, useEffect, useCallback } from "react";
import { get_blocks } from "../api";

interface AuthContextType {
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
  const [currentUser, setCurrentUser] = useState<string | null>(
    localStorage.getItem("username")
  );
  const [currentRole, setCurrentRole] = useState<string | null>(
    localStorage.getItem("role")
  );
  const [blockedUsernames, setBlockedUsernames] = useState<string[]>([]);
  const [profilePicVersions, setProfilePicVersions] = useState<Record<string, number>>({});

  const bumpProfilePic = useCallback((memberId: string) => {
    setProfilePicVersions((prev) => ({ ...prev, [memberId]: Date.now() }));
  }, []);

  const refreshBlocks = useCallback(async () => {
    const tok = localStorage.getItem("token");
    if (!tok) {
      setBlockedUsernames([]);
      return;
    }
    try {
      const list = await get_blocks(tok);
      setBlockedUsernames(list);
    } catch {
      // non-fatal — kebab UI just won't show "unblock" until next refresh
    }
  }, []);

  // Refresh blocks whenever the logged-in user changes (covers both initial mount
  // with a hydrated localStorage token and a fresh post-login state).
  useEffect(() => {
    if (currentUser) refreshBlocks();
    else setBlockedUsernames([]);
  }, [currentUser, refreshBlocks]);

  const login = (user: string, token: string, role: string) => {
    localStorage.setItem("token", token);
    localStorage.setItem("username", user);
    localStorage.setItem("role", role);
    setCurrentUser(user);
    setCurrentRole(role);
    console.log("stored username and token in browser");
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("role");
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
      value={{ currentUser, currentRole, blockedUsernames, login, logout, refreshBlocks, noteBlocked, noteUnblocked, profilePicVersions, bumpProfilePic }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Kept alongside the provider so every consumer imports from one place. The
// react-refresh rule only concerns HMR granularity, not correctness.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
