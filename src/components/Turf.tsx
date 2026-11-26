"use client";

import { useEffect, useRef } from "react";
import { COLOR_PAIRS, fieldOf, GRID_H, GRID_W, type Splats } from "@/lib/game";

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * Paints a board. The territory is worked out on the same coarse grid the
 * server measures it on, then smoothed up to the canvas: the value at each
 * pixel is blended from the four grid cells around it, and the edge between
 * the colours is softened over about a pixel.
 */
function paint(canvas: HTMLCanvasElement, field: Float32Array, cut: number, colors: readonly string[]) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  if (!ctx || width < 2 || height < 2) return;

  const values = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const gy = Math.min(GRID_H - 1, Math.max(0, ((y + 0.5) / height) * GRID_H - 0.5));
    const y0 = Math.min(GRID_H - 2, Math.floor(gy));
    const ty = gy - y0;
    for (let x = 0; x < width; x++) {
      const gx = Math.min(GRID_W - 1, Math.max(0, ((x + 0.5) / width) * GRID_W - 0.5));
      const x0 = Math.min(GRID_W - 2, Math.floor(gx));
      const tx = gx - x0;
      const at = y0 * GRID_W + x0;
      const top = field[at] + (field[at + 1] - field[at]) * tx;
      const bottom = field[at + GRID_W] + (field[at + GRID_W + 1] - field[at + GRID_W]) * tx;
      values[y * width + x] = top + (bottom - top) * ty - cut;
    }
  }

  const [a, b] = [rgb(colors[0]), rgb(colors[1])];
  const image = ctx.createImageData(width, height);
  const data = image.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const v = values[i];
      // How far this pixel is from the edge, in pixels: the value over its slope.
      const dx = values[x + 1 < width ? i + 1 : i - 1] - v;
      const dy = values[y + 1 < height ? i + width : i - width] - v;
      const t = Math.min(1, Math.max(0, 0.5 + v / (Math.hypot(dx, dy) || 1e-6)));
      data[i * 4] = b[0] + (a[0] - b[0]) * t;
      data[i * 4 + 1] = b[1] + (a[1] - b[1]) * t;
      data[i * 4 + 2] = b[2] + (a[2] - b[2]) * t;
      data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

/** The 16:9 board. */
export default function Turf({ pair, splats, cut }: { pair: number; splats: Splats; cut: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const colors = COLOR_PAIRS[pair] ?? COLOR_PAIRS[0];
    const field = fieldOf(splats);
    const fit = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(2, Math.round(canvas.clientWidth * scale));
      const height = Math.max(2, Math.round(canvas.clientHeight * scale));
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      paint(canvas, field, cut, colors);
    };
    canvas.width = 0; // forces fit() to repaint for the new board
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [pair, splats, cut]);

  // The key restarts the fade-in for each new board.
  return <div className="turf"><canvas key={`${pair}:${cut}`} ref={canvasRef} role="img" aria-label="Territory in two colours" /></div>;
}
