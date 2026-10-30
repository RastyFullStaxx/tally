// How well does Tally guess categories? `npm run eval:classifier` replays seeded, synthetic notebooks and
// guesses each expense from the entries before it, the way the chip on the entry line does, then compares the
// guess with the category the entry was saved under. Synthetic on purpose: no real spending data is needed.
// Each persona has its own merchants (most not in the keyword list), its own filing habits (some against the
// keywords), short forms, typos, and one habit that changes halfway.
import { predictCategory, trainCategoryModel, type Prediction } from "../src/lib/classifier.ts"
import { type CategoryId, type Entry } from "../src/lib/model.ts"
import { localDate } from "../src/lib/dates.ts"

type Habit = { notes: string[]; category: CategoryId; pesos: [number, number]; weight: number; from?: number; until?: number }
type Persona = { name: string; perDay: number; habits: Habit[] }

const DAYS = 180
const DAY = 86_400_000

// Seeded, so every run (and every machine) replays the same notebooks.
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PERSONAS: Persona[] = [
  {
    name: "commuter",
    perDay: 5,
    habits: [
      { notes: ["grab to office", "grab home", "grab"], category: "transport", pesos: [150, 320], weight: 6 },
      { notes: ["jeep", "jeep to work"], category: "transport", pesos: [13, 30], weight: 5 },
      { notes: ["kuya ben trike", "trike kuya ben"], category: "transport", pesos: [20, 40], weight: 3 },
      { notes: ["jollibee", "jollibee lunch", "chickenjoy"], category: "food", pesos: [120, 280], weight: 4 },
      { notes: ["aling nena ulam", "ulam aling nena"], category: "food", pesos: [60, 120], weight: 4 },
      { notes: ["kape", "coffee", "starbucks"], category: "leisure", pesos: [90, 220], weight: 3 }, // coffee is a treat to this person
      { notes: ["tita mel store", "sari sari"], category: "groceries", pesos: [40, 300], weight: 3 },
      { notes: ["meralco", "pldt"], category: "bills", pesos: [1500, 3500], weight: 0.3 },
      { notes: ["piso wifi"], category: "bills", pesos: [5, 20], weight: 1.5 },
      { notes: ["watsons"], category: "shopping", pesos: [150, 600], weight: 0.7 }, // against the keyword (health)
      { notes: ["dra santos checkup", "biogesic"], category: "health", pesos: [30, 900], weight: 0.6 },
      { notes: ["shopee", "lazada order"], category: "shopping", pesos: [200, 1500], weight: 1 },
      { notes: ["zumba class"], category: "health", pesos: [100, 150], weight: 1, until: 90 },
      { notes: ["zumba class"], category: "leisure", pesos: [100, 150], weight: 1, from: 90 }, // the habit that changes
      { notes: ["gcash fee", "bank fee"], category: "other", pesos: [10, 25], weight: 0.8 },
    ],
  },
  {
    name: "student",
    perDay: 4,
    habits: [
      { notes: ["lrt", "lrt beep", "mrt"], category: "transport", pesos: [15, 35], weight: 5 },
      { notes: ["angkas", "joyride"], category: "transport", pesos: [80, 200], weight: 1.5 },
      { notes: ["siomai rice", "siomai", "fishball"], category: "food", pesos: [25, 90], weight: 5 },
      { notes: ["canteen lunch", "canteen"], category: "food", pesos: [60, 110], weight: 5 },
      { notes: ["milktea", "milk tea", "chatime"], category: "food", pesos: [90, 160], weight: 3 },
      { notes: ["photocopy", "xerox"], category: "other", pesos: [5, 60], weight: 3 },
      { notes: ["bond paper", "notebook", "ballpen"], category: "shopping", pesos: [20, 150], weight: 2 },
      { notes: ["load", "globe load", "smart load"], category: "bills", pesos: [50, 100], weight: 1.5 },
      { notes: ["spotify", "netflix"], category: "bills", pesos: [149, 549], weight: 0.3 },
      { notes: ["sm", "sm mall"], category: "leisure", pesos: [100, 600], weight: 1 }, // against the keyword (shopping)
      { notes: ["valorant", "steam game", "ml diamonds"], category: "leisure", pesos: [50, 500], weight: 1.2 },
      { notes: ["boarding house rent"], category: "bills", pesos: [3000, 4500], weight: 0.15 },
      { notes: ["paracetamol", "clinic"], category: "health", pesos: [10, 300], weight: 0.4 },
    ],
  },
  {
    name: "household",
    perDay: 6,
    habits: [
      { notes: ["puregold", "puregold groceries"], category: "groceries", pesos: [800, 3500], weight: 1.5 },
      { notes: ["palengke", "palengke isda", "palengke gulay"], category: "groceries", pesos: [150, 900], weight: 4 },
      { notes: ["rice 25kg", "bigas"], category: "groceries", pesos: [1200, 1600], weight: 0.4 },
      { notes: ["tindahan ni aling rosa", "aling rosa"], category: "groceries", pesos: [30, 200], weight: 4 },
      { notes: ["baon kids", "baon"], category: "other", pesos: [100, 300], weight: 4 },
      { notes: ["school service", "tricycle school"], category: "transport", pesos: [40, 120], weight: 3 },
      { notes: ["gas petron", "shell gas"], category: "transport", pesos: [800, 2000], weight: 0.8 },
      { notes: ["meralco", "maynilad", "converge"], category: "bills", pesos: [900, 4500], weight: 0.5 },
      { notes: ["lpg", "gasul"], category: "bills", pesos: [950, 1100], weight: 0.3 },
      { notes: ["mercury drug", "vitamins kids"], category: "health", pesos: [150, 1200], weight: 1 },
      { notes: ["jollibee family", "mang inasal", "chowking"], category: "food", pesos: [400, 1500], weight: 1.2 },
      { notes: ["merienda", "pandesal"], category: "food", pesos: [30, 120], weight: 3 },
      { notes: ["uniqlo kids", "school shoes"], category: "shopping", pesos: [400, 2000], weight: 0.4 },
      { notes: ["simbahan", "abuloy"], category: "other", pesos: [20, 200], weight: 1 },
      { notes: ["7-eleven", "711"], category: "groceries", pesos: [40, 250], weight: 1.5 }, // against the keyword (food)
    ],
  },
]

