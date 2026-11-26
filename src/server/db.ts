import { env } from "cloudflare:workers";

/**
 * D1 schema. Applied automatically (and idempotently) the first time each
 * Worker instance touches the database, so there is no separate migration step
 * for local development, tests or deployment.
 */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS game_sessions (
    id TEXT PRIMARY KEY,
    score INTEGER NOT NULL DEFAULT 0 CHECK(score >= 0),
    level INTEGER NOT NULL DEFAULT 1 CHECK(level >= 1),
    share REAL NOT NULL CHECK(share BETWEEN 0 AND 100),
    expires_at INTEGER NOT NULL,
    completed_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON game_sessions (expires_at)`,
  `CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    score INTEGER NOT NULL CHECK(score >= 0),
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores (score DESC, created_at ASC)`,
  `CREATE INDEX IF NOT EXISTS idx_scores_created ON scores (created_at)`,
];

let ready: Promise<unknown> | null = null;

export async function getDb(): Promise<D1Database> {
  const db = env.DB;
  ready ??= db.batch(SCHEMA.map((sql) => db.prepare(sql))).catch((error) => {
    ready = null;
    throw error;
  });
  await ready;
  return db;
}

export type LeaderboardEntry = { id: number; name: string; score: number; ts: number };

/** One page of the best scores posted since `since` (0 for all time), plus how many there are (capped). */
export async function topScores(db: D1Database, since: number, page: number, pageSize: number, cap: number):
  Promise<{ entries: LeaderboardEntry[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const limit = Math.max(0, Math.min(pageSize, cap - offset));
  const [rows, count] = await db.batch([
    db.prepare(
      `SELECT id, name, score, created_at AS ts FROM scores WHERE created_at >= ?
       ORDER BY score DESC, created_at ASC, id ASC LIMIT ? OFFSET ?`,
    ).bind(since, limit, offset),
    db.prepare(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM scores WHERE created_at >= ? LIMIT ?)`).bind(since, cap),
  ]);
  return {
    entries: rows.results as LeaderboardEntry[],
    total: (count.results[0] as { n: number } | undefined)?.n ?? 0,
  };
}

/** An entry plus its 1-based position among scores posted since `since`; null if it isn't in that window. */
export async function rankedEntry(db: D1Database, id: number, since = 0): Promise<(LeaderboardEntry & { rank: number }) | null> {
  return db.prepare(
    `SELECT s.id, s.name, s.score, s.created_at AS ts,
       1 + (SELECT COUNT(*) FROM scores o
            WHERE o.created_at >= ?1 AND (o.score > s.score OR (o.score = s.score AND o.created_at < s.created_at)
               OR (o.score = s.score AND o.created_at = s.created_at AND o.id < s.id))) AS rank
     FROM scores s WHERE s.id = ?2 AND s.created_at >= ?1`,
  ).bind(since, id).first<LeaderboardEntry & { rank: number }>();
}
