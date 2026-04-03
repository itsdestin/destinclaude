import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
// Vite ?inline gives raw CSS strings without injecting <style> tags
// @ts-ignore — Vite inline CSS import
import hljsDarkCss from 'highlight.js/styles/github-dark.css?inline';
// @ts-ignore — Vite inline CSS import
import hljsLightCss from 'highlight.js/styles/github.css?inline';

export type ThemeName = 'light' | 'dark' | 'midnight' | 'creme';

const THEMES: ThemeName[] = ['light', 'dark', 'midnight', 'creme'];
const STORAGE_KEY = 'destincode-theme';
const CYCLE_KEY = 'destincode-theme-cycle';
const FONT_KEY = 'destincode-font';
const DEFAULT_THEME: ThemeName = 'light';
const DEFAULT_CYCLE: ThemeName[] = ['light', 'dark'];
const DEFAULT_FONT = "'Cascadia Mono', 'Cascadia Code', 'Fira Code', monospace";

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  cycleTheme: () => void;
  cycleList: ThemeName[];
  setCycleList: (list: ThemeName[]) => void;
  font: string;
  setFont: (font: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  cycleTheme: () => {},
  cycleList: DEFAULT_CYCLE,
  setCycleList: () => {},
  font: DEFAULT_FONT,
  setFont: () => {},
});

function getStoredTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES.includes(stored as ThemeName)) return stored as ThemeName;
  } catch { /* localStorage unavailable */ }
  return DEFAULT_THEME;
}

function getStoredCycleList(): ThemeName[] {
  try {
    const stored = localStorage.getItem(CYCLE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as string[];
      const valid = parsed.filter((t) => THEMES.includes(t as ThemeName)) as ThemeName[];
      if (valid.length > 0) return valid;
    }
  } catch { /* localStorage unavailable or invalid JSON */ }
  return DEFAULT_CYCLE;
}

function getStoredFont(): string {
  try {
    const stored = localStorage.getItem(FONT_KEY);
    if (stored) return stored;
  } catch {}
  return DEFAULT_FONT;
}

const DARK_THEMES: ThemeName[] = ['dark', 'midnight'];

function applyTheme(theme: ThemeName) {
  document.documentElement.setAttribute('data-theme', theme);
}

/** Swap highlight.js stylesheet between github-dark and github (light). */
function applyHighlightTheme(theme: ThemeName) {
  const isDark = DARK_THEMES.includes(theme);
  const id = 'hljs-theme';
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = isDark ? hljsDarkCss : hljsLightCss;
}

function applyFont(font: string) {
  const root = document.documentElement.style;
  root.setProperty('--font-sans', font);
  root.setProperty('--font-mono', font);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(getStoredTheme);
  const [cycleList, setCycleListState] = useState<ThemeName[]>(getStoredCycleList);
  const [font, setFontState] = useState<string>(getStoredFont);

  // Apply on mount and when theme changes
  useEffect(() => {
    applyTheme(theme);
    applyHighlightTheme(theme);
  }, [theme]);

  // Apply font on mount and when it changes
  useEffect(() => {
    applyFont(font);
  }, [font]);

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  }, []);

  const setCycleList = useCallback((list: ThemeName[]) => {
    const safe = list.length > 0 ? list : DEFAULT_CYCLE;
    setCycleListState(safe);
    try { localStorage.setItem(CYCLE_KEY, JSON.stringify(safe)); } catch {}
  }, []);

  const setFont = useCallback((next: string) => {
    setFontState(next);
    applyFont(next);
    try { localStorage.setItem(FONT_KEY, next); } catch {}
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((prev) => {
      const pool = THEMES.filter((t) => cycleList.includes(t));
      if (pool.length === 0) return prev;
      const idx = pool.indexOf(prev);
      const next = idx === -1 ? pool[0] : pool[(idx + 1) % pool.length];
      try { localStorage.setItem(STORAGE_KEY, next); } catch {}
      applyTheme(next);
      applyHighlightTheme(next);
      return next;
    });
  }, [cycleList]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, cycleTheme, cycleList, setCycleList, font, setFont }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export const DEFAULT_FONT_FAMILY = DEFAULT_FONT;
export { THEMES };
