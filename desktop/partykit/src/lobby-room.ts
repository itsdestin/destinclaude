// partykit/src/lobby-room.ts
import type * as Party from "partykit/server";

interface UserInfo {
  username: string;
  status: "idle" | "in-game";
}

export default class LobbyRoom implements Party.Server {
  readonly options = { hibernate: true };
  private users = new Map<string, UserInfo>(); // connectionId → user info

  constructor(readonly room: Party.Room) {}

  onConnect(connection: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const username = url.searchParams.get("username");
    if (!username) {
      connection.close(4000, "Missing username");
      return;
    }

    this.users.set(connection.id, { username, status: "idle" });

    // Send full user list to the new connection
    connection.send(JSON.stringify({
      type: "presence",
      users: this.getUserList(),
    }));

    // Broadcast join to everyone else
    this.room.broadcast(
      JSON.stringify({ type: "user-joined", username, status: "idle" }),
      [connection.id],
    );
  }

  onMessage(message: string | ArrayBuffer, sender: Party.Connection) {
    if (typeof message !== "string") return;

    let data: any;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    const senderInfo = this.users.get(sender.id);
    if (!senderInfo) return;

    switch (data.type) {
      case "status": {
        senderInfo.status = data.status;
        this.room.broadcast(JSON.stringify({
          type: "user-status",
          username: senderInfo.username,
          status: data.status,
        }));
        break;
      }

      case "challenge": {
        const targetConn = this.findConnectionByUsername(data.target);
        if (targetConn) {
          targetConn.send(JSON.stringify({
            type: "challenge",
            from: senderInfo.username,
            gameType: data.gameType,
            code: data.code,
          }));
        }
        break;
      }

      case "challenge-response": {
        const challengerConn = this.findConnectionByUsername(data.from);
        if (challengerConn) {
          challengerConn.send(JSON.stringify({
            type: "challenge-response",
            from: senderInfo.username,
            accept: data.accept,
          }));
        }
        break;
      }
    }
  }

  onClose(connection: Party.Connection) {
    const info = this.users.get(connection.id);
    if (info) {
      this.users.delete(connection.id);
      this.room.broadcast(JSON.stringify({
        type: "user-left",
        username: info.username,
      }));
    }
  }

  onError(connection: Party.Connection) {
    this.onClose(connection);
  }

  private getUserList(): UserInfo[] {
    return Array.from(this.users.values());
  }

  private findConnectionByUsername(username: string): Party.Connection | null {
    for (const conn of this.room.getConnections()) {
      const info = this.users.get(conn.id);
      if (info && info.username === username) return conn;
    }
    return null;
  }
}
