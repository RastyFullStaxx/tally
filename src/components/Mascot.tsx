import { cn } from "cn"

type Pose = "welcome" | "ready" | "thinking" | "saving" | "celebration" | "reassurance"

/** Decorative companion: the adjacent text always explains the state. */
export function Mascot({ pose, size = 96, className }: { pose: Pose; size?: number; className?: string }) {
  return <img src={`/mascot/tally-cat/runtime/${pose}.webp`} alt="" aria-hidden width={size} height={size} decoding="async" className={cn("shrink-0 object-contain", className)} style={{ width: size, height: size }} />
}

export function TallyBrand() {
  return (
    <div className="flex items-center gap-1.5">
      <img src="/mascot/tally-cat/runtime/logo.webp" alt="" width={28} height={28} className="size-7 object-contain" />
      <span className="text-sm font-semibold tracking-tight">Tally</span>
    </div>
  )
}
