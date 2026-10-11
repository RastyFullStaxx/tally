import { useEffect, useState } from "react"
import { Alert02Icon, ChartBarLineIcon, NotebookIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { cn } from "cn"

import { EntryDrawer } from "@/components/EntryDrawer"
import { Insights } from "@/components/Insights"
import { Today } from "@/components/Today"
import { localDate, type Data, type Entry } from "@/lib/ledger"
import { load, save } from "@/lib/store"

const TABS = [
  { id: "today", label: "Today", icon: NotebookIcon },
  { id: "insights", label: "Insights", icon: ChartBarLineIcon },
] as const

/** Follows the clock, including when iOS resumes the app from the background the next morning. */
function useToday() {
  const [today, setToday] = useState(() => localDate())
  useEffect(() => {
    const check = () => setToday(localDate())
    document.addEventListener("visibilitychange", check)
    return () => document.removeEventListener("visibilitychange", check)
  }, [])
  return today
}

export default function App() {
  const today = useToday()
  const [data, setData] = useState(load)
  const [saved, setSaved] = useState(true)
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("today")
  const [editing, setEditing] = useState<{ entry: Entry; key: number } | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const commit = (next: Data) => {
    setData(next)
    setSaved(save(next))
  }
  const upsert = (entry: Entry) =>
    commit({
      ...data,
      entries: data.entries.some((e) => e.id === entry.id) ? data.entries.map((e) => (e.id === entry.id ? entry : e)) : [...data.entries, entry],
    })
  const remove = (id: string) => commit({ ...data, entries: data.entries.filter((e) => e.id !== id) })
  const edit = (entry: Entry) => {
    setEditing({ entry, key: Date.now() })
    setDrawerOpen(true)
  }

  return (
    <div className="mx-auto min-h-svh max-w-md pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+4rem)]">
      {!saved && (
        <p role="alert" className="sticky top-[env(safe-area-inset-top)] z-30 mx-3 mt-2 flex items-center gap-2 rounded-md bg-over/15 px-3 py-2 text-sm text-over backdrop-blur-md">
          <HugeiconsIcon icon={Alert02Icon} className="size-4 shrink-0" aria-hidden />
          Couldn't save. Export a backup from Insights.
        </p>
      )}

      {/* Today stays mounted so a half-typed line survives a tab switch; Insights (and its charts) only exists while open. */}
      <main hidden={tab !== "today"} className="animate-in duration-300 fade-in-0 motion-reduce:animate-none">
        <Today data={data} today={today} onAdd={upsert} onEdit={edit} />
      </main>
      {tab === "insights" && (
        <main className="animate-in duration-300 fade-in-0 motion-reduce:animate-none">
          <Insights data={data} today={today} onBudget={(budget) => commit({ ...data, budget })} onImport={commit} />
        </main>
      )}

      <nav aria-label="Screens" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-raised pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-md grid-cols-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={cn(
                "flex h-11 items-center justify-center gap-1.5 border-t-2 text-[13px] font-medium transition-colors duration-150",
                tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground active:bg-white/[0.04]"
              )}
            >
              <HugeiconsIcon icon={t.icon} className={cn("size-4", tab === t.id && "text-primary")} aria-hidden />
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <EntryDrawer editing={editing} open={drawerOpen} onOpenChange={setDrawerOpen} onSave={upsert} onDelete={remove} />
    </div>
  )
}
