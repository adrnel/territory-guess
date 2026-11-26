import { describe, expect, it } from "vitest";
import {
  avatarColor, cleanName, COLOR_PAIRS, countTurf, fieldOf, gapFor, generateBoard, generateDuelRound, generateSoloRound,
  GRID_H, GRID_W, MAX_NAME_LENGTH, seededRng, shareOf, START_LIVES, UNIT, winnerOf,
} from "../src/lib/game";

describe("territory", () => {
  it("gives the ground around a blob to its colour", () => {
    // One colour-0 blob in the middle, reaching a fifth of the board's width.
    const board = { splats: [5000, 5000, 2000, 0], cut: 0.25 };
    const [a, b] = countTurf(board);
    expect(a + b).toBe(GRID_W * GRID_H);
    // Inside the cut the pull is (1 - d²/r²)² > 0.25, i.e. d < r/√2: a disc of radius 64/√2 cells.
    expect(a / (Math.PI * 32 * 64)).toBeGreaterThan(0.97);
    expect(a / (Math.PI * 32 * 64)).toBeLessThan(1.03);
    expect(shareOf({ splats: [], cut: 0.25 })).toBe(0);
    expect(shareOf({ splats: [], cut: -0.25 })).toBe(100);
  });

  it("pulls the other way for colour 1", () => {
    const zero = fieldOf([5000, 5000, 2000, 0]);
    const one = fieldOf([5000, 5000, 2000, 1]);
    const middle = (GRID_H / 2) * GRID_W + GRID_W / 2;
    expect(zero[middle]).toBeCloseTo(1, 2);
    expect(one[middle]).toBeCloseTo(-1, 2);
    expect(zero[0]).toBe(0);
  });

  it("merges neighbouring blobs into one territory", () => {
    const apart = countTurf({ splats: [2500, 5000, 1500, 0, 7500, 5000, 1500, 0], cut: 0.25 })[0];
    const touching = countTurf({ splats: [4400, 5000, 1500, 0, 5600, 5000, 1500, 0], cut: 0.25 })[0];
    const one = countTurf({ splats: [5000, 5000, 1500, 0], cut: 0.25 })[0];
    expect(apart).toBe(one * 2);
    expect(touching).toBeGreaterThan(one);
    expect(touching).toBeLessThan(one * 2);
  });

  it("hits the split it is asked for", () => {
    const rng = seededRng(9);
    for (const target of [0.1, 0.25, 0.4, 0.495, 0.5, 0.505, 0.6, 0.85]) {
      for (let i = 0; i < 8; i++) {
        expect(Math.abs(shareOf(generateBoard(target, rng)) - target * 100)).toBeLessThanOrEqual(0.1);
      }
    }
  });

  it("sends whole-number blobs of a single colour, the one with less of the board", () => {
    const rng = seededRng(1);
    for (const target of [0.3, 0.7]) {
      const { splats, cut } = generateBoard(target, rng);
      expect(splats.length % 4).toBe(0);
      expect(splats.length / 4).toBeGreaterThan(20);
      expect(splats.every(Number.isInteger)).toBe(true);
      for (let i = 0; i < splats.length; i += 4) {
        expect(splats[i + 2]).toBeGreaterThan(0);
        expect(splats[i + 2]).toBeLessThan(UNIT / 4);
        expect(splats[i + 3]).toBe(target < 0.5 ? 0 : 1);
      }
      // Well clear of zero, so the edge never runs through ground no blob reaches.
      expect(Math.abs(cut)).toBeGreaterThan(0.1);
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
