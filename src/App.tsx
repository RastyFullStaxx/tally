import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { cn } from "cn"

import { AppMenu, useInstall, useUpdates, type Sheet } from "@/components/AppMenu"
import { EntryDrawer } from "@/components/EntryDrawer"
import { AlertIcon, ChartIcon, NotebookIcon, SearchIcon } from "@/components/icons"
import { AnimatedTally } from "@/components/AnimatedTally"
import { loadInsights, preloadInsightsWhenIdle } from "@/components/insights-chunk"
import { LazyInsights } from "@/components/LazyInsights"
import { SearchSheet } from "@/components/SearchSheet"
import { Sheets } from "@/components/Sheets"
import { Today } from "@/components/Today"
import { Button } from "@/components/ui/button"
import { addVote, describeOddAmount, tipFeatures, unusualAmount, type Tip } from "@/lib/insights"
import { formatPeso, localDate, removeEntry, restoreEntry, type Data, type Entry, type Filter, type Removed } from "@/lib/ledger"
import { exportBackup, exportCsv, helpSeen, importBackup, load, markHelpSeen, save } from "@/lib/store"

const TABS = [
  { id: "today", label: "Today", icon: NotebookIcon },
  { id: "insights", label: "Insights", icon: ChartIcon },
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

// Clock readings happen out here, away from render.
const keyed = <T,>(value: T) => ({ ...value, key: Date.now() })

/**
 * A short message above the tab bar. A delete's carries what Undo puts back; an odd amount's carries the id Fix
 * opens. Data, not callbacks, so the button acts on the entries as they are when it's tapped.
 */
type Notice = { text: string; undo?: Removed; fix?: string }

const ACTION = "h-11 shrink-0 rounded-sm px-4 font-medium text-primary active:bg-primary/10"

export default function App() {
  const today = useToday()
  const updates = useUpdates()
  const install = useInstall()
  const [data, setData] = useState(load)
  const [saved, setSaved] = useState(true)
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("today")
  const [editing, setEditing] = useState<{ entry: Entry; key: number } | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // A phone's first launch (nothing logged, never shown) opens How to use by itself. After that it's in ···.
  const [sheet, setSheet] = useState<{ kind: Sheet; key: number } | null>(() => (data.entries.length === 0 && !helpSeen() ? { kind: "help", key: 0 } : null))
  const [sheetOpen, setSheetOpen] = useState(() => sheet !== null)
  const [notice, setNotice] = useState<Notice | null>(null)
  // Search keeps what was typed and the filter after it closes, so editing a result and coming back finds the same list.
  const [search, setSearch] = useState<{ open: boolean; query: string; filter: Filter }>({ open: false, query: "", filter: "all" })
  const fileInput = useRef<HTMLInputElement>(null)
  const [typing, setTyping] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importSuccess, setImportSuccess] = useState(false)
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const importLock = useRef(false)
  const [animateTally, setAnimateTally] = useState(() => {
    try { return localStorage.getItem("tally:animate-mascot") !== "off" } catch { return false }
  })
  useEffect(() => () => { if (successTimer.current) clearTimeout(successTimer.current) }, [])
  useEffect(preloadInsightsWhenIdle, [])
  const toggleAnimation = () => {
    const next = !animateTally
    setAnimateTally(next)
    try { localStorage.setItem("tally:animate-mascot", next ? "on" : "off") } catch { /* Session preference still works. */ }
  }

  const commit = (next: Data) => {
    setData(next)
    const stored = save(next)
    setSaved(stored)
    return stored
  }
  const upsert = (entry: Entry) =>
    commit({
      ...data,
      entries: data.entries.some((e) => e.id === entry.id) ? data.entries.map((e) => (e.id === entry.id ? entry : e)) : [...data.entries, entry],
    })
  // A new line (not an edit) whose amount is far off its usual is most likely a typo: say so, with Fix.
  const add = (entry: Entry) => {
    upsert(entry)
    const odd = unusualAmount(data.entries, entry)
    if (odd) show({ text: describeOddAmount(odd, entry.amount), fix: entry.id }, 6000)
  }
  const fix = (id: string) => {
    const entry = data.entries.find((e) => e.id === id)
    setNotice(null)
    if (entry) edit(entry)
  }
  const remove = (id: string) => {
    const { data: next, removed } = removeEntry(data, id)
    if (!removed) return
    commit(next)
    const { note, amount } = removed.entry
    show({ text: `Deleted ${note ? `${note} · ` : ""}${formatPeso(amount)}`, undo: removed }, 5000)
  }
  const undo = (removed: Removed) => {
    commit(restoreEntry(data, removed))
    setNotice(null)
  }
  const edit = (entry: Entry) => {
    setEditing(keyed({ entry }))
    setDrawerOpen(true)
  }
  const open = (kind: Sheet) => {
    setSheet(keyed({ kind }))
    setSheetOpen(true)
  }
  // The newest notice replaces the one showing, and each timer only clears its own.
  const show = (next: Notice, ms = 4000) => {
    setNotice(next)
    setTimeout(() => setNotice((shown) => (shown === next ? null : shown)), ms)
  }
  const say = (text: string) => show({ text })
  const vote = (tip: Tip, value: 1 | -1) => {
    commit({ ...data, votes: addVote(data.votes, { id: tip.id, kind: tip.kind, vote: value, at: Date.now(), features: tipFeatures(data.entries, data.budget, today) }) })
    say(value > 0 ? "Thanks. Tally will show more tips like this." : "Got it. Fewer tips like this.")
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || importLock.current) return
    importLock.current = true
    setImporting(true)
    setImportSuccess(false)
    try {
      const { data: merged, added, skipped } = await importBackup(file, data)
      if (commit(merged)) {
        setImportSuccess(true)
        if (successTimer.current) clearTimeout(successTimer.current)
        successTimer.current = setTimeout(() => setImportSuccess(false), 1000)
      }
      say(`Imported ${added} ${added === 1 ? "entry" : "entries"}${skipped ? `, skipped ${skipped} unreadable` : ""}.`)
    } catch (error) {
      say((error as Error).message)
    } finally {
      importLock.current = false
      setImporting(false)
    }
  }

  const menu = <AppMenu updates={updates} install={install} onOpen={open} onExport={() => exportBackup(data)} onExportCsv={() => exportCsv(data)} onImport={() => fileInput.current?.click()} say={say} animateTally={animateTally} onToggleAnimation={toggleAnimation} />

  return (
    <div className="mx-auto min-h-svh max-w-md pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+4rem)]"
      onFocusCapture={(event) => setTyping(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)}
      onBlurCapture={() => setTyping(false)}>
      {!saved && (
        <p role="alert" className="sticky top-[env(safe-area-inset-top)] z-30 mx-3 mt-2 flex items-center gap-2 rounded-md bg-over/15 px-3 py-2 text-sm text-over backdrop-blur-md">
          <AlertIcon className="size-4 shrink-0" />
          Couldn't save. Export a backup from the ··· menu.
        </p>
      )}
      {/* The live region stays mounted, so screen readers announce each notice as it appears. */}
      <div role="status" className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+3.5rem)] z-50 mx-auto max-w-md">
        {notice && (
          <div className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-raised py-1 pl-3 text-sm shadow-lg animate-in duration-200 fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none">
            <span className={cn("min-w-0 flex-1 py-1", notice.undo ? "truncate" : !notice.fix && "pr-3")}>{notice.text}</span>
            {notice.fix && (
              <button type="button" onClick={() => fix(notice.fix!)} className={ACTION}>
                Fix
              </button>
            )}
            {notice.undo && (
              <button type="button" onClick={() => undo(notice.undo!)} className={ACTION}>
                Undo
              </button>
            )}
          </div>
        )}
      </div>

      {/* Search sits up here, on both screens, where it doesn't crowd the date on a narrow phone. */}
      <div className="flex items-center justify-between gap-2 pt-1 pr-2 pl-3">
        <AnimatedTally
          key={importing || updates.checking || updates.downloading ? "working" : importSuccess ? "success" : "idle"}
          activity={importing || updates.checking || updates.downloading ? "working" : importSuccess ? "success" : "idle"}
          statusText={importing ? "Importing backup…" : updates.downloading ? "Downloading update…" : updates.checking ? (updates.ready ? "Applying update…" : "Checking updates…") : importSuccess ? "Backup imported." : updates.ready ? "Update ready." : ""}
          paused={typing || sheetOpen || drawerOpen || search.open}
          enabled={animateTally}
        />
        <Button variant="ghost" size="icon-lg" aria-label="Search entries" aria-haspopup="dialog" onClick={() => setSearch((s) => ({ ...s, open: true }))}>
          <SearchIcon className="size-4" />
        </Button>
      </div>

      {/* Today stays mounted so a half-typed line survives a tab switch; Insights (and its charts, a separate chunk) only exists while open. */}
      <main hidden={tab !== "today"} className="animate-in duration-300 fade-in-0 motion-reduce:animate-none">
        <Today data={data} today={today} menu={menu} onAdd={add} onEdit={edit} onEditBudget={() => open("budget")} />
      </main>
      {tab === "insights" && (
        <main className="animate-in duration-300 fade-in-0 motion-reduce:animate-none">
          <LazyInsights data={data} today={today} menu={menu} onEditBudget={() => open("budget")} onEditGoal={() => open("goal")} onVote={vote} />
        </main>
      )}

      <nav aria-label="Screens" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-raised pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-md grid-cols-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
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

      <input ref={fileInput} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden onChange={handleImport} />
      <SearchSheet
        open={search.open}
        onOpenChange={(open) => setSearch((s) => ({ ...s, open }))}
        entries={data.entries}
        query={search.query}
        onQuery={(query) => setSearch((s) => ({ ...s, query }))}
        filter={search.filter}
        onFilter={(filter) => setSearch((s) => ({ ...s, filter }))}
        onPick={(entry) => {
          setSearch((s) => ({ ...s, open: false }))
          edit(entry)
        }}
      />
      <EntryDrawer editing={editing} open={drawerOpen} onOpenChange={setDrawerOpen} onSave={upsert} onDelete={remove} />
      <Sheets
        sheet={sheet}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open)
          if (!open && sheet?.kind === "help") markHelpSeen()
        }}
        budget={data.budget}
        goal={data.goal}
        onBudget={(budget) => commit({ ...data, budget })}
        onGoal={(goal) => commit({ ...data, goal })}
      />
    </div>
  )
}
