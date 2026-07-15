import { createContext, useContext, useState, ReactNode } from "react";
import { apiRequest, setAuthToken, queryClient } from "./queryClient";
import type { SafeUser } from "@shared/schema";

interface AuthContextValue {
  user: SafeUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string,
    secrets: { secretQ1: string; secretA1: string; secretQ2: string; secretA2: string }
  ) => Promise<{ autoApproved: boolean; emailSent: boolean }>;
  logout: () => void;
  updateUser: (u: SafeUser) => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  login: async () => {},
  register: async () => ({ autoApproved: false, emailSent: false }),
  logout: () => {},
  updateUser: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);

  const login = async (email: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
    const data = await res.json();
    setAuthToken(data.token);
    setUser(data.user);
    queryClient.invalidateQueries();
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    secrets: { secretQ1: string; secretA1: string; secretQ2: string; secretA2: string }
  ) => {
    const res = await apiRequest("POST", "/api/auth/register", { name, email, password, ...secrets });
    const data = await res.json();
    return { autoApproved: Boolean(data.autoApproved), emailSent: Boolean(data.emailSent) };
  };

  const logout = () => {
    apiRequest("POST", "/api/auth/logout").catch(() => {});
    setAuthToken(null);
    setUser(null);
    queryClient.invalidateQueries();
  };

  const updateUser = (u: SafeUser) => setUser(u);

  return (
    <AuthContext.Provider value={{ user, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
