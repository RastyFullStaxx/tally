// Working with entries: monthly totals, search, and delete with undo. Pure functions only (no DOM, no storage),
// so `npm test` runs them under plain Node. Insights live in insights.ts and the category learner in classifier.ts.
import { CATEGORIES, isExpense, isIncome, isSaving, type BillDecision, type CategoryId, type Data, type Entry } from "./model.ts"
import { parseAmount, wordsOf } from "./parse.ts"
import { daysIn, monthOf, shiftMonth } from "./dates.ts"

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
  return entries.filter((e) => (filter === "all" || e.category === filter) && words.every((w) => matches(e, w))).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
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

/** Adds an entry, or replaces the one with the same id where it sits. */
export function upsertEntry(data: Data, entry: Entry): Data {
  const at = data.entries.findIndex((e) => e.id === entry.id)
  return { ...data, entries: at < 0 ? [...data.entries, entry] : data.entries.with(at, entry) }
}

/** Sets or clears your answer on one detected bill. No answers left means no `bills` key, as data always looked. */
export function withBill(data: Data, item: string, decision: BillDecision | null): Data {
  const bills = { ...data.bills }
  if (decision) bills[item] = decision
  else delete bills[item]
  const next: Data = { ...data, bills }
  if (!Object.keys(bills).length) delete next.bills
  return next
}
