import { Mascot } from "@/components/Mascot"

import { useDeferredValue, useMemo, useRef, type FormEvent } from "react"
import { cn } from "cn"

import { CATEGORY_ORDER, CategoryChip, categoryColor, labelOf } from "@/components/category"
import { CloseIcon, SearchIcon } from "@/components/icons"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { CATEGORIES, isIncome, isSaving, type Entry } from "@/lib/model"
import { monthName, monthOf, toDate } from "@/lib/dates"
import { formatPeso } from "@/lib/format"
import { searchEntries, totalsOf, type Filter } from "@/lib/ledger"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: Entry[]
  // Kept by the caller, so closing the sheet to edit a result and opening it again returns to the same list.
  query: string
  onQuery: (query: string) => void
  filter: Filter
  onFilter: (filter: Filter) => void
  onPick: (entry: Entry) => void
}

const FILTERS: Filter[] = ["all", ...CATEGORY_ORDER, "income", "savings"]

// Rows drawn at once. The totals still count every match; typing more narrows it to older ones.
const LIMIT = 150

/** Every entry ever logged, found by what you wrote, the category or the amount. Opened from the top of both screens. */
export function SearchSheet({ open, onOpenChange, ...search }: Props) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* Full height from the start, so the sheet doesn't jump as results come and go. */}
      <DrawerContent className="data-[vaul-drawer-direction=bottom]:h-[calc(100svh_-_env(safe-area-inset-top)_-_0.5rem)] data-[vaul-drawer-direction=bottom]:max-h-[calc(100svh_-_env(safe-area-inset-top)_-_0.5rem)]">
        <Search {...search} />
      </DrawerContent>
    </Drawer>
  )
}

function Search({ entries, query, onQuery, filter, onFilter, onPick }: Omit<Props, "open" | "onOpenChange">) {
  const input = useRef<HTMLInputElement>(null)
  // Typing stays instant on a long history: the list catches up a beat later.
  const typed = useDeferredValue(query)
  const found = useMemo(() => searchEntries(entries, typed, filter), [entries, typed, filter])
  const totals = totalsOf(found)

  // Grouped by month, newest first, each with what its matches spent.
  const months = useMemo(() => {
    const groups: { month: string; spent: number; rows: Entry[] }[] = []
    found.forEach((e, i) => {
      const month = monthOf(e.date)
      let group = groups.at(-1)
      if (group?.month !== month) groups.push((group = { month, spent: 0, rows: [] }))
      if (!isIncome(e) && !isSaving(e)) group.spent += e.amount
      if (i < LIMIT) group.rows.push(e)
    })
    return groups.filter((g) => g.rows.length > 0)
  }, [found])

  // Return closes the keyboard; the results are already showing.
  const submit = (event: FormEvent) => {
    event.preventDefault()
    input.current?.blur()
  }

  const summary = [
    `${found.length} ${found.length === 1 ? "entry" : "entries"}`,
    totals.spent > 0 && `${formatPeso(totals.spent)} spent`,
    totals.income > 0 && `+${formatPeso(totals.income)} income`,
    totals.saved !== 0 && `${formatPeso(totals.saved)} saved`,
  ].filter(Boolean)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-1">
      <DrawerHeader className="p-2 pb-0">
        <DrawerTitle>Search</DrawerTitle>
        <DrawerDescription className="sr-only">Find entries from any month by what you wrote, the category or the amount.</DrawerDescription>
      </DrawerHeader>

      <form role="search" onSubmit={submit} className="relative">
        <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" />
        <Input
          ref={input}
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          aria-label="Search entries"
          placeholder="grab, jollibee, 245"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          className="h-9 pr-10 pl-8 [&::-webkit-search-cancel-button]:hidden"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              onQuery("")
              input.current?.focus()
            }}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-md text-muted-foreground active:bg-white/[0.06]"
          >
            <CloseIcon className="size-4" />
          </button>
        )}
      </form>

      {/* Every filter in one swipeable row. The tap area reaches past each small chip, to 44px tall. */}
      <div role="group" aria-label="Category" className="-mx-1 flex shrink-0 [scrollbar-width:none] gap-1 overflow-x-auto px-1 py-1.5 [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => {
          const on = filter === f
          const tint = f === "all" ? undefined : categoryColor(f)
          return (
            <button
              key={f}
              type="button"
              aria-pressed={on}
              onClick={() => onFilter(f)}
              className={cn(
                "relative h-7 shrink-0 rounded-sm border px-2.5 text-xs font-medium transition-colors after:absolute after:inset-x-0 after:-inset-y-2",
                on ? "border-transparent" : "border-border text-muted-foreground active:bg-white/[0.04]",
                on && !tint && "bg-accent text-foreground"
              )}
              style={on && tint ? { color: `color-mix(in oklab, ${tint} 70%, white)`, backgroundColor: `color-mix(in oklab, ${tint} 18%, transparent)` } : undefined}
            >
              {f === "all" ? "All" : CATEGORIES[f]}
            </button>
          )
        })}
      </div>

      <p aria-live="polite" className="px-1 text-xs text-muted-foreground tabular-nums">
        {summary.join(" · ")}
      </p>

      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
        {months.map(({ month, spent, rows }) => (
          <section key={month} aria-label={`${monthName(month)} ${toDate(month).getFullYear()}`}>
            <h3 className="sticky top-0 z-10 flex h-7 items-end justify-between border-b border-rule bg-popover px-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              <span>
                {monthName(month)} {toDate(month).getFullYear()}
              </span>
              {spent > 0 && <span className="font-medium tracking-normal normal-case tabular-nums">{formatPeso(spent)} spent</span>}
            </h3>
            <ul>
              {rows.map((e) => (
                <li key={e.id} className="border-b border-rule">
                  <button type="button" onClick={() => onPick(e)} className="flex h-9 w-full items-center gap-2 px-2 text-left text-sm transition-colors active:bg-white/[0.04]">
                    <span className="w-12 shrink-0 text-xs text-faint tabular-nums">{toDate(e.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}</span>
                    <span className="min-w-0 truncate">{e.note || labelOf(e)}</span>
                    <CategoryChip category={e.category} label={labelOf(e)} />
                    <span className={cn("ml-auto shrink-0 font-medium tabular-nums", isIncome(e) && "text-income", isSaving(e) && "text-savings")}>
                      {isIncome(e) && "+"}
                      {formatPeso(e.amount)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {found.length > LIMIT && (
          <p className="px-2 py-3 text-xs text-faint">
            Showing the newest {LIMIT} of {found.length}. Type more to find older ones.
          </p>
        )}

        {found.length === 0 && (
          <div className="flex items-center gap-3 px-2 py-4">
            <Mascot pose="peeking" size={64} />
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="mb-1 block text-sm font-medium text-foreground">{entries.length === 0 ? "Nothing logged yet." : "No entries match."}</span>
              {entries.length === 0 ? (
                "Entries you type on Today show up here."
              ) : filter !== "all" ? (
                <>
                  Only {CATEGORIES[filter]} is showing.{" "}
                  <button type="button" onClick={() => onFilter("all")} className="text-primary">
                    Search every category
                  </button>
                </>
              ) : (
                "Try part of a word, a category, or an amount like 245."
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
