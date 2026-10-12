import { useState, type ReactNode } from "react"
import { cn } from "cn"
import { Area, Bar, BarChart, ComposedChart, Line, ReferenceDot, XAxis, YAxis } from "recharts"

import { categoryColor } from "@/components/category"
import { AlertIcon, CalendarIcon, CheckCircleIcon, DownIcon, LeftIcon, PencilIcon, RepeatIcon, RightIcon, TrendDownIcon, TrendUpIcon } from "@/components/icons"
import { SavingsCard } from "@/components/SavingsCard"
import { SectionTitle } from "@/components/section"
import { TONE, Tips } from "@/components/Tips"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { advise, categoryDetail, recurringBills, safeToSpend, savingsSummary, spendingPatterns, type Tip } from "@/lib/insights"
import { CATEGORIES, formatPeso, formatPesoWhole, lastMonths, monthName, monthOf, monthSummary, shiftMonth, toDate, type Data } from "@/lib/ledger"

type Props = {
  data: Data
  today: string
  menu: ReactNode
  onEditBudget: () => void
  onEditGoal: () => void
  onVote: (tip: Tip, vote: 1 | -1) => void
}

const paceChart = {
  spent: { label: "Spent", color: "var(--chart-spent)" },
  pace: { label: "Budget line", color: "var(--chart-pace)" },
} satisfies ChartConfig

const trendChart = {
  income: { label: "Income", color: "var(--chart-income)" },
  spent: { label: "Spent", color: "var(--chart-spent)" },
} satisfies ChartConfig

const pct = (x: number) => (x > 0 && x < 0.005 ? "<1%" : `${Math.round(x * 100)}%`)
const shortDate = (date: string) => toDate(date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1)

// Chart values are pesos; this puts the ₱ back in the tooltip.
const pesoRow = (config: ChartConfig) => (value: unknown, name: unknown, item: { color?: string }) => (
  <div className="flex w-full items-center gap-2">
    <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: item.color }} />
    <span className="text-muted-foreground">{config[String(name)]?.label}</span>
    <span className="ml-auto pl-3 font-medium text-foreground tabular-nums">{formatPeso(Math.round(Number(value) * 100))}</span>
  </div>
)

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md bg-background/50 px-2 py-1.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium tabular-nums">{value}</p>
      {sub && <p className="truncate text-[11px] text-faint">{sub}</p>}
    </div>
  )
}

