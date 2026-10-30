import { useEffect, useRef, useState, type ChangeEvent } from "react"

import type { Data } from "@/lib/model"
import { importBackup } from "@/lib/store"

/**
 * ··· → Import backup: a hidden file input, one import at a time, and a moment of success for the cat to show.
 * Merging is `mergeBackup`'s job; this only reads the file, commits the result and says how it went.
 */
export function useImport(data: Data, commit: (next: Data) => void, say: (text: string) => void) {
  const input = useRef<HTMLInputElement>(null)
  const busy = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [importing, setImporting] = useState(false)
  const [succeeded, setSucceeded] = useState(false)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || busy.current) return
    busy.current = true
    setImporting(true)
    setSucceeded(false)
    try {
      const { data: merged, added, skipped } = await importBackup(file, data)
      commit(merged)
      setSucceeded(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setSucceeded(false), 1000)
      say(`Imported ${added} ${added === 1 ? "entry" : "entries"}${skipped ? `, skipped ${skipped} unreadable` : ""}.`)
    } catch (error) {
      say((error as Error).message)
    } finally {
      busy.current = false
      setImporting(false)
    }
  }

  return { importing, succeeded, pick: () => input.current?.click(), input: { ref: input, onChange } }
}
