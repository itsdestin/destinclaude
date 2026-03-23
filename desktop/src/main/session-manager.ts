import { fork, spawn, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import path from 'path';
import { SessionInfo } from '../shared/types';
import { EventEmitter } from 'events';

export interface CreateSessionOpts {
  name: string;
  cwd: string;
  skipPermissions: boolean;
  cols?: number;
  rows?: number;
}

interface ManagedSession {
  info: SessionInfo;
  worker: ChildProcess;
}

export class SessionManager extends EventEmitter {
  private sessions = new Map<string, ManagedSession>();
  private pipeName: string = '';

  setPipeName(name: string) {
    this.pipeName = name;
  }

  createSession(opts: CreateSessionOpts): SessionInfo {
    const id = randomUUID();
    const args: string[] = [];
    if (opts.skipPermissions) {
      args.push('--dangerously-skip-permissions');
    }

    // Spawn a separate Node.js process for node-pty so it uses Node's
    // native binary instead of Electron's (which requires electron-rebuild).
    // We use spawn with 'node' (system Node) + IPC channel instead of fork()
    // because fork() uses Electron's Node.js which has the same ABI mismatch.
    const workerPath = path.join(__dirname, 'pty-worker.js');
    const worker = spawn('node', [workerPath], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });

    const info: SessionInfo = {
      id,
      name: opts.name,
      cwd: opts.cwd,
      permissionMode: opts.skipPermissions ? 'bypass' : 'normal',
      skipPermissions: opts.skipPermissions,
      status: 'active',
      createdAt: Date.now(),
    };

    const session: ManagedSession = { info, worker };
    this.sessions.set(id, session);

    worker.on('message', (msg: any) => {
      switch (msg.type) {
        case 'data':
          this.emit('pty-output', id, msg.data);
          break;
        case 'exit':
          if (!this.sessions.has(id)) return;
          const exitingSession = this.sessions.get(id)!;
          exitingSession.info.status = 'destroyed';
          this.emit('session-exit', id, msg.exitCode);
          this.sessions.delete(id);
          break;
      }
    });

    worker.on('exit', () => {
      if (!this.sessions.has(id)) return;
      const exitingSession = this.sessions.get(id)!;
      exitingSession.info.status = 'destroyed';
      this.emit('session-exit', id, 0);
      this.sessions.delete(id);
    });

    // Tell the worker to spawn claude, passing our session ID
    // so hook events can be correlated back to this session
    worker.send({
      type: 'spawn',
      command: 'claude',
      args,
      cwd: opts.cwd,
      cols: opts.cols || 80,
      rows: opts.rows || 24,
      sessionId: id,
      pipeName: this.pipeName,
    });

    return info;
  }

  destroySession(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.info.status = 'destroyed';
    this.sessions.delete(id);
    session.worker.send({ type: 'kill' });
    session.worker.disconnect();
    return true;
  }

  sendInput(id: string, text: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.worker.send({ type: 'input', data: text });
    return true;
  }

  resizeSession(id: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.worker.send({ type: 'resize', cols, rows });
    return true;
  }

  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map(s => s.info);
  }

  getSession(id: string): SessionInfo | undefined {
    return this.sessions.get(id)?.info;
  }

  destroyAll(): void {
    for (const [id] of this.sessions) {
      this.destroySession(id);
    }
  }
}
