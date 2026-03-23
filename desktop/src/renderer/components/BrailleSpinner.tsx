import React, { useState, useEffect } from 'react';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const COLORS = [
  '#B0B0B0',
  '#D0D0D0',
  '#85C1E9',
  '#A8D8A8',
  '#D4A5D4',
];

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
  const [frame, setFrame] = useState(0);
  const [colorIndex, setColorIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setFrame((prev) => (prev + 1) % FRAMES.length);
    }, 80);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!colorCycle) return;
    const id = setInterval(() => {
      setColorIndex((prev) => (prev + 1) % COLORS.length);
    }, 600);
    return () => clearInterval(id);
  }, [colorCycle]);

  return (
    <span
      className={`${sizeClass[size]} leading-none shrink-0`}
      style={{ color: colorCycle ? COLORS[colorIndex] : COLORS[0] }}
    >
      {FRAMES[frame]}
    </span>
  );
}
