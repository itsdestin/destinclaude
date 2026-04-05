import type { ThemeDefinition } from './theme-types';

const REQUIRED_TOKENS = [
  'canvas', 'panel', 'inset', 'well', 'accent', 'on-accent',
  'fg', 'fg-2', 'fg-dim', 'fg-muted', 'fg-faint',
  'edge', 'edge-dim', 'scrollbar-thumb', 'scrollbar-hover',
] as const;

/** Relative luminance of a hex color (0–1). */
export function luminance(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Returns '#FFFFFF' or '#000000' based on accent luminance. */
export function computeOnAccent(accentHex: string): string {
  return luminance(accentHex) < 0.4 ? '#FFFFFF' : '#000000';
}

/** Throws a descriptive error if the theme JSON is invalid. */
export function validateTheme(raw: unknown): ThemeDefinition {
  if (!raw || typeof raw !== 'object') throw new Error('Theme must be an object');
  const t = raw as Record<string, unknown>;

  if (!t.name || typeof t.name !== 'string' || !t.name.trim()) throw new Error('Theme missing required field: name');
  if (!t.slug || typeof t.slug !== 'string' || !t.slug.trim()) throw new Error('Theme missing required field: slug');
  if (typeof t.dark !== 'boolean') throw new Error('Theme missing required field: dark (boolean)');
  if (!t.tokens || typeof t.tokens !== 'object') throw new Error('Theme missing required field: tokens');

  const tokens = t.tokens as Record<string, unknown>;
  for (const key of REQUIRED_TOKENS) {
    if (!tokens[key] || typeof tokens[key] !== 'string') {
      throw new Error(`Theme tokens missing required field: ${key}`);
    }
  }

  return raw as ThemeDefinition;
}
