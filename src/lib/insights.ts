// Tally's insights: how the money went, what's normal for you, bills that repeat, what's safe to spend,
// savings, and plain-language tips ranked by what you've found helpful. All computed on the phone from
// your own entries. Pure functions, so `npm test` runs them under plain Node.
import {
  CATEGORIES,
  daysIn,
  formatPeso,
  formatPesoWhole as pesos,
  isExpense,
  isIncome,
  isSaving,
  lastMonths,
  monthName,
  monthOf,
  monthSummary,
  pad,
  shiftDay,
  shiftMonth,
  toDate,
  wordsOf,
  type CategoryId,
  type Entry,
  type Goal,
  type Summary,
  type TipVote,
} from "./ledger.ts"

const NEEDS: CategoryId[] = ["bills", "groceries", "transport", "health"]
const WANTS: CategoryId[] = ["food", "shopping", "leisure"]

// Needs, not habits: "skip half your lunches" is not advice.
const NECESSITIES = new Set("lunch dinner breakfast rice fare jeep jeepney bus mrt lrt tricycle trike rent water electricity medicine".split(" "))

const pct = (x: number) => `${Math.round(x * 100)}%`
const dayOf = (date: string) => Number(date.slice(8, 10))
const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1)
const itemOf = (e: Entry) => wordsOf(e.note)[0] ?? CATEGORIES[e.category].toLowerCase()
const sum = (list: Entry[]) => list.reduce((n, e) => n + e.amount, 0)
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const expensesIn = (entries: Entry[], month: string, uptoDay = 31) => entries.filter((e) => isExpense(e) && e.date.startsWith(month) && dayOf(e.date) <= uptoDay)
const shortDate = (date: string) => toDate(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
const firstDate = (entries: Entry[], fallback: string) => entries.reduce((m, e) => (e.date < m ? e.date : m), fallback)
const daysBetween = (from: string, to: string) => Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000)

export type ItemGroup = { item: string; count: number; total: number }

/** Entries grouped by their first word ("starbucks", "grab"), biggest total first. */
function topItems(list: Entry[], n = 3): ItemGroup[] {
  const groups = new Map<string, ItemGroup>()
  for (const e of list) {
    const item = itemOf(e)
    const g = groups.get(item) ?? { item, count: 0, total: 0 }
    groups.set(item, { item, count: g.count + 1, total: g.total + e.amount })
  }
  return [...groups.values()].sort((a, b) => b.total - a.total).slice(0, n)
}

/** "Starbucks (4×, ₱720), Jollibee (₱245)" */
const describeItems = (items: ItemGroup[]) => items.map((i) => `${capitalize(i.item)} (${i.count > 1 ? `${i.count}×, ` : ""}${pesos(i.total)})`).join(", ")

export type CategoryDetail = {
  category: CategoryId
  total: number
  share: number
  count: number
  average: number
  before: number // the same days of last month
  change: number | null // against `before`; null when last month had none
  top: ItemGroup[]
  biggest: Entry
}

/** How each category's money went: on what, how often, and against the same days of last month. */
export function categoryDetail(entries: Entry[], month: string, today: string): CategoryDetail[] {
  const s = monthSummary(entries, month, 0, today)
  const expenses = expensesIn(entries, month)
  const earlier = expensesIn(entries, shiftMonth(month, -1), s.day)
  return s.byCategory.map(({ category, total }) => {
    const mine = expenses.filter((e) => e.category === category)
    const before = sum(earlier.filter((e) => e.category === category))
    return {
      category,
      total,
      share: total / s.spent,
      count: mine.length,
      average: Math.round(total / mine.length),
      before,
      change: before ? (total - before) / before : null,
      top: topItems(mine),
      biggest: mine.reduce((a, b) => (b.amount > a.amount ? b : a)),
    }
  })
}

export type Patterns = {
  perDay: number
  needs: number // bills, groceries, transport, health
  wants: number // food, shopping, leisure
  other: number
  weekdayAvg: number // wants per day: needs such as Saturday groceries would skew it
  weekendAvg: number
  weekdayDays: number // days counted: since the first entry, and not today (it isn't over)
  weekendDays: number
  busiest: { date: string; total: number } | null
  largest: Entry | null
  noSpend: number
}

export function spendingPatterns(entries: Entry[], month: string, today: string): Patterns {
  const s = monthSummary(entries, month, 0, today)
  const expenses = expensesIn(entries, month)
  const current = s.daysLeft > 0
  const inGroup = (group: CategoryId[]) => sum(expenses.filter((e) => group.includes(e.category)))
  const needs = inGroup(NEEDS)
  const wants = inGroup(WANTS)

  const byDay = new Map<string, { all: number; wants: number }>()
  for (const e of expenses) {
    const d = byDay.get(e.date) ?? { all: 0, wants: 0 }
    byDay.set(e.date, { all: d.all + e.amount, wants: d.wants + (WANTS.includes(e.category) ? e.amount : 0) })
  }
  let busiest: Patterns["busiest"] = null
  for (const [date, d] of byDay) if (!busiest || d.all > busiest.total) busiest = { date, total: d.all }

  const since = firstDate(entries, today)
  let weekend = 0
  let weekday = 0
  let weekendDays = 0
  let weekdayDays = 0
  let noSpend = 0
  for (let d = 1; d <= s.day - (current ? 1 : 0); d++) {
    const date = `${month}-${pad(d)}`
    if (date < since) continue
    const spend = byDay.get(date)
    if (!spend) noSpend++
    const dow = toDate(date).getDay()
    if (dow === 0 || dow === 6) {
      weekend += spend?.wants ?? 0
      weekendDays++
    } else {
      weekday += spend?.wants ?? 0
      weekdayDays++
    }
  }

  return {
    perDay: s.day ? Math.round(s.spent / s.day) : 0,
    needs,
    wants,
    other: s.spent - needs - wants,
    weekdayAvg: weekdayDays ? weekday / weekdayDays : 0,
    weekendAvg: weekendDays ? weekend / weekendDays : 0,
    weekdayDays,
    weekendDays,
    busiest,
    largest: expenses.length ? expenses.reduce((a, b) => (b.amount > a.amount ? b : a)) : null,
    noSpend,
  }
}

export type Recurring = { item: string; category: CategoryId; amount: number; day: number; months: number; paid: boolean; due: string }

/**
 * Bills that come once a month: the same item logged exactly once a month in at least 2 of the last 3 months,
 * at a similar amount (within 40%) and on a similar day (within 7). Daily lunches drop out on their own.
 */
export function recurringBills(entries: Entry[], today: string): Recurring[] {
  const month = monthOf(today)
  const window = [1, 2, 3].map((i) => shiftMonth(month, -i))
  const byItem = new Map<string, Entry[]>()
  for (const e of entries) {
    if (!isExpense(e) || !(window.includes(monthOf(e.date)) || monthOf(e.date) === month)) continue
    const item = itemOf(e)
    byItem.set(item, [...(byItem.get(item) ?? []), e])
  }
  const bills: Recurring[] = []
  for (const [item, list] of byItem) {
    const past = list.filter((e) => monthOf(e.date) !== month)
    const perMonth = new Map<string, number>()
    for (const e of past) perMonth.set(monthOf(e.date), (perMonth.get(monthOf(e.date)) ?? 0) + 1)
    if (perMonth.size < 2 || [...perMonth.values()].some((n) => n > 1)) continue
    const amount = median(past.map((e) => e.amount))
    // ponytail: days compared on the calendar, so a bill that drifts across month-end (30th → 2nd) isn't matched.
    const day = Math.round(median(past.map((e) => dayOf(e.date))))
    if (past.some((e) => Math.abs(e.amount - amount) > amount * 0.4 || Math.abs(dayOf(e.date) - day) > 7)) continue
    const latest = past.reduce((a, b) => (b.date > a.date ? b : a))
    const paid = list.some((e) => monthOf(e.date) === month)
    const dueMonth = paid ? shiftMonth(month, 1) : month
    bills.push({ item, category: latest.category, amount: Math.round(amount), day, months: perMonth.size, paid, due: `${dueMonth}-${pad(Math.min(day, daysIn(dueMonth)))}` })
  }
  return bills.sort((a, b) => a.due.localeCompare(b.due))
}

/** Recurring bills not yet logged this month: money that's spoken for. */
const unpaidThisMonth = (bills: Recurring[], today: string) => bills.filter((b) => !b.paid && monthOf(b.due) === monthOf(today))

export type Unusual = { category: CategoryId; thisWeek: number; usual: number; weeks: number; direction: "high" | "low" }

