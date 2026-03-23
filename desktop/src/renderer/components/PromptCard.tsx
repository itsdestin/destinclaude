import React, { useEffect, useState } from 'react';
import { InteractivePrompt } from '../state/chat-types';
import { getScreenText } from '../hooks/terminal-registry';

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
  accept: 'bg-[#2E7D32] hover:bg-[#388E3C] text-white',
  reject: 'bg-[#DD4444] hover:bg-[#E55555] text-white',
  neutral: 'bg-gray-300 hover:bg-gray-200 text-gray-950',
};

export default function PromptCard({ prompt, sessionId, onSelect }: Props) {
  const [preview, setPreview] = useState<string>('');

  // Grab a snapshot of the terminal screen for context
  useEffect(() => {
    if (prompt.completed) return;
    const screen = getScreenText(sessionId);
    if (screen) {
      // Show last ~8 non-empty lines as context
      const lines = screen.split('\n').filter((l) => l.trim());
      setPreview(lines.slice(-8).join('\n'));
    }
  }, [sessionId, prompt.completed]);

  if (prompt.completed) {
    return (
      <div className="px-4 py-1">
        <div className="border border-gray-700 rounded-lg bg-gray-800/50 px-3 py-2 flex items-center gap-2">
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
    <div className="px-4 py-2">
      <div className="border border-amber-700/50 rounded-lg bg-gray-800 overflow-hidden">
        {/* Mini terminal preview */}
        {preview && (
          <div className="px-3 pt-3 pb-2">
            <pre className="text-[11px] leading-tight text-gray-500 bg-gray-900 rounded p-2 overflow-x-auto max-h-24 overflow-y-auto font-mono whitespace-pre">
              {preview}
            </pre>
          </div>
        )}
        {/* Prompt title and buttons */}
        <div className="px-3 pb-3 pt-1">
          <div className="text-sm font-medium text-gray-200 mb-2">{prompt.title}</div>
          <div className="flex flex-wrap gap-2">
            {prompt.buttons.map((btn) => (
              <button
                key={btn.label}
                onClick={() => onSelect(btn.input, btn.label)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${intentStyles[buttonIntent(btn.label)]}`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
