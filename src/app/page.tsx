import type { ReactNode } from "react";
import { ChevronIcon, LinkIcon, PeopleIcon, PodiumIcon, TrophyIcon } from "@/components/Icons";
import NavButton from "@/components/NavButton";
import Scene from "@/components/Scene";

function MenuLink({ href, icon, children, primary }: { href: string; icon: ReactNode; children: ReactNode; primary?: boolean }) {
  return (
    <NavButton href={href} className={`menu-btn${primary ? " menu-btn-primary" : ""}`}>
      <span className="menu-icon">{icon}</span>
      <span className="menu-label">{children}</span>
      <ChevronIcon size={26} className="menu-chevron" />
    </NavButton>
  );
}

export default function Home() {
  return (
    <Scene variant="home">
      <nav className="menu" aria-label="Game modes">
        <MenuLink href="/play" primary icon={<TrophyIcon size={44} className="gold" />}>Solo Run</MenuLink>
        <MenuLink href="/host" icon={<PeopleIcon size={44} />}>Host a Duel</MenuLink>
        <MenuLink href="/join" icon={<LinkIcon size={42} />}>Join a Duel</MenuLink>
        <MenuLink href="/leaderboard" icon={<PodiumIcon size={44} />}>Leaderboard</MenuLink>
      </nav>
    </Scene>
  );
}
