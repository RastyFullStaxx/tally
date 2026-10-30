export type TallyActivity = "idle" | "working" | "success"
export type TallyClip = "idle" | "wave" | "working" | "success"

export const TALLY_CLIPS = {
  idle: { frames: 8, duration: 800 },
  wave: { frames: 10, duration: 833 },
  working: { frames: 12, duration: 1200 },
  success: { frames: 12, duration: 1000 },
} as const

/** Real work wins; reduced motion/hidden pages never play a clip. */
export function tallyMotion(activity: TallyActivity, reaction: "idle" | "wave" | null, allowed: boolean, paused: boolean, workReady: boolean): TallyClip | null {
  if (!allowed) return null
  if (activity === "working") return workReady ? "working" : null
  if (activity === "success") return "success"
  return paused ? null : reaction
}
