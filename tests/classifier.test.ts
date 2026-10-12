// The category learner: Naive Bayes over your own saved entries, with exact repeats and keywords as backstops.
import assert from "node:assert/strict"
import test from "node:test"
import { predictCategory, trainCategoryModel } from "../src/lib/classifier.ts"
import type { Entry } from "../src/lib/ledger.ts"

const DAY = 86_400_000
let seq = 0
const entry = (note: string, category: Entry["category"], pesos: number, daysAgo = 0, extra: Partial<Entry> = {}): Entry => ({
  id: `c${++seq}`,
  date: "2026-10-10",
  amount: pesos * 100,
  income: false,
  note,
  category,
  createdAt: 1_000 * DAY - daysAgo * DAY,
  ...extra,
})
const guess = (entries: Entry[], note: string, pesos = 200) => predictCategory(trainCategoryModel(entries), note, pesos * 100)

test("with no history, the built-in keywords decide", () => {
  assert.equal(guess([], "jollibee").category, "food")
  assert.equal(guess([], "angkas to work").category, "transport")
  assert.deepEqual(guess([], "zzqx"), { category: "other", confidence: 0, source: "default" })
})

test("an exact repeat takes the category you gave it last, counting edits as fresh", () => {
  const es = [entry("starbucks venti", "leisure", 180, 5), entry("starbucks", "food", 180, 1)]
  assert.deepEqual(guess(es, "Starbucks"), { category: "food", confidence: 1, source: "repeat" })
  const edited = [entry("milk tea", "food", 120, 1), entry("milk tea", "leisure", 120, 9, { updatedAt: 1_000 * DAY })]
  assert.equal(guess(edited, "milk tea").category, "leisure")
})

test("new notes are learned from the words of your past entries", () => {
  const es = [entry("grab to office", "transport", 186, 3), entry("grab to office", "transport", 186, 2), entry("grab to office", "transport", 186, 1)]
  const p = guess(es, "grab to mall")
  assert.equal(p.category, "transport")
  assert.equal(p.source, "learned")
  assert.ok(p.confidence > 0.9, String(p.confidence))
})

test("recent habits outweigh old ones", () => {
  const es = [
    ...Array.from({ length: 5 }, () => entry("jollibee lunch", "food", 200, 200)),
    entry("jollibee meal", "leisure", 250, 1),
    entry("jollibee meal", "leisure", 250, 0),
  ]
  const p = guess(es, "jollibee bucket", 250)
  assert.equal(p.category, "leisure")
  assert.equal(p.source, "learned")
})

test("income and savings never teach it expense categories", () => {
  const es = [entry("gcash", "income", 500, 1, { income: true }), entry("gcash", "savings", 500, 0)]
  assert.equal(guess(es, "gcash").source, "default")
})
