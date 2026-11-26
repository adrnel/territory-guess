import { cleanName, COUNTDOWN_MS, generateDuelRound, type Rng, type Splats } from "./game";

/**
 * Duel room rules, kept free of any Cloudflare APIs so they can be unit
 * tested. The Room Durable Object (src/server/room-do.ts) stores a RoomState and
 * calls these functions; each returns true when the state changed.
 */

/** Multiplayer is a head-to-head duel. */
export const MAX_PLAYERS = 2;
export const WIN_SCORE = 5;
/** Time for the board to be painted on screen before the clock starts. */
export const PAINT_MS = 1000;
/** How long players have to set the bar. */
export const GUESS_MS = 5000;
/** How long the result of a round stays up before the next one. */
export const REVEAL_MS = 4000;
/** Where the bar starts, and the guess used for a player who never touches it. */
export const DEFAULT_GUESS = 50;
/** A match is called off after this many rounds in a row in which nobody touched their bar. */
export const MAX_IDLE_ROUNDS = 3;
/** Empty rooms are deleted after this long. */
export const ROOM_IDLE_MS = 10 * 60 * 1000;
/** Allowance for a message sent just before the deadline arriving just after it. */
const LATE_TOLERANCE_MS = 150;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;

export function isRoomCode(value: unknown): value is string {
  return typeof value === "string" && value.length === ROOM_CODE_LENGTH
    && [...value].every((char) => CODE_ALPHABET.includes(char));
}

export function generateRoomCode(rng: Rng = Math.random): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  return code;
}

export type Phase = "lobby" | "playing" | "finished";

export type Player = {
  id: string;
  /** Secret, only known to that player's browser; lets them reconnect. */
  token: string;
  name: string;
  score: number;
  connected: boolean;
  /** Ready for the next match. The guest must ready up before every match; the host starts it. */
  ready: boolean;
};

/** Where a player's bar is (colour 0's share, 0-100) and when they locked it in, if they did. */
export type Guess = { value: number; lockedAt: number | null };

export type RoundResult = {
  /** The real split: colour 0's share, one decimal place. */
  share: number;
  /** Null when the round was a dead heat. */
  winnerId: string | null;
  /** True when both were equally close and the faster lock-in decided it. */
  bySpeed: boolean;
};

export type RoomRound = {
  number: number;
  pair: number;
  splats: Splats;
  cut: number;
  /** The answer. Never sent before the round is resolved. */
  share: number;
  /** When the board is shown. The clock runs from startsAt + PAINT_MS to endsAt. */
  startsAt: number;
  endsAt: number;
  /** False while the opening countdown runs: the board is withheld from players. */
  shown: boolean;
  guesses: Record<string, Guess>;
  result: RoundResult | null;
};

export type RoomState = {
  code: string;
  phase: Phase;
  hostId: string | null;
  players: Player[];
  round: RoomRound | null;
  /** Who won the match. Null in a finished room means it was called off with the scores level. */
  winnerId: string | null;
  /** Rounds in a row that nobody played, so two absent players can't keep a room running forever. */
  idleRounds: number;
  /** When the next round should be dealt (set when a round is resolved). */
  nextRoundAt: number | null;
  /** When the room should be deleted if nobody is connected. */
  expiresAt: number | null;
  nextPlayerNumber: number;
};

export type PublicPlayer = Omit<Player, "token">;
/** While a round is open an opponent's `value` is null: only whether they have locked in is shared. */
export type PublicGuess = { value: number | null; lockedAt: number | null };
/** `splats` is empty (and `cut` zero) until the countdown ends. */
export type PublicRound = Omit<RoomRound, "share" | "guesses"> & { guesses: Record<string, PublicGuess> };
export type PublicRoom = {
  code: string;
  phase: Phase;
  hostId: string | null;
  players: PublicPlayer[];
  round: PublicRound | null;
  winnerId: string | null;
  maxPlayers: number;
  winScore: number;
};

export type ServerMessage =
  | { type: "state"; you: string; now: number; room: PublicRoom }
  | { type: "error"; code: JoinError | "bad_request"; message: string };

export type ClientMessage =
  | { type: "start" }
  /** The bar moved. Not broadcast; it is what counts if the clock runs out. */
  | { type: "set"; round: number; value: number }
  | { type: "lock"; round: number; value: number }
  | { type: "ready" }
  | { type: "unready" }
  | { type: "rematch" };

export type JoinError = "not_found" | "full" | "in_progress" | "name_required";

export const JOIN_ERROR_MESSAGES: Record<JoinError, string> = {
  not_found: "That room doesn't exist. Check the code and try again.",
  full: "That room is full.",
  in_progress: "That game has already started.",
  name_required: "Enter your name to join.",
};

export function createRoom(code: string, now: number): RoomState {
  return {
    code, phase: "lobby", hostId: null, players: [], round: null,
    winnerId: null, idleRounds: 0, nextRoundAt: null, expiresAt: now + ROOM_IDLE_MS, nextPlayerNumber: 1,
  };
}

