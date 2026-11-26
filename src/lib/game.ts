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
/** Circle coordinates are whole numbers out of this, to keep the payload small. */
export const UNIT = 10000;
/** The grid the territory is measured on (and that the browser smooths when drawing). */
export const GRID_W = 320;
export const GRID_H = 180;

/**
 * Circles in painting order, flattened: x, y, radius, colour (0 or 1),
 * repeated. x and the radius are in UNITs of the board's width, y in UNITs of
 * its height. Later circles paint over earlier ones.
 */
export type Splats = number[];
/**
 * A board: the circles, plus the cut. Once painted, the picture is blurred, so
 * every point has a value between 0 (deep in colour 1) and 1 (deep in colour
 * 0); it belongs to colour 0 where that value is above the cut. Blurring and
 * cutting again is what rounds off every corner, on both colours alike.
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

/** How far (in grid cells) each of the three blur passes reaches. Sets how rounded the corners are. */
const BLUR = 4;

/** Paints the circles onto the grid: 1 where colour 0 is on top, 0 where colour 1 is. */
function paint(splats: Splats): Float32Array {
  const grid = new Float32Array(GRID_W * GRID_H);
  for (let i = 0; i + 3 < splats.length; i += 4) {
    const cx = (splats[i] / UNIT) * GRID_W - 0.5;
    const cy = (splats[i + 1] / UNIT) * GRID_H - 0.5;
    const r = (splats[i + 2] / UNIT) * GRID_W;
    const value = splats[i + 3] === 0 ? 1 : 0;
    const top = Math.max(0, Math.ceil(cy - r));
    const bottom = Math.min(GRID_H - 1, Math.floor(cy + r));
    for (let row = top; row <= bottom; row++) {
      const half = Math.sqrt(r * r - (row - cy) * (row - cy));
      const left = Math.max(0, Math.ceil(cx - half));
      const right = Math.min(GRID_W - 1, Math.floor(cx + half));
      if (left <= right) grid.fill(value, row * GRID_W + left, row * GRID_W + right + 1);
    }
  }
  return grid;
}

/** Averages each cell with its neighbours along rows (step 1) or columns (step GRID_W). Edges repeat. */
function blurLines(from: Float32Array, to: Float32Array, lines: number, length: number, lineStep: number, step: number) {
  const scale = 1 / (2 * BLUR + 1);
  for (let line = 0; line < lines; line++) {
    const start = line * lineStep;
    const last = start + (length - 1) * step;
    let sum = from[start] * (BLUR + 1);
    for (let k = 1; k <= BLUR; k++) sum += from[start + Math.min(k, length - 1) * step];
    for (let n = 0; n < length; n++) {
      to[start + n * step] = sum * scale;
      const add = start + (n + BLUR + 1) * step;
      const drop = start + (n - BLUR) * step;
      sum += from[add > last ? last : add] - from[drop < start ? start : drop];
    }
  }
}

/** The painted board, blurred: for every grid cell, row by row, how deep it is in colour 0 (0-1). */
export function fieldOf(splats: Splats): Float32Array {
  return blur(paint(splats));
}

