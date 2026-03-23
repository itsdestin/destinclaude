import React from 'react';

interface IconProps {
  className?: string;
}

/** Terminal icon — rounded rect with >_ prompt */
export function TerminalIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        d="M4 4 L20 4 A2 2 0 0 1 22 6 L22 18 A2 2 0 0 1 20 20 L4 20 A2 2 0 0 1 2 18 L2 6 A2 2 0 0 1 4 4 Z"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      />
      <path d="M6 9 L10 12 L6 15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 15 L17 15" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Chat icon — speech bubble with three dots */
export function ChatIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        d="M4 5 L20 5 A2 2 0 0 1 22 7 L22 15 A2 2 0 0 1 20 17 L10 17 L6 20 L7 17 L4 17 A2 2 0 0 1 2 15 L2 7 A2 2 0 0 1 4 5 Z"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      />
      <path d="M8.5 11 L8.5 11.01" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M12 11 L12 11.01" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M15.5 11 L15.5 11.01" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Menu icon — three horizontal dots */
export function MenuIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="6" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="18" cy="12" r="1.5" />
    </svg>
  );
}

/** Paperclip attachment icon */
export function AttachIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        d="M15.5 6 L15.5 15.5 A3.5 3.5 0 0 1 8.5 15.5 L8.5 7 A2 2 0 0 1 12.5 7 L12.5 15.5 A0.5 0.5 0 0 1 11.5 15.5 L11.5 8.5"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

/** Game controller icon — handheld style */
export function GamepadIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      {/* Body */}
      <rect x="5" y="3" width="14" height="18" rx="2.5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Screen */}
      <rect x="8" y="6" width="8" height="5" rx="1" strokeWidth="1.4" />
      {/* D-pad */}
      <path d="M9 15.5 L11 15.5" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 14.5 L10 16.5" strokeWidth="2" strokeLinecap="round" />
      {/* Buttons */}
      <path d="M14.5 15 L14.5 15.01" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M16.5 16.5 L16.5 16.51" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
}

/** Compass icon — circle with needle, used for command drawer entry */
export function CompassIcon({ className = 'w-4 h-4' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="10" strokeWidth="1.8" />
      <polygon
        points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88"
        strokeWidth="1.5"
        strokeLinejoin="round"
        fill="currentColor"
        opacity="0.3"
      />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** App mascot variant — inquisitive expression with wide round eyes */
export function InquisitiveAppIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      {/* Body with round eye cutouts */}
      <path
        fillRule="evenodd"
        d="M9 4 L15 4 A4 4 0 0 1 19 8 L19 12 A4 4 0 0 1 15 16 L9 16 A4 4 0 0 1 5 12 L5 8 A4 4 0 0 1 9 4 Z M9.8 8.2 A2 2 0 1 0 9.8 12.2 A2 2 0 1 0 9.8 8.2 Z M14.2 8.2 A2 2 0 1 0 14.2 12.2 A2 2 0 1 0 14.2 8.2 Z"
      />
      {/* Pupils — small dots inside the round eyes */}
      <circle cx="10.3" cy="10.2" r="0.7" />
      <circle cx="14.7" cy="10.2" r="0.7" />
      {/* Left arm */}
      <path d="M1.8 9 L3.2 9 A0.8 0.8 0 0 1 4 9.8 L4 12.2 A0.8 0.8 0 0 1 3.2 13 L1.8 13 A0.8 0.8 0 0 1 1 12.2 L1 9.8 A0.8 0.8 0 0 1 1.8 9 Z" />
      {/* Right arm */}
      <path d="M20.8 9 L22.2 9 A0.8 0.8 0 0 1 23 9.8 L23 12.2 A0.8 0.8 0 0 1 22.2 13 L20.8 13 A0.8 0.8 0 0 1 20 12.2 L20 9.8 A0.8 0.8 0 0 1 20.8 9 Z" />
      {/* Left leg */}
      <rect x="7.2" y="17" width="3.5" height="4" rx="1.2" />
      {/* Right leg */}
      <rect x="13.3" y="17" width="3.5" height="4" rx="1.2" />
    </svg>
  );
}

/** App mascot — squat character with >< eyes, nub arms, stubby legs */
export function AppIcon({ className = 'w-6 h-6' }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      {/* Body with eye cutouts */}
      <path
        fillRule="evenodd"
        d="M9 4 L15 4 A4 4 0 0 1 19 8 L19 12 A4 4 0 0 1 15 16 L9 16 A4 4 0 0 1 5 12 L5 8 A4 4 0 0 1 9 4 Z M8.5 8 L10.5 10 L8.5 12 L9.5 12 L11.5 10 L9.5 8 Z M15.5 8 L13.5 10 L15.5 12 L14.5 12 L12.5 10 L14.5 8 Z"
      />
      {/* Left arm */}
      <path d="M1.8 9 L3.2 9 A0.8 0.8 0 0 1 4 9.8 L4 12.2 A0.8 0.8 0 0 1 3.2 13 L1.8 13 A0.8 0.8 0 0 1 1 12.2 L1 9.8 A0.8 0.8 0 0 1 1.8 9 Z" />
      {/* Right arm */}
      <path d="M20.8 9 L22.2 9 A0.8 0.8 0 0 1 23 9.8 L23 12.2 A0.8 0.8 0 0 1 22.2 13 L20.8 13 A0.8 0.8 0 0 1 20 12.2 L20 9.8 A0.8 0.8 0 0 1 20.8 9 Z" />
      {/* Left leg — gap from body, rounded */}
      <rect x="7.2" y="17" width="3.5" height="4" rx="1.2" />
      {/* Right leg — gap from body, rounded */}
      <rect x="13.3" y="17" width="3.5" height="4" rx="1.2" />
    </svg>
  );
}
