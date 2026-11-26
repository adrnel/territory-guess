"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CheckIcon, CopyIcon, CrownIcon, GamepadIcon, HomeIcon, PeopleIcon, PlayIcon, TrophyIcon } from "@/components/Icons";
import Countdown from "@/components/Countdown";
import { Avatar } from "@/components/LeaderboardList";
import NavButton from "@/components/NavButton";
import Scene from "@/components/Scene";
import SplitBar, { type Marker } from "@/components/SplitBar";
import Turf from "@/components/Turf";
import { MAX_NAME_LENGTH } from "@/lib/game";
import { burst, celebrate } from "@/lib/juice";
import { DEFAULT_GUESS, GUESS_MS, isRoomCode, PAINT_MS, type ClientMessage, type PublicPlayer, type PublicRoom } from "@/lib/room";
import { play } from "@/lib/sound";
import { getName, saveName } from "@/lib/storage";
import { useRoom, useServerNow } from "@/lib/useRoom";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard blocked */ }
  }
  return <button type="button" className="btn btn-small" onClick={copy}><CopyIcon size={18} /> {copied ? "Copied!" : label}</button>;
}

function Lobby({ room, you, onStart, onReady, onUnready }: { room: PublicRoom; you: string; onStart: () => void; onReady: () => void; onUnready: () => void }) {
  const isHost = room.hostId === you;
  const full = room.players.length >= 2;
  const me = room.players.find((p) => p.id === you);
  const guest = room.players.find((p) => p.id !== room.hostId);
  const ready = full && !!guest?.ready;
  const empty = Math.max(0, room.maxPlayers - room.players.length);
  const [link, setLink] = useState("");
  useEffect(() => setLink(`${location.origin}/room/${room.code}`), [room.code]);

  return (
    <section className="panel panel-form panel-lobby">
      <h1 className="title title-row"><span className="title-icon"><GamepadIcon size={30} /></span> Duel Lobby</h1>
      <div className="code-bar">
        <span className="code-label">Room Code</span>
        <strong className="code" data-testid="room-code">{room.code}</strong>
        <CopyButton text={room.code} label="Copy Code" />
      </div>
      <div className="lobby-head">
        <h2><PeopleIcon size={24} /> Players ({room.players.length}/{room.maxPlayers})</h2>
        <CopyButton text={link} label="Copy Invite Link" />
      </div>
      <ul className="players">
        {room.players.map((player) => (
          <li key={player.id}>
            <Avatar name={player.name} />
            <span className="player-name">{player.name}{player.id === you && <small> (you)</small>}</span>
            {player.id === room.hostId
              ? <span className="chip chip-gold"><CrownIcon size={14} /> Host</span>
              : player.ready ? <span className="chip chip-green">✓ Ready</span>
              : <span className="chip chip-lilac">Not ready</span>}
          </li>
        ))}
        {Array.from({ length: empty }, (_, i) => <li key={`empty-${i}`} className="player-empty">Waiting for opponent…</li>)}
      </ul>
      <p className="lobby-status">
        {!full ? <><i className="spinner" /> Waiting for your opponent…</>
          : isHost ? (ready ? `${guest?.name} is ready — start when you are!` : <><i className="spinner" /> Waiting for {guest?.name} to ready up…</>)
          : me?.ready ? <><i className="spinner" /> You're ready — waiting for the host to start…</>
          : "Ready up to play!"}
      </p>
      {isHost && (
        <button type="button" className="btn btn-green btn-big" disabled={!ready} onClick={onStart}>
          <PlayIcon size={26} /> Start Game
        </button>
      )}
      {!isHost && (me?.ready
        ? <button type="button" className="btn btn-big" data-testid="unready" onClick={onUnready}>✕ Not Ready</button>
        : <button type="button" className="btn btn-green btn-big" data-testid="ready" onClick={onReady}>✓ Ready Up</button>)}
    </section>
  );
}

