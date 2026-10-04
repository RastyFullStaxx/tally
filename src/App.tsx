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
    <div className="mx-auto min-h-svh max-w-md pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+6.5rem)]">
      {!saved && (
        <p role="alert" className="sticky top-[env(safe-area-inset-top)] z-30 mx-4 mt-3 flex items-center gap-2 rounded-2xl bg-over/15 px-4 py-3 text-sm text-over backdrop-blur-md">
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

      <nav aria-label="Screens" className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 flex justify-center">
        <div className="pointer-events-auto flex gap-1 rounded-full border border-white/[0.08] bg-raised/85 p-1.5 shadow-xl shadow-black/40 backdrop-blur-xl">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-2 rounded-full px-5 text-sm font-medium text-muted-foreground transition-colors duration-200",
                tab === t.id ? "bg-primary text-primary-foreground" : "active:bg-white/[0.06]"
              )}
            >
              <HugeiconsIcon icon={t.icon} className="size-[18px]" aria-hidden />
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <EntryDrawer editing={editing} open={drawerOpen} onOpenChange={setDrawerOpen} onSave={upsert} onDelete={remove} />
    </div>
  )
}
