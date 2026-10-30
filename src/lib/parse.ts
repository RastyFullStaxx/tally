// Reading a typed line: "jollibee 245" → ₱245 of Food. Pure, so `npm test` runs it under plain Node.
import type { CategoryId, Entry } from "./model.ts"

export type Parsed = Pick<Entry, "amount" | "income" | "note" | "category">

// Checked in this order, so "grab food" is Food before "grab" can make it Transport.
export const KEYWORDS = (
  [
    [
      "food",
      "food coffee kape starbucks jollibee mcdo mcdonalds kfc chowking inasal greenwich lunch dinner breakfast merienda snack snacks milktea tea bread pizza burger resto restaurant grabfood foodpanda 7-eleven 711 ministop fishball kwekkwek isaw taho siomai siopao lugaw turon",
    ],
    ["groceries", "grocery groceries puregold savemore supermarket market palengke alfamart landers s&r rice"],
    ["transport", "grab angkas joyride jeep jeepney tricycle trike bus mrt lrt taxi fare gas fuel petron shell caltex parking toll beep p2p"],
    ["bills", "bill bills meralco electric electricity water maynilad pldt globe smart converge internet wifi load rent netflix spotify youtube icloud subscription insurance"],
    ["shopping", "shopee lazada tiktok uniqlo clothes shirt shoes mall gift sm"],
    ["health", "medicine meds mercury watsons pharmacy doctor clinic dentist vitamins hospital checkup gym"],
    ["leisure", "movie movies cinema concert game games steam bar beer drinks travel hotel airbnb"],
  ] as const
).map(([category, words]) => ({ category, words: new Set(words.split(" ")) }))

const INCOME_WORDS = new Set("salary sweldo payroll income bonus allowance commission freelance refund cashback".split(" "))
const SAVE_WORDS = new Set("save saved savings ipon".split(" "))
const WITHDRAW_WORDS = new Set("withdraw withdrew".split(" "))
// Joining words left out of a savings note: "2000 to savings" needs none, "ipon para sa laptop" is "laptop".
const SAVING_FILLER = new Set("to into in from for my the put move moved transfer transferred add added deposit deposited sa para ng nag mag ko".split(" "))

const AMOUNT = /^\+?(?:₱|php|p)?(\d[\d,]*(?:\.\d{1,2})?)(k?)$/i

export const wordsOf = (note: string) =>
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

/** The built-in guess: the first category whose keywords appear in the note, else Other. */
export function keywordCategory(note: string): CategoryId {
  const words = wordsOf(note)
  return KEYWORDS.find((k) => words.some((w) => k.words.has(w)))?.category ?? "other"
}

export type Guess = (note: string, amount: number) => CategoryId

/**
 * "jollibee 245" → 245 pesos of Food. The largest number on the line is the amount; "+" means income;
 * a save word anywhere ("save 2000", "2000 to savings") puts money into savings and "withdraw 500" takes
 * it out. `guess` picks an expense's category: the learned classifier in the app, keywords alone by default.
 */
export function parseLine(text: string, guess: Guess = keywordCategory): Parsed | null {
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
  const lower = wordsOf(note)
  const first = lower[0] ?? ""
  const moves = (w: string) => SAVE_WORDS.has(w) || WITHDRAW_WORDS.has(w)
  // "save more" is SaveMore, the supermarket.
  if (lower.some(moves) && !/\bsave\s+more\b/i.test(note)) {
    const label = note.split(/\s+/).filter((w) => {
      const word = wordsOf(w)[0] ?? ""
      return !moves(word) && !SAVING_FILLER.has(word)
    })
    return { amount, income: lower.some((w) => WITHDRAW_WORDS.has(w)), note: label.join(" "), category: "savings" }
  }
  const income = words[0].startsWith("+") || words[at].startsWith("+") || INCOME_WORDS.has(first)
  // The learned guess can say income too, for a note that was income last time ("noemi payment").
  const category = income ? "income" : guess(note, amount)
  return { amount, income: category === "income", note, category }
}
