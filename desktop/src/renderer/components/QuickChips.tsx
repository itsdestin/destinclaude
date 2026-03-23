import React from 'react';

export interface QuickChip {
  label: string;
  prompt: string;
}

export const defaultChips: QuickChip[] = [
  { label: 'Journal', prompt: "let's journal" },
  { label: 'Inbox', prompt: 'check my inbox' },
  { label: 'Briefing', prompt: 'brief me on' },
  { label: 'Draft Text', prompt: 'help me draft a text' },
  { label: 'Teach Workflow', prompt: 'I want to teach you a new workflow — use the skill creator to ask me questions and build a skill for it' },
];

interface Props {
  onChipTap: (chip: QuickChip) => void;
}

export default function QuickChips({ onChipTap }: Props) {
  return (
    <div className="flex gap-1 px-3 py-1 overflow-x-auto scrollbar-none">
      {defaultChips.map((chip) => (
        <button
          key={chip.label}
          onClick={() => onChipTap(chip)}
          className="shrink-0 h-6 px-2.5 rounded bg-gray-900 border border-gray-700/50 text-[11px] text-gray-300 hover:bg-gray-800 hover:text-gray-200 transition-colors"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