/** The view sent to one player: no tokens, no answer and no rival guess until the round is resolved. */
export function toPublic(room: RoomState, viewerId: string | null = null): PublicRoom {
  const round = room.round;
  return {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    players: room.players.map(({ token: _token, ...player }) => player),
    round: round && {
      number: round.number,
      pair: round.pair,
      splats: round.shown ? round.splats : [],
      cut: round.shown ? round.cut : 0,
      startsAt: round.startsAt,
      endsAt: round.endsAt,
      shown: round.shown,
      result: round.result,
      guesses: Object.fromEntries(Object.entries(round.guesses).map(([id, guess]) =>
        [id, { value: round.result || id === viewerId ? guess.value : null, lockedAt: guess.lockedAt }])),
    },
    winnerId: room.winnerId,
    maxPlayers: MAX_PLAYERS,
    winScore: WIN_SCORE,
  };
}

function ensureHost(room: RoomState) {
  const host = room.players.find((p) => p.id === room.hostId);
  if (host?.connected) return;
  room.hostId = room.players.find((p) => p.connected)?.id ?? host?.id ?? null;
}

/** Adds a new player, or reconnects an existing one who presents their token. */
export function join(room: RoomState, token: string, rawName: unknown):
  { ok: true; player: Player } | { ok: false; error: JoinError } {
  const existing = room.players.find((p) => p.token === token);
  if (existing) {
    existing.connected = true;
    room.expiresAt = null;
    ensureHost(room);
    return { ok: true, player: existing };
  }
  const name = cleanName(rawName);
  if (!name) return { ok: false, error: "name_required" };
  if (room.phase !== "lobby") return { ok: false, error: "in_progress" };
  if (room.players.length >= MAX_PLAYERS) return { ok: false, error: "full" };
  const player: Player = { id: `p${room.nextPlayerNumber++}`, token, name, score: 0, connected: true, ready: false };
  room.players.push(player);
  room.expiresAt = null;
  ensureHost(room);
  return { ok: true, player };
}

/** A socket closed. In the lobby the player leaves; mid-game they may return. */
export function disconnect(room: RoomState, playerId: string, now: number): boolean {
  const player = room.players.find((p) => p.id === playerId);
  if (!player) return false;
  if (room.phase === "lobby") room.players = room.players.filter((p) => p.id !== playerId);
  else player.connected = false;
  ensureHost(room);
  if (!room.players.some((p) => p.connected)) room.expiresAt = now + ROOM_IDLE_MS;
  return true;
}

function dealRound(room: RoomState, now: number, startsAt: number, rng: Rng) {
  room.round = {
    number: (room.round?.number ?? 0) + 1,
    ...generateDuelRound(rng),
    startsAt,
    endsAt: startsAt + PAINT_MS + GUESS_MS,
    shown: startsAt <= now,
    guesses: Object.fromEntries(room.players.map((p) => [p.id, { value: DEFAULT_GUESS, lockedAt: null }])),
    result: null,
  };
  room.nextRoundAt = null;
}

export function start(room: RoomState, playerId: string, now: number, rng: Rng = Math.random): boolean {
  if (room.phase !== "lobby" || playerId !== room.hostId) return false;
  if (room.players.filter((p) => p.connected).length < 2) return false;
  if (room.players.some((p) => p.id !== room.hostId && !p.ready)) return false;
  begin(room, now, rng);
  return true;
}

function begin(room: RoomState, now: number, rng: Rng) {
  room.phase = "playing";
  room.winnerId = null;
  room.round = null;
  room.idleRounds = 0;
  for (const player of room.players) player.score = 0;
  dealRound(room, now, now + COUNTDOWN_MS, rng);
}

/** The guess a player may still change, if the round is open for them. */
function openGuess(room: RoomState, playerId: string, roundNumber: number, value: number, now: number): Guess | null {
  const round = room.round;
  if (room.phase !== "playing" || !round || round.number !== roundNumber || round.result) return null;
  if (!round.shown || now < round.startsAt || now > round.endsAt + LATE_TOLERANCE_MS) return null;
  if (!Number.isInteger(value) || value < 0 || value > 100) return null;
  const guess = round.guesses[playerId];
  return guess && guess.lockedAt === null ? guess : null;
}

/** The bar moved. This is the guess used if the clock runs out before the player locks in. */
export function setGuess(room: RoomState, playerId: string, roundNumber: number, value: number, now: number): boolean {
  const guess = openGuess(room, playerId, roundNumber, value, now);
  if (!guess || guess.value === value) return false;
  guess.value = value;
  return true;
}

/** A player commits to their guess. Once both have, the round is settled without waiting for the clock. */
export function lock(room: RoomState, playerId: string, roundNumber: number, value: number, now: number): boolean {
  const guess = openGuess(room, playerId, roundNumber, value, now);
  if (!guess) return false;
  guess.value = value;
  guess.lockedAt = Math.min(now, room.round!.endsAt);
  if (Object.values(room.round!.guesses).every((g) => g.lockedAt !== null)) resolve(room, now);
  return true;
}

