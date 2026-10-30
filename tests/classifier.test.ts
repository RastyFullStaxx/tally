// The category learner: Naive Bayes over your own saved entries, with exact repeats and keywords as backstops.
import assert from "node:assert/strict"
import test from "node:test"
import { grams, predictCategory, similarity, trainCategoryModel } from "../src/lib/classifier.ts"
import { type Entry } from "../src/lib/model.ts"
import { parseLine } from "../src/lib/parse.ts"

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

test("a note logged as income is income next time, even without the plus; savings teach nothing", () => {
  const paid = [entry("noemi payment", "income", 200, 1, { income: true })]
  assert.deepEqual([guess(paid, "noemi payment").category, guess(paid, "noemi payment").source], ["income", "repeat"])
  const model = trainCategoryModel(paid)
  assert.deepEqual(parseLine("noemi payment 300", (note, amount) => predictCategory(model, note, amount).category), { amount: 30000, income: true, note: "noemi payment", category: "income" })
  assert.equal(guess(paid, "noemi").source, "default", "only the exact note, and income never trains the expense model")
  assert.equal(guess([entry("gcash", "savings", 500, 0)], "gcash").source, "default")
})

test("a typo or short form of a note you've logged borrows its category", () => {
  const es = [entry("aling nena ulam", "food", 80, 3), entry("tita mel store", "groceries", 150, 2), entry("kuya ben trike", "transport", 30, 1)]
  assert.deepEqual([guess(es, "alng nena").category, guess(es, "alng nena").source], ["food", "similar"], "a dropped letter")
  assert.equal(guess(es, "titamel").category, "groceries", "words run together")
  assert.equal(guess(es, "kuyaben").category, "transport")
  // Its own habit beats the letters: the latest category a note was saved under is the one it lends.
  const moved = [...es, entry("tita mel store", "food", 150, 0, { updatedAt: 1_001 * DAY })]
  assert.equal(guess(moved, "tita mell").category, "food")
})

test("letters alone don't decide when a word, a keyword or nothing at all should", () => {
  const es = [entry("aling nena ulam", "food", 80, 3), entry("kuya ben trike", "transport", 30, 1)]
  assert.equal(guess(es, "zzqx").source, "default", "nothing alike: Other")
  assert.equal(guess(es, "meralco").source, "keyword", "a keyword still comes first")
  assert.equal(guess([], "jolibee").source, "default", "no history: nothing to borrow from")
})

test("similarity is 1 for the same letters, 0 for none shared, and in between for a typo", () => {
  assert.ok(Math.abs(similarity(grams("jollibee"), grams("Jollibee!")) - 1) < 1e-9)
  assert.equal(similarity(grams("jollibee"), grams("meralco")), 0)
  const typo = similarity(grams("jollibee"), grams("jolibee"))
  assert.ok(typo > 0.6 && typo < 1, String(typo))
  assert.equal(similarity(grams(""), grams("jollibee")), 0)
})
