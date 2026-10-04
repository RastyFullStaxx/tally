import { useRef, useState, type ChangeEvent } from "react"
import { Alert02Icon, ArrowLeft01Icon, ArrowRight01Icon, BulbIcon, CheckmarkCircle02Icon, Download04Icon, MoreHorizontalIcon, Upload04Icon, Wallet01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { cn } from "cn"
import { Area, Bar, BarChart, ComposedChart, Line, ReferenceDot, XAxis, YAxis } from "recharts"

import { categoryColor } from "@/components/category"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { advise, CATEGORIES, formatPeso, formatPesoWhole, lastMonths, monthName, monthOf, monthSummary, parseAmount, shiftMonth, toDate, type Data } from "@/lib/ledger"
import { exportBackup, importBackup } from "@/lib/store"

type Props = { data: Data; today: string; onBudget: (centavos: number) => void; onImport: (data: Data) => void }

const paceChart = {
  spent: { label: "Spent", color: "var(--chart-spent)" },
  pace: { label: "Even pace", color: "var(--chart-pace)" },
} satisfies ChartConfig

const trendChart = {
  income: { label: "Income", color: "var(--chart-income)" },
  spent: { label: "Spent", color: "var(--chart-spent)" },
} satisfies ChartConfig

const TONE = {
  warn: { icon: Alert02Icon, className: "text-over" },
  tip: { icon: BulbIcon, className: "text-primary" },
  good: { icon: CheckmarkCircle02Icon, className: "text-income" },
}

// Chart values are pesos; this puts the ₱ back in the tooltip.
const pesoRow = (config: ChartConfig) => (value: unknown, name: unknown, item: { color?: string }) => (
  <div className="flex w-full items-center gap-2">
    <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: item.color }} />
    <span className="text-muted-foreground">{config[String(name)]?.label}</span>
    <span className="ml-auto pl-3 font-medium text-foreground tabular-nums">{formatPeso(Math.round(Number(value) * 100))}</span>
  </div>
)

