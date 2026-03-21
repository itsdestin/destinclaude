export interface OnlineUser {
  username: string;
  status: 'idle' | 'in-game';
}

export class Presence {
  private users = new Map<string, 'idle' | 'in-game'>();

  addUser(username: string): void {
    this.users.set(username, 'idle');
  }

  removeUser(username: string): void {
    this.users.delete(username);
  }

  setStatus(username: string, status: 'idle' | 'in-game'): void {
    if (this.users.has(username)) {
      this.users.set(username, status);
    }
  }

  isOnline(username: string): boolean {
    return this.users.has(username);
  }

  getOnlineUsers(): OnlineUser[] {
    return Array.from(this.users.entries()).map(([username, status]) => ({ username, status }));
  }
}
