import React, { useState, useEffect } from 'react';
import { ToolCallState, ToolGroupState } from '../../shared/types';
import ToolCard from './ToolCard';

interface Props {
  group: ToolGroupState;
  toolCalls: Map<string, ToolCallState>;
  onApprove: (toolUseId: string) => void;
  onReject: (toolUseId: string) => void;
}

export default function ToolGroup({ group, toolCalls, onApprove, onReject }: Props) {
  const tools = group.toolIds
    .map((id) => toolCalls.get(id))
    .filter((t): t is ToolCallState => t !== undefined);

  const needsApproval = tools.some((t) => t.status === 'awaiting-approval');
  const [expanded, setExpanded] = useState(needsApproval);

  // Auto-expand when approval is needed
  useEffect(() => {
    if (needsApproval) setExpanded(true);
  }, [needsApproval]);

  if (tools.length === 0) return null;

  // Single tool with no approval: render compact
  if (tools.length === 1 && !needsApproval) {
    return (
      <div className="px-4 py-1">
        <ToolCard
          tool={tools[0]}
          onApprove={() => onApprove(tools[0].toolUseId)}
          onReject={() => onReject(tools[0].toolUseId)}
        />
      </div>
    );
  }

  const completedCount = tools.filter((t) => t.status === 'complete').length;
  const runningCount = tools.filter((t) => t.status === 'running').length;

  let statusText = `${tools.length} tool calls`;
  if (runningCount > 0) {
    statusText += ` (${runningCount} running)`;
  } else if (completedCount === tools.length) {
    statusText += ' (all complete)';
  }

  return (
    <div className="px-4 py-1">
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-800/50 transition-colors"
        >
          {runningCount > 0 ? (
            <span className="w-4 h-4 shrink-0 rounded-full border-2 border-indigo-400 border-t-transparent animate-spin" />
          ) : needsApproval ? (
            <span className="w-4 h-4 shrink-0 rounded-full bg-amber-500" />
          ) : (
            <svg className="w-4 h-4 shrink-0 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          <span className="text-xs text-gray-400 flex-1">{statusText}</span>
          <svg
            className={`w-3.5 h-3.5 text-gray-500 transition-transform shrink-0 ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {expanded && (
          <div className="px-2 pb-2 space-y-1">
            {tools.map((tool) => (
              <ToolCard
                key={tool.toolUseId}
                tool={tool}
                onApprove={() => onApprove(tool.toolUseId)}
                onReject={() => onReject(tool.toolUseId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
