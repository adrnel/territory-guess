"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

type Props = { href: string; className?: string; children: ReactNode; "aria-label"?: string };

/**
 * Goes to another screen like a game menu button rather than a web link: it
 * can't be opened in a new tab, and the current screen slides away first.
 */
export default function NavButton({ href, className, children, ...rest }: Props) {
  const router = useRouter();
  function go(event: React.MouseEvent<HTMLButtonElement>) {
    const scene = event.currentTarget.closest(".scene");
    if (!scene || scene.classList.contains("is-leaving")) return;
    const quick = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scene.classList.add("is-leaving");
    window.setTimeout(() => router.push(href), quick ? 0 : 260);
    // If we end up on the same screen (or navigation fails), don't stay hidden.
    window.setTimeout(() => scene.classList.remove("is-leaving"), 1500);
  }
  return <button type="button" className={className} onClick={go} {...rest}>{children}</button>;
}
