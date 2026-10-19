import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, setUnauthorizedHandler, tokenStorage } from '../api';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  /** true, пока при запуске сайта проверяется сохранённый токен */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Обновить данные пользователя после правки профиля */
  updateUser: (patch: Partial<User>) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(() => tokenStorage.get() !== null);

  const logout = useCallback(() => {
    tokenStorage.clear();
    setUser(null);
  }, []);

  // При открытии сайта: если токен сохранён — узнаём, чей он.
  useEffect(() => {
    if (!tokenStorage.get()) return;
    api.auth
      .me()
      .then(setUser)
      .catch(() => tokenStorage.clear()) // токен просрочен или недействителен
      .finally(() => setLoading(false));
  }, []);

  // Если любой запрос вернёт 401 — выходим из аккаунта.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.auth.login(email, password);
    tokenStorage.set(res.token);
    // /login не возвращает аватар, поэтому берём полный профиль
    setUser(await api.auth.me());
  }, []);

  const register = useCallback(async (username: string, email: string, password: string) => {
    const res = await api.auth.register(username, email, password);
    tokenStorage.set(res.token);
    setUser(res.user);
  }, []);

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, updateUser }),
    [user, loading, login, register, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth нужно использовать внутри <AuthProvider>');
  return ctx;
}