const FILLERS = ["lunch", "dinner", "w/ friends", "for mom", "2x", "again", "today", "sa mall", "pasalubong"]

/** How people actually type on a phone: mostly clean, sometimes short, misspelled or with an extra word. */
function typed(note: string, next: () => number) {
  const words = note.split(" ")
  const r = next()
  const i = Math.floor(next() * words.length)
  const w = words[i]
  if (r < 0.1 && w.length >= 5)
    words[i] = w.slice(0, 3 + Math.floor(next() * 2)) // short form: "pureg", "jolli"
  else if (r < 0.2 && w.length >= 5) {
    const at = 1 + Math.floor(next() * (w.length - 2))
    const kind = next()
    words[i] =
      kind < 0.4
        ? w.slice(0, at) + w.slice(at + 1) // a dropped letter: "jolibee"
        : kind < 0.7
          ? w.slice(0, at - 1) + w[at] + w[at - 1] + w.slice(at + 1) // swapped: "jollbiee"
          : w.slice(0, at) + w[at] + w.slice(at) // doubled: "puregoold"
  } else if (r < 0.32) words.push(FILLERS[Math.floor(next() * FILLERS.length)])
  if (next() < 0.15) return words.join(" ").replace(/^./, (c) => c.toUpperCase())
  return words.join(" ")
}

export function notebook(persona: Persona, seed: number): Entry[] {
  const next = random(seed)
  const start = new Date(2026, 3, 1, 12)
  const entries: Entry[] = []
  for (let day = 0; day < DAYS; day++) {
    const live = persona.habits.filter((h) => (h.from ?? 0) <= day && day < (h.until ?? DAYS))
    const total = live.reduce((n, h) => n + h.weight, 0)
    const count = Math.max(1, Math.round(persona.perDay * (0.5 + next())))
    for (let k = 0; k < count; k++) {
      let pick = next() * total
      const habit = live.find((h) => (pick -= h.weight) < 0) ?? live[0]
      const note = typed(habit.notes[Math.floor(next() * habit.notes.length)], next)
      const pesos = habit.pesos[0] + Math.floor(next() * (habit.pesos[1] - habit.pesos[0] + 1))
      const at = start.getTime() + day * DAY + k * 60_000
      entries.push({ id: `${persona.name}-${entries.length}`, date: localDate(new Date(at)), amount: pesos * 100, income: false, note, category: habit.category, createdAt: at })
    }
  }
  return entries
}

export type Guesser = (history: Entry[], note: string, amount: number) => Prediction

/** Prequential accuracy: each entry is guessed from the ones before it, then joins them, like typing day by day. */
export function replay(entries: Entry[], guess: Guesser) {
  const bySource = new Map<string, { n: number; right: number }>()
  let right = 0
  let fresh = 0
  let freshRight = 0
  const seen = new Set<string>()
  entries.forEach((e, i) => {
    const p = guess(entries.slice(0, i), e.note, e.amount)
    const ok = p.category === e.category
    right += Number(ok)
    const key = e.note.toLowerCase().trim()
    if (!seen.has(key)) {
      fresh++
      freshRight += Number(ok)
      seen.add(key)
    }
    const s = bySource.get(p.source) ?? { n: 0, right: 0 }
    s.n++
    s.right += Number(ok)
    bySource.set(p.source, s)
  })
  return { n: entries.length, accuracy: right / entries.length, fresh, freshAccuracy: freshRight / fresh, bySource }
}

export const current: Guesser = (history, note, amount) => predictCategory(trainCategoryModel(history), note, amount)

const pct = (x: number) => `${(x * 100).toFixed(1)}%`

export function report(guessers: Record<string, Guesser>, seeds = [1, 2, 3]) {
  for (const [name, guess] of Object.entries(guessers)) {
    let n = 0
    let right = 0
    let fresh = 0
    let freshRight = 0
    const sources = new Map<string, { n: number; right: number }>()
    const per: string[] = []
    for (const persona of PERSONAS) {
      for (const seed of seeds) {
        const r = replay(notebook(persona, seed * 7919 + persona.name.length), guess)
        n += r.n
        right += r.accuracy * r.n
        fresh += r.fresh
        freshRight += r.freshAccuracy * r.fresh
        for (const [s, v] of r.bySource) {
          const t = sources.get(s) ?? { n: 0, right: 0 }
          t.n += v.n
          t.right += v.right
          sources.set(s, t)
        }
        if (seed === seeds[0]) per.push(`${persona.name} ${pct(r.accuracy)}`)
      }
    }
    const split = [...sources].map(([s, v]) => `${s} ${v.n} at ${pct(v.right / v.n)}`).join(", ")
    console.log(`${name.padEnd(10)} all ${pct(right / n)} · first time a note is typed ${pct(freshRight / fresh)} (${fresh}) · ${per.join(", ")}\n${"".padEnd(10)} by source: ${split}`)
  }
}

if (import.meta.main ?? process.argv[1]?.endsWith("eval-classifier.ts")) report({ current })
