// `npm test` runs this with Node's own test runner; Node 24 strips the TypeScript types itself.
// Manila on purpose: UTC+8 is where `toISOString()` hands back yesterday's date.
process.env.TZ = "Asia/Manila"

import assert from "node:assert/strict"
import test from "node:test"
import { formatPeso, localDate, mergeBackup, monthSummary, parseLine, removeEntry, restoreEntry, searchEntries, shiftDay, shiftMonth, toBackup, totalsOf, type Entry, type TipVote } from "../src/lib/ledger.ts"

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
  // The word can go anywhere, and joining words drop out of the note.
  assert.deepEqual(parseLine("1000 savings"), { amount: 100000, income: false, note: "", category: "savings" })
  assert.deepEqual(parseLine("laptop savings 5000"), { amount: 500000, income: false, note: "laptop", category: "savings" })
  assert.deepEqual(parseLine("2000 to savings"), { amount: 200000, income: false, note: "", category: "savings" })
  assert.deepEqual(parseLine("withdraw 500 from savings"), { amount: 50000, income: true, note: "", category: "savings" })
  assert.deepEqual(parseLine("nag ipon para sa laptop 3000"), { amount: 300000, income: false, note: "laptop", category: "savings" })
  assert.equal(parseLine("save more 1500")?.category, "other", "SaveMore, the supermarket, is not savings")
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

test("search finds entries by note, category name or amount, inside a filter, newest first", () => {
  const es = [
    entry("2026-09-12", 245, "Jollibee Ayala"),
    entry("2026-10-01", 186, "grab to office", { category: "transport" }),
    entry("2026-10-01", 120, "coffee"),
    entry("2026-10-03", 1250, "piña shake and cake"),
    entry("2026-10-05", 245, "grab home", { category: "transport" }),
    entry("2026-10-05", 25000, "salary", { income: true, category: "income" }),
    entry("2026-10-06", 2000, "laptop", { category: "savings" }),
  ]
  const notes = (query: string, filter?: Parameters<typeof searchEntries>[2]) => searchEntries(es, query, filter).map((e) => e.note)
  assert.deepEqual(notes("jolli"), ["Jollibee Ayala"], "part of a word, any case")
  assert.deepEqual(notes("grab"), ["grab home", "grab to office"], "newest first")
  assert.deepEqual(notes("grab office"), ["grab to office"], "every word has to match")
  assert.deepEqual(notes("pina"), ["piña shake and cake"], "accents don't matter")
  assert.deepEqual(notes("245"), ["grab home", "Jollibee Ayala"], "an amount matches exactly")
  assert.deepEqual(notes("₱1,250"), ["piña shake and cake"])
  assert.deepEqual(notes("25k"), ["salary"])
  assert.deepEqual(notes("transp"), ["grab home", "grab to office"], "the start of a category's name")
  assert.deepEqual(notes("", "transport"), ["grab home", "grab to office"], "a filter alone lists the category")
  assert.deepEqual(notes("245", "food"), ["Jollibee Ayala"])
  assert.deepEqual(notes("", "savings"), ["laptop"])
  assert.equal(notes("").length, es.length, "nothing typed, no filter: everything")
  assert.deepEqual(notes("mystery"), [])
  // Same day: the line logged later comes first, like on Today.
  const sameDay = [entry("2026-10-07", 50, "taho"), entry("2026-10-07", 60, "taho")]
  assert.deepEqual(searchEntries(sameDay, "taho").map((e) => e.amount), [6000, 5000])
})

test("totals split spending, income and net savings", () => {
  const es = [
    entry("2026-10-01", 120, "coffee"),
    entry("2026-10-02", 186, "grab", { category: "transport" }),
    entry("2026-10-05", 25000, "salary", { income: true, category: "income" }),
    entry("2026-10-06", 2000, "", { category: "savings" }),
    entry("2026-10-07", 500, "", { category: "savings", income: true }),
  ]
  assert.deepEqual(totalsOf(es), { spent: 30600, income: 2500000, saved: 150000 })
  assert.deepEqual(totalsOf([]), { spent: 0, income: 0, saved: 0 })
})

test("undo puts a deleted entry back with the same id, in the same place, and never twice", () => {
  const es = [entry("2026-10-01", 120, "coffee"), entry("2026-10-01", 186, "grab", { category: "transport" }), entry("2026-10-02", 85, "7-eleven")]
  const data = { entries: es, budget: 2000000, goal: { name: "Laptop", amount: 5000000 } }
  const { data: after, removed } = removeEntry(data, es[1].id)
  assert.deepEqual(after.entries, [es[0], es[2]])
  assert.deepEqual(removed, { entry: es[1], index: 1 })
  assert.equal(after.goal, data.goal, "the rest of the data is untouched")
  assert.deepEqual(restoreEntry(after, removed!), data)
  // A line added while the notice was up stays, and the entry still goes back where it was.
  const added = { ...after, entries: [...after.entries, entry("2026-10-03", 50, "taho")] }
  assert.deepEqual(restoreEntry(added, removed!).entries.map((e) => e.note), ["coffee", "grab", "7-eleven", "taho"])
  // Already back (an import brought it in): nothing duplicates.
  assert.equal(restoreEntry(data, removed!), data)
  // Lines deleted after it can leave its old place past the end; it lands last.
  assert.deepEqual(restoreEntry({ ...after, entries: [] }, removed!).entries, [es[1]])
  assert.deepEqual(removeEntry(data, "missing"), { data, removed: null })
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
