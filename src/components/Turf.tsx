"use client";

import { useEffect, useRef } from "react";
import { COLOR_PAIRS, UNIT, type Splats } from "@/lib/game";

/** How long the splats take to land when a board first appears. */
const PAINT_ANIMATION_MS = 700;

function paint(ctx: CanvasRenderingContext2D, splats: Splats, colors: readonly string[], from: number, to: number) {
  const { width, height } = ctx.canvas;
  for (let i = from * 4; i < to * 4; i += 4) {
    ctx.beginPath();
    ctx.arc((splats[i] / UNIT) * width, (splats[i + 1] / UNIT) * height, (splats[i + 2] / UNIT) * width, 0, Math.PI * 2);
    ctx.fillStyle = colors[splats[i + 3]];
    ctx.fill();
  }
}

/** The 16:9 board. Splats are thrown on in order when a new board arrives. */
export default function Turf({ pair, splats }: { pair: number; splats: Splats }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const colors = COLOR_PAIRS[pair] ?? COLOR_PAIRS[0];
    const total = splats.length / 4;
    let done = 0;
    let frame = 0;

    const fit = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(canvas.clientWidth * scale));
      const height = Math.max(1, Math.round(canvas.clientHeight * scale));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      paint(ctx, splats, colors, 0, done);
    };
    canvas.width = 0; // forces fit() to size and clear the canvas for the new board
    fit();

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      done = total;
      paint(ctx, splats, colors, 0, total);
    } else {
      const startedAt = performance.now();
      const step = (time: number) => {
        const target = Math.min(total, Math.ceil(((time - startedAt) / PAINT_ANIMATION_MS) * total));
        paint(ctx, splats, colors, done, target);
        done = Math.max(done, target);
        if (done < total) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }

    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [pair, splats]);

  return <div className="turf"><canvas ref={canvasRef} role="img" aria-label="Turf painted in two colours" /></div>;
}
