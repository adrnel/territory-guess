import type { ReactNode } from "react";
import FeaturedRound from "@/components/FeaturedRound";
import { BoltIcon, ChevronIcon, GamepadIcon, PeopleIcon, PlayIcon, TrophyIcon } from "@/components/Icons";
import NavButton from "@/components/NavButton";
import SoundToggle from "@/components/SoundToggle";
import { START_LIVES } from "@/lib/game";
import { WIN_SCORE } from "@/lib/room";

function ModeCard({ href, tone, icon, title, children }: { href: string; tone: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <NavButton href={href} className="mode-card">
      <span className={`mode-icon mode-icon-${tone}`}>{icon}</span>
      <span className="mode-text"><b>{title}</b><span>{children}</span></span>
    </NavButton>
  );
}

export default function Home() {
  return (
    <main className="scene scene-home home">
      <div className="blots" aria-hidden="true"><i /><i /><i /><i /></div>

      <header className="topbar">
        <NavButton href="/" className="brand" aria-label="Territory Guesser">
          <img src="/branding/logo-small.webp" alt="Territory Guesser" width={520} height={181} draggable={false} />
        </NavButton>
        <nav className="topnav" aria-label="Main">
          <NavButton href="/play" className="nav-link nav-pill">Play</NavButton>
          <a href="#how" className="nav-link">How to Play</a>
          <details className="nav-menu">
            <summary className="nav-link">Game Modes <ChevronIcon size={14} /></summary>
            <div className="nav-drop">
              <NavButton href="/play" className="nav-item">Solo Run</NavButton>
              <NavButton href="/host" className="nav-item">Host a Duel</NavButton>
              <NavButton href="/join" className="nav-item">Join a Duel</NavButton>
            </div>
          </details>
          <NavButton href="/leaderboard" className="nav-link">Leaderboard</NavButton>
        </nav>
        <SoundToggle />
      </header>

      <div className="hero">
        <div className="hero-copy">
          <h1 className="headline">Which Colour Owns More <em>Territory?</em></h1>
          <p className="tagline">A simple but addictive guessing game where you decide which colour covers more of the map.</p>
          <div className="hero-actions">
            <NavButton href="/play" className="btn btn-yellow btn-big"><PlayIcon size={22} /> Play Now</NavButton>
            <a href="#how" className="btn btn-big">How to Play</a>
          </div>
          <ul className="perks">
            <li><BoltIcon size={20} className="gold" /> Quick Rounds</li>
            <li><PeopleIcon size={20} /> Duel Friends</li>
            <li><TrophyIcon size={20} className="gold" /> Climb the Leaderboard</li>
          </ul>
        </div>
        <FeaturedRound />
      </div>

      <nav className="modes" aria-label="Game modes">
        <ModeCard href="/play" tone="green" icon={<GamepadIcon size={34} />} title="Play Solo">Test your intuition across endless maps.</ModeCard>
        <ModeCard href="/host" tone="coral" icon={<PeopleIcon size={34} />} title="Duel a Friend">Go head-to-head in real time.</ModeCard>
        <ModeCard href="/leaderboard" tone="gold" icon={<TrophyIcon size={34} />} title="Compete">Rise up the leaderboard and prove your skills.</ModeCard>
      </nav>

      <section id="how" className="how">
        <h2 className="title">How to Play</h2>
        <ol className="how-steps">
          <li><b>Look at the map.</b> Two colours share it. One covers more than the other.</li>
          <li><b>Pick the bigger one.</b> Each level the two get closer. You have {START_LIVES} lives; a wrong pick costs one.</li>
          <li><b>Post your score.</b> When the lives run out, the levels you cleared can go on the leaderboard.</li>
        </ol>
        <p className="how-duel">
          <b>In a duel</b> you and a friend see the same map and have five seconds to set a bar to the split you see.
          Closest wins the round, a tie goes to whoever locked in first, and the first to {WIN_SCORE} wins.
        </p>
        <div className="actions">
          <NavButton href="/host" className="btn">Host a Duel</NavButton>
          <NavButton href="/join" className="btn">Join a Duel</NavButton>
          <NavButton href="/play" className="btn btn-yellow"><PlayIcon size={20} /> Play Now</NavButton>
        </div>
      </section>
    </main>
  );
}
