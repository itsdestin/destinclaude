export interface ThemeTokens {
  canvas: string;
  panel: string;
  inset: string;
  well: string;
  accent: string;
  'on-accent': string;
  fg: string;
  'fg-2': string;
  'fg-dim': string;
  'fg-muted': string;
  'fg-faint': string;
  edge: string;
  'edge-dim': string;
  'scrollbar-thumb': string;
  'scrollbar-hover': string;
}

export interface ThemeShape {
  'radius-sm'?: string;
  'radius-md'?: string;
  'radius-lg'?: string;
  'radius-full'?: string;
}

export interface ThemeBackground {
  type: 'solid' | 'gradient' | 'image';
  value: string;
  opacity?: number;
  'panels-blur'?: number;
  'panels-opacity'?: number;
}

export type InputStyle = 'default' | 'floating' | 'minimal' | 'terminal';
export type BubbleStyle = 'default' | 'pill' | 'flat' | 'bordered';
export type HeaderStyle = 'default' | 'minimal' | 'hidden';
export type StatusbarStyle = 'default' | 'minimal' | 'floating';
export type ParticlePreset = 'none' | 'rain' | 'dust' | 'ember' | 'snow';

export interface ThemeLayout {
  'input-style'?: InputStyle;
  'bubble-style'?: BubbleStyle;
  'header-style'?: HeaderStyle;
  'statusbar-style'?: StatusbarStyle;
}

export interface ThemeEffects {
  particles?: ParticlePreset;
  'scan-lines'?: boolean;
  vignette?: number;
  noise?: number;
}

export interface ThemeDefinition {
  name: string;
  slug: string;
  dark: boolean;
  author?: string;
  created?: string;
  tokens: ThemeTokens;
  shape?: ThemeShape;
  background?: ThemeBackground;
  layout?: ThemeLayout;
  effects?: ThemeEffects;
  custom_css?: string;
}

/** A loaded theme — same as ThemeDefinition but guaranteed slug is kebab-case */
export type LoadedTheme = ThemeDefinition & { source: 'builtin' | 'user' };