/** The last 7 days of each category against your usual week: the middle of up to 8 earlier weeks (needs 4). */
export function unusualWeeks(entries: Entry[], today: string): Unusual[] {
  const recurring = new Set(recurringBills(entries, today).map((b) => b.item))
  const counted = entries.filter((e) => isExpense(e) && e.category !== "bills" && !recurring.has(itemOf(e)))
  const first = firstDate(entries, today)
  const weekEnds = [1, 2, 3, 4, 5, 6, 7, 8].map((k) => shiftDay(today, -7 * k)).filter((end) => shiftDay(end, -6) >= first)
  if (weekEnds.length < 4) return []
  const weekTotal = (end: string, category: CategoryId) => {
    const start = shiftDay(end, -6)
    return counted.reduce((n, e) => (e.category === category && e.date >= start && e.date <= end ? n + e.amount : n), 0)
  }
  const found: Unusual[] = []
  for (const category of new Set(counted.map((e) => e.category))) {
    const thisWeek = weekTotal(today, category)
    const usual = median(weekEnds.map((end) => weekTotal(end, category)))
    if (thisWeek >= usual * 1.5 && thisWeek - usual >= 50000) found.push({ category, thisWeek, usual, weeks: weekEnds.length, direction: "high" })
    else if (WANTS.includes(category) && usual >= 100000 && thisWeek <= usual * 0.5) found.push({ category, thisWeek, usual, weeks: weekEnds.length, direction: "low" })
  }
  return found.sort((a, b) => Math.abs(b.thisWeek - b.usual) - Math.abs(a.thisWeek - a.usual))
}

export type OddAmount = { item: string; usual: number; times: number; direction: "high" | "low" }

/**
 * A new expense far from what the same thing usually costs, which is most often a typo ("coffee 1200" for 120).
 * "The same thing" is the same first word in the same category, logged at least 5 times in the 180 days before.
 * High means 4× the usual (the middle amount), more than half again the most ever paid, and ₱200 over; low
 * means a quarter of the usual, under two-thirds of the least ever paid, and ₱100 under. So a ₱15 jeep ride
 * that becomes ₱60, or a pricier Grab across town, isn't flagged.
 */
export function unusualAmount(entries: Entry[], entry: Entry): OddAmount | null {
  if (!isExpense(entry) || !wordsOf(entry.note).length) return null
  const item = itemOf(entry)
  const from = shiftDay(entry.date, -180)
  const past = entries.filter((e) => e.id !== entry.id && isExpense(e) && e.category === entry.category && itemOf(e) === item && e.date >= from && e.date <= entry.date)
  if (past.length < 5) return null
  const amounts = past.map((e) => e.amount)
  const usual = median(amounts)
  const times = entry.amount / usual
  if (times >= 4 && entry.amount > Math.max(...amounts) * 1.5 && entry.amount - usual >= 20000) return { item, usual, times, direction: "high" }
  if (times <= 0.25 && entry.amount * 1.5 < Math.min(...amounts) && usual - entry.amount >= 10000) return { item, usual, times, direction: "low" }
  return null
}

/** What the notice says about an odd amount, in plain words. A factor near 10 is usually one zero too many or too few. */
export function describeOddAmount(odd: OddAmount, amount: number): string {
  const tenfold = odd.direction === "high" ? odd.times >= 8 && odd.times <= 12 : odd.times >= 1 / 12 && odd.times <= 1 / 8
  const what = odd.direction === "high" ? `is ${Math.round(odd.times)}× the usual ${pesos(odd.usual)}` : `is far below the usual ${pesos(odd.usual)}`
  return `${formatPeso(amount)} for ${odd.item} ${what}.${tenfold ? (odd.direction === "high" ? " An extra zero?" : " A zero missing?") : ""}`
}

export type Forecast = { total: number; upcoming: number; dailyRate: number; fromHistory: boolean }

/**
 * Month-end spending: what's spent, plus recurring bills still to come, plus everyday spending at its daily rate
 * for the days left. The rate is this month's after a week; before that, your last 4 weeks if there's that much history.
 */
export function forecastMonth(entries: Entry[], month: string, today: string): Forecast {
  const s = monthSummary(entries, month, 0, today)
  if (month !== monthOf(today)) return { total: s.spent, upcoming: 0, dailyRate: 0, fromHistory: false }
  const bills = recurringBills(entries, today)
  const recurring = new Set(bills.map((b) => b.item))
  const everyday = (e: Entry) => isExpense(e) && e.category !== "bills" && !recurring.has(itemOf(e))
  const upcoming = unpaidThisMonth(bills, today).reduce((n, b) => n + b.amount, 0)
  let dailyRate = sum(expensesIn(entries, month).filter(everyday)) / s.day
  let fromHistory = false
  const start = shiftDay(today, -28)
  if (s.day < 7 && firstDate(entries, today) <= start) {
    dailyRate = sum(entries.filter((e) => everyday(e) && e.date >= start && e.date < today)) / 28
    fromHistory = true
  }
  return { total: Math.round(s.spent + upcoming + dailyRate * (s.days - s.day)), upcoming, dailyRate, fromHistory }
}

export type Safe = { today: number; perDay: number; upcoming: number; spentToday: number; daysLeft: number }

/** What you can spend today and stay within budget, after the recurring bills still to come this month. */
export function safeToSpend(entries: Entry[], budget: number, today: string): Safe | null {
  if (!budget) return null
  const s = monthSummary(entries, monthOf(today), budget, today)
  const spentToday = sum(entries.filter((e) => isExpense(e) && e.date === today))
  const upcoming = unpaidThisMonth(recurringBills(entries, today), today).reduce((n, b) => n + b.amount, 0)
  const perDay = Math.floor((budget - (s.spent - spentToday) - upcoming) / s.daysLeft)
  return { today: perDay - spentToday, perDay, upcoming, spentToday, daysLeft: s.daysLeft }
}

export type Savings = {
  total: number
  thisMonth: number
  monthlyAvg: number // your pace: put aside per day since you started (180 days at most), as a 30-day month
  deposits: number
  goal: (Goal & { progress: number; left: number; eta: string | null }) | null // eta: "March 2027"
}

export function savingsSummary(entries: Entry[], goal: Goal | undefined, today: string): Savings {
  const saving = entries.filter(isSaving)
  const total = saving.reduce((n, e) => n + (e.income ? -e.amount : e.amount), 0)
  const month = monthOf(today)
  // Savings go in whenever there's money to spare, not monthly, so the pace is per day. Under a month of history
  // counts as a month, so a single deposit isn't stretched into a promise.
  const from = [firstDate(saving, today), shiftDay(today, -179)].sort()[1]
  const net = saving.filter((e) => e.date >= from && e.date <= today).reduce((n, e) => n + (e.income ? -e.amount : e.amount), 0)
  const monthlyAvg = saving.length ? (Math.max(0, net) / Math.max(30, daysBetween(from, today) + 1)) * 30 : 0
  let summary: Savings["goal"] = null
  if (goal) {
    const left = Math.max(0, goal.amount - total)
    const eta = left === 0 ? null : monthlyAvg > 0 ? toDate(shiftMonth(month, Math.ceil(left / monthlyAvg))).toLocaleDateString("en-PH", { month: "long", year: "numeric" }) : null
    summary = { ...goal, progress: Math.min(1, Math.max(0, total / goal.amount)), left, eta }
  }
  return { total, thisMonth: monthSummary(entries, month, 0, today).saved, monthlyAvg, deposits: saving.filter((e) => !e.income).length, goal: summary }
}

export type IncomeStream = { source: string; monthly: number; regular: boolean; received: number }
export type IncomeProfile = {
  months: number // full months learned from; typical, lean and high need 2
  typical: number
  lean: number // the leanest of those months: the income to plan on
  high: number
  steady: boolean // every month within 20% of the typical one
  streams: IncomeStream[] // where it comes from, biggest first
  expected: number // still to come this month from sources that come back, by what they usually bring
  gapDays: number | null // usual days between payments
  sinceDays: number // days since the last one
  last: Entry
  usualPayment: number | null // the middle-sized payment of the last 180 days
}

/**
 * What Tally has learned about your income. Nobody tells it a salary: income is whatever you log, whenever it
 * comes. A source is a note's first word ("salary", "noemi"); it comes back if it showed up in at least 2 of the
 * last 3 full months, or, with less history, last month. Everything else counts as a one-off, never as expected.
 */
