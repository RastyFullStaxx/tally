// Tally's core: entries, reading a typed line, dates, money, monthly totals and backup merging.
// Insights live in insights.ts and the category learner in classifier.ts.
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
  savings: "Savings",
} as const

export type CategoryId = keyof typeof CATEGORIES

/**
 * One line in the notebook. A savings entry (category "savings") is money moved aside (`income: false`)
 * or taken back out (`income: true`): it is neither spending nor income.
 */
export type Entry = {
  id: string
  date: string
  amount: number
  income: boolean
  note: string
  category: CategoryId
  createdAt: number
  updatedAt?: number // last saved edit; the category learner treats a correction as fresh
}

export type Goal = { name: string; amount: number }

/** A Helpful / Not helpful answer on a tip, with the numbers the tip was based on (training data for a future model). */
export type TipVote = { id: string; kind: string; vote: 1 | -1; at: number; features: Record<string, number> }

/** Your answer on a bill Tally detected, by its item ("meralco"): it is one, or it isn't. Nothing is added either way. */
export type BillDecision = "bill" | "not"

export type Data = { entries: Entry[]; budget: number; goal?: Goal; votes?: TipVote[]; bills?: Record<string, BillDecision> } // budget: centavos a month, 0 = not set

/** The items you said aren't bills: insights stop treating them as bills. */
export const notBills = (data: Pick<Data, "bills">) => Object.keys(data.bills ?? {}).filter((item) => data.bills![item] === "not")

export type Parsed = Pick<Entry, "amount" | "income" | "note" | "category">

export const isSaving = (e: Pick<Entry, "category">) => e.category === "savings"
export const isIncome = (e: Pick<Entry, "income" | "category">) => e.income && !isSaving(e)
export const isExpense = (e: Pick<Entry, "income" | "category">) => !e.income && !isSaving(e)

// Checked in this order, so "grab food" is Food before "grab" can make it Transport.
export const KEYWORDS = (
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
const SAVE_WORDS = new Set("save saved savings ipon".split(" "))
const WITHDRAW_WORDS = new Set("withdraw withdrew".split(" "))
// Joining words left out of a savings note: "2000 to savings" needs none, "ipon para sa laptop" is "laptop".
const SAVING_FILLER = new Set("to into in from for my the put move moved transfer transferred add added deposit deposited sa para ng nag mag ko".split(" "))

const AMOUNT = /^\+?(?:₱|php|p)?(\d[\d,]*(?:\.\d{1,2})?)(k?)$/i

export const wordsOf = (note: string) =>
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

/** The built-in guess: the first category whose keywords appear in the note, else Other. */
export function keywordCategory(note: string): CategoryId {
  const words = wordsOf(note)
  return KEYWORDS.find((k) => words.some((w) => k.words.has(w)))?.category ?? "other"
}

export type Guess = (note: string, amount: number) => CategoryId

/**
 * "jollibee 245" → 245 pesos of Food. The largest number on the line is the amount; "+" means income;
 * a save word anywhere ("save 2000", "2000 to savings") puts money into savings and "withdraw 500" takes
 * it out. `guess` picks an expense's category: the learned classifier in the app, keywords alone by default.
 */
export function parseLine(text: string, guess: Guess = keywordCategory): Parsed | null {
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
  const lower = wordsOf(note)
  const first = lower[0] ?? ""
  const moves = (w: string) => SAVE_WORDS.has(w) || WITHDRAW_WORDS.has(w)
  // "save more" is SaveMore, the supermarket.
  if (lower.some(moves) && !/\bsave\s+more\b/i.test(note)) {
    const label = note.split(/\s+/).filter((w) => {
      const word = wordsOf(w)[0] ?? ""
      return !moves(word) && !SAVING_FILLER.has(word)
    })
    return { amount, income: lower.some((w) => WITHDRAW_WORDS.has(w)), note: label.join(" "), category: "savings" }
  }
  const income = words[0].startsWith("+") || words[at].startsWith("+") || INCOME_WORDS.has(first)
  // The learned guess can say income too, for a note that was income last time ("noemi payment").
  const category = income ? "income" : guess(note, amount)
  return { amount, income: category === "income", note, category }
}

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

const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", trailingZeroDisplay: "stripIfInteger" })
const pesoShort = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", notation: "compact", maximumFractionDigits: 1 })

export const formatPeso = (centavos: number) => peso.format(centavos / 100)
export const formatPesoShort = (centavos: number) => pesoShort.format(centavos / 100)
/** Whole pesos, for figures the app works out (per day, ahead of pace) rather than ones you typed. */
export const formatPesoWhole = (centavos: number) => formatPeso(Math.round(centavos / 100) * 100)

export type Summary = {
  spent: number
  income: number
  net: number
  saved: number // put into savings minus taken out
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
  let saved = 0
  for (const e of entries) {
    if (!e.date.startsWith(month)) continue
    if (isSaving(e)) saved += e.income ? -e.amount : e.amount
    else if (e.income) income += e.amount
    else {
      daily[Number(e.date.slice(8, 10)) - 1] += e.amount
      cats.set(e.category, (cats.get(e.category) ?? 0) + e.amount)
    }
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
    saved,
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
      if (isIncome(e)) income += e.amount
      else if (isExpense(e)) spent += e.amount
    }
    return { month: m, income, spent }
  })
}

