import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 px-2 py-1 text-xs rounded bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors opacity-0 group-hover:opacity-100"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

export default function MarkdownContent({ content }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        pre({ children, ...props }) {
          // Extract code text for copy button
          let codeText = '';
          React.Children.forEach(children, (child) => {
            if (React.isValidElement(child) && child.props) {
              const c = child as React.ReactElement<{ children?: React.ReactNode }>;
              if (typeof c.props.children === 'string') {
                codeText = c.props.children;
              }
            }
          });
          return (
            <div className="relative group my-2">
              <pre className="rounded-md bg-gray-900 p-3 overflow-x-auto text-sm" {...props}>
                {children}
              </pre>
              {codeText && <CopyButton text={codeText} />}
            </div>
          );
        },
        code({ className, children, ...props }) {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="bg-gray-800 rounded px-1.5 py-0.5 text-sm text-indigo-300" {...props}>
                {children}
              </code>
            );
          }
          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        a({ href, children, ...props }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:text-indigo-300 underline"
              {...props}
            >
              {children}
            </a>
          );
        },
        table({ children, ...props }) {
          return (
            <div className="overflow-x-auto my-2">
              <table className="border-collapse border border-gray-700 text-sm" {...props}>
                {children}
              </table>
            </div>
          );
        },
        th({ children, ...props }) {
          return (
            <th className="border border-gray-700 px-3 py-1.5 bg-gray-800 text-left font-medium" {...props}>
              {children}
            </th>
          );
        },
        td({ children, ...props }) {
          return (
            <td className="border border-gray-700 px-3 py-1.5" {...props}>
              {children}
            </td>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
