import React, { useState } from 'react';
import { ToolCallState } from '../../shared/types';
import { useChatDispatch } from '../state/chat-context';
import BrailleSpinner from './BrailleSpinner';

const TOOL_LABELS: Record<string, string> = {
  Read: 'Read File',
  Write: 'Write File',
  Edit: 'Edit File',
  Bash: 'Run Command',
  Glob: 'Find Files',
  Grep: 'Search Code',
  WebFetch: 'Fetch URL',
  WebSearch: 'Web Search',
  Agent: 'Sub-Agent',
  NotebookEdit: 'Edit Notebook',
};

function toolLabel(name: string): string {
  return TOOL_LABELS[name] || name;
}

function toolSummary(tool: ToolCallState): string {
  const { toolName, input } = tool;
  switch (toolName) {
    case 'Read':
      return (input.file_path as string) || '';
    case 'Write':
      return (input.file_path as string) || '';
    case 'Edit':
      return (input.file_path as string) || '';
    case 'Bash':
      return (input.command as string) || '';
    case 'Glob':
      return (input.pattern as string) || '';
    case 'Grep':
      return (input.pattern as string) || '';
    default:
      return '';
  }
}

function PermissionButtons({ requestId, suggestions, onResponded }: {
  requestId: string;
  suggestions?: string[];
  onResponded?: () => void;
}) {
  const [responding, setResponding] = useState(false);
  const handleRespond = async (decision: object) => {
    setResponding(true);
    // Optimistically collapse the permission buttons immediately
    if (onResponded) onResponded();
    try {
      await (window as any).claude.session.respondToPermission(requestId, decision);
    } catch (err) {
      console.error('Failed to respond to permission:', err);
      setResponding(false);
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-700 bg-gray-800/30">
      <button
        disabled={responding}
        onClick={() => handleRespond({ decision: { behavior: 'allow' } })}
        className="px-3 py-1 text-xs font-medium rounded bg-green-600 hover:bg-green-500 text-white transition-colors disabled:opacity-50"
      >
        Yes
      </button>
      {suggestions?.length ? (
        <button
          disabled={responding}
          onClick={() => handleRespond({ decision: { behavior: 'allow' }, updatedPermissions: [suggestions[0]] })}
          className="px-3 py-1 text-xs font-medium rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
        >
          Always Allow
        </button>
      ) : null}
      <button
        disabled={responding}
        onClick={() => handleRespond({ decision: { behavior: 'deny' } })}
        className="px-3 py-1 text-xs font-medium rounded bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50"
      >
        No
      </button>
    </div>
  );
}

interface Props {
  tool: ToolCallState;
  sessionId?: string;
}

export default function ToolCard({ tool, sessionId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const dispatch = useChatDispatch();
  const summary = toolSummary(tool);

  return (
    <div className="border border-gray-700 rounded-lg bg-gray-850 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-800/50 transition-colors"
      >
        {/* Status indicator */}
        {tool.status === 'running' && (
          <BrailleSpinner size="sm" />
        )}
        {tool.status === 'complete' && (
          <svg className="w-4 h-4 shrink-0 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
        {tool.status === 'failed' && (
          <svg className="w-4 h-4 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}

        <span className="text-xs font-medium text-gray-300">{toolLabel(tool.toolName)}</span>
        {summary && (
          <span className="text-xs text-gray-500 truncate flex-1 min-w-0">{summary}</span>
        )}
        <svg
          className={`w-3.5 h-3.5 text-gray-500 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>


      {/* Permission approval buttons */}
      {tool.status === 'awaiting-approval' && tool.requestId && (
        <PermissionButtons
          requestId={tool.requestId}
          suggestions={tool.permissionSuggestions}
          onResponded={() => {
            if (sessionId && tool.requestId) {
              dispatch({ type: 'PERMISSION_RESPONDED', sessionId, requestId: tool.requestId });
            }
          }}
        />
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-700 pt-2 space-y-2">
          {Object.keys(tool.input).length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Input</div>
              <pre className="text-xs text-gray-400 bg-gray-900 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            </div>
          )}
          {tool.response && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Response</div>
              <pre className="text-xs text-gray-400 bg-gray-900 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">
                {tool.response}
              </pre>
            </div>
          )}
          {tool.error && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-red-500 mb-1">Error</div>
              <pre className="text-xs text-red-400 bg-gray-900 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto">
                {tool.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
