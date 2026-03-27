import React, { useState } from 'react';
import { ToolCallState, ToolGroupState } from '../../shared/types';
import ToolCard from './ToolCard';
import { CheckIcon, ChevronIcon } from './Icons';
import BrailleSpinner from './BrailleSpinner';

interface Props {
  group: ToolGroupState;
  toolCalls: Map<string, ToolCallState>;
  sessionId?: string;
}

export default function ToolGroup({ group, toolCalls, sessionId }: Props) {
  const tools = group.toolIds
    .map((id) => toolCalls.get(id))
    .filter((t): t is ToolCallState => t !== undefined);

  const [expanded, setExpanded] = useState(false);

  if (tools.length === 0) return null;

  // Single tool: render compact
  if (tools.length === 1) {
    return (
      <div className="px-4 py-1">
        <ToolCard tool={tools[0]} sessionId={sessionId} />
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
          className="w-full flex items-center gap-1.5 px-3 py-2 text-left hover:bg-gray-800/50 transition-colors"
        >
          {runningCount > 0 ? (
            <BrailleSpinner size="sm" />
          ) : (
            <CheckIcon className="w-3.5 h-3.5 shrink-0 text-gray-400" />
          )}
          <span className="text-gray-600 text-xs select-none">|</span>
          <span className="text-xs text-gray-400 flex-1">{statusText}</span>
          <ChevronIcon className="w-3.5 h-3.5 shrink-0 text-gray-500" expanded={expanded} />
        </button>
        {expanded && (
          <div className="px-2 pb-2 space-y-1">
            {tools.map((tool) => (
              <ToolCard key={tool.toolUseId} tool={tool} sessionId={sessionId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
