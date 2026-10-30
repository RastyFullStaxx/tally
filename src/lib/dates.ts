// Dates are the phone's local day as YYYY-MM-DD, never UTC.

export const pad = (n: number) => String(n).padStart(2, "0")

/** Never `toISOString().slice(0, 10)`: that is the UTC day, which is yesterday before 8am in Manila. */
export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const monthOf = (date: string) => date.slice(0, 7)

/** Noon, so a midnight daylight-saving jump can't land on the wrong day. Accepts YYYY-MM too. */
export function toDate(date: string) {
  const [y, m, d = 1] = date.split("-").map(Number)
  return new Date(y, m - 1, d, 12)
}

export function shiftDay(date: string, by: number) {
  const d = toDate(date)
  d.setDate(d.getDate() + by)
  return localDate(d)
}

export function shiftMonth(month: string, by: number) {
  const d = toDate(month)
  d.setMonth(d.getMonth() + by, 1)
  return monthOf(localDate(d))
}

export const daysIn = (month: string) => {
  const d = toDate(month)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

export const monthName = (month: string) => toDate(month).toLocaleDateString("en-PH", { month: "long" })
