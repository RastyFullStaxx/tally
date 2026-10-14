import { Mascot } from "@/components/Mascot"

import { useState, type FormEvent, type ReactNode } from "react"

import type { Sheet } from "@/components/AppMenu"
import { CategoryGuideList } from "@/components/CategoryGuide"
import { AddSquareIcon, CalendarIcon, ChartIcon, MoreIcon, PencilIcon, PiggyIcon, ReturnIcon, ShareIcon, TrendUpIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Input } from "@/components/ui/input"
import { parseAmount, type Goal } from "@/lib/ledger"

type Props = {
  sheet: { kind: Sheet; key: number } | null
  open: boolean
  onOpenChange: (open: boolean) => void
  budget: number
  goal?: Goal
  onBudget: (centavos: number) => void
  onGoal: (goal: Goal | undefined) => void
}

/** The bottom sheets the ··· menu and the pencils open. The last one stays rendered while it slides away. */
export function Sheets({ sheet, open, onOpenChange, budget, goal, onBudget, onGoal }: Props) {
  const done = () => onOpenChange(false)
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        {sheet?.kind === "help" && (
          <Info title="How to use Tally" description="Type it like a note. Tally does the rest." onDone={done}>
            <HowTo />
          </Info>
        )}
        {sheet?.kind === "budget" && (
          <BudgetForm
            key={sheet.key}
            budget={budget}
            onSave={(centavos) => {
              onBudget(centavos)
              done()
            }}
          />
        )}
        {sheet?.kind === "goal" && (
          <GoalForm
            key={sheet.key}
            goal={goal}
            onSave={(next) => {
              onGoal(next)
              done()
            }}
          />
        )}
        {sheet?.kind === "install" && (
          <Info title="Install Tally on your iPhone" description="Three taps, and it works offline from then on." onDone={done}>
            <ol className="space-y-2 text-sm">
              <li className="flex gap-2">
                <span className="w-4 text-faint">1.</span>
                <span>
                  Tap <ShareIcon className="inline size-4 align-[-3px] text-primary" /> <b>Share</b> at the bottom of Safari. On iOS 26, tap <b>•••</b> first.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="w-4 text-faint">2.</span>
                <span>
                  Scroll down and tap <AddSquareIcon className="inline size-4 align-[-3px] text-primary" /> <b>Add to Home Screen</b>.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="w-4 text-faint">3.</span>
                <span>
                  Tap <b>Add</b>, then open Tally from your home screen.
                </span>
              </li>
            </ol>
            <p className="rounded-md bg-white/[0.03] px-2.5 py-2 text-xs text-muted-foreground">Always use the home-screen icon after that. It keeps its own data, separate from this Safari tab.</p>
          </Info>
        )}
        {sheet?.kind === "guide" && (
          <Info title="Which category?" description="What goes where, and a quick way to decide." onDone={done}>
            <CategoryGuideList />
          </Info>
        )}
      </DrawerContent>
    </Drawer>
  )
}

function Info({ title, description, onDone, children }: { title: string; description: string; onDone: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 overflow-y-auto px-1 pb-[env(safe-area-inset-bottom)]">
      <DrawerHeader className="p-2 pb-0">
        <DrawerTitle>{title}</DrawerTitle>
        <DrawerDescription>{description}</DrawerDescription>
      </DrawerHeader>
      <div className="space-y-3 px-1">{children}</div>
      <DrawerFooter className="px-0 pt-1">
        <Button size="lg" onClick={onDone}>
          Got it
        </Button>
      </DrawerFooter>
    </div>
  )
}

/** Something to type, shown the way it looks on the entry line. */
const Ex = ({ children }: { children: ReactNode }) => <span className="rounded-sm bg-white/[0.07] px-1 py-px whitespace-nowrap text-foreground">{children}</span>

