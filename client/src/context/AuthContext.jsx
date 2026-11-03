import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

const AuthContext = createContext(null);

const readStore = (key) => localStorage.getItem(key) || sessionStorage.getItem(key);
const clearStore = () => {
  localStorage.removeItem('aurora_token');
  localStorage.removeItem('aurora_user');
  sessionStorage.removeItem('aurora_token');
  sessionStorage.removeItem('aurora_user');
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(readStore('aurora_user') || 'null');
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => readStore('aurora_token'));
  const [booting, setBooting] = useState(Boolean(readStore('aurora_token')));

  const logout = useCallback(() => {
    clearStore();
    setToken(null);
    setUser(null);
  }, []);

  const login = useCallback(async (email, password, remember = true) => {
    const data = await api.post('/auth/login', { email, password });
    const store = remember ? localStorage : sessionStorage;
    const other = remember ? sessionStorage : localStorage;
    other.removeItem('aurora_token');
    other.removeItem('aurora_user');
    store.setItem('aurora_token', data.token);
    store.setItem('aurora_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const updateUser = useCallback((patch) => {
    setUser((prev) => {
      const next = { ...prev, ...patch };
      const store = localStorage.getItem('aurora_token') ? localStorage : sessionStorage;
      store.setItem('aurora_user', JSON.stringify(next));
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/auth/me');
      if (data?.user) {
        setUser(data.user);
        const store = localStorage.getItem('aurora_token') ? localStorage : sessionStorage;
        store.setItem('aurora_user', JSON.stringify(data.user));
      }
      return data;
    } catch {
      return null;
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    const onUnauthorized = () => logout();
    window.addEventListener('aurora:unauthorized', onUnauthorized);
    return () => window.removeEventListener('aurora:unauthorized', onUnauthorized);
  }, [logout]);

  useEffect(() => {
    if (token) refresh();
    else setBooting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const permissions = useMemo(() => user?.permissions || [], [user]);
  const can = useCallback(
    (needed) => {
      if (!needed) return true;
      if (user?.role === 'super_admin') return true;
      const list = Array.isArray(needed) ? needed : [needed];
      return list.some((p) => permissions.includes(p));
    },
    [user, permissions]
  );

  const value = useMemo(
    () => ({
      user,
      token,
      booting,
      login,
      logout,
      refresh,
      updateUser,
      permissions,
      can,
      isManager: Boolean(user) && user.role !== 'employee',
      isAdmin: user?.role === 'super_admin',
      roleLabel: user?.roleLabel || user?.role,
    }),
    [user, token, booting, login, logout, refresh, updateUser, permissions, can]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
