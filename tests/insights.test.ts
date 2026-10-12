// Insights: tips, how money went, recurring bills, your normal week, the forecast, safe to spend and savings.
process.env.TZ = "Asia/Manila"

import assert from "node:assert/strict"
import test from "node:test"
import {
  addVote,
  advise,
  categoryDetail,
  forecastMonth,
  recurringBills,
  safeToSpend,
  savingsSummary,
  spendingPatterns,
  unusualWeeks,
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
  assert.equal(wants.action, "Spend ₱1,500 less on extras to save more.")
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
  assert.equal(Math.round(s.monthlyAvg), 266667)
  assert.equal(s.goal?.progress, 0.16)
  assert.equal(s.goal?.eta, "February 2028")
})
