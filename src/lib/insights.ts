// Tally's insights: how the money went, what's normal for you, bills that repeat, what's safe to spend,
// savings, and plain-language tips ranked by what you've found helpful. All computed on the phone from
// your own entries. Pure functions, so `npm test` runs them under plain Node.
import {
  CATEGORIES,
  daysIn,
  formatPesoWhole as pesos,
  isExpense,
  isIncome,
  isSaving,
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
  monthlyAvg: number // over the last 3 months, counting only months since you started saving
  goal: (Goal & { progress: number; left: number; eta: string | null }) | null // eta: "March 2027"
}

export function savingsSummary(entries: Entry[], goal: Goal | undefined, today: string): Savings {
  const saving = entries.filter(isSaving)
  const total = saving.reduce((n, e) => n + (e.income ? -e.amount : e.amount), 0)
  const month = monthOf(today)
  const savedIn = (m: string) => monthSummary(entries, m, 0, today).saved
  const started = saving.length ? monthOf(firstDate(saving, today)) : null
  const months = [0, 1, 2].map((i) => shiftMonth(month, -i)).filter((m) => started && m >= started)
  const monthlyAvg = months.length ? months.reduce((n, m) => n + savedIn(m), 0) / months.length : 0
  let summary: Savings["goal"] = null
  if (goal) {
    const left = Math.max(0, goal.amount - total)
    const eta = left === 0 ? null : monthlyAvg > 0 ? toDate(shiftMonth(month, Math.ceil(left / monthlyAvg))).toLocaleDateString("en-PH", { month: "long", year: "numeric" }) : null
    summary = { ...goal, progress: Math.min(1, Math.max(0, total / goal.amount)), left, eta }
  }
  return { total, thisMonth: savedIn(month), monthlyAvg, goal: summary }
}

/** The numbers a tip was based on, saved with each Helpful / Not helpful vote as training data for a future model. */
export function tipFeatures(entries: Entry[], budget: number, today: string): Record<string, number> {
  const month = monthOf(today)
  const s = monthSummary(entries, month, budget, today)
  const p = spendingPatterns(entries, month, today)
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
  }
}

/** Keeps one vote per tip (the latest) and the last 500 in all. */
export const addVote = (votes: TipVote[] = [], vote: TipVote) => [...votes.filter((v) => v.id !== vote.id), vote].slice(-500)

export type Tip = { id: string; kind: string; tone: "warn" | "tip" | "good"; title: string; why: string; action: string }

const TONE_ORDER = { warn: 0, tip: 1, good: 2 }

/**
 * What to do, in plain words, from the month's own numbers. Warnings come first, then tips by how many pesos
 * they're worth, scaled by how helpful you've found that kind of tip. A tip you marked Not helpful stays hidden.
 */
