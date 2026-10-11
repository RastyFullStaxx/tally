import { useEffect, useRef, useState } from "react"
import { RefreshIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useRegisterSW } from "virtual:pwa-register/react"

import { Button } from "@/components/ui/button"

const HOUR = 60 * 60 * 1000

/**
 * Checks the server for a newer build of Tally. A new build downloads in the background and waits;
 * the red dot (and the home-screen icon badge, where the phone supports one) says it is ready, and
 * tapping Update switches to it. Entries live in localStorage, so updating never touches them.
 */
export function UpdateButton() {
  const registration = useRef<ServiceWorkerRegistration | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const {
    needRefresh: [ready],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, r) {
      if (!r) return
      registration.current = r
      // Check when the app comes back to the foreground, and hourly while it stays open.
      const check = () => navigator.onLine && r.update().catch(() => {})
      document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check())
      setInterval(check, HOUR)
    },
  })

  useEffect(() => {
    const badge = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    ;(ready ? badge.setAppBadge?.(1) : badge.clearAppBadge?.())?.catch(() => {})
  }, [ready])

  const say = (text: string) => {
    setNote(text)
    setTimeout(() => setNote((shown) => (shown === text ? null : shown)), 3000)
  }

  async function onClick() {
    if (ready) return updateServiceWorker(true)
    const r = registration.current
    if (!r) return say("Updates work once the app is installed")
    if (!navigator.onLine) return say("You're offline")
    setNote("Checking…")
    try {
      await r.update()
      // A newer build is now downloading; `ready` flips (and the dot appears) once it has.
      say(r.installing || r.waiting ? "Downloading update…" : "You're up to date")
    } catch {
      say("Couldn't check. Try again later")
    }
  }

  return (
    <div className="flex items-center gap-1">
      {note && !ready && <span className="text-[11px] whitespace-nowrap text-muted-foreground">{note}</span>}
      {ready ? (
        <Button size="sm" onClick={onClick} className="relative gap-1">
          <HugeiconsIcon icon={RefreshIcon} className="size-3.5" aria-hidden />
          Update
          <span aria-hidden className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-background bg-over" />
        </Button>
      ) : (
        <Button variant="ghost" size="icon-lg" aria-label="Check for updates" onClick={onClick}>
          <HugeiconsIcon icon={RefreshIcon} className="size-4" />
        </Button>
      )}
    </div>
  )
}
