/**
 * Territory rules shared by the solo game and the duel. No Cloudflare or browser
 * code in here, so everything is unit tested and the smoke test can import it.
 */

/** 3-2-1 before the first round of a duel. */
export const COUNTDOWN_MS = 3000;

/** Two colours per round: [colour 0, colour 1]. */
export const COLOR_PAIRS = [
  ["#1f4d43", "#f26a45"], // forest vs coral
  ["#5b2bd1", "#f7b500"], // violet vs amber
  ["#1d3f72", "#f0a03c"], // navy vs apricot
  ["#0e7c86", "#f25f7a"], // teal vs rose
  ["#7a2e4d", "#e9b949"], // plum vs gold
] as const;

/** The board is 16:9. */
export const ASPECT = 16 / 9;
/** Blob coordinates are whole numbers out of this, to keep the payload small. */
export const UNIT = 10000;
/** The grid the territory is measured on (and that the browser smooths when drawing). */
export const GRID_W = 320;
export const GRID_H = 180;

/**
 * Soft blobs, flattened: x, y, reach, colour (0 or 1), repeated. x and the
 * reach are in UNITs of the board's width, y in UNITs of its height. Each blob
 * pulls the ground around it towards its colour, fading to nothing at its reach.
 */
export type Splats = number[];
/**
 * A board: the blobs, plus the cut. Every point is pulled one way by colour 0's
 * blobs and the other by colour 1's; it belongs to colour 0 where the net pull
 * is above the cut. Blobs of one colour merge smoothly, and the two colours
 * cover the whole board between them.
 */
export type Board = { splats: Splats; cut: number };

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

/**
 * A lone blob shows as a circle this fraction of its reach across, when the
 * cut is at IDEAL_CUT. The rest of its reach is the soft fringe that lets two
 * neighbouring circles join with a rounded neck instead of a sharp corner.
 */
const VISIBLE = 0.644;
const IDEAL_CUT = 0.2;
/** A cut outside this range would make the circles visibly swell or shrink into lumps. */
const CUT_RANGE = [0.11, 0.31];

/**
 * All of a board's blobs are one colour: circles of it on a ground of the
 * other. They are always the colour with less of the board.
 */
function scatter(color: 0 | 1, count: number, rng: Rng): Splats {
  const splats: Splats = [];
  for (let i = 0; i < count; i++) {
    // Mostly big circles, with the odd small one. Sizes are the visible radius, in board-widths.
    const radius = rng() < 0.25 ? 0.01 + rng() * 0.012 : 0.032 + rng() * 0.038;
    // Centres spill a little past the edges so the border looks like the middle.
    splats.push(
      Math.round((rng() * 1.08 - 0.04) * UNIT),
      Math.round((rng() * 1.08 - 0.04) * UNIT),
      Math.round((radius / VISIBLE) * UNIT),
      color,
    );
  }
  return splats;
}

/** The net pull towards colour 0 at the centre of every grid cell, row by row. */
export function fieldOf(splats: Splats): Float32Array {
  const field = new Float32Array(GRID_W * GRID_H);
  for (let i = 0; i + 3 < splats.length; i += 4) {
    const cx = (splats[i] / UNIT) * GRID_W - 0.5;
    const cy = (splats[i + 1] / UNIT) * GRID_H - 0.5;
    const reach = (splats[i + 2] / UNIT) * GRID_W;
    if (!(reach > 0)) continue;
    const sign = splats[i + 3] === 0 ? 1 : -1;
    const inverse = 1 / (reach * reach);
    const top = Math.max(0, Math.ceil(cy - reach));
    const bottom = Math.min(GRID_H - 1, Math.floor(cy + reach));
    const left = Math.max(0, Math.ceil(cx - reach));
    const right = Math.min(GRID_W - 1, Math.floor(cx + reach));
    for (let row = top; row <= bottom; row++) {
      const dy2 = (row - cy) * (row - cy);
      for (let col = left; col <= right; col++) {
        const q = 1 - ((col - cx) * (col - cx) + dy2) * inverse;
        if (q > 0) field[row * GRID_W + col] += sign * q * q * q;
      }
    }
  }
  return field;
}

/** How many grid cells each colour owns. */
export function countTurf(board: Board): [number, number] {
  const field = fieldOf(board.splats);
  let a = 0;
  for (let i = 0; i < field.length; i++) if (field[i] > board.cut) a++;
  return [a, field.length - a];
}

/** Colour 0's share of the board, as a percentage with one decimal place. */
export function shareOf(board: Board): number {
  const [a, b] = countTurf(board);
  return Math.round((a / (a + b)) * 1000) / 10;
}

/**
 * Scatters blobs, then sets the cut so that colour 0 ends up with `target0`
 * (0-1) of the board. The split is chosen, not left to chance.
 */
