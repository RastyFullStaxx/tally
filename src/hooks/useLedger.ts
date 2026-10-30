import { useEffect, useRef, useState } from "react"

import type { Data } from "@/lib/model"
import { load, save } from "@/lib/store"

/**
 * The notebook in memory and on the phone. `commit` updates the screen at once and writes to storage just after
 * it paints, so a big notebook's save never delays the tap. `saved` is false when the phone refused, `fill` says
 * how full storage is (0 to 1), and `unreadable` is true when saved data was there at launch but couldn't be read.
 */
export function useLedger() {
  const [start] = useState(load)
  const [data, setData] = useState(start.data)
  const [stored, setStored] = useState<{ ok: boolean; fill: number }>({ ok: true, fill: start.fill })
  const loaded = useRef(start.data)
  useEffect(() => {
    if (data === loaded.current) return
    // Just after the screen paints. A timer, not an animation frame: frames stop when the app is in the background,
    // and a line logged right before the app is swiped away must still be saved.
    const timer = setTimeout(() => {
      const level = save(data)
      setStored((s) => (level === null ? { ...s, ok: false } : { ok: true, fill: level }))
    })
    return () => clearTimeout(timer)
  }, [data])
  return { data, saved: stored.ok, fill: stored.fill, unreadable: start.unreadable, commit: setData as (next: Data) => void }
}
