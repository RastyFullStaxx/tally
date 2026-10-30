import { Component, lazy, Suspense, type ComponentProps, type ReactNode } from "react"

import { loadInsights } from "@/screens/insights-chunk"
import { AlertIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { monthName, monthOf, toDate } from "@/lib/dates"

type Props = ComponentProps<typeof import("@/screens/Insights").Insights>

const Screen = lazy(() => loadInsights().then((m) => ({ default: m.Insights })))

/** The Insights header without its controls, so the month title doesn't jump when the chunk lands. */
function Shell({ today, menu, children }: { today: string; menu: ReactNode; children: ReactNode }) {
  const month = monthOf(today)
  return (
    <div className="flex flex-col">
      <header className="flex items-end justify-between gap-3 pt-4 pr-2 pb-2 pl-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{toDate(month).getFullYear()}</p>
          <h1 className="text-[1.375rem] leading-tight font-semibold tracking-[-0.01em]">{monthName(month)}</h1>
        </div>
        <div className="flex items-center gap-0.5">{menu}</div>
      </header>
      <div className="flex flex-col gap-2 px-2">{children}</div>
    </div>
  )
}

function Loading({ today, menu }: { today: string; menu: ReactNode }) {
  return (
    <Shell today={today} menu={menu}>
      <span className="sr-only" role="status">
        Loading Insights…
      </span>
      {[132, 176, 96].map((height) => (
        <Card key={height} aria-hidden className="animate-pulse motion-reduce:animate-none" style={{ height }} />
      ))}
    </Shell>
  )
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** Insights, loaded on demand, with a skeleton while it loads and a reload if the chunk can't be read. */
export function LazyInsights(props: Props) {
  return (
    <Boundary
      fallback={
        <Shell today={props.today} menu={props.menu}>
          <Card role="alert" className="items-start gap-2 px-3">
            <p className="flex items-center gap-2 text-sm">
              <AlertIcon className="size-4 shrink-0 text-over" />
              Couldn't open Insights. Your entries are safe.
            </p>
            {/* Browsers remember a failed module import for the life of the page, so only a reload retries it.
                Entries are already saved; the service worker serves the reload from its cache. */}
            <Button variant="secondary" size="sm" onClick={() => location.reload()}>
              Try again
            </Button>
          </Card>
        </Shell>
      }
    >
      <Suspense fallback={<Loading today={props.today} menu={props.menu} />}>
        <Screen {...props} />
      </Suspense>
    </Boundary>
  )
}
