import { generateSoloRound, winnerOf } from "@/lib/game";
import { getDb } from "@/server/db";
import { isSessionId, json, rateLimited, readJson } from "@/server/http";

type Session = { level: number; share: number; expires_at: number; completed_at: number | null };

/** `{ gameId, level, choice }` where choice is the colour (0 or 1) the player thinks has more turf. */
export async function POST(request: Request) {
  const limited = await rateLimited(request, "api");
  if (limited) return limited;

  const body = await readJson(request);
  const gameId = body?.gameId;
  const choice = body?.choice;
  const level = body?.level;
  if (!isSessionId(gameId) || (choice !== 0 && choice !== 1)
    || typeof level !== "number" || !Number.isInteger(level) || level < 1) {
    return json({ error: "Invalid answer" }, 400);
  }

  try {
    const db = await getDb();
    const game = await db.prepare(
      `SELECT level, share, expires_at, completed_at FROM game_sessions WHERE id = ?`,
    ).bind(gameId).first<Session>();
    if (!game) return json({ error: "Game not found" }, 404);
    const now = Date.now();
    if (game.expires_at < now) return json({ error: "This game has expired. Start a new one." }, 410);
    if (game.completed_at !== null) return json({ error: "This game has already finished" }, 409);
    if (game.level !== level) return json({ error: "Level already answered" }, 409);

    // Judged against the server's copy of the split, never anything from the request.
    const share = game.share;
    const correct = choice === winnerOf(share);

    // The `level = ?` guard makes each update atomic: if two answers for the
    // same level race, only one UPDATE matches and the other gets a 409.
    if (!correct) {
      const saved = await db.prepare(
        `UPDATE game_sessions SET completed_at = ?
         WHERE id = ? AND level = ? AND completed_at IS NULL
         RETURNING score`,
      ).bind(now, gameId, level).first<{ score: number }>();
      if (!saved) return json({ error: "Level already answered" }, 409);
      return json({ correct, share, score: saved.score, finished: true });
    }

    const next = generateSoloRound(level + 1);
    const saved = await db.prepare(
      `UPDATE game_sessions SET score = score + 1, level = ?, share = ?
       WHERE id = ? AND level = ? AND completed_at IS NULL
       RETURNING score`,
    ).bind(level + 1, next.share, gameId, level).first<{ score: number }>();
    if (!saved) return json({ error: "Level already answered" }, 409);

    return json({
      correct, share, score: saved.score, finished: false,
      nextRound: { level: level + 1, pair: next.pair, splats: next.splats },
    });
  } catch (error) {
    console.error("Could not save answer", error);
    return json({ error: "Could not save your answer. Please try again." }, 500);
  }
}
