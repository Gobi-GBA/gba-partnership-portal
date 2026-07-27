import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { apiRequest, queryClient } from "./queryClient";
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
  ) => Promise<{ autoApproved: boolean; emailSent: boolean; loggedIn: boolean }>;
  logout: () => void;
  updateUser: (u: SafeUser) => void;
}

// v6.0: warm the hot lists right after sign-in so Partners / Advisors /
// Network open instantly instead of showing skeletons for seconds.
function prefetchHotData() {
  for (const key of ["/api/partnerships", "/api/advisors"]) {
    queryClient.prefetchQuery({ queryKey: [key] }).catch(() => {});
  }
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  restoring: false,
  login: async () => {},
  register: async () => ({ autoApproved: false, emailSent: false, loggedIn: false }),
  logout: () => {},
  updateUser: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [restoring, setRestoring] = useState(true);

  // Restore the cookie-backed session on app start.
  useEffect(() => {
    apiRequest("GET", "/api/auth/me")
      .then(async (res) => {
        const data = await res.json();
        setUser(data.user);
        prefetchHotData();
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setRestoring(false));
  }, []);

  const login = async (email: string, password: string, remember = false) => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password, remember });
    const data = await res.json();
    setUser(data.user);
    queryClient.invalidateQueries();
    prefetchHotData();
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    secrets: { secretQ1: string; secretA1: string; secretQ2: string; secretA2: string }
  ) => {
    const res = await apiRequest("POST", "/api/auth/register", { name, email, password, ...secrets });
    const data = await res.json();
    // Auto-approved colleagues are signed in on the spot via a cookie-backed session.
    if (data.loggedIn) {
      setUser(data.user);
      queryClient.invalidateQueries();
      prefetchHotData();
    }
    return { autoApproved: Boolean(data.autoApproved), emailSent: Boolean(data.emailSent), loggedIn: Boolean(data.loggedIn) };
  };

  const logout = () => {
    apiRequest("POST", "/api/auth/logout").catch(() => {});
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
