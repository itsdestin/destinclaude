import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { usePtyOutput } from '../hooks/useIpc';
import { registerTerminal, unregisterTerminal, notifyBufferReady } from '../hooks/terminal-registry';

interface Props {
  sessionId: string;
  visible: boolean;
}

export default function TerminalView({ sessionId, visible }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'Cascadia Code', 'Fira Code', monospace",
      theme: {
        background: '#0A0A0A',
        foreground: '#E0E0E0',
        cursor: '#E0E0E0',
        selectionBackground: '#264f78',
      },
    });

    const fitAddon = new FitAddon();
    const unicode11 = new Unicode11Addon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(unicode11);
    terminal.unicode.activeVersion = '11';
    terminal.open(containerRef.current);

    // WebGL renderer must be loaded after open() — eliminates grid-line
    // artifacts from the DOM renderer's sub-pixel rounding issues
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      terminal.loadAddon(webgl);
    } catch {
      // Falls back to DOM renderer if WebGL unavailable
    }

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    registerTerminal(sessionId, terminal);

    // Signal to main process that we're ready to receive PTY output.
    // This flushes any buffered output that arrived before mount.
    window.claude.session.signalReady(sessionId);

    // Fit terminal to container and sync dimensions to PTY
    const fitAndSync = () => {
      try {
        fitAddon.fit();
        const dims = fitAddon.proposeDimensions();
        if (dims && dims.cols && dims.rows) {
          window.claude.session.resize(sessionId, dims.cols, dims.rows);
        }
      } catch {
        // Ignore fit errors during teardown
      }
    };

    // Initial fit with delay to ensure container is laid out
    const timer = setTimeout(fitAndSync, 100);

    // Send user keyboard input to PTY
    terminal.onData((data) => {
      window.claude.session.sendInput(sessionId, data);
    });

    // Resize handler
    window.addEventListener('resize', fitAndSync);

    // Observe container size changes
    const resizeObserver = new ResizeObserver(() => fitAndSync());
    resizeObserver.observe(containerRef.current);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', fitAndSync);
      resizeObserver.disconnect();
      unregisterTerminal(sessionId);
      terminal.dispose();
    };
  }, [sessionId]);

  // Re-fit when visible, blur when hidden (prevents xterm stealing keyboard input)
  useEffect(() => {
    if (visible && fitAddonRef.current) {
      const timer = setTimeout(() => {
        try {
          fitAddonRef.current!.fit();
          const dims = fitAddonRef.current!.proposeDimensions();
          if (dims && dims.cols && dims.rows) {
            window.claude.session.resize(sessionId, dims.cols, dims.rows);
          }
          terminalRef.current?.focus();
        } catch {
          // Ignore
        }
      }, 50);
      return () => clearTimeout(timer);
    } else if (!visible && terminalRef.current) {
      terminalRef.current.blur();
    }
  }, [visible, sessionId]);

  // Write PTY output to terminal; notify registry when buffer is updated
  usePtyOutput(sessionId, (data) => {
    terminalRef.current?.write(data, () => notifyBufferReady(sessionId));
  });

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: '#0A0A0A',
        borderRadius: 8,
        overflow: 'hidden',
        // Use visibility:hidden instead of display:none so xterm.js can
        // measure fonts and maintain its screen buffer while the terminal
        // tab is not active. display:none causes a 0x0 container, which
        // prevents xterm from initializing properly — the prompt detector
        // then reads an empty buffer and can't detect Ink select menus.
        visibility: visible ? 'visible' : 'hidden',
        // Prevent the hidden terminal from capturing pointer events —
        // xterm.js registers mousedown/mousemove handlers that block
        // text selection in the ChatView sitting underneath.
        pointerEvents: visible ? 'auto' : 'none',
      }}
    />
  );
}
