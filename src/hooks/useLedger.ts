import { useState } from "react"

import type { Data } from "@/lib/model"
import { load, save } from "@/lib/store"

/** The notebook in memory and on the phone. `commit` writes through; `saved` turns false when the phone refuses. */
export function useLedger() {
  const [data, setData] = useState(load)
  const [saved, setSaved] = useState(true)
  const commit = (next: Data) => {
    setData(next)
    const stored = save(next)
    setSaved(stored)
    return stored
  }
  return { data, saved, commit }
}
