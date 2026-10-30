import { useEffect, useState } from "react"

import { localDate } from "@/lib/dates"

/** Today's date, following the clock, including when iOS resumes the app from the background the next morning. */
export function useToday() {
  const [today, setToday] = useState(() => localDate())
  useEffect(() => {
    const check = () => setToday(localDate())
    document.addEventListener("visibilitychange", check)
    return () => document.removeEventListener("visibilitychange", check)
  }, [])
  return today
}
