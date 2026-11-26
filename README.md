# Turf War Guesser

Two inks are splattered over a board. Work out who covered more.

- **Solo Run** — pick the colour with more turf. Each level the two are closer
  together; a wrong pick ends the run. Your score is the number of levels
  cleared, and it can go on the global leaderboard.
- **Duel** — share a 6-character room code or invite link with a friend. Each
  round you both see the same board and have five seconds to set a bar to the
  split you think it is. Closest wins the round; first to 5 wins.

Duel details: the bar starts at 50-50, and if the five seconds run out your bar
counts wherever you left it. If both players are equally close, whoever locked
in first takes the round. Players who drop out can reconnect.

The leaderboard shows the top 100 for today, this week, this month and all time
(calendar periods in UTC; weeks start on Monday), ten per page, plus a "My
Scores" tab kept on the player's own device.

Scores can't be made up by the browser: the server throws each board, measures
the split, keeps it to itself until you have guessed, and counts the levels.

Everything runs on **Cloudflare's free plan**, in the same format as
[Matchless](https://github.com/adrnel/matchless).

| Part | Technology |
|---|---|
| App | Next.js (App Router) + React + TypeScript, run on Workers by [vinext](https://vinext.dev) |
| Hosting + API | Cloudflare Workers |
| Leaderboard + solo runs | Cloudflare D1 (`territory-guess-db`, binding `DB`) |
| Duel rooms | One SQLite-backed Durable Object per room (`Room`), hibernating WebSockets |
| Abuse control | Workers rate-limit bindings, per IP |

For how it is built and why, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Run it locally

Requires Node.js 22.18+.

```bash
npm install
npm run dev        # http://localhost:3001 — real D1 and Durable Objects, simulated locally
```

No database setup is needed: the tables are created automatically on first use.
Local data lives in `.wrangler/` (delete it to reset).

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` / `npm run preview` | Production build / serve it locally |
| `npm test` | Unit tests for the turf and duel rules |
| `npm run smoke` | End-to-end test of a running instance (`npm run smoke -- https://your-url` for a deployment) |
| `npm run typecheck` | Generate Worker types and type-check |
| `npm run deploy` | Build and deploy to Cloudflare |

## Deploy to Cloudflare

This game needs WebSockets, a database and Durable Objects, so it is deployed
as a Cloudflare Worker (`territory-guess`) rather than as a static site.

**Automatic:** every push to `main` runs `.github/workflows/deploy.yml`, which
type-checks, runs the unit tests, deploys, then runs the smoke test against the
live site. It needs one repository secret, `CLOUDFLARE_API_TOKEN` (GitHub →
Settings → Secrets and variables → Actions): a Cloudflare API token from the
"Edit Cloudflare Workers" template with **D1 → Edit** added.

**By hand:**

```bash
npx cf auth login   # once, opens the browser
npm run deploy
```

The D1 database and the `Room` Durable Object are created by the first deploy;
nothing has to be set up by hand.

## Project layout

```
cloudflare.config.ts     Worker name, bindings (D1, Durable Object, rate limits)
worker/index.ts          Worker entry: WebSocket route → Room, everything else → Next.js
src/lib/game.ts          Throwing a board, measuring the split, solo difficulty
src/lib/room.ts          Duel rules as pure functions (unit tested)
src/server/room-do.ts    Room Durable Object: sockets, storage, timers
src/server/db.ts         D1 schema + leaderboard queries
src/app/api/…            Solo run, score, leaderboard and room-creation endpoints
src/app/…                Screens: menu, play, leaderboard, host, join, room/[code]
src/components/…         Scene, board canvas (Turf), split bar, icons, leaderboard list
scripts/smoke.mjs        End-to-end test
tests/                   Unit tests
```

## API

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/game/start` | Start a solo run; returns the first board (never the split) |
| POST | `/api/game/answer` | `{ gameId, level, choice }` (choice `0` or `1`) → result, the split, next board |
| POST | `/api/score` | `{ gameId, name }` → post a finished run to the leaderboard |
| GET | `/api/leaderboard` | Top 100, 10 per page: `?period=day\|week\|month\|all&page=1` (`&entry=<id>` also returns that entry's rank in the period) |
| POST | `/api/rooms` | Create a duel room; returns its code |
| WS | `/api/rooms/:code/ws?token=…&name=…` | Join a room |

## Known limits

- The browser is sent the circles so it can draw them, which means a script
  can measure a board as exactly as the server does. Server-side scoring stops
  fake scores but not a bot. Rate limits slow this down; they don't prevent it.
- The split is measured on a 320×180 grid, so the last decimal place can
  differ slightly from what a pixel-perfect count of your screen would give.
