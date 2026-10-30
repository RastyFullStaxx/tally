// Tally's data model: what an entry is, the categories, and what's stored in `tally:v1`.
// Money is integer centavos everywhere. Dates are the phone's local day as YYYY-MM-DD.

export const CATEGORIES = {
  food: "Food",
  groceries: "Groceries",
  transport: "Transport",
  bills: "Bills",
  shopping: "Shopping",
  health: "Health",
  leisure: "Leisure",
  other: "Other",
  income: "Income",
  savings: "Savings",
} as const

export type CategoryId = keyof typeof CATEGORIES

/**
 * One line in the notebook. A savings entry (category "savings") is money moved aside (`income: false`)
 * or taken back out (`income: true`): it is neither spending nor income.
 */
export type Entry = {
  id: string
  date: string
  amount: number
  income: boolean
  note: string
  category: CategoryId
  createdAt: number
  updatedAt?: number // last saved edit; the category learner treats a correction as fresh
}

export type Goal = { name: string; amount: number }

/** A Helpful / Not helpful answer on a tip, with the numbers the tip was based on (training data for a future model). */
export type TipVote = { id: string; kind: string; vote: 1 | -1; at: number; features: Record<string, number> }

/** Your answer on a bill Tally detected, by its item ("meralco"): it is one, or it isn't. Nothing is added either way. */
export type BillDecision = "bill" | "not"

export type Data = { entries: Entry[]; budget: number; goal?: Goal; votes?: TipVote[]; bills?: Record<string, BillDecision> } // budget: centavos a month, 0 = not set

/** The items you said aren't bills: insights stop treating them as bills. */
export const notBills = (data: Pick<Data, "bills">) => Object.keys(data.bills ?? {}).filter((item) => data.bills![item] === "not")

export const isSaving = (e: Pick<Entry, "category">) => e.category === "savings"
export const isIncome = (e: Pick<Entry, "income" | "category">) => e.income && !isSaving(e)
export const isExpense = (e: Pick<Entry, "income" | "category">) => !e.income && !isSaving(e)