function Scoreboard({ room, you }: { room: PublicRoom; you: string }) {
  const round = room.round;
  return (
    <ul className="scoreboard" aria-label={`Scores — first to ${room.winScore} wins`}>
      {room.players.map((player) => (
        <li key={player.id} className={`${player.id === you ? "is-you" : ""}${player.connected ? "" : " is-away"}`}>
          <Avatar name={player.name} />
          <span className="player-name">{player.name}</span>
          {round && !round.result && round.guesses[player.id]?.lockedAt != null && <span className="chip chip-green" data-testid={`locked-${player.id}`}>Locked</span>}
          <b key={player.score} className={player.score > 0 ? "bump" : undefined}>{player.score}</b>
        </li>
      ))}
    </ul>
  );
}

/** How often the bar's position is sent while it is being dragged. */
const SEND_EVERY_MS = 80;

function Duel({ room, you, clockOffset, send }: { room: PublicRoom; you: string; clockOffset: number; send: (message: ClientMessage) => void }) {
  const round = room.round!;
  const now = useServerNow(clockOffset, !round.result);
  const rival = room.players.find((p) => p.id !== you);
  const mine = round.guesses[you];
  const result = round.result;
  const countdown = Math.max(0, round.startsAt - now);
  // The server holds the board back until the countdown ends.
  const waiting = round.splats.length === 0;
  const left = Math.max(0, Math.min(GUESS_MS, round.endsAt - now));

  const [value, setValue] = useState(DEFAULT_GUESS);
  // Locked the moment the button is pressed, without waiting for the server to say so.
  const [lockedRound, setLockedRound] = useState(0);
  const locked = lockedRound === round.number || mine?.lockedAt != null;
  const open = !waiting && !result && !locked && now < round.endsAt;
  const slider = useRef<HTMLInputElement>(null);
  const latest = useRef({ value: DEFAULT_GUESS, sentAt: 0, timer: 0 });

  // A new round starts with the bar back in the middle (or wherever the server has it after a reconnect).
  useEffect(() => {
    const initial = mine?.value ?? DEFAULT_GUESS;
    setValue(initial);
    latest.current.value = initial;
    return () => window.clearTimeout(latest.current.timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.number]);
  useEffect(() => { if (!waiting) slider.current?.focus({ preventScroll: true }); }, [waiting, round.number]);

  // The server uses the last position it was told about if time runs out, so
  // keep it posted while the bar moves, but not on every pixel.
  const move = useCallback((next: number) => {
    setValue(next);
    const state = latest.current;
    state.value = next;
    window.clearTimeout(state.timer);
    const flush = () => { state.sentAt = Date.now(); send({ type: "set", round: round.number, value: state.value }); };
    const wait = SEND_EVERY_MS - (Date.now() - state.sentAt);
    if (wait <= 0) flush();
    else state.timer = window.setTimeout(flush, wait);
  }, [send, round.number]);

  const lockIn = useCallback(() => {
    window.clearTimeout(latest.current.timer);
    setLockedRound(round.number);
    play("tap");
    send({ type: "lock", round: round.number, value: latest.current.value });
  }, [send, round.number]);

  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat || event.target instanceof HTMLButtonElement) return;
      if (openRef.current) lockIn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lockIn]);

  if (waiting) {
    return (
      <section className="panel panel-game">
        <h1 className="mode-pill"><PeopleIcon size={20} /> First to {room.winScore}</h1>
        <Scoreboard room={room} you={you} />
        <Countdown remainingMs={countdown} />
      </section>
    );
  }

  let status = null;
  let markers: Marker[] = [];
  if (result) {
    const theirs = rival ? round.guesses[rival.id] : undefined;
    const off = (guess: number | null | undefined) => guess == null ? "" : ` (off by ${Math.abs(guess - result.share).toFixed(1)})`;
    markers = [
      ...(mine?.value != null ? [{ label: "You", value: mine.value, tone: "you" as const }] : []),
      ...(theirs?.value != null ? [{ label: rival!.name, value: theirs.value, tone: "rival" as const }] : []),
    ];
    const why = result.bySpeed ? " — equally close, faster lock-in" : "";
    status = result.winnerId === you
      ? <span className="toast toast-good" data-testid="round-result"><CheckIcon size={24} /> You take the round{why}<em>{off(mine?.value).trim()}</em></span>
      : result.winnerId
        ? <span className="toast toast-rival" data-testid="round-result">{rival?.name ?? "Opponent"} takes the round{why}<em>{off(theirs?.value).trim()}</em></span>
        : <span className="toast toast-rival" data-testid="round-result">Dead heat — nobody scores</span>;
  } else if (locked) {
    status = <span className="toast toast-good"><CheckIcon size={24} /> Locked in at {value}% — waiting for {rival?.name ?? "your opponent"}…</span>;
  }

  return (
    <section className="panel panel-game">
      <h1 className="mode-pill"><PeopleIcon size={20} /> Round {round.number} · First to {room.winScore}</h1>
      <Scoreboard room={room} you={you} />
      <Turf pair={round.pair} splats={round.splats} />
      {result ? <>
        <p className="prompt">The real split</p>
        <SplitBar pair={round.pair} value={result.share} markers={markers} />
        {mine?.lockedAt == null && <p className="lb-hint">Time ran out, so your bar counted where you left it.</p>}
      </> : <>
        <div className={`timer${left <= 2000 ? " is-low" : ""}`} role="timer" aria-label={`${Math.ceil(left / 1000)} seconds left`}>
          <i style={{ width: `${(left / GUESS_MS) * 100}%` }} />
          <b data-testid="timer">{now < round.startsAt + PAINT_MS ? "Get set…" : `${(left / 1000).toFixed(1)}s`}</b>
        </div>
        <p className="prompt">Set the bar to the split you see</p>
        <SplitBar pair={round.pair} value={value} onChange={move} disabled={!open} inputRef={slider} />
        <button type="button" className="btn btn-yellow btn-big" data-testid="lock" data-quiet disabled={!open} onClick={lockIn}>
          {locked ? "Locked in" : "Lock In"}
        </button>
      </>}
      <div className="status" role="status" aria-live="polite">{status}</div>
    </section>
  );
}

