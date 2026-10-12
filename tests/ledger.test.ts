// `npm test` runs this with Node's own test runner; Node 24 strips the TypeScript types itself.
// Manila on purpose: UTC+8 is where `toISOString()` hands back yesterday's date.
process.env.TZ = "Asia/Manila"

import assert from "node:assert/strict"
import test from "node:test"
import { formatPeso, localDate, mergeBackup, monthSummary, parseLine, shiftDay, shiftMonth, toBackup, type Entry, type TipVote } from "../src/lib/ledger.ts"

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

test("parseLine reads the amount, the note and income from a typed line", () => {
  const p = (text: string) => parseLine(text)
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

test("keywords pick the category when nothing better is passed in, and a guesser can be plugged in", () => {
  assert.equal(parseLine("grab to office 186")?.category, "transport")
  assert.equal(parseLine("grab food 300")?.category, "food")
  assert.equal(parseLine("meralco 2340")?.category, "bills")
  assert.equal(parseLine("mystery 50")?.category, "other")
  assert.equal(parseLine("mystery 50", () => "health")?.category, "health")
})

test("save and withdraw move money in and out of savings", () => {
  assert.deepEqual(parseLine("save 2000"), { amount: 200000, income: false, note: "", category: "savings" })
  assert.deepEqual(parseLine("save 2000 emergency fund"), { amount: 200000, income: false, note: "emergency fund", category: "savings" })
  assert.deepEqual(parseLine("ipon 1000"), { amount: 100000, income: false, note: "", category: "savings" })
  assert.deepEqual(parseLine("withdraw 500"), { amount: 50000, income: true, note: "", category: "savings" })
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

test("monthSummary adds up a month, paces it, and keeps savings out of spending and income", () => {
  const es = [
    entry("2026-10-01", 1500, "pldt", { category: "bills" }),
    entry("2026-10-02", 300, "lunch"),
    entry("2026-10-03", 2000, "", { category: "savings" }),
    entry("2026-10-04", 500, "", { category: "savings", income: true }),
    entry("2026-10-05", 200, "grab", { category: "transport" }),
    entry("2026-10-05", 12500, "salary", { income: true, category: "income" }),
    entry("2026-09-30", 999, "last month"),
  ]
  const s = monthSummary(es, "2026-10", 1000000, "2026-10-10")
  assert.equal(s.spent, 200000)
  assert.equal(s.income, 1250000)
  assert.equal(s.net, 1050000)
  assert.equal(s.saved, 150000)
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

test("a backup restores to the same data and never duplicates (the restore drill)", () => {
  const data = {
    entries: [entry("2026-10-01", 120, "coffee", { updatedAt: 99 }), entry("2026-10-02", 12500, "salary", { income: true, category: "income" })],
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

test("a backup carries the savings goal and tip votes, and drops malformed ones", () => {
  const vote: TipVote = { id: "habit:grab:2026-10", kind: "habit", vote: -1, at: 5, features: { day: 10, spent: 7080 } }
  const data = { entries: [], budget: 0, goal: { name: "Emergency fund", amount: 5000000 }, votes: [vote] }
  assert.deepEqual(mergeBackup({ entries: [], budget: 0 }, JSON.parse(toBackup(data))).data, data)
  const messy = mergeBackup({ entries: [], budget: 0 }, { entries: [], goal: { name: 5 }, votes: [vote, { id: "x", vote: 2 }] })
  assert.equal(messy.data.goal, undefined)
  assert.deepEqual(messy.data.votes, [vote])
})