// The whole app on one screen: each row is a question a newcomer has, answered with what to type or tap.
const HOW_TO = [
  { icon: ReturnIcon, title: "Type it, press return. Done.", body: <><Ex>jollibee 245</Ex> becomes ₱245 in Food. Nothing to fill in.</> },
  { icon: TrendUpIcon, title: "Money came in?", body: <>Add a plus: <Ex>+25000 salary</Ex></> },
  { icon: PiggyIcon, title: "Saving?", body: <>Just say so: <Ex>1000 savings</Ex> puts it aside, <Ex>withdraw 500</Ex> takes some out. Neither counts as spending.</> },
  { icon: PencilIcon, title: "Wrong category?", body: <>Tap the chip at the end of the line, or tap the entry later. Tally learns, so next time it guesses right.</> },
  { icon: CalendarIcon, title: "Forgot one?", body: <>Tap ‹ at the top to go back a day.</> },
  { icon: ChartIcon, title: "Where did it go?", body: <>Insights shows what's safe to spend today, the bills coming up, and what to do next.</> },
  { icon: MoreIcon, title: "Set it once.", body: <>Your monthly budget and savings goal are in ··· at the top.</> },
]

function HowTo() {
  return (
    <>
      <div className="flex items-center gap-3">
        <Mascot pose="welcome" size={80} />
        <p className="text-sm text-muted-foreground"><span className="block font-medium text-foreground">Meet your little budget companion.</span>A note at a time, you've got this.</p>
      </div>
      <ul className="space-y-2.5 text-sm">
        {HOW_TO.map((row) => (
          <li key={row.title} className="flex gap-2.5">
            <row.icon className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="leading-snug">
              <span className="font-medium">{row.title}</span> <span className="text-muted-foreground">{row.body}</span>
            </p>
          </li>
        ))}
      </ul>
      <p className="rounded-md bg-white/[0.03] px-2.5 py-2 text-xs text-muted-foreground">
        No account, no internet needed. Everything stays on this phone, so back it up now and then: ··· → Export backup.
      </p>
    </>
  )
}

/** A big centred peso field that grows with what's typed. */
function PesoInput({ value, onChange, label, placeholder }: { value: string; onChange: (value: string) => void; label: string; placeholder: string }) {
  return (
    <label className="flex items-baseline justify-center gap-1 text-[1.75rem] font-semibold tracking-[-0.02em]">
      <span className="text-muted-foreground">₱</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder={placeholder}
        aria-label={label}
        style={{ width: `${Math.max(value.length || placeholder.length, 1) + 0.5}ch` }}
        className="max-w-[70vw] bg-transparent tabular-nums outline-none placeholder:text-faint"
      />
    </label>
  )
}

function BudgetForm({ budget, onSave }: { budget: number; onSave: (centavos: number) => void }) {
  const [value, setValue] = useState(budget ? String(budget / 100) : "")
  const cents = parseAmount(value)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (cents) onSave(cents)
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5 px-1 pb-[env(safe-area-inset-bottom)]">
      <DrawerHeader className="p-2 pb-0">
        <DrawerTitle>Monthly budget</DrawerTitle>
        <DrawerDescription>What you plan to spend in a month. Savings don't count against it.</DrawerDescription>
      </DrawerHeader>
      <PesoInput value={value} onChange={setValue} label="Monthly budget in pesos" placeholder="20,000" />
      <DrawerFooter className="gap-1.5 px-0 pt-1">
        <Button type="submit" size="lg" disabled={!cents}>
          Save budget
        </Button>
        {budget > 0 && (
          <Button type="button" variant="ghost" size="lg" onClick={() => onSave(0)}>
            Remove budget
          </Button>
        )}
      </DrawerFooter>
    </form>
  )
}

function GoalForm({ goal, onSave }: { goal?: Goal; onSave: (goal: Goal | undefined) => void }) {
  const [name, setName] = useState(goal?.name ?? "")
  const [value, setValue] = useState(goal ? String(goal.amount / 100) : "")
  const cents = parseAmount(value)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (cents && name.trim()) onSave({ name: name.trim(), amount: cents })
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5 px-1 pb-[env(safe-area-inset-bottom)]">
      <DrawerHeader className="p-2 pb-0">
        <DrawerTitle>Savings goal</DrawerTitle>
        <DrawerDescription>What you're saving for. Tally shows how close you are and when you'll get there.</DrawerDescription>
      </DrawerHeader>
      <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Goal name" placeholder="Emergency fund" className="h-9 px-2.5" />
      <PesoInput value={value} onChange={setValue} label="Goal amount in pesos" placeholder="50,000" />
      <DrawerFooter className="gap-1.5 px-0 pt-1">
        <Button type="submit" size="lg" disabled={!cents || !name.trim()}>
          Save goal
        </Button>
        {goal && (
          <Button type="button" variant="ghost" size="lg" onClick={() => onSave(undefined)}>
            Remove goal
          </Button>
        )}
      </DrawerFooter>
    </form>
  )
}
