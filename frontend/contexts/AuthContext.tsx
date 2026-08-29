import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AuthUser, isPremiumUser } from '../types/auth';
import {
  fetchMe,
  getStoredToken,
  loginAccount,
  logoutAccount,
  registerAccount,
  setStoredToken,
} from '../services/authClient';
import { setUnauthorizedHandler } from '../services/http';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  isPremium: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  /** Drop the session locally. Used on sign-out and on any 401. */
  const clearSession = useCallback(() => {
    setStoredToken(null);
    setUser(null);
  }, []);

  // A 401 from anywhere means the token is dead — expired, revoked, or from a
  // database that has been rebuilt. Handling it once here is what stops every
  // screen from having to notice.
  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    if (!getStoredToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { user: me } = await fetchMe();
      setUser(me);
    } catch {
      clearSession();
    } finally {
      setLoading(false);
    }
  }, [clearSession]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginAccount(email, password);
    setStoredToken(result.token);
    setUser(result.user);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const result = await registerAccount(email, password);
    setStoredToken(result.token);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      // Revokes this token server-side; signing out on a laptop must not sign
      // the same account out on a phone.
      await logoutAccount();
    } catch {
      // An unreachable server is no reason to keep someone signed in locally.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        // The same rule the server enforces in User::isPremium(): a premium
        // plan OR an admin role. Client-side gating is a courtesy, not the
        // boundary.
        isPremium: isPremiumUser(user),
        isAdmin: user?.role === 'admin',
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
