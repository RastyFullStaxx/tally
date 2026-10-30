import { Mascot } from "@/components/Mascot"

import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react"
import { cn } from "cn"

import { CalendarSheet } from "@/sheets/CalendarSheet"
import { CategoryChip, labelOf } from "@/components/category"
import { CategoryMenu } from "@/components/CategoryGuide"
import { DownIcon, LeftIcon, PencilIcon, ReturnIcon, RightIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { predictCategory, trainCategoryModel } from "@/lib/classifier"
import { dayBrief } from "@/lib/insights"
import { CATEGORIES, isExpense, isIncome, isSaving, notBills, type CategoryId, type Data, type Entry } from "@/lib/model"
import { parseLine, type Parsed } from "@/lib/parse"
import { monthOf, shiftDay, toDate } from "@/lib/dates"
import { formatPeso, formatPesoWhole } from "@/lib/format"
import { monthSummary } from "@/lib/ledger"

type Props = { data: Data; today: string; menu: ReactNode; onAdd: (entry: Entry) => void; onEdit: (entry: Entry) => void; onEditBudget: () => void }

// Ids and clock readings are minted out here, away from render.
const stamp = (parsed: Parsed, date: string): Entry => ({ id: crypto.randomUUID(), date, createdAt: Date.now(), ...parsed })

// The same colours as the Insights tips: green is good, gold is worth a look, coral needs action.
const DOT = { good: "bg-income", tip: "bg-primary", warn: "bg-over" }
const AMOUNT = { good: "text-foreground", tip: "text-primary", warn: "text-over" }

const CHIP = "flex shrink-0 items-center gap-1 rounded-sm border border-dashed border-primary/40 px-1.5 py-0.5 text-[11px] leading-none text-primary"

/** The launch screen: one ruled page per day, and the first line is where you type. */
export function Today({ data, today, menu, onAdd, onEdit, onEditBudget }: Props) {
  const [picked, setPicked] = useState<string | null>(null)
  const [text, setText] = useState("")
  const [needsAmount, setNeedsAmount] = useState(false)
  // The line whose category is being picked from its chip. Kept while the sheet slides away.
  const [line, setLine] = useState<Parsed | null>(null)
  const [picking, setPicking] = useState(false)
  // The calendar, opened from the date. The key starts it on the picked day's month each time.
  const [calendar, setCalendar] = useState({ open: false, key: 0 })
  const input = useRef<HTMLInputElement>(null)
  // Retrained whenever entries change, so every save and every corrected category teaches the next guess.
  const model = useMemo(() => trainCategoryModel(data.entries), [data.entries])

  const date = picked && picked < today ? picked : today
  const preview = text.trim() ? parseLine(text, (note, amount) => predictCategory(model, note, amount).category) : null
  // Everything below reads all entries, so it's worked out when the data or the day changes, not on each keystroke.
  const lines = useMemo(() => data.entries.filter((e) => e.date === date).sort((a, b) => b.createdAt - a.createdAt), [data.entries, date])
  const spent = lines.reduce((sum, e) => (isExpense(e) ? sum + e.amount : sum), 0)
  const monthSpent = useMemo(() => monthSummary(data.entries, monthOf(today), data.budget, today).spent, [data.entries, data.budget, today])
  // The line under the date speaks about the day showing: a plan for today, a verdict for a past day.
  const brief = useMemo(() => dayBrief(data.entries, data.budget, date, today, notBills(data)), [data, date, today])
  const day = toDate(date)
  const otherYear = day.getFullYear() !== toDate(today).getFullYear()
  const focus = () => input.current?.focus()
  const show = (next: string) => setPicked(next >= today ? null : next)
  const go = (by: number) => show(shiftDay(date, by))

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

  // Picking from the chip saves the line with that category, which the model then learns from.
  const pick = (category: CategoryId) => {
    if (!line) return
    setPicking(false)
    setText("")
    setNeedsAmount(false)
    onAdd(stamp({ ...line, category }, date))
  }

  return (
    <div className="flex flex-col">
      <header className="flex items-end justify-between gap-3 pt-4 pr-2 pb-0.5 pl-8">
        {/* A size container: the date stays on one line, and the month goes short only when the buttons leave it too little room. */}
        <div className="@container min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            {day.toLocaleDateString("en-PH", { weekday: "long" })}
            {otherYear && ` · ${day.getFullYear()}`}
          </p>
          <h1 className="text-[1.375rem] leading-tight font-semibold tracking-[-0.01em]">
            {/* Tap the date for the calendar; ‹ › still step one day. */}
            <button
              type="button"
              onClick={() => setCalendar((c) => ({ open: true, key: c.key + 1 }))}
              aria-haspopup="dialog"
              aria-label={`${day.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}. Pick a day`}
              className="-my-1 flex max-w-full items-center gap-1 rounded-sm py-1 text-left whitespace-nowrap active:opacity-70"
            >
              {/* 11.5rem fits "30 September" and the chevron in SF Pro or Inter, with room to spare; truncate catches the rest. */}
              <span className="min-w-0 truncate @max-[11.5rem]:hidden">{day.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}</span>
              <span className="hidden min-w-0 truncate @max-[11.5rem]:inline">{day.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
              <DownIcon className="size-4 shrink-0 text-faint @max-[6.5rem]:hidden" />
            </button>
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {date !== today && (
            <Button variant="secondary" size="sm" className="mr-1 text-primary" onClick={() => setPicked(null)}>
              Today
            </Button>
          )}
          <Button variant="ghost" size="icon-lg" aria-label="Previous day" onClick={() => go(-1)}>
            <LeftIcon className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-lg" aria-label="Next day" disabled={date === today} onClick={() => go(1)}>
            <RightIcon className="size-4" />
          </Button>
          {menu}
        </div>
      </header>

      {brief ? (
        <button
          type="button"
          onClick={onEditBudget}
          aria-label={`${brief.label} ${brief.amount === null ? "" : formatPesoWhole(brief.amount)}. Edit monthly budget`}
          className="flex w-full items-start gap-2 pr-4 pb-2 pl-8 text-left text-xs"
        >
          <span aria-hidden className={cn("mt-1 size-1.5 shrink-0 rounded-full", DOT[brief.tone])} />
          <span className="min-w-0 flex-1">
            <span className="text-muted-foreground">{brief.label} </span>
            {brief.amount !== null && <span className={cn("font-medium tabular-nums", AMOUNT[brief.tone])}>{formatPesoWhole(brief.amount)}</span>}
            {brief.notes.map((note) => (
              <span key={note} className="block text-faint">
                {note}
              </span>
            ))}
          </span>
          <PencilIcon className="mt-px size-3.5 shrink-0 text-faint" />
        </button>
      ) : (
        <p className="flex items-center gap-1 pr-4 pb-2 pl-8 text-xs text-muted-foreground">
          {formatPeso(monthSpent)} spent this month ·
          <button type="button" onClick={onEditBudget} className="text-primary">
            Set a budget
          </button>
        </p>
      )}

      <div className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-[1.375rem] w-px bg-margin" />

        <form onSubmit={add} className="flex h-10 items-center gap-2 border-b border-margin pr-4 pl-8">
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
          {preview &&
            (isExpense(preview) ? (
              // A guessed category: tap it to pick the right one. The tap area reaches past the small chip.
              <button
                type="button"
                onClick={() => {
                  setLine(preview)
                  setPicking(true)
                }}
                aria-haspopup="dialog"
                aria-label={`${CATEGORIES[preview.category]}, ${formatPeso(preview.amount)}. Change the category`}
                className={cn(CHIP, "relative after:absolute after:-inset-2 active:bg-primary/10")}
              >
                {CATEGORIES[preview.category]}
                <DownIcon className="-ml-0.5 size-3" />· {formatPeso(preview.amount)}
                <ReturnIcon className="size-3" />
              </button>
            ) : (
              <span className={CHIP}>
                {labelOf(preview)} · {isIncome(preview) && "+"}
                {formatPeso(preview.amount)}
                <ReturnIcon className="size-3" />
              </span>
            ))}
        </form>

        {needsAmount && (
          <p role="alert" className="border-b border-rule py-2 pr-4 pl-8 text-sm text-over">
            Add an amount, like coffee 120
          </p>
        )}

        <ul>
          {lines.map((e) => (
            <li key={e.id} className="border-b border-rule transition-[opacity,translate] duration-300 ease-out motion-reduce:transition-none starting:-translate-y-1.5 starting:opacity-0">
              <button type="button" onClick={() => onEdit(e)} className="flex h-9 w-full items-center gap-2 pr-4 pl-8 text-left text-sm transition-colors active:bg-foreground/[0.04]">
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

        {lines.length === 0 && (
          <div className="flex items-center gap-3 border-b border-rule py-2 pr-4 pl-8">
            <Mascot pose="ready" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="mb-1 block text-sm font-medium text-foreground">{date === today ? "A fresh page for today." : "No entries for this day."}</span>
              Type a line like coffee 120, then press return.
            </p>
          </div>
        )}

        {Array.from({ length: Math.max(4, (lines.length === 0 ? 8 : 12) - lines.length) }, (_, i) => (
          <div key={i} aria-hidden onClick={focus} className="flex h-9 items-center border-b border-rule pl-8 text-sm text-faint" />
        ))}
      </div>

      <p className="flex justify-between pt-2 pr-4 pl-8 text-xs text-muted-foreground">
        <span>
          {lines.length} {lines.length === 1 ? "entry" : "entries"}
        </span>
        <span>
          Spent {date === today ? "today" : "that day"} <span className="font-medium text-foreground tabular-nums">{formatPeso(spent)}</span>
        </span>
      </p>

      <Drawer open={picking} onOpenChange={setPicking}>
        {/* Back to the entry line afterwards, ready for the next one. */}
        <DrawerContent
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            focus()
          }}
        >
          {line && (
            <div className="flex flex-col gap-2.5 overflow-y-auto px-1 pb-[env(safe-area-inset-bottom)]">
              <DrawerHeader className="p-2 pb-0">
                <DrawerTitle>{line.note ? `What is “${line.note}”?` : "Which category?"}</DrawerTitle>
                <DrawerDescription>
                  Tally guessed {CATEGORIES[line.category]}. Tap the right one to save {formatPeso(line.amount)}.
                </DrawerDescription>
              </DrawerHeader>
              <CategoryMenu value={line.category} onPick={pick} />
            </div>
          )}
        </DrawerContent>
      </Drawer>

      <CalendarSheet
        open={calendar.open}
        onOpenChange={(open) => setCalendar((c) => ({ ...c, open }))}
        openKey={calendar.key}
        entries={data.entries}
        budget={data.budget}
        selected={date}
        today={today}
        onPick={(next) => {
          show(next)
          setCalendar((c) => ({ ...c, open: false }))
        }}
      />
    </div>
  )
}