export function incomeProfile(entries: Entry[], today: string): IncomeProfile | null {
  const incomes = entries.filter((e) => isIncome(e) && e.date <= today)
  if (!incomes.length) return null
  const month = monthOf(today)
  const prev = shiftMonth(month, -1)
  // Full months (tracking had begun by the 3rd), including months that brought nothing: those are the lean ones.
  const since = firstDate(entries, today)
  const full = lastMonths(entries, prev, 6).filter((m) => m.spent > 0 && `${m.month}-03` >= since)
  const totals = full.map((m) => m.income)
  const lastThree = full.slice(-3).map((m) => m.month)
  const bySource = new Map<string, Entry[]>()
  for (const e of incomes) if (e.date >= shiftDay(today, -200)) bySource.set(itemOf(e), [...(bySource.get(itemOf(e)) ?? []), e])
  const streams = [...bySource]
    .map(([source, list]) => {
      const perMonth = new Map<string, number>()
      for (const e of list) if (!e.date.startsWith(month)) perMonth.set(monthOf(e.date), (perMonth.get(monthOf(e.date)) ?? 0) + e.amount)
      return {
        source,
        monthly: perMonth.size ? median([...perMonth.values()]) : 0,
        regular: full.length >= 2 ? lastThree.filter((m) => perMonth.has(m)).length >= 2 : perMonth.has(prev),
        received: sum(list.filter((e) => e.date.startsWith(month))),
      }
    })
    .sort((a, b) => b.monthly - a.monthly)
  const recent = incomes.filter((e) => e.date >= shiftDay(today, -180))
  const dates = [...new Set(recent.map((e) => e.date))].sort()
  const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d))
  const last = incomes.reduce((a, b) => (b.date > a.date || (b.date === a.date && b.createdAt > a.createdAt) ? b : a))
  const typical = totals.length >= 2 ? median(totals) : 0
  const lean = totals.length >= 2 ? Math.min(...totals) : 0
  const high = totals.length >= 2 ? Math.max(...totals) : 0
  return {
    months: totals.length >= 2 ? totals.length : 0,
    typical,
    lean,
    high,
    steady: totals.length >= 2 && typical > 0 && lean >= typical * 0.8 && high <= typical * 1.2,
    streams,
    expected: streams.filter((x) => x.regular).reduce((n, x) => n + Math.max(0, x.monthly - x.received), 0),
    gapDays: gaps.length >= 2 ? median(gaps) : null,
    sinceDays: daysBetween(last.date, today),
    last,
    usualPayment: recent.length >= 3 ? median(recent.map((e) => e.amount)) : null,
  }
}

export type Window = { days: number; income: number; spent: number; saved: number; extras: number; essentials: number }

/**
 * Money in, spent and saved over the last 90 days, or since you started once that's 4 weeks. Income and savings
 * come whenever, so one month's numbers say little: a payment on the 30th makes the 29th look like a loss.
 */
export function rolling(entries: Entry[], today: string): Window | null {
  const from = [firstDate(entries, today), shiftDay(today, -89)].sort()[1]
  const days = daysBetween(from, today) + 1
  if (days < 28) return null
  const list = entries.filter((e) => e.date >= from && e.date <= today)
  const expenses = list.filter(isExpense)
  return {
    days,
    income: sum(list.filter(isIncome)),
    spent: sum(expenses),
    saved: list.filter(isSaving).reduce((n, e) => n + (e.income ? -e.amount : e.amount), 0),
    extras: sum(expenses.filter((e) => WANTS.includes(e.category))),
    essentials: sum(expenses.filter((e) => NEEDS.includes(e.category))),
  }
}

/** Money in hand as far as Tally knows: everything logged as income, less spending and what went to savings. */
export function onHand(entries: Entry[], today: string): number {
  return entries.reduce((n, e) => (e.date > today ? n : isSaving(e) ? n + (e.income ? e.amount : -e.amount) : isIncome(e) ? n + e.amount : n - e.amount), 0)
}

/** The numbers a tip was based on, saved with each Helpful / Not helpful vote as training data for a future model. */
export function tipFeatures(entries: Entry[], budget: number, today: string): Record<string, number> {
  const month = monthOf(today)
  const s = monthSummary(entries, month, budget, today)
  const p = spendingPatterns(entries, month, today)
  const inc = incomeProfile(entries, today)
  const deposits = entries.filter((e) => isSaving(e) && !e.income && e.date <= today)
  return {
    day: s.day,
    days: s.days,
    budget: budget / 100,
    spent: s.spent / 100,
    income: s.income / 100,
    saved: s.saved / 100,
    forecast: forecastMonth(entries, month, today).total / 100,
    spentOfBudget: budget ? s.spent / budget : 0,
    essentialsShare: s.spent ? p.needs / s.spent : 0,
    weekendRatio: p.weekdayAvg ? p.weekendAvg / p.weekdayAvg : 0,
    entries: entries.filter((e) => e.date.startsWith(month)).length,
    incomeTypical: (inc?.typical ?? 0) / 100,
    incomeSteady: inc?.steady ? 1 : 0,
    daysSinceIncome: inc?.sinceDays ?? -1,
    daysSinceSaving: deposits.length ? daysBetween(deposits.reduce((m, e) => (e.date > m ? e.date : m), deposits[0].date), today) : -1,
    onHand: onHand(entries, today) / 100,
  }
}

/** Keeps one vote per tip (the latest) and the last 500 in all. */
export const addVote = (votes: TipVote[] = [], vote: TipVote) => [...votes.filter((v) => v.id !== vote.id), vote].slice(-500)

export type Tip = { id: string; kind: string; tone: "warn" | "tip" | "good"; title: string; why: string; action: string }

