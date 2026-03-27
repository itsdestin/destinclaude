import React, { useSyncExternalStore } from 'react';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const COLORS = [
  '#B0B0B0',
  '#D0D0D0',
  '#85C1E9',
  '#A8D8A8',
  '#D4A5D4',
];

// Shared animation driver — one requestAnimationFrame loop for all spinners.
// Replaces per-instance setIntervals (2 timers × N spinners) with a single
// rAF that only runs while at least one spinner is mounted.
let frameIndex = 0;
let colorIndex = 0;
let version = 0;
let lastFrameTick = 0;
let lastColorTick = 0;
let rafId: number | null = null;
const listeners = new Set<() => void>();

function tick(now: number) {
  let changed = false;
  if (now - lastFrameTick >= 80) {
    frameIndex = (frameIndex + 1) % FRAMES.length;
    lastFrameTick = now;
    changed = true;
  }
  if (now - lastColorTick >= 600) {
    colorIndex = (colorIndex + 1) % COLORS.length;
    lastColorTick = now;
    changed = true;
  }
  if (changed) {
    version++;
    listeners.forEach((cb) => cb());
  }
  rafId = requestAnimationFrame(tick);
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  if (rafId === null) {
    const now = performance.now();
    lastFrameTick = now;
    lastColorTick = now;
    rafId = requestAnimationFrame(tick);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}

const getVersion = () => version;

interface Props {
  /** Size class — maps to text-xs, text-sm, text-base, text-lg */
  size?: 'xs' | 'sm' | 'base' | 'lg';
  /** Whether to cycle through colors (default true) */
  colorCycle?: boolean;
}

const sizeClass: Record<string, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
};

export default function BrailleSpinner({ size = 'sm', colorCycle = true }: Props) {
  useSyncExternalStore(subscribe, getVersion);

  return (
    <span
      className={`${sizeClass[size]} leading-none shrink-0`}
      style={{ color: colorCycle ? COLORS[colorIndex] : COLORS[0] }}
    >
      {FRAMES[frameIndex]}
    </span>
  );
}
