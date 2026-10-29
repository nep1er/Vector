import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Четыре темы:
 *  system-light — «Системная светлая» (наша кофейная светлая)
 *  system-dark  — «Системная тёмная» (наша кофейная тёмная)
 *  light        — «Светлая» (обычные бело-серые цвета)
 *  dark         — «Тёмная» (обычные тёмно-серые цвета)
 */
export type ThemePref = 'system-light' | 'system-dark' | 'light' | 'dark';

const KEY = 'vector_theme';

/** значение атрибута data-theme для темы (см. resources/design/tokens.css) */
const ATTR: Record<ThemePref, string> = {
  'system-light': 'light',
  'system-dark': 'dark',
  light: 'plain-light',
  dark: 'plain-dark',
};

const systemDark = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

/** Если тема не выбрана — кофейная, светлая или тёмная по настройке ОС. Старые значения ('system', 'light', 'dark' до v3) тоже понимаем. */
const readPref = (): ThemePref => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'system-light' || v === 'system-dark' || v === 'light' || v === 'dark') {
      // до v3 «light»/«dark» означали кофейные темы — различаем по флагу версии
      if ((v === 'light' || v === 'dark') && localStorage.getItem(KEY + '_v') !== '3') {
        return v === 'dark' ? 'system-dark' : 'system-light';
      }
      return v;
    }
  } catch {
    /* ignore */
  }
  return systemDark() ? 'system-dark' : 'system-light';
};

const apply = (pref: ThemePref) => {
  document.documentElement.setAttribute('data-theme', ATTR[pref]);
};

interface ThemeState {
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}

const Ctx = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readPref);

  useEffect(() => {
    apply(pref);
  }, [pref]);

  const setPref = useCallback((p: ThemePref) => {
    try {
      localStorage.setItem(KEY, p);
      localStorage.setItem(KEY + '_v', '3');
    } catch {
      /* приватный режим — тема просто не запомнится */
    }
    setPrefState(p);
  }, []);

  const value = useMemo(() => ({ pref, setPref }), [pref, setPref]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme нужно использовать внутри <ThemeProvider>');
  return ctx;
}

export const THEME_OPTIONS: { id: ThemePref; label: string }[] = [
  { id: 'system-light', label: 'Системная светлая' },
  { id: 'system-dark', label: 'Системная тёмная' },
  { id: 'light', label: 'Светлая' },
  { id: 'dark', label: 'Тёмная' },
];
