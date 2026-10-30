import { preloadable } from "@/lib/preload"

/** Insights and Recharts live in their own chunk, so Today opens without parsing the charts. */
export const loadInsights = preloadable(() => import("@/screens/Insights"))

/** Fetches the chunk once the phone is idle, so the first tap on Insights doesn't wait. */
export function preloadInsightsWhenIdle() {
  const start = () =>
    void loadInsights().catch(() => {
      /* Retried when Insights opens. */
    })
  // Safari has no requestIdleCallback.
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(start, { timeout: 3000 })
    return () => window.cancelIdleCallback(id)
  }
  const id = setTimeout(start, 1500)
  return () => clearTimeout(id)
}
