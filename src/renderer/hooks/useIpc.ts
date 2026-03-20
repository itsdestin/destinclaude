import { useEffect, useRef } from 'react';

// Type declaration for the preload API
declare global {
  interface Window {
    claude: {
      session: {
        create: (opts: { name: string; cwd: string; skipPermissions: boolean; cols?: number; rows?: number }) => Promise<any>;
        destroy: (sessionId: string) => Promise<boolean>;
        list: () => Promise<any[]>;
        sendInput: (sessionId: string, text: string) => void;
        resize: (sessionId: string, cols: number, rows: number) => void;
      };
      on: {
        sessionCreated: (cb: (info: any) => void) => (...args: any[]) => void;
        sessionDestroyed: (cb: (id: string) => void) => (...args: any[]) => void;
        ptyOutput: (cb: (sessionId: string, data: string) => void) => (...args: any[]) => void;
        hookEvent: (cb: (event: any) => void) => (...args: any[]) => void;
      };
      off: (channel: string, handler: (...args: any[]) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}

export function usePtyOutput(
  sessionId: string | null,
  onData: (data: string) => void,
) {
  const cbRef = useRef(onData);
  cbRef.current = onData;

  useEffect(() => {
    if (!sessionId) return;

    const handler = window.claude.on.ptyOutput((sid, data) => {
      if (sid === sessionId) {
        cbRef.current(data);
      }
    });

    return () => {
      window.claude.off('pty:output', handler);
    };
  }, [sessionId]);
}
