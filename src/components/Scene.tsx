import type { ReactNode } from "react";
import { HomeIcon } from "./Icons";
import NavButton from "./NavButton";
import SoundToggle from "./SoundToggle";

type Props = {
  children: ReactNode;
  /** "home" shows the big title; "page" shows a smaller one and the Home button. */
  variant?: "home" | "page";
};

function Logo() {
  return <span className="logo"><span className="logo-a">Territory</span> <span className="logo-b">Guesser</span></span>;
}

/** The backdrop, corner shapes and title shared by every screen. */
export default function Scene({ children, variant = "page" }: Props) {
  return (
    <main className={`scene scene-${variant}`}>
      <div className="blots" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="corner corner-left">
        {variant === "page" && (
          <NavButton href="/" className="icon-btn" aria-label="Back to menu"><HomeIcon size={26} /></NavButton>
        )}
      </div>
      <div className="corner corner-right"><SoundToggle /></div>
      <div className="stage">
        {variant === "home"
          ? <>
            <h1 className="logo-wrap"><img className="logo-art" src="/branding/logo.webp" alt="Territory Guesser" width={1200} height={417} draggable={false} /></h1>
            <p className="tagline">Two colours, one map. Which takes up more territory?</p>
          </>
          : <NavButton href="/" className="logo-wrap logo-btn" aria-label="Territory Guesser — back to menu"><Logo /></NavButton>}
        {children}
      </div>
    </main>
  );
}
