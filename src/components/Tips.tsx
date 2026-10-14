import { Mascot } from "@/components/Mascot"

import { cn } from "cn"

import { AlertIcon, ArrowRightIcon, BulbIcon, CheckCircleIcon, ThumbDownIcon, ThumbUpIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import type { Tip } from "@/lib/insights"
import type { TipVote } from "@/lib/ledger"

export const TONE = {
  warn: { icon: AlertIcon, className: "text-over" },
  tip: { icon: BulbIcon, className: "text-primary" },
  good: { icon: CheckCircleIcon, className: "text-income" },
}

type Props = { tips: Tip[]; votes?: TipVote[]; onVote: (tip: Tip, vote: 1 | -1) => void }

/** The "What to do" list. Helpful / Not helpful teaches Tally which kinds of tips to show you. */
export function Tips({ tips, votes = [], onVote }: Props) {
  if (!tips.length) return <div className="flex items-center gap-3 py-1"><Mascot pose="thinking" size={64} /><p className="text-sm text-muted-foreground">Log a few days of spending and tips will show up here.</p></div>
  const voted = new Map(votes.map((v) => [v.id, v.vote]))
  return (
    <ul className="divide-y divide-border">
      {tips.map((tip) => {
        const tone = TONE[tip.tone]
        const helpful = voted.get(tip.id) === 1
        return (
          <li key={tip.id} className="flex gap-2 py-2">
            <tone.icon className={cn("mt-0.5 size-3.5 shrink-0", tone.className)} />
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-[13px] leading-snug font-medium">{tip.title}</p>
              <p className="text-xs leading-snug text-muted-foreground">{tip.why}</p>
              <p className="flex gap-1 text-xs leading-snug">
                <ArrowRightIcon className="mt-px size-3 shrink-0 text-primary" />
                <span>{tip.action}</span>
              </p>
            </div>
            <div className="-mr-1 flex shrink-0 flex-col">
              <Button variant="ghost" size="icon-sm" aria-label="Helpful" aria-pressed={helpful} onClick={() => onVote(tip, 1)} className={cn("size-7 text-faint", helpful && "text-primary")}>
                <ThumbUpIcon className="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Not helpful" onClick={() => onVote(tip, -1)} className="size-7 text-faint">
                <ThumbDownIcon className="size-3.5" />
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
