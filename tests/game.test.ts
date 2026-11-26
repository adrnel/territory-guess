import { describe, expect, it } from "vitest";
import {
  avatarColor, cleanName, COLOR_PAIRS, countTurf, fieldOf, gapFor, generateBoard, generateDuelRound, generateSoloRound,
  GRID_H, GRID_W, MAX_NAME_LENGTH, seededRng, shareOf, START_LIVES, UNIT, winnerOf,
} from "../src/lib/game";

const GROUND1 = [5000, 5000, 20000, 1]; // a circle of colour 1 big enough to cover the board
const middle = (GRID_H / 2) * GRID_W + GRID_W / 2;

describe("territory", () => {
  it("measures a painted circle", () => {
    // A colour-0 circle a fifth of the board's width across... in radius: 64 grid cells.
    const board = { splats: [...GROUND1, 5000, 5000, 2000, 0], cut: 0.5 };
    const [a, b] = countTurf(board);
    expect(a + b).toBe(GRID_W * GRID_H);
    expect(a / (Math.PI * 64 * 64)).toBeGreaterThan(0.97);
    expect(a / (Math.PI * 64 * 64)).toBeLessThan(1.03);
    expect(shareOf({ splats: GROUND1, cut: 0.5 })).toBe(0);
    expect(shareOf({ splats: [5000, 5000, 20000, 0], cut: 0.5 })).toBe(100);
  });

  it("lets later circles paint over earlier ones", () => {
    const under = [...GROUND1, 5000, 5000, 2000, 0];
    expect(fieldOf(under)[middle]).toBeCloseTo(1, 5);
    expect(fieldOf([...under, 5000, 5000, 1000, 1])[middle]).toBeCloseTo(0, 5);
    const ring = countTurf({ splats: [...under, 5000, 5000, 1000, 1], cut: 0.5 })[0];
    const disc = countTurf({ splats: under, cut: 0.5 })[0];
    expect(ring / disc).toBeGreaterThan(0.72);
    expect(ring / disc).toBeLessThan(0.78);
  });

  it("is soft at the edges and flat inside, so corners round off evenly for both colours", () => {
    const field = fieldOf([...GROUND1, 5000, 5000, 2000, 0]);
    const edge = middle + 64; // on the circle's rim
    expect(field[edge]).toBeGreaterThan(0.3);
    expect(field[edge]).toBeLessThan(0.7);
    expect(field[middle + 40]).toBeCloseTo(1, 5);
    expect(field[middle + 90]).toBeCloseTo(0, 5);
    // Swapping the two colours gives exactly the mirror-image field.
    const swapped = fieldOf([5000, 5000, 20000, 0, 5000, 5000, 2000, 1]);
    expect(swapped[edge]).toBeCloseTo(1 - field[edge], 5);
  });

  it("hits the split it is asked for", () => {
    const rng = seededRng(9);
    for (const target of [0.1, 0.25, 0.4, 0.495, 0.5, 0.505, 0.6, 0.85]) {
      for (let i = 0; i < 8; i++) {
        expect(Math.abs(shareOf(generateBoard(target, rng)) - target * 100)).toBeLessThanOrEqual(0.1);
      }
    }
  });

  it("paints both colours over each other, starting from a full board", () => {
    const rng = seededRng(1);
    for (const target of [0.3, 0.5, 0.7]) {
      const { splats, cut } = generateBoard(target, rng);
      expect(splats.length % 4).toBe(0);
      expect(splats.every(Number.isInteger)).toBe(true);
      expect(splats[2]).toBeGreaterThanOrEqual(UNIT * 2);
      const colors = [];
      for (let i = 4; i < splats.length; i += 4) {
        expect(splats[i + 2]).toBeGreaterThan(0);
        expect(splats[i + 2]).toBeLessThan(UNIT / 8);
        colors.push(splats[i + 3]);
      }
      // Each colour is painted many times, and neither is always the one on top.
      expect(colors.filter((c) => c === 0).length).toBeGreaterThan(5);
      expect(colors.filter((c) => c === 1).length).toBeGreaterThan(5);
      expect(colors.join("")).toMatch(/01.*10|10.*01/);
      // The cut stays near the middle, where both colours are rounded alike.
      expect(cut).toBeGreaterThan(0.3);
      expect(cut).toBeLessThan(0.7);
    }
  });

  it("is repeatable for a given seed", () => {
    expect(generateBoard(0.4, seededRng(7))).toEqual(generateBoard(0.4, seededRng(7)));
  });
});

describe("solo rounds", () => {
  it("gets harder with the level, as in the original game", () => {
    expect(gapFor(1)).toBe(0.2);
    expect(gapFor(16)).toBe(0.05);
    expect(gapFor(22)).toBe(0.025);
    expect(gapFor(25)).toBe(0.02);
    expect(gapFor(35)).toBe(0.015);
    expect(gapFor(60)).toBe(0.01);
    for (let level = 2; level <= 60; level++) expect(gapFor(level)).toBeLessThanOrEqual(gapFor(level - 1));
  });

  it("puts the two colours exactly the level's gap apart", () => {
    const rng = seededRng(42);
    for (const level of [1, 5, 10, 16, 22, 30, 45, 80]) {
      for (let i = 0; i < 10; i++) {
        const round = generateSoloRound(level, rng);
        expect(round.share).toBe(shareOf(round));
        expect(round.share).not.toBe(50);
        expect(Math.abs(Math.abs(round.share - 50) * 2 - gapFor(level) * 100)).toBeLessThanOrEqual(0.41);
        expect(round.pair).toBeGreaterThanOrEqual(0);
        expect(round.pair).toBeLessThan(COLOR_PAIRS.length);
      }
    }
  });

  it("favours each colour about as often", () => {
    const rng = seededRng(3);
    let first = 0;
    for (let i = 0; i < 200; i++) if (winnerOf(generateSoloRound(8, rng).share) === 0) first++;
    expect(first).toBeGreaterThan(70);
    expect(first).toBeLessThan(130);
  });

  it("names the colour with more territory", () => {
    expect(winnerOf(50.1)).toBe(0);
    expect(winnerOf(49.9)).toBe(1);
  });

  it("starts with three lives", () => {
    expect(START_LIVES).toBe(3);
  });
});

describe("duel rounds", () => {
  it("range from lopsided to nearly even", () => {
    const rng = seededRng(11);
    const shares = Array.from({ length: 120 }, () => generateDuelRound(rng).share);
    expect(Math.min(...shares)).toBeLessThan(30);
    expect(Math.max(...shares)).toBeGreaterThan(70);
    expect(shares.every((s) => s > 3 && s < 97)).toBe(true);
    expect(shares.some((s) => s > 40 && s < 60)).toBe(true);
  });
});

describe("names", () => {
  it("cleans up names", () => {
    expect(cleanName("  Smoke \n  Test ")).toBe("Smoke Test");
    expect(cleanName("x".repeat(50))).toHaveLength(MAX_NAME_LENGTH);
    expect(cleanName(42)).toBe("");
  });

  it("gives a name a stable colour", () => {
    expect(avatarColor("Alex")).toBe(avatarColor("Alex"));
    expect(COLOR_PAIRS.flat()).toContain(avatarColor("Jamie"));
  });
});
