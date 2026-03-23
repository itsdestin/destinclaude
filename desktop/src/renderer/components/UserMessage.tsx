import React from 'react';
import { ChatMessage } from '../../shared/types';
import LinkableText from './LinkableText';

interface Props {
  message: ChatMessage;
}

export default function UserMessage({ message }: Props) {
  return (
    <div className="flex justify-end px-4 py-2">
      <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-gray-300 px-4 py-2.5 text-sm text-gray-950 whitespace-pre-wrap">
        <LinkableText text={message.content} />
      </div>
    </div>
  );
}