/**
 * Closest guess takes the round. If both are equally far out, whoever locked
 * in first takes it; a player who let the clock run out counts as slowest. If
 * that can't separate them either, nobody scores.
 */
export function judge(share: number, guesses: Record<string, Guess>): Pick<RoundResult, "winnerId" | "bySpeed"> {
  // Work in tenths of a point so ties are exact rather than floating-point near misses.
  const ranked = Object.entries(guesses)
    .map(([id, guess]) => ({ id, miss: Math.abs(Math.round(guess.value * 10) - Math.round(share * 10)), at: guess.lockedAt ?? Infinity }))
    .sort((a, b) => a.miss - b.miss || a.at - b.at);
  const [first, second] = ranked;
  if (!first) return { winnerId: null, bySpeed: false };
  if (!second || first.miss < second.miss) return { winnerId: first.id, bySpeed: false };
  if (first.at < second.at) return { winnerId: first.id, bySpeed: true };
  return { winnerId: null, bySpeed: false };
}

function resolve(room: RoomState, now: number) {
  const round = room.round!;
  round.result = { share: round.share, ...judge(round.share, round.guesses) };
  const winner = room.players.find((p) => p.id === round.result!.winnerId);
  if (winner) winner.score += 1;
  const untouched = Object.values(round.guesses).every((g) => g.lockedAt === null && g.value === DEFAULT_GUESS);
  room.idleRounds = untouched ? room.idleRounds + 1 : 0;
  if (winner && winner.score >= WIN_SCORE) {
    finish(room, winner.id);
  } else if (room.idleRounds >= MAX_IDLE_ROUNDS) {
    // Nobody is playing: stop here and give it to whoever is ahead, if anyone.
    const [first, second] = [...room.players].sort((a, b) => b.score - a.score);
    finish(room, first && first.score > (second?.score ?? 0) ? first.id : null);
  } else {
    room.nextRoundAt = now + REVEAL_MS;
  }
}

function finish(room: RoomState, winnerId: string | null) {
  room.phase = "finished";
  room.winnerId = winnerId;
  room.nextRoundAt = null;
  // Everyone but the host has to ready up again before a rematch.
  for (const other of room.players) other.ready = other.id === room.hostId;
}

/** A guest says they are ready for the next match (in the lobby or after a match). */
export function ready(room: RoomState, playerId: string): boolean {
  const player = room.players.find((p) => p.id === playerId);
  if (room.phase === "playing" || !player || player.ready) return false;
  player.ready = true;
  return true;
}

/** A guest changes their mind before the host has started the match. */
export function unready(room: RoomState, playerId: string): boolean {
  const player = room.players.find((p) => p.id === playerId);
  if (room.phase === "playing" || !player || !player.ready || playerId === room.hostId) return false;
  player.ready = false;
  return true;
}

/**
 * Host asks for another game. If the opponent is still here they must have
 * readied up, and the new match starts straight away. If they have left, the
 * host goes back to the lobby to wait for someone new.
 */
export function rematch(room: RoomState, playerId: string, now: number, rng: Rng = Math.random): boolean {
  if (room.phase !== "finished" || playerId !== room.hostId) return false;
  room.players = room.players.filter((p) => p.connected);
  if (room.players.length >= 2) {
    if (room.players.some((p) => p.id !== room.hostId && !p.ready)) return false;
    begin(room, now, rng);
    return true;
  }
  room.phase = "lobby";
  for (const player of room.players) { player.score = 0; player.ready = false; }
  room.round = null;
  room.winnerId = null;
  room.nextRoundAt = null;
  ensureHost(room);
  return true;
}

/** Timer tick. Returns "expired" when the room should be deleted. */
export function tick(room: RoomState, now: number, rng: Rng = Math.random): "expired" | "changed" | "idle" {
  if (room.expiresAt !== null && now >= room.expiresAt && !room.players.some((p) => p.connected)) return "expired";
  const round = room.phase === "playing" ? room.round : null;
  if (round && !round.shown && now >= round.startsAt) {
    round.shown = true;
    return "changed";
  }
  if (round && round.shown && !round.result && now >= round.endsAt) {
    resolve(room, now);
    return "changed";
  }
  if (room.phase === "playing" && room.nextRoundAt !== null && now >= room.nextRoundAt) {
    dealRound(room, now, now, rng);
    return "changed";
  }
  return "idle";
}

/** The next moment tick() needs to run, if any. */
export function nextWake(room: RoomState): number | null {
  const round = room.phase === "playing" ? room.round : null;
  const roundTimer = !round || round.result ? null : round.shown ? round.endsAt : round.startsAt;
  const times = [room.nextRoundAt, room.expiresAt, roundTimer].filter((t): t is number => t !== null);
  return times.length ? Math.min(...times) : null;
}
