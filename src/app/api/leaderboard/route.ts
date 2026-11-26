import { isPeriod, MAX_RANKED, PAGE_SIZE, pageCount, periodStart } from "@/lib/periods";
import { getDb, rankedEntry, topScores } from "@/server/db";
import { json, rateLimited } from "@/server/http";

/**
 * One page (10) of the top 100 for a period.
 *   ?period=day|week|month|all (default all)   ?page=1..10
 *   ?entry=<id> also returns that entry's rank within the period, if it falls in it.
 */
export async function GET(request: Request) {
  const limited = await rateLimited(request, "api");
  if (limited) return limited;
  try {
    const params = new URL(request.url).searchParams;
    const rawPeriod = params.get("period") ?? "all";
    if (!isPeriod(rawPeriod)) return json({ error: "Unknown period" }, 400);
    const since = periodStart(rawPeriod, Date.now());
    const requested = Number(params.get("page") ?? 1);
    const entryId = Number(params.get("entry"));

    const db = await getDb();
    const wanted = Number.isInteger(requested) && requested >= 1 ? Math.min(requested, MAX_RANKED / PAGE_SIZE) : 1;
    let { entries, total } = await topScores(db, since, wanted, PAGE_SIZE, MAX_RANKED);
    const pages = pageCount(total);
    const page = Math.min(wanted, pages);
    if (page !== wanted) ({ entries, total } = await topScores(db, since, page, PAGE_SIZE, MAX_RANKED));
    const me = Number.isInteger(entryId) && entryId > 0 ? await rankedEntry(db, entryId, since) : null;
    return json({ period: rawPeriod, page, pages, total, pageSize: PAGE_SIZE, entries, me });
  } catch (error) {
    console.error("Leaderboard query failed", error);
    return json({ error: "Leaderboard unavailable" }, 500);
  }
}
