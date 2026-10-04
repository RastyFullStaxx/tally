import { useRef, useState, type FormEvent } from "react"
import { ArrowLeft01Icon, ArrowRight01Icon, ArrowTurnBackwardIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { cn } from "cn"

import { CategoryChip } from "@/components/category"
import { Button } from "@/components/ui/button"
import { CATEGORIES, formatPeso, formatPesoWhole, monthOf, monthSummary, parseLine, shiftDay, toDate, type Data, type Entry, type Parsed } from "@/lib/ledger"

type Props = { data: Data; today: string; onAdd: (entry: Entry) => void; onEdit: (entry: Entry) => void }

// Ids and clock readings are minted out here, away from render.
const stamp = (parsed: Parsed, date: string): Entry => ({ id: crypto.randomUUID(), date, createdAt: Date.now(), ...parsed })

/** The launch screen: one ruled page per day, and the first line is where you type. */
export function Today({ data, today, onAdd, onEdit }: Props) {
  const [picked, setPicked] = useState<string | null>(null)
  const [text, setText] = useState("")
  const [needsAmount, setNeedsAmount] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const date = picked && picked < today ? picked : today
  const preview = text.trim() ? parseLine(text, data.entries) : null
  const lines = data.entries.filter((e) => e.date === date).sort((a, b) => b.createdAt - a.createdAt)
  const spent = lines.reduce((sum, e) => (e.income ? sum : sum + e.amount), 0)
  const month = monthSummary(data.entries, monthOf(today), data.budget, today)
  const day = toDate(date)
  const otherYear = day.getFullYear() !== toDate(today).getFullYear()
  const focus = () => input.current?.focus()
  const go = (by: number) => {
    const next = shiftDay(date, by)
    setPicked(next >= today ? null : next)
  }

  const add = (event: FormEvent) => {
    event.preventDefault()
    if (!text.trim()) return
    if (!preview) {
      setNeedsAmount(true)
      return
    }
    // Clear and keep focus first, so the keyboard stays up for the next line.
    setText("")
    setNeedsAmount(false)
    focus()
    onAdd(stamp(preview, date))
  }

  return (
    <div className="flex flex-col">
      <header className="flex items-end justify-between gap-3 pt-6 pr-3 pb-1 pl-8">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {day.toLocaleDateString("en-PH", { weekday: "long" })}
            {otherYear && ` · ${day.getFullYear()}`}
          </p>
          <h1 className="text-[2.125rem] leading-tight font-bold tracking-[-0.01em]">{day.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}</h1>
        </div>
        <div className="flex items-center gap-0.5 pb-1.5">
          {date !== today && (
            <Button variant="secondary" size="sm" className="mr-1 text-primary" onClick={() => setPicked(null)}>
              Today
            </Button>
          )}
          <Button variant="ghost" size="icon-lg" aria-label="Previous day" onClick={() => go(-1)}>
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5" />
          </Button>
          <Button variant="ghost" size="icon-lg" aria-label="Next day" disabled={date === today} onClick={() => go(1)}>
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-5" />
          </Button>
        </div>
      </header>

      <p className="flex items-center gap-2 pr-5 pb-4 pl-8 text-xs text-muted-foreground">
        {data.budget > 0 ? (
          <>
            <span aria-hidden className={cn("size-1.5 rounded-full", month.spent > data.budget ? "bg-over" : "bg-income")} />
            {month.spent > data.budget
              ? `${formatPesoWhole(month.spent - data.budget)} over budget this month`
              : `${formatPesoWhole(data.budget - month.spent)} left this month · ${formatPesoWhole(month.perDay)}/day`}
          </>
        ) : (
          `${formatPeso(month.spent)} spent this month`
        )}
      </p>

      <div className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-[1.375rem] w-px bg-margin" />

        <form onSubmit={add} className="flex h-12 items-center gap-2 border-b border-margin pr-5 pl-8">
          <input
            ref={input}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setNeedsAmount(false)
            }}
            aria-label={date === today ? "New entry for today" : `New entry for ${day.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`}
            placeholder="coffee 120 · +25000 salary"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="enter"
            className="h-full min-w-0 flex-1 bg-transparent text-base caret-primary outline-none placeholder:text-faint"
          />
          {preview && (
            <span className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-primary/40 px-2 py-1 text-[11px] leading-none text-primary">
              {CATEGORIES[preview.category]} · {preview.income && "+"}
              {formatPeso(preview.amount)}
              <HugeiconsIcon icon={ArrowTurnBackwardIcon} className="size-3" aria-hidden />
            </span>
          )}
        </form>

        {needsAmount && (
          <p role="alert" className="border-b border-rule py-3 pr-5 pl-8 text-sm text-over">
            Add an amount, like coffee 120
          </p>
        )}

        <ul>
          {lines.map((e) => (
            <li key={e.id} className="border-b border-rule transition-[opacity,translate] duration-300 ease-out starting:-translate-y-1.5 starting:opacity-0 motion-reduce:transition-none">
              <button type="button" onClick={() => onEdit(e)} className="flex h-12 w-full items-center gap-2 pr-5 pl-8 text-left transition-colors active:bg-white/[0.04]">
                <span className="min-w-0 truncate">{e.note || CATEGORIES[e.category]}</span>
                <CategoryChip category={e.category} />
                <span className={cn("ml-auto shrink-0 font-medium tabular-nums", e.income && "text-income")}>
                  {e.income && "+"}
                  {formatPeso(e.amount)}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {Array.from({ length: Math.max(3, 8 - lines.length) }, (_, i) => (
          <div key={i} aria-hidden onClick={focus} className="flex h-12 items-center border-b border-rule pl-8 text-sm text-faint">
            {i === 0 && data.entries.length === 0 && "Type a line like jollibee 245, then return."}
          </div>
        ))}
      </div>

      <p className="flex justify-between pt-3 pr-5 pl-8 text-xs text-muted-foreground">
        <span>
          {lines.length} {lines.length === 1 ? "entry" : "entries"}
        </span>
        <span>
          Spent {date === today ? "today" : "that day"} <span className="font-medium text-foreground tabular-nums">{formatPeso(spent)}</span>
        </span>
      </p>
    </div>
  )
}
