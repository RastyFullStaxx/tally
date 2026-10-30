// Tally's insights: how the money went, what's normal for you, bills that repeat, what's safe to spend,
// savings and the forecast. All computed on the phone from your own entries. The tips built on these are in
// advice.ts, which loads with the Insights screen. Pure functions, so `npm test` runs them under plain Node.
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
  type TipVote,
} from "./ledger.ts"

export const NEEDS: CategoryId[] = ["bills", "groceries", "transport", "health"]
export const WANTS: CategoryId[] = ["food", "shopping", "leisure"]

// Needs, not habits: "skip half your lunches" is not advice.
export const NECESSITIES = new Set("lunch dinner breakfast rice fare jeep jeepney bus mrt lrt tricycle trike rent water electricity medicine".split(" "))

export const pct = (x: number) => `${Math.round(x * 100)}%`
const dayOf = (date: string) => Number(date.slice(8, 10))
export const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1)
export const itemOf = (e: Entry) => wordsOf(e.note)[0] ?? CATEGORIES[e.category].toLowerCase()
export const sum = (list: Entry[]) => list.reduce((n, e) => n + e.amount, 0)
export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
export const expensesIn = (entries: Entry[], month: string, uptoDay = 31) => entries.filter((e) => isExpense(e) && e.date.startsWith(month) && dayOf(e.date) <= uptoDay)
export const shortDate = (date: string) => toDate(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
export const firstDate = (entries: Entry[], fallback: string) => entries.reduce((m, e) => (e.date < m ? e.date : m), fallback)
export const daysBetween = (from: string, to: string) => Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000)

export type ItemGroup = { item: string; count: number; total: number }

/** Entries grouped by their first word ("starbucks", "grab"), biggest total first. */
export function topItems(list: Entry[], n = 3): ItemGroup[] {
  const groups = new Map<string, ItemGroup>()
  for (const e of list) {
    const item = itemOf(e)
    const g = groups.get(item) ?? { item, count: 0, total: 0 }
    groups.set(item, { item, count: g.count + 1, total: g.total + e.amount })
  }
  return [...groups.values()].sort((a, b) => b.total - a.total).slice(0, n)
}

/** "Starbucks (4×, ₱720), Jollibee (₱245)" */
export const describeItems = (items: ItemGroup[]) => items.map((i) => `${capitalize(i.item)} (${i.count > 1 ? `${i.count}×, ` : ""}${pesos(i.total)})`).join(", ")

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
export function recurringBills(entries: Entry[], today: string, notBills: readonly string[] = []): Recurring[] {
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
    if (notBills.includes(item)) continue // you said it isn't a bill
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
export function unusualWeeks(entries: Entry[], today: string, notBills: readonly string[] = []): Unusual[] {
  const recurring = new Set(recurringBills(entries, today, notBills).map((b) => b.item))
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

const ONE_OFF = 2.5 // a big buy is over 2.5× a usual day's everyday spending…
const ONE_OFF_GAP = 28 // …on something not logged in the 4 weeks before it
const LEAN_DAYS = 14 // how many days' worth of your last 4 weeks the rate leans on while the month is young

/**
 * Month-end spending: what's spent, plus recurring bills still to come, plus everyday spending at its daily
 * rate for the days left. Measured with `npm run eval:forecast` (see the README):
 * - **One-offs count once.** A big buy of something new (over 2.5× a usual day, its item not logged in the 4
 *   weeks before) is in what's spent, but isn't projected onto the days left. A weekly grocery run still is.
 * - **A young month leans on your last 4 weeks**, as if they were 14 more days of this month, so a payday
 *   splurge on the 1st doesn't set the pace. Only when at least 14 of those 28 days have entries: days you
 *   didn't log aren't days you spent nothing.
 */
export function forecastMonth(entries: Entry[], month: string, today: string, notBills: readonly string[] = []): Forecast {
  const s = monthSummary(entries, month, 0, today)
  if (month !== monthOf(today)) return { total: s.spent, upcoming: 0, dailyRate: 0, fromHistory: false }
  const bills = recurringBills(entries, today, notBills)
  const recurring = new Set(bills.map((b) => b.item))
  const upcoming = unpaidThisMonth(bills, today).reduce((n, b) => n + b.amount, 0)
  const start = shiftDay(today, -28)
  const history = firstDate(entries, today) <= start && new Set(entries.filter((e) => e.date >= start && e.date < today).map((e) => e.date)).size >= 14
  const from = history ? start : `${month}-01`
  const everyday = entries.filter((e) => isExpense(e) && e.category !== "bills" && !recurring.has(itemOf(e)) && e.date >= shiftDay(from, -ONE_OFF_GAP) && e.date <= today)

  // A usual day: the middle daily total from `from` to today.
  const byDay = new Map<string, number>()
  for (const e of everyday) if (e.date >= from) byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.amount)
  const totals: number[] = []
  for (let d = from; d <= today; d = shiftDay(d, 1)) totals.push(byDay.get(d) ?? 0)
  const usualDay = median(totals)
  const lastSeen = new Map<string, string>()
  const oneOff = new Set<Entry>()
  for (const e of [...everyday].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)) {
    const seen = lastSeen.get(itemOf(e))
    if (usualDay > 0 && e.amount > usualDay * ONE_OFF && (!seen || seen < shiftDay(e.date, -ONE_OFF_GAP))) oneOff.add(e)
    lastSeen.set(itemOf(e), e.date)
  }
  const ongoing = everyday.filter((e) => !oneOff.has(e))

  const thisMonth = sum(ongoing.filter((e) => e.date.startsWith(month)))
  const usual = history ? sum(ongoing.filter((e) => e.date >= start && e.date < today)) / 28 : 0
  const dailyRate = history ? (thisMonth + LEAN_DAYS * usual) / (s.day + LEAN_DAYS) : thisMonth / s.day
  return { total: Math.round(s.spent + upcoming + dailyRate * (s.days - s.day)), upcoming, dailyRate, fromHistory: history && s.day < 7 }
}

export type Safe = { today: number; perDay: number; upcoming: number; spentToday: number; daysLeft: number }

/** What you can spend today and stay within budget, after the recurring bills still to come this month. */
export function safeToSpend(entries: Entry[], budget: number, today: string, notBills: readonly string[] = []): Safe | null {
  if (!budget) return null
  const s = monthSummary(entries, monthOf(today), budget, today)
  const spentToday = sum(entries.filter((e) => isExpense(e) && e.date === today))
  const upcoming = unpaidThisMonth(recurringBills(entries, today, notBills), today).reduce((n, b) => n + b.amount, 0)
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

export const ESSENTIALS: CategoryId[] = ["groceries", "transport", "health"] // essentials without bills, which come once a month

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
export function dayBrief(entries: Entry[], budget: number, date: string, today: string, notBills: readonly string[] = []): DayBrief | null {
  if (!budget || date > today) return null
  const month = monthOf(date)
  const days = daysIn(month)
  const d = dayOf(date)
  const inMonth = entries.filter((e) => isExpense(e) && e.date.startsWith(month))
  const day = inMonth.filter((e) => e.date === date)
  const spent = sum(day)
  const isToday = date === today
  const upcoming = isToday ? unpaidThisMonth(recurringBills(entries, today, notBills), today).reduce((n, b) => n + b.amount, 0) : 0
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
