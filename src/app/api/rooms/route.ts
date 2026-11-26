import { env } from "cloudflare:workers";
import { generateRoomCode } from "@/lib/room";
import { json, rateLimited } from "@/server/http";
import type { Room } from "@/server/room-do";

/** Creates a multiplayer room and returns its code. */
export async function POST(request: Request) {
  const limited = await rateLimited(request, "create");
  if (limited) return limited;
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateRoomCode();
      const rooms = env.ROOM as unknown as DurableObjectNamespace<Room>;
      const room = rooms.get(rooms.idFromName(code));
      if (await room.create(code)) return json({ code }, 201);
    }
    return json({ error: "Could not create a room. Please try again." }, 503);
  } catch (error) {
    console.error("Room creation failed", error);
    return json({ error: "Could not create a room. Please try again." }, 500);
  }
}
