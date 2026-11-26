"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { CheckIcon, CrownIcon, HomeIcon, PlayIcon, StarIcon, TargetIcon, TrophyIcon } from "@/components/Icons";
import LeaderboardList, { type Entry, type RankedEntry } from "@/components/LeaderboardList";
import NavButton from "@/components/NavButton";
import Scene from "@/components/Scene";
import SplitBar from "@/components/SplitBar";
import Turf from "@/components/Turf";
import { COLOR_PAIRS, MAX_NAME_LENGTH, START_LIVES, type PublicRound } from "@/lib/game";
import { burst, celebrate, useCountUp } from "@/lib/juice";
import { play } from "@/lib/sound";
import { addMyScore, getBest, getName, saveBest, saveMyEntryId, saveName } from "@/lib/storage";

type Choice = 0 | 1;
type Feedback = { choice: Choice; correct: boolean; share: number };
type AnswerPayload = { correct: boolean; share: number; score: number; lives: number; finished: boolean; nextRound?: PublicRound };

async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, body === undefined ? { cache: "no-store" } : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

/** The final score, counting up from zero. */
function FinalScore({ score }: { score: number }) {
  const [target, setTarget] = useState(0);
  useEffect(() => setTarget(score), [score]);
  const shown = useCountUp(target, 900, 250);
  return <p className="score-value" data-testid="final-score" data-final={score}>{shown.toLocaleString("en")}</p>;
}

