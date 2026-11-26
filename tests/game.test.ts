import { describe, expect, it } from "vitest";
import {
  avatarColor, cleanName, COLOR_PAIRS, countTurf, gapFor, generateDuelRound, generateSoloRound, generateSplats,
  MAX_NAME_LENGTH, minVisibleGap, seededRng, shareOf, UNIT, winnerOf,
} from "../src/lib/game";

describe("turf", () => {
  it("counts a single colour as all of the turf", () => {
    expect(shareOf([5000, 5000, 2000, 0])).toBe(100);
    expect(shareOf([5000, 5000, 2000, 1])).toBe(0);
    expect(shareOf([])).toBe(50);
  });

  it("lets later splats paint over earlier ones", () => {
    const under = [5000, 5000, 2000, 0];
    expect(shareOf([...under, 5000, 5000, 2000, 1])).toBe(0);
    expect(shareOf([...under, 5000, 5000, 1000, 1])).toBeGreaterThan(60);
  });

  it("measures two equal, separate circles as an even split", () => {
    const [a, b] = countTurf([2500, 5000, 1500, 0, 7500, 5000, 1500, 1]);
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });

  it("measures area in proportion to the radius squared", () => {
    const [a, b] = countTurf([2500, 5000, 2000, 0, 7500, 5000, 1000, 1]);
    expect(a / b).toBeGreaterThan(3.8);
    expect(a / b).toBeLessThan(4.2);
  });

  it("throws whole-number splats that stay on the board and cover most of it", () => {
    const splats = generateSplats(0.5, seededRng(1));
    expect(splats.length % 4).toBe(0);
    expect(splats.length / 4).toBeGreaterThan(100);
    expect(splats.length / 4).toBeLessThanOrEqual(800);
    for (let i = 0; i < splats.length; i += 4) {
      expect(Number.isInteger(splats[i]) && splats[i] >= 0 && splats[i] <= UNIT).toBe(true);
      expect(Number.isInteger(splats[i + 1]) && splats[i + 1] >= 0 && splats[i + 1] <= UNIT).toBe(true);
      expect(splats[i + 2]).toBeGreaterThan(0);
      expect([0, 1]).toContain(splats[i + 3]);
    }
    const [a, b] = countTurf(splats);
    expect((a + b) / (320 * 180)).toBeGreaterThan(0.6);
  });

  it("is repeatable for a given seed", () => {
    expect(generateSplats(0.4, seededRng(7))).toEqual(generateSplats(0.4, seededRng(7)));
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

  it("always has a clear answer, at every level", () => {
    const rng = seededRng(42);
    for (const level of [1, 5, 10, 16, 22, 30, 45, 80]) {
      for (let i = 0; i < 15; i++) {
        const round = generateSoloRound(level, rng);
        expect(round.share).toBe(shareOf(round.splats));
        expect(Math.abs(round.share - 50) * 2).toBeGreaterThanOrEqual(minVisibleGap(level));
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

  it("names the colour with more turf", () => {
    expect(winnerOf(50.1)).toBe(0);
    expect(winnerOf(49.9)).toBe(1);
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
