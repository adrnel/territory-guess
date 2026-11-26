/** Small typed wrappers around browser storage that never throw. */
function read(storage: () => Storage, key: string): string | null {
  try { return storage().getItem(key); } catch { return null; }
}
function write(storage: () => Storage, key: string, value: string) {
  try { storage().setItem(key, value); } catch { /* storage unavailable */ }
}
const local = () => window.localStorage;
const session = () => window.sessionStorage;

export const getName = () => read(local, "turf.name") ?? "";
export const saveName = (name: string) => write(local, "turf.name", name);

/**
 * Most levels cleared in one run. The original single-page game stored the
 * level reached (one more than levels cleared) under its own key; carry it over.
 */
export const getBest = () => Number(read(local, "turf.best"))
  || Math.max(0, (Number(read(local, "turfGuesserHighScore")) || 0) - 1);
export const saveBest = (score: number) => write(local, "turf.best", String(score));

/** The leaderboard row created by this browser's most recent posted score. */
export const getMyEntryId = () => Number(read(local, "turf.entry")) || 0;
export const saveMyEntryId = (id: number) => write(local, "turf.entry", String(id));

/** Per-tab secret that lets a player rejoin a room after a refresh or dropout. */
export function roomToken(code: string): string {
  const key = `turf.room.${code}`;
  let token = read(session, key);
  if (!token) {
    token = crypto.randomUUID();
    write(session, key, token);
  }
  return token;
}

/** Every finished solo run on this device (best 100 kept), best first. */
export type MyScore = { score: number; ts: number };
const MY_SCORES = "turf.scores";

export function getMyScores(): MyScore[] {
  let list: MyScore[] = [];
  try {
    const parsed: unknown = JSON.parse(read(local, MY_SCORES) ?? "[]");
    if (Array.isArray(parsed)) {
      list = parsed.filter((x): x is MyScore => !!x && Number.isFinite(x.score) && Number.isFinite(x.ts));
    }
  } catch { /* corrupt entry: start again */ }
  // A best score saved before this list existed still counts.
  const best = getBest();
  if (best > 0 && !list.some((x) => x.score >= best)) list.push({ score: best, ts: 0 });
  return list.sort((a, b) => b.score - a.score || a.ts - b.ts).slice(0, 100);
}

export function addMyScore(score: number, ts = Date.now()) {
  write(local, MY_SCORES, JSON.stringify([...getMyScores(), { score, ts }].sort((a, b) => b.score - a.score || a.ts - b.ts).slice(0, 100)));
}
