import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';

interface AuthContextType {
  currentUser: string | null;
  currentRole: string | null;
  token: string | null;
  isLoading: boolean;
  login: (user: string, token: string, role: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  currentRole: null,
  token: null,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
        }
      } catch {
        // ignore hydration errors
      } finally {
        setIsLoading(false);
      }
    };
    hydrate();
  }, []);

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
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, currentRole, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