export function Insights({ data, today, menu, onEditBudget, onEditGoal, onVote }: Props) {
  const [picked, setPicked] = useState<string | null>(null)

  const thisMonth = monthOf(today)
  const month = picked && picked < thisMonth ? picked : thisMonth
  const current = month === thisMonth
  const s = monthSummary(data.entries, month, data.budget, today)
  const tips = advise(data.entries, month, data.budget, today, { goal: data.goal, votes: data.votes })
  const patterns = spendingPatterns(data.entries, month, today)
  const details = categoryDetail(data.entries, month, today)
  const safe = current ? safeToSpend(data.entries, data.budget, today) : null
  const bills = current ? recurringBills(data.entries, today) : []
  const savings = savingsSummary(data.entries, data.goal, today)
  const when = current ? "this month" : `in ${monthName(month)}`
  const prevName = monthName(shiftMonth(month, -1))
  const monthShort = toDate(month).toLocaleDateString("en-PH", { month: "short" })
  const firstEntry = data.entries.reduce((m, e) => (e.date < m ? e.date : m), today)

  const go = (by: number) => {
    const next = shiftMonth(month, by)
    setPicked(next >= thisMonth ? null : next)
  }

  let status: { tone: keyof typeof TONE; text: string } | null = null
  if (data.budget) {
    const perDay = safe?.perDay ?? s.perDay
    if (s.spent > data.budget) status = { tone: "warn", text: current ? `Over budget by ${formatPesoWhole(s.spent - data.budget)}` : `Went ${formatPesoWhole(s.spent - data.budget)} over budget` }
    else if (!current) status = { tone: "good", text: `Finished ${formatPesoWhole(data.budget - s.spent)} under budget` }
    else if (perDay < 0) status = { tone: "warn", text: `Bills still to come will take you over budget` }
    else if (s.spent > s.pace) status = { tone: "tip", text: `${formatPesoWhole(s.spent - s.pace)} more than planned by today · ${formatPesoWhole(perDay)} a day left` }
    else status = { tone: "good", text: `On track · you can spend ${formatPesoWhole(perDay)} a day for ${s.daysLeft} more ${s.daysLeft === 1 ? "day" : "days"}` }
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
  const needsShare = s.spent ? patterns.needs / s.spent : 0
  const wantsShare = s.spent ? patterns.wants / s.spent : 0
  const leftover = s.income - s.spent - s.saved

  return (
    <div className="flex flex-col">
      <header className="flex items-end justify-between gap-3 pt-4 pr-2 pb-2 pl-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{toDate(month).getFullYear()}</p>
          <h1 className="text-[1.375rem] leading-tight font-semibold tracking-[-0.01em]">{monthName(month)}</h1>
        </div>
        <div className="flex items-center gap-0.5">
          {!current && (
            <Button variant="secondary" size="sm" className="mr-1 text-primary" onClick={() => setPicked(null)}>
              This month
            </Button>
          )}
          <Button variant="ghost" size="icon-lg" aria-label="Previous month" onClick={() => go(-1)}>
            <LeftIcon className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-lg" aria-label="Next month" disabled={current} onClick={() => go(1)}>
            <RightIcon className="size-4" />
          </Button>
          {menu}
        </div>
      </header>

      <div className="flex flex-col gap-2 px-2">
        <Card className="gap-0 px-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{data.budget ? `Spent of ${formatPeso(data.budget)} budget` : `Spent ${when}`}</p>
            {data.budget > 0 && (
              <Button variant="ghost" size="icon-sm" aria-label="Edit monthly budget" onClick={onEditBudget} className="-my-1 size-7 text-muted-foreground">
                <PencilIcon className="size-3.5" />
              </Button>
            )}
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[1.75rem] leading-tight font-semibold tracking-[-0.02em]">{formatPeso(s.spent)}</span>
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
                className="relative mt-1.5 mb-2 h-1 rounded-sm bg-track"
              >
                <div className={cn("h-full rounded-sm", s.spent > data.budget ? "bg-over" : "bg-primary")} style={{ width: `${Math.min(100, (s.spent / data.budget) * 100)}%` }} />
                {current && <div aria-hidden title="Even pace" className="absolute -top-1 h-3 w-0.5 -translate-x-1/2 bg-foreground/60" style={{ left: `${(s.pace / data.budget) * 100}%` }} />}
              </div>
              {status && (
                <p className={cn("flex items-center gap-1.5 text-xs", TONE[status.tone].className)}>
                  {status.tone === "good" ? <CheckCircleIcon className="size-3.5 shrink-0" /> : <AlertIcon className="size-3.5 shrink-0" />}
                  {status.text}
                </p>
              )}
            </>
          ) : (
            <Button variant="secondary" size="sm" className="mt-2 self-start" onClick={onEditBudget}>
              Set a monthly budget
            </Button>
          )}
        </Card>

        <Card className="gap-1 px-3">
          <SectionTitle>What to do</SectionTitle>
          <Tips tips={tips} votes={data.votes} onVote={onVote} />
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Card size="sm" className="gap-0 px-3">
            <p className="text-[11px] text-muted-foreground">Income</p>
            <p className={cn("text-base font-medium tabular-nums", s.income ? "text-income" : "text-faint")}>{s.income ? `+${formatPeso(s.income)}` : formatPeso(0)}</p>
            {!s.income && <p className="text-[11px] text-faint">Log it with +amount</p>}
          </Card>
          <Card size="sm" className="gap-0 px-3">
            <p className="text-[11px] text-muted-foreground">{leftover < 0 && s.income ? "Short by" : "Left over"}</p>
            <p className={cn("text-base font-medium tabular-nums", !s.income ? "text-faint" : leftover < 0 ? "text-over" : "text-foreground")}>{s.income ? formatPeso(Math.abs(leftover)) : "—"}</p>
            {s.income > 0 && <p className="text-[11px] text-muted-foreground">after spending and savings</p>}
          </Card>
        </div>

        <SavingsCard savings={savings} onEditGoal={onEditGoal} />

        {s.spent > 0 && (
          <Card className="gap-2 px-3">
            <SectionTitle>How you spent it</SectionTitle>
            <p className="-mt-1 text-[11px] text-faint">Essentials are bills, groceries, transport and health. Extras are food, shopping and leisure.</p>
            <div className="grid grid-cols-2 gap-1.5">
              <Stat label="Average a day" value={formatPesoWhole(patterns.perDay)} sub={`across ${s.day} ${s.day === 1 ? "day" : "days"}`} />
              <Stat
                label="Essentials vs extras"
                value={
                  <span className="flex h-5 items-center">
                    <span className="flex h-1 w-full overflow-hidden rounded-sm bg-track">
                      <span className="bg-primary" style={{ width: `${needsShare * 100}%` }} />
                      <span className="bg-muted-foreground" style={{ width: `${wantsShare * 100}%` }} />
                    </span>
                  </span>
                }
                sub={`Essentials ${pct(needsShare)} · Extras ${pct(wantsShare)}`}
              />
              {patterns.busiest && <Stat label="Most spent in a day" value={formatPeso(patterns.busiest.total)} sub={shortDate(patterns.busiest.date)} />}
              {patterns.largest && (
                <Stat label="Biggest purchase" value={formatPeso(patterns.largest.amount)} sub={`${capitalize(patterns.largest.note || CATEGORIES[patterns.largest.category])} · ${shortDate(patterns.largest.date)}`} />
              )}
            </div>
            {(patterns.weekdayDays > 0 || patterns.weekendDays > 0) && (
              <p className="text-[11px] text-muted-foreground tabular-nums">
                On extras you spend about {formatPesoWhole(patterns.weekdayAvg)} a day on weekdays and {formatPesoWhole(patterns.weekendAvg)} on weekends. {patterns.noSpend}{" "}
                {patterns.noSpend === 1 ? "day" : "days"} with no spending.
              </p>
            )}
          </Card>
        )}

        {current && data.entries.length > 0 && (
          <Card className="gap-1 px-3">
            <SectionTitle>Bills that repeat</SectionTitle>
            {bills.length ? (
              <ul className="divide-y divide-border">
                {bills.map((b) => (
                  <li key={b.item} className="flex min-h-9 items-center gap-2 text-sm">
                    {b.paid ? <RepeatIcon className="size-3.5 shrink-0 text-faint" /> : <CalendarIcon className="size-3.5 shrink-0 text-primary" />}
                    <span className="min-w-0 flex-1 truncate">{capitalize(b.item)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{b.paid ? `next ${shortDate(b.due)}` : b.due < today ? "usually paid by now" : `due around ${shortDate(b.due)}`}</span>
                    <span className="w-[4.5rem] shrink-0 text-right font-medium tabular-nums">{formatPesoWhole(b.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-1 text-sm text-muted-foreground">
                {firstEntry > shiftMonth(month, -2) ? "Tally spots bills that come every month once it has seen two months of entries." : "No bills that come every month yet."}
              </p>
            )}
          </Card>
        )}

        {(s.spent > 0 || data.budget > 0) && (
          <Card className="gap-1.5 px-3">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle>Spending vs budget</SectionTitle>
              <span className="flex shrink-0 items-center gap-2.5 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span aria-hidden className="h-0.5 w-3 bg-[var(--chart-spent)]" />
                  Spent
                </span>
                {data.budget > 0 && (
                  <span className="flex items-center gap-1">
                    <span aria-hidden className="w-3 border-t-2 border-dashed border-[var(--chart-pace)]" />
                    Budget line
                  </span>
                )}
              </span>
            </div>
            {data.budget > 0 && <p className="-mt-1 text-[11px] text-faint">Stay under the dotted line to finish the month within budget.</p>}
            <ChartContainer config={paceChart} className="aspect-auto h-32 w-full">
              <ComposedChart data={paceData} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                <defs>
                  <linearGradient id="spent-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-spent)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-spent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" ticks={[1, 8, 15, 22, s.days]} interval={0} tickLine={false} axisLine={false} tickMargin={4} />
                <YAxis hide domain={[0, top]} />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, payload) => `${monthShort} ${payload?.[0]?.payload?.day ?? ""}`} formatter={pesoRow(paceChart)} />} />
                {data.budget > 0 && <Line dataKey="pace" type="linear" stroke="var(--color-pace)" strokeWidth={1.5} strokeDasharray="3 4" dot={false} activeDot={false} />}
                <Area dataKey="spent" type="linear" stroke="var(--color-spent)" strokeWidth={2} fill="url(#spent-fill)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} />
                {current && last > 0 && <ReferenceDot x={last} y={s.cumulative[last - 1] / 100} r={4} fill="var(--color-spent)" stroke="var(--card)" strokeWidth={2} />}
              </ComposedChart>
            </ChartContainer>
          </Card>
        )}

        <Card className="gap-1 px-3">
          <SectionTitle>Where it went</SectionTitle>
          {details.length ? (
            <ul className="divide-y divide-border">
              {details.map((c) => (
                <li key={c.category}>
                  <details className="group">
                    <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 text-sm [&::-webkit-details-marker]:hidden">
                      <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: categoryColor(c.category) }} />
                      <span className="w-[7.25rem] shrink-0 truncate">
                        {CATEGORIES[c.category]} <span className="text-faint tabular-nums">{pct(c.share)}</span>
                      </span>
                      <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-sm bg-track">
                        <span className="block h-full bg-[var(--chart-spent)]" style={{ width: `${(c.total / details[0].total) * 100}%` }} />
                      </span>
                      <span className="w-[4.5rem] shrink-0 text-right font-medium tabular-nums">{formatPeso(c.total)}</span>
                      <DownIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="space-y-1 pb-2 pl-4 text-xs text-muted-foreground">
                      <p className="tabular-nums">
                        {c.count} {c.count === 1 ? "purchase" : "purchases"} · about {formatPesoWhole(c.average)} each
                      </p>
                      {c.change === null ? (
                        <p>No spending here by this time in {prevName}.</p>
                      ) : (
                        <p className={cn("flex items-center gap-1 tabular-nums", c.change > 0 ? "text-over" : "text-income")}>
                          {c.change > 0 ? <TrendUpIcon className="size-3 shrink-0" /> : <TrendDownIcon className="size-3 shrink-0" />}
                          {pct(Math.abs(c.change))} {c.change > 0 ? "more" : "less"} than by this time in {prevName} ({formatPesoWhole(c.before)})
                        </p>
                      )}
                      <ul className="space-y-0.5">
                        {c.top.map((item) => (
                          <li key={item.item} className="flex justify-between gap-2 text-foreground/85 tabular-nums">
                            <span className="truncate">
                              {capitalize(item.item)}
                              {item.count > 1 && <span className="text-muted-foreground"> · {item.count}×</span>}
                            </span>
                            <span>{formatPeso(item.total)}</span>
                          </li>
                        ))}
                      </ul>
                      <p>
                        Biggest purchase: {capitalize(c.biggest.note || CATEGORIES[c.biggest.category])}, {formatPeso(c.biggest.amount)} on {shortDate(c.biggest.date)}
                      </p>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-1 text-sm text-muted-foreground">No spending logged {when}.</p>
          )}
        </Card>

        <Card className="gap-1.5 px-3">
          <SectionTitle>Last 6 months</SectionTitle>
          {hasTrend ? (
            <ChartContainer config={trendChart} className="aspect-auto h-40 w-full">
              <BarChart data={trend} barGap={2} barCategoryGap="24%" margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={4} />
                <YAxis hide />
                <ChartTooltip cursor={{ fill: "var(--track)" }} content={<ChartTooltipContent formatter={pesoRow(trendChart)} />} />
                <ChartLegend verticalAlign="top" content={<ChartLegendContent className="justify-start pb-2 text-[11px] text-muted-foreground" />} />
                <Bar dataKey="income" fill="var(--color-income)" radius={[2, 2, 0, 0]} maxBarSize={14} />
                <Bar dataKey="spent" fill="var(--color-spent)" radius={[2, 2, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="py-1 text-sm text-muted-foreground">This fills in as the months go by.</p>
          )}
        </Card>
      </div>
    </div>
  )
}
