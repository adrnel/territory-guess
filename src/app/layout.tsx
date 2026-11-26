import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/inter";
import GameFeel from "@/components/GameFeel";
import "./globals.css";

export const metadata: Metadata = {
  title: "Turf War Guesser",
  description: "Two inks, one turf. Guess which colour covers more, climb the leaderboard, or duel a friend to call the exact split.",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#111827" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body><GameFeel />{children}</body></html>;
}