/** A search's category filter: one category (Income and Savings included), or everything. */
export type Filter = "all" | CategoryId

// Lowercase without accents, so "pina" finds "piña".
const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

/** One typed word against one entry: part of the note, the start of the category's name, or the exact amount. */
function matches(e: Entry, word: string) {
  if (fold(e.note).includes(word) || fold(CATEGORIES[e.category]).startsWith(word)) return true
  const amount = parseAmount(word)
  return amount !== null && amount === e.amount
}

/** Entries in the filter where every word typed matches ("jolli", "grab office", "245", "food"), newest first. */
export function searchEntries(entries: Entry[], query: string, filter: Filter = "all"): Entry[] {
  const words = wordsOf(fold(query))
  return entries
    .filter((e) => (filter === "all" || e.category === filter) && words.every((w) => matches(e, w)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
}

/** What a set of entries adds up to: spending, income, and what went into savings net of withdrawals. */
export function totalsOf(entries: Entry[]) {
  let spent = 0
  let income = 0
  let saved = 0
  for (const e of entries) {
    if (isSaving(e)) saved += e.income ? -e.amount : e.amount
    else if (e.income) income += e.amount
    else spent += e.amount
  }
  return { spent, income, saved }
}

/** What a delete took out and where it sat, so Undo can put it back exactly. */
export type Removed = { entry: Entry; index: number }

export function removeEntry(data: Data, id: string): { data: Data; removed: Removed | null } {
  const index = data.entries.findIndex((e) => e.id === id)
  if (index < 0) return { data, removed: null }
  return { data: { ...data, entries: data.entries.filter((e) => e.id !== id) }, removed: { entry: data.entries[index], index } }
}

/** Undoes a delete: the same entry, id and all, back in its old place. Nothing changes if that id is already back (an import restored it). */
export function restoreEntry(data: Data, { entry, index }: Removed): Data {
  if (data.entries.some((e) => e.id === entry.id)) return data
  const at = Math.min(index, data.entries.length)
  return { ...data, entries: [...data.entries.slice(0, at), entry, ...data.entries.slice(at)] }
}

// A note typed as "=1+1" or "-50 refund" must stay text: spreadsheets would run it as a formula.
const FORMULA = /^[=+\-@\t\r]/

/** One CSV field: a guard on formula-like notes, and quotes around commas, quotes and line breaks (RFC 4180). */
function csvField(value: string) {
  const text = FORMULA.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const typeOf = (e: Entry) => (isSaving(e) ? (e.income ? "From savings" : "To savings") : e.income ? "Income" : "Expense")

/**
 * Every entry as a spreadsheet: Date, Type, Category, Note and Amount in pesos, oldest first. Amounts are plain
 * numbers ("1250.50") so they add up; Type says which way the money went. Starts with a byte-order mark so Excel
 * reads ₱ and ñ as UTF-8, and uses CRLF line ends.
 */
export function toCsv(entries: Entry[]) {
  const rows = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .map((e) => [e.date, typeOf(e), CATEGORIES[e.category], e.note, `${Math.floor(e.amount / 100)}.${pad(e.amount % 100)}`].map(csvField).join(","))
  return "\uFEFF" + ["Date,Type,Category,Note,Amount", ...rows].join("\r\n") + "\r\n"
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

const isGoal = (x: unknown): x is Goal =>
  !!x && typeof x === "object" && typeof (x as Goal).name === "string" && Number.isInteger((x as Goal).amount) && (x as Goal).amount > 0

const isVote = (x: unknown): x is TipVote => {
  if (!x || typeof x !== "object") return false
  const v = x as Record<string, unknown>
  return (
    typeof v.id === "string" &&
    typeof v.kind === "string" &&
    (v.vote === 1 || v.vote === -1) &&
    typeof v.at === "number" &&
    !!v.features &&
    typeof v.features === "object" &&
    Object.values(v.features).every((n) => typeof n === "number")
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
    const { id, date, amount, income, note, category, createdAt, updatedAt } = x
    added.push({ id, date, amount, income, note, category, createdAt, ...(typeof updatedAt === "number" ? { updatedAt } : {}) })
  }
  const b = incoming.budget
  const budget = current.budget || (typeof b === "number" && Number.isInteger(b) && b > 0 ? b : 0)
  const goal = current.goal ?? (isGoal(incoming.goal) ? { name: incoming.goal.name, amount: incoming.goal.amount } : undefined)
  const votes = current.votes?.length ? current.votes : Array.isArray(incoming.votes) ? incoming.votes.filter(isVote) : []
  // Bill answers merge by item, and the phone's answer wins, like entries.
  const bills: Record<string, BillDecision> = {}
  const theirs = incoming.bills && typeof incoming.bills === "object" ? (incoming.bills as Record<string, unknown>) : {}
  for (const [item, d] of Object.entries(theirs)) if (d === "bill" || d === "not") bills[item] = d
  Object.assign(bills, current.bills)
  return {
    data: { entries: [...current.entries, ...added], budget, ...(goal ? { goal } : {}), ...(votes.length ? { votes } : {}), ...(Object.keys(bills).length ? { bills } : {}) },
    added: added.length,
    skipped,
  }
}
