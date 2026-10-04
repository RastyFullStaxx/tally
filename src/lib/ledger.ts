// Tally's rules: reading a typed line, dates, monthly numbers, spending tips and backup merging.
// Pure functions only (no DOM, no storage), so `npm test` runs them under plain Node.
// Money is integer centavos everywhere. Dates are the phone's local day as YYYY-MM-DD.

export const CATEGORIES = {
  food: "Food",
  groceries: "Groceries",
  transport: "Transport",
  bills: "Bills",
  shopping: "Shopping",
  health: "Health",
  leisure: "Leisure",
  other: "Other",
  income: "Income",
} as const

export type CategoryId = keyof typeof CATEGORIES

export type Entry = {
  id: string
  date: string
  amount: number
  income: boolean
  note: string
  category: CategoryId
  createdAt: number
}

export type Data = { entries: Entry[]; budget: number } // budget: centavos a month, 0 = not set

export type Parsed = Pick<Entry, "amount" | "income" | "note" | "category">

// Checked in this order, so "grab food" is Food before "grab" can make it Transport.
const KEYWORDS = (
  [
    ["food", "food coffee kape starbucks jollibee mcdo mcdonalds kfc chowking inasal greenwich lunch dinner breakfast merienda snack snacks milktea tea bread pizza burger resto restaurant grabfood foodpanda 7-eleven 711 ministop fishball kwekkwek isaw taho siomai siopao lugaw turon"],
    ["groceries", "grocery groceries puregold savemore supermarket market palengke alfamart landers s&r rice"],
    ["transport", "grab angkas joyride jeep jeepney tricycle trike bus mrt lrt taxi fare gas fuel petron shell caltex parking toll beep p2p"],
    ["bills", "bill bills meralco electric electricity water maynilad pldt globe smart converge internet wifi load rent netflix spotify youtube icloud subscription insurance"],
    ["shopping", "shopee lazada tiktok uniqlo clothes shirt shoes mall gift sm"],
    ["health", "medicine meds mercury watsons pharmacy doctor clinic dentist vitamins hospital checkup gym"],
    ["leisure", "movie movies cinema concert game games steam bar beer drinks travel hotel airbnb"],
  ] as const
).map(([category, words]) => ({ category, words: new Set(words.split(" ")) }))

const INCOME_WORDS = new Set("salary sweldo payroll income bonus allowance commission freelance refund cashback".split(" "))

// Needs, not habits: "skip half your lunches" is not advice.
const NECESSITIES = new Set("lunch dinner breakfast rice fare jeep jeepney bus mrt lrt tricycle trike rent water electricity medicine".split(" "))

const DISCRETIONARY: CategoryId[] = ["food", "shopping", "leisure", "transport", "groceries"]

const AMOUNT = /^\+?(?:₱|php|p)?(\d[\d,]*(?:\.\d{1,2})?)(k?)$/i

const wordsOf = (note: string) =>
  note
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean)

/** "1,250.50" → 125050, "p150" → 15000, "25k" → 2500000; anything else → null. */
export function parseAmount(word: string): number | null {
  const m = AMOUNT.exec(word.trim())
  if (!m) return null
  const centavos = Math.round(Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1) * 100)
  return centavos > 0 ? centavos : null
}

/** The category last used for the same first word, else a keyword match, else Other. */
export function guessCategory(note: string, history: Entry[]): CategoryId {
  const words = wordsOf(note)
  if (!words.length) return "other"
  let last: Entry | undefined
  for (const e of history) {
    if (!e.income && wordsOf(e.note)[0] === words[0] && (!last || e.createdAt > last.createdAt)) last = e
  }
  if (last) return last.category
  return KEYWORDS.find((k) => words.some((w) => k.words.has(w)))?.category ?? "other"
}

/** "jollibee 245" → 245 pesos of Food. The largest number on the line is the amount; "+" means income. */
export function parseLine(text: string, history: Entry[]): Parsed | null {
  const words = text.trim().split(/\s+/).filter(Boolean)
  let at = -1
  let amount = 0
  words.forEach((w, i) => {
    const n = parseAmount(w)
    if (n !== null && n > amount) [at, amount] = [i, n]
  })
  if (at < 0) return null
  const note = words
    .filter((_, i) => i !== at)
    .join(" ")
    .replace(/^\+\s*/, "")
  const income = words[0].startsWith("+") || words[at].startsWith("+") || INCOME_WORDS.has(wordsOf(note)[0] ?? "")
  return { amount, income, note, category: income ? "income" : guessCategory(note, history) }
}

