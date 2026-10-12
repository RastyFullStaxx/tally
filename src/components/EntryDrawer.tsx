import { useState, type FormEvent } from "react"
import { cn } from "cn"

import { CategoryPicker } from "@/components/CategoryGuide"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { isSaving, parseAmount, type CategoryId, type Entry } from "@/lib/ledger"

type Props = {
  editing: { entry: Entry; key: number } | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (entry: Entry) => void
  onDelete: (id: string) => void
}

type Kind = "expense" | "income" | "savings"

const KINDS: { kind: Kind; label: string; help?: string }[] = [
  { kind: "expense", label: "Expense" },
  { kind: "income", label: "Income", help: "Money you received, like salary, allowance or a refund." },
  { kind: "savings", label: "Savings", help: "Money you set aside, or took back out. It doesn't count as spending." },
]

// Stamped out here, away from render: the category learner counts an edited entry as fresh.
const touched = (entry: Entry): Entry => ({ ...entry, updatedAt: Date.now() })

export function EntryDrawer({ editing, open, onOpenChange, onSave, onDelete }: Props) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* Taller than the other sheets, so every category and its description fits on one screen. */}
      <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[calc(100svh_-_env(safe-area-inset-top)_-_0.5rem)]">
        {editing && (
          <EntryForm
            key={editing.key}
            entry={editing.entry}
            onSave={(entry) => {
              onSave(touched(entry))
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

/** A compact segmented control, like the ones in iOS and VS Code. */
function Segments<T extends string | boolean>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid w-full gap-0.5 rounded-md bg-background/70 p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <Button
          key={String(o.value)}
          type="button"
          variant="ghost"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("h-7 rounded-sm text-muted-foreground", value === o.value && "bg-accent text-foreground hover:bg-accent")}
        >
          {o.label}
        </Button>
      ))}
    </div>
  )
}

function EntryForm({ entry, onSave, onDelete }: { entry: Entry; onSave: (entry: Entry) => void; onDelete: () => void }) {
  const [amount, setAmount] = useState(String(entry.amount / 100))
  const [note, setNote] = useState(entry.note)
  const [kind, setKind] = useState<Kind>(isSaving(entry) ? "savings" : entry.income ? "income" : "expense")
  const [takeOut, setTakeOut] = useState(isSaving(entry) && entry.income)
  const [category, setCategory] = useState<CategoryId>(kind === "expense" ? entry.category : "other")
  const [date, setDate] = useState(entry.date)
  const [confirming, setConfirming] = useState(false)
  const cents = parseAmount(amount)
  const help = KINDS.find((k) => k.kind === kind)?.help

  function save(event: FormEvent) {
    event.preventDefault()
    if (!cents || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    onSave({
      ...entry,
      amount: cents,
      note: note.trim(),
      date,
      income: kind === "income" || (kind === "savings" && takeOut),
      category: kind === "expense" ? category : kind,
    })
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-2.5 overflow-y-auto px-1">
      <DrawerHeader className="p-2 pb-0">
        <DrawerTitle>Edit entry</DrawerTitle>
        <DrawerDescription className="sr-only">Change the amount, note, type, category or date, or delete the entry.</DrawerDescription>
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

      <div className="space-y-1">
        <Segments label="Type" value={kind} options={KINDS.map((k) => ({ value: k.kind, label: k.label }))} onChange={setKind} />
        {kind === "savings" && (
          <Segments
            label="Direction"
            value={takeOut}
            options={[
              { value: false, label: "Put in" },
              { value: true, label: "Take out" },
            ]}
            onChange={setTakeOut}
          />
        )}
        {help && <p className="px-0.5 text-xs text-muted-foreground">{help}</p>}
      </div>

      <div className="flex gap-1.5">
        <Input value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" placeholder="What it was" className="h-9 min-w-0 flex-1 px-2.5" />
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className="h-9 w-[9.5rem] shrink-0 px-2.5" />
      </div>

      {kind === "expense" && <CategoryPicker value={category} onChange={setCategory} />}

      {/* Pinned to the bottom of the sheet, so Save stays in reach below the long category list. It clears the
          home indicator: the sheet already pads 1rem, the rest comes from here. */}
      <DrawerFooter className="sticky bottom-0 flex-row gap-1.5 bg-popover px-0 pt-2 pb-[max(0.5rem,calc(env(safe-area-inset-bottom)_-_1rem))]">
        <Button type="button" variant="ghost" size="lg" className="text-over hover:bg-over/10 hover:text-over" onClick={() => (confirming ? onDelete() : setConfirming(true))}>
          {confirming ? "Tap again to delete" : "Delete"}
        </Button>
        <Button type="submit" size="lg" disabled={!cents} className="flex-1">
          Save
        </Button>
      </DrawerFooter>
    </form>
  )
}
