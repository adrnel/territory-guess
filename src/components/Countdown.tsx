"use client";

import { useEffect } from "react";
import { play } from "@/lib/sound";

/** The big 3-2-1 shown before a match. `remainingMs` is how long until play starts. */
export default function Countdown({ remainingMs }: { remainingMs: number }) {
  const number = Math.max(1, Math.ceil(remainingMs / 1000));
  useEffect(() => { play("tick"); }, [number]);
  return (
    <div className="countdown" role="status" aria-live="polite">
      <p className="countdown-label">Get ready…</p>
      <p className="countdown-number" key={number} data-testid="countdown">{number}</p>
    </div>
  );
}
