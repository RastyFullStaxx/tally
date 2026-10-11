import { useState, type FormEvent } from "react"
import { cn } from "cn"

import { CATEGORY_ORDER, categoryColor } from "@/components/category"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { CATEGORIES, parseAmount, type CategoryId, type Entry } from "@/lib/ledger"

type Props = {
  editing: { entry: Entry; key: number } | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (entry: Entry) => void
  onDelete: (id: string) => void
}

export function EntryDrawer({ editing, open, onOpenChange, onSave, onDelete }: Props) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        {editing && (
          <EntryForm
            key={editing.key}
            entry={editing.entry}
            onSave={(entry) => {
              onSave(entry)
              onOpenChange(false)
            }}
            onDelete={() => {
              onDelete(editing.entry.id)
              onOpenChange(false)
            }}
          />
        )}
      </DrawerContent>
    </Drawer>
  )
}

function EntryForm({ entry, onSave, onDelete }: { entry: Entry; onSave: (entry: Entry) => void; onDelete: () => void }) {
  const [amount, setAmount] = useState(String(entry.amount / 100))
  const [note, setNote] = useState(entry.note)
  const [income, setIncome] = useState(entry.income)
  const [category, setCategory] = useState<CategoryId>(entry.income ? "other" : entry.category)
  const [date, setDate] = useState(entry.date)
  const [confirming, setConfirming] = useState(false)
  const cents = parseAmount(amount)

  function save(event: FormEvent) {
    event.preventDefault()
    if (!cents || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    onSave({ ...entry, amount: cents, note: note.trim(), income, category: income ? "income" : category, date })
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-2.5 overflow-y-auto px-1 pb-[env(safe-area-inset-bottom)]">
      <DrawerHeader className="p-2 pb-0">
        <DrawerTitle>Edit entry</DrawerTitle>
        <DrawerDescription className="sr-only">Change the amount, note, category or date, or delete the entry.</DrawerDescription>
      </DrawerHeader>

      <label className="flex items-baseline justify-center gap-1 text-[1.75rem] font-semibold tracking-[-0.02em]">
        <span className="text-muted-foreground">₱</span>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          aria-label="Amount in pesos"
          aria-invalid={!cents}
          style={{ width: `${Math.max(amount.length, 1) + 0.5}ch` }}
          className={cn("max-w-[70vw] bg-transparent tabular-nums outline-none", !cents && "text-over")}
        />
      </label>

      <div role="radiogroup" aria-label="Type" className="grid w-full grid-cols-2 gap-0.5 rounded-md bg-background/70 p-0.5">
        {[false, true].map((isIncome) => (
          <Button
            key={String(isIncome)}
            type="button"
            variant="ghost"
            role="radio"
            aria-checked={income === isIncome}
            onClick={() => setIncome(isIncome)}
            className={cn("h-7 rounded-sm text-muted-foreground", income === isIncome && "bg-accent text-foreground hover:bg-accent")}
          >
            {isIncome ? "Income" : "Expense"}
          </Button>
        ))}
      </div>

      <Input value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" placeholder="What it was" className="h-9 px-2.5" />

      {!income && (
        <fieldset className="grid grid-cols-4 gap-1.5">
          <legend className="sr-only">Category</legend>
          {CATEGORY_ORDER.map((c) => (
            <Button
              key={c}
              type="button"
              variant="ghost"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className="h-8 rounded-md bg-white/[0.05] px-1 text-xs text-muted-foreground"
              style={
                category === c
                  ? {
                      color: `color-mix(in oklab, ${categoryColor(c)} 70%, white)`,
                      backgroundColor: `color-mix(in oklab, ${categoryColor(c)} 22%, transparent)`,
                      boxShadow: `inset 0 0 0 1px ${categoryColor(c)}`,
                    }
                  : undefined
              }
            >
              {CATEGORIES[c]}
            </Button>
          ))}
        </fieldset>
      )}

      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className="h-9 px-2.5" />

      <DrawerFooter className="gap-1.5 px-0 pt-1">
        <Button type="submit" size="lg" disabled={!cents}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="lg" className="text-over hover:bg-over/10 hover:text-over" onClick={() => (confirming ? onDelete() : setConfirming(true))}>
          {confirming ? "Tap again to delete" : "Delete entry"}
        </Button>
      </DrawerFooter>
    </form>
  )
}
