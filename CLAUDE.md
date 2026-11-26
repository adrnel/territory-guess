# Territory Guesser — project notes for Claude

Guess-the-split map game. One repo: Next.js (App Router) + React + TypeScript,
run on Cloudflare Workers via vinext; D1 for the leaderboard and solo runs; a
SQLite-backed Durable Object (`Room`) per duel room. Same format as
`adrnel/matchless`. See README.md, and docs/ARCHITECTURE.md for the design and
the reasons behind it (keep it current when the architecture changes).

## Rules
- Cloudflare **Free plan only**. Don't add paid services or bindings.
- Never commit tokens, `.env*` or `.dev.vars*`. Don't ask for credentials in chat.
- The server is authoritative: never send a board's `share` before the round
  is resolved, never send one duel player the other's guess before then, and
  never accept scores from the client.

## Working on it
- `npm run dev` (port 3001), `npm test`, `npm run typecheck`, `npm run build`.
- `npm run smoke` runs the end-to-end check against a running instance — run it
  after any change to the API, the Room object or `worker/index.ts`.
- Config is `cloudflare.config.ts` (the `cf` CLI), not `wrangler.jsonc`.
- D1 schema lives in `src/server/db.ts` and is applied on first use; change it
  with additive, idempotent statements.
- Board and duel rules belong in `src/lib/game.ts` and `src/lib/room.ts` (pure,
  unit tested); `src/server/room-do.ts` should stay a thin wrapper.
- `scripts/smoke.mjs` imports `src/lib/game.ts` directly, so keep that file to
  plain erasable TypeScript with no imports.

## Shipping
- The owner has asked for finished work to be merged to `main` without asking
  each time (requested 2026-11-26). Once tests, type-check and the smoke test
  pass, merge to `main` and push; that push deploys to Cloudflare.
