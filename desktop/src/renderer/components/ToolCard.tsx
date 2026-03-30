import React, { useState } from 'react';
import { ToolCallState } from '../../shared/types';
import { useChatDispatch } from '../state/chat-context';
import { CheckIcon, FailIcon, ChevronIcon } from './Icons';
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

function PermissionButtons({ requestId, suggestions, onResponded, onFailed }: {
  requestId: string;
  suggestions?: string[];
  onResponded?: () => void;
  onFailed?: () => void;
}) {
  const [responding, setResponding] = useState(false);
  const handleRespond = async (decision: object) => {
    setResponding(true);
    try {
      const delivered = await (window as any).claude.session.respondToPermission(requestId, decision);
      if (delivered === false) {
        // Socket was already closed (timeout or Claude Code killed the hook)
        console.warn('Permission response not delivered — socket already closed');
        setResponding(false);
        if (onFailed) onFailed();
        return;
      }
      if (onResponded) onResponded();
    } catch (err) {
      console.error('Failed to respond to permission:', err);
      setResponding(false);
      if (onFailed) onFailed();
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-gray-700 bg-gray-800/30">
      <button
        disabled={responding}
        onClick={() => handleRespond({ decision: { behavior: 'allow' } })}
        className="px-3 py-1 text-xs font-medium rounded bg-green-600/60 hover:bg-green-600/80 text-green-100 transition-colors disabled:opacity-50"
      >
        Yes
      </button>
      {suggestions?.length ? (
        <button
          disabled={responding}
          onClick={() => handleRespond({ decision: { behavior: 'allow' }, updatedPermissions: [suggestions[0]] })}
          className="px-3 py-1 text-xs font-medium rounded bg-blue-600/60 hover:bg-blue-600/80 text-blue-100 transition-colors disabled:opacity-50"
        >
          Always Allow
        </button>
      ) : null}
      <button
        disabled={responding}
        onClick={() => handleRespond({ decision: { behavior: 'deny' } })}
        className="px-3 py-1 text-xs font-medium rounded bg-red-600/60 hover:bg-red-600/80 text-red-100 transition-colors disabled:opacity-50"
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
        className="w-full flex items-center gap-1.5 px-3 py-2 text-left hover:bg-gray-800/50 transition-colors"
      >
        {/* Status indicator */}
        {tool.status === 'running' && (
          <BrailleSpinner size="sm" />
        )}
        {tool.status === 'complete' && (
          <CheckIcon className="w-3.5 h-3.5 shrink-0 text-gray-400" />
        )}
        {tool.status === 'failed' && (
          <FailIcon className="w-3.5 h-3.5 shrink-0 text-gray-400" />
        )}
        <span className="text-gray-600 text-xs select-none">|</span>
        <span className="text-xs font-medium text-gray-300">{toolLabel(tool.toolName)}</span>
        {summary && (
          <span className="text-xs text-gray-500 truncate flex-1 min-w-0">{summary}</span>
        )}
        <ChevronIcon className="w-3.5 h-3.5 shrink-0 text-gray-500" expanded={expanded} />
      </button>


      {/* Permission approval buttons */}
      {tool.status === 'awaiting-approval' && tool.requestId && (
        <PermissionButtons
          requestId={tool.requestId}
          suggestions={tool.permissionSuggestions}
          onResponded={() => {
            if (sessionId && tool.requestId) {
              const action = { type: 'PERMISSION_RESPONDED' as const, sessionId, requestId: tool.requestId };
              dispatch(action);
              (window as any).claude?.remote?.broadcastAction(action);
            }
          }}
          onFailed={() => {
            if (sessionId && tool.requestId) {
              const action = { type: 'PERMISSION_EXPIRED' as const, sessionId, requestId: tool.requestId };
              dispatch(action);
              (window as any).claude?.remote?.broadcastAction(action);
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
              <pre className="text-xs text-gray-400 bg-gray-900 rounded p-2 overflow-auto max-h-48">
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            </div>
          )}
          {tool.response && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Response</div>
              <pre className="text-xs text-gray-400 bg-gray-900 rounded p-2 overflow-auto max-h-48">
                {tool.response}
              </pre>
            </div>
          )}
          {tool.error && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-red-500 mb-1">Error</div>
              <pre className="text-xs text-red-400 bg-gray-900 rounded p-2 overflow-auto max-h-48">
                {tool.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