export function Insights({ data, today, onBudget, onImport }: Props) {
  const [picked, setPicked] = useState<string | null>(null)
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [budgetKey, setBudgetKey] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const thisMonth = monthOf(today)
  const month = picked && picked < thisMonth ? picked : thisMonth
  const current = month === thisMonth
  const s = monthSummary(data.entries, month, data.budget, today)
  const tips = advise(data.entries, month, data.budget, today)
  const when = current ? "this month" : `in ${monthName(month)}`
  const monthShort = toDate(month).toLocaleDateString("en-PH", { month: "short" })

  const go = (by: number) => {
    const next = shiftMonth(month, by)
    setPicked(next >= thisMonth ? null : next)
  }
  const openBudget = () => {
    setBudgetKey((k) => k + 1)
    setBudgetOpen(true)
  }
  const say = (text: string) => {
    setNotice(text)
    setTimeout(() => setNotice((shown) => (shown === text ? null : shown)), 4000)
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    try {
      const { data: merged, added, skipped } = await importBackup(file, data)
      onImport(merged)
      say(`Imported ${added} ${added === 1 ? "entry" : "entries"}${skipped ? `, skipped ${skipped} unreadable` : ""}.`)
    } catch (error) {
      say((error as Error).message)
    }
  }

  let status: { tone: keyof typeof TONE; text: string } | null = null
  if (data.budget) {
    if (s.spent > data.budget) status = { tone: "warn", text: current ? `Over budget by ${formatPesoWhole(s.spent - data.budget)}` : `Went ${formatPesoWhole(s.spent - data.budget)} over budget` }
    else if (!current) status = { tone: "good", text: `Finished ${formatPesoWhole(data.budget - s.spent)} under budget` }
    else if (s.spent > s.pace) status = { tone: "tip", text: `${formatPesoWhole(s.spent - s.pace)} ahead of pace · ${formatPesoWhole(s.perDay)}/day left` }
    else status = { tone: "good", text: `On track · ${formatPesoWhole(s.perDay)}/day for ${s.daysLeft} ${s.daysLeft === 1 ? "day" : "days"}` }
  }

  const budgetPesos = data.budget / 100
  const last = s.cumulative.length
  const paceData = Array.from({ length: s.days }, (_, i) => ({
    day: i + 1,
    spent: i < last ? s.cumulative[i] / 100 : undefined,
    pace: data.budget ? (budgetPesos * (i + 1)) / s.days : undefined,
  }))
  const top = Math.max(budgetPesos, (s.cumulative[last - 1] ?? 0) / 100, 1) * 1.08

  const trend = lastMonths(data.entries, month, 6).map((t) => ({
    label: toDate(t.month).toLocaleDateString("en-PH", { month: "short" }),
    income: t.income / 100,
    spent: t.spent / 100,
  }))
  const hasTrend = trend.some((t) => t.income || t.spent)

  return (
    <div className="flex flex-col">
      <header className="flex items-end justify-between gap-3 pt-6 pr-3 pb-3 pl-5">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{toDate(month).getFullYear()}</p>
          <h1 className="text-[2.125rem] leading-tight font-bold tracking-[-0.01em]">{monthName(month)}</h1>
        </div>
        <div className="flex items-center gap-0.5 pb-1.5">
          {!current && (
            <Button variant="secondary" size="sm" className="mr-1 text-primary" onClick={() => setPicked(null)}>
              This month
            </Button>
          )}
          <Button variant="ghost" size="icon-lg" aria-label="Previous month" onClick={() => go(-1)}>
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5" />
          </Button>
          <Button variant="ghost" size="icon-lg" aria-label="Next month" disabled={current} onClick={() => go(1)}>
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-5" />
          </Button>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-lg" aria-label="More">
                <HugeiconsIcon icon={MoreHorizontalIcon} className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={openBudget}>
                <HugeiconsIcon icon={Wallet01Icon} />
                Monthly budget
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportBackup(data)}>
                <HugeiconsIcon icon={Download04Icon} />
                Export backup
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => fileInput.current?.click()}>
                <HugeiconsIcon icon={Upload04Icon} />
                Import backup
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input ref={fileInput} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden onChange={handleImport} />
        </div>
      </header>

      <div className="flex flex-col gap-3 px-4">
        {notice && (
          <p role="status" className="rounded-2xl bg-raised px-4 py-2.5 text-sm">
            {notice}
          </p>
        )}

        <Card className="gap-0 rounded-3xl px-5 py-4">
          <p className="text-xs text-muted-foreground">{data.budget ? `Spent of ${formatPeso(data.budget)} budget` : `Spent ${when}`}</p>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[2.5rem] leading-tight font-semibold tracking-[-0.02em]">{formatPeso(s.spent)}</span>
            {data.budget > 0 && <span className="text-xs text-muted-foreground tabular-nums">{Math.round((s.spent / data.budget) * 100)}%</span>}
          </div>
          {data.budget > 0 ? (
            <>
              <div
                role="meter"
                aria-label="Spent of budget"
                aria-valuemin={0}
                aria-valuemax={data.budget}
                aria-valuenow={Math.min(s.spent, data.budget)}
                aria-valuetext={`${formatPeso(s.spent)} of ${formatPeso(data.budget)}`}
                className="relative mt-2 mb-3 h-1.5 rounded-full bg-track"
              >
                <div className={cn("h-full rounded-full", s.spent > data.budget ? "bg-over" : "bg-primary")} style={{ width: `${Math.min(100, (s.spent / data.budget) * 100)}%` }} />
                {current && <div aria-hidden title="Even pace" className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground/60" style={{ left: `${(s.pace / data.budget) * 100}%` }} />}
              </div>
              {status && (
                <p className={cn("flex items-center gap-1.5 text-xs", TONE[status.tone].className)}>
                  <HugeiconsIcon icon={status.tone === "good" ? CheckmarkCircle02Icon : Alert02Icon} className="size-4 shrink-0" aria-hidden />
                  {status.text}
                </p>
              )}
            </>
          ) : (
            <Button variant="secondary" className="mt-3 self-start" onClick={openBudget}>
              Set a monthly budget
            </Button>
          )}
        </Card>

        <Card className="gap-3 rounded-3xl px-5 py-4">
          <h2 className="text-sm font-medium">What to do</h2>
          {tips.length ? (
            <ul className="flex flex-col gap-3">
              {tips.map((tip) => {
                const tone = TONE[tip.tone]
                return (
                  <li key={tip.text} className="flex gap-3 text-sm leading-snug">
                    <HugeiconsIcon icon={tone.icon} className={cn("mt-px size-4 shrink-0", tone.className)} aria-hidden />
                    <span>{tip.text}</span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Log a few days of spending and tips will show up here.</p>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Card size="sm" className="gap-0.5 rounded-3xl px-4">
            <p className="text-xs text-muted-foreground">Income</p>
            <p className={cn("text-lg font-medium tabular-nums", s.income ? "text-income" : "text-faint")}>{s.income ? `+${formatPeso(s.income)}` : formatPeso(0)}</p>
            {!s.income && <p className="text-[11px] text-faint">Log it with +amount</p>}
          </Card>
          <Card size="sm" className="gap-0.5 rounded-3xl px-4">
            <p className="text-xs text-muted-foreground">{s.net < 0 && s.income ? "Overspent" : current ? "Saved so far" : "Saved"}</p>
            <p className={cn("text-lg font-medium tabular-nums", !s.income ? "text-faint" : s.net < 0 ? "text-over" : "text-foreground")}>{s.income ? formatPeso(Math.abs(s.net)) : "—"}</p>
            {s.income > 0 && (
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {s.net < 0 ? `${Math.round((-s.net / s.income) * 100)}% more than you earned` : `${Math.round((s.net / s.income) * 100)}% of income`}
              </p>
            )}
          </Card>
        </div>

        {(s.spent > 0 || data.budget > 0) && (
          <Card className="gap-2 rounded-3xl px-5 py-4">
            <div className="flex items-center justify-between gap-3 text-xs">
              <h2 className="text-sm font-medium">Spending vs even pace</h2>
              <span className="flex shrink-0 items-center gap-3 text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="h-0.5 w-3 rounded-full bg-[var(--chart-spent)]" />
                  Spent
                </span>
                {data.budget > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="w-3 border-t-2 border-dashed border-[var(--chart-pace)]" />
                    Even pace
                  </span>
                )}
              </span>
            </div>
            <ChartContainer config={paceChart} className="aspect-auto h-36 w-full">
              <ComposedChart data={paceData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="spent-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-spent)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-spent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" ticks={[1, 8, 15, 22, s.days]} interval={0} tickLine={false} axisLine={false} tickMargin={6} />
                <YAxis hide domain={[0, top]} />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, payload) => `${monthShort} ${payload?.[0]?.payload?.day ?? ""}`} formatter={pesoRow(paceChart)} />} />
                {data.budget > 0 && <Line dataKey="pace" type="linear" stroke="var(--color-pace)" strokeWidth={1.5} strokeDasharray="3 4" dot={false} activeDot={false} />}
                <Area dataKey="spent" type="linear" stroke="var(--color-spent)" strokeWidth={2} fill="url(#spent-fill)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
                {current && last > 0 && <ReferenceDot x={last} y={s.cumulative[last - 1] / 100} r={4} fill="var(--color-spent)" stroke="var(--card)" strokeWidth={2} />}
              </ComposedChart>
            </ChartContainer>
          </Card>
        )}

        <Card className="gap-3 rounded-3xl px-5 py-4">
          <h2 className="text-sm font-medium">Where it went</h2>
          {s.byCategory.length ? (
            <ul className="flex flex-col gap-2.5">
              {s.byCategory.map(({ category, total }) => (
                <li key={category} className="flex items-center gap-2.5 text-sm">
                  <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: categoryColor(category) }} />
                  <span className="w-[6.5rem] shrink-0 truncate">
                    {CATEGORIES[category]} <span className="text-faint tabular-nums">{total / s.spent < 0.005 ? "<1" : Math.round((total / s.spent) * 100)}%</span>
                  </span>
                  <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-track">
                    <span className="block h-full rounded-r-full bg-[var(--chart-spent)]" style={{ width: `${(total / s.byCategory[0].total) * 100}%` }} />
                  </span>
                  <span className="w-[4.75rem] shrink-0 text-right font-medium tabular-nums">{formatPeso(total)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No spending logged {when}.</p>
          )}
        </Card>

        <Card className="gap-2 rounded-3xl px-5 py-4">
          <h2 className="text-sm font-medium">Last 6 months</h2>
          {hasTrend ? (
            <ChartContainer config={trendChart} className="aspect-auto h-44 w-full">
              <BarChart data={trend} barGap={2} barCategoryGap="24%" margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} />
                <YAxis hide />
                <ChartTooltip cursor={{ fill: "var(--track)" }} content={<ChartTooltipContent formatter={pesoRow(trendChart)} />} />
                <ChartLegend verticalAlign="top" content={<ChartLegendContent className="justify-start text-muted-foreground" />} />
                <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} maxBarSize={16} />
                <Bar dataKey="spent" fill="var(--color-spent)" radius={[4, 4, 0, 0]} maxBarSize={16} />
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-muted-foreground">This fills in as the months go by.</p>
          )}
        </Card>
      </div>

      <Drawer open={budgetOpen} onOpenChange={setBudgetOpen}>
        <DrawerContent>
          <BudgetForm
            key={budgetKey}
            budget={data.budget}
            onSave={(centavos) => {
              onBudget(centavos)
              setBudgetOpen(false)
            }}
          />
        </DrawerContent>
      </Drawer>
    </div>
  )
}

function BudgetForm({ budget, onSave }: { budget: number; onSave: (centavos: number) => void }) {
  const [value, setValue] = useState(budget ? String(budget / 100) : "")
  const cents = parseAmount(value)
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (cents) onSave(cents)
      }}
      className="flex flex-col gap-4 px-2 pb-[env(safe-area-inset-bottom)]"
    >
      <DrawerHeader className="pb-0">
        <DrawerTitle>Monthly budget</DrawerTitle>
        <DrawerDescription>What you plan to spend in a month. Pace alerts and tips measure against it.</DrawerDescription>
      </DrawerHeader>
      <label className="flex items-baseline justify-center gap-1 text-[2.5rem] font-semibold tracking-[-0.02em]">
        <span className="text-muted-foreground">₱</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="decimal"
          placeholder="20,000"
          aria-label="Monthly budget in pesos"
          style={{ width: `${Math.max(value.length || 6, 1) + 0.5}ch` }}
          className="max-w-[70vw] bg-transparent tabular-nums outline-none placeholder:text-faint"
        />
      </label>
      <DrawerFooter className="px-0">
        <Button type="submit" size="lg" className="h-12 text-base" disabled={!cents}>
          Save budget
        </Button>
        {budget > 0 && (
          <Button type="button" variant="ghost" size="lg" className="h-12" onClick={() => onSave(0)}>
            Remove budget
          </Button>
        )}
      </DrawerFooter>
    </form>
  )
}
