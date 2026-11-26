"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { PeopleIcon } from "@/components/Icons";
import Scene from "@/components/Scene";
import { MAX_NAME_LENGTH } from "@/lib/game";
import { WIN_SCORE } from "@/lib/room";
import { getName, saveName } from "@/lib/storage";

export default function HostPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setName(getName()), []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = name.trim();
    if (!clean || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/rooms", { method: "POST" });
      const data = await response.json() as { code?: string; error?: string };
      if (!response.ok || !data.code) throw new Error(data.error || "Couldn't create a room.");
      saveName(clean);
      router.push(`/room/${data.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create a room.");
      setBusy(false);
    }
  }

  return (
    <Scene>
      <section className="panel panel-form">
        <h1 className="title">Host a Duel</h1>
        <p className="lead">Create a room and share the code with a friend. Each round you both get five seconds to set the bar to the split you see. Closest wins the round; first to {WIN_SCORE} wins.</p>
        <form onSubmit={create} className="stack">
          <label className="field">
            <span>Your name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname"
              placeholder="Enter your name" maxLength={MAX_NAME_LENGTH} required autoFocus />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-purple btn-big" type="submit" disabled={busy || !name.trim()}>
            <PeopleIcon size={28} /> {busy ? "Creating…" : "Create Room"}
          </button>
        </form>
      </section>
    </Scene>
  );
}