const TONE_ORDER = { warn: 0, tip: 1, good: 2 }
// The steps of a recovery plan rank straight after the warning they answer, ahead of tips weighed by pesos alone.
const PLAN = 1e12
const ESSENTIALS: CategoryId[] = ["groceries", "transport", "health"] // essentials without bills, which come once a month
const SUBSCRIPTIONS = new Set("netflix spotify youtube icloud disney hbo prime viu apple chatgpt canva adobe xbox playstation".split(" "))

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`
const up500 = (centavos: number) => Math.ceil(centavos / 50000) * 50000
const down500 = (centavos: number) => Math.floor(centavos / 50000) * 50000

/** The day the month's running spend first passed the budget (YYYY-MM-DD), or null if it hasn't. */
export function budgetRanOut(s: Summary, month: string, budget: number): string | null {
  const i = budget ? s.cumulative.findIndex((v) => v > budget) : -1
  return i < 0 ? null : `${month}-${pad(i + 1)}`
}

/**
 * What groceries, transport and health usually cost a day (bills count separately, when they're due): the last
 * 28 days when there's that much history, else this month after its first week. Null before either.
 */
export function essentialsPerDay(entries: Entry[], today: string): number | null {
  const essential = (e: Entry) => ESSENTIALS.includes(e.category)
  const start = shiftDay(today, -28)
  if (firstDate(entries, today) <= start) return sum(entries.filter((e) => isExpense(e) && essential(e) && e.date >= start && e.date < today)) / 28
  const day = dayOf(today)
  return day < 7 ? null : sum(expensesIn(entries, monthOf(today), day).filter(essential)) / day
}

export type Usual = { spent: number; income: number; essentials: number; months: number }

/**
 * Your usual month: medians over up to 3 full months before `month` (tracking had begun by the 3rd), or null
 * with fewer than 2. Income comes from the months that had any; essentials are bills, groceries, transport, health.
 */
export function usualMonth(entries: Entry[], month: string): Usual | null {
  const since = firstDate(entries, month)
  const full = lastMonths(entries, shiftMonth(month, -1), 3).filter((m) => m.spent > 0 && `${m.month}-03` >= since)
  if (full.length < 2) return null
  const paid = full.filter((m) => m.income > 0)
  return {
    spent: median(full.map((m) => m.spent)),
    income: paid.length >= 2 ? median(paid.map((m) => m.income)) : 0,
    essentials: median(full.map((m) => sum(expensesIn(entries, m.month).filter((e) => NEEDS.includes(e.category))))),
    months: full.length,
  }
}

/** How many months your savings would cover essentials (bills, groceries, transport and health). */
export function cushion(entries: Entry[], today: string): { months: number; monthly: number; total: number } | null {
  const month = monthOf(today)
  let monthly = usualMonth(entries, month)?.essentials ?? 0
  if (!monthly) {
    const s = monthSummary(entries, month, 0, today)
    if (s.day < 14) return null
    const bills = s.byCategory.find((c) => c.category === "bills")?.total ?? 0
    monthly = bills + (sum(expensesIn(entries, month).filter((e) => ESSENTIALS.includes(e.category))) / s.day) * s.days
  }
  const total = savingsSummary(entries, undefined, today).total
  return monthly > 0 ? { months: total / monthly, monthly, total } : null
}

/**
 * What to do, the way a financial advisor would put it: where the month stands, then a plan for the days left,
 * from your own numbers. Advice is about what's still ahead, never money already spent. Priorities run: don't
 * run out before the month ends, cover bills, keep a safety cushion, then goals, then habits. Warnings come
 * first, then the plan, then tips by how many pesos they're worth, scaled by how helpful you've found that
 * kind of tip. A tip you marked Not helpful stays hidden.
 */
export function advise(entries: Entry[], month: string, budget: number, today: string, extra: { goal?: Goal; votes?: TipVote[] } = {}): Tip[] {
  const s = monthSummary(entries, month, budget, today)
  if (!s.day) return []
  const p = spendingPatterns(entries, month, today)
  const cats = categoryDetail(entries, month, today)
  const current = s.daysLeft > 0
  const name = monthName(month)
  const prevName = monthName(shiftMonth(month, -1))
  const nextName = monthName(shiftMonth(month, 1))
  const when = current ? "this month" : `in ${name}`
  const expenses = expensesIn(entries, month)
  const toMonthEnd = (amount: number) => (current ? Math.round((amount / s.day) * s.days) : amount)
  const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`
  const lower = (c: CategoryId) => CATEGORIES[c].toLowerCase()
  const tips: (Tip & { weight: number })[] = []
  const add = (kind: string, subject: string, tone: Tip["tone"], weight: number, title: string, why: string, action: string) =>
    tips.push({ id: `${kind}:${subject}:${month}`, kind, tone, weight, title, why, action })
  // Categories a tip has already talked about, so the next one doesn't say it again.
  const mentioned = new Set<CategoryId>()

  const bills = cats.find((c) => c.category === "bills")?.total ?? 0
  const topWant = cats.find((c) => WANTS.includes(c.category))
  const topNeed = cats.find((c) => NEEDS.includes(c.category))
  const listCats = (group: CategoryId[]) =>
    cats
      .filter((c) => group.includes(c.category))
      .map((c) => `${CATEGORIES[c.category]} ${pesos(c.total)}`)
      .join(", ")
  // Splits a daily limit the way this month's everyday spending divides (bills are paid once, so left out).
  const dayToDay = s.spent - bills
  const split = (perDay: number) =>
    dayToDay > 0 ? ` Roughly ${pesos((perDay * (p.needs - bills)) / dayToDay)} for things you need and ${pesos((perDay * (p.wants + p.other)) / dayToDay)} for everything else.` : ""
  const forecast = forecastMonth(entries, month, today)
  const safe = current ? safeToSpend(entries, budget, today) : null
  const comingUp = forecast.upcoming ? `, and ${pesos(forecast.upcoming)} in bills is still to come` : ""

  // What the rest of the month needs: essentials at your usual daily cost, plus the bills still due.
  const ess = current ? essentialsPerDay(entries, today) : null
  const need = ess === null ? null : Math.round(ess * (s.days - s.day)) + forecast.upcoming
  const landing = need === null ? null : s.spent + need
  const cash = s.income - s.spent - s.saved
  const usual = usualMonth(entries, month)
  // Income and savings come whenever you have them, so Tally learns them instead of asking: where income comes
  // from, a usual and a lean month, how often it lands. Ratios use the last 90 days, and money left carries over.
  const inc = incomeProfile(entries, today)
  const lean = inc?.months ? inc.lean : 0 // the month to plan on
  const roll = current ? rolling(entries, today) : null
  const hand = onHand(entries, today)
  const started = firstDate(entries, today)
  const freshThisMonth = started >= `${month}-01`
  const daySpend = roll ? roll.spent / roll.days : s.day ? s.spent / s.day : 0
  const excess = roll ? hand - daySpend * 30 : 0 // in hand beyond a month of spending
  let saveNudged = false // one "save now" amount at a time
  const fresh = entries
    .filter((e) => isIncome(e) && e.date <= today && daysBetween(e.date, today) <= 14)
    .filter((e) => !entries.some((x) => isSaving(x) && !x.income && x.date >= e.date && x.date <= today))
    .reduce<Entry | null>((a, b) => (!a || b.amount > a.amount ? b : a), null)
  const over = budget > 0 && s.spent > budget
  const overForecast = budget > 0 && current && forecast.total > budget

  // The budget.
  if (!budget) {
    const last = monthSummary(entries, shiftMonth(month, -1), 0, today).spent
    const base = usual?.spent ?? last
    // 10% under what you usually spend, and never so much that your leanest month can't still save 20%.
    const capped = lean > 0 && lean * 0.8 < base * 0.9
    const suggest = Math.max(50000, down500(capped ? lean * 0.8 : base * 0.9))
    add(
      "budget-set",
      "",
      "tip",
      Number.MAX_SAFE_INTEGER,
      "Set a monthly budget",
      `${usual ? `You usually spend ${pesos(usual.spent)} a month. ` : last ? `Last month you spent ${pesos(last)}. ` : ""}A budget lets Tally warn you before you overspend.${capped ? " Your income varies, so this leaves 20% to save even in your leanest month." : ""}`,
      base ? `Tap ··· at the top, then Monthly budget. Try ${pesos(suggest)}.` : "Tap ··· at the top, then Monthly budget."
    )
  } else if (over) {
    const extrasShare = p.wants / s.spent
    const drivers = cats.filter((c) => extrasShare < 0.5 || WANTS.includes(c.category)).slice(0, 2)
    for (const c of drivers) mentioned.add(c.category)
    const named = drivers.map((c) => `${CATEGORIES[c.category]} ${pesos(c.total)}`).join(", ")
    const because = extrasShare >= 0.5 ? `Extras were ${pct(extrasShare)} of it: ${named}.` : `Most went to ${named}.`
    if (current) {
      const ranOut = budgetRanOut(s, month, budget)
      add(
        "budget-over",
        "",
        "warn",
        s.spent - budget,
        ranOut ? `Your budget ran out on ${shortDate(ranOut)}` : `You're ${pesos(s.spent - budget)} over your budget`,
        `${pesos(s.spent)} of ${pesos(budget)} spent, with ${days(s.daysLeft)} to go. ${because}`,
        need
          ? `Essentials only until the 1st: about ${pesos(need)} for groceries, transport${forecast.upcoming ? ", health and bills still due" : " and health"}. That ends ${name} near ${pesos(landing!)}.`
          : "Essentials only until the 1st, and wait 48 hours before buying any extra."
      )
    } else
      add(
        "budget-over",
        "",
        "warn",
        s.spent - budget,
        `You went ${pesos(s.spent - budget)} over budget in ${name}`,
        `You spent ${pesos(s.spent)} of your ${pesos(budget)} budget. ${because}`,
        topWant ? `In ${nextName}, cut ${lower(topWant.category)} first. It cost ${pesos(topWant.total)}.` : `In ${nextName}, set a budget closer to what you really spend.`
      )
  } else if (!current) {
    add("budget-done", "", "good", 0, `You stayed ${pesos(budget - s.spent)} under budget`, `You spent ${pesos(s.spent)} of your ${pesos(budget)} budget in ${name}.`, "Put the leftover into savings.")
  } else if (s.day >= 7 || forecast.fromHistory) {
    const perDay = safe?.perDay ?? s.perDay
    if (overForecast) {
      // A daily limit below what essentials alone cost can't be kept: say so, and give the realistic landing.
      const impossible = ess !== null && landing !== null && perDay < ess && landing > budget
      add(
        "budget-forecast-over",
        "",
        "warn",
        forecast.total - budget,
        `You're on track to overspend by ${pesos(forecast.total - budget)}`,
        `You're spending about ${pesos(forecast.dailyRate)} a day on everyday things${comingUp}. That adds up to about ${pesos(forecast.total)} this month, but your budget is ${pesos(budget)}.`,
        impossible
          ? `Essentials alone usually cost about ${pesos(ess)} a day, so ${pesos(budget)} can't be met now. Skip extras and you'll land near ${pesos(landing)}, ${pesos(landing - budget)} over.`
          : `To stay within budget, spend no more than ${pesos(perDay)} a day from now on.${split(perDay)}${topWant ? ` Cut ${lower(topWant.category)} first.` : ""}`
      )
    } else
      add(
        "budget-forecast-ok",
        "",
        "good",
        0,
        `You're on track to have ${pesos(budget - forecast.total)} left over`,
        `At this rate${comingUp ? ", counting the bills still to come," : ""} you'll spend about ${pesos(forecast.total)} of your ${pesos(budget)} budget.`,
        `You can spend up to ${pesos(perDay)} a day and still stay within budget.`
      )
  } else if (s.spent > s.pace) {
    // Under a week of data and no history: a month-end projection is mostly noise, so say what's true instead.
    const perDay = safe?.perDay ?? s.perDay
    add(
      "budget-early",
      "",
      "tip",
      s.spent - s.pace,
      `You've already used ${pct(s.spent / budget)} of your budget`,
      `It's only day ${s.day} and you've spent ${pesos(s.spent)}.${bills ? ` ${pesos(bills)} of that was bills.` : ""}`,
      `Spend no more than ${pesos(perDay)} a day for the rest of the month.${split(perDay)}`
    )
  }

  // A budget you can keep: when this one is broken, or far from what you usually spend.
  if (current && budget) {
    if (over && landing !== null) {
      const fit = up500(landing)
      const spare = s.income - fit - Math.max(0, s.saved)
      // Once Tally knows your leanest month, the new budget has to fit that, not just a good month.
      if (fit > budget && lean)
        add(
          "budget-fit",
          "",
          "tip",
          PLAN + fit - budget,
          `A budget you can keep: ${pesos(fit)}`,
          `Even with essentials only, ${name} lands near ${pesos(landing)}.`,
          lean >= fit
            ? `Set ${nextName} to ${pesos(fit)}. Even your leanest month (${pesos(lean)}) covers it, with ${pesos(lean - fit)} left to save.`
            : `Set ${nextName} to ${pesos(fit)}, and keep ${pesos(fit - lean)} in savings for months like your leanest (${pesos(lean)}), which won't cover it.`
        )
      else if (fit > budget && (!s.income || spare >= 0))
        add(
          "budget-fit",
          "",
          "tip",
          PLAN + fit - budget,
          `A budget you can keep: ${pesos(fit)}`,
          `Even with essentials only, ${name} lands near ${pesos(landing)}.`,
          !s.income
            ? `Set ${nextName} to ${pesos(fit)}, and log your income so Tally can check it fits.`
            : s.saved > 0
              ? `Set ${nextName} to ${pesos(fit)}. You'd still save ${pesos(s.saved)} and keep about ${pesos(spare)} spare.`
              : `Set ${nextName} to ${pesos(fit)}, which leaves about ${pesos(spare)} of your income for savings.`
        )
    } else if (usual && budget < usual.spent * 0.8)
      add(
        "budget-fit",
        "",
        "tip",
        usual.spent - budget,
        "Your budget is below what you usually spend",
        `You usually spend ${pesos(usual.spent)} a month, going by your last ${usual.months} months. Your budget is ${pesos(budget)}.`,
        `Try ${pesos(down500(usual.spent * 0.9))} in ${nextName}, 10% under your usual, and cut extras first. A budget you can keep beats one you break.`
      )
    else if (usual && budget > usual.spent * 1.5)
      add(
        "budget-fit",
        "",
        "tip",
        budget - usual.spent,
        "Your budget has room to spare",
        `You usually spend ${pesos(usual.spent)} a month, but your budget is ${pesos(budget)}.`,
        `Lower it to ${pesos(up500(usual.spent * 1.1))} and move the difference to savings each payday.`
      )
  }

  // Bills you usually pay around now that aren't logged yet.
  if (current) {
    const soon = shiftDay(today, 7)
    for (const b of recurringBills(entries, today)) {
      if (b.paid || monthOf(b.due) !== month || b.due > soon) continue
      const late = b.due < today
      add(
        "bill-due",
        b.item,
        "tip",
        b.amount,
        late ? `${capitalize(b.item)} is usually paid by now` : `${capitalize(b.item)} is coming up`,
        `You usually pay about ${pesos(b.amount)} around ${shortDate(b.due)}. It's not logged yet this month.`,
        late ? `Paid it already? Log it so your numbers stay right. If not, keep ${pesos(b.amount)} aside for it.` : `Keep ${pesos(b.amount)} aside for it.`
      )
    }
  }

  // Money in hand for the rest of the month: everything that came in and wasn't spent or saved, carried across
  // months, against what essentials and bills still need. Income that usually comes back later this month counts.
  if (current && inc && hand >= 0) {
    const coming = inc.expected
    if (need && hand + coming < need)
      add(
        "cash-short",
        "",
        "warn",
        need - hand - coming,
        "Money may run short before the 1st",
        `${pesos(hand)} is left after spending and savings. Essentials${forecast.upcoming ? " and bills still due" : ""} usually need about ${pesos(need)} more by the ${ordinal(s.days)}${coming ? `, even with the ${pesos(coming)} that usually comes in later` : ""}.`,
        "Spend on essentials only. If it still runs out, take just what you need from savings with withdraw."
      )
    else if (hand > 0 && (over || overForecast))
      add(
        "cash-left",
        "",
        "tip",
        PLAN + hand,
        `You still have ${pesos(hand)}${freshThisMonth ? " this month" : ""}`,
        freshThisMonth
          ? `You earned ${pesos(s.income)}, ${s.saved > 0 ? `spent ${pesos(s.spent)} and saved ${pesos(s.saved)}` : `and spent ${pesos(s.spent)}`}.`
          : `That's what's left of everything you've logged since ${shortDate(started)}, after spending and savings.`,
        `Pay for the rest of ${name} from this, not from savings.`
      )
  }

  // Income. Healthy limits: extras 30% of what comes in, essentials 50%, savings 20%. Income comes whenever, so the
  // ratios use the last 90 days once there's 4 weeks of history; before that, or reviewing a past month, that month.
  if (!entries.some(isIncome)) {
    add("income-missing", "", "tip", 2, "Add your income", "Then Tally can tell you whether you're saving money or losing it.", "Type it with a plus sign, like +25000 salary, whenever money comes in.")
  } else {
    const w: Window = roll ?? { days: 0, income: s.income, spent: s.spent, saved: s.saved, extras: p.wants, essentials: p.needs }
    // Monthly limits come from your leanest month once Tally knows it, else the window's pace as a 30-day month.
    const monthIn = lean || (roll ? (roll.income / roll.days) * 30 : s.income)
    if (w.income > 0) {
      if (w.spent > w.income) {
        const gap = w.spent - w.income
        if (roll)
          add(
            "income-gap",
            "",
            "warn",
            gap,
            `You've spent ${pesos(gap)} more than came in`,
            `${pesos(w.income)} came in and ${pesos(w.spent)} went out over the last ${roll.days} days.`,
            `Bring spending under what comes in: about ${pesos((gap / roll.days) * 30)} a month less${topWant ? `, starting with ${lower(topWant.category)}` : ""}.`
          )
        else
          add(
            "income-gap",
            "",
            current && inc && inc.expected >= gap ? "tip" : "warn",
            gap,
            current ? `You've spent ${pesos(gap)} more than you've earned so far` : `You've spent ${pesos(gap)} more than you earned`,
            `You${current ? "'ve" : ""} earned ${pesos(s.income)} and spent ${pesos(s.spent)} ${when}.${current && inc?.expected ? ` About ${pesos(inc.expected)} usually still comes in this month.` : ""}`,
            current
              ? "Essentials only until more money comes in."
              : topWant
                ? `In ${nextName}, cut ${lower(topWant.category)} first. It cost ${pesos(topWant.total)}.`
                : `In ${nextName}, keep spending under your income.`
          )
      }
      // The over-budget plan already named the extras, so this one would only repeat it.
      if (w.extras > w.income * 0.3 && !(over && mentioned.size))
        add(
          "extras-high",
          "",
          "tip",
          w.extras - w.income * 0.3,
          "Too much is going to extras",
          roll
            ? `${pct(w.extras / w.income)} of what came in over the last ${roll.days} days went to food, shopping and leisure. A healthy limit is 30%.`
            : `${pct(w.extras / w.income)} of your income went to food, shopping and leisure (${listCats(WANTS)}). A healthy limit is 30%, or ${pesos(w.income * 0.3)}.`,
          roll
            ? `Keep extras under ${pesos(monthIn * 0.3)} a month${lean ? ", 30% of your leanest month" : ""}.`
            : current
              ? `No more extras this month. In ${nextName}, keep them under ${pesos(w.income * 0.3)}.`
              : `In ${nextName}, keep extras under ${pesos(w.income * 0.3)}.`
        )
      else if (w.essentials > w.income * 0.5 && topNeed)
        add(
          "essentials-high",
          "",
          "tip",
          w.essentials - w.income * 0.5,
          "Your essentials cost a lot",
          roll
            ? `${pct(w.essentials / w.income)} of what came in over the last ${roll.days} days went to bills, groceries, transport and health. A healthy limit is 50%.`
            : `${pct(w.essentials / w.income)} of your income went to bills, groceries, transport and health (${listCats(NEEDS)}). A healthy limit is 50%, or ${pesos(w.income * 0.5)}.`,
          `Essentials are hard to cut fast. Start with your biggest one, ${lower(topNeed.category)} at ${pesos(topNeed.total)}${roll ? " this month" : ""}.`
        )
      // The savings rate: money actually put aside, against what came in.
      const rate = w.saved / w.income
      const of = roll ? "of what comes in" : "of your income"
      if (w.saved > 0 && rate >= 0.2)
        add(
          "saving-rate",
          "",
          "good",
          0,
          `You're saving ${pct(rate)} ${of}`,
          `${pesos(w.saved)} of ${pesos(w.income)}${roll ? ` over the last ${roll.days} days` : ""}${rate >= 0.4 ? ", twice the 20% to aim for." : ". Aim for at least 20%, and you're there."}`,
          over ? "Keep it. The budget is the tight part, not your savings." : "Keep putting a share aside each time money comes in."
        )
      else if (entries.some(isSaving) && (!current || s.day >= 7 || roll)) {
        const short = Math.round(w.income * 0.2) - Math.max(0, w.saved)
        add(
          "saving-low",
          "",
          "tip",
          short,
          w.saved > 0 ? `You're saving ${pct(rate)} ${of}` : roll ? "Nothing saved lately" : current ? "Nothing saved yet this month" : `Nothing saved in ${name}`,
          `20% of the ${pesos(w.income)} that came in ${roll ? `over the last ${roll.days} days` : when} would be ${pesos(w.income * 0.2)}. You've put aside ${pesos(Math.max(0, w.saved))}.`,
          inc ? `Each time money comes in, put 20% aside first: ${pesos((fresh ?? inc.last).amount * 0.2)} from ${fresh ? `the ${pesos(fresh.amount)} on ${shortDate(fresh.date)}` : `your last ${pesos(inc.last.amount)}`}.` : "Each time money comes in, put 20% aside first."
        )
      }
    }

    if (current && inc) {
      // How your income behaves, learned from what you've logged: plan on the lean month, not the good one.
      if (inc.months && inc.typical > 0) {
        if (inc.lean === 0)
          add(
            "income-plan",
            "",
            "tip",
            inc.high / 4,
            "Some months bring no income",
            `Over the last ${inc.months} months the most that came in was ${pesos(inc.high)}, and the least was nothing.`,
            `Keep a month of spending, about ${pesos(usual?.spent ?? monthIn)}, in savings for months like that.`
          )
        else if (!inc.steady)
          add(
            "income-plan",
            "",
            "tip",
            (inc.high - inc.lean) / 4,
            `Plan on ${pesos(inc.lean)} a month`,
            `Your income ranged from ${pesos(inc.lean)} to ${pesos(inc.high)} over the last ${inc.months} months, ${pesos(inc.typical)} in a usual one.`,
            "Budget on your leanest month, and treat anything above it as extra: save at least half of it."
          )
        else
          add(
            "income-plan",
            "",
            "good",
            0,
            `Your income is steady at about ${pesos(inc.typical)} a month`,
            `Every one of the last ${inc.months} months came within 20% of that.`,
            `Steady income suits a fixed budget. Save 20% of it, ${pesos(inc.typical * 0.2)}, as soon as it lands.`
          )
      }
      // Money that just came in with nothing saved from it yet. More in hand than a month of spending gets one
      // instruction (savings-buffer, below), not two different amounts to save.
      if (fresh && excess < 100000 && inc.usualPayment && fresh.amount >= Math.max(inc.usualPayment * 1.5, 100000)) {
        saveNudged = true
        add(
          "windfall",
          fresh.id,
          "tip",
          fresh.amount * 0.5,
          "A bigger payment came in",
          `${pesos(fresh.amount)}${fresh.note ? ` from ${fresh.note}` : ""} on ${shortDate(fresh.date)}, against a usual ${pesos(inc.usualPayment)}.`,
          `Give it a job before it gets spent: half into savings (type save ${Math.floor(fresh.amount / 200)}), the rest for lean months.`
        )
      } else if (fresh && excess < 100000 && fresh.amount >= 50000 && entries.some(isSaving)) {
        saveNudged = true
        add(
          "save-from-income",
          fresh.id,
          "tip",
          fresh.amount * 0.2,
          `Nothing saved from ${shortDate(fresh.date)}'s ${pesos(fresh.amount)} yet`,
          "Saving a share of each payment as it lands is how money that comes and goes turns into savings.",
          `Put 20% aside now: type save ${Math.floor(fresh.amount / 500)}.`
        )
      }
      // A dry spell: longer than usual since money last came in.
      if (inc.gapDays && inc.sinceDays >= 14 && inc.sinceDays > inc.gapDays * 1.5) {
        const lasts = daySpend > 0 ? Math.floor(hand / daySpend) : 0
        add(
          "dry-spell",
          "",
          lasts < 14 ? "warn" : "tip",
          daySpend * 30,
          `No income logged for ${inc.sinceDays} days`,
          `It usually comes every ${Math.round(inc.gapDays)} days or so.`,
          hand > 0 && lasts > 0
            ? `Essentials only until money comes in. What's left, ${pesos(hand)}, lasts about ${days(lasts)} at your usual spending. If some came in, log it.`
            : "Essentials only until money comes in. If some came in, log it so the numbers stay right."
        )
      }
    }
  }

  // Savings, the safety cushion and the goal.
  const savings = savingsSummary(entries, extra.goal, today)
  // More in hand than a month of spending: keep a month for the gaps between payments, save the rest.
  const monthSpend = daySpend * 30
  if (excess >= 100000)
    add(
      "savings-buffer",
      "",
      "tip",
      excess * 0.5,
      `You're holding ${pesos(excess)} more than a month of spending`,
      `${pesos(hand)} is left from what's come in, and a month usually costs you about ${pesos(monthSpend)}.`,
      `Keep a month at hand for the gaps between payments, and move the rest to savings: type save ${Math.floor(excess / 100)}.`
    )
  else if (!roll && s.income > 0 && cash >= 100000 && (!current || s.day >= 20))
    add(
      "savings-leftover",
      "",
      "tip",
      cash * 0.5,
      `You have ${pesos(cash)} left over`,
      `You earned ${pesos(s.income)}, spent ${pesos(s.spent)} and saved ${pesos(s.saved)} ${when}.`,
      current ? `Move it to savings before it gets spent: type save ${Math.floor(cash / 100)}.` : "Move it to savings."
    )
  const withdrawn = sum(entries.filter((e) => isSaving(e) && e.income && e.date.startsWith(month)))
  if (withdrawn > 0 && (over || s.net < 0))
    add(
      "savings-withdrawn",
      "",
      "tip",
      withdrawn,
      `You took ${pesos(withdrawn)} out of savings`,
      `Spending ran past ${over ? "your budget" : "your income"} ${when}.`,
      `Put it back the next time money comes in: type save ${Math.floor(withdrawn / 100)}.`
    )
  const g = savings.goal
  // A safety cushion comes before goals: 3 to 6 months of essentials put aside is the usual advice, and the full
  // 6 when income swings from month to month.
  const c = current ? cushion(entries, today) : null
  const target = inc?.months && !inc.steady ? 6 : 3
  if (c && c.total > 0 && c.months < target) {
    const m = Math.round(c.months * 10) / 10
    add(
      "cushion",
      "",
      "tip",
      (c.monthly * 3 - c.total) / 10,
      `Your savings cover ${m < 1 ? "less than a month" : m === 1 ? "1 month" : `${m} months`} of essentials`,
      `${pesos(c.total)} saved, and bills, groceries, transport and health usually cost ${pesos(c.monthly)} a month. ${target === 6 ? "With income that varies, aim for 6 months put aside." : "Aim for 3 to 6 months put aside for emergencies."}`,
      g ? `Keep the first ${pesos(c.monthly * target)} for emergencies before spending savings on ${g.name}.` : `Build it to ${pesos(c.monthly * target)} before any big purchase.`
    )
  }
  if (g && g.left === 0) add("savings-goal-done", g.name, "good", 0, `You reached your ${g.name} goal`, `${pesos(savings.total)} saved of ${pesos(g.amount)}.`, "Set a new goal from the ··· menu.")
  else if (g && savings.total <= 0)
    add("savings-goal-start", g.name, "tip", g.amount * 0.05, `Start your ${g.name}`, "You haven't put anything aside for it yet.", "After payday, type save and an amount, like save 1000.")
  else if (g && savings.monthlyAvg > 0) {
    const monthsLeft = Math.ceil(g.left / savings.monthlyAvg)
    // The lever: a quarter of this month's biggest extra, moved to savings.
    const quarter = topWant ? topWant.total / 4 : 0
    const sooner = quarter ? monthsLeft - Math.ceil(g.left / (savings.monthlyAvg + quarter)) : 0
    const faster = monthsLeft > 1 ? g.left / (monthsLeft - 1) - savings.monthlyAvg : 0
    add(
      "savings-goal",
      g.name,
      "good",
      0,
      `${g.name}: ${pct(g.progress)} of the way`,
      savings.deposits === 1
        ? `You've saved ${pesos(savings.total)} of ${pesos(g.amount)}, in one go so far. Saving that much each month gets you there by ${g.eta}.`
        : `You've saved ${pesos(savings.total)} of ${pesos(g.amount)}. At your pace so far, about ${pesos(savings.monthlyAvg)} a month, you'll get there by ${g.eta}.`,
      sooner >= 1
        ? `Moving a quarter of your ${lower(topWant!.category)} spending (about ${pesos(quarter)} a month) to savings gets you there ${sooner === 1 ? "a month" : `${sooner} months`} sooner.`
        : faster
          ? `Saving ${pesos(faster)} more a month gets you there a month sooner.`
          : "One more month like this and you're there."
    )
  } else if (!g && inc && !entries.some(isSaving) && !saveNudged && excess < 100000)
    add(
      "savings-start",
      "",
      "tip",
      inc.last.amount * 0.2,
      "Pay yourself first",
      "You've logged income but haven't set any money aside yet.",
      `Each time money comes in, put a share in savings first: 20% of your last ${pesos(inc.last.amount)} is ${pesos(inc.last.amount * 0.2)}. Type save ${Math.floor(inc.last.amount / 500)}. It won't count as spending.`
    )

  // Extras growing against the same days of last month. Needs follow the calendar (rent day, grocery Saturdays).
  const grown = cats
    .filter((x) => WANTS.includes(x.category) && x.before > 0 && x.total - x.before >= 50000 && x.total >= x.before * 1.25 && !mentioned.has(x.category))
    .sort((x, y) => y.total - y.before - (x.total - x.before))[0]

  // A week that's unusual for you. A category already growing on the month gets that one tip, not two.
  if (current)
    for (const u of unusualWeeks(entries, today)) {
      if (u.direction === "high" && u.category !== grown?.category && !mentioned.has(u.category)) {
        const week = entries.filter((e) => isExpense(e) && e.category === u.category && e.date > shiftDay(today, -7) && e.date <= today)
        mentioned.add(u.category)
        add(
          "unusual",
          u.category,
          "tip",
          (u.thisWeek - u.usual) * 4,
          `${CATEGORIES[u.category]} is unusually high this week`,
          `You spent ${pesos(u.thisWeek)} on ${lower(u.category)} in the last 7 days, mostly ${describeItems(topItems(week, 2))}. Your usual week is about ${pesos(u.usual)}, going by your last ${u.weeks} weeks.`,
          `Go easy on ${lower(u.category)} for the next few days to get back to normal.`
        )
      } else if (u.direction === "low")
        add(
          "calm",
          u.category,
          "good",
          0,
          `${CATEGORIES[u.category]} is lower than usual`,
          `${pesos(u.thisWeek)} in the last 7 days, against about ${pesos(u.usual)} in a normal week.`,
          `Nice. That's ${pesos(u.usual - u.thisWeek)} you didn't spend.`
        )
    }

  if (grown) {
    mentioned.add(grown.category)
    const save = toMonthEnd(grown.total - grown.before)
    const cap = Math.round(grown.before / s.day / 1000) * 1000
    add(
      "category-up",
      grown.category,
      "tip",
      save,
      `You're spending more on ${lower(grown.category)}`,
      `By this time in ${prevName} you'd spent ${pesos(grown.before)} on it. Now it's ${pesos(grown.total)}, ${pct((grown.total - grown.before) / grown.before)} more. Mostly ${describeItems(grown.top.slice(0, 2))}.`,
      current ? `Try to keep it under ${pesos(cap)} a day, like last month. You'd save about ${pesos(save)} a month.` : `Spending like ${prevName} would have saved you ${pesos(save)}.`
    )
  }

  // One kind of extra taking a big share.
  const top = cats.find((x) => WANTS.includes(x.category))
  if (top && !mentioned.has(top.category) && s.spent >= 300000 && top.share >= 0.35) {
    const trim = toMonthEnd(top.total) / 10
    add(
      "category-share",
      top.category,
      "tip",
      trim,
      `${CATEGORIES[top.category]} is where most of your money goes`,
      `It's ${pct(top.share)} of everything you spent: ${pesos(top.total)} over ${top.count} purchases, about ${pesos(top.average)} each. Mostly ${describeItems(top.top)}.`,
      `Spending 10% less on it saves about ${pesos(trim)} a month, ${pesos(trim * 12)} a year.`
    )
  }

  // The same treat, again and again. Extras only: a daily commute isn't a habit to break.
  const repeats = new Map<string, { count: number; total: number }>()
  for (const e of expenses) {
    const w = wordsOf(e.note)[0]
    if (!w || NECESSITIES.has(w) || !WANTS.includes(e.category)) continue
    const r = repeats.get(w) ?? { count: 0, total: 0 }
    repeats.set(w, { count: r.count + 1, total: r.total + e.amount })
  }
  const habit = [...repeats].sort((x, y) => y[1].total - x[1].total).find(([, r]) => r.count >= 4 && r.total >= 50000)
  if (habit) {
    const [w, r] = habit
    const monthly = toMonthEnd(r.total)
    add(
      "habit",
      w,
      "tip",
      monthly / 2,
      `You spent on ${capitalize(w)} ${r.count} times ${when}`,
      `That's ${pesos(r.total)}, about ${pesos(r.total / r.count)} each time.${current ? ` At this rate it'll be ${pesos(monthly)} by the end of the month.` : ""}`,
      `Doing it half as often saves about ${pesos(monthly / 2)} a month, ${pesos(monthly * 6)} a year.`
    )
  }

  // Small extras adding up (fares and lunches are needs, so they don't count).
  const small = expenses.filter((e) => e.amount < 20000 && WANTS.includes(e.category) && !NECESSITIES.has(itemOf(e)))
  const smallSum = sum(small)
  if (small.length >= 10 && smallSum >= 100000 && smallSum / s.spent >= 0.15) {
    const cap = Math.round(((smallSum / s.day) * 0.7) / 1000) * 1000
    const saved = toMonthEnd(smallSum) * 0.3
    add(
      "small-buys",
      "",
      "tip",
      smallSum * 0.3,
      "Small extras are adding up",
      `${small.length} extras under ₱200 came to ${pesos(smallSum)}, ${pct(smallSum / s.spent)} of what you spent ${when}. Mostly ${describeItems(topItems(small, 2))}.`,
      `Try to keep small extras under ${pesos(cap)} a day. You'd save about ${pesos(saved)} a month, ${pesos(saved * 12)} a year.`
    )
  }

  // Weekends against weekdays.
  const { weekendAvg, weekdayAvg } = p
  if (p.weekendDays >= 2 && p.weekdayDays >= 4 && weekdayAvg > 0 && weekendAvg >= weekdayAvg * 1.5 && weekendAvg - weekdayAvg >= 20000) {
    const cap = Math.round((weekdayAvg * 1.25) / 1000) * 1000
    add(
      "weekends",
      "",
      "tip",
      (weekendAvg - weekdayAvg) * 8,
      "You spend a lot more on weekends",
      `On weekends you spend about ${pesos(weekendAvg)} a day on food, shopping and leisure. On weekdays it's ${pesos(weekdayAvg)}.`,
      `Try a ${pesos(cap)} limit on weekend days. You'd save about ${pesos((weekendAvg - cap) * 8)} a month.`
    )
  }

  // One expense big enough to plan for, and what the month looks like without it.
  const big = p.largest
  if (big && s.spent >= 300000 && big.amount / s.spent >= 0.15) {
    const without = s.spent - big.amount
    add(
      "big-expense",
      itemOf(big),
      "tip",
      big.amount * 0.1,
      `One purchase was ${pct(big.amount / s.spent)} of your spending`,
      `${capitalize(big.note || CATEGORIES[big.category])} on ${shortDate(big.date)} cost ${pesos(big.amount)}.${over && without <= budget ? ` Without it you'd be ${pesos(budget - without)} under budget.` : ""}`,
      big.category === "bills"
        ? `If you pay this every month, set aside ${pesos(big.amount / 4)} each week so the money is ready.`
        : WANTS.includes(big.category)
          ? `For treats this size, put ${pesos(up500(big.amount))} aside at the start of the month, and wait 48 hours before any extra over ₱1,000.`
          : `If it comes again, set aside ${pesos(big.amount / 4)} each week so it's ready.`
    )
  }

  if (current) {
    // Subscriptions among the bills that repeat: small each, big over a year.
    const subs = recurringBills(entries, today).filter((b) => SUBSCRIPTIONS.has(b.item))
    const subsTotal = subs.reduce((n, b) => n + b.amount, 0)
    if (subs.length >= 2 || subsTotal >= 50000)
      add(
        "subscriptions",
        "",
        "tip",
        subsTotal * 2,
        `Your subscriptions cost ${pesos(subsTotal)} a month`,
        `${subs.map((b) => `${capitalize(b.item)} ${pesos(b.amount)}`).join(", ")}. That's ${pesos(subsTotal * 12)} a year.`,
        "Cancel any you didn't use this month. Each one you drop saves its price twelve times a year."
      )

    // Spending creeping up, month after month.
    const [m1, m2, m3] = lastMonths(entries, shiftMonth(month, -1), 3)
    if (m1.spent > 0 && `${m1.month}-03` >= firstDate(entries, month) && m1.spent < m2.spent && m2.spent < m3.spent && m3.spent >= m1.spent * 1.15)
      add(
        "creep",
        "",
        "tip",
        m3.spent - m1.spent,
        "Your spending has grown 3 months in a row",
        `${monthName(m1.month)} ${pesos(m1.spent)}, ${monthName(m2.month)} ${pesos(m2.spent)}, ${monthName(m3.month)} ${pesos(m3.spent)}.`,
        `Hold ${name} to ${pesos(m3.spent)} or less, ${monthName(m3.month)}'s level, so it stops climbing.`
      )

    // A payday splurge: the 3 days after money came in, against a usual day. Needs 3 weeks of history.
    const pay = entries
      .filter((e) => isIncome(e) && e.date <= shiftDay(today, -3) && e.date >= shiftDay(today, -35))
      .sort((x, y) => y.date.localeCompare(x.date))[0]
    if (pay && firstDate(entries, today) <= shiftDay(today, -21)) {
      const extrasIn = (from: string, to: string) => sum(entries.filter((e) => isExpense(e) && WANTS.includes(e.category) && e.date >= from && e.date <= to))
      const after = extrasIn(pay.date, shiftDay(pay.date, 2))
      const start = shiftDay(today, -28)
      const inside = pay.date >= start
      // ponytail: a payday just before the 28-day window is only partly netted out; fine for a nudge.
      const usualDay = (extrasIn(start, shiftDay(today, -1)) - (inside ? after : 0)) / (inside ? 25 : 28)
      if (usualDay > 0 && after >= 100000 && after / 3 >= usualDay * 2)
        add(
          "payday",
          pay.date,
          "tip",
          after - usualDay * 3,
          "You spend most right after payday",
          `${pesos(after)} on extras in the 3 days after you were paid on ${shortDate(pay.date)}, against about ${pesos(usualDay)} on a usual day.`,
          `On payday, save first, then give the next 3 days a ${pesos(Math.max(50000, up500(usualDay * 4.5)))} limit for extras.`
        )
    }
  }

  if (current && p.noSpend >= 3) add("no-spend", "", "good", 0, `${p.noSpend} days with no spending`, "Days this month when you didn't spend anything.", "Try to add one more each week.")

  // Rank by what you've found helpful: each kind's weight scales by (helpful + 1) / (not helpful + 1).
  const votes = extra.votes ?? []
  const hidden = new Set(votes.filter((v) => v.vote < 0).map((v) => v.id))
  const helpfulness = (kind: string) => {
    const mine = votes.filter((v) => v.kind === kind)
    return (mine.filter((v) => v.vote > 0).length + 1) / (mine.filter((v) => v.vote < 0).length + 1)
  }
  return tips
    .filter((t) => !hidden.has(t.id))
    .map((t) => ({ ...t, weight: t.weight * helpfulness(t.kind) }))
    .sort((x, y) => TONE_ORDER[x.tone] - TONE_ORDER[y.tone] || y.weight - x.weight)
    .slice(0, 6)
    .map(({ id, kind, tone, title, why, action }) => ({ id, kind, tone, title, why, action }))
}

