import { generateSoloRound } from "@/lib/game";
import { getDb } from "@/server/db";
import { json, rateLimited } from "@/server/http";

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const limited = await rateLimited(request, "create");
  if (limited) return limited;
  try {
    const db = await getDb();
    const round = generateSoloRound(1);
    const gameId = crypto.randomUUID();
    const now = Date.now();
    await db.prepare(
      `INSERT INTO game_sessions (id, score, level, share, expires_at) VALUES (?, 0, 1, ?, ?)`,
    ).bind(gameId, round.share, now + SESSION_TTL_MS).run();

    // Occasionally clear out abandoned sessions so the table stays small.
    if (Math.random() < 0.05) {
      await db.prepare(`DELETE FROM game_sessions WHERE expires_at < ?`).bind(now).run();
    }

    // The split (share) stays on the server until the player has guessed.
    return json({ gameId, score: 0, round: { level: 1, pair: round.pair, splats: round.splats } });
  } catch (error) {
    console.error("Could not start game", error);
    return json({ error: "Could not start a game. Please try again." }, 500);
  }
}
