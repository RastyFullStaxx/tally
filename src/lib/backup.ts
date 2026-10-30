// Getting data out and back in: the JSON backup (and restoring it) and the CSV for spreadsheets.
import { CATEGORIES, isSaving, type BillDecision, type Data, type Entry, type Goal, type TipVote } from "./model.ts"
import { pad } from "./dates.ts"

// A note typed as "=1+1" or "-50 refund" must stay text: spreadsheets would run it as a formula.
const FORMULA = /^[=+\-@\t\r]/

/** One CSV field: a guard on formula-like notes, and quotes around commas, quotes and line breaks (RFC 4180). */
function csvField(value: string) {
  const text = FORMULA.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const typeOf = (e: Entry) => (isSaving(e) ? (e.income ? "From savings" : "To savings") : e.income ? "Income" : "Expense")

/**
 * Every entry as a spreadsheet: Date, Type, Category, Note and Amount in pesos, oldest first. Amounts are plain
 * numbers ("1250.50") so they add up; Type says which way the money went. Starts with a byte-order mark so Excel
 * reads ₱ and ñ as UTF-8, and uses CRLF line ends.
 */
export function toCsv(entries: Entry[]) {
  const rows = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .map((e) => [e.date, typeOf(e), CATEGORIES[e.category], e.note, `${Math.floor(e.amount / 100)}.${pad(e.amount % 100)}`].map(csvField).join(","))
  return "\uFEFF" + ["Date,Type,Category,Note,Amount", ...rows].join("\r\n") + "\r\n"
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

const isGoal = (x: unknown): x is Goal => !!x && typeof x === "object" && typeof (x as Goal).name === "string" && Number.isInteger((x as Goal).amount) && (x as Goal).amount > 0

const isVote = (x: unknown): x is TipVote => {
  if (!x || typeof x !== "object") return false
  const v = x as Record<string, unknown>
  return (
    typeof v.id === "string" &&
    typeof v.kind === "string" &&
    (v.vote === 1 || v.vote === -1) &&
    typeof v.at === "number" &&
    !!v.features &&
    typeof v.features === "object" &&
    Object.values(v.features).every((n) => typeof n === "number")
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
    const { id, date, amount, income, note, category, createdAt, updatedAt } = x
    added.push({ id, date, amount, income, note, category, createdAt, ...(typeof updatedAt === "number" ? { updatedAt } : {}) })
  }
  const b = incoming.budget
  const budget = current.budget || (typeof b === "number" && Number.isInteger(b) && b > 0 ? b : 0)
  const goal = current.goal ?? (isGoal(incoming.goal) ? { name: incoming.goal.name, amount: incoming.goal.amount } : undefined)
  const votes = current.votes?.length ? current.votes : Array.isArray(incoming.votes) ? incoming.votes.filter(isVote) : []
  // Bill answers merge by item, and the phone's answer wins, like entries.
  const bills: Record<string, BillDecision> = {}
  const theirs = incoming.bills && typeof incoming.bills === "object" ? (incoming.bills as Record<string, unknown>) : {}
  for (const [item, d] of Object.entries(theirs)) if (d === "bill" || d === "not") bills[item] = d
  Object.assign(bills, current.bills)
  return {
    data: { entries: [...current.entries, ...added], budget, ...(goal ? { goal } : {}), ...(votes.length ? { votes } : {}), ...(Object.keys(bills).length ? { bills } : {}) },
    added: added.length,
    skipped,
  }
}
