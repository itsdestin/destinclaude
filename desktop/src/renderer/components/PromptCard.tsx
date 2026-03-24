import React from 'react';
import { InteractivePrompt } from '../state/chat-types';

interface Props {
  prompt: InteractivePrompt;
  sessionId: string;
  onSelect: (input: string, label: string) => void;
}

// Classify button intent from label text
function buttonIntent(label: string): 'accept' | 'reject' | 'neutral' {
  const l = label.toLowerCase();
  if (/^(yes|allow|accept|trust|approve)\b/.test(l)) return 'accept';
  if (/always allow/.test(l)) return 'accept';
  if (/^(no|deny|reject|decline|skip|cancel|abort)\b/.test(l)) return 'reject';
  if (/don.t trust/.test(l)) return 'reject';
  return 'neutral';
}

const intentStyles = {
  accept: 'bg-green-600 hover:bg-green-500 text-white',
  reject: 'bg-red-600 hover:bg-red-500 text-white',
  neutral: 'bg-blue-600 hover:bg-blue-500 text-white',
};

/**
 * Parser-detected prompt card — styled to match the hook-based ToolCard
 * so the user sees a consistent UI regardless of which system detected
 * the prompt.  No terminal preview, just a clean card with title and buttons.
 */
export default function PromptCard({ prompt, sessionId, onSelect }: Props) {
  if (prompt.completed) {
    return (
      <div className="px-4 py-1">
        <div className="border border-gray-700 rounded-lg bg-gray-850 px-3 py-2 flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-xs text-gray-400">{prompt.title}:</span>
          <span className="text-xs text-gray-200 font-medium">{prompt.completed}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-1">
      <div className="border border-gray-700 rounded-lg bg-gray-850 overflow-hidden">
        {/* Header — matches ToolCard header style */}
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="text-xs font-medium text-gray-300">{prompt.title}</span>
        </div>
        {/* Buttons — matches ToolCard PermissionButtons style */}
        <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-700 bg-gray-800/30">
          {prompt.buttons.map((btn) => (
            <button
              key={btn.label}
              onClick={() => onSelect(btn.input, btn.label)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${intentStyles[buttonIntent(btn.label)]}`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
