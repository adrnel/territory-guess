import { cleanName } from "@/lib/game";
import { periodStart } from "@/lib/periods";
import { getDb, rankedEntry } from "@/server/db";
import { isSessionId, json, rateLimited, readJson } from "@/server/http";

export async function POST(request: Request) {
  const limited = await rateLimited(request, "create");
  if (limited) return limited;

  const body = await readJson(request);
  const gameId = body?.gameId;
  if (!isSessionId(gameId) || typeof body?.name !== "string") {
    return json({ error: "Missing game ID or name" }, 400);
  }
  const name = cleanName(body.name);
  if (!name) return json({ error: "Enter your name" }, 400);

  try {
    const db = await getDb();
    const now = Date.now();
    // The score is copied from the finished server-side session, never from the
    // request. UNIQUE(game_id) means each game can only be posted once.
    const inserted = await db.prepare(
      `INSERT INTO scores (game_id, name, score, created_at)
       SELECT id, ?, score, ? FROM game_sessions
       WHERE id = ? AND completed_at IS NOT NULL AND score > 0 AND expires_at > ?
       ON CONFLICT(game_id) DO NOTHING
       RETURNING id`,
    ).bind(name, now, gameId, now).first<{ id: number }>();
    if (!inserted) return json({ error: "That game is unfinished, scored nothing, expired or is already on the leaderboard" }, 409);
    const [entry, today] = await Promise.all([
      rankedEntry(db, inserted.id),
      rankedEntry(db, inserted.id, periodStart("day", now)),
    ]);
    return json({ ok: true, entry, rankToday: today?.rank ?? null }, 201);
  } catch (error) {
    console.error("Score submission failed", error);
    return json({ error: "Could not save your score. Please try again." }, 500);
  }
}
