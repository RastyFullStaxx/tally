import { useState } from "react"

import type { Removed } from "@/lib/ledger"

/**
 * A short message above the tab bar. A delete's carries what Undo puts back; an odd amount's carries the id Fix
 * opens. Data, not callbacks, so the button acts on the entries as they are when it's tapped.
 */
export type Notice = { text: string; undo?: Removed; fix?: string }

/** One notice at a time: the newest replaces the one showing, and each timer only clears its own. */
export function useNotice() {
  const [notice, setNotice] = useState<Notice | null>(null)
  const show = (next: Notice, ms = 4000) => {
    setNotice(next)
    setTimeout(() => setNotice((shown) => (shown === next ? null : shown)), ms)
  }
  return { notice, show, say: (text: string) => show({ text }), clear: () => setNotice(null) }
}
