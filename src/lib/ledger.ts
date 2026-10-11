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

const NEEDS: CategoryId[] = ["bills", "groceries", "transport", "health"]
const WANTS: CategoryId[] = ["food", "shopping", "leisure"]

const dayOf = (date: string) => Number(date.slice(8, 10))
const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1)
const itemOf = (e: Entry) => wordsOf(e.note)[0] ?? CATEGORIES[e.category].toLowerCase()
const sum = (list: Entry[]) => list.reduce((n, e) => n + e.amount, 0)
const expensesIn = (entries: Entry[], month: string, uptoDay = 31) =>
  entries.filter((e) => !e.income && e.date.startsWith(month) && dayOf(e.date) <= uptoDay)
const shortDate = (date: string) => toDate(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })

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
const describeItems = (items: ItemGroup[]) =>
  items.map((i) => `${capitalize(i.item)} (${i.count > 1 ? `${i.count}×, ` : ""}${pesos(i.total)})`).join(", ")

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

  const since = entries.reduce((m, e) => (e.date < m ? e.date : m), today)
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

export type Tip = { tone: "warn" | "tip" | "good"; title: string; why: string; action: string }

const TONE_ORDER = { warn: 0, tip: 1, good: 2 }

/** What to do, from the month's own numbers: warnings first, then tips by how many pesos they're worth. */
export function advise(entries: Entry[], month: string, budget: number, today: string): Tip[] {
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
  const tips: (Tip & { weight: number })[] = []
  const add = (tone: Tip["tone"], weight: number, title: string, why: string, action: string) => tips.push({ tone, weight, title, why, action })

  const bills = cats.find((c) => c.category === "bills")?.total ?? 0
  const topWant = cats.find((c) => WANTS.includes(c.category))
  const topNeed = cats.find((c) => NEEDS.includes(c.category))
  const listCats = (group: CategoryId[]) =>
    cats
      .filter((c) => group.includes(c.category))
      .map((c) => `${CATEGORIES[c.category]} ${pesos(c.total)}`)
      .join(", ")
  // Splits a daily allowance the way this month's day-to-day spending divides (bills are paid once, so left out).
  const dayToDay = s.spent - bills
  const split = (perDay: number) =>
    dayToDay > 0 ? ` That's about ${pesos((perDay * (p.needs - bills)) / dayToDay)} for needs and ${pesos((perDay * (p.wants + p.other)) / dayToDay)} for everything else.` : ""

  // Budget and pace.
  if (!budget) {
    const last = monthSummary(entries, shiftMonth(month, -1), 0, today).spent
    const suggest = Math.max(50000, Math.floor((last * 0.9) / 50000) * 50000)
    add(
      "tip",
      Number.MAX_SAFE_INTEGER,
      "Set a monthly budget",
      last ? `You spent ${pesos(last)} in ${prevName}. Without a budget there's nothing to pace against.` : "Without a budget there's nothing to pace against.",
      last ? `Try ${pesos(suggest)}, 10% under ${prevName}, from the ··· menu.` : "Set one from the ··· menu."
    )
  } else if (s.spent > budget) {
    add(
      "warn",
      s.spent - budget,
      current ? `Over budget by ${pesos(s.spent - budget)}` : `Went ${pesos(s.spent - budget)} over budget`,
      current ? `${pesos(s.spent)} spent against ${pesos(budget)}, with ${days(s.daysLeft)} still to go.` : `${pesos(s.spent)} spent against ${pesos(budget)} in ${name}.`,
      current
        ? `Spend only on needs until the 1st. Day-to-day needs have run about ${pesos((p.needs - bills) / s.day)} a day.`
        : topWant
          ? `Next month, start by trimming ${CATEGORIES[topWant.category]}, which came to ${pesos(topWant.total)}.`
          : "Next month, set a budget that matches what you really spend, then trim from there."
    )
  } else if (!current) {
    add("good", 0, `Finished ${pesos(budget - s.spent)} under budget`, `${pesos(s.spent)} of ${pesos(budget)} spent in ${name}.`, "Move the difference into savings so it doesn't drift into next month.")
  } else if (s.day >= 7) {
    const rate = (s.spent - bills) / s.day
    if (s.projected > budget)
      add(
        "warn",
        s.projected - budget,
        `Heading ${pesos(s.projected - budget)} over budget`,
        `At ${pesos(rate)} a day you'll reach ${pesos(s.projected)} by month-end (bills counted once).`,
        `Keep to ${pesos(s.perDay)} a day from here.${split(s.perDay)}`
      )
    else add("good", 0, `On pace to finish ${pesos(budget - s.projected)} under budget`, `Projected ${pesos(s.projected)} of ${pesos(budget)} at ${pesos(rate)} a day.`, `Your allowance is ${pesos(s.perDay)} a day.${split(s.perDay)}`)
  } else if (s.spent > s.pace) {
    // Under a week of data, a month-end projection is mostly noise; say what's true instead.
    add(
      "tip",
      s.spent - s.pace,
      `${pct(s.spent / budget)} of the budget used in ${days(s.day)}`,
      `${pesos(s.spent)} spent; an even pace would be ${pesos(s.pace)} by now.${bills ? ` Bills were ${pesos(bills)} of it.` : ""}`,
      `Keep to ${pesos(s.perDay)} a day for the rest of the month.${split(s.perDay)}`
    )
  }

  // Income, and the 50/30/20 guide: needs 50%, wants 30%, savings 20%.
  if (s.income > 0) {
    const rate = s.net / s.income
    const wantsCap = s.income * 0.3
    const needsCap = s.income * 0.5
    if (s.net < 0)
      add(
        "warn",
        -s.net,
        `Spending is ${pesos(-s.net)} more than income`,
        `${pesos(s.income)} came in and ${pesos(s.spent)} went out ${when}.`,
        topWant ? `Close the gap from wants first: ${CATEGORIES[topWant.category]} is ${pesos(topWant.total)} so far.` : "Hold off on extras until more income comes in."
      )
    if (p.wants > wantsCap)
      add("tip", p.wants - wantsCap, `Wants are ${pct(p.wants / s.income)} of income`, `The 50/30/20 guide keeps wants to 30% (${pesos(wantsCap)}). Yours: ${listCats(WANTS)}.`, `Bring wants down by ${pesos(p.wants - wantsCap)} to protect your savings.`)
    else if (p.needs > needsCap && topNeed)
      add("tip", p.needs - needsCap, `Needs are ${pct(p.needs / s.income)} of income`, `The 50/30/20 guide keeps needs to 50% (${pesos(needsCap)}). Yours: ${listCats(NEEDS)}.`, `Needs are slow to change. Start with the biggest, ${CATEGORIES[topNeed.category]} at ${pesos(topNeed.total)}.`)
    else if (rate >= 0.2)
      add(
        "good",
        0,
        `Saving ${pct(rate)} of income`,
        `Needs ${pct(p.needs / s.income)}, wants ${pct(p.wants / s.income)}, saved ${pct(rate)}: inside the 50/30/20 guide.`,
        current ? `Keep it there. That's ${pesos(s.net)} saved so far.` : `That's ${pesos(s.net)} kept in ${name}.`
      )
    else if (s.net >= 0) {
      const goal = Math.round(s.income * 0.2) - s.net
      add("tip", goal, `Saving ${pct(rate)} of income`, `The 50/30/20 guide aims to save 20% (${pesos(s.income * 0.2)}); you're at ${pesos(s.net)}.`, `Spend ${pesos(goal)} less to get there.`)
    }
  } else if (!entries.some((e) => e.income)) {
    add("tip", 2, "Log your income", "Without it, Tally can't tell whether you're saving or falling behind.", "Type it with a plus sign, like +25000 salary.")
  }

  // A wants category growing against the same days of last month. Needs follow the calendar (rent day, grocery Saturdays).
  const grown = cats
    .filter((c) => WANTS.includes(c.category) && c.before > 0 && c.total - c.before >= 50000 && c.total >= c.before * 1.25)
    .sort((a, b) => b.total - b.before - (a.total - a.before))[0]
  if (grown) {
    const save = toMonthEnd(grown.total - grown.before)
    const cap = Math.round(grown.before / s.day / 1000) * 1000
    add(
      "tip",
      save,
      `${CATEGORIES[grown.category]} is up ${pct((grown.total - grown.before) / grown.before)}`,
      `${pesos(grown.total)} against ${pesos(grown.before)} by this point in ${prevName}. Mostly ${describeItems(grown.top.slice(0, 2))}.`,
      current
        ? `Keep ${CATEGORIES[grown.category].toLowerCase()} to ${pesos(cap)} a day, ${prevName}'s pace, and you'll save about ${pesos(save)} by month-end.`
        : `${prevName}'s level would have saved ${pesos(save)}.`
    )
  }

  // One wants category taking a big share.
  const top = cats.find((c) => WANTS.includes(c.category))
  if (top && top.category !== grown?.category && s.spent >= 300000 && top.share >= 0.35) {
    const trim = toMonthEnd(top.total) / 10
    add(
      "tip",
      trim,
      `${CATEGORIES[top.category]} is ${pct(top.share)} of spending`,
      `${pesos(top.total)} across ${top.count} buys, about ${pesos(top.average)} each. Biggest: ${describeItems(top.top)}.`,
      `Trimming it by 10% frees about ${pesos(trim)} a month.`
    )
  }

  // The same treat, again and again.
  const repeats = new Map<string, { count: number; total: number }>()
  for (const e of expenses) {
    const w = wordsOf(e.note)[0]
    if (!w || NECESSITIES.has(w) || e.category === "bills" || e.category === "health") continue
    const r = repeats.get(w) ?? { count: 0, total: 0 }
    repeats.set(w, { count: r.count + 1, total: r.total + e.amount })
  }
  const habit = [...repeats].sort((a, b) => b[1].total - a[1].total).find(([, r]) => r.count >= 4 && r.total >= 50000)
  if (habit) {
    const [w, r] = habit
    const monthly = toMonthEnd(r.total)
    add(
      "tip",
      monthly / 2,
      `${capitalize(w)}: ${r.count}× ${when}`,
      `${pesos(r.total)} in all, about ${pesos(r.total / r.count)} each${current ? `, on track for ${pesos(monthly)} by month-end` : ""}.`,
      `Cutting it in half saves about ${pesos(monthly / 2)} a month.`
    )
  }

  // Small buys adding up.
  const small = expenses.filter((e) => e.amount < 20000)
  const smallSum = sum(small)
  if (small.length >= 10 && smallSum >= 100000 && smallSum / s.spent >= 0.15) {
    const cap = Math.round(((smallSum / s.day) * 0.7) / 1000) * 1000
    add(
      "tip",
      smallSum * 0.3,
      `${small.length} small buys added up`,
      `Buys under ₱200 came to ${pesos(smallSum)}, ${pct(smallSum / s.spent)} of your spending ${when}. Most were ${describeItems(topItems(small, 2))}.`,
      `Small buys slip past a budget. Capping them at ${pesos(cap)} a day saves about ${pesos(toMonthEnd(smallSum) * 0.3)} a month.`
    )
  }

  // Weekends against weekdays.
  const { weekendAvg: a, weekdayAvg: b } = p
  if (p.weekendDays >= 2 && p.weekdayDays >= 4 && b > 0 && a >= b * 1.5 && a - b >= 20000) {
    const cap = Math.round((b * 1.25) / 1000) * 1000
    add(
      "tip",
      (a - b) * 8,
      `Weekends cost ${(a / b).toFixed(1)}× a weekday`,
      `${pesos(a)} a day on weekends against ${pesos(b)} on weekdays, counting food, shopping and leisure.`,
      `Cap weekend days at ${pesos(cap)} and you'd save about ${pesos((a - cap) * 8)} a month.`
    )
  }

  // One expense big enough to plan for.
  const big = p.largest
  if (big && s.spent >= 300000 && big.amount / s.spent >= 0.15) {
    add(
      "tip",
      big.amount * 0.1,
      `One expense was ${pct(big.amount / s.spent)} of the month`,
      `${capitalize(big.note || CATEGORIES[big.category])} on ${shortDate(big.date)} cost ${pesos(big.amount)}.`,
      big.category === "bills"
        ? `If it comes every month, set aside ${pesos(big.amount / 4)} a week so it never lands all at once.`
        : "Plan buys this size at the start of the month so the budget makes room for them."
    )
  }

  if (current && p.noSpend >= 3) add("good", 0, `${p.noSpend} no-spend days`, "Days this month with nothing spent at all.", "Aim for one more each week.")

  return tips
    .sort((x, y) => TONE_ORDER[x.tone] - TONE_ORDER[y.tone] || y.weight - x.weight)
    .slice(0, 6)
    .map(({ tone, title, why, action }) => ({ tone, title, why, action }))
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
