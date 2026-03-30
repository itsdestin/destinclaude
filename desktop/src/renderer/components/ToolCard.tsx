import React, { useState } from 'react';
import { ToolCallState } from '../../shared/types';
import { useChatDispatch } from '../state/chat-context';
import { CheckIcon, FailIcon, ChevronIcon } from './Icons';
import BrailleSpinner from './BrailleSpinner';

// --- Helpers for friendly display ---

function basename(filepath: string): string {
  const parts = filepath.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || parts[parts.length - 2] || filepath;
}

function parentDir(filepath: string): string {
  const parts = filepath.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] + '/' : '';
}

function titleCase(s: string): string {
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function friendlyToolDisplay(tool: ToolCallState): { label: string; detail: string } {
  const { toolName, input } = tool;

  switch (toolName) {
    case 'Bash': {
      const cmd = (input.command as string) || '';
      const desc = input.description as string | undefined;
      const bg = input.run_in_background ? ' ⟳' : '';
      let label: string;
      if (desc) {
        label = desc;
      } else if (cmd) {
        const firstBin = cmd.trimStart().split(/\s+/)[0] || 'command';
        label = `Running ${basename(firstBin)}`;
      } else {
        label = 'Run Command';
      }
      return { label: label + bg, detail: cmd ? `↳ ${truncate(cmd, 80)}` : '' };
    }

    case 'Read': {
      const fp = (input.file_path as string) || '';
      const label = fp ? `Reading ${basename(fp)}` : 'Reading File';
      let detail = fp ? `↳ ${parentDir(fp)}` : '';
      const offset = input.offset as number | undefined;
      const limit = input.limit as number | undefined;
      const pages = input.pages as string | undefined;
      if (offset != null && limit != null) {
        detail += ` lines ${offset}-${offset + limit}`;
      } else if (offset != null) {
        detail += ` from line ${offset}`;
      } else if (limit != null) {
        detail += ` first ${limit} lines`;
      }
      if (pages) {
        detail += ` pages ${pages}`;
      }
      return { label, detail };
    }

    case 'Write': {
      const fp = (input.file_path as string) || '';
      return {
        label: fp ? `Writing ${basename(fp)}` : 'Writing File',
        detail: fp ? `↳ ${parentDir(fp)}` : '',
      };
    }

    case 'Edit': {
      const fp = (input.file_path as string) || '';
      let detail = fp ? `↳ ${parentDir(fp)}` : '';
      const oldStr = input.old_string as string | undefined;
      if (oldStr) {
        detail += ` ${truncate(oldStr.replace(/\n/g, '⏎'), 40)}`;
      }
      return {
        label: fp ? `Editing ${basename(fp)}` : 'Editing File',
        detail,
      };
    }

    case 'Grep': {
      const pattern = (input.pattern as string) || '';
      const label = pattern ? `Searching for "${truncate(pattern, 30)}"` : 'Searching Code';
      let detail = '';
      if (input.glob) {
        detail = `↳ in ${input.glob} files`;
      } else if (input.path) {
        detail = `↳ in ${basename(input.path as string)}/`;
      } else if (input.type) {
        detail = `↳ in .${input.type} files`;
      }
      return { label, detail };
    }

    case 'Glob': {
      const pattern = (input.pattern as string) || '';
      const simplified = pattern.replace(/^\*\*\//, '');
      const label = pattern ? `Finding ${simplified} files` : 'Finding Files';
      const detail = input.path ? `↳ in ${basename(input.path as string)}/` : '';
      return { label, detail };
    }

    case 'Agent': {
      const desc = input.description as string | undefined;
      const bg = input.run_in_background ? ' ⟳' : '';
      const label = desc ? `Agent: ${desc}` : 'Running Sub-Agent';
      const detail = input.subagent_type ? `↳ ${input.subagent_type}` : '';
      return { label: label + bg, detail };
    }

    case 'WebSearch': {
      const query = input.query as string | undefined;
      return {
        label: 'Searching the Web',
        detail: query ? `↳ ${query}` : '',
      };
    }

    case 'WebFetch': {
      const url = input.url as string | undefined;
      let domain = '';
      if (url) {
        try {
          domain = new URL(url).hostname;
        } catch {
          domain = url;
        }
      }
      return {
        label: 'Fetching Webpage',
        detail: domain ? `↳ ${domain}` : '',
      };
    }

    case 'Skill': {
      const skill = input.skill as string | undefined;
      const args = input.args as string | undefined;
      return {
        label: skill ? `Running /${skill}` : 'Running Skill',
        detail: args ? `↳ ${args}` : '',
      };
    }

    case 'TaskCreate': {
      const subject = (input.subject as string) || '';
      return {
        label: subject ? `New Task: ${truncate(subject, 50)}` : 'New Task',
        detail: '',
      };
    }

    case 'TaskUpdate': {
      const status = input.status as string | undefined;
      let label: string;
      switch (status) {
        case 'completed':
          label = 'Task Completed';
          break;
        case 'in_progress':
          label = 'Task Started';
          break;
        case 'deleted':
          label = 'Task Deleted';
          break;
        default:
          label = 'Updating Task';
      }
      const taskId = input.taskId as string | undefined;
      return { label, detail: taskId ? `↳ #${taskId}` : '' };
    }

    default: {
      // MCP tools: mcp__{server}__{action}
      if (toolName.startsWith('mcp__')) {
        const parts = toolName.slice(5).split('__');
        const server = parts[0] ? titleCase(parts[0]) : toolName;
        const action = parts[1] ? titleCase(parts[1]) : '';
        const label = action ? `${server}: ${action}` : server;
        // Show the most interesting input value as detail
        let detail = '';
        const values = Object.values(input).filter(v => typeof v === 'string' && v.length > 0) as string[];
        if (values.length > 0) {
          detail = `↳ ${truncate(values[0], 60)}`;
        }
        return { label, detail };
      }

      // Unknown tool — show name as-is
      return { label: toolName, detail: '' };
    }
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
  const display = friendlyToolDisplay(tool);

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
        <span className="text-xs font-medium text-gray-300">{display.label}</span>
        {display.detail && (
          <span className="text-xs text-gray-500 truncate flex-1 min-w-0">{display.detail}</span>
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
