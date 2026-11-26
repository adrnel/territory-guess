import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/inter";
import "@fontsource-variable/fraunces";
import GameFeel from "@/components/GameFeel";
import "./globals.css";

export const metadata: Metadata = {
  title: "Territory Guesser",
  description: "Two colours, one map. Guess which takes up more territory, climb the leaderboard, or duel a friend to call the exact split.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/branding/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/branding/icon-180.png",
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f4ecdd" };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en"><body><GameFeel />{children}</body></html>;
}
