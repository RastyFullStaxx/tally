// `npm test` runs this with Node's own test runner; Node 24 strips the TypeScript types itself.
// Manila on purpose: UTC+8 is where `toISOString()` hands back yesterday's date.
process.env.TZ = "Asia/Manila"

import assert from "node:assert/strict"
import test from "node:test"
import { advise, categoryDetail, formatPeso, localDate, mergeBackup, monthSummary, parseLine, shiftDay, shiftMonth, spendingPatterns, toBackup, type Entry } from "../src/lib/ledger.ts"

let seq = 0
const entry = (date: string, pesos: number, note: string, extra: Partial<Entry> = {}): Entry => ({
  id: `e${++seq}`,
  date,
  amount: pesos * 100,
  income: false,
  note,
  category: "food",
  createdAt: seq,
  ...extra,
})
const day = (month: string, d: number) => `${month}-${String(d).padStart(2, "0")}`

test("parseLine reads the amount, the note and income from a typed line", () => {
  const p = (text: string) => parseLine(text, [])
  assert.deepEqual(p("coffee 120"), { amount: 12000, income: false, note: "coffee", category: "food" })
  assert.equal(p("120 coffee")?.amount, 12000)
  assert.equal(p("grab 1,250.50")?.amount, 125050)
  assert.deepEqual(p("7-eleven 85"), { amount: 8500, income: false, note: "7-eleven", category: "food" })
  assert.deepEqual(p("2 coffees 240"), { amount: 24000, income: false, note: "2 coffees", category: "other" })
  assert.equal(p("p150 lunch")?.amount, 15000)
  assert.equal(p("₱99 snacks")?.amount, 9900)
  assert.equal(p("bus p2p 45")?.amount, 4500)
  assert.deepEqual(p("+25k salary"), { amount: 2500000, income: true, note: "salary", category: "income" })
  assert.deepEqual(p("+ 500 sideline"), { amount: 50000, income: true, note: "sideline", category: "income" })
  assert.equal(p("salary 12500")?.income, true)
  assert.equal(p("lunch"), null)
  assert.equal(p("0"), null)
  assert.equal(p("   "), null)
})

test("categories come from your own corrections first, then keywords", () => {
  const history = [
    entry("2026-10-01", 180, "starbucks venti", { category: "leisure" }),
    entry("2026-10-02", 180, "starbucks", { category: "food" }),
  ]
  assert.equal(parseLine("starbucks 200", history)?.category, "food")
  assert.equal(parseLine("grab to office 186", [])?.category, "transport")
  assert.equal(parseLine("grab food 300", [])?.category, "food")
  assert.equal(parseLine("meralco 2340", [])?.category, "bills")
  assert.equal(parseLine("mystery 50", [])?.category, "other")
})

test("dates are the phone's local day, not UTC", () => {
  const halfPastMidnight = new Date(2026, 9, 15, 0, 30)
  assert.equal(localDate(halfPastMidnight), "2026-10-15")
  assert.equal(halfPastMidnight.toISOString().slice(0, 10), "2026-10-14") // the trap, proven real here
  assert.equal(shiftDay("2026-10-31", 1), "2026-11-01")
  assert.equal(shiftDay("2026-03-01", -1), "2026-02-28")
  assert.equal(shiftMonth("2026-01", -1), "2025-12")
  assert.equal(shiftMonth("2026-10", -5), "2026-05")
})

test("pesos format like the app shows them", () => {
  assert.equal(formatPeso(18600), "₱186")
  assert.equal(formatPeso(125050), "₱1,250.50")
  assert.equal(formatPeso(-120000), "-₱1,200")
})

test("monthSummary adds up a month and paces it against the budget", () => {
  const es = [
    entry("2026-10-01", 1500, "pldt", { category: "bills" }),
    entry("2026-10-02", 300, "lunch"),
    entry("2026-10-05", 200, "grab", { category: "transport" }),
    entry("2026-10-05", 12500, "salary", { income: true, category: "income" }),
    entry("2026-09-30", 999, "last month"),
  ]
  const s = monthSummary(es, "2026-10", 1000000, "2026-10-10")
  assert.equal(s.spent, 200000)
  assert.equal(s.income, 1250000)
  assert.equal(s.net, 1050000)
  assert.equal(s.cumulative.length, 10)
  assert.deepEqual(s.cumulative.slice(0, 5), [150000, 180000, 180000, 180000, 200000])
  assert.equal(s.daysLeft, 22)
  assert.equal(s.perDay, Math.floor(800000 / 22))
  assert.equal(s.pace, Math.round((1000000 * 10) / 31))
  assert.equal(s.projected, 150000 + 155000) // the bill once, the other ₱500 at its 10-day rate
  assert.deepEqual(
    s.byCategory.map((c) => c.category),
    ["bills", "food", "transport"]
  )
  assert.equal(monthSummary(es, "2026-09", 0, "2026-10-10").daysLeft, 0)
})

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

test("advise warns about the pace first, then explains what grew and the repeat habit", () => {
  const tips = advise(doubledLunches(), "2026-10", 1000000, "2026-10-10")
  const titled = (start: string) => tips.find((t) => t.title.startsWith(start))
  assert.equal(tips[0].tone, "warn")
  assert.equal(tips[0].title, "You're on track to overspend by ₱11,948")
  assert.match(tips[0].why, /you'll spend ₱21,948 this month/)
  const food = titled("You're spending more on food")
  assert.ok(food, JSON.stringify(tips))
  assert.match(food.why, /Now it's ₱7,080, 136% more\. Mostly Lunch \(10×, ₱6,000\), Starbucks \(6×, ₱1,080\)/)
  assert.match(food.action, /^Try to keep it under ₱300 a day, like last month\. You'd save about ₱12,648/)
  assert.ok(titled("You spent on Starbucks 6 times this month"), JSON.stringify(tips))
  assert.ok(!tips.some((t) => t.title.includes("Lunch")), "lunch is a need, not a habit")
})

test("in the first week, advise reports budget used instead of a noisy projection", () => {
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

test("a backup restores to the same data and never duplicates (the restore drill)", () => {
  const data = {
    entries: [entry("2026-10-01", 120, "coffee"), entry("2026-10-02", 12500, "salary", { income: true, category: "income" })],
    budget: 2000000,
  }
  const file = JSON.parse(toBackup(data))
  const restored = mergeBackup({ entries: [], budget: 0 }, file)
  assert.deepEqual(restored.data, data)
  assert.equal(restored.added, 2)
  const again = mergeBackup(restored.data, file)
  assert.equal(again.added, 0)
  assert.deepEqual(again.data, data)
  const messy = mergeBackup(data, { entries: [{ id: "x" }, { ...data.entries[0], id: "new", category: "toString" }] })
  assert.equal(messy.skipped, 2)
  assert.equal(messy.added, 0)
  assert.throws(() => mergeBackup(data, { nope: true }), /isn't a Tally backup/)
})
