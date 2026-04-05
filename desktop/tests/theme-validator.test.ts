import { describe, it, expect } from 'vitest';
import { validateTheme, computeOnAccent } from '../src/renderer/themes/theme-validator';

const MINIMAL_VALID = {
  name: 'Test Theme',
  slug: 'test-theme',
  dark: false,
  tokens: {
    canvas: '#F2F2F2', panel: '#EAEAEA', inset: '#E0E0E0', well: '#F7F7F7',
    accent: '#1A1A1A', 'on-accent': '#F2F2F2',
    fg: '#1A1A1A', 'fg-2': '#444444', 'fg-dim': '#666666',
    'fg-muted': '#888888', 'fg-faint': '#AAAAAA',
    edge: '#CFCFCF', 'edge-dim': '#DCDCDC80',
    'scrollbar-thumb': '#C0C0C0', 'scrollbar-hover': '#999999',
  },
};

describe('validateTheme', () => {
  it('accepts a minimal valid theme', () => {
    expect(() => validateTheme(MINIMAL_VALID)).not.toThrow();
  });

  it('throws when name is missing', () => {
    expect(() => validateTheme({ ...MINIMAL_VALID, name: '' })).toThrow('name');
  });

  it('throws when slug is missing', () => {
    expect(() => validateTheme({ ...MINIMAL_VALID, slug: '' })).toThrow('slug');
  });

  it('throws when a required token is missing', () => {
    const { canvas, ...rest } = MINIMAL_VALID.tokens;
    expect(() => validateTheme({ ...MINIMAL_VALID, tokens: rest as any })).toThrow('canvas');
  });

  it('throws when tokens block is absent', () => {
    const { tokens, ...rest } = MINIMAL_VALID;
    expect(() => validateTheme(rest as any)).toThrow('tokens');
  });
});

describe('computeOnAccent', () => {
  it('returns white for dark accent colors', () => {
    expect(computeOnAccent('#1A1A1A')).toBe('#FFFFFF');
    expect(computeOnAccent('#7C6AF7')).toBe('#FFFFFF');
    expect(computeOnAccent('#0D0F1A')).toBe('#FFFFFF');
  });

  it('returns black for light accent colors', () => {
    expect(computeOnAccent('#F2F2F2')).toBe('#000000');
    expect(computeOnAccent('#FFFFFF')).toBe('#000000');
    expect(computeOnAccent('#D4D4D4')).toBe('#000000');
  });
});
