// Insights: tips, how money went, recurring bills, your normal week, the forecast, safe to spend and savings.
process.env.TZ = "Asia/Manila"

import assert from "node:assert/strict"
import test from "node:test"
import {
  addVote,
  advise,
  categoryDetail,
  dayBrief,
  incomeProfile,
  forecastMonth,
  recurringBills,
  safeToSpend,
  savingsSummary,
  spendingPatterns,
  unusualWeeks,
  usualMonth,
} from "../src/lib/insights.ts"
import { shiftDay, type Entry, type TipVote } from "../src/lib/ledger.ts"

let seq = 0
const entry = (date: string, pesos: number, note: string, extra: Partial<Entry> = {}): Entry => ({
  id: `i${++seq}`,
  date,
  amount: pesos * 100,
  income: false,
  note,
  category: "food",
  createdAt: seq,
  ...extra,
})
const day = (month: string, d: number) => `${month}-${String(d).padStart(2, "0")}`

// September: lunch ₱300 a day. October: lunch ₱600 a day plus Starbucks on the first six days.
const doubledLunches = () => {
  const es: Entry[] = []
  for (let d = 1; d <= 10; d++) {
    es.push(entry(day("2026-09", d), 300, "lunch"))
    es.push(entry(day("2026-10", d), 600, "lunch"))
  }
  for (let d = 1; d <= 6; d++) es.push(entry(day("2026-10", d), 180, "starbucks"))
  return es
}

// July to 5 October: lunch ₱200 every day, rent on the 1st, Meralco around the 9th or 10th (not yet in October).
const billsAndLunches = () => {
  const es: Entry[] = []
  for (let d = "2026-07-01"; d <= "2026-10-05"; d = shiftDay(d, 1)) es.push(entry(d, 200, "lunch"))
  for (const m of ["2026-07", "2026-08", "2026-09", "2026-10"]) es.push(entry(`${m}-01`, 8000, "rent", { category: "bills" }))
  es.push(entry("2026-08-09", 2100, "meralco", { category: "bills" }), entry("2026-09-10", 2300, "meralco", { category: "bills" }))
  es.push(entry("2026-09-20", 549, "netflix", { category: "bills" }))
  return es
}

