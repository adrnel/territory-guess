"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { COLOR_PAIRS, generateBoard, shareOf, winnerOf, type Board } from "@/lib/game";
import { play } from "@/lib/sound";
import { CheckIcon, ChevronIcon, StarIcon } from "./Icons";
import NavButton from "./NavButton";
import SplitBar from "./SplitBar";
import Turf from "./Turf";

type Sample = Board & { pair: number; share: number };

/**
 * A taster on the home page: one board to try, made and checked in the
 * browser. Nothing is sent to the server and it doesn't count for anything.
 */
export default function FeaturedRound() {
  const [sample, setSample] = useState<Sample | null>(null);
  const [picked, setPicked] = useState<0 | 1 | null>(null);

  const deal = useCallback(() => {
    // About as hard as the first few levels of a real run.
    const board = generateBoard(Math.random() < 0.5 ? 0.57 : 0.43);
    setSample({ ...board, pair: Math.floor(Math.random() * COLOR_PAIRS.length), share: shareOf(board) });
    setPicked(null);
  }, []);
  // Made after the page loads: a random board can't be drawn on the server and match in the browser.
  useEffect(deal, [deal]);

  const colors = COLOR_PAIRS[sample?.pair ?? 0];
  const correct = sample !== null && picked === winnerOf(sample.share);
  function choose(choice: 0 | 1) {
    if (!sample || picked !== null) return;
    setPicked(choice);
    play(choice === winnerOf(sample.share) ? "great" : "wrong");
  }

  return (
    <section className="featured" aria-label="Try a round">
      <p className="featured-tag"><StarIcon size={18} className="gold" /> Try a round</p>
      {sample ? <Turf pair={sample.pair} splats={sample.splats} cut={sample.cut} /> : <div className="turf" />}
      <div className="answer">
        <div className={`answer-layer${picked !== null ? " is-off" : ""}`}>
          <p className="prompt">Which colour takes up more territory?</p>
          <div className="choices">
            {([0, 1] as const).map((choice) => (
              <button key={choice} type="button" data-quiet data-sample={choice} className="btn btn-ink"
                style={{ "--ink": colors[choice] } as CSSProperties} disabled={!sample || picked !== null}
                aria-label={choice === 0 ? "Left colour" : "Right colour"} onClick={() => choose(choice)}>
                <i className="swatch" /> This colour
              </button>
            ))}
          </div>
        </div>
        <div className={`answer-layer${picked !== null ? "" : " is-off"}`}>
          <SplitBar pair={sample?.pair ?? 0} value={sample?.share ?? 50} />
          <div className="verdict-row" role="status" aria-live="polite">
            {picked !== null && (correct
              ? <span className="toast toast-good" data-testid="sample-verdict"><CheckIcon size={22} /> Correct!</span>
              : <span className="toast toast-bad" data-testid="sample-verdict">✕ Not this time</span>)}
            <button type="button" className="btn" onClick={deal}>Another</button>
            <NavButton href="/play" className="btn btn-yellow">Play <ChevronIcon size={18} /></NavButton>
          </div>
        </div>
      </div>
    </section>
  );
}
