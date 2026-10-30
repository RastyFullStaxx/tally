// Where Tally's data lives: one JSON document in this app's own localStorage, on the phone only.
// ponytail: localStorage caps near 5 MB, about ten years at ten entries a day; move to IndexedDB if it gets close.
import { type Data } from "./model"
import { localDate } from "./dates"
import { mergeBackup, toBackup, toCsv } from "./backup"

const KEY = "tally:v1"
const HELP_SEEN = "tally:help-seen" // a flag for this phone, kept out of backups
const ANIMATE = "tally:animate-mascot" // "on" or "off" for this phone, kept out of backups

/** Whether How to use has been shown on this phone. Unreadable storage counts as seen, so it never nags. */
export function helpSeen() {
  try {
    return localStorage.getItem(HELP_SEEN) !== null
  } catch {
    return true
  }
}

export function markHelpSeen() {
  try {
    localStorage.setItem(HELP_SEEN, "1")
  } catch {
    // Storage is blocked: it shows again on the next launch, which is harmless.
  }
}

/** Whether the cat in the header moves. On unless turned off; unreadable storage means still. */
export function animateMascot() {
  try {
    return localStorage.getItem(ANIMATE) !== "off"
  } catch {
    return false
  }
}

export function setAnimateMascot(on: boolean) {
  try {
    localStorage.setItem(ANIMATE, on ? "on" : "off")
  } catch {
    // Storage is blocked: the choice lasts until the app closes.
  }
}

/** Reads the saved data. Unreadable data is copied aside under its own key first, never overwritten. */
export function load(): Data {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
    if (!raw) return { entries: [], budget: 0 }
    const data = JSON.parse(raw) as Data
    if (Array.isArray(data.entries) && typeof data.budget === "number") return data
    throw new Error("Unexpected shape")
  } catch {
    try {
      if (raw) localStorage.setItem(`tally:corrupt:${Date.now()}`, raw)
    } catch {
      // Storage is full or blocked; the save banner will say so on the next change.
    }
    return { entries: [], budget: 0 }
  }
}

/** Saves everything. False when the phone refused (storage full or blocked). */
export function save(data: Data): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

/** Hands a file to the share sheet (Save to Files on iPhone), or downloads it where sharing files isn't supported. */
async function shareFile(file: File) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (error) {
      if ((error as Error).name === "AbortError") return
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement("a")
  link.href = url
  link.download = file.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const exportBackup = (data: Data) => shareFile(new File([toBackup(data)], `tally-backup-${localDate()}.json`, { type: "application/json" }))

/** Every entry as a CSV for Numbers, Excel or Google Sheets. It's a copy to read, not a backup: Import takes the JSON. */
export const exportCsv = (data: Data) => shareFile(new File([toCsv(data.entries)], `tally-entries-${localDate()}.csv`, { type: "text/csv" }))

export async function importBackup(file: File, current: Data) {
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new Error("That file isn't a Tally backup.")
  }
  return mergeBackup(current, parsed)
}
