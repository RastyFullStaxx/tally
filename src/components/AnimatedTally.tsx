import { useEffect, useRef, useState, useSyncExternalStore } from "react"

import { Mascot } from "@/components/Mascot"
import { TALLY_CLIPS, tallyMotion, type TallyActivity } from "@/lib/tally-motion"

function subscribeMotion(change: () => void) {
  const media = matchMedia("(prefers-reduced-motion: reduce)")
  media.addEventListener("change", change)
  document.addEventListener("visibilitychange", change)
  return () => {
    media.removeEventListener("change", change)
    document.removeEventListener("visibilitychange", change)
  }
}
const motionAvailable = () => !document.hidden && !matchMedia("(prefers-reduced-motion: reduce)").matches

export function AnimatedTally({ activity, statusText, paused, enabled }: { activity: TallyActivity; statusText: string; paused: boolean; enabled: boolean }) {
  const available = useSyncExternalStore(subscribeMotion, motionAvailable, () => false)
  const allowed = enabled && available
  const [reaction, setReaction] = useState<"idle" | "wave" | null>(null)
  const [workReady, setWorkReady] = useState(false)
  const [loaded, setLoaded] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const lastTap = useRef(-Infinity)
  const greetingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [greeting, setGreeting] = useState(false)

  useEffect(() => {
    if (activity !== "working") return
    const timer = setTimeout(() => setWorkReady(true), 400)
    return () => clearTimeout(timer)
  }, [activity])
  useEffect(() => {
    if (!allowed || paused || activity !== "idle" || reaction) return
    const timer = setTimeout(() => setReaction("idle"), 10000)
    return () => clearTimeout(timer)
  }, [allowed, paused, activity, reaction])
  useEffect(
    () => () => {
      if (greetingTimer.current) clearTimeout(greetingTimer.current)
    },
    []
  )

  const motion = tallyMotion(activity, reaction, allowed, paused, workReady)
  const clip = motion ?? (activity === "working" ? "working" : activity === "success" ? "success" : "idle")
  const config = TALLY_CLIPS[clip]
  const playing = motion !== null && loaded === clip && !failed
  const greet = (keyboard: boolean) => {
    const now = performance.now()
    if (activity === "working" || now - lastTap.current < 3000) return
    lastTap.current = now
    setGreeting(true)
    if (allowed && !paused && !keyboard) setReaction("wave")
    greetingTimer.current = setTimeout(() => {
      setGreeting(false)
      setReaction(null)
    }, 1000)
  }

  return (
    <div className="flex min-h-14 items-center gap-2" data-tally-state={activity} data-tally-motion={playing ? clip : "still"}>
      <button
        type="button"
        aria-label="Wave to Tally"
        disabled={activity === "working"}
        onClick={(event) => greet(event.detail === 0)}
        className="relative size-14 shrink-0 overflow-hidden rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {(failed || loaded !== clip || (greeting && !playing)) && (
          <div className="absolute inset-0">
            <Mascot pose={activity === "working" ? "waiting" : activity === "success" ? "celebration" : greeting ? "welcome" : "ready"} size={56} />
          </div>
        )}
        {!failed && (
          <img
            src={`/mascot/tally-cat/animation/${clip}.webp`}
            alt=""
            aria-hidden
            decoding="async"
            width={192 * config.frames}
            height={192}
            onLoad={() => setLoaded(clip)}
            onError={() => setFailed(true)}
            onAnimationEnd={() => setReaction(null)}
            className="tally-strip"
            style={{
              width: 56 * config.frames,
              height: 56,
              opacity: loaded === clip && !(greeting && !playing) ? 1 : 0,
              animation: playing ? `tally-frames ${config.duration}ms steps(${config.frames}) ${clip === "working" ? "infinite" : "1"}` : "none",
            }}
          />
        )}
      </button>
      <div className="min-w-0">
        <span className="text-sm font-semibold tracking-tight">Tally</span>
        <p role="status" className="min-h-4 text-[11px] text-muted-foreground">
          {statusText || (greeting ? "Hello! A note at a time." : "")}
        </p>
      </div>
    </div>
  )
}
