"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { LinkIcon, PeopleIcon } from "@/components/Icons";
import Scene from "@/components/Scene";
import { MAX_NAME_LENGTH } from "@/lib/game";
import { isRoomCode, ROOM_CODE_LENGTH } from "@/lib/room";
import { getName, saveName } from "@/lib/storage";

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  useEffect(() => setName(getName()), []);

  const valid = isRoomCode(code) && !!name.trim();

  function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) return;
    saveName(name.trim());
    router.push(`/room/${code}`);
  }

  return (
    <Scene>
      <section className="panel panel-form">
        <h1 className="title">Join a Duel</h1>
        <p className="lead">Enter a room code to take on a friend head to head!</p>
        <form onSubmit={join} className="stack">
          <label className="field">
            <span>Room code</span>
            <span className="input-icon">
              <LinkIcon size={26} />
              <input className="input input-code" value={code} placeholder="Enter Room Code" inputMode="text"
                autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={ROOM_CODE_LENGTH} autoFocus
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
            </span>
          </label>
          <label className="field">
            <span>Your name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname"
              placeholder="Enter your name" maxLength={MAX_NAME_LENGTH} required />
          </label>
          <button className="btn btn-purple btn-big" type="submit" disabled={!valid}>
            <PeopleIcon size={28} /> Join
          </button>
        </form>
      </section>
    </Scene>
  );
}
