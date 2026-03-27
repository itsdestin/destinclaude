import React from 'react';
import { ChatMessage } from '../../shared/types';
import MarkdownContent from './MarkdownContent';

interface Props {
  message: ChatMessage;
}

export default React.memo(function AssistantMessage({ message }: Props) {
  return (
    <div className="flex justify-start px-4 py-2">
      <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-800 px-4 py-3 text-sm text-gray-200">
        <MarkdownContent content={message.content} />
      </div>
    </div>
  );
});