export type DayBrief = { tone: Tip["tone"]; label: string; amount: number | null; notes: string[] }

/** What a usual day costs without bills: the 28 days before `date`, or fewer once there's a week of history. */
function usualDay(entries: Entry[], date: string): number | null {
  const from = [firstDate(entries, date), shiftDay(date, -28)].sort()[1]
  const n = Math.round((toDate(date).getTime() - toDate(from).getTime()) / 86_400_000)
  if (n < 7) return null
  return sum(entries.filter((e) => isExpense(e) && e.category !== "bills" && e.date >= from && e.date < date)) / n
}

/**
 * The line under the date on Today, for whichever day is showing. Each day's safe amount is the budget left at its
 * start, spread over the days left (bills still due set aside first, for today). Today gets a plan; a past day gets
 * a verdict and what it did to the rest of the month. Null without a budget.
 */
export function dayBrief(entries: Entry[], budget: number, date: string, today: string): DayBrief | null {
  if (!budget || date > today) return null
  const month = monthOf(date)
  const days = daysIn(month)
  const d = dayOf(date)
  const inMonth = entries.filter((e) => isExpense(e) && e.date.startsWith(month))
  const day = inMonth.filter((e) => e.date === date)
  const spent = sum(day)
  const isToday = date === today
  const upcoming = isToday ? unpaidThisMonth(recurringBills(entries, today), today).reduce((n, b) => n + b.amount, 0) : 0
  const room = budget - sum(inMonth.filter((e) => e.date < date)) - upcoming
  const perDay = Math.floor(room / (days - d + 1))
  const after = days - d
  const short = shortDate(date)
  const usual = usualDay(entries, date)
  const notes: string[] = []

  // How it compares with a usual day, and what drove it.
  const versus = (prefix: string) => {
    const times = usual ? spent / usual : 0
    const biggest = day.reduce((a, b) => (b.amount > a.amount ? b : a), day[0])
    const lead = biggest && biggest.amount >= spent * 0.4 ? ` Biggest: ${biggest.note || CATEGORIES[biggest.category]} ${pesos(biggest.amount)}.` : ""
    return `${prefix}${times >= 1.5 ? `, ${Math.round(times * 10) / 10}× a usual day (${pesos(usual!)})` : ""}.${lead}`
  }
  const moved = (income: boolean) => sum(entries.filter((e) => isSaving(e) && e.income === income && e.date === date))
  // Money that moved that day. Income and savings come whenever, so the day they happen is the moment to say so.
  const moneyNotes = () => {
    const came = entries.filter((e) => isIncome(e) && e.date === date)
    if (came.length) {
      const amount = sum(came)
      const soon = sum(entries.filter((e) => isSaving(e) && !e.income && e.date >= date && e.date <= shiftDay(date, 3)))
      const from = came.length === 1 && came[0].note ? ` from ${came[0].note}` : ""
      notes.push(
        `+${pesos(amount)} came in${from}. ${soon ? `${pesos(soon)} went to savings ${moved(false) ? "the same day" : "soon after"}. Good.` : `Putting 20% aside, ${pesos(amount * 0.2)}, is the habit to build.`}`
      )
    } else if (moved(false)) notes.push(`${pesos(moved(false))} went into savings. Good.`)
    if (moved(true)) notes.push(`${isToday ? "You took" : "It took"} ${pesos(moved(true))} out of savings. Put it back the next time money comes in.`)
  }
  let brief: DayBrief

  if (isToday) {
    const ess = essentialsPerDay(entries, today) ?? 0
    // The most today can take with the month still in budget, if every day after is essentials only.
    const stretch = room - Math.round(ess * after) - spent
    if (room <= 0) {
      brief = { tone: "warn", label: "The budget is used up · essentials only today", amount: null, notes }
      notes.push(ess ? `If you must spend, keep it to essentials: about ${pesos(ess)} a day.` : "Anything that isn't essential can wait until the 1st.")
      if (spent) notes.push(`Spent today ${pesos(spent)}.`)
    } else if (spent <= perDay) {
      brief = { tone: "good", label: "Safe to spend today", amount: perDay - spent, notes }
      notes.push(`${pesos(perDay)} a day keeps ${monthName(month)} on budget${after ? ` for the ${after + 1} days left` : ""}.`)
      if (stretch > perDay - spent + 10000) notes.push(`If you really need to, up to ${pesos(stretch)} today still fits, with essentials only after.`)
      if (upcoming) notes.push(`${pesos(upcoming)} is set aside for bills still to come.`)
    } else if (room - spent > 0 && stretch >= 0) {
      brief = { tone: "tip", label: "Over today's safe amount by", amount: spent - perDay, notes }
      notes.push(versus(`Spent ${pesos(spent)} against ${pesos(perDay)}`))
      if (after) notes.push(`Each day left now gets ${pesos(Math.floor((room - spent) / after))}${stretch > 0 ? `. The most you can still spend today and stay in budget is ${pesos(stretch)}` : ""}.`)
    } else {
      brief = { tone: "warn", label: "Over today's safe amount by", amount: spent - perDay, notes }
      notes.push(versus(`Spent ${pesos(spent)} against ${pesos(perDay)}`))
      notes.push(room - spent > 0 ? `Stop for today: anything more can't be covered by essentials-only days after.` : "That used up what was left of the budget. Essentials only from tomorrow.")
    }
  } else if (room <= 0) {
    brief = { tone: "warn", label: `The budget was already gone by ${short}`, amount: null, notes }
    if (spent) notes.push(versus(`${pesos(spent)} spent that day`))
  } else if (!spent) {
    brief = { tone: "good", label: `No spending on ${short}`, amount: null, notes }
    notes.push(`Its ${pesos(perDay)} stayed in the budget for the days after.`)
  } else if (spent <= perDay) {
    brief = { tone: "good", label: `${short} came in under its safe amount by`, amount: perDay - spent, notes }
    notes.push(`Spent ${pesos(spent)} of ${pesos(perDay)}. The rest helps the days after.`)
  } else {
    brief = { tone: spent - perDay > perDay ? "warn" : "tip", label: `${short} went over its safe amount by`, amount: spent - perDay, notes }
    notes.push(versus(`Spent ${pesos(spent)} against ${pesos(perDay)}`))
    notes.push(room - spent <= 0 ? "It used up the rest of the month's budget." : after ? `It cut each day after it by about ${pesos((spent - perDay) / after)}.` : "")
  }
  moneyNotes()
  brief.notes = notes.filter(Boolean).slice(0, 3)
  return brief
}
