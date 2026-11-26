import { describe, expect, it } from "vitest";
import { COUNTDOWN_MS, seededRng } from "../src/lib/game";
import {
  createRoom, DEFAULT_GUESS, disconnect, generateRoomCode, GUESS_MS, isRoomCode, join, judge, lock, MAX_PLAYERS,
  MAX_IDLE_ROUNDS, nextWake, PAINT_MS, ready, rematch, REVEAL_MS, ROOM_IDLE_MS, setGuess, start, tick, toPublic, unready, WIN_SCORE,
  type RoomState,
} from "../src/lib/room";

const T0 = 1_000_000;

function lobby(names: string[]): RoomState {
  const room = createRoom("ABCDEF", T0);
  names.forEach((name, i) => expect(join(room, `token-${i}`, name).ok).toBe(true));
  return room;
}

/** A match with the opening countdown over: round 1 is on screen at `now`. */
function playing(seed = 1): { room: RoomState; now: number } {
  const room = lobby(["Alex", "Jamie"]);
  expect(ready(room, "p2")).toBe(true);
  expect(start(room, "p1", T0, seededRng(seed))).toBe(true);
  expect(tick(room, T0 + COUNTDOWN_MS)).toBe("changed");
  return { room, now: T0 + COUNTDOWN_MS };
}

/** The whole-number guess nearest the real split, and one a long way from it. */
const near = (room: RoomState) => Math.round(room.round!.share);
const far = (room: RoomState) => (room.round!.share > 50 ? 0 : 100);

describe("room codes", () => {
  it("generates valid, unambiguous codes", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(isRoomCode(code)).toBe(true);
      expect(code).not.toMatch(/[O0I1]/);
    }
    expect(isRoomCode("abc")).toBe(false);
    expect(isRoomCode("ABCDE0")).toBe(false);
  });
});

describe("lobby", () => {
  it("makes the first player host and caps the room at two players", () => {
    const room = lobby(["A", "B"]);
    expect(room.hostId).toBe("p1");
    expect(room.players).toHaveLength(MAX_PLAYERS);
    expect(join(room, "token-x", "C")).toEqual({ ok: false, error: "full" });
  });

  it("requires a name", () => {
    expect(join(createRoom("ABCDEF", T0), "token", "   ")).toEqual({ ok: false, error: "name_required" });
  });

  it("removes players who leave and promotes a new host", () => {
    const room = lobby(["A", "B"]);
    disconnect(room, "p1", T0);
    expect(room.players.map((p) => p.id)).toEqual(["p2"]);
    expect(room.hostId).toBe("p2");
  });

  it("only lets the host start, with two players, once the guest is ready", () => {
    expect(start(lobby(["A"]), "p1", T0)).toBe(false);
    const room = lobby(["A", "B"]);
    expect(start(room, "p2", T0)).toBe(false);
    expect(start(room, "p1", T0)).toBe(false);
    expect(ready(room, "p2")).toBe(true);
    expect(unready(room, "p2")).toBe(true);
    expect(start(room, "p1", T0)).toBe(false);
    expect(ready(room, "p2")).toBe(true);
    expect(start(room, "p1", T0)).toBe(true);
    expect(room.phase).toBe("playing");
    expect(join(room, "token-late", "Late")).toEqual({ ok: false, error: "in_progress" });
  });
});

describe("countdown", () => {
  it("holds the board back until the countdown ends", () => {
    const room = lobby(["A", "B"]);
    ready(room, "p2");
    start(room, "p1", T0);
    expect(toPublic(room, "p1").round!.splats).toEqual([]);
    expect(nextWake(room)).toBe(T0 + COUNTDOWN_MS);
    expect(lock(room, "p1", 1, 50, T0 + 100)).toBe(false);
    expect(setGuess(room, "p1", 1, 60, T0 + 100)).toBe(false);
    expect(tick(room, T0 + COUNTDOWN_MS - 1)).toBe("idle");
    expect(tick(room, T0 + COUNTDOWN_MS)).toBe("changed");
    expect(toPublic(room, "p1").round!.splats.length).toBeGreaterThan(0);
    expect(nextWake(room)).toBe(T0 + COUNTDOWN_MS + PAINT_MS + GUESS_MS);
  });
});

