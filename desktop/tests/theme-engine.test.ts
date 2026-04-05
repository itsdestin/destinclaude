import { describe, it, expect } from 'vitest';
import { buildTokenCSS, buildShapeCSS, buildBackgroundStyle, buildLayoutAttrs } from '../src/renderer/themes/theme-engine';

const TOKENS = {
  canvas: '#0D0F1A', panel: '#141726', inset: '#1F2440', well: '#0D0F1A',
  accent: '#7C6AF7', 'on-accent': '#FFFFFF',
  fg: '#C4BFFF', 'fg-2': '#9090C0', 'fg-dim': '#6060A0',
  'fg-muted': '#404070', 'fg-faint': '#282848',
  edge: '#2A2F55', 'edge-dim': '#2A2F5580',
  'scrollbar-thumb': '#2A2F55', 'scrollbar-hover': '#3A3F70',
};

describe('buildTokenCSS', () => {
  it('returns an object of CSS property → value pairs', () => {
    const result = buildTokenCSS(TOKENS);
    expect(result['--canvas']).toBe('#0D0F1A');
    expect(result['--accent']).toBe('#7C6AF7');
    expect(result['--on-accent']).toBe('#FFFFFF');
    expect(Object.keys(result)).toHaveLength(15);
  });
});

describe('buildShapeCSS', () => {
  it('returns radius CSS properties', () => {
    const result = buildShapeCSS({ 'radius-sm': '2px', 'radius-md': '4px', 'radius-lg': '8px', 'radius-full': '9999px' });
    expect(result['--radius-sm']).toBe('2px');
    expect(result['--radius-full']).toBe('9999px');
  });

  it('returns empty object for undefined shape', () => {
    expect(buildShapeCSS(undefined)).toEqual({});
  });
});

describe('buildBackgroundStyle', () => {
  it('returns gradient CSS for gradient type', () => {
    const result = buildBackgroundStyle({ type: 'gradient', value: 'linear-gradient(135deg, #000, #fff)' });
    expect(result?.background).toBe('linear-gradient(135deg, #000, #fff)');
  });

  it('returns image CSS for image type', () => {
    const result = buildBackgroundStyle({ type: 'image', value: 'https://example.com/bg.jpg' });
    expect(result?.backgroundImage).toBe('url("https://example.com/bg.jpg")');
    expect(result?.backgroundSize).toBe('cover');
  });

  it('returns null for undefined background', () => {
    expect(buildBackgroundStyle(undefined)).toBeNull();
  });
});

describe('buildLayoutAttrs', () => {
  it('returns data attribute values for each layout field', () => {
    const result = buildLayoutAttrs({ 'input-style': 'floating', 'bubble-style': 'pill' });
    expect(result['data-input-style']).toBe('floating');
    expect(result['data-bubble-style']).toBe('pill');
    expect(result['data-header-style']).toBeUndefined();
  });

  it('returns empty object for undefined layout', () => {
    expect(buildLayoutAttrs(undefined)).toEqual({});
  });
});
