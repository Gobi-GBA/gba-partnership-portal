import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { apiRequest, setAuthToken, queryClient } from "./queryClient";
import { safeGet, safeSet, safeRemove, TOKEN_KEY } from "./storage";
import type { SafeUser } from "@shared/schema";

interface AuthContextValue {
  user: SafeUser | null;
  restoring: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
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
  restoring: false,
  login: async () => {},
  register: async () => ({ autoApproved: false, emailSent: false }),
  logout: () => {},
  updateUser: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [restoring, setRestoring] = useState(() => Boolean(safeGet(TOKEN_KEY)));

  // Remember me: restore the saved session on app start.
  useEffect(() => {
    const saved = safeGet(TOKEN_KEY);
    if (!saved) return;
    setAuthToken(saved);
    apiRequest("GET", "/api/auth/me")
      .then(async (res) => {
        const data = await res.json();
        setUser(data.user);
      })
      .catch(() => {
        setAuthToken(null);
        safeRemove(TOKEN_KEY);
      })
      .finally(() => setRestoring(false));
  }, []);

  const login = async (email: string, password: string, remember = false) => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
    const data = await res.json();
    setAuthToken(data.token);
    setUser(data.user);
    if (remember) safeSet(TOKEN_KEY, data.token);
    else safeRemove(TOKEN_KEY);
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
    safeRemove(TOKEN_KEY);
    setUser(null);
    queryClient.invalidateQueries();
  };

  const updateUser = (u: SafeUser) => setUser(u);

  return (
    <AuthContext.Provider value={{ user, restoring, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
