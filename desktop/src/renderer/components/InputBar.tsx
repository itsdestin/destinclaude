import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useChatDispatch } from '../state/chat-context';
import QuickChips, { QuickChip } from './QuickChips';
import { AttachIcon, CompassIcon } from './Icons';
import BrailleBurst from './BrailleBurst';

interface Props {
  sessionId: string;
  disabled?: boolean;
  onOpenDrawer?: (searchMode: boolean) => void;
}

interface Attachment {
  path: string;
  name: string;
  isImage: boolean;
}

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];

function isImagePath(p: string): boolean {
  const lower = p.toLowerCase();
  return IMAGE_EXTS.some((ext) => lower.endsWith(ext));
}

function fileNameFromPath(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() || p;
}

export default function InputBar({ sessionId, disabled, onOpenDrawer }: Props) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dispatch = useChatDispatch();

  useEffect(() => {
    inputRef.current?.focus();
  }, [sessionId]);

  const addFiles = useCallback((paths: string[]) => {
    setAttachments((prev) => {
      const existing = new Set(prev.map((a) => a.path));
      const newOnes = paths
        .filter((p) => !existing.has(p))
        .map((p) => ({ path: p, name: fileNameFromPath(p), isImage: isImagePath(p) }));
      return [...prev, ...newOnes];
    });
  }, []);

  const removeAttachment = useCallback((path: string) => {
    setAttachments((prev) => prev.filter((a) => a.path !== path));
  }, []);

  const sendMessage = useCallback(
    (message: string, files: Attachment[] = []) => {
      const parts: string[] = [];
      for (const f of files) {
        parts.push(f.path);
      }
      if (message.trim()) {
        parts.push(message.trim());
      }
      const combined = parts.join(' ');
      if (!combined || disabled) return;

      dispatch({
        type: 'USER_PROMPT',
        sessionId,
        content: combined,
        timestamp: Date.now(),
      });

      window.claude.session.sendInput(sessionId, combined + '\r');
    },
    [sessionId, disabled, dispatch],
  );

  const send = useCallback(() => {
    sendMessage(text, attachments);
    setText('');
    setAttachments([]);
  }, [text, attachments, sendMessage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send();
  };

  const handleChip = useCallback(
    (chip: QuickChip) => {
      sendMessage(chip.prompt);
    },
    [sendMessage],
  );

  const handleAttachClick = useCallback(async () => {
    try {
      const paths = await window.claude.dialog.openFile();
      if (paths.length > 0) {
        addFiles(paths);
      }
    } catch (err) {
      console.error('Failed to open file dialog:', err);
    }
  }, [addFiles]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const saved = await window.claude.dialog.saveClipboardImage();
        if (saved) addFiles([saved]);
        return;
      }
    }
  }, [addFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const paths = Array.from(e.dataTransfer.files).map((f) => (f as any).path as string).filter(Boolean);
    if (paths.length > 0) addFiles(paths);
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div
      className="border-t border-gray-800 shrink-0"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <QuickChips onChipTap={handleChip} />

      {attachments.length > 0 && (
        <div className="flex gap-2 px-3 py-2 overflow-x-auto">
          {attachments.map((att) => (
            <div key={att.path} className="relative shrink-0 group">
              {att.isImage ? (
                <img
                  src={`file://${att.path.replace(/\\/g, '/')}`}
                  alt={att.name}
                  className="w-12 h-12 rounded-md object-cover border border-gray-700"
                />
              ) : (
                <div className="w-12 h-12 rounded-md border border-gray-700 bg-gray-900 flex items-center justify-center">
                  <span className="text-[9px] text-gray-400 text-center leading-tight px-1 truncate">
                    {att.name}
                  </span>
                </div>
              )}
              <button
                onClick={() => removeAttachment(att.path)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600 flex items-center justify-center text-[10px] leading-none opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="px-3 pb-3">
        <form onSubmit={handleSubmit} className="flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2">
          <BrailleBurst
            onTrigger={handleAttachClick}
            disabled={disabled}
            className="shrink-0 text-gray-400 hover:text-gray-200 disabled:opacity-30 transition-colors"
            title="Attach file"
          >
            <AttachIcon className="w-5 h-5" />
          </BrailleBurst>
          <BrailleBurst
            onTrigger={() => onOpenDrawer?.(false)}
            disabled={disabled}
            className="shrink-0 text-gray-400 hover:text-gray-200 disabled:opacity-30 transition-colors"
            title="Browse skills"
          >
            <CompassIcon className="w-5 h-5" />
          </BrailleBurst>
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => {
              const val = e.target.value;
              // Detect "/" typed as first character — open drawer in search mode
              if (val === '/' && text === '') {
                onOpenDrawer?.(true);
                return;
              }
              setText(val);
            }}
            onPaste={handlePaste}
            placeholder={disabled ? 'Waiting for approval...' : 'Message Claude...'}
            disabled={disabled}
            autoFocus
            className="flex-1 bg-transparent text-sm text-gray-200 placeholder-gray-500 outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={disabled || (!text.trim() && attachments.length === 0)}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg bg-gray-300 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-gray-300 transition-colors"
          >
            <svg className="w-4 h-4 text-gray-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