const pad = (n: number) => String(n).padStart(2, "0")

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

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", trailingZeroDisplay: "stripIfInteger" })
const pesoShort = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", notation: "compact", maximumFractionDigits: 1 })

export const formatPeso = (centavos: number) => peso.format(centavos / 100)
export const formatPesoShort = (centavos: number) => pesoShort.format(centavos / 100)
/** Whole pesos, for figures the app works out (per day, ahead of pace) rather than ones you typed. */
export const formatPesoWhole = (centavos: number) => formatPeso(Math.round(centavos / 100) * 100)
const pesos = formatPesoWhole
const pct = (x: number) => `${Math.round(x * 100)}%`

export type Summary = {
  spent: number
  income: number
  net: number
  byCategory: { category: CategoryId; total: number }[]
  cumulative: number[] // running spend per day, up to `day`
  days: number // days in the month
  day: number // days elapsed: today in the current month, all of a past month, 0 for a future one
  daysLeft: number // including today; 0 unless it's the current month
  perDay: number // budget left per remaining day
  pace: number // where an even spender would be by `day`
  projected: number // month-end estimate: bills once, everything else at the month-to-date daily rate
}

export function monthSummary(entries: Entry[], month: string, budget: number, today: string): Summary {
  const days = daysIn(month)
  const current = monthOf(today)
  const day = month === current ? Number(today.slice(8, 10)) : month < current ? days : 0
  const daily = new Array<number>(days).fill(0)
  const cats = new Map<CategoryId, number>()
  let income = 0
  for (const e of entries) {
    if (!e.date.startsWith(month)) continue
    if (e.income) {
      income += e.amount
      continue
    }
    daily[Number(e.date.slice(8, 10)) - 1] += e.amount
    cats.set(e.category, (cats.get(e.category) ?? 0) + e.amount)
  }
  const spent = daily.reduce((a, b) => a + b, 0)
  let run = 0
  const cumulative = daily.slice(0, day).map((v) => (run += v))
  const daysLeft = month === current ? days - day + 1 : 0
  const bills = cats.get("bills") ?? 0
  return {
    spent,
    income,
    net: income - spent,
    byCategory: [...cats].map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total),
    cumulative,
    days,
    day,
    daysLeft,
    perDay: budget && daysLeft ? Math.floor(Math.max(0, budget - spent) / daysLeft) : 0,
    pace: Math.round((budget * day) / days),
    projected: month === current && day ? bills + Math.round(((spent - bills) / day) * days) : day ? spent : 0,
  }
}

export function lastMonths(entries: Entry[], month: string, n = 6) {
  return Array.from({ length: n }, (_, i) => {
    const m = shiftMonth(month, i - n + 1)
    let income = 0
    let spent = 0
    for (const e of entries) {
      if (!e.date.startsWith(m)) continue
      if (e.income) income += e.amount
      else spent += e.amount
    }
    return { month: m, income, spent }
  })
}

export type Tip = { tone: "warn" | "tip" | "good"; text: string }

const TONE_ORDER = { warn: 0, tip: 1, good: 2 }

