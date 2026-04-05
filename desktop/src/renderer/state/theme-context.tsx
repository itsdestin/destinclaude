import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
// @ts-ignore — Vite inline CSS import
import hljsDarkCss from 'highlight.js/styles/github-dark.css?inline';
// @ts-ignore — Vite inline CSS import
import hljsLightCss from 'highlight.js/styles/github.css?inline';

import { validateTheme } from '../themes/theme-validator';
import { applyThemeToDom, buildBackgroundStyle, buildPatternStyle } from '../themes/theme-engine';
import type { ThemeDefinition, LoadedTheme } from '../themes/theme-types';
import { resolveAllAssetPaths } from '../themes/theme-asset-resolver';

// Built-in themes imported as JSON (Vite handles JSON imports natively)
import lightJson from '../themes/builtin/light.json';
import darkJson from '../themes/builtin/dark.json';
import midnightJson from '../themes/builtin/midnight.json';
import cremeJson from '../themes/builtin/creme.json';

const BUILTIN_THEMES: LoadedTheme[] = [
  { ...(lightJson as unknown as ThemeDefinition), source: 'builtin' },
  { ...(darkJson as unknown as ThemeDefinition), source: 'builtin' },
  { ...(midnightJson as unknown as ThemeDefinition), source: 'builtin' },
  { ...(cremeJson as unknown as ThemeDefinition), source: 'builtin' },
];

// Keep backward-compat exports
export type ThemeName = string;
export const THEMES = BUILTIN_THEMES.map(t => t.slug);
export const DEFAULT_FONT_FAMILY = "'Cascadia Mono', 'Cascadia Code', 'Fira Code', monospace";

const STORAGE_KEY = 'destincode-theme';
const CYCLE_KEY = 'destincode-theme-cycle';
const FONT_KEY = 'destincode-font';
const DEFAULT_THEME = 'light';
const DEFAULT_CYCLE = ['light', 'dark'];

interface ThemeContextValue {
  theme: string;
  setTheme: (slug: string) => void;
  cycleTheme: () => void;
  cycleList: string[];
  setCycleList: (list: string[]) => void;
  font: string;
  setFont: (font: string) => void;
  allThemes: LoadedTheme[];
  activeTheme: LoadedTheme;
  bgStyle: Record<string, string> | null;
  patternStyle: Record<string, string> | null;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME, setTheme: () => {}, cycleTheme: () => {},
  cycleList: DEFAULT_CYCLE, setCycleList: () => {},
  font: DEFAULT_FONT_FAMILY, setFont: () => {},
  allThemes: BUILTIN_THEMES, activeTheme: BUILTIN_THEMES[0], bgStyle: null, patternStyle: null,
});

function getStored(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function getStoredJSON<T>(key: string, fallback: T): T {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}

function applyFont(font: string) {
  document.documentElement.style.setProperty('--font-sans', font);
  document.documentElement.style.setProperty('--font-mono', font);
}

function applyHighlightTheme(dark: boolean) {
  const id = 'hljs-theme';
  let el = document.getElementById(id) as HTMLStyleElement | null;
  if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
  el.textContent = dark ? hljsDarkCss : hljsLightCss;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [activeSlug, setActiveSlug] = useState(() => getStored(STORAGE_KEY, DEFAULT_THEME));
  const [cycleList, setCycleListState] = useState<string[]>(() => getStoredJSON(CYCLE_KEY, DEFAULT_CYCLE));
  const [font, setFontState] = useState(() => getStored(FONT_KEY, DEFAULT_FONT_FAMILY));
  const [userThemes, setUserThemes] = useState<LoadedTheme[]>([]);

  const allThemes = [...BUILTIN_THEMES, ...userThemes];
  const activeTheme = allThemes.find(t => t.slug === activeSlug) ?? BUILTIN_THEMES[0];

  // Load user themes from disk on mount
  useEffect(() => {
    const loadUserThemes = async () => {
      try {
        const claude = (window as any).claude;
        if (!claude?.theme?.list) return;
        const slugs: string[] = await claude.theme.list();
        const loaded: LoadedTheme[] = [];
        for (const slug of slugs) {
          try {
            const raw = await claude.theme.readFile(slug);
            const theme = validateTheme(JSON.parse(raw));
            loaded.push(resolveAllAssetPaths({ ...theme, source: 'user' }));
          } catch (e) {
            console.warn(`[ThemeProvider] Failed to load user theme "${slug}":`, e);
          }
        }
        setUserThemes(loaded);
      } catch { /* not in Electron */ }
    };
    loadUserThemes();
  }, []);

  // Listen for hot-reload signal from main process
  useEffect(() => {
    const claude = (window as any).claude;
    if (!claude?.theme?.onReload) return;
    const cleanup = claude.theme.onReload((slug: string) => {
      claude.theme.readFile(slug).then((raw: string) => {
        try {
          const theme = validateTheme(JSON.parse(raw));
          const loaded: LoadedTheme = resolveAllAssetPaths({ ...theme, source: 'user' });
          setUserThemes(prev => {
            const idx = prev.findIndex(t => t.slug === slug);
            if (idx >= 0) { const next = [...prev]; next[idx] = loaded; return next; }
            return [...prev, loaded];
          });
          // Only switch to the reloaded theme if the user is already viewing it
          setActiveSlug(prev => {
            if (prev !== slug) return prev;
            try { localStorage.setItem(STORAGE_KEY, slug); } catch {}
            return slug;
          });
        } catch (e) {
          console.warn(`[ThemeProvider] Hot-reload failed for "${slug}":`, e);
        }
      });
    });
    return cleanup;
  }, []);

  // Apply theme to DOM whenever active theme changes
  useEffect(() => {
    applyThemeToDom(activeTheme);
    applyHighlightTheme(activeTheme.dark);
  }, [activeTheme]);

  // Apply font on change
  useEffect(() => { applyFont(font); }, [font]);

  const setTheme = useCallback((slug: string) => {
    setActiveSlug(slug);
    try { localStorage.setItem(STORAGE_KEY, slug); } catch {}
  }, []);

  const setCycleList = useCallback((list: string[]) => {
    const safe = list.length > 0 ? list : DEFAULT_CYCLE;
    setCycleListState(safe);
    try { localStorage.setItem(CYCLE_KEY, JSON.stringify(safe)); } catch {}
  }, []);

  const setFont = useCallback((f: string) => {
    setFontState(f); applyFont(f);
    try { localStorage.setItem(FONT_KEY, f); } catch {}
  }, []);

  const cycleTheme = useCallback(() => {
    setActiveSlug(prev => {
      const pool = allThemes.filter(t => cycleList.includes(t.slug));
      if (pool.length === 0) return prev;
      const idx = pool.findIndex(t => t.slug === prev);
      const next = idx === -1 ? pool[0].slug : pool[(idx + 1) % pool.length].slug;
      try { localStorage.setItem(STORAGE_KEY, next); } catch {}
      return next;
    });
  }, [allThemes, cycleList]);

  const bgStyle = buildBackgroundStyle(activeTheme.background) as Record<string, string> | null;
  const patternStyle = buildPatternStyle(
    activeTheme.background?.pattern,
    activeTheme.background?.['pattern-opacity'],
  ) as Record<string, string> | null;

  return (
    <ThemeContext.Provider value={{
      theme: activeSlug, setTheme, cycleTheme,
      cycleList, setCycleList, font, setFont,
      allThemes, activeTheme, bgStyle, patternStyle,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() { return useContext(ThemeContext); }
