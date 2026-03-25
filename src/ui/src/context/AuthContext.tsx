import { createContext, useState, useContext, ReactNode } from "react";

interface AuthContextType {
  currentUser: string | null;
  login: (user: string, token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<string | null>(
    sessionStorage.getItem("username")
  );
  
  const login = (user: string, token: string) => {
    setCurrentUser(user);
    sessionStorage.setItem("token", token);
    sessionStorage.setItem("username", user);
    console.log("stored username and token in browser");
  };

  const logout = () => {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("username");
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
