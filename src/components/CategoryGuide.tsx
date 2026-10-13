import { cn } from "cn"

import { CATEGORY_ORDER, categoryColor } from "@/components/category"
import { CheckIcon } from "@/components/icons"
import { CATEGORIES, type CategoryId } from "@/lib/ledger"

type ExpenseCategory = Exclude<CategoryId, "income" | "savings">

/** What goes in each category, in words anyone can decide with. */
export const CATEGORY_HELP: Record<ExpenseCategory, string> = {
  food: "Food or drinks you have right away: meals, snacks, coffee, milk tea, fast food, delivery.",
  groceries: "Food and supplies you keep at home: rice, meat, veggies, eggs, soap, shampoo.",
  transport: "Anything that gets you somewhere: Grab, jeep, tricycle, bus, MRT or LRT, taxi, gas, parking, tolls.",
  bills: "Things you pay every month: rent, electricity, water, internet, phone load, subscriptions.",
  shopping: "Things you keep: clothes, shoes, gadgets, Shopee or Lazada orders, gifts.",
  leisure: "Fun and going out: movies, games, bars, trips, hobbies.",
  health: "Your body: medicine, doctor, dentist, vitamins, gym.",
  other: "Only when nothing above fits.",
}

/** Asked in order; the first yes is the category. */
export const DECIDER: [string, ExpenseCategory][] = [
  ["Did I eat or drink it already?", "food"],
  ["Will I cook it or use it at home?", "groceries"],
  ["Did it get me somewhere?", "transport"],
  ["Do I pay it every month?", "bills"],
  ["Will I still have it next month?", "shopping"],
  ["Was it for fun?", "leisure"],
  ["Was it for my health?", "health"],
]

const tint = (c: CategoryId) => ({ color: `color-mix(in oklab, ${categoryColor(c)} 70%, white)` })

// One row of the category list: its colour, name and what goes in it, ticked when it's the current one.
const rowClass = (on: boolean) => cn("flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors", on ? "bg-white/[0.06]" : "active:bg-white/[0.04]")
const rowStyle = (c: CategoryId, on: boolean) => (on ? { boxShadow: `inset 0 0 0 1px ${categoryColor(c)}` } : undefined)

function Row({ category: c, on }: { category: CategoryId; on: boolean }) {
  return (
    <>
      <span aria-hidden className="mt-[5px] size-2 shrink-0 rounded-[2px]" style={{ background: categoryColor(c) }} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] leading-snug font-medium" style={on ? tint(c) : undefined}>
          {CATEGORIES[c]}
        </span>
        <span className="block text-xs leading-snug text-muted-foreground">{CATEGORY_HELP[c as ExpenseCategory]}</span>
      </span>
      {on && <CheckIcon className="mt-0.5 size-4 shrink-0" style={tint(c)} />}
    </>
  )
}

/** The edit drawer's category field: every category with what goes in it, so picking is one read and one tap. */
export function CategoryPicker({ value, onChange }: { value: CategoryId; onChange: (category: CategoryId) => void }) {
  return (
    <fieldset className="space-y-0.5">
      <legend className="sr-only">Category</legend>
      {CATEGORY_ORDER.map((c) => (
        <label key={c} className={cn(rowClass(value === c), "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50")} style={rowStyle(c, value === c)}>
          <input type="radio" name="category" value={c} checked={value === c} onChange={() => onChange(c)} className="sr-only" />
          <Row category={c} on={value === c} />
        </label>
      ))}
    </fieldset>
  )
}

/**
 * The same list as actions, for the entry line's guess chip: any tap picks that category, the ticked guess
 * included. Buttons, not radios, because tapping an already-checked radio does nothing.
 */
export function CategoryMenu({ value, onPick }: { value: CategoryId; onPick: (category: CategoryId) => void }) {
  return (
    <div className="space-y-0.5">
      {CATEGORY_ORDER.map((c) => (
        <button key={c} type="button" onClick={() => onPick(c)} className={cn(rowClass(value === c), "outline-none focus-visible:ring-2 focus-visible:ring-ring/50")} style={rowStyle(c, value === c)}>
          <Row category={c} on={value === c} />
        </button>
      ))}
    </div>
  )
}

/** The whole guide, for the "Which category?" sheet. */
export function CategoryGuideList() {
  return (
    <div className="space-y-3 text-sm">
      <ul className="space-y-2">
        {CATEGORY_ORDER.map((c) => (
          <li key={c} className="flex gap-2">
            <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-[2px]" style={{ background: categoryColor(c) }} />
            <p>
              <span className="font-medium">{CATEGORIES[c]}</span> <span className="text-muted-foreground">{CATEGORY_HELP[c as ExpenseCategory]}</span>
            </p>
          </li>
        ))}
      </ul>
      <div>
        <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Not sure? Ask yourself, in order</h3>
        <ol className="space-y-1 text-[13px]">
          {DECIDER.map(([question, category], i) => (
            <li key={category} className="flex gap-2">
              <span className="w-4 text-faint tabular-nums">{i + 1}.</span>
              <span className="flex-1">{question}</span>
              <span className="font-medium" style={tint(category)}>
                {CATEGORIES[category]}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-1 text-xs text-faint">No to all of them? Use Other.</p>
      </div>
      <p className="rounded-md bg-white/[0.03] px-2.5 py-2 text-xs text-muted-foreground">Tally learns from you. Every time you save an entry or fix its category, its next guess gets better.</p>
    </div>
  )
}
