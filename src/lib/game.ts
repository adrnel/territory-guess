/**
 * Turf rules shared by the solo game and the duel. No Cloudflare or browser
 * code in here, so everything is unit tested and the smoke test can import it.
 */

/** 3-2-1 before the first round of a duel. */
export const COUNTDOWN_MS = 3000;

/** Two inks per round: [colour 0, colour 1]. */
export const COLOR_PAIRS = [
  ["#4f46e5", "#f59e0b"], // indigo vs amber
  ["#db2777", "#10b981"], // pink vs emerald
  ["#0ea5e9", "#f97316"], // sky vs orange
  ["#8b5cf6", "#eab308"], // violet vs yellow
  ["#d946ef", "#65a30d"], // fuchsia vs lime
] as const;

/** The board is 16:9. */
export const ASPECT = 16 / 9;
/** Splat coordinates are whole numbers out of this, to keep the payload small. */
export const UNIT = 10000;

/**
 * Circles in painting order, flattened: x, y, radius, colour (0 or 1), repeated.
 * x and the radius are in UNITs of the board's width, y in UNITs of its height.
 * Later circles paint over earlier ones.
 */
export type Splats = number[];

export type Rng = () => number;

/** A small seedable generator, for repeatable tests. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAX_SPLATS = 800;
/** Paint 150% of the board so little of the background is left showing. */
const FILL = 1.5;

/**
 * Ported from the original game: throw circles at random until each colour
 * has painted its share of the target area, always painting whichever colour
 * is further behind. `target0` is colour 0's share of the paint (0-1); what
 * ends up visible differs because splats overlap.
 */
export function generateSplats(target0: number, rng: Rng = Math.random): Splats {
  const total = FILL / ASPECT; // in board-widths squared
  const targets = [total * target0, total * (1 - target0)];
  const painted = [0, 0];
  const splats: Splats = [];
  for (let count = 0; count < MAX_SPLATS; count++) {
    const need0 = painted[0] < targets[0];
    const need1 = painted[1] < targets[1];
    if (!need0 && !need1) break;
    const color = need0 && need1
      ? (painted[0] / targets[0] <= painted[1] / targets[1] ? 0 : 1)
      : need0 ? 0 : 1;
    const x = Math.round(rng() * UNIT);
    const y = Math.round(rng() * UNIT);
    const r = Math.round(((rng() * 0.08 + 0.03) / 2) * UNIT);
    splats.push(x, y, r, color);
    painted[color] += Math.PI * (r / UNIT) ** 2;
  }
  return splats;
}

const GRID_W = 320;
const GRID_H = 180;

/** How many grid cells each colour ends up owning once every splat is painted. */
export function countTurf(splats: Splats): [number, number] {
  const grid = new Uint8Array(GRID_W * GRID_H);
  for (let i = 0; i + 3 < splats.length; i += 4) {
    const cx = (splats[i] / UNIT) * GRID_W;
    const cy = (splats[i + 1] / UNIT) * GRID_H;
    const r = (splats[i + 2] / UNIT) * GRID_W;
    const mark = splats[i + 3] === 0 ? 1 : 2;
    const top = Math.max(0, Math.ceil(cy - r - 0.5));
    const bottom = Math.min(GRID_H - 1, Math.floor(cy + r - 0.5));
    for (let row = top; row <= bottom; row++) {
      const dy = row + 0.5 - cy;
      const half = Math.sqrt(r * r - dy * dy);
      if (!(half >= 0)) continue;
      const left = Math.max(0, Math.ceil(cx - half - 0.5));
      const right = Math.min(GRID_W - 1, Math.floor(cx + half - 0.5));
      if (left <= right) grid.fill(mark, row * GRID_W + left, row * GRID_W + right + 1);
    }
  }
  let a = 0;
  let b = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === 1) a++;
    else if (grid[i] === 2) b++;
  }
  return [a, b];
}

/** Colour 0's share of the painted turf, as a percentage with one decimal place. */
export function shareOf(splats: Splats): number {
  const [a, b] = countTurf(splats);
  return a + b === 0 ? 50 : Math.round((a / (a + b)) * 1000) / 10;
}

/** A round as the server knows it. `share` is the answer and stays on the server until the round is over. */
export type Round = { pair: number; splats: Splats; share: number };
/** What a player is shown. */
export type PublicRound = { level: number; pair: number; splats: Splats };

const LEVEL_GAPS = [
  0.20, 0.19, 0.18, 0.17, 0.16, 0.15, 0.14, 0.13, 0.12, 0.11,
  0.10, 0.09, 0.08, 0.07, 0.06, 0.05,
  0.045, 0.04, 0.035, 0.03, 0.0275, 0.025,
];

/** How far apart the two colours are painted at a level (0.2 = 60/40), from the original game. */
export function gapFor(level: number): number {
  if (level <= LEVEL_GAPS.length) return LEVEL_GAPS[Math.max(1, level) - 1];
  if (level <= 29) return 0.02;
  if (level <= 39) return 0.015;
  return 0.01;
}

/** The smallest visible gap, in percentage points, a solo round at this level may have. */
export function minVisibleGap(level: number): number {
  return Math.max(0.4, gapFor(level) * 100 * 0.4);
}

/**
 * Solo: which colour has more? Because overlaps shift the visible result, a
 * board is re-thrown if the two colours came out closer than the level means
 * them to be, so there is never a coin-flip round.
 */
export function generateSoloRound(level: number, rng: Rng = Math.random): Round {
  const pair = Math.floor(rng() * COLOR_PAIRS.length);
  const half = gapFor(level) / 2;
  let best: Round | null = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const splats = generateSplats(rng() < 0.5 ? 0.5 + half : 0.5 - half, rng);
    const share = shareOf(splats);
    const round = { pair, splats, share };
    if (Math.abs(share - 50) * 2 >= minVisibleGap(level)) return round;
    if (!best || Math.abs(share - 50) > Math.abs(best.share - 50)) best = round;
  }
  // Vanishingly unlikely; nudge an exact tie so there is always an answer.
  return best!.share === 50 ? { ...best!, share: 50.1 } : best!;
}

/** The colour (0 or 1) with more turf. */
export const winnerOf = (share: number): 0 | 1 => (share > 50 ? 0 : 1);

/** Duel: guess the split, so the boards range from lopsided to nearly even. */
export function generateDuelRound(rng: Rng = Math.random): Round {
  const pair = Math.floor(rng() * COLOR_PAIRS.length);
  const splats = generateSplats(0.15 + rng() * 0.7, rng);
  return { pair, splats, share: shareOf(splats) };
}

export const MAX_NAME_LENGTH = 20;

/** Trims, collapses whitespace, strips control characters, caps the length. */
export function cleanName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH).trim();
}

/** A stable ink colour for a player name. */
export function avatarColor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return COLOR_PAIRS[hash % COLOR_PAIRS.length][Math.floor(hash / COLOR_PAIRS.length) % 2];
}
