import React from 'react';

interface StatusData {
  usage: {
    five_hour?: { utilization: number; resets_at: string };
    seven_day?: { utilization: number; resets_at: string };
  } | null;
  updateStatus: {
    current: string;
    latest: string;
    update_available: boolean;
  } | null;
  contextPercent: number | null;
  syncStatus: string | null;
  syncWarnings: string | null;
}

function utilizationColor(pct: number): string {
  if (pct >= 80) return 'text-[#DD4444]';
  if (pct >= 50) return 'text-[#FF9800]';
  return 'text-[#4CAF50]';
}

function contextColor(pct: number): string {
  if (pct < 20) return 'text-[#DD4444]';
  if (pct < 50) return 'text-[#FF9800]';
  return 'text-[#4CAF50]';
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTime12(d: Date): string {
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, '0')}${ampm}`;
}

function format5hReset(iso: string): string {
  try {
    const d = new Date(iso);
    return `Resets @ ${formatTime12(d)}`;
  } catch {
    return '';
  }
}

function format7dReset(iso: string): string {
  try {
    const d = new Date(iso);
    return `Resets ${DAYS[d.getDay()]} @ ${formatTime12(d)}`;
  } catch {
    return '';
  }
}

interface Props {
  statusData: StatusData;
  onRunSync?: () => void;
}

// Map raw warning codes to the same descriptive text used in the terminal statusline
const WARNING_MAP: Record<string, { text: string; level: 'danger' | 'warn' }> = {
  'OFFLINE': { text: 'DANGER: No Internet Connection', level: 'danger' },
  'PERSONAL:NOT_CONFIGURED': { text: 'DANGER: No Sync Act. for Personal Data', level: 'danger' },
  'PERSONAL:STALE': { text: 'WARN: No Recent Personal Sync (>24h)', level: 'warn' },
};

function parseSyncWarnings(raw: string | null): { text: string; level: 'danger' | 'warn' }[] {
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map((line) => {
    // Check for exact match first
    if (WARNING_MAP[line]) return WARNING_MAP[line];
    // Prefix match for SKILLS:* and PROJECTS:*
    if (line.startsWith('SKILLS:')) return { text: 'DANGER: Unsynced Skills', level: 'danger' as const };
    if (line.startsWith('PROJECTS:')) return { text: 'DANGER: Projects Excluded From Sync', level: 'danger' as const };
    // Fallback: pass through raw text
    if (line.startsWith('DANGER:') || line.startsWith('OFFLINE')) {
      return { text: line, level: 'danger' as const };
    }
    return { text: line, level: 'warn' as const };
  });
}

const warnStyles = {
  danger: 'bg-[#DD4444]/15 text-[#DD4444] border-[#DD4444]/25',
  warn: 'bg-[#FF9800]/15 text-[#FF9800] border-[#FF9800]/25',
};

export default function StatusBar({ statusData, onRunSync }: Props) {
  const { usage, updateStatus, contextPercent, syncStatus, syncWarnings } = statusData;
  const warnings = parseSyncWarnings(syncWarnings);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 sm:px-3 py-1 text-[10px] text-gray-500 border-t border-gray-800/50">
      {/* Rate limits */}
      {usage?.five_hour != null && (
        <span className="flex items-center gap-1 sm:gap-1.5 px-1.5 py-0.5 rounded bg-gray-900 border border-gray-700/50">
          <span>5h:</span>
          <span className={utilizationColor(usage.five_hour.utilization)}>
            {usage.five_hour.utilization}%
          </span>
          <span className="text-gray-600 hidden sm:inline">{format5hReset(usage.five_hour.resets_at)}</span>
        </span>
      )}
      {usage?.seven_day != null && (
        <span className="flex items-center gap-1 sm:gap-1.5 px-1.5 py-0.5 rounded bg-gray-900 border border-gray-700/50">
          <span>7d:</span>
          <span className={utilizationColor(usage.seven_day.utilization)}>
            {usage.seven_day.utilization}%
          </span>
          <span className="text-gray-600 hidden sm:inline">{format7dReset(usage.seven_day.resets_at)}</span>
        </span>
      )}

      {/* Context */}
      {contextPercent != null && (
        <span>
          Ctx:{' '}
          <span className={contextColor(contextPercent)}>
            {contextPercent}%
          </span>
        </span>
      )}

      {/* Sync warnings */}
      {warnings.map((w, i) => (
        <button
          key={i}
          onClick={onRunSync}
          className={`px-1.5 py-0.5 rounded border text-[9px] sm:text-[10px] ${warnStyles[w.level]} ${onRunSync ? 'cursor-pointer hover:brightness-125 transition-all' : ''}`}
        >
          {w.text}
        </button>
      ))}

      {/* Version — pushed to end, hidden on very narrow screens */}
      {updateStatus && (
        <button
          onClick={() => window.claude.shell.openChangelog()}
          className="px-1.5 py-0.5 rounded bg-gray-900 border border-gray-700/50 cursor-pointer hover:bg-gray-800 transition-colors ml-auto hidden sm:inline-flex"
        >
          {updateStatus.update_available ? (
            <span className="text-[#FF9800]">
              v{updateStatus.current} → v{updateStatus.latest}
            </span>
          ) : (
            <span>v{updateStatus.current}</span>
          )}
        </button>
      )}
    </div>
  );
}