/** What to do, from the month's own numbers: warnings first, then tips by how many pesos they're worth. */
export function advise(entries: Entry[], month: string, budget: number, today: string): Tip[] {
  const s = monthSummary(entries, month, budget, today)
  if (!s.day) return []
  const current = s.daysLeft > 0
  const name = monthName(month)
  const when = current ? "this month" : `in ${name}`
  const prevMonth = shiftMonth(month, -1)
  const expenses = entries.filter((e) => !e.income && e.date.startsWith(month))
  const toMonthEnd = (amount: number) => (current ? Math.round((amount / s.day) * s.days) : amount)
  const tips: (Tip & { weight: number })[] = []
  const add = (tone: Tip["tone"], weight: number, text: string) => tips.push({ tone, weight, text })

  if (!budget) {
    const last = monthSummary(entries, prevMonth, 0, today).spent
    const suggest = Math.max(50000, Math.floor((last * 0.9) / 50000) * 50000)
    add(
      "tip",
      Number.MAX_SAFE_INTEGER,
      last
        ? `Set a monthly budget to get pace alerts. You spent ${pesos(last)} last month, so try ${pesos(suggest)}.`
        : "Set a monthly budget from the ··· menu to get pace alerts."
    )
  } else if (s.spent > budget) {
    add("warn", s.spent - budget, current ? `You're ${pesos(s.spent - budget)} over budget. Hold off on extras until the 1st.` : `You went ${pesos(s.spent - budget)} over budget in ${name}.`)
  } else if (!current) {
    add("good", 0, `You finished ${pesos(budget - s.spent)} under budget in ${name}.`)
  } else if (s.day >= 7) {
    if (s.projected > budget) add("warn", s.projected - budget, `At this pace you'll spend ${pesos(s.projected)} by month-end, ${pesos(s.projected - budget)} over budget. Keep to ${pesos(s.perDay)} a day from here.`)
    else add("good", 0, `You're on pace to finish about ${pesos(budget - s.projected)} under budget. Move it to savings when the month ends.`)
  } else if (s.spent > s.pace) {
    // Under a week of data, a month-end projection is mostly noise; say what's true instead.
    add("tip", s.spent - s.pace, `You've used ${pct(s.spent / budget)} of your budget in ${s.day} ${s.day === 1 ? "day" : "days"}. Keep to ${pesos(s.perDay)} a day from here.`)
  }

  if (s.income > 0) {
    const rate = s.net / s.income
    const goal = Math.round(s.income * 0.2) - s.net
    if (s.net < 0) add("warn", -s.net, `You've spent ${pesos(-s.net)} more than you earned ${when}.`)
    else if (rate >= 0.2) add("good", 0, current ? `You're keeping ${pct(rate)} of your income, ${pesos(s.net)} so far.` : `You kept ${pct(rate)} of your income in ${name}, ${pesos(s.net)}.`)
    else add("tip", goal, `You're keeping ${pct(rate)} of your income. Saving 20% means spending ${pesos(goal)} less.`)
  } else if (!entries.some((e) => e.income)) {
    add("tip", 2, "Log income with a plus sign, like +25000 salary, to see how much you're saving.")
  }

  // A habit category growing, compared with the same days of last month.
  const sameDaysLastMonth = entries.filter((e) => !e.income && e.date.startsWith(prevMonth) && Number(e.date.slice(8, 10)) <= s.day)
  const total = (list: Entry[], c: CategoryId) => list.reduce((n, e) => (e.category === c ? n + e.amount : n), 0)
  let grown: { category: CategoryId; now: number; before: number } | undefined
  for (const category of DISCRETIONARY) {
    const now = total(expenses, category)
    const before = total(sameDaysLastMonth, category)
    if (before > 0 && now - before >= 50000 && now >= before * 1.25 && now - before > (grown ? grown.now - grown.before : 0)) grown = { category, now, before }
  }
  if (grown) {
    const save = toMonthEnd(grown.now - grown.before)
    add("tip", save, `${CATEGORIES[grown.category]} is up ${pct((grown.now - grown.before) / grown.before)} on the same days last month (${pesos(grown.now)} vs ${pesos(grown.before)}). Getting back to last month's pace saves about ${pesos(save)}.`)
  }

  // One habit category taking a big share.
  const top = s.byCategory.find((c) => DISCRETIONARY.includes(c.category))
  if (top && top.category !== grown?.category && s.spent >= 300000 && top.total / s.spent >= 0.35) {
    const trim = toMonthEnd(top.total) / 10
    add("tip", trim, `${CATEGORIES[top.category]} takes ${pct(top.total / s.spent)} of your spending. Trimming it by 10% frees about ${pesos(trim)} a month.`)
  }

  // The same treat, again and again.
  const repeats = new Map<string, { count: number; sum: number }>()
  for (const e of expenses) {
    const w = wordsOf(e.note)[0]
    if (!w || NECESSITIES.has(w) || e.category === "bills" || e.category === "health") continue
    const r = repeats.get(w) ?? { count: 0, sum: 0 }
    repeats.set(w, { count: r.count + 1, sum: r.sum + e.amount })
  }
  const habit = [...repeats].sort((a, b) => b[1].sum - a[1].sum).find(([, r]) => r.count >= 4 && r.sum >= 50000)
  if (habit) {
    const [w, r] = habit
    add("tip", r.sum / 2, `${w[0].toUpperCase() + w.slice(1)}: ${r.count} times ${when}, ${pesos(r.sum)} in all. Cutting it in half saves about ${pesos(r.sum / 2)}.`)
  }

  // Small buys adding up.
  const small = expenses.filter((e) => e.amount < 20000)
  const smallSum = small.reduce((n, e) => n + e.amount, 0)
  if (small.length >= 10 && smallSum >= 100000 && smallSum / s.spent >= 0.15) {
    add("tip", smallSum * 0.3, `${small.length} small buys under ₱200 added up to ${pesos(smallSum)}, ${pct(smallSum / s.spent)} of your spending ${when}.`)
  }

  // Weekends vs weekdays, and no-spend days. Only days since the first entry count, and not today (it isn't over).
  const since = entries.reduce((m, e) => (e.date < m ? e.date : m), today)
  const spendOn = new Map<string, { all: number; habit: number }>()
  for (const e of expenses) {
    const d = spendOn.get(e.date) ?? { all: 0, habit: 0 }
    spendOn.set(e.date, { all: d.all + e.amount, habit: d.habit + (e.category === "bills" ? 0 : e.amount) })
  }
  let weekend = 0
  let weekday = 0
  let weekendDays = 0
  let weekdayDays = 0
  let noSpend = 0
  for (let d = 1; d <= s.day - (current ? 1 : 0); d++) {
    const date = `${month}-${pad(d)}`
    if (date < since) continue
    const spend = spendOn.get(date)
    if (!spend) noSpend++
    const dow = toDate(date).getDay()
    if (dow === 0 || dow === 6) {
      weekend += spend?.habit ?? 0
      weekendDays++
    } else {
      weekday += spend?.habit ?? 0
      weekdayDays++
    }
  }
  if (weekendDays >= 2 && weekdayDays >= 4) {
    const a = weekend / weekendDays
    const b = weekday / weekdayDays
    if (b > 0 && a >= b * 1.5 && a - b >= 20000) add("tip", (a - b) * 8, `Weekends cost you ${(a / b).toFixed(1)}× a weekday (${pesos(a)} vs ${pesos(b)} a day). Try one no-spend weekend day.`)
  }
  if (current && noSpend >= 3) add("good", 0, `${noSpend} no-spend days so far this month. Nice.`)

  return tips
    .sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || b.weight - a.weight)
    .slice(0, 4)
    .map(({ tone, text }) => ({ tone, text }))
}

