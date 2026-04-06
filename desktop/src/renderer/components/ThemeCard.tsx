import React from 'react';
import type { ThemeRegistryEntryWithStatus } from '../../shared/theme-marketplace-types';

interface ThemeCardProps {
  entry: ThemeRegistryEntryWithStatus;
  onClick: () => void;
}

export default function ThemeCard({ entry, onClick }: ThemeCardProps) {
  return (
    <button
      onClick={onClick}
      className="relative rounded-lg overflow-hidden border border-edge-dim hover:border-edge transition-colors text-left group"
    >
      {/* Preview image or gradient fallback */}
      <div className="w-full h-24 bg-well overflow-hidden">
        {entry.preview ? (
          <img
            src={entry.preview}
            alt={entry.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background: entry.dark
                ? 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)'
                : 'linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 50%, #ddd 100%)',
            }}
          />
        )}
      </div>

      {/* Info */}
      <div className="px-2.5 py-2 bg-panel">
        <div className="flex items-center gap-1.5 mb-0.5">
          <p className="text-[11px] font-medium text-fg truncate flex-1">{entry.name}</p>
          {/* Dark/Light indicator */}
          <span
            className="w-2.5 h-2.5 rounded-full border border-edge-dim shrink-0"
            style={{ background: entry.dark ? '#1a1a2e' : '#f2f2f2' }}
            title={entry.dark ? 'Dark theme' : 'Light theme'}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[9px] text-fg-muted truncate">{entry.author}</span>
          <span
            className={`text-[8px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
              entry.source === 'destinclaude'
                ? 'bg-accent/15 text-accent'
                : 'bg-fg-faint/20 text-fg-muted'
            }`}
          >
            {entry.source === 'destinclaude' ? 'Official' : 'Community'}
          </span>
        </div>

        {/* Feature pills */}
        {entry.features.length > 0 && (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {entry.features.slice(0, 3).map(f => (
              <span key={f} className="text-[8px] text-fg-faint bg-well px-1.5 py-0.5 rounded-sm">
                {f}
              </span>
            ))}
            {entry.features.length > 3 && (
              <span className="text-[8px] text-fg-faint">+{entry.features.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {/* Installed badge */}
      {entry.installed && (
        <div className="absolute top-1.5 right-1.5 bg-accent text-on-accent text-[8px] font-bold px-1.5 py-0.5 rounded-sm">
          Installed
        </div>
      )}
    </button>
  );
}
