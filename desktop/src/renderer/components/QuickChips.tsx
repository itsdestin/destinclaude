import React from 'react';
import { isAndroid } from '../platform';

export interface QuickChip {
  label: string;
  prompt: string;
}

export const defaultChips: QuickChip[] = [
  { label: 'Journal', prompt: "let's journal" },
  { label: 'Inbox', prompt: 'check my inbox' },
  { label: 'Git Status', prompt: 'run git status and summarize what\'s changed' },
  { label: 'Review PR', prompt: 'review the latest PR on this repo' },
  { label: 'Fix Tests', prompt: 'run the tests and fix any failures' },
  { label: 'Briefing', prompt: 'brief me on ' },
  { label: 'Draft Text', prompt: 'help me draft a text to ' },
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
          className={`shrink-0 ${isAndroid() ? 'h-8 px-3' : 'h-6 px-2.5'} rounded bg-gray-900 border border-gray-700/50 text-[11px] text-gray-300 hover:bg-gray-800 hover:text-gray-200 transition-colors`}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
