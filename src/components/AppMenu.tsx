import { useEffect, useRef, useState } from "react"
import { useRegisterSW } from "virtual:pwa-register/react"

import { BulbIcon, DownloadIcon, MoreIcon, PhoneIcon, QuestionIcon, RefreshIcon, TableIcon, TargetIcon, UploadIcon, WalletIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export type Sheet = "help" | "budget" | "goal" | "install" | "guide"

const HOUR = 60 * 60 * 1000

/**
 * Checks the server for a newer build of Tally. A new build downloads in the background and waits; the red dot
 * (and the home-screen icon badge, where the phone supports one) says it is ready, and Update switches to it.
 * Entries live in localStorage, so updating never touches them. Call once, in App.
 */
export function useUpdates() {
  const registration = useRef<ServiceWorkerRegistration | null>(null)
  const [checking, setChecking] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const pendingCheck = useRef<Promise<string> | null>(null)
  const cleanupRegistration = useRef<(() => void) | null>(null)
  useEffect(() => () => cleanupRegistration.current?.(), [])
  const {
    needRefresh: [ready],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, r) {
      if (!r) return
      cleanupRegistration.current?.()
      registration.current = r
      let cleanupWorker: (() => void) | null = null
      const watch = () => {
        cleanupWorker?.()
        const worker = r.installing
        const sync = () => setDownloading(worker?.state === "installing")
        sync()
        worker?.addEventListener("statechange", sync)
        cleanupWorker = () => worker?.removeEventListener("statechange", sync)
      }
      r.addEventListener("updatefound", watch)
      watch()
      // Check when the app comes back to the foreground, and hourly while it stays open.
      const check = () => {
        if (!navigator.onLine || pendingCheck.current) return
        setChecking(true)
        pendingCheck.current = r.update().then(() => "Checked for updates.", () => "Couldn't check.").finally(() => {
          pendingCheck.current = null
          setChecking(false)
        })
      }
      const foreground = () => { if (document.visibilityState === "visible") check() }
      document.addEventListener("visibilitychange", foreground)
      const interval = setInterval(check, HOUR)
      cleanupRegistration.current = () => {
        clearInterval(interval)
        document.removeEventListener("visibilitychange", foreground)
        r.removeEventListener("updatefound", watch)
        cleanupWorker?.()
      }
    },
  })

  useEffect(() => {
    const badge = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    ;(ready ? badge.setAppBadge?.(1) : badge.clearAppBadge?.())?.catch(() => {})
  }, [ready])

  /** Checks now (or applies a waiting update) and says what happened, for the notice line. */
  async function performCheck(): Promise<string> {
    if (ready) {
      await updateServiceWorker(true)
      return "Updating…"
    }
    const r = registration.current
    if (!r) return "Updates work once Tally is installed."
    if (!navigator.onLine) return "You're offline. Try again when you're connected."
    try {
      await r.update()
      return r.installing || r.waiting ? "Downloading the update. An Update button appears when it's ready." : "You're up to date."
    } catch {
      return "Couldn't check. Try again later."
    }
  }

  function check(): Promise<string> {
    if (pendingCheck.current) return pendingCheck.current
    setChecking(true)
    pendingCheck.current = performCheck().finally(() => {
      pendingCheck.current = null
      setChecking(false)
    })
    return pendingCheck.current
  }
  return { ready, checking, downloading, apply: check, check }
}

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

const isInstalled = () => matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
const isIPhone = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)

/** "Install Tally": Chrome and Android hand over a real install prompt; iPhone needs Share → Add to Home Screen. */
export function useInstall() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isInstalled)
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e as InstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setPrompt(null)
    }
    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  const steps = !prompt && isIPhone()
  return {
    available: !installed && (!!prompt || steps),
    steps, // true: show the Add to Home Screen steps instead of a prompt
    async install() {
      if (!prompt) return false
      await prompt.prompt()
      const { outcome } = await prompt.userChoice
      setPrompt(null)
      return outcome === "accepted"
    },
  }
}

type Props = {
  updates: ReturnType<typeof useUpdates>
  install: ReturnType<typeof useInstall>
  onOpen: (sheet: Sheet) => void
  onExport: () => void
  onExportCsv: () => void
  onImport: () => void
  say: (text: string) => void
  animateTally: boolean
  onToggleAnimation: () => void
}

/** The ··· menu in both screens' headers, with the Update pill beside it when a new version is waiting. */
export function AppMenu({ updates, install, onOpen, onExport, onExportCsv, onImport, say, animateTally, onToggleAnimation }: Props) {
  return (
    <div className="flex items-center gap-1">
      {updates.ready && (
        <Button size="sm" disabled={updates.checking} onClick={updates.apply} className="relative gap-1">
          <RefreshIcon className="size-3.5" />
          Update
          <span aria-hidden className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-background bg-over" />
        </Button>
      )}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-lg" aria-label={updates.ready ? "More (update available)" : "More"} className="relative">
            <MoreIcon className="size-4" />
            {updates.ready && <span aria-hidden className="absolute top-1.5 right-1.5 size-2 rounded-full bg-over" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {/* First, where a newcomer looks first. It also opens by itself on a phone's first launch (App). */}
          <DropdownMenuItem onSelect={() => onOpen("help")}>
            <BulbIcon />
            How to use Tally
          </DropdownMenuItem>
          {install.available && (
            <DropdownMenuItem
              onSelect={async () => {
                if (install.steps) onOpen("install")
                else if (await install.install()) say("Tally is installed. Open it from your home screen.")
              }}
            >
              <PhoneIcon />
              Install Tally
            </DropdownMenuItem>
          )}
          <DropdownMenuItem disabled={updates.checking} onSelect={async () => say(await updates.check())}>
            <RefreshIcon />
            {updates.ready ? "Update now" : "Check for updates"}
            {updates.ready && <span aria-hidden className="ml-auto size-2 rounded-full bg-over" />}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onOpen("budget")}>
            <WalletIcon />
            Monthly budget
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onOpen("goal")}>
            <TargetIcon />
            Savings goal
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onOpen("guide")}>
            <QuestionIcon />
            Which category?
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={animateTally} onCheckedChange={onToggleAnimation}>
            Animate Tally
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onExport}>
            <DownloadIcon />
            Export backup
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onImport}>
            <UploadIcon />
            Import backup
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onExportCsv}>
            <TableIcon />
            Export for spreadsheets
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