export function advise(entries: Entry[], month: string, budget: number, today: string, extra: { goal?: Goal; votes?: TipVote[] } = {}): Tip[] {
  const s = monthSummary(entries, month, budget, today)
  if (!s.day) return []
  const p = spendingPatterns(entries, month, today)
  const cats = categoryDetail(entries, month, today)
  const current = s.daysLeft > 0
  const name = monthName(month)
  const prevName = monthName(shiftMonth(month, -1))
  const when = current ? "this month" : `in ${name}`
  const expenses = expensesIn(entries, month)
  const toMonthEnd = (amount: number) => (current ? Math.round((amount / s.day) * s.days) : amount)
  const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`
  const lower = (c: CategoryId) => CATEGORIES[c].toLowerCase()
  const tips: (Tip & { weight: number })[] = []
  const add = (kind: string, subject: string, tone: Tip["tone"], weight: number, title: string, why: string, action: string) =>
    tips.push({ id: `${kind}:${subject}:${month}`, kind, tone, weight, title, why, action })

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

  // The budget.
  if (!budget) {
    const last = monthSummary(entries, shiftMonth(month, -1), 0, today).spent
    const suggest = Math.max(50000, Math.floor((last * 0.9) / 50000) * 50000)
    add(
      "budget-set",
      "",
      "tip",
      Number.MAX_SAFE_INTEGER,
      "Set a monthly budget",
      `${last ? `Last month you spent ${pesos(last)}. ` : ""}A budget lets Tally warn you before you overspend.`,
      last ? `Tap ··· at the top, then Monthly budget. Try ${pesos(suggest)}.` : "Tap ··· at the top, then Monthly budget."
    )
  } else if (s.spent > budget) {
    add(
      "budget-over",
      "",
      "warn",
      s.spent - budget,
      current ? `You're ${pesos(s.spent - budget)} over your budget` : `You went ${pesos(s.spent - budget)} over budget`,
      current ? `Your budget is ${pesos(budget)} and you've spent ${pesos(s.spent)}, with ${days(s.daysLeft)} still to go.` : `Your budget was ${pesos(budget)} and you spent ${pesos(s.spent)} in ${name}.`,
      current
        ? `Until the 1st, buy only what you really need. That has been costing you about ${pesos((p.needs - bills) / s.day)} a day.`
        : topWant
          ? `Next month, cut back on ${lower(topWant.category)} first. It cost you ${pesos(topWant.total)}.`
          : "Next month, set a budget closer to what you really spend."
    )
  } else if (!current) {
    add("budget-done", "", "good", 0, `You stayed ${pesos(budget - s.spent)} under budget`, `You spent ${pesos(s.spent)} of your ${pesos(budget)} budget in ${name}.`, "Put the leftover into savings.")
  } else if (s.day >= 7 || forecast.fromHistory) {
    const perDay = safe?.perDay ?? s.perDay
    if (forecast.total > budget)
      add(
        "budget-forecast-over",
        "",
        "warn",
        forecast.total - budget,
        `You're on track to overspend by ${pesos(forecast.total - budget)}`,
        `You're spending about ${pesos(forecast.dailyRate)} a day on everyday things${comingUp}. That adds up to about ${pesos(forecast.total)} this month, but your budget is ${pesos(budget)}.`,
        `To stay within budget, spend no more than ${pesos(perDay)} a day from now on.${split(perDay)}`
      )
    else
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

  // Income. Healthy limits: essentials 50% of income, extras 30%, savings 20%.
  if (s.income > 0) {
    const rate = s.net / s.income
    const extrasLimit = s.income * 0.3
    const essentialsLimit = s.income * 0.5
    if (s.net < 0)
      add(
        "income-gap",
        "",
        "warn",
        -s.net,
        `You've spent ${pesos(-s.net)} more than you earned`,
        `You earned ${pesos(s.income)} and spent ${pesos(s.spent)} ${when}.`,
        topWant ? `Cut back on ${lower(topWant.category)} first. You've spent ${pesos(topWant.total)} on it.` : "Hold off on extras until more money comes in."
      )
    if (p.wants > extrasLimit)
      add(
        "extras-high",
        "",
        "tip",
        p.wants - extrasLimit,
        "Too much is going to extras",
        `${pct(p.wants / s.income)} of your income went to food, shopping and leisure (${listCats(WANTS)}). A healthy limit is 30%, or ${pesos(extrasLimit)}.`,
        `Spend ${pesos(p.wants - extrasLimit)} less on extras to save more.`
      )
    else if (p.needs > essentialsLimit && topNeed)
      add(
        "essentials-high",
        "",
        "tip",
        p.needs - essentialsLimit,
        "Your essentials cost a lot",
        `${pct(p.needs / s.income)} of your income went to bills, groceries, transport and health (${listCats(NEEDS)}). A healthy limit is 50%, or ${pesos(essentialsLimit)}.`,
        `Essentials are hard to cut fast. Start with your biggest one, ${lower(topNeed.category)} at ${pesos(topNeed.total)}.`
      )
    else if (rate >= 0.2)
      add("saving-rate", "", "good", 0, `You're keeping ${pct(rate)} of your income`, `That's ${pesos(s.net)} ${current ? "so far" : `in ${name}`}. Keeping at least 20% is a healthy goal, and you're there.`, "Keep it up.")
    else if (s.net >= 0) {
      const goal = Math.round(s.income * 0.2) - s.net
      add("saving-low", "", "tip", goal, `You're keeping ${pct(rate)} of your income`, `A healthy goal is to keep 20%, which is ${pesos(s.income * 0.2)}. You've kept ${pesos(s.net)}.`, `Spend ${pesos(goal)} less to reach it.`)
    }
  } else if (!entries.some(isIncome)) {
    add("income-missing", "", "tip", 2, "Add your income", "Then Tally can tell you whether you're saving money or losing it.", "Type it with a plus sign, like +25000 salary.")
  }

  // Savings and the goal.
  const savings = savingsSummary(entries, extra.goal, today)
  const leftover = s.income - s.spent - s.saved
  if (s.income > 0 && leftover >= 100000 && (!current || s.day >= 20))
    add(
      "savings-leftover",
      "",
      "tip",
      leftover * 0.5,
      `You have ${pesos(leftover)} left over`,
      `You earned ${pesos(s.income)}, spent ${pesos(s.spent)} and saved ${pesos(s.saved)} ${when}.`,
      current ? `Move it to savings before it gets spent: type save ${Math.floor(leftover / 100)}.` : "Move it to savings."
    )
  const g = savings.goal
  if (g && g.left === 0) add("savings-goal-done", g.name, "good", 0, `You reached your ${g.name} goal`, `${pesos(savings.total)} saved of ${pesos(g.amount)}.`, "Set a new goal from the ··· menu.")
  else if (g && savings.total <= 0)
    add("savings-goal-start", g.name, "tip", g.amount * 0.05, `Start your ${g.name}`, "You haven't put anything aside for it yet.", "After payday, type save and an amount, like save 1000.")
  else if (g && savings.monthlyAvg > 0) {
    const monthsLeft = Math.ceil(g.left / savings.monthlyAvg)
    const faster = monthsLeft > 1 ? g.left / (monthsLeft - 1) - savings.monthlyAvg : 0
    add(
      "savings-goal",
      g.name,
      "good",
      0,
      `${g.name}: ${pct(g.progress)} of the way`,
      `You've saved ${pesos(savings.total)} of ${pesos(g.amount)}. At about ${pesos(savings.monthlyAvg)} a month, you'll get there by ${g.eta}.`,
      faster ? `Saving ${pesos(faster)} more a month gets you there a month sooner.` : "One more month like this and you're there."
    )
  } else if (!g && s.income > 0 && !entries.some(isSaving))
    add("savings-start", "", "tip", s.income * 0.05, "Pay yourself first", "You logged income but haven't set any money aside yet.", "Right after payday, type save and an amount, like save 2000. It won't count as spending.")

  // Extras growing against the same days of last month. Needs follow the calendar (rent day, grocery Saturdays).
  const grown = cats
    .filter((c) => WANTS.includes(c.category) && c.before > 0 && c.total - c.before >= 50000 && c.total >= c.before * 1.25)
    .sort((a, b) => b.total - b.before - (a.total - a.before))[0]

  // A week that's unusual for you. A category already growing on the month gets that one tip, not two.
  if (current)
    for (const u of unusualWeeks(entries, today)) {
      if (u.direction === "high" && u.category !== grown?.category) {
        const week = entries.filter((e) => isExpense(e) && e.category === u.category && e.date > shiftDay(today, -7) && e.date <= today)
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
  const top = cats.find((c) => WANTS.includes(c.category))
  if (top && top.category !== grown?.category && s.spent >= 300000 && top.share >= 0.35) {
    const trim = toMonthEnd(top.total) / 10
    add(
      "category-share",
      top.category,
      "tip",
      trim,
      `${CATEGORIES[top.category]} is where most of your money goes`,
      `It's ${pct(top.share)} of everything you spent: ${pesos(top.total)} over ${top.count} purchases, about ${pesos(top.average)} each. Mostly ${describeItems(top.top)}.`,
      `Spending 10% less on it saves about ${pesos(trim)} a month.`
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
  const habit = [...repeats].sort((a, b) => b[1].total - a[1].total).find(([, r]) => r.count >= 4 && r.total >= 50000)
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
      `Doing it half as often saves about ${pesos(monthly / 2)} a month.`
    )
  }

  // Small extras adding up (fares and lunches are needs, so they don't count).
  const small = expenses.filter((e) => e.amount < 20000 && WANTS.includes(e.category) && !NECESSITIES.has(itemOf(e)))
  const smallSum = sum(small)
  if (small.length >= 10 && smallSum >= 100000 && smallSum / s.spent >= 0.15) {
    const cap = Math.round(((smallSum / s.day) * 0.7) / 1000) * 1000
    add(
      "small-buys",
      "",
      "tip",
      smallSum * 0.3,
      "Small extras are adding up",
      `${small.length} extras under ₱200 came to ${pesos(smallSum)}, ${pct(smallSum / s.spent)} of what you spent ${when}. Mostly ${describeItems(topItems(small, 2))}.`,
      `Try to keep small extras under ${pesos(cap)} a day. You'd save about ${pesos(toMonthEnd(smallSum) * 0.3)} a month.`
    )
  }

  // Weekends against weekdays.
  const { weekendAvg: a, weekdayAvg: b } = p
  if (p.weekendDays >= 2 && p.weekdayDays >= 4 && b > 0 && a >= b * 1.5 && a - b >= 20000) {
    const cap = Math.round((b * 1.25) / 1000) * 1000
    add(
      "weekends",
      "",
      "tip",
      (a - b) * 8,
      "You spend a lot more on weekends",
      `On weekends you spend about ${pesos(a)} a day on food, shopping and leisure. On weekdays it's ${pesos(b)}.`,
      `Try a ${pesos(cap)} limit on weekend days. You'd save about ${pesos((a - cap) * 8)} a month.`
    )
  }

  // One expense big enough to plan for.
  const big = p.largest
  if (big && s.spent >= 300000 && big.amount / s.spent >= 0.15)
    add(
      "big-expense",
      itemOf(big),
      "tip",
      big.amount * 0.1,
      `One purchase was ${pct(big.amount / s.spent)} of your spending`,
      `${capitalize(big.note || CATEGORIES[big.category])} on ${shortDate(big.date)} cost ${pesos(big.amount)}.`,
      big.category === "bills" ? `If you pay this every month, set aside ${pesos(big.amount / 4)} each week so the money is ready.` : "For big purchases like this, plan ahead at the start of the month."
    )

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
