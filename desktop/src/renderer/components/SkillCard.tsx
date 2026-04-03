import React from 'react';
import type { SkillEntry } from '../../shared/types';

interface Props {
  skill: SkillEntry;
  onClick: (skill: SkillEntry) => void;
}

const sourceBadgeStyles: Record<string, string> = {
  destinclaude: 'bg-[#4CAF50]/15 text-[#4CAF50] border border-[#4CAF50]/25',
  self: 'bg-[#66AAFF]/15 text-[#66AAFF] border border-[#66AAFF]/25',
  plugin: 'bg-inset/50 text-fg-dim border border-edge/25',
};

const sourceLabels: Record<string, string> = {
  destinclaude: 'DC',
  self: 'Self',
  plugin: 'Plugin',
};

export default function SkillCard({ skill, onClick }: Props) {
  return (
    <button
      onClick={() => onClick(skill)}
      className="bg-panel border border-edge-dim rounded-lg p-3 text-left hover:bg-inset hover:border-edge transition-colors flex flex-col"
    >
      <span className="text-sm font-medium text-fg leading-tight">
        {skill.displayName}
      </span>
      <span className="text-[11px] text-fg-muted mt-1 leading-snug line-clamp-2 flex-1">
        {skill.description}
      </span>
      <span
        className={`text-[9px] font-medium px-1 py-0.5 rounded mt-2 self-start ${sourceBadgeStyles[skill.source] || sourceBadgeStyles.plugin}`}
      >
        {sourceLabels[skill.source] || 'Plugin'}
      </span>
    </button>
  );
}
