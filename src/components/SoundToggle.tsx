"use client";

import { useEffect, useState } from "react";
import { isMuted, play, setMuted } from "@/lib/sound";
import { SoundOffIcon, SoundOnIcon } from "./Icons";

export default function SoundToggle() {
  const [muted, setMutedState] = useState(false);
  useEffect(() => { setMutedState(isMuted()); }, []);

  function toggle() {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
    if (!next) play("tick");
  }

  return (
    <button type="button" className="icon-btn" data-quiet onClick={toggle} aria-pressed={!muted}
      aria-label={muted ? "Turn sound on" : "Turn sound off"}>
      {muted ? <SoundOffIcon size={30} /> : <SoundOnIcon size={30} />}
    </button>
  );
}
