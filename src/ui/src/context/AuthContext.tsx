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
    sessionStorage.getItem("username")
  );
  const [currentRole, setCurrentRole] = useState<string | null>(
    sessionStorage.getItem("role")
  );

  const login = (user: string, token: string, role: string) => {
    setCurrentUser(user);
    setCurrentRole(role);
    sessionStorage.setItem("token", token);
    sessionStorage.setItem("username", user);
    sessionStorage.setItem("role", role);
    console.log("stored username and token in browser");
  };

  const logout = () => {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("username");
    sessionStorage.removeItem("role");
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
