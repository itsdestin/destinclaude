// partykit/src/connect-four-room.ts
import type * as Party from "partykit/server";

export default class ConnectFourRoom implements Party.Server {
  readonly options = { hibernate: true };
  private players = new Map<string, string>(); // connectionId → username

  constructor(readonly room: Party.Room) {}

  onConnect(connection: Party.Connection, ctx: Party.ConnectionContext) {
    const url = new URL(ctx.request.url);
    const username = url.searchParams.get("username");
    if (!username) {
      connection.close(4000, "Missing username");
      return;
    }

    this.players.set(connection.id, username);

    // Notify the new player of who's already in the room
    for (const [connId, name] of this.players) {
      if (connId !== connection.id) {
        connection.send(JSON.stringify({ type: "player-joined", username: name }));
      }
    }

    // Notify existing players that someone joined
    this.room.broadcast(
      JSON.stringify({ type: "player-joined", username }),
      [connection.id],
    );
  }

  onMessage(message: string | ArrayBuffer, sender: Party.Connection) {
    if (typeof message !== "string") return;
    this.room.broadcast(message, [sender.id]);
  }

  onClose(connection: Party.Connection) {
    const username = this.players.get(connection.id);
    if (username) {
      this.players.delete(connection.id);
      this.room.broadcast(JSON.stringify({
        type: "player-left",
        username,
      }));
    }
  }

  onError(connection: Party.Connection) {
    this.onClose(connection);
  }
}