export function generateBoard(target0: number, rng: Rng = Math.random): Board {
  const islands: 0 | 1 = target0 < 0.5 || (target0 === 0.5 && rng() < 0.5) ? 0 : 1;
  const minority = Math.min(target0, 1 - target0);
  // Scatter more circles than needed, then use just enough of them that the
  // cut giving the wanted share is close to the ideal one. More circles in
  // play means a higher cut, so the right number can be searched for.
  const pool = scatter(islands, MAX_BLOBS, rng);
  let low = 4;
  let high = MAX_BLOBS;
  let count = Math.min(high, Math.max(low, Math.round(-Math.log(1 - minority) * 72)));
  let best: Board | null = null;
  for (let attempt = 0; attempt < 7; attempt++) {
    const splats = pool.slice(0, count * 4);
    const cut = cutFor(fieldOf(splats), target0);
    const size = Math.abs(cut);
    if (!best || Math.abs(size - IDEAL_CUT) < Math.abs(Math.abs(best.cut) - IDEAL_CUT)) best = { splats, cut };
    if (size >= CUT_RANGE[0] && size <= CUT_RANGE[1]) break;
    if (size < IDEAL_CUT) low = count + 1; else high = count - 1;
    if (low > high) break;
    count = attempt === 0
      ? Math.min(high, Math.max(low, Math.round(count * (size < IDEAL_CUT ? 1.35 : 0.75))))
      : Math.round((low + high) / 2);
  }
  return best!;
}

/** The most circles a board can use. */
const MAX_BLOBS = 220;

/** The value that `above` (0-1) of the field lies above. */
function cutFor(field: Float32Array, above: number): number {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < field.length; i++) {
    if (field[i] < min) min = field[i];
    if (field[i] > max) max = field[i];
  }
  // Find the right slice of values with a histogram, then sort only that slice.
  const BINS = 1024;
  const scale = (BINS - 1) / (max - min || 1);
  const counts = new Uint32Array(BINS);
  for (let i = 0; i < field.length; i++) counts[Math.floor((field[i] - min) * scale)]++;
  const below = Math.min(field.length - 1, Math.max(1, Math.round(field.length * (1 - above))));
  let bin = 0;
  let before = 0;
  while (before + counts[bin] <= below) before += counts[bin++];
  const slice: number[] = [];
  let previous = -Infinity;
  for (let i = 0; i < field.length; i++) {
    const at = Math.floor((field[i] - min) * scale);
    if (at === bin) slice.push(field[i]);
    else if (at < bin && field[i] > previous) previous = field[i];
  }
  slice.sort((a, b) => a - b);
  const index = below - before;
  // Halfway between two neighbouring values, so no cell sits exactly on the cut.
  return ((index > 0 ? slice[index - 1] : previous) + slice[index]) / 2;
}

/** A round as the server knows it. `share` is the answer and stays on the server until the round is over. */
export type Round = Board & { pair: number; share: number };

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

/** Lives at the start of a solo run. A wrong pick costs one. */
export const START_LIVES = 3;

/** What a solo player is shown. `turn` counts boards dealt; `level` only rises on a correct pick. */
export type PublicRound = Board & { turn: number; level: number; pair: number };

/** Solo: which colour has more? The gap between them is exactly the level's. */
export function generateSoloRound(level: number, rng: Rng = Math.random): Round {
  const pair = Math.floor(rng() * COLOR_PAIRS.length);
  const half = gapFor(level) / 2;
  const target = rng() < 0.5 ? 0.5 + half : 0.5 - half;
  for (let attempt = 0; ; attempt++) {
    const board = generateBoard(target, rng);
    const share = shareOf(board);
    // Only a board with large flat patches can miss its target; throw again.
    if (Math.abs(share - target * 100) <= 0.2 || attempt >= 5) return { pair, ...board, share: share === 50 ? 50.1 : share };
  }
}

/** The colour (0 or 1) with more territory. */
export const winnerOf = (share: number): 0 | 1 => (share > 50 ? 0 : 1);

/** Duel: guess the split, so the boards range from lopsided to nearly even. */
export function generateDuelRound(rng: Rng = Math.random): Round {
  const pair = Math.floor(rng() * COLOR_PAIRS.length);
  const board = generateBoard(0.15 + rng() * 0.7, rng);
  return { pair, ...board, share: shareOf(board) };
}

export const MAX_NAME_LENGTH = 20;

/** Trims, collapses whitespace, strips control characters, caps the length. */
export function cleanName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH).trim();
}

/** A stable colour for a player name. */
export function avatarColor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return COLOR_PAIRS[hash % COLOR_PAIRS.length][Math.floor(hash / COLOR_PAIRS.length) % 2];
}
