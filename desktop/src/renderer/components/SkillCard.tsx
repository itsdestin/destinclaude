import React from 'react';
import type { SkillEntry } from '../../shared/types';

interface Props {
  skill: SkillEntry;
  onClick: (skill: SkillEntry) => void;
}

const sourceBadgeStyles: Record<string, string> = {
  destinclaude: 'bg-[#4CAF50]/15 text-[#4CAF50] border border-[#4CAF50]/25',
  self: 'bg-[#66AAFF]/15 text-[#66AAFF] border border-[#66AAFF]/25',
  plugin: 'bg-gray-700/50 text-gray-400 border border-gray-600/25',
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
      className="bg-gray-900 border border-gray-700/50 rounded-lg p-3 text-left hover:bg-gray-800 hover:border-gray-600 transition-colors flex flex-col"
    >
      <span className="text-sm font-medium text-gray-200 leading-tight">
        {skill.displayName}
      </span>
      <span className="text-[11px] text-gray-500 mt-1 leading-snug line-clamp-2 flex-1">
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
