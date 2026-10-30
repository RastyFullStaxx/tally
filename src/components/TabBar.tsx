import { cn } from "cn"

import { ChartIcon, NotebookIcon } from "@/components/icons"
import { loadInsights } from "@/screens/insights-chunk"

const TABS = [
  { id: "today", label: "Today", icon: NotebookIcon },
  { id: "insights", label: "Insights", icon: ChartIcon },
] as const

export type Tab = (typeof TABS)[number]["id"]

/** The docked tab bar at the bottom of both screens. */
export function TabBar({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  return (
    <nav aria-label="Screens" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-raised pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid max-w-md grid-cols-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTab(t.id)}
            // A touch lands before the click, which gives the chunk a head start if idle preloading hasn't run.
            onPointerDown={t.id === "insights" ? () => void loadInsights().catch(() => {}) : undefined}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "flex h-11 items-center justify-center gap-1.5 border-t-2 text-[13px] font-medium transition-colors duration-150",
              tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground active:bg-white/[0.04]"
            )}
          >
            <t.icon className={cn("size-4", tab === t.id && "text-primary")} />
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
