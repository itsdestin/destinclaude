import type { ThemeTokens, ThemeShape, ThemeBackground, ThemeLayout, ThemeDefinition } from './theme-types';

/** Returns CSS custom property map for all 15 color tokens. */
export function buildTokenCSS(tokens: ThemeTokens): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokens)) {
    result[`--${key}`] = value;
  }
  return result;
}

/** Returns CSS custom property map for shape radius variables. */
export function buildShapeCSS(shape: ThemeShape | undefined): Record<string, string> {
  if (!shape) return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(shape)) {
    if (value) result[`--${key}`] = value;
  }
  return result;
}

/** Returns inline style properties for the #theme-bg div. Null if no background defined. */
export function buildBackgroundStyle(bg: ThemeBackground | undefined): Record<string, string> | null {
  if (!bg) return null;
  if (bg.type === 'solid') return { background: bg.value, opacity: String(bg.opacity ?? 1) };
  if (bg.type === 'gradient') return { background: bg.value, opacity: String(bg.opacity ?? 1) };
  if (bg.type === 'image') return {
    backgroundImage: `url("${bg.value}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    opacity: String(bg.opacity ?? 1),
  };
  return null;
}

/** Returns data-attribute key/value pairs to set on <body>. */
export function buildLayoutAttrs(layout: ThemeLayout | undefined): Record<string, string> {
  if (!layout) return {};
  const result: Record<string, string> = {};
  if (layout['input-style']) result['data-input-style'] = layout['input-style'];
  if (layout['bubble-style']) result['data-bubble-style'] = layout['bubble-style'];
  if (layout['header-style']) result['data-header-style'] = layout['header-style'];
  if (layout['statusbar-style']) result['data-statusbar-style'] = layout['statusbar-style'];
  return result;
}

const LAYOUT_ATTRS = ['data-input-style', 'data-bubble-style', 'data-header-style', 'data-statusbar-style'] as const;

/** Applies a full ThemeDefinition to the live DOM. Only call from renderer process. */
export function applyThemeToDom(theme: ThemeDefinition): void {
  const root = document.documentElement;
  const body = document.body;

  // 1. data-theme attribute (drives existing [data-theme] CSS blocks as fallback)
  root.setAttribute('data-theme', theme.slug);

  // 2. Color tokens as CSS custom properties on :root
  for (const [prop, value] of Object.entries(buildTokenCSS(theme.tokens))) {
    root.style.setProperty(prop, value);
  }

  // 3. Shape radius overrides
  for (const [prop, value] of Object.entries(buildShapeCSS(theme.shape))) {
    root.style.setProperty(prop, value);
  }

  // 4. Glassmorphism — set/remove data-panels-blur + CSS var
  const blur = theme.background?.['panels-blur'];
  if (blur && blur > 0) {
    root.setAttribute('data-panels-blur', String(blur));
    root.style.setProperty('--panels-blur', `${blur}px`);
  } else {
    root.removeAttribute('data-panels-blur');
    root.style.removeProperty('--panels-blur');
  }

  // 5. Layout data attributes on body — clear previous first
  for (const attr of LAYOUT_ATTRS) {
    body.removeAttribute(attr);
  }
  for (const [attr, value] of Object.entries(buildLayoutAttrs(theme.layout))) {
    body.setAttribute(attr, value);
  }

  // 6. custom_css — inject/replace in <style id="theme-custom">
  const customCSSId = 'theme-custom';
  let customEl = document.getElementById(customCSSId) as HTMLStyleElement | null;
  if (theme.custom_css) {
    if (!customEl) {
      customEl = document.createElement('style');
      customEl.id = customCSSId;
      document.head.appendChild(customEl);
    }
    customEl.textContent = theme.custom_css;
  } else if (customEl) {
    customEl.textContent = '';
  }
}

/** Clears all theme-engine-applied DOM mutations. */
export function clearThemeFromDom(): void {
  const root = document.documentElement;
  const body = document.body;
  root.removeAttribute('data-panels-blur');
  const propsToRemove = ['--panels-blur', '--radius-sm', '--radius-md', '--radius-lg', '--radius-full'];
  for (const p of propsToRemove) root.style.removeProperty(p);
  for (const a of LAYOUT_ATTRS) body.removeAttribute(a);
  const customEl = document.getElementById('theme-custom') as HTMLStyleElement | null;
  if (customEl) customEl.textContent = '';
}