test("advise warns about the forecast first, then explains what grew and the repeat habit", () => {
  const tips = advise(doubledLunches(), "2026-10", 1000000, "2026-10-10")
  const titled = (start: string) => tips.find((t) => t.title.startsWith(start))
  assert.equal(tips[0].tone, "warn")
  assert.equal(tips[0].title, "You're on track to overspend by ₱11,948")
  assert.match(tips[0].why, /about ₱21,948 this month/)
  const food = titled("You're spending more on food")
  assert.ok(food, JSON.stringify(tips))
  assert.match(food.why, /Now it's ₱7,080, 136% more\. Mostly Lunch \(10×, ₱6,000\), Starbucks \(6×, ₱1,080\)/)
  assert.equal(food.action, "Try to keep it under ₱300 a day, like last month. You'd save about ₱12,648 a month.")
  assert.ok(!titled("Food is unusually high"), "food already has its tip")
  assert.ok(titled("You spent on Starbucks 6 times this month"), JSON.stringify(tips))
  assert.ok(!tips.some((t) => t.title.includes("Lunch")), "lunch is a need, not a habit")
  assert.equal(new Set(tips.map((t) => t.id)).size, tips.length)
})

test("habits and small extras leave out needs like the daily commute", () => {
  const es: Entry[] = []
  for (let d = 1; d <= 12; d++) es.push(entry(day("2026-10", d), 186, "grab to office", { category: "transport" }), entry(day("2026-10", d), 150, "lunch"), entry(day("2026-10", d), 120, "milktea"))
  const tips = advise(es, "2026-10", 0, "2026-10-12")
  assert.ok(tips.some((t) => t.title === "You spent on Milktea 12 times this month"), JSON.stringify(tips))
  const small = tips.find((t) => t.kind === "small-buys")
  assert.equal(small?.why, "12 extras under ₱200 came to ₱1,440, 26% of what you spent this month. Mostly Milktea (12×, ₱1,440).")
  assert.ok(!tips.some((t) => t.title.includes("Grab")), JSON.stringify(tips))
})

test("a bill past its usual day says so, and asks whether it was paid", () => {
  const tips = advise(billsAndLunches(), "2026-10", 0, "2026-10-12")
  const meralco = tips.find((t) => t.kind === "bill-due")
  assert.equal(meralco?.title, "Meralco is usually paid by now")
  assert.match(meralco.action, /^Paid it already\? Log it so your numbers stay right\. If not, keep ₱2,200 aside for it\.$/)
  assert.equal(advise(billsAndLunches(), "2026-10", 0, "2026-10-05").find((t) => t.kind === "bill-due")?.title, "Meralco is coming up")
})

test("in the first week without history, advise reports budget used instead of a noisy projection", () => {
  const es = [entry("2026-10-01", 8000, "rent", { category: "bills" }), entry("2026-10-03", 1000, "groceries", { category: "groceries" })]
  const tips = advise(es, "2026-10", 2000000, "2026-10-04")
  const used = tips.find((t) => t.title === "You've already used 45% of your budget")
  assert.ok(used, JSON.stringify(tips))
  assert.match(used.action, /^Spend no more than ₱393 a day/)
  assert.ok(!tips.some((t) => t.title.includes("overspend")))
  const big = tips.find((t) => t.title === "One purchase was 89% of your spending")
  assert.ok(big, JSON.stringify(tips))
  assert.match(big.action, /set aside ₱2,000 each week/)
})

test("without a budget, advise suggests one from last month", () => {
  const es = [entry("2026-09-10", 3000, "rent", { category: "bills" }), entry("2026-10-02", 100, "lunch")]
  const tips = advise(es, "2026-10", 0, "2026-10-05")
  assert.equal(tips[0].title, "Set a monthly budget")
  assert.match(tips[0].action, /Try ₱2,500/)
})

test("advise checks income against healthy limits (essentials 50%, extras 30%, savings 20%)", () => {
  const es = [
    entry("2026-10-01", 10000, "salary", { income: true, category: "income" }),
    entry("2026-10-02", 4000, "shopee", { category: "shopping" }),
    entry("2026-10-03", 500, "lunch"),
    entry("2026-10-04", 2000, "meralco", { category: "bills" }),
  ]
  const tips = advise(es, "2026-10", 0, "2026-10-10")
  const wants = tips.find((t) => t.title === "Too much is going to extras")
  assert.ok(wants, JSON.stringify(tips))
  assert.match(wants.why, /^45% of your income went to food, shopping and leisure \(Shopping ₱4,000, Food ₱500\)\. A healthy limit is 30%, or ₱3,000\.$/)
  assert.equal(wants.action, "No more extras this month. In November, keep them under ₱3,000.")
  assert.ok(tips.some((t) => t.title === "One purchase was 62% of your spending"), JSON.stringify(tips))
  assert.ok(tips.some((t) => t.title === "Pay yourself first"), JSON.stringify(tips))
})

test("Not helpful hides a tip, and votes reorder kinds of tips", () => {
  const es = doubledLunches()
  const plain = advise(es, "2026-10", 1000000, "2026-10-10")
  const habit = plain.find((t) => t.kind === "habit")
  assert.ok(habit)
  const vote = (id: string, kind: string, v: 1 | -1): TipVote => ({ id, kind, vote: v, at: 0, features: {} })
  assert.ok(!advise(es, "2026-10", 1000000, "2026-10-10", { votes: [vote(habit.id, "habit", -1)] }).some((t) => t.id === habit.id))
  const votes = [vote("habit:a:2026-08", "habit", 1), vote("habit:b:2026-09", "habit", 1), vote("category-up:x:2026-08", "category-up", -1), vote("category-up:y:2026-09", "category-up", -1)]
  const order = (tips: { kind: string }[]) => [tips.findIndex((t) => t.kind === "habit"), tips.findIndex((t) => t.kind === "category-up")]
  const [habitBefore, upBefore] = order(plain)
  const [habitAfter, upAfter] = order(advise(es, "2026-10", 1000000, "2026-10-10", { votes }))
  assert.ok(habitBefore > upBefore, "category-up outranks habit before any votes")
  assert.ok(habitAfter < upAfter, "after the votes, habit outranks category-up")
  assert.deepEqual(addVote([vote("a", "k", 1), vote("b", "k", 1)], vote("a", "k", -1)), [vote("b", "k", 1), vote("a", "k", -1)])
})

test("categoryDetail explains how each category's money went", () => {
  const [food] = categoryDetail(doubledLunches(), "2026-10", "2026-10-10")
  assert.equal(food.category, "food")
  assert.equal(food.total, 708000)
  assert.equal(food.count, 16)
  assert.equal(food.average, 44250)
  assert.equal(food.before, 300000)
  assert.equal(Math.round((food.change ?? 0) * 100), 136)
  assert.deepEqual(food.top, [
    { item: "lunch", count: 10, total: 600000 },
    { item: "starbucks", count: 6, total: 108000 },
  ])
  assert.equal(food.biggest.amount, 60000)
})

test("spendingPatterns splits needs from wants and finds the big days", () => {
  const es = [
    entry("2026-10-01", 8000, "rent", { category: "bills" }),
    entry("2026-10-03", 1000, "puregold", { category: "groceries" }),
    entry("2026-10-03", 200, "lunch"),
    entry("2026-10-04", 500, "shopee", { category: "shopping" }),
    entry("2026-10-04", 2000, "", { category: "savings" }),
  ]
  const p = spendingPatterns(es, "2026-10", "2026-10-05")
  assert.equal(p.needs, 900000)
  assert.equal(p.wants, 70000)
  assert.equal(p.other, 0)
  assert.equal(p.perDay, 194000)
  assert.deepEqual(p.busiest, { date: "2026-10-01", total: 800000 })
  assert.equal(p.largest?.note, "rent")
  assert.equal(p.noSpend, 1)
})

test("recurringBills finds monthly bills, skips daily habits, and knows what's still to pay", () => {
  const bills = recurringBills(billsAndLunches(), "2026-10-05")
  assert.deepEqual(
    bills.map((b) => [b.item, b.amount, b.due, b.paid]),
    [
      ["meralco", 220000, "2026-10-10", false],
      ["rent", 800000, "2026-11-01", true],
    ]
  )
})

test("forecastMonth uses your last 4 weeks early in the month, plus the bills still to come", () => {
  assert.deepEqual(forecastMonth(billsAndLunches(), "2026-10", "2026-10-05"), { total: 1640000, upcoming: 220000, dailyRate: 20000, fromHistory: true })
})

test("safeToSpend leaves room for the bills still to come", () => {
  assert.deepEqual(safeToSpend(billsAndLunches(), 2000000, "2026-10-05"), { today: 13333, perDay: 33333, upcoming: 220000, spentToday: 20000, daysLeft: 27 })
  assert.equal(safeToSpend(billsAndLunches(), 0, "2026-10-05"), null)
})

test("unusualWeeks compares the last 7 days with your usual week", () => {
  const today = "2026-10-11"
  const es = [1, 2, 3, 4, 5, 6, 7, 8].map((k) => entry(shiftDay(today, -7 * k - 6), 1000, "snacks"))
  es.push(entry(today, 2500, "snacks"))
  assert.deepEqual(unusualWeeks(es, today), [{ category: "food", thisWeek: 250000, usual: 100000, weeks: 8, direction: "high" }])
  assert.deepEqual(unusualWeeks([...es.slice(0, 3), es[8]], today), [], "3 weeks of history is not enough")
})

test("savingsSummary totals deposits and withdrawals and dates the goal", () => {
  const es = [
    entry("2026-08-15", 3000, "", { category: "savings" }),
    entry("2026-09-15", 3000, "", { category: "savings" }),
    entry("2026-10-01", 3000, "", { category: "savings" }),
    entry("2026-10-05", 1000, "", { category: "savings", income: true }),
  ]
  const s = savingsSummary(es, { name: "Emergency fund", amount: 5000000 }, "2026-10-11")
  assert.equal(s.total, 800000)
  assert.equal(s.thisMonth, 200000)
  assert.equal(Math.round(s.monthlyAvg), 413793, "₱8,000 net over the 58 days since 15 Aug, as a 30-day month")
  assert.equal(s.deposits, 3)
  assert.equal(s.goal?.progress, 0.16)
  assert.equal(s.goal?.eta, "September 2027")
})

// ---------------------------------------------------------------- advice for every situation

// 13 October, as on the phone: a ₱10,000 budget gone by the 13th, ₱23,700 earned, ₱10,000 saved toward an M5 Pro.
const myOctober = () => [
  entry("2026-10-01", 23700, "salary", { income: true, category: "income" }),
  entry("2026-10-02", 10000, "", { category: "savings" }),
  entry("2026-10-02", 294, "lunch"),
  entry("2026-10-03", 1389, "internet", { category: "bills" }),
  entry("2026-10-04", 294, "lunch"),
  entry("2026-10-05", 610, "inn", { category: "leisure" }),
  entry("2026-10-06", 1500, "shopee", { category: "shopping" }),
  entry("2026-10-07", 294, "lunch"),
  entry("2026-10-08", 520, "miedsa", { category: "leisure" }),
  entry("2026-10-09", 156, "grab", { category: "transport" }),
  entry("2026-10-09", 1200, "uniqlo", { category: "shopping" }),
  entry("2026-10-10", 1132, "games", { category: "leisure" }),
  entry("2026-10-11", 156, "grab", { category: "transport" }),
  entry("2026-10-12", 864, "shoes", { category: "shopping" }),
  entry("2026-10-13", 2500, "yabu", { category: "leisure" }),
]

test("over budget mid-month: where it stands, then a plan for the days left", () => {
  const tips = advise(myOctober(), "2026-10", 1000000, "2026-10-13", { goal: { name: "M5 Pro", amount: 15000000 } })
  assert.deepEqual(
    tips.map((t) => t.title),
    [
      "Your budget ran out on 13 Oct",
      "You still have ₱2,791 this month",
      "A budget you can keep: ₱11,500",
      "One purchase was 23% of your spending",
      "You're saving 42% of your income",
      "M5 Pro: 7% of the way",
    ]
  )
  const [over, cash, fit, big, rate, goal] = tips
  assert.equal(over.tone, "warn")
  assert.equal(over.why, "₱10,909 of ₱10,000 spent, with 19 days to go. Extras were 84% of it: Leisure ₱4,762, Shopping ₱3,564.")
  assert.equal(over.action, "Essentials only until the 1st: about ₱432 for groceries, transport and health. That ends October near ₱11,341.")
  assert.equal(cash.why, "You earned ₱23,700, spent ₱10,909 and saved ₱10,000.")
  assert.equal(cash.action, "Pay for the rest of October from this, not from savings.")
  assert.equal(fit.action, "Set November to ₱11,500. You'd still save ₱10,000 and keep about ₱2,200 spare.")
  assert.equal(big.why, "Yabu on 13 Oct cost ₱2,500. Without it you'd be ₱1,591 under budget.")
  assert.match(big.action, /wait 48 hours before any extra over ₱1,000/)
  assert.equal(rate.why, "₱10,000 of ₱23,700, twice the 20% to aim for.")
  assert.equal(goal.action, "Moving a quarter of your leisure spending (about ₱1,191 a month) to savings gets you there a month sooner.")
  assert.ok(!tips.some((t) => t.kind === "extras-high" || t.kind === "category-share"), "the plan already named the extras")
})

test("heading over with a daily limit below what essentials cost: say so, and give the real landing", () => {
  const es: Entry[] = [entry("2026-10-02", 3000, "shopee", { category: "shopping" })]
  for (let d = 1; d <= 10; d++) es.push(entry(day("2026-10", d), 400, "puregold", { category: "groceries" }))
  const [tip] = advise(es, "2026-10", 1000000, "2026-10-10")
  assert.equal(tip.title, "You're on track to overspend by ₱11,700")
  assert.equal(tip.action, "Essentials alone usually cost about ₱400 a day, so ₱10,000 can't be met now. Skip extras and you'll land near ₱15,400, ₱5,400 over.")
})

test("income comes whenever: one month behind isn't an alarm when the last 90 days are fine", () => {
  // Paid on the 15th and 30th; October's rent landed the day after its first payment.
  const es = [
    entry("2026-09-15", 15000, "salary", { income: true, category: "income" }),
    entry("2026-09-30", 15000, "salary", { income: true, category: "income" }),
    entry("2026-09-20", 5000, "rent", { category: "bills" }),
    entry("2026-10-15", 15000, "salary", { income: true, category: "income" }),
    entry("2026-10-16", 18000, "rent", { category: "bills" }),
  ]
  assert.equal(advise(es, "2026-10", 0, "2026-10-20").find((t) => t.kind === "income-gap"), undefined)
  // Spending that really runs ahead of what comes in, over the whole window, is a warning.
  const behind = [entry("2026-09-01", 10000, "client", { income: true, category: "income" }), entry("2026-09-05", 9000, "rent", { category: "bills" }), entry("2026-10-02", 9000, "rent", { category: "bills" })]
  const gap = advise(behind, "2026-10", 0, "2026-10-10").find((t) => t.kind === "income-gap")
  assert.equal(gap?.tone, "warn")
  assert.equal(gap.title, "You've spent ₱8,000 more than came in")
  assert.equal(gap.why, "₱10,000 came in and ₱18,000 went out over the last 40 days.")
  assert.equal(gap.action, "Bring spending under what comes in: about ₱6,000 a month less.")
})

test("money from earlier months still counts: a small payment this month isn't a shortfall", () => {
  const es = [entry("2026-09-01", 40000, "client", { income: true, category: "income" }), entry("2026-10-05", 500, "noemi", { income: true, category: "income" })]
  for (let d = "2026-09-01"; d <= "2026-10-15"; d = shiftDay(d, 1)) es.push(entry(d, 300, "puregold", { category: "groceries" }))
  const tips = advise(es, "2026-10", 0, "2026-10-15")
  assert.ok(!tips.some((t) => t.kind === "income-gap" || t.kind === "cash-short"), JSON.stringify(tips.map((t) => t.title)))
})

// July to September with uneven income: ₱20,000, then ₱8,000, then ₱30,000, mostly from one client.
const irregular = () => [
  entry("2026-07-01", 5000, "rent", { category: "bills" }),
  entry("2026-07-05", 12000, "client", { income: true, category: "income" }),
  entry("2026-07-20", 8000, "client", { income: true, category: "income" }),
  entry("2026-08-01", 5000, "rent", { category: "bills" }),
  entry("2026-08-18", 8000, "client", { income: true, category: "income" }),
  entry("2026-09-01", 5000, "rent", { category: "bills" }),
  entry("2026-09-03", 18000, "client", { income: true, category: "income" }),
  entry("2026-09-25", 12000, "bonus", { income: true, category: "income" }),
  entry("2026-10-01", 5000, "rent", { category: "bills" }),
]

test("incomeProfile learns an irregular income from what was logged, with nothing asked", () => {
  const inc = incomeProfile(irregular(), "2026-10-10")
  assert.ok(inc)
  const { months, typical, lean, high, steady, expected, gapDays, sinceDays, usualPayment } = inc
  assert.deepEqual(
    { months, typical, lean, high, steady, expected, gapDays, sinceDays, usualPayment },
    { months: 3, typical: 2000000, lean: 800000, high: 3000000, steady: false, expected: 1800000, gapDays: 19, sinceDays: 15, usualPayment: 1200000 }
  )
  assert.deepEqual(
    inc.streams.map((s) => [s.source, s.regular]),
    [
      ["client", true],
      ["bonus", false],
    ],
    "the client comes back; the bonus was a one-off, never expected"
  )
  const plan = advise(irregular(), "2026-10", 0, "2026-10-10").find((t) => t.kind === "income-plan")
  assert.equal(plan?.title, "Plan on ₱8,000 a month")
  assert.equal(plan.why, "Your income ranged from ₱8,000 to ₱30,000 over the last 3 months, ₱20,000 in a usual one.")
})

test("a dry spell longer than usual, and a month that brought nothing", () => {
  const tips = advise(irregular(), "2026-11", 0, "2026-11-05")
  const dry = tips.find((t) => t.kind === "dry-spell")
  assert.equal(dry?.title, "No income logged for 41 days")
  assert.equal(dry.why, "It usually comes every 19 days or so.")
  assert.match(dry.action, /^Essentials only until money comes in\. What's left, ₱38,000, lasts about 342 days/)
  assert.equal(tips.find((t) => t.kind === "income-plan")?.title, "Some months bring no income")
})

// The same income, spent on ₱600 lunches every day: little is left over between payments.
const spender = (lunch: number) => {
  const es = irregular()
  for (let d = "2026-07-01"; d <= "2026-10-10"; d = shiftDay(d, 1)) es.push(entry(d, lunch, "lunch"))
  return es
}

test("a bigger payment than usual gets a job before it's spent", () => {
  const es = [...spender(600), entry("2026-10-08", 30000, "client", { income: true, category: "income" })]
  const tips = advise(es, "2026-10", 0, "2026-10-10")
  const windfall = tips.find((t) => t.kind === "windfall")
  assert.ok(!tips.some((t) => t.kind === "savings-start"), "one amount to save at a time")
  assert.equal(windfall?.why, "₱30,000 from client on 8 Oct, against a usual ₱12,000.")
  assert.equal(windfall.action, "Give it a job before it gets spent: half into savings (type save 15000), the rest for lean months.")
  // Someone who banks nearly everything is holding more than a month of spending: one instruction covers it.
  const saver = advise([...irregular(), entry("2026-10-08", 30000, "client", { income: true, category: "income" })], "2026-10", 0, "2026-10-10")
  assert.ok(saver.some((t) => t.kind === "savings-buffer") && !saver.some((t) => t.kind === "windfall"))
})

test("a payment with nothing saved from it yet, for someone who saves", () => {
  const es = [...spender(400), entry("2026-08-20", 2000, "", { category: "savings" }), entry("2026-10-08", 10000, "client", { income: true, category: "income" })]
  const tip = advise(es, "2026-10", 0, "2026-10-10").find((t) => t.kind === "save-from-income")
  assert.equal(tip?.title, "Nothing saved from 8 Oct's ₱10,000 yet")
  assert.equal(tip.action, "Put 20% aside now: type save 2000.")
})

test("more in hand than a month of spending: keep a month, save the rest", () => {
  const es = [entry("2026-09-01", 50000, "client", { income: true, category: "income" })]
  for (let d = "2026-09-01"; d <= "2026-10-10"; d = shiftDay(d, 1)) es.push(entry(d, 300, "puregold", { category: "groceries" }))
  const tip = advise(es, "2026-10", 0, "2026-10-10").find((t) => t.kind === "savings-buffer")
  assert.equal(tip?.title, "You're holding ₱29,000 more than a month of spending")
  assert.equal(tip.why, "₱38,000 is left from what's come in, and a month usually costs you about ₱9,000.")
  assert.equal(tip.action, "Keep a month at hand for the gaps between payments, and move the rest to savings: type save 29000.")
})

test("money that won't last to the 1st is a warning", () => {
  const es = [entry("2026-10-01", 10000, "salary", { income: true, category: "income" }), entry("2026-10-02", 5000, "", { category: "savings" })]
  for (let d = 1; d <= 15; d++) es.push(entry(day("2026-10", d), 300, "puregold", { category: "groceries" }))
  const short = advise(es, "2026-10", 0, "2026-10-15").find((t) => t.kind === "cash-short")
  assert.equal(short?.tone, "warn")
  assert.equal(short.title, "Money may run short before the 1st")
  assert.equal(short.why, "₱500 is left after spending and savings. Essentials usually need about ₱4,800 more by the 31st.")
})

test("a safety cushion comes before the goal", () => {
  const es: Entry[] = []
  for (const m of ["2026-08", "2026-09"])
    es.push(entry(`${m}-01`, 30000, "salary", { income: true, category: "income" }), entry(`${m}-02`, 6000, "puregold", { category: "groceries" }), entry(`${m}-03`, 4000, "", { category: "savings" }))
  es.push(entry("2026-10-01", 30000, "salary", { income: true, category: "income" }), entry("2026-10-02", 6000, "puregold", { category: "groceries" }))
  const tip = advise(es, "2026-10", 0, "2026-10-10", { goal: { name: "Laptop", amount: 6000000 } }).find((t) => t.kind === "cushion")
  assert.equal(tip?.title, "Your savings cover 1.3 months of essentials")
  assert.equal(tip.why, "₱8,000 saved, and bills, groceries, transport and health usually cost ₱6,000 a month. Aim for 3 to 6 months put aside for emergencies.")
  assert.equal(tip.action, "Keep the first ₱18,000 for emergencies before spending savings on Laptop.")
})

test("subscriptions among the repeating bills, with their yearly cost", () => {
  const es: Entry[] = []
  for (const m of ["2026-08", "2026-09", "2026-10"]) es.push(entry(`${m}-05`, 549, "netflix", { category: "bills" }), entry(`${m}-07`, 149, "spotify", { category: "bills" }))
  const subs = advise(es, "2026-10", 0, "2026-10-10").find((t) => t.kind === "subscriptions")
  assert.equal(subs?.title, "Your subscriptions cost ₱698 a month")
  assert.equal(subs.why, "Netflix ₱549, Spotify ₱149. That's ₱8,376 a year.")
})

test("spending that has grown three months running", () => {
  const es = [
    entry("2026-07-01", 10000, "rent", { category: "bills" }),
    entry("2026-08-01", 12000, "rent", { category: "bills" }),
    entry("2026-09-01", 14000, "rent", { category: "bills" }),
    entry("2026-10-01", 100, "lunch"),
  ]
  const creep = advise(es, "2026-10", 0, "2026-10-05").find((t) => t.kind === "creep")
  assert.equal(creep?.why, "July ₱10,000, August ₱12,000, September ₱14,000.")
  assert.equal(creep.action, "Hold October to ₱14,000 or less, September's level, so it stops climbing.")
})

test("a payday splurge against a usual day", () => {
  const es: Entry[] = [entry("2026-10-01", 20000, "salary", { income: true, category: "income" })]
  for (let d = "2026-09-01"; d <= "2026-10-14"; d = shiftDay(d, 1)) es.push(entry(d, 200, "movie", { category: "leisure" }))
  for (const d of ["2026-10-01", "2026-10-02", "2026-10-03"]) es.push(entry(d, 2000, "shopee", { category: "shopping" }))
  const splurge = advise(es, "2026-10", 0, "2026-10-15").find((t) => t.kind === "payday")
  assert.equal(splurge?.why, "₱6,600 on extras in the 3 days after you were paid on 1 Oct, against about ₱200 on a usual day.")
  assert.equal(splurge.action, "On payday, save first, then give the next 3 days a ₱1,000 limit for extras.")
})

test("a past month's review names the cause and next month's fix", () => {
  const es = [entry("2026-09-05", 9000, "shopee", { category: "shopping" }), entry("2026-09-10", 3000, "rent", { category: "bills" })]
  const [over] = advise(es, "2026-09", 1000000, "2026-10-05")
  assert.equal(over.title, "You went ₱2,000 over budget in September")
  assert.equal(over.why, "You spent ₱12,000 of your ₱10,000 budget. Extras were 75% of it: Shopping ₱9,000.")
  assert.equal(over.action, "In October, cut shopping first. It cost ₱9,000.")
})

test("usualMonth counts only full months, so a half month of tracking doesn't drag the median down", () => {
  const es = [entry("2026-08-15", 2000, "rent", { category: "bills" }), entry("2026-09-01", 9000, "rent", { category: "bills" }), entry("2026-10-01", 11000, "rent", { category: "bills" })]
  assert.equal(usualMonth(es, "2026-10"), null, "August started mid-month, so only September is full")
  assert.deepEqual(usualMonth(es, "2026-11"), { spent: 1000000, income: 0, essentials: 1000000, months: 2 })
})

test("the day line judges a past day against what it could safely spend", () => {
  const es = myOctober()
  assert.deepEqual(dayBrief(es, 1000000, "2026-10-13", "2026-10-14"), {
    tone: "warn",
    label: "13 Oct went over its safe amount by",
    amount: 241627,
    notes: ["Spent ₱2,500 against ₱84, 4.3× a usual day (₱585). Biggest: yabu ₱2,500.", "It used up the rest of the month's budget."],
  })
  assert.deepEqual(dayBrief(es, 1000000, "2026-10-01", "2026-10-14"), {
    tone: "good",
    label: "No spending on 1 Oct",
    amount: null,
    notes: ["Its ₱323 stayed in the budget for the days after.", "+₱23,700 came in from salary. ₱10,000 went to savings soon after. Good."],
  })
})

test("the day line for today: a safe amount, a stretch limit, or essentials only", () => {
  const es = myOctober()
  assert.deepEqual(dayBrief(es, 2000000, "2026-10-14", "2026-10-14"), {
    tone: "good",
    label: "Safe to spend today",
    amount: 50505,
    notes: ["₱505 a day keeps October on budget for the 18 days left.", "If you really need to, up to ₱8,712 today still fits, with essentials only after."],
  })
  const gone = dayBrief(es, 1000000, "2026-10-14", "2026-10-14")
  assert.equal(gone?.label, "The budget is used up · essentials only today")
  assert.deepEqual(gone.notes, ["If you must spend, keep it to essentials: about ₱22 a day."])
  assert.equal(dayBrief(es, 0, "2026-10-14", "2026-10-14"), null)
})
