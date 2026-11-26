import { generateSoloRound, winnerOf } from "@/lib/game";
import { getDb } from "@/server/db";
import { isSessionId, json, rateLimited, readJson } from "@/server/http";

type Run = { level: number; turn: number; lives: number; share: number; expires_at: number; completed_at: number | null };

/**
 * `{ gameId, turn, choice }` where choice is the colour (0 or 1) the player
 * thinks has more territory. A correct pick clears the level; a wrong one costs
 * a life and deals a fresh board at the same level. The run ends with the last life.
 */
export async function POST(request: Request) {
  const limited = await rateLimited(request, "api");
  if (limited) return limited;

  const body = await readJson(request);
  const gameId = body?.gameId;
  const choice = body?.choice;
  const turn = body?.turn;
  if (!isSessionId(gameId) || (choice !== 0 && choice !== 1)
    || typeof turn !== "number" || !Number.isInteger(turn) || turn < 1) {
    return json({ error: "Invalid answer" }, 400);
  }

  try {
    const db = await getDb();
    const run = await db.prepare(
      `SELECT level, turn, lives, share, expires_at, completed_at FROM runs WHERE id = ?`,
    ).bind(gameId).first<Run>();
    if (!run) return json({ error: "Game not found" }, 404);
    const now = Date.now();
    if (run.expires_at < now) return json({ error: "This game has expired. Start a new one." }, 410);
    if (run.completed_at !== null) return json({ error: "This game has already finished" }, 409);
    if (run.turn !== turn) return json({ error: "Board already answered" }, 409);

    // Judged against the server's copy of the split, never anything from the request.
    const share = run.share;
    const correct = choice === winnerOf(share);
    const lives = run.lives - (correct ? 0 : 1);

    // The `turn = ?` guard makes each update atomic: if two answers for the
    // same board race, only one UPDATE matches and the other gets a 409.
    if (lives <= 0) {
      const saved = await db.prepare(
        `UPDATE runs SET lives = 0, completed_at = ?
         WHERE id = ? AND turn = ? AND completed_at IS NULL
         RETURNING score`,
      ).bind(now, gameId, turn).first<{ score: number }>();
      if (!saved) return json({ error: "Board already answered" }, 409);
      return json({ correct, share, score: saved.score, lives: 0, finished: true });
    }

    const level = run.level + (correct ? 1 : 0);
    const next = generateSoloRound(level);
    const saved = await db.prepare(
      `UPDATE runs SET score = score + ?, level = ?, turn = turn + 1, lives = ?, share = ?
       WHERE id = ? AND turn = ? AND completed_at IS NULL
       RETURNING score`,
    ).bind(correct ? 1 : 0, level, lives, next.share, gameId, turn).first<{ score: number }>();
    if (!saved) return json({ error: "Board already answered" }, 409);

    return json({
      correct, share, score: saved.score, lives, finished: false,
      nextRound: { turn: turn + 1, level, pair: next.pair, splats: next.splats, cut: next.cut },
    });
  } catch (error) {
    console.error("Could not save answer", error);
    return json({ error: "Could not save your answer. Please try again." }, 500);
  }
}
