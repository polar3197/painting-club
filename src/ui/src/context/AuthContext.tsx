import { createContext, useState, useContext, ReactNode } from "react";

interface AuthContextType {
  currentUser: string | null;
  currentRole: string | null;
  login: (user: string, token: string, role: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<string | null>(
    localStorage.getItem("username")
  );
  const [currentRole, setCurrentRole] = useState<string | null>(
    localStorage.getItem("role")
  );

  const login = (user: string, token: string, role: string) => {
    setCurrentUser(user);
    setCurrentRole(role);
    localStorage.setItem("token", token);
    localStorage.setItem("username", user);
    localStorage.setItem("role", role);
    console.log("stored username and token in browser");
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    localStorage.removeItem("role");
    setCurrentUser(null);
    setCurrentRole(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, currentRole, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
