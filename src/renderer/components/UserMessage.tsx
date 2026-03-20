import React from 'react';
import { ChatMessage } from '../../shared/types';

interface Props {
  message: ChatMessage;
}

export default function UserMessage({ message }: Props) {
  return (
    <div className="flex justify-end px-4 py-2">
      <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-indigo-600 px-4 py-2.5 text-sm text-white whitespace-pre-wrap">
        {message.content}
      </div>
    </div>
  );
}