describe("what players are told", () => {
  it("never includes tokens or the answer, and hides the rival's guess while the round is open", () => {
    const { room, now } = playing();
    setGuess(room, "p1", 1, 33, now + 1500);
    lock(room, "p2", 1, 71, now + 2000);
    const view = toPublic(room, "p1");
    const text = JSON.stringify(view);
    expect(text).not.toContain("token");
    expect(text).not.toContain("share");
    expect(view.round!.result).toBeNull();
    expect(view.round!.guesses.p1).toEqual({ value: 33, lockedAt: null });
    // Alex can see that Jamie has locked in, but not where.
    expect(view.round!.guesses.p2).toEqual({ value: null, lockedAt: now + 2000 });
    expect(toPublic(room, "p2").round!.guesses.p1.value).toBeNull();
  });

  it("reveals the split and both guesses once the round is settled", () => {
    const { room, now } = playing();
    lock(room, "p1", 1, 40, now + 1500);
    lock(room, "p2", 1, 60, now + 1600);
    const view = toPublic(room, "p1");
    expect(view.round!.result!.share).toBe(room.round!.share);
    expect(view.round!.guesses.p2.value).toBe(60);
  });
});

describe("judging a round", () => {
  const g = (value: number, lockedAt: number | null) => ({ value, lockedAt });

  it("gives the round to the closest guess, however slow", () => {
    expect(judge(62.3, { p1: g(60, 900), p2: g(70, 100) })).toEqual({ winnerId: "p1", bySpeed: false });
    expect(judge(62.3, { p1: g(50, null), p2: g(70, 100) })).toEqual({ winnerId: "p2", bySpeed: false });
  });

  it("breaks a tie on distance by who locked in first", () => {
    expect(judge(50, { p1: g(45, 900), p2: g(55, 100) })).toEqual({ winnerId: "p2", bySpeed: true });
    expect(judge(62.3, { p1: g(60, 100), p2: g(60, 900) })).toEqual({ winnerId: "p1", bySpeed: true });
  });

  it("counts a player who never locked in as slowest", () => {
    expect(judge(50, { p1: g(50, null), p2: g(50, 4999) })).toEqual({ winnerId: "p2", bySpeed: true });
  });

  it("is a dead heat when nothing separates them", () => {
    expect(judge(50, { p1: g(50, null), p2: g(50, null) })).toEqual({ winnerId: null, bySpeed: false });
    expect(judge(50, { p1: g(48, 700), p2: g(52, 700) })).toEqual({ winnerId: null, bySpeed: false });
  });

  it("is not fooled by floating-point distances", () => {
    // 60 and 60.6 are both 0.3 from 60.3; only the lock-in time may separate them.
    expect(judge(60.3, { p1: g(60, 900), p2: g(60.6, 100) })).toEqual({ winnerId: "p2", bySpeed: true });
  });
});

