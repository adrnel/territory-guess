"use client";

import { useEffect, useRef, useState } from "react";

/** Visual feedback helpers. All of them do nothing when the player prefers reduced motion. */

const COLORS = ["#ff2b38", "#1463f5", "#ffd000", "#0aa51f", "#8f14d1", "#ffffff"];

export function reducedMotion(): boolean {
  return typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function layer(): HTMLElement {
  let el = document.getElementById("juice-layer");
  if (!el) {
    el = document.createElement("div");
    el.id = "juice-layer";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
  }
  return el;
}

function particle(x: number, y: number, dx: number, dy: number, duration: number, delay = 0) {
  const el = document.createElement("i");
  const size = 7 + Math.random() * 8;
  const round = Math.random() < 0.3;
  el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${round ? size : size * 0.6}px;`
    + `background:${COLORS[Math.floor(Math.random() * COLORS.length)]};border-radius:${round ? "50%" : "2px"};will-change:transform,opacity;`;
  layer().appendChild(el);
  const spin = (Math.random() - 0.5) * 1080;
  const animation = el.animate([
    { transform: "translate(-50%, -50%) rotate(0deg)", opacity: 1 },
    { transform: `translate(calc(-50% + ${dx * 0.7}px), calc(-50% + ${dy}px)) rotate(${spin * 0.6}deg)`, opacity: 1, offset: 0.45, easing: "ease-in" },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 160 + Math.random() * 120}px)) rotate(${spin}deg)`, opacity: 0 },
  ], { duration, delay, easing: "cubic-bezier(.15,.8,.3,1)", fill: "backwards" });
  animation.onfinish = animation.oncancel = () => el.remove();
}

/** A burst of confetti out of the middle of an element. */
export function burst(target: Element | null, count = 28) {
  if (!target || reducedMotion()) return;
  const box = target.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const reach = 70 + Math.random() * 130;
    particle(x, y, Math.cos(angle) * reach, Math.sin(angle) * reach - 60, 800 + Math.random() * 500);
  }
}

/** Confetti raining from the top of the screen, for the big moments. */
export function celebrate(count = 130) {
  if (reducedMotion()) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  for (let i = 0; i < count; i++) {
    particle(Math.random() * width, -20, (Math.random() - 0.5) * 240, height * (0.5 + Math.random() * 0.5),
      1800 + Math.random() * 1600, Math.random() * 900);
  }
}

/** "+25" lifts off one element and flies into another (the score). */
export function flyText(text: string, from: Element | null, to: Element | null) {
  if (!from || !to || reducedMotion()) return;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const el = document.createElement("b");
  el.className = "fly-points";
  el.textContent = text;
  el.style.left = `${a.left + a.width / 2}px`;
  el.style.top = `${a.top + a.height / 2}px`;
  layer().appendChild(el);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const animation = el.animate([
    { transform: "translate(-50%, -50%) scale(.4)", opacity: 0 },
    { transform: "translate(-50%, -130%) scale(1.25)", opacity: 1, offset: 0.25 },
    { transform: "translate(-50%, -150%) scale(1)", opacity: 1, offset: 0.5, easing: "cubic-bezier(.5,0,.8,.4)" },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.45)`, opacity: 0.9 },
  ], { duration: 850, easing: "ease-out" });
  animation.onfinish = animation.oncancel = () => {
    el.remove();
    to.animate([{ transform: "scale(1)" }, { transform: "scale(1.45)" }, { transform: "scale(1)" }], { duration: 320, easing: "ease-out" });
  };
}

/** Animates a number towards `value` instead of jumping to it. */
export function useCountUp(value: number, duration = 500, delay = 0): number {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    const from = current.current;
    if (from === value) return;
    if (reducedMotion() || value < from) { current.current = value; setShown(value); return; }
    let frame = 0;
    const startAt = performance.now() + delay;
    const step = (time: number) => {
      const t = Math.min(1, Math.max(0, (time - startAt) / duration));
      const next = Math.round(from + (value - from) * (1 - (1 - t) ** 3));
      current.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, delay]);
  return shown;
}
