# Territory Guesser architecture

How the game is put together and why. The format is the one
[Matchless](https://github.com/adrnel/matchless) uses; this repository started as a copy of it with the rules swapped. For commands and day-to-day use, see the [README](../README.md).

## In one paragraph

Territory Guesser is a single program running on Cloudflare Workers. It serves the
pages, answers the game's requests and hosts the duel rooms. Leaderboard
scores and in-progress solo games live in a D1 database; each duel room
is a Durable Object. Everything is in one repository, and every push to `main`
is tested, deployed and then tested again on the live site. It all fits in
Cloudflare's free plan.

```
Browser ──HTTPS──▶ Worker (worker/index.ts)
                     ├─ /_next/static/*  ─▶ static files, served without running any code
                     ├─ pages + /api/*   ─▶ Next.js app (vinext) ─▶ D1 (scores, solo sessions)
                     └─ /api/rooms/:code/ws ─WebSocket─▶ Room Durable Object (one per room)
```

## What it replaced

The original game was one `index.html` on Vercel. It threw circles of paint,
counted the pixels and kept the high score entirely in the browser. That cannot support
a shared leaderboard (the browser could report any score) or a duel (two
players need the same board and a referee), so the board is now generated and
measured on the server and the browser only draws it.

## Cold starts

"Cold start" is the delay when nothing is running and something has to be
started before the first request can be answered. Most of the structure here
exists to make that delay too small to notice.

**1. Workers instead of a server process.** A traditional host starts a
container, boots Node, loads the app and opens a database connection; on a free
tier that is put to sleep, that can take many seconds. A Worker is a small
script loaded into an already-running JavaScript engine in the Cloudflare
location nearest the visitor. Our deploy output reports a startup time of about
14 ms, and there is nothing to keep warm and nothing that goes to sleep.

**2. No database connection to open.** D1 is reached through a *binding*: the
Worker calls `env.DB` directly. There is no connection string, no TLS handshake
to a database host, and no connection pool to fill on the first request. It
also means there are no database credentials anywhere in the code.

**3. Keep the startup work tiny.** Anything at the top level of a module runs
on every cold start, so nothing expensive lives there. The one piece of
start-up work is creating the database tables if they are missing
(`src/server/db.ts`). It runs once per Worker instance, on the first request
that touches the database, as a single batched call. The trade-off: that first
database request per instance is slightly slower, in exchange for never needing
a migration step locally, in tests or in production.

**4. Rooms sleep without dropping players.** A `Room` uses *hibernating
WebSockets*: when nobody has sent anything for a while, Cloudflare unloads the
room from memory but keeps both players' connections open. The next message
wakes it, it reloads its state from its own storage and carries on. So an idle
lobby costs nothing, and waking is a storage read rather than a server boot.
This is also why every change to a room is saved immediately: the in-memory
copy can disappear at any time.

**5. Timers that survive sleep.** The countdown, the pause between rounds and
room clean-up use the Durable Object *alarm*, not `setTimeout`. An alarm is
stored by Cloudflare and wakes the room when due, so a timer is never lost if
the room was unloaded in the meantime.

**6. Fewer round trips per action.** Latency a player feels is mostly network
round trips, so the game is arranged to need as few as possible:

- Answering a solo level is one request. The reply carries the result *and*
  the next board, so there is no second request to fetch it.
- That request does one database read and one write. The write is guarded
  (`WHERE level = ?`) so two simultaneous answers can't both count, without
  needing a transaction.
- Rate limiting uses Cloudflare's rate-limit binding, which is checked inside
  the Worker with no extra network call and no database write.
- A duel action is one WebSocket message in and one state message out.
- Dragging the bar sends its position about twelve times a second so the
  server knows where it was left if the clock runs out. Those messages are
  kept in the room's memory only: nothing is written and nothing is sent back.
  The position is saved with the next real change (a lock-in or the deadline).

**7. Don't wait for the server to show a reaction.** The bar moves and "Lock
In" takes effect on screen the instant it is pressed; the server's
confirmation arrives a moment later.

**8. A light first page.** Hashed JavaScript and CSS (`/_next/static/*`) are
served straight from Cloudflare's edge without running the Worker. The font is
bundled with the app rather than fetched from a third party. Sound effects are
generated in the browser, so there are no audio files to download.

### What this does not solve

- **D1 has one primary location.** The Worker runs near the player, but a
  database query still travels to wherever the database lives. A player far
  from it sees a slower answer check. D1 read replicas could help the
  leaderboard; they are not set up.
- **A room lives in one place.** It is created near whoever hosts it, so the
  other player may be the one with more lag. That is fine for a game with an
  event every few seconds; it matters for fast action games.

## Keeping the server in charge

Anything held in the browser can be read or changed by the player, so the
browser is treated as a display and an input device only.

- A board is a list of circles (`splats`) and a `cut`, made by the server
  (see [How a board is made](#how-a-board-is-made)). The server measures the
  split on a 320×180 grid (`shareOf` in `src/lib/game.ts`) and keeps that
  number to itself until the round is over. The browser works out the same
  grid and smooths it onto a canvas.
- A solo score is the number of levels cleared, counted by the server, which
  also keeps the lives. Each board dealt has a `turn` number, and an answer
  only counts for the current turn. A
  leaderboard entry is copied from the server's record of a finished run, and
  each run can be posted once.
- In a duel the board is not sent until the countdown ends, each player is
  sent their own view of the room so a rival's guess is hidden until the round
  is settled (only "they have locked in" is shared), and the room's clock
  decides the deadline and who locked in first.

Limit: the browser has to be given the circles to draw the map, so a script can
measure the board exactly as the server does (the smoke test does just that).
Server-side scoring stops made-up scores, not a bot. Per-IP rate limits (150
requests a minute; 12 a minute for starting games, posting scores and creating
rooms) slow that down.

## How a board is made

The first version threw hundreds of small flat circles, which looked speckled
and left the final split to chance. A second version drew soft circles of one
colour on a plain ground, which was smooth but lopsided: one colour was always
the round shapes and the other always the gaps between them. Boards are now
made so that both colours get the same treatment and the split is chosen:

1. Fill the board with one colour, then paint about 60 circles over it, mostly
   large. Each circle goes to whichever colour is short of its target share at
   that moment, so the two colours keep painting over each other. A colour
   bulges where it was painted on top and has a round bay where it was painted
   over.
2. Paint that onto a 320×180 grid and blur it. Each cell now holds a value
   from 0 (deep in colour 1) to 1 (deep in colour 0).
3. Pick the `cut`: the value above which a cell counts as colour 0. It is set
   to the value that gives exactly the wanted share of cells, so a level 1
   board is 60/40 to within a tenth of a point.

Blurring and cutting again rounds every corner, outward and inward, and
because the cut sits near the middle (0.5) it does so equally for both
colours. The browser is sent the circles and the cut, repeats steps 2 and 3,
and smooths the grid up to the screen. Generating and measuring a board takes
about 4 ms, inside the free plan's CPU limit.

## Duel rules

Each round both players see the same board and have five seconds (after one
second for the board to appear) to set a bar to the split they see.

- The bar starts at 50. A player who never touches it has guessed 50-50; one
  who moved it but did not lock in is judged on where they left it.
- When both have locked in the round is settled at once; otherwise at the
  deadline.
- Closest to the real split takes the round. If both are equally far out, the
  one who locked in first takes it, and running out the clock counts as
  slowest. If that can't separate them, nobody scores.
- First to 5 wins. Three rounds in a row that nobody touches end the match, so
  an abandoned room doesn't keep running.

## How the code is organised

The rule that makes the project easy to test and to reuse: **game rules are
plain functions with no Cloudflare code in them.**

| Layer | Files | Notes |
|---|---|---|
| Rules | `src/lib/game.ts`, `src/lib/room.ts`, `src/lib/periods.ts` | Generating and measuring a board, solo difficulty, every duel rule, leaderboard periods. Unit tested in `tests/`. |
| Server plumbing | `src/app/api/*`, `src/server/*` | Load state, call a rule, save, reply. `room-do.ts` is the Durable Object; `db.ts` holds the schema and queries; `http.ts` has JSON and rate-limit helpers. |
| Entry point | `worker/index.ts` | Sends WebSocket requests to the right room and everything else to the Next.js app. |
| Screens | `src/app/*/page.tsx` | Menu, play, leaderboard, host, join, room. |
| Look and feel | `src/components/*`, `src/lib/juice.ts`, `src/lib/sound.ts`, `src/app/globals.css` | Scene, the board canvas (`Turf`), the split bar, confetti, sounds. Nothing here knows the rules. |
| Config | `cloudflare.config.ts` | Worker name and the bindings: `DB`, `ROOM`, two rate limiters, static assets. |

Because the duel rules are pure (`join`, `start`, `setGuess`, `lock`, `tick`, …
each take the room state and the current time), the whole match flow is tested
without a network, a clock or Cloudflare.

## Data

**D1 (`territory-guess-db`)**

- `runs` — one row per solo run: current level and turn, lives left, the
  split of the board on screen, levels cleared, expiry. Abandoned rows are cleared out
  occasionally when new games start.
- `scores` — the leaderboard: name, score, when posted. Daily, weekly, monthly
  and all-time boards are all queries over this one table (calendar periods in
  UTC), ten per page, top 100.

**Durable Object storage** — each room's state. Deleted once the room has been
empty for 10 minutes.

**The player's browser** — their name, sound setting, personal best and the
"My Scores" list. Nothing personal is stored on the server beyond the name a
player chooses to post.

## Deployment

`.github/workflows/deploy.yml` runs on every push to `main`: type-check, unit
tests, deploy, then `scripts/smoke.mjs` against the live site. The smoke test
plays a solo run and three duel rounds through the real API, so a
deploy that breaks gameplay shows up as a failed run rather than a bug report.

The first deploy creates the D1 database and the room object automatically.
The only secret is `CLOUDFLARE_API_TOKEN` in the repository settings.

## Staying on the free plan

Each design choice above also keeps usage low: static files don't run the
Worker, a solo answer is one read and one write, idle rooms hibernate, and
rooms delete themselves. Durable Objects on the free plan must use
SQLite-backed storage, which is what `storage: "sqlite"` in the config selects.
Check Cloudflare's current limits before relying on specific numbers.