describe("guessing", () => {
  it("starts everyone at 50 and settles as soon as both lock in", () => {
    const { room, now } = playing();
    expect(room.round!.guesses).toEqual({ p1: { value: DEFAULT_GUESS, lockedAt: null }, p2: { value: DEFAULT_GUESS, lockedAt: null } });
    expect(lock(room, "p1", 1, near(room), now + 1500)).toBe(true);
    expect(room.round!.result).toBeNull();
    expect(lock(room, "p2", 1, far(room), now + 1800)).toBe(true);
    expect(room.round!.result).toEqual({ share: room.round!.share, winnerId: "p1", bySpeed: false });
    expect(room.players.map((p) => p.score)).toEqual([1, 0]);
    expect(room.nextRoundAt).toBe(now + 1800 + REVEAL_MS);
  });

  it("does not let a locked guess be changed", () => {
    const { room, now } = playing();
    lock(room, "p1", 1, 40, now + 1500);
    expect(lock(room, "p1", 1, 60, now + 1600)).toBe(false);
    expect(setGuess(room, "p1", 1, 60, now + 1600)).toBe(false);
    expect(room.round!.guesses.p1).toEqual({ value: 40, lockedAt: now + 1500 });
  });

  it("rejects guesses that are out of range, not whole numbers, or for another round", () => {
    const { room, now } = playing();
    for (const value of [-1, 101, 49.5, Number.NaN]) {
      expect(lock(room, "p1", 1, value, now + 1500)).toBe(false);
      expect(setGuess(room, "p1", 1, value, now + 1500)).toBe(false);
    }
    expect(lock(room, "p1", 2, 50, now + 1500)).toBe(false);
    expect(lock(room, "nobody", 1, 50, now + 1500)).toBe(false);
  });

  it("uses wherever the bar was left when the clock runs out", () => {
    const { room, now } = playing();
    const deadline = now + PAINT_MS + GUESS_MS;
    expect(setGuess(room, "p1", 1, near(room), now + 2000)).toBe(true);
    expect(tick(room, deadline - 1)).toBe("idle");
    expect(tick(room, deadline)).toBe("changed");
    expect(room.round!.guesses.p1).toEqual({ value: near(room), lockedAt: null });
    expect(room.round!.guesses.p2).toEqual({ value: DEFAULT_GUESS, lockedAt: null });
    expect(room.round!.result!.winnerId).toBe(near(room) === DEFAULT_GUESS ? null : "p1");
  });

  it("guesses 50-50 for a player who never touches the bar", () => {
    const { room, now } = playing();
    lock(room, "p1", 1, far(room), now + 1500);
    tick(room, now + PAINT_MS + GUESS_MS);
    expect(room.round!.guesses.p2.value).toBe(50);
    expect(room.round!.result!.winnerId).toBe("p2");
  });

  it("refuses anything sent after the deadline", () => {
    const { room, now } = playing();
    const late = now + PAINT_MS + GUESS_MS + 1000;
    expect(setGuess(room, "p1", 1, 70, late)).toBe(false);
    expect(lock(room, "p1", 1, 70, late)).toBe(false);
  });

  it("deals the next round after the reveal, with fresh guesses", () => {
    const { room, now } = playing();
    lock(room, "p1", 1, 40, now + 1500);
    lock(room, "p2", 1, 60, now + 1500);
    const settled = now + 1500;
    expect(nextWake(room)).toBe(settled + REVEAL_MS);
    expect(tick(room, settled + REVEAL_MS - 1)).toBe("idle");
    expect(tick(room, settled + REVEAL_MS)).toBe("changed");
    expect(room.round!.number).toBe(2);
    expect(room.round!.shown).toBe(true);
    expect(room.round!.result).toBeNull();
    expect(room.round!.guesses.p1).toEqual({ value: DEFAULT_GUESS, lockedAt: null });
    expect(lock(room, "p1", 1, 50, settled + REVEAL_MS + 10)).toBe(false);
  });
});

/** Plays rounds until someone wins, with p1 always closest. */
function playOut(room: RoomState, from: number): number {
  let now = from;
  while (room.phase === "playing") {
    lock(room, "p1", room.round!.number, near(room), now + 1500);
    lock(room, "p2", room.round!.number, far(room), now + 1600);
    if (room.phase !== "playing") break;
    now += 1600 + REVEAL_MS;
    expect(tick(room, now)).toBe("changed");
  }
  return now;
}

