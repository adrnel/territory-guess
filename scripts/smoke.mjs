#!/usr/bin/env node
// End-to-end check of a running Turf War Guesser instance (local or deployed):
//   node scripts/smoke.mjs                      -> http://localhost:3001
//   node scripts/smoke.mjs https://your.site    -> a deployment
// Plays a solo run through the API, posts a score, and runs a short
// multiplayer exchange over WebSockets. Posts one leaderboard entry named
// "Smoke Test" unless --no-score is passed.
const base = (process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3001").replace(/\/$/, "");
const postScore = !process.argv.includes("--no-score");
import { shareOf } from "../src/lib/game.ts";

let passed = 0;

function check(condition, label, detail = "") {
  if (!condition) {
    console.error(`  ✗ ${label} ${detail}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`  ✓ ${label}`);
}

async function call(path, body) {
  const response = await fetch(base + path, body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  let data = null;
  try { data = await response.json(); } catch { /* not JSON */ }
  return { status: response.status, data };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Measure the board the way the server does. (A script can do this too: see "Known limits".)
const bigger = (round) => (shareOf(round.splats) > 50 ? 0 : 1);

console.log(`Turf War Guesser smoke test → ${base}\n\nPages`);
for (const path of ["/", "/play", "/leaderboard", "/host", "/join"]) {
  const response = await fetch(base + path);
  check(response.status === 200 && (await response.text()).includes("Turf War"), `GET ${path}`);
}

console.log("\nSolo run");
const started = await call("/api/game/start", {});
check(started.status === 200 && started.data.round.level === 1 && started.data.round.splats.length > 100, "starts a run", JSON.stringify(started).slice(0, 200));
check(!JSON.stringify(started.data).includes("share"), "does not leak the split");
const gameId = started.data.gameId;

check((await call("/api/game/answer", { gameId: "nope", level: 1, choice: 0 })).status === 400, "rejects a malformed game id");
check((await call("/api/game/answer", { gameId, level: 1, choice: 2 })).status === 400, "rejects an impossible choice");
check((await call("/api/game/answer", { gameId: crypto.randomUUID(), level: 1, choice: 0 })).status === 404, "404s an unknown game");
check((await call("/api/score", { gameId, name: "Cheater" })).status === 409, "refuses to post an unfinished run");
check((await call("/api/score", { gameId, name: "Cheater", score: 999999 })).status === 409, "ignores a client-supplied score");

let round = started.data.round;
const CLEARED = 4;
for (let level = 1; level <= CLEARED; level++) {
  let result;
  if (level === 2) {
    const both = await Promise.all([0, 1].map(() => call("/api/game/answer", { gameId, level, choice: bigger(round) })));
    const statuses = both.map((r) => r.status).sort();
    check(statuses[0] === 200 && statuses[1] === 409, "simultaneous answers: only one counts", statuses.join(","));
    result = both.find((r) => r.status === 200);
  } else {
    result = await call("/api/game/answer", { gameId, level, choice: bigger(round) });
  }
  if (result.status !== 200 || !result.data.correct) check(false, `level ${level}`, JSON.stringify(result).slice(0, 200));
  if (level === 1) {
    check(result.data.share === shareOf(round.splats), `reveals the split after the guess (${result.data.share}%)`);
    check((await call("/api/game/answer", { gameId, level: 1, choice: 0 })).status === 409, "rejects an answer for an old level");
  }
  if (result.data.score !== level || result.data.finished || result.data.nextRound.level !== level + 1) check(false, `progress after level ${level}`, JSON.stringify(result.data).slice(0, 200));
  round = result.data.nextRound;
}
check(true, `clears ${CLEARED} levels, one point each`);
const wrong = await call("/api/game/answer", { gameId, level: CLEARED + 1, choice: 1 - bigger(round) });
check(wrong.status === 200 && wrong.data.correct === false && wrong.data.finished === true && wrong.data.score === CLEARED && !wrong.data.nextRound,
  "a wrong guess ends the run and keeps the score", JSON.stringify(wrong.data));
check((await call("/api/game/answer", { gameId, level: CLEARED + 1, choice: bigger(round) })).status === 409, "rejects answers after the run ends");
check((await call("/api/score", { gameId, name: "   " })).status === 400, "requires a name");
const score = CLEARED;

const dud = await call("/api/game/start", {});
await call("/api/game/answer", { gameId: dud.data.gameId, level: 1, choice: 1 - bigger(dud.data.round) });
check((await call("/api/score", { gameId: dud.data.gameId, name: "Zero" })).status === 409, "a run that cleared nothing can't be posted");

console.log("\nLeaderboard");
if (postScore) {
  const posted = await call("/api/score", { gameId, name: "  Smoke   Test  " });
  check(posted.status === 201 && posted.data.entry.score === score && posted.data.entry.name === "Smoke Test", "posts the server-side score with a cleaned name");
  check(posted.data.entry.rank >= 1, `reports the rank (#${posted.data.entry.rank})`);
  check((await call("/api/score", { gameId, name: "Again" })).status === 409, "refuses to post the same game twice");
  const board = await call(`/api/leaderboard?entry=${posted.data.entry.id}`);
  check(board.status === 200 && board.data.me?.id === posted.data.entry.id, "finds the player's own entry");
  check(board.data.entries.length <= 10 && board.data.entries.every((e, i, all) => i === 0 || all[i - 1].score >= e.score), "a page holds at most 10 sorted scores");
  check(board.data.pages >= 1 && board.data.pages <= 10 && board.data.total <= 100, "shows the top 100 across up to 10 pages");
  for (const period of ["day", "week", "month"]) {
    const scoped = await call(`/api/leaderboard?period=${period}&entry=${posted.data.entry.id}`);
    check(scoped.status === 200 && scoped.data.me?.id === posted.data.entry.id && scoped.data.me.rank <= board.data.me.rank,
      `${period} board includes the new score (#${scoped.data.me?.rank})`);
  }
  check(posted.data.rankToday >= 1 && posted.data.rankToday <= posted.data.entry.rank, "reports today's rank as well");
  const beyond = await call("/api/leaderboard?period=all&page=99");
  check(beyond.status === 200 && beyond.data.page === beyond.data.pages, "a page past the end falls back to the last page");
  check((await call("/api/leaderboard?period=year")).status === 400, "rejects an unknown period");
} else {
  const board = await call("/api/leaderboard");
  check(board.status === 200 && Array.isArray(board.data.entries), "reads the leaderboard");
}

console.log("\nMultiplayer");
const wsBase = base.replace(/^http/, "ws");
function connect(code, name, token = crypto.randomUUID()) {
  const ws = new WebSocket(`${wsBase}/api/rooms/${code}/ws?token=${token}&name=${encodeURIComponent(name)}`);
  const player = { ws, token, state: null, you: null, error: null, waiters: [] };
  ws.onmessage = (event) => {
    if (event.data === "pong") return;
    const message = JSON.parse(event.data);
    if (message.type === "state") { player.state = message.room; player.you = message.you; player.offset = message.now - Date.now(); }
    else player.error = message;
    player.waiters = player.waiters.filter((w) => !w());
  };
  player.until = (test, label) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for: ${label}`)), 10000);
    const attempt = () => { if (!test(player)) return false; clearTimeout(timer); resolve(player); return true; };
    if (!attempt()) player.waiters.push(attempt);
  });
  return player;
}

const ghost = connect("ZZZZZZ", "Ghost");
await ghost.until((p) => p.error, "error for unknown room");
check(ghost.error.code === "not_found", "unknown room code is rejected");

const created = await call("/api/rooms", {});
check(created.status === 201 && /^[A-Z2-9]{6}$/.test(created.data.code), `creates a room (${created.data?.code})`, JSON.stringify(created));
const code = created.data.code;
const alex = connect(code, "Alex");
await alex.until((p) => p.state, "host joins");
const jamie = connect(code, "Jamie");
await alex.until((p) => p.state.players.length === 2, "second player joins");
await jamie.until((p) => p.state?.players.length === 2, "guest sees both players");
check(alex.state.hostId === alex.you && alex.state.phase === "lobby", "first player is the host");

const third = connect(code, "Third");
await third.until((p) => p.error, "third player rejected");
check(third.error.code === "full", "rooms are head to head: a third player is turned away");
third.ws.close();

jamie.ws.send(JSON.stringify({ type: "start" }));
await sleep(400);
check(jamie.state.phase === "lobby", "guests cannot start the game");
alex.ws.send(JSON.stringify({ type: "start" }));
await sleep(400);
check(alex.state.phase === "lobby", "host cannot start until the guest is ready");
jamie.ws.send(JSON.stringify({ type: "ready" }));
await alex.until((p) => p.state.players[1].ready === true, "guest readies up");
jamie.ws.send(JSON.stringify({ type: "unready" }));
await alex.until((p) => p.state.players[1].ready === false, "guest un-readies");
jamie.ws.send(JSON.stringify({ type: "ready" }));
await alex.until((p) => p.state.players[1].ready === true, "guest readies up again");
alex.ws.send(JSON.stringify({ type: "start" }));
await jamie.until((p) => p.state.phase === "playing", "game starts");
check(!JSON.stringify(jamie.state).includes("token") && !JSON.stringify(jamie.state).includes("share"), "answer and tokens stay hidden");
check(jamie.state.round.splats.length === 0, "board is held back during the countdown");

const late = connect(code, "Late");
await late.until((p) => p.error, "late joiner rejected");
check(late.error.code === "in_progress", "nobody can join mid-game");

const send = (player, message) => player.ws.send(JSON.stringify(message));
const shown = (n) => (p) => p.state.round.number === n && p.state.round.splats.length > 100;
await Promise.all([alex, jamie].map((p) => p.until(shown(1), "board arrives when the countdown ends")));
check(Date.now() + jamie.offset >= jamie.state.round.startsAt - 50, "board appears only once guessing is allowed");
check(jamie.state.round.endsAt - jamie.state.round.startsAt === 6000, "five seconds to guess, after a second for the board to appear");

// Round 1: Alex is closest; Jamie locks in first but further out.
let truth = shareOf(alex.state.round.splats);
const off = truth > 50 ? -20 : 20;
send(jamie, { type: "lock", round: 1, value: Math.round(truth) + off });
await alex.until((p) => p.state.round.guesses[jamie.you].lockedAt !== null, "rival's lock-in is announced");
check(alex.state.round.guesses[jamie.you].value === null && alex.state.round.result === null, "but not what they guessed");
send(jamie, { type: "lock", round: 1, value: Math.round(truth) });
send(alex, { type: "set", round: 1, value: 101 });
send(alex, { type: "lock", round: 1, value: Math.round(truth) });
await jamie.until((p) => p.state.round.result, "round settles as soon as both lock in");
check(jamie.state.round.result.winnerId === alex.you && jamie.state.round.result.share === truth && jamie.state.round.result.bySpeed === false,
  `closest guess wins the round (split ${truth}%)`, JSON.stringify(jamie.state.round.result));
check(jamie.state.round.guesses[jamie.you].value === Math.round(truth) + off, "a locked guess can't be changed");
check(jamie.state.round.guesses[alex.you].value === Math.round(truth) && jamie.state.players[0].score === 1, "guesses are revealed and the point awarded");

// Round 2: both pick the same number; the faster lock-in takes it.
await Promise.all([alex, jamie].map((p) => p.until(shown(2), "next round dealt")));
check(alex.state.round.result === null && alex.state.round.guesses[alex.you].value === 50, "next round is dealt automatically, bar back at 50");
truth = shareOf(alex.state.round.splats);
send(jamie, { type: "lock", round: 2, value: Math.round(truth) });
await sleep(250);
send(alex, { type: "lock", round: 2, value: Math.round(truth) });
await alex.until((p) => p.state.round.result, "round 2 settles");
check(alex.state.round.result.winnerId === jamie.you && alex.state.round.result.bySpeed === true, "a tie goes to whoever locked in first");

// Round 3: nobody locks in. Alex drags the bar and leaves it; Jamie never touches theirs.
await Promise.all([alex, jamie].map((p) => p.until(shown(3), "round 3 dealt")));
truth = shareOf(alex.state.round.splats);
const left = Math.round(truth) === 50 ? 49 : Math.round(truth);
send(alex, { type: "set", round: 3, value: 10 });
send(alex, { type: "set", round: 3, value: left });
await sleep(500);
check(jamie.state.round.guesses[alex.you].value === null && jamie.state.round.result === null, "moving the bar tells the rival nothing");
await alex.until((p) => p.state.round.result, "round 3 settles on the clock");
check(Date.now() + alex.offset >= alex.state.round.endsAt - 50, "an unlocked round runs the full five seconds");
const guesses = alex.state.round.guesses;
check(guesses[alex.you].value === left && guesses[alex.you].lockedAt === null, "time out: the bar counts where it was left");
check(guesses[jamie.you].value === 50 && guesses[jamie.you].lockedAt === null, "time out: an untouched bar is a 50-50 guess");
check(alex.state.players[0].score + alex.state.players[1].score === (alex.state.round.result.winnerId ? 3 : 2), "scores add up");

jamie.ws.close();
await alex.until((p) => p.state.players[1].connected === false, "disconnect noticed");
const jamieAgain = connect(code, "Jamie", jamie.token);
await jamieAgain.until((p) => p.state, "reconnect");
check(jamieAgain.you === jamie.you && jamieAgain.state.players[1].connected, "a dropped player can reconnect");
for (const p of [alex, jamieAgain, ghost, late]) p.ws.close();

console.log(`\nAll ${passed} checks passed.`);
process.exit(0);
