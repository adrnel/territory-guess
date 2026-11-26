"use client";

import type { CSSProperties, Ref } from "react";
import { COLOR_PAIRS } from "@/lib/game";

export type Marker = { label: string; value: number; tone: "you" | "rival" };

type Props = {
  pair: number;
  /** Colour 0's share, 0-100. */
  value: number;
  onChange?: (value: number) => void;
  disabled?: boolean;
  /** Guesses pinned to the bar once the real split is shown. */
  markers?: Marker[];
  inputRef?: Ref<HTMLInputElement>;
};

const percent = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;

/**
 * A bar split between the two inks. With `onChange` it is a slider for
 * guessing the split; without, it shows a split (and any guesses) read-only.
 */
export default function SplitBar({ pair, value, onChange, disabled, markers = [], inputRef }: Props) {
  const [a, b] = COLOR_PAIRS[pair] ?? COLOR_PAIRS[0];
  const style = { "--a": a, "--b": b, "--v": `${value}%` } as CSSProperties;
  return (
    <div className={`split${onChange ? "" : " split-result"}${disabled ? " is-disabled" : ""}`} style={style}>
      <div className="split-labels" aria-hidden={!!onChange}>
        <b className="split-a" data-testid="share-a">{percent(value)}</b>
        <b className="split-b" data-testid="share-b">{percent(Math.round((100 - value) * 10) / 10)}</b>
      </div>
      <div className="split-track">
        {onChange && (
          <input ref={inputRef} type="range" min={0} max={100} step={1} value={value} disabled={disabled}
            aria-label="Your guess: share of the first colour, in percent" data-quiet
            onChange={(event) => onChange(Number(event.target.value))} />
        )}
        {markers.map((marker) => (
          <span key={marker.tone} className={`split-pin split-pin-${marker.tone}`} style={{ left: `${marker.value}%` }}>
            <em>{marker.label} {marker.value}%</em>
          </span>
        ))}
      </div>
    </div>
  );
}