export const toBackup = (data: Data, now = new Date()) => JSON.stringify({ app: "tally", version: 1, exportedAt: now.toISOString(), ...data }, null, 2)

function isEntry(x: unknown): x is Entry {
  if (!x || typeof x !== "object") return false
  const e = x as Record<string, unknown>
  return (
    typeof e.id === "string" &&
    e.id.length > 0 &&
    typeof e.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(e.date) &&
    Number.isInteger(e.amount) &&
    (e.amount as number) > 0 &&
    typeof e.income === "boolean" &&
    typeof e.note === "string" &&
    typeof e.category === "string" &&
    Object.hasOwn(CATEGORIES, e.category) &&
    typeof e.createdAt === "number"
  )
}

/** Restores a backup into what's on the phone: entries merge by id (the phone's copy wins), nothing duplicates. */
export function mergeBackup(current: Data, file: unknown): { data: Data; added: number; skipped: number } {
  const incoming = file && typeof file === "object" ? (file as Record<string, unknown>) : null
  if (!incoming || !Array.isArray(incoming.entries)) throw new Error("That file isn't a Tally backup.")
  const ids = new Set(current.entries.map((e) => e.id))
  const added: Entry[] = []
  let skipped = 0
  for (const x of incoming.entries) {
    if (!isEntry(x)) {
      skipped++
      continue
    }
    if (ids.has(x.id)) continue
    ids.add(x.id)
    const { id, date, amount, income, note, category, createdAt } = x
    added.push({ id, date, amount, income, note, category, createdAt })
  }
  const b = incoming.budget
  const budget = current.budget || (typeof b === "number" && Number.isInteger(b) && b > 0 ? b : 0)
  return { data: { entries: [...current.entries, ...added], budget }, added: added.length, skipped }
}
