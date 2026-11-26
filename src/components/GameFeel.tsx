"use client";

import { useEffect } from "react";
import { play } from "@/lib/sound";

/** App-wide game feel: no browser context menu on the UI, and a click sound on every button. */
export default function GameFeel() {
  useEffect(() => {
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest("input, textarea");
    const onContextMenu = (event: MouseEvent) => { if (!editable(event.target)) event.preventDefault(); };
    const onDragStart = (event: DragEvent) => { if (!editable(event.target)) event.preventDefault(); };
    const onClick = (event: MouseEvent) => {
      const button = event.target instanceof Element ? event.target.closest("button") : null;
      if (button && !button.disabled && !button.matches("[data-quiet]")) play("tick");
    };
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("dragstart", onDragStart);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("dragstart", onDragStart);
      document.removeEventListener("click", onClick);
    };
  }, []);
  return null;
}