export default function PlayPage() {
  const [gameId, setGameId] = useState("");
  const [round, setRound] = useState<PublicRound | null>(null);
  const [nextRound, setNextRound] = useState<PublicRound | null>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(START_LIVES);
  const [best, setBest] = useState(0);
  const [previousBest, setPreviousBest] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState("");
  // The colour just pressed, shown instantly while the server checks the answer.
  const [pending, setPending] = useState<Choice | null>(null);

  const [name, setName] = useState("");
  const [posting, setPosting] = useState(false);
  const [me, setMe] = useState<RankedEntry | null>(null);
  const [rankToday, setRankToday] = useState<number | null>(null);
  const [top, setTop] = useState<Entry[]>([]);

  // Guards against double clicks / key repeats while a request is in flight.
  const busy = useRef(false);
  const started = useRef(false);

  const start = useCallback(async () => {
    busy.current = true;
    setError(""); setFeedback(null); setFinished(false); setMe(null); setRound(null); setNextRound(null); setScore(0); setLives(START_LIVES);
    try {
      const data = await api<{ gameId: string; lives: number; round: PublicRound }>("/api/game/start", {});
      setGameId(data.gameId);
      setLives(data.lives);
      setRound(data.round);
      busy.current = false;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start a game.");
    }
  }, []);

  useEffect(() => {
    setBest(getBest());
    setName(getName());
    if (started.current) return;
    started.current = true;
    void start();
  }, [start]);

  const choose = useCallback(async (choice: Choice) => {
    if (!round || feedback || busy.current) return;
    busy.current = true;
    setPending(choice);
    play("tap");
    setError("");
    try {
      const result = await api<AnswerPayload>("/api/game/answer", { gameId, turn: round.turn, choice });
      setFeedback({ choice, correct: result.correct, share: result.share });
      setScore(result.score);
      setLives(result.lives);
      setNextRound(result.nextRound ?? null);
      if (result.correct) {
        play("great", result.score);
        burst(document.querySelector(`[data-choice="${choice}"]`), 22);
      } else {
        play("wrong");
      }
      if (result.finished) {
        const old = getBest();
        setPreviousBest(old);
        if (result.score > 0) addMyScore(result.score);
        if (result.score > old) { saveBest(result.score); setBest(result.score); }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your answer.");
    } finally {
      setPending(null);
      busy.current = false;
    }
  }, [gameId, round, feedback]);

  /** After a result: on to the next board, or to the results screen if the run is over. */
  const advance = useCallback(() => {
    if (!feedback) return;
    if (nextRound) {
      setRound(nextRound);
      setNextRound(null);
      setFeedback(null);
      return;
    }
    setFinished(true);
    play("win");
    if (score > previousBest) celebrate();
    api<{ entries: Entry[] }>("/api/leaderboard").then((data) => setTop(data.entries)).catch(() => {});
  }, [feedback, nextRound, score, previousBest]);

  // Keyboard: 1 / ← and 2 / → pick a colour, Enter moves on.
  useEffect(() => {
    if (!round || finished) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "1" || event.key === "ArrowLeft") void choose(0);
      else if (event.key === "2" || event.key === "ArrowRight") void choose(1);
      else if (event.key === "Enter" && feedback && !(event.target instanceof HTMLButtonElement)) advance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [round, finished, feedback, choose, advance]);

  async function postScore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = name.trim();
    if (!clean || posting || me) return;
    setPosting(true); setError("");
    try {
      const data = await api<{ entry: RankedEntry; rankToday: number | null }>("/api/score", { gameId, name: clean });
      setRankToday(data.rankToday);
      saveName(clean);
      saveMyEntryId(data.entry.id);
      setMe(data.entry);
      const board = await api<{ entries: Entry[] }>("/api/leaderboard");
      setTop(board.entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save your score.");
    } finally {
      setPosting(false);
    }
  }

  if (finished) {
    const isBest = score > previousBest;
    return (
      <Scene>
        <section className="panel panel-wide">
          <h1 className="banner"><TrophyIcon size={30} className="gold" /> Run over</h1>
          <div className="results">
            <div className="score-card">
              {isBest
                ? <p className="ribbon"><CrownIcon size={18} /> New personal best!</p>
                : <p className="ribbon ribbon-plain">Out of lives on level {score + 1}</p>}
              <p className="score-label">Levels cleared</p>
              <FinalScore score={score} />
              {isBest && previousBest > 0 && <p className="chip chip-green">▲ +{score - previousBest} on your previous best</p>}
              {!isBest && <p className="chip chip-lilac">Personal best: {best.toLocaleString("en")}</p>}
            </div>
            <div className="results-side">
              {!me && score > 0 && (
                <form onSubmit={postScore} className="name-form">
                  <label htmlFor="player-name">Add your name to the leaderboard</label>
                  <div className="name-row">
                    <input id="player-name" className="input" placeholder="Your name" value={name} autoComplete="nickname"
                      onChange={(e) => setName(e.target.value)} maxLength={MAX_NAME_LENGTH} required />
                    <button className="btn btn-purple" type="submit" disabled={posting || !name.trim()}>
                      {posting ? "Saving…" : "Save Score"}
                    </button>
                  </div>
                </form>
              )}
              {!me && score === 0 && <p className="note note-small">Clear at least one level to get on the leaderboard.</p>}
              {me && <p className="saved"><CheckIcon size={22} /> Score saved — {rankToday ? `#${rankToday} today, ` : ""}#{me.rank} all time!</p>}
              <LeaderboardList entries={top} me={me} limit={me ? 5 : 4} />
            </div>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            <NavButton href="/" className="btn"><HomeIcon size={22} /> Back to Menu</NavButton>
            <button type="button" className="btn btn-yellow btn-big" onClick={() => void start()}><PlayIcon size={24} /> Play Again</button>
          </div>
        </section>
      </Scene>
    );
  }

  const colors = COLOR_PAIRS[round?.pair ?? 0];
  return (
    <Scene>
      <section className="panel panel-game">
        <div className="stats">
          <span><TargetIcon size={20} /> Level <b data-testid="level">{round?.level ?? 1}</b></span>
          <span>Lives <b className="lives" data-testid="lives" data-lives={lives} aria-label={`${lives} of ${START_LIVES}`}>
            {Array.from({ length: START_LIVES }, (_, i) => <i key={i} className={i < lives ? "is-left" : undefined}>♥</i>)}
          </b></span>
          <span><StarIcon size={20} className="gold" /> Cleared <b data-testid="score" data-score={score}>{score}</b></span>
          <span><TrophyIcon size={20} className="gold" /> Best <b>{Math.max(best, score)}</b></span>
        </div>
        {round ? <>
          <Turf pair={round.pair} splats={round.splats} cut={round.cut} />
          {!feedback ? <>
            <p className="prompt">Which colour takes up more territory?</p>
            <div className="choices">
              {([0, 1] as const).map((choice) => (
                <button key={choice} type="button" data-choice={choice} data-quiet
                  className={`btn btn-big btn-ink${pending === choice ? " is-picked" : ""}`}
                  style={{ "--ink": colors[choice] } as CSSProperties} disabled={pending !== null}
                  aria-label={choice === 0 ? "Left colour" : "Right colour"} onClick={() => void choose(choice)}>
                  <i className="swatch" /> This colour <kbd>{choice + 1}</kbd>
                </button>
              ))}
            </div>
          </> : <>
            <SplitBar pair={round.pair} value={feedback.share} />
            <div className="status" role="status" aria-live="polite">
              {feedback.correct
                ? <span className="toast toast-good" data-testid="verdict"><CheckIcon size={24} /> Correct!</span>
                : <span className="toast toast-bad" data-testid="verdict">✕ Wrong — {lives === 0 ? "that was your last life" : lives === 1 ? "1 life left" : `${lives} lives left`}</span>}
            </div>
            <button type="button" className="btn btn-yellow btn-big" data-testid="advance" autoFocus onClick={advance}>
              {!nextRound ? "See Results" : feedback.correct ? <><PlayIcon size={24} /> Next Level</> : <><PlayIcon size={24} /> Try Another</>}
            </button>
          </>}
        </> : !error && <p className="note loading">Drawing the first map…</p>}
        {error && <>
          <p className="error" role="alert">{error}</p>
          <button type="button" className="btn btn-purple" onClick={() => void start()}>Start a new game</button>
        </>}
      </section>
    </Scene>
  );
}
