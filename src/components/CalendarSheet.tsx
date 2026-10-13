import { useState } from "react"
import { cn } from "cn"

import { LeftIcon, RightIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { daysIn, formatPeso, formatPesoShort, formatPesoWhole, isExpense, monthName, monthOf, pad, shiftMonth, toDate, type Entry } from "@/lib/ledger"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Changes on every open, so the sheet starts on the picked day's month again. */
  openKey: number
  entries: Entry[]
  budget: number
  selected: string
  today: string
  onPick: (date: string) => void
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] // Sunday first, as calendars are in the Philippines

/** A month at a glance, opened from the date on Today: what each day cost, and a tap to go to that day. */
export function CalendarSheet({ open, onOpenChange, openKey, ...month }: Props) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <Month key={openKey} {...month} />
      </DrawerContent>
    </Drawer>
  )
}

function Month({ entries, budget, selected, today, onPick }: Omit<Props, "open" | "onOpenChange" | "openKey">) {
  const [month, setMonth] = useState(monthOf(selected))
  const days = daysIn(month)
  const spent = new Array<number>(days).fill(0)
  const everyday = new Array<number>(days).fill(0) // without bills, which land on fixed dates
  for (const e of entries) {
    if (!isExpense(e) || !e.date.startsWith(month)) continue
    spent[Number(e.date.slice(8, 10)) - 1] += e.amount
    if (e.category !== "bills") everyday[Number(e.date.slice(8, 10)) - 1] += e.amount
  }
  const total = spent.reduce((a, b) => a + b, 0)
  // A day's even share of what the budget leaves after bills: days that spent more show in coral.
  const share = Math.max(0, budget - (total - everyday.reduce((a, b) => a + b, 0))) / days

  return (
    <div className="flex flex-col gap-2 px-1 pb-[env(safe-area-inset-bottom)]">
      <DrawerHeader className="flex-row items-center justify-between p-0">
        <Button variant="ghost" size="icon-lg" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
          <LeftIcon className="size-4" />
        </Button>
        <DrawerTitle>
          {monthName(month)} {toDate(month).getFullYear()}
        </DrawerTitle>
        <Button variant="ghost" size="icon-lg" aria-label="Next month" disabled={month >= monthOf(today)} onClick={() => setMonth(shiftMonth(month, 1))}>
          <RightIcon className="size-4" />
        </Button>
      </DrawerHeader>
      <DrawerDescription className="sr-only">Pick a day to see or add its entries. Each day shows what you spent.</DrawerDescription>

      <div aria-hidden className="grid grid-cols-7 text-center text-[11px] text-faint">
        {WEEKDAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: toDate(`${month}-01`).getDay() }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {spent.map((amount, i) => {
          const date = `${month}-${pad(i + 1)}`
          const isToday = date === today
          return (
            <button
              key={date}
              type="button"
              disabled={date > today}
              onClick={() => onPick(date)}
              aria-label={`${toDate(date).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}, ${amount ? `${formatPeso(amount)} spent` : "nothing spent"}`}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={date === selected}
              className={cn(
                "flex h-11 flex-col items-center justify-center gap-0.5 rounded-md text-sm tabular-nums transition-colors disabled:text-faint/50",
                "active:bg-white/[0.06] enabled:hover:bg-white/[0.04]",
                date === selected && "ring-1 ring-primary ring-inset"
              )}
            >
              <span className={cn("flex size-6 items-center justify-center rounded-full leading-none", isToday && "bg-primary font-semibold text-primary-foreground")}>{i + 1}</span>
              <span className={cn("h-2.5 text-[10px] leading-none", budget && everyday[i] > share ? "text-over" : "text-muted-foreground")}>{amount ? formatPesoShort(amount) : ""}</span>
            </button>
          )
        })}
      </div>

      {budget > 0 && <p className="px-1 text-[11px] text-faint">Coral days spent more than a day's share of your budget after bills, {formatPesoWhole(share)}.</p>}
      <div className="flex items-center justify-between px-1 pt-1 text-xs text-muted-foreground">
        <span>
          Spent in {monthName(month)} <span className="font-medium text-foreground tabular-nums">{formatPeso(total)}</span>
        </span>
        <Button variant="secondary" size="sm" className="text-primary" onClick={() => onPick(today)}>
          Today
        </Button>
      </div>
    </div>
  )
}
