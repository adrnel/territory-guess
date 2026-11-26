import { DurableObject } from "cloudflare:workers";
import {
  createRoom, disconnect, join, lock, ready, JOIN_ERROR_MESSAGES, nextWake, rematch, ROOM_IDLE_MS, setGuess, start, tick, toPublic, unready,
  type ClientMessage, type RoomState, type ServerMessage,
} from "../lib/room";

/**
 * One instance per multiplayer room (addressed by room code). Uses hibernating
 * WebSockets and SQLite-backed storage, both available on the Workers Free plan.
 * All game rules live in src/lib/room.ts.
 */
export class Room extends DurableObject {
  private room: RoomState | null | undefined;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    // Keep-alive pings are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  private async load(): Promise<RoomState | null> {
    if (this.room === undefined) this.room = (await this.ctx.storage.get<RoomState>("room")) ?? null;
    return this.room;
  }

  private async save(room: RoomState) {
    this.room = room;
    await this.ctx.storage.put("room", room);
    const wake = nextWake(room);
    if (wake === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(wake);
  }

  private send(ws: WebSocket, message: ServerMessage) {
    try { ws.send(JSON.stringify(message)); } catch { /* socket already closed */ }
  }

  private broadcast(room: RoomState) {
    const now = Date.now();
    // Each player gets their own view: a rival's guess stays hidden until the round is over.
    for (const ws of this.ctx.getWebSockets()) {
      const playerId = ws.deserializeAttachment() as string | null;
      if (playerId) this.send(ws, { type: "state", you: playerId, now, room: toPublic(room, playerId) });
    }
  }

  /** Called by POST /api/rooms. Returns false if the code is already taken. */
  async create(code: string): Promise<boolean> {
    if (await this.load()) return false;
    await this.save(createRoom(code, Date.now()));
    return true;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const token = url.searchParams.get("token") ?? "";
    if (!/^[\w-]{16,64}$/.test(token)) return new Response("Missing player token", { status: 400 });

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);

    // Browsers can't read HTTP errors on a failed WebSocket, so problems are
    // reported as a message on an accepted socket which is then closed.
    const reject = (code: keyof typeof JOIN_ERROR_MESSAGES) => {
      this.send(server, { type: "error", code, message: JOIN_ERROR_MESSAGES[code] });
      server.close(4000, code);
      return new Response(null, { status: 101, webSocket: client });
    };

    const room = await this.load();
    if (!room) return reject("not_found");
    const result = join(room, token, url.searchParams.get("name"));
    if (!result.ok) return reject(result.error);

    // One live socket per player: a new tab or reconnect replaces the old one.
    for (const other of this.ctx.getWebSockets()) {
      if (other !== server && other.deserializeAttachment() === result.player.id) {
        other.serializeAttachment(null);
        other.close(4001, "replaced");
      }
    }
    server.serializeAttachment(result.player.id);
    await this.save(room);
    this.broadcast(room);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    const playerId = ws.deserializeAttachment() as string | null;
    const room = await this.load();
    if (!playerId || !room || typeof raw !== "string" || raw.length > 200) return;
    let message: ClientMessage;
    try { message = JSON.parse(raw) as ClientMessage; } catch { return; }

    const now = Date.now();
    let changed = false;
    if (message?.type === "start") changed = start(room, playerId, now);
    else if (message?.type === "lock") changed = lock(room, playerId, Number(message.round), Number(message.value), now);
    else if (message?.type === "set") {
      // A bar being dragged sends several of these a second. The latest position
      // is kept in memory only: nothing is written and nobody is told, and it is
      // saved along with the next real change (a lock-in or the round ending).
      setGuess(room, playerId, Number(message.round), Number(message.value), now);
      return;
    }
    else if (message?.type === "ready") changed = ready(room, playerId);
    else if (message?.type === "unready") changed = unready(room, playerId);
    else if (message?.type === "rematch") changed = rematch(room, playerId, now);
    if (!changed) return;
    await this.save(room);
    this.broadcast(room);
  }

  async webSocketClose(ws: WebSocket) { await this.dropped(ws); }
  async webSocketError(ws: WebSocket) { await this.dropped(ws); }

  private async dropped(ws: WebSocket) {
    const playerId = ws.deserializeAttachment() as string | null;
    const room = await this.load();
    if (!playerId || !room) return;
    ws.serializeAttachment(null);
    if (!disconnect(room, playerId, Date.now())) return;
    await this.save(room);
    this.broadcast(room);
  }

  async alarm() {
    const room = await this.load();
    if (!room) return;
    const outcome = tick(room, Date.now());
    if (outcome === "expired" && this.ctx.getWebSockets().length === 0) {
      this.room = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    // Someone is still attached: never leave a wake-up time in the past.
    if (outcome === "expired") room.expiresAt = Date.now() + ROOM_IDLE_MS;
    await this.save(room);
    if (outcome === "changed") this.broadcast(room);
  }
}
