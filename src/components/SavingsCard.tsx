import { Mascot } from "@/components/Mascot"

import { PencilIcon, TargetIcon } from "@/components/icons"
import { SectionTitle } from "@/components/section"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { Savings } from "@/lib/insights"
import { formatPeso, formatPesoWhole } from "@/lib/format"

/** Money set aside (not spent, not income), and how close the goal is. */
export function SavingsCard({ savings, onEditGoal }: { savings: Savings; onEditGoal: () => void }) {
  const goal = savings.goal
  const empty = savings.total === 0 && savings.thisMonth === 0
  return (
    <Card className="gap-1.5 px-3">
      <div className="flex items-center justify-between">
<div className="flex items-center gap-2"><Mascot pose={goal?.left === 0 ? "celebration" : "saving"} size={64} /><SectionTitle>Savings</SectionTitle></div>
        <Button variant="ghost" size="icon-sm" aria-label={goal ? "Edit savings goal" : "Set a savings goal"} onClick={onEditGoal} className="-my-1 size-7 text-muted-foreground">
          <PencilIcon className="size-3.5" />
        </Button>
      </div>
      {empty && !goal ? (
        <p className="text-sm text-muted-foreground">
          Type <span className="font-medium text-foreground">save 2000</span> to set money aside. It won't count as spending.
        </p>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[1.375rem] leading-tight font-semibold tracking-[-0.01em]">{formatPeso(savings.total)}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {savings.thisMonth ? `${savings.thisMonth > 0 ? "+" : ""}${formatPeso(savings.thisMonth)} this month` : "Nothing added this month"}
            </span>
          </div>
          {goal ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1 truncate">
                  <TargetIcon className="size-3.5 shrink-0 text-savings" />
                  {goal.name}
                </span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {formatPeso(Math.max(0, savings.total))} of {formatPeso(goal.amount)}
                </span>
              </div>
              <div role="meter" aria-label={`${goal.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(goal.progress * 100)} className="h-1 rounded-sm bg-track">
                <div className="h-full rounded-sm bg-savings" style={{ width: `${goal.progress * 100}%` }} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {goal.left === 0 ? "Goal reached." : goal.eta ? `At about ${formatPesoWhole(savings.monthlyAvg)} a month, you'll reach it by ${goal.eta}.` : "Put something aside this month to see when you'll reach it."}
              </p>
            </div>
          ) : (
            <Button variant="secondary" size="sm" className="self-start" onClick={onEditGoal}>
              Set a savings goal
            </Button>
          )}
        </>
      )}
    </Card>
  )
}
