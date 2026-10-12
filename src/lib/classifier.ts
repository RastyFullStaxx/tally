// Tally's category guesser: a small Naive Bayes classifier, a probabilistic machine-learning model,
// trained on your own saved entries. Each save or edit leaves the final category on the entry and the model
// is rebuilt from them, so its guesses follow your habits the longer the app is used.
// Pure: no DOM, no storage, no network.
import { KEYWORDS, isExpense, keywordCategory, wordsOf, type CategoryId, type Entry } from "./ledger.ts"

const DAY = 86_400_000
const HALF_LIFE_DAYS = 90 // a correction made last week outweighs a habit from last year
const SEED_WEIGHT = 0.3 // the built-in keywords count as a little prior knowledge; your entries soon outweigh them
const MIN_CONFIDENCE = 0.4
const EXPENSE_CATEGORIES = 8 // food … other: the categories an expense can be filed under

export type CategoryModel = {
  exact: Map<string, { category: CategoryId; at: number }> // the category last given to each exact note
  docs: Map<CategoryId, number> // weighted number of entries per category
  tokens: Map<CategoryId, Map<string, number>> // weighted feature counts per category
  totals: Map<CategoryId, number> // weighted feature total per category
  vocabulary: Set<string>
}

export type Prediction = { category: CategoryId; confidence: number; source: "repeat" | "learned" | "keyword" | "default" }

const band = (amount: number) => (amount < 10000 ? "lt100" : amount < 30000 ? "100-299" : amount < 100000 ? "300-999" : amount < 300000 ? "1k-3k" : "3k+")

/** What the model reads: the note's words, its first word (usually the strongest signal) and an amount band. */
export function features(note: string, amount?: number): string[] {
  const words = wordsOf(note)
  return [...words.map((w) => `w:${w}`), ...(words[0] ? [`first:${words[0]}`] : []), ...(amount === undefined ? [] : [`amt:${band(amount)}`])]
}

const normal = (note: string) => wordsOf(note).join(" ")

export function trainCategoryModel(entries: Entry[]): CategoryModel {
  const model: CategoryModel = { exact: new Map(), docs: new Map(), tokens: new Map(), totals: new Map(), vocabulary: new Set() }
  const learn = (category: CategoryId, fs: string[], weight: number) => {
    const counts = model.tokens.get(category) ?? new Map<string, number>()
    for (const f of fs) {
      counts.set(f, (counts.get(f) ?? 0) + weight)
      model.totals.set(category, (model.totals.get(category) ?? 0) + weight)
      model.vocabulary.add(f)
    }
    model.tokens.set(category, counts)
  }
  for (const { category, words } of KEYWORDS) for (const w of words) learn(category, [`w:${w}`, `first:${w}`], SEED_WEIGHT)

  const expenses = entries.filter(isExpense)
  const touched = (e: Entry) => e.updatedAt ?? e.createdAt
  const newest = expenses.reduce((m, e) => Math.max(m, touched(e)), 0)
  for (const e of expenses) {
    const at = touched(e)
    const key = normal(e.note)
    const seen = model.exact.get(key)
    if (key && (!seen || seen.at <= at)) model.exact.set(key, { category: e.category, at })
    const weight = 0.5 ** ((newest - at) / (HALF_LIFE_DAYS * DAY))
    model.docs.set(e.category, (model.docs.get(e.category) ?? 0) + weight)
    learn(e.category, features(e.note, e.amount), weight)
  }
  return model
}

/** The repeat of an exact note first, then the learned model, then the keyword list, then Other. */
export function predictCategory(model: CategoryModel, note: string, amount: number): Prediction {
  const repeat = model.exact.get(normal(note))
  if (repeat) return { category: repeat.category, confidence: 1, source: "repeat" }

  const fs = features(note, amount)
  if (fs.some((f) => !f.startsWith("amt:") && model.vocabulary.has(f))) {
    const totalDocs = [...model.docs.values()].reduce((a, b) => a + b, 0)
    const size = model.vocabulary.size
    const scores = [...model.tokens].map(([category, counts]) => {
      const total = model.totals.get(category) ?? 0
      let score = Math.log(((model.docs.get(category) ?? 0) + 1) / (totalDocs + EXPENSE_CATEGORIES))
      for (const f of fs) score += Math.log(((counts.get(f) ?? 0) + 1) / (total + size))
      return { category, score }
    })
    const top = Math.max(...scores.map((s) => s.score))
    const odds = scores.map((s) => ({ category: s.category, p: Math.exp(s.score - top) }))
    const best = odds.reduce((a, b) => (b.p > a.p ? b : a))
    const confidence = best.p / odds.reduce((n, s) => n + s.p, 0)
    if (confidence >= MIN_CONFIDENCE) return { category: best.category, confidence, source: "learned" }
  }

  const keyword = keywordCategory(note)
  return keyword === "other" ? { category: "other", confidence: 0, source: "default" } : { category: keyword, confidence: 0.5, source: "keyword" }
}