function blur(field: Float32Array): Float32Array {
  const spare = new Float32Array(field.length);
  for (let pass = 0; pass < 3; pass++) {
    blurLines(field, spare, GRID_H, GRID_W, GRID_W, 1);
    blurLines(spare, field, GRID_W, GRID_H, 1, GRID_W);
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

/** The stretch of pattern a board is cut from, in board-widths, and how coarsely it is searched. */
const AREA_W = 4;
const AREA_H = 2.5;
const COARSE = 48; // cells per board-width
/** Circles per square board-width: a few very large ones as a base, then the ones that give the look. */
const BASE_DENSITY = 75;
const DENSITY = 58;

/**
 * Makes a stretch of balanced pattern several boards across, then looks for
 * the board-sized view of it whose split is closest to `target0` (colour 0's
 * share, 0-1), and nudges the cut to make the split exact.
 *
 * The pattern is circles painted over each other, each one a coin-toss between
 * the two colours. Neither colour is the background: each bulges where it was
 * painted last and has a round bay where it was painted over. An even pattern
 * still has patches that hold more of one colour than the other, and those
 * are what an uneven board is cut from.
 */
export function generateBoard(target0: number, rng: Rng = Math.random): Board {
  // Circles as [x, y, radius, colour] in board-widths, in painting order.
  const circles: number[] = [];
  const scatter = (count: number, size: () => number) => {
    for (let i = 0; i < count; i++) {
      const r = size();
      circles.push((AREA_W + 2 * r) * rng() - r, (AREA_H + 2 * r) * rng() - r, r, rng() < 0.5 ? 0 : 1);
    }
  };
  // Large circles first, so every part of the area has been painted by something.
  scatter(AREA_W * AREA_H * BASE_DENSITY, () => 0.09 + rng() * 0.05);
  scatter(AREA_W * AREA_H * DENSITY, () => (rng() < 0.08 ? 0.024 + rng() * 0.01 : 0.046 + rng() * 0.036));

  // Paint the whole area coarsely and count colour 0's cells in every possible view at once.
  const columns = AREA_W * COARSE;
  const rows = AREA_H * COARSE;
  // Wherever no circle happens to land shows the undercoat, a coin-toss too.
  const undercoat = rng() < 0.5 ? 0 : 1;
  const coarse = new Uint8Array(columns * rows).fill(undercoat === 0 ? 1 : 0);
  for (let i = 0; i < circles.length; i += 4) {
    const cx = circles[i] * COARSE - 0.5;
    const cy = circles[i + 1] * COARSE - 0.5;
    const r = circles[i + 2] * COARSE;
    const value = circles[i + 3] === 0 ? 1 : 0;
    const top = Math.max(0, Math.ceil(cy - r));
    const bottom = Math.min(rows - 1, Math.floor(cy + r));
    for (let row = top; row <= bottom; row++) {
      const half = Math.sqrt(r * r - (row - cy) * (row - cy));
      const left = Math.max(0, Math.ceil(cx - half));
      const right = Math.min(columns - 1, Math.floor(cx + half));
      if (left <= right) coarse.fill(value, row * columns + left, row * columns + right + 1);
    }
  }
  const totals = new Int32Array((columns + 1) * (rows + 1));
  for (let row = 0; row < rows; row++) {
    let line = 0;
    for (let col = 0; col < columns; col++) {
      line += coarse[row * columns + col];
      totals[(row + 1) * (columns + 1) + col + 1] = totals[row * (columns + 1) + col + 1] + line;
    }
  }
  const viewW = COARSE;
  const viewH = (COARSE * GRID_H) / GRID_W;
  const want = target0 * viewW * viewH;
  const spanCols = columns - viewW + 1;
  const spanRows = rows - viewH + 1;
  // Start somewhere random so that, among equally good views, the choice isn't always the top-left one.
  const startCol = Math.floor(rng() * spanCols);
  const startRow = Math.floor(rng() * spanRows);
  let best = Infinity;
  let bestCol = 0;
  let bestRow = 0;
  for (let r = 0; r < spanRows && best > 0; r++) {
    const row = (startRow + r) % spanRows;
    for (let c = 0; c < spanCols; c++) {
      const col = (startCol + c) % spanCols;
      const inside = totals[(row + viewH) * (columns + 1) + col + viewW] - totals[row * (columns + 1) + col + viewW]
        - totals[(row + viewH) * (columns + 1) + col] + totals[row * (columns + 1) + col];
      const miss = Math.abs(inside - want);
      if (miss < best) { best = miss; bestCol = col; bestRow = row; }
    }
  }

  // Keep the circles that reach into the chosen view, measured from its corner.
  const x0 = bestCol / COARSE;
  const y0 = bestRow / COARSE;
  // The undercoat goes first: a circle big enough to cover the whole view.
  const splats: Splats = [UNIT / 2, UNIT / 2, UNIT * 2, undercoat];
  for (let i = 0; i < circles.length; i += 4) {
    const x = circles[i] - x0;
    const y = circles[i + 1] - y0;
    const r = circles[i + 2];
    if (x + r < 0 || x - r > 1 || y + r < 0 || y - r > 1 / ASPECT) continue;
    splats.push(Math.round(x * UNIT), Math.round(y * ASPECT * UNIT), Math.round(r * UNIT), circles[i + 3]);
  }
  return { splats, cut: cutFor(fieldOf(splats), target0) };
}

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

/**
 * Duel: guess the split. Kept between 30/70 and 70/30: an even pattern has no
 * view more lopsided than that, and forcing one would leave one colour as
 * islands in the other.
 */
export function generateDuelRound(rng: Rng = Math.random): Round {
  const pair = Math.floor(rng() * COLOR_PAIRS.length);
  const board = generateBoard(0.3 + rng() * 0.4, rng);
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