function Finished({ room, you, onRematch, onReady, onUnready }: { room: PublicRoom; you: string; onRematch: () => void; onReady: () => void; onUnready: () => void }) {
  const winner = room.players.find((p) => p.id === room.winnerId);
  const ranked = [...room.players].sort((a: PublicPlayer, b: PublicPlayer) => b.score - a.score);
  const isHost = room.hostId === you;
  const me = room.players.find((p) => p.id === you);
  const opponent = room.players.find((p) => p.id !== you);
  const opponentHere = !!opponent?.connected;
  const opponentReady = opponentHere && !!opponent?.ready;
  return (
    <section className="panel panel-form">
      <h1 className="banner"><TrophyIcon size={34} className="gold" /> {!winner ? "It\u2019s a draw" : winner.id === you ? "You win!" : `${winner.name} wins!`}</h1>
      {!winner && <p className="lead">Nobody was playing, so the match was called off.</p>}
      <ol className="lb-list final-scores">
        {ranked.map((player, i) => (
          <li key={player.id} className={`lb-row${i === 0 && winner ? " lb-top lb-top-1" : ""}${player.id === you ? " lb-mine" : ""}`}>
            <span className="lb-rank">{i + 1}</span>
            <Avatar name={player.name} />
            <span className="lb-name">{player.name}</span>
            {player.id === you && <span className="chip chip-purple">You</span>}
            {!player.connected ? <span className="chip chip-lilac">Left</span>
              : player.id !== room.hostId && player.ready && <span className="chip chip-green">Ready</span>}
            <span className="lb-score">{player.score}</span>
          </li>
        ))}
      </ol>
      <p className="lobby-status">
        {!opponentHere ? `${opponent?.name ?? "Your opponent"} has left the room.`
          : isHost ? (opponentReady ? `${opponent?.name} is ready for a rematch!` : <><i className="spinner" /> Waiting for {opponent?.name} to ready up…</>)
          : me?.ready ? <><i className="spinner" /> You're ready — waiting for {opponent?.name} to start…</>
          : "Ready up for a rematch!"}
      </p>
      <div className="actions">
        <NavButton href="/" className="btn"><HomeIcon size={24} /> Back to Menu</NavButton>
        {isHost && (opponentHere
          ? <button type="button" className="btn btn-yellow btn-big" disabled={!opponentReady} onClick={onRematch}><PlayIcon size={26} /> Play Again</button>
          : <button type="button" className="btn btn-yellow btn-big" onClick={onRematch}>Back to Lobby</button>)}
        {!isHost && opponentHere && (me?.ready
          ? <button type="button" className="btn btn-big" data-testid="unready" onClick={onUnready}>✕ Not Ready</button>
          : <button type="button" className="btn btn-green btn-big" data-testid="ready" onClick={onReady}>✓ Ready Up</button>)}
      </div>
    </section>
  );
}

