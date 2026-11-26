"use client";

import { useEffect, useState } from "react";
import { BackIcon, ChevronIcon, HomeIcon, PlayIcon, TrophyIcon } from "@/components/Icons";
import LeaderboardList, { type Entry, type RankedEntry } from "@/components/LeaderboardList";
import NavButton from "@/components/NavButton";
import Scene from "@/components/Scene";
import { PAGE_SIZE, PERIOD_LABELS, PERIODS, pageCount, type Period } from "@/lib/periods";
import { getMyEntryId, getMyScores, type MyScore } from "@/lib/storage";

type Tab = Period | "mine";
type Payload = { entries: Entry[]; me: RankedEntry | null; page: number; pages: number; total: number; error?: string };

const TABS: { id: Tab; label: string }[] = [
  ...PERIODS.map((id) => ({ id, label: PERIOD_LABELS[id] })),
  { id: "mine", label: "My Scores" },
];

const dateLabel = (ts: number) => ts > 0
  ? new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
  : "Earlier best";

export default function LeaderboardPage() {
  const [tab, setTab] = useState<Tab>("day");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [mine, setMine] = useState<MyScore[]>([]);

  useEffect(() => setMine(getMyScores()), []);

  useEffect(() => {
    if (tab === "mine") return;
    let cancelled = false;
    setError("");
    const params = new URLSearchParams({ period: tab, page: String(page) });
    const entryId = getMyEntryId();
    if (entryId) params.set("entry", String(entryId));
    fetch(`/api/leaderboard?${params}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as Payload;
        if (!response.ok) throw new Error(payload.error || "Leaderboard unavailable");
        if (!cancelled) setData(payload);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Leaderboard unavailable"); });
    return () => { cancelled = true; };
  }, [tab, page]);

  function choose(next: Tab) {
    if (next === tab) return;
    setTab(next);
    setPage(1);
    setData(null);
  }

  const pages = tab === "mine" ? pageCount(mine.length) : data?.pages ?? 1;
  const current = Math.min(page, pages);
  const start = (current - 1) * PAGE_SIZE;

  return (
    <Scene>
      <section className="panel panel-wide panel-board">
        <h1 className="banner"><TrophyIcon size={34} className="gold" /> Leaderboard <TrophyIcon size={34} className="gold" /></h1>
        <div className="tabs" role="tablist" aria-label="Leaderboard period">
          {TABS.map(({ id, label }) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} data-tab={id}
              className={`tab${tab === id ? " is-active" : ""}${id === "mine" ? " tab-mine" : ""}`} onClick={() => choose(id)}>{label}</button>
          ))}
        </div>
        <div className="lb-page" key={`${tab}-${current}`}>
          {tab === "mine" ? (
            <LeaderboardList plain startRank={start + 1} empty="Finish a solo run and your scores will appear here."
              entries={mine.slice(start, start + PAGE_SIZE).map((s, i) => ({ id: start + i, name: dateLabel(s.ts), score: s.score, ts: s.ts }))} />
          ) : error ? <p className="error" role="alert">{error}</p>
            : !data ? <p className="note loading">Loading scores…</p>
            : <LeaderboardList entries={data.entries} me={data.me} startRank={start + 1}
                empty={tab === "all" ? "No scores yet. Be the first!" : `No scores ${PERIOD_LABELS[tab].toLowerCase()} yet. Be the first!`} />}
        </div>
        {pages > 1 && (
          <div className="pager">
            <button type="button" className="icon-btn pager-btn" aria-label="Previous page" disabled={current <= 1} onClick={() => setPage(current - 1)}><BackIcon size={22} /></button>
            <span data-testid="page">Page <b>{current}</b> of {pages}</span>
            <button type="button" className="icon-btn pager-btn" aria-label="Next page" disabled={current >= pages} onClick={() => setPage(current + 1)}><ChevronIcon size={22} /></button>
          </div>
        )}
        {tab !== "mine" && tab !== "all" && <p className="lb-hint">Resets at midnight UTC{tab === "week" ? " on Monday" : tab === "month" ? " on the 1st" : ""}</p>}
        {tab === "mine" && mine.length > 0 && <p className="lb-hint">Saved on this device only</p>}
        <div className="actions">
          <NavButton href="/" className="btn"><HomeIcon size={24} /> Back to Menu</NavButton>
          <NavButton href="/play" className="btn btn-yellow btn-big"><PlayIcon size={26} /> Play</NavButton>
        </div>
      </section>
    </Scene>
  );
}
