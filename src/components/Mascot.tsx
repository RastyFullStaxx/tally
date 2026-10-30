import { cn } from "cn"

type Pose = "welcome" | "ready" | "thinking" | "saving" | "celebration" | "reassurance" | "income" | "planning" | "backup" | "resting" | "waiting" | "peeking"

/** Decorative companion: the adjacent text always explains the state. */
export function Mascot({ pose, size = 96, className }: { pose: Pose; size?: number; className?: string }) {
  return <img src={`/mascot/tally-cat/runtime/${pose}.webp`} alt="" aria-hidden width={size} height={size} decoding="async" className={cn("shrink-0 object-contain", className)} style={{ width: size, height: size }} />
}