function NamePrompt({ code, onName }: { code: string; onName: (name: string) => void }) {
  const [name, setName] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    saveName(clean);
    onName(clean);
  }
  return (
    <section className="panel panel-form">
      <h1 className="title">Join a Duel</h1>
      <p className="lead">You've been invited to room <b>{code}</b>. What should we call you?</p>
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>Your name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname"
            placeholder="Enter your name" maxLength={MAX_NAME_LENGTH} required autoFocus />
        </label>
        <button className="btn btn-purple btn-big" type="submit" disabled={!name.trim()}><PeopleIcon size={28} /> Join</button>
      </form>
    </section>
  );
}

function RoomView({ code, name }: { code: string; name: string }) {
  const { room, you, connection, error, clockOffset, send } = useRoom(code, name);

  // Sounds and effects for things that just happened.
  const heard = useRef("");
  useEffect(() => {
    if (!room) return;
    const round = room.round;
    const key = `${room.phase}:${round?.number ?? 0}:${round?.splats.length ? 1 : 0}:${round?.result ? 1 : 0}`;
    if (key === heard.current) return;
    const before = heard.current;
    heard.current = key;
    if (!before) return; // just connected: nothing "just happened"
    if (room.phase === "finished") {
      play("win");
      if (room.winnerId === you) celebrate();
    } else if (round?.result) {
      if (round.result.winnerId === you) { play("great"); burst(document.querySelector(".split-track"), 24); }
      else play(round.result.winnerId ? "wrong" : "ok");
    } else if (room.phase === "playing" && round?.splats.length) {
      play("go"); // a board just appeared
    }
  }, [room, you]);

  if (error) {
    return (
      <section className="panel panel-form">
        <h1 className="title">Oops!</h1>
        <p className="error" role="alert">{error}</p>
        <div className="actions">
          <NavButton href="/" className="btn"><HomeIcon size={24} /> Back to Menu</NavButton>
          <NavButton href="/join" className="btn btn-purple">Join another game</NavButton>
        </div>
      </section>
    );
  }
  if (!room) return <section className="panel panel-form"><p className="note loading">Connecting to room {code}…</p></section>;

  return (
    <>
      {connection === "reconnecting" && <p className="reconnect" role="status"><i className="spinner" /> Reconnecting…</p>}
      {room.phase === "lobby" && <Lobby room={room} you={you} onStart={() => send({ type: "start" })} onReady={() => send({ type: "ready" })} onUnready={() => send({ type: "unready" })} />}
      {room.phase === "playing" && room.round && <Duel room={room} you={you} clockOffset={clockOffset} send={send} />}
      {room.phase === "finished" && <Finished room={room} you={you} onRematch={() => send({ type: "rematch" })} onReady={() => send({ type: "ready" })} onUnready={() => send({ type: "unready" })} />}
    </>
  );
}

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = String(params?.code ?? "").toUpperCase();
  const [name, setName] = useState<string | null>(null);
  useEffect(() => setName(getName()), []);

  return (
    <Scene>
      {!isRoomCode(code) ? (
        <section className="panel panel-form">
          <h1 className="title">Oops!</h1>
          <p className="error" role="alert">That isn't a valid room code.</p>
          <div className="actions"><NavButton href="/join" className="btn btn-purple">Enter a room code</NavButton></div>
        </section>
      ) : name === null ? null
        : name ? <RoomView code={code} name={name} />
        : <NamePrompt code={code} onName={setName} />}
    </Scene>
  );
}
