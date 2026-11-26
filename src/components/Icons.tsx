import type { ReactNode } from "react";

function Svg({ children, size = 24, className }: { children: ReactNode; size?: number; className?: string }) {
  return <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">{children}</svg>;
}
type P = { size?: number; className?: string };

export const HomeIcon = (p: P) => <Svg {...p}><path d="M12 2.600a1.5 1.5 0 0 0-1 .4l-8 7.300a1.2 1.2 0 0 0 .8 2.100H5V19a2 2 0 0 0 2 2h2.500a1 1 0 0 0 1-1v-4.500h3V20a1 1 0 0 0 1 1H17a2 2 0 0 0 2-2v-6.600h1.200a1.2 1.2 0 0 0 .8-2.100L13 3a1.5 1.5 0 0 0-1-.4Z" /></Svg>;
export const SoundOnIcon = (p: P) => <Svg {...p}><path d="M11.3 4.3 7 8H4.500A1.5 1.5 0 0 0 3 9.500v5A1.5 1.5 0 0 0 4.5 16H7l4.3 3.700a1 1 0 0 0 1.7-.8V5.100a1 1 0 0 0-1.7-.8Z" /><path d="M15.5 8.500a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></Svg>;
export const SoundOffIcon = (p: P) => <Svg {...p}><path d="M11.3 4.3 7 8H4.500A1.5 1.5 0 0 0 3 9.500v5A1.5 1.5 0 0 0 4.5 16H7l4.3 3.700a1 1 0 0 0 1.7-.8V5.100a1 1 0 0 0-1.7-.8Z" /><path d="m16 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></Svg>;
export const TrophyIcon = (p: P) => <Svg {...p}><path d="M7 3h10v1.500h3a1 1 0 0 1 1 1V7a4.5 4.5 0 0 1-4.3 4.500A5.5 5.5 0 0 1 13 14.900V17h2.500a1.5 1.5 0 0 1 1.5 1.500V21H7v-2.500A1.5 1.5 0 0 1 8.5 17H11v-2.100a5.5 5.5 0 0 1-3.7-3.400A4.5 4.5 0 0 1 3 7V5.500a1 1 0 0 1 1-1h3Zm0 3.500H5V7a2.5 2.5 0 0 0 2 2.400Zm10 0v2.900A2.5 2.5 0 0 0 19 7v-.5Z" /></Svg>;
export const PeopleIcon = (p: P) => <Svg {...p}><circle cx="12" cy="7.5" r="3.5" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0 1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1Z" /><circle cx="4.8" cy="9.5" r="2.3" /><circle cx="19.2" cy="9.5" r="2.3" /><path d="M1 18.500a4 4 0 0 1 4.6-4 8 8 0 0 0-1.8 5H2a1 1 0 0 1-1-1Zm22 0a4 4 0 0 0-4.6-4 8 8 0 0 1 1.8 5H22a1 1 0 0 0 1-1Z" /></Svg>;
export const LinkIcon = (p: P) => <Svg {...p}><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3A4.5 4.5 0 0 0 13 4.600l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.400l1-1" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></Svg>;
export const PodiumIcon = (p: P) => <Svg {...p}><path d="M9 8.500A1.5 1.5 0 0 1 10.5 7h3A1.5 1.5 0 0 1 15 8.500V21H9ZM2 14.500A1.5 1.5 0 0 1 3.5 13H8v8H3.500A1.5 1.5 0 0 1 2 19.500Zm14 1.500h4.500a1.5 1.5 0 0 1 1.5 1.500v2a1.5 1.5 0 0 1-1.5 1.500H16Z" /><path d="M12 1.500v2.500M8.5 2.500l1 2M15.5 2.500l-1 2" fill="none" stroke="#ffc400" strokeWidth="1.6" strokeLinecap="round" /></Svg>;
export const ChevronIcon = (p: P) => <Svg {...p}><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></Svg>;
export const PlayIcon = (p: P) => <Svg {...p}><path d="M7 4.200a1.5 1.5 0 0 1 2.3-1.300l11 7.800a1.5 1.5 0 0 1 0 2.500l-11 7.800A1.5 1.5 0 0 1 7 19.800Z" /></Svg>;
export const CopyIcon = (p: P) => <Svg {...p}><path d="M9 3.500h6M8 5H6.500A1.5 1.5 0 0 0 5 6.500v13A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.500v-13A1.5 1.5 0 0 0 17.5 5H16M9 2.500h6v4H9Z" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></Svg>;
export const CrownIcon = (p: P) => <Svg {...p}><path d="M3 8.5 7.5 12 12 5l4.5 7L21 8.5 19.3 18a1.5 1.5 0 0 1-1.5 1.200H6.200A1.5 1.5 0 0 1 4.7 18Z" /></Svg>;
export const CheckIcon = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="m7.5 12.5 3 3 6-6.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></Svg>;
export const TargetIcon = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2.4" /><circle cx="12" cy="12" r="3.2" /></Svg>;
export const StarIcon = (p: P) => <Svg {...p}><path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.500L12 17.400l-5.9 3.1 1.2-6.500L2.5 9.400l6.6-.9Z" /></Svg>;
export const GamepadIcon = (p: P) => <Svg {...p}><path d="M7.5 6h9a5.5 5.5 0 0 1 5.4 4.500l.9 5a3 3 0 0 1-5.3 2.400L16 16H8l-1.5 1.900a3 3 0 0 1-5.3-2.400l.9-5A5.5 5.5 0 0 1 7.5 6Z" /><path d="M8 9.500v3M6.5 11h3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" /><circle cx="15.5" cy="10" r="1" fill="#fff" /><circle cx="17.5" cy="12" r="1" fill="#fff" /></Svg>;
export const BackIcon = (p: P) => <Svg {...p}><path d="M19 12H6m5-6-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" /></Svg>;
