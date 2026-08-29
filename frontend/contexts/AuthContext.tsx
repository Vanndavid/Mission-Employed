import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AuthUser } from '../types/auth';
import { isPremiumUser } from '../types/auth';
import {
  fetchMe,
  getStoredToken,
  loginAccount,
  registerAccount,
  setStoredToken,
} from '../services/authClient';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  isPremium: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { user: me } = await fetchMe();
      setUser(me);
    } catch {
      setStoredToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const result = await loginAccount(email, password);
    setStoredToken(result.token);
    setUser(result.user);
  };

  const register = async (email: string, password: string) => {
    const result = await registerAccount(email, password);
    setStoredToken(result.token);
    setUser(result.user);
  };

  const logout = () => {
    setStoredToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
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
