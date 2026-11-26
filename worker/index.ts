import app from "vinext/server/fetch-handler";
import { isRoomCode } from "../src/lib/room";

export { Room } from "../src/server/room-do";

type Env = { ROOM: DurableObjectNamespace };
type Handler = { fetch(request: Request, env: unknown, ctx: ExecutionContext): Response | Promise<Response> };

const WS_ROUTE = /^\/api\/rooms\/([^/]+)\/ws$/;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const match = WS_ROUTE.exec(url.pathname);
    if (match) {
      // Multiplayer sockets go straight to the room's Durable Object.
      const code = match[1].toUpperCase();
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Expected a WebSocket upgrade", { status: 426 });
      }
      if (!isRoomCode(code)) return new Response("Invalid room code", { status: 400 });
      return env.ROOM.get(env.ROOM.idFromName(code)).fetch(request);
    }
    return (app as unknown as Handler).fetch(request, env, ctx);
  },
};
