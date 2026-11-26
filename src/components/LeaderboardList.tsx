import { avatarColor } from "@/lib/game";
import { CrownIcon } from "./Icons";

export type Entry = { id: number; name: string; score: number; ts: number };
export type RankedEntry = Entry & { rank: number };

/** A blob of ink in the player's colour, with their initial. */
export function Avatar({ name }: { name: string }) {
  return <span className="lb-avatar" style={{ background: avatarColor(name) }} aria-hidden="true">{[...name.trim()][0]?.toUpperCase() ?? "?"}</span>;
}

function Row({ entry, rank, mine, plain, order }: { entry: Entry; rank: number; mine: boolean; plain?: boolean; order: number }) {
  return (
    <li className={`lb-row${rank <= 3 ? ` lb-top lb-top-${rank}` : ""}${mine ? " lb-mine" : ""}`} style={{ animationDelay: `${order * 35}ms` }}>
      <span className="lb-rank">{rank}</span>
      {!plain && <Avatar name={entry.name} />}
      <span className="lb-name">{entry.name}</span>
      {mine && <span className="chip chip-purple"><CrownIcon size={14} /> You</span>}
      <span className="lb-score">{entry.score.toLocaleString("en")}</span>
    </li>
  );
}

type Props = {
  entries: Entry[];
  me?: RankedEntry | null;
  limit?: number;
  /** Rank of the first entry shown (for pages after the first). */
  startRank?: number;
  /** No avatars (used for the list of your own scores). */
  plain?: boolean;
  empty?: string;
};

/** A list of scores, with the player's own row pinned underneath if it isn't in view. */
export default function LeaderboardList({ entries, me, limit = entries.length, startRank = 1, plain, empty = "No scores yet. Be the first!" }: Props) {
  const shown = entries.slice(0, limit);
  const meShown = !!me && shown.some((entry) => entry.id === me.id);
  if (shown.length === 0 && !me) return <p className="note">{empty}</p>;
  return (
    <ol className="lb-list">
      {shown.map((entry, i) => <Row key={entry.id} entry={entry} rank={startRank + i} mine={entry.id === me?.id} plain={plain} order={i} />)}
      {me && !meShown && <>
        <li className="lb-gap" aria-hidden="true">• • •</li>
        <Row entry={me} rank={me.rank} mine plain={plain} order={shown.length} />
      </>}
    </ol>
  );
}
