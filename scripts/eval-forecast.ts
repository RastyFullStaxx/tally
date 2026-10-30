// How close is the month-end forecast? `npm run eval:forecast` replays seeded, synthetic months and asks
// `forecastMonth` for the month's total on every day, using only what was logged up to that day, then compares
// it with what the month really came to. Each persona spends more on weekends, a little more right after
// payday (the 15th and the last day), makes the odd big purchase, pays monthly bills, and has some months
// that run hotter or cooler than others. Synthetic on purpose: no real spending data is needed.
import { forecastMonth } from "../src/lib/insights.ts"
import { type CategoryId, type Entry } from "../src/lib/model.ts"
import { daysIn, monthOf, shiftDay, shiftMonth, toDate } from "../src/lib/dates.ts"

type Persona = { name: string; weekday: number; saturday: number; sunday: number; bills: [string, number, number][]; jump?: { from: number; by: number }; weekly?: [string, number]; gaps?: boolean }

const PERSONAS: Persona[] = [
  { name: "commuter", weekday: 450, saturday: 1100, sunday: 800, bills: [["rent", 1, 8000], ["meralco", 10, 2300], ["converge", 20, 1500]] },
  { name: "student", weekday: 260, saturday: 420, sunday: 300, bills: [["load", 5, 300], ["spotify", 18, 149]] },
  // A big grocery run every Saturday: a regular big day, which must still be projected.
  { name: "household", weekday: 900, saturday: 1600, sunday: 1400, bills: [["rent", 2, 12000], ["meralco", 12, 4200], ["maynilad", 15, 900], ["pldt", 25, 1700]], weekly: ["puregold", 3500] },
  // A real change in habits: from the sixth month on, everyday spending is half again as much, and stays there.
  { name: "new habit", weekday: 450, saturday: 900, sunday: 700, bills: [["rent", 1, 8000], ["globe", 8, 1300]], jump: { from: 5, by: 1.5 } },
  // Forgets to log: about 1 day in 5, plus a whole week now and then. Unlogged days aren't days without spending.
  { name: "gappy", weekday: 400, saturday: 800, sunday: 600, bills: [["rent", 1, 7000], ["meralco", 11, 1800]], gaps: true },
]
const EVERYDAY: [string, CategoryId][] = [["lunch", "food"], ["grab", "transport"], ["puregold", "groceries"], ["snacks", "food"], ["jeep", "transport"], ["movie", "leisure"]]
const BIG: [string, CategoryId][] = [["shopee haul", "shopping"], ["new shoes", "shopping"], ["birthday dinner", "leisure"], ["dentist", "health"]]
const START = "2026-03-01"
const MONTHS = 8 // March to October; the first two only build history

function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function notebook(p: Persona, seed: number): Entry[] {
  const next = random(seed)
  const noise = () => Math.exp((next() + next() + next() - 1.5) * 0.6) // roughly log-normal, middle at 1
  const entries: Entry[] = []
  const add = (date: string, pesos: number, note: string, category: CategoryId) =>
    entries.push({ id: `${p.name}-${entries.length}`, date, amount: Math.max(1, Math.round(pesos)) * 100, income: false, note, category, createdAt: toDate(date).getTime() + entries.length })
  const end = shiftMonth(monthOf(START), MONTHS)
  let level = 1
  let month = -1
  let skipUntil = ""
  for (let date = START; monthOf(date) < end; date = shiftDay(date, 1)) {
    const d = Number(date.slice(8, 10))
    if (d === 1) {
      month++
      level = (0.85 + next() * 0.3) * (p.jump && month >= p.jump.from ? p.jump.by : 1) // some months run hotter than others
    }
    const weekday = toDate(date).getDay()
    const last = daysIn(monthOf(date))
    if (p.gaps && date >= skipUntil && next() < 0.03) skipUntil = shiftDay(date, 7)
    if (p.gaps && (date < skipUntil || next() < 0.2)) continue
    const afterPayday = [15, 16, 17].includes(d) || d === 1 || d === 2 || d === last
    const base = (weekday === 6 ? p.saturday : weekday === 0 ? p.sunday : p.weekday) * level * (afterPayday ? 1.4 : 1) * noise()
    const parts = 2 + Math.floor(next() * 3)
    for (let k = 0; k < parts; k++) {
      const [note, category] = EVERYDAY[Math.floor(next() * EVERYDAY.length)]
      add(date, base / parts, note, category)
    }
    if (p.weekly && weekday === 6) add(date, p.weekly[1] * level * (0.8 + next() * 0.4), p.weekly[0], "groceries")
    if (next() < 0.03) {
      const [note, category] = BIG[Math.floor(next() * BIG.length)]
      add(date, 1500 + next() * 4500, note, category)
    }
    for (const [note, day, pesos] of p.bills) if (d === Math.min(day, last)) add(date, pesos * (0.9 + next() * 0.2), note, "bills")
  }
  return entries
}

export type Forecaster = (entries: Entry[], month: string, today: string) => number

const BUCKETS = [
  ["1st–6th", 1, 6],
  ["7th–13th", 7, 13],
  ["14th–20th", 14, 20],
  ["21st on", 21, 31],
] as const

/**
 * The average miss (|forecast − actual| ÷ actual) for each stretch of the month and the overall bias, plus the
 * same for the month a habit changes, where a forecast that leans on history would lag.
 */
export function backtest(forecast: Forecaster, seeds = [1, 2, 3, 4, 5]) {
  const change: number[] = []
  let changeBias = 0
  const misses = BUCKETS.map(() => [] as number[])
  let bias = 0
  let n = 0
  for (const p of PERSONAS) {
    for (const seed of seeds) {
      const all = notebook(p, seed * 104729 + p.name.length)
      for (let m = 2; m < MONTHS; m++) {
        const month = shiftMonth(monthOf(START), m)
        const actual = all.filter((e) => e.date.startsWith(month)).reduce((s, e) => s + e.amount, 0)
        for (let d = 1; d < daysIn(month); d++) {
          const today = `${month}-${String(d).padStart(2, "0")}`
          const known = all.filter((e) => e.date <= today)
          const guess = forecast(known, month, today)
          const miss = (guess - actual) / actual
          misses[BUCKETS.findIndex(([, from, to]) => d >= from && d <= to)].push(Math.abs(miss))
          if (d >= 7) {
            bias += miss
            n++
          }
          if (p.jump && m === p.jump.from && d >= 7) {
            change.push(Math.abs(miss))
            changeBias += miss
          }
        }
      }
    }
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const fromSeventh = misses.slice(1).flat()
  return { byStretch: BUCKETS.map(([label], i) => [label, mean(misses[i])] as const), fromSeventh: mean(fromSeventh), bias: bias / n, change: mean(change), changeBias: changeBias / change.length }
}

export const current: Forecaster = (entries, month, today) => forecastMonth(entries, month, today).total

const pct = (x: number) => `${(x * 100).toFixed(1)}%`

export function report(forecasters: Record<string, Forecaster>) {
  for (const [name, f] of Object.entries(forecasters)) {
    const r = backtest(f)
    const signed = (x: number) => `${x >= 0 ? "+" : ""}${pct(x)}`
    console.log(`${name.padEnd(15)} from the 7th: off by ${pct(r.fromSeventh)} (bias ${signed(r.bias)}) · ${r.byStretch.map(([l, v]) => `${l} ${pct(v)}`).join(", ")} · month a habit changes ${pct(r.change)} (bias ${signed(r.changeBias)})`)
  }
}

if (process.argv[1]?.endsWith("eval-forecast.ts")) report({ current })