describe("match", () => {
  it("ends when someone reaches the win score", () => {
    const { room, now } = playing();
    playOut(room, now);
    expect(room.phase).toBe("finished");
    expect(room.winnerId).toBe("p1");
    expect(room.players[0].score).toBe(WIN_SCORE);
    expect(room.round!.number).toBe(WIN_SCORE);
    expect(room.nextRoundAt).toBeNull();
    expect(nextWake(room)).toBeNull();
  });

  it("is called off after a few rounds that nobody plays", () => {
    const { room, now } = playing();
    lock(room, "p2", 1, near(room), now + 1500);
    lock(room, "p1", 1, far(room), now + 1600);
    let at = now + 1600 + REVEAL_MS;
    for (let i = 0; i < MAX_IDLE_ROUNDS; i++) {
      expect(room.phase).toBe("playing");
      expect(tick(room, at)).toBe("changed"); // deal
      at += PAINT_MS + GUESS_MS;
      expect(tick(room, at)).toBe("changed"); // clock runs out, nobody moved
      at += REVEAL_MS;
    }
    expect(room.phase).toBe("finished");
    expect(room.winnerId).toBe("p2"); // ahead 1-0 when it was called off
    expect(nextWake(room)).toBeNull();
  });

  it("calls an unplayed match a draw, and a played round resets the count", () => {
    const { room, now } = playing();
    let at = now;
    const idleRound = () => { at += PAINT_MS + GUESS_MS; tick(room, at); at += REVEAL_MS; tick(room, at); };
    idleRound(); idleRound();
    expect(room.idleRounds).toBe(2);
    setGuess(room, "p1", room.round!.number, 49, at + 1500);
    idleRound();
    expect(room.idleRounds).toBe(0);
    idleRound(); idleRound();
    expect(room.phase).toBe("playing");
    idleRound();
    expect(room.phase).toBe("finished");
    expect(room.winnerId).toBe(room.players[0].score === room.players[1].score ? null : room.players[0].score > room.players[1].score ? "p1" : "p2");
  });

  it("needs the guest to ready up before a rematch", () => {
    const { room, now } = playing();
    const end = playOut(room, now);
    expect(rematch(room, "p2", end)).toBe(false);
    expect(rematch(room, "p1", end)).toBe(false);
    expect(ready(room, "p2")).toBe(true);
    expect(rematch(room, "p1", end)).toBe(true);
    expect(room.phase).toBe("playing");
    expect(room.players.map((p) => p.score)).toEqual([0, 0]);
    expect(room.round!.number).toBe(1);
    expect(room.round!.shown).toBe(false);
  });

  it("sends the host back to the lobby if the opponent has left", () => {
    const { room, now } = playing();
    const end = playOut(room, now);
    disconnect(room, "p2", end);
    expect(rematch(room, "p1", end)).toBe(true);
    expect(room.phase).toBe("lobby");
    expect(room.players.map((p) => p.id)).toEqual(["p1"]);
  });
});

describe("dropping out", () => {
  it("keeps a player's place mid-game and lets them back in with their token", () => {
    const { room, now } = playing();
    disconnect(room, "p2", now);
    expect(room.players[1].connected).toBe(false);
    const back = join(room, "token-1", "Someone Else");
    expect(back.ok && back.player.id).toBe("p2");
    expect(room.players[1].connected).toBe(true);
  });

  it("still settles a round on the clock if a player has gone", () => {
    const { room, now } = playing();
    disconnect(room, "p2", now);
    lock(room, "p1", 1, near(room), now + 1500);
    expect(room.round!.result).toBeNull();
    expect(tick(room, now + PAINT_MS + GUESS_MS)).toBe("changed");
    expect(room.round!.result).not.toBeNull();
  });

  it("expires an empty room, but not one with someone in it", () => {
    const { room, now } = playing();
    disconnect(room, "p1", now);
    expect(room.expiresAt).toBeNull();
    disconnect(room, "p2", now);
    expect(room.expiresAt).toBe(now + ROOM_IDLE_MS);
    // The round in progress is settled first; the room goes once the idle time is up.
    expect(tick(room, now + ROOM_IDLE_MS)).toBe("expired");
  });
});
