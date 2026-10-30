import { useEffect, useState } from "react"

import { AnimatedTally } from "@/components/AnimatedTally"
import { AppMenu, useInstall, useUpdates, type Sheet } from "@/components/AppMenu"
import { EntryDrawer } from "@/sheets/EntryDrawer"
import { AlertIcon, SearchIcon } from "@/components/icons"
import { preloadInsightsWhenIdle } from "@/screens/insights-chunk"
import { LazyInsights } from "@/screens/LazyInsights"
import { NoticeBar } from "@/components/NoticeBar"
import { SearchSheet } from "@/sheets/SearchSheet"
import { Sheets } from "@/sheets/Sheets"
import { TabBar, type Tab } from "@/components/TabBar"
import { Today } from "@/screens/Today"
import { Button } from "@/components/ui/button"
import { useImport } from "@/hooks/useImport"
import { useLedger } from "@/hooks/useLedger"
import { useNotice } from "@/hooks/useNotice"
import { useToday } from "@/hooks/useToday"
import { formatPeso } from "@/lib/format"
import { addVote, describeOddAmount, tipFeatures, unusualAmount, type Tip } from "@/lib/insights"
import { removeEntry, restoreEntry, upsertEntry, withBill, type Filter } from "@/lib/ledger"
import type { Entry } from "@/lib/model"
import { animateMascot, exportBackup, exportCsv, helpSeen, markHelpSeen, saveTheme, savedTheme, setAnimateMascot } from "@/lib/store"
import { switchTheme, type Theme } from "@/lib/theme"

// Clock readings happen out here, away from render.
const keyed = <T,>(value: T) => ({ ...value, key: Date.now() })

export default function App() {
  const today = useToday()
  const updates = useUpdates()
  const install = useInstall()
  const { data, saved, commit } = useLedger()
  const { notice, show, say, clear } = useNotice()
  const backup = useImport(data, commit, say)
  const [tab, setTab] = useState<Tab>("today")
  const [editing, setEditing] = useState<{ entry: Entry; key: number } | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // A phone's first launch (nothing logged, never shown) opens How to use by itself. After that it's in ···.
  const [sheet, setSheet] = useState<{ kind: Sheet; key: number } | null>(() => (data.entries.length === 0 && !helpSeen() ? { kind: "help", key: 0 } : null))
  const [sheetOpen, setSheetOpen] = useState(() => sheet !== null)
  // Search keeps what was typed and the filter after it closes, so editing a result and coming back finds the same list.
  const [search, setSearch] = useState<{ open: boolean; query: string; filter: Filter }>({ open: false, query: "", filter: "all" })
  const [typing, setTyping] = useState(false)
  const [animate, setAnimate] = useState(animateMascot)
  const [theme, setTheme] = useState<Theme>(savedTheme)
  useEffect(preloadInsightsWhenIdle, [])

  const edit = (entry: Entry) => {
    setEditing(keyed({ entry }))
    setDrawerOpen(true)
  }
  const open = (kind: Sheet) => {
    setSheet(keyed({ kind }))
    setSheetOpen(true)
  }
  // A new line (not an edit) whose amount is far off its usual is most likely a typo: say so, with Fix.
  const add = (entry: Entry) => {
    commit(upsertEntry(data, entry))
    const odd = unusualAmount(data.entries, entry)
    if (odd) show({ text: describeOddAmount(odd, entry.amount), fix: entry.id }, 6000)
  }
  const remove = (id: string) => {
    const { data: next, removed } = removeEntry(data, id)
    if (!removed) return
    commit(next)
    const { note, amount } = removed.entry
    show({ text: `Deleted ${note ? `${note} · ` : ""}${formatPeso(amount)}`, undo: removed }, 5000)
  }
  const vote = (tip: Tip, value: 1 | -1) => {
    commit({ ...data, votes: addVote(data.votes, { id: tip.id, kind: tip.kind, vote: value, at: Date.now(), features: tipFeatures(data.entries, data.budget, today) }) })
    say(value > 0 ? "Thanks. Tally will show more tips like this." : "Got it. Fewer tips like this.")
  }
  const toggleTheme = (from?: { x: number; y: number }) => {
    const next = theme === "dark" ? "light" : "dark"
    setTheme(next)
    saveTheme(next)
    switchTheme(next, from)
  }
  const toggleAnimation = () => {
    setAnimate(!animate)
    setAnimateMascot(!animate)
  }

  const working = backup.importing || updates.checking || updates.downloading
  const activity = working ? "working" : backup.succeeded ? "success" : "idle"
  const status = backup.importing
    ? "Importing backup…"
    : updates.downloading
      ? "Downloading update…"
      : updates.checking
        ? updates.ready
          ? "Applying update…"
          : "Checking updates…"
        : backup.succeeded
          ? "Backup imported."
          : updates.ready
            ? "Update ready."
            : ""
  const menu = (
    <AppMenu
      updates={updates}
      install={install}
      onOpen={open}
      onExport={() => exportBackup(data)}
      onExportCsv={() => exportCsv(data)}
      onImport={backup.pick}
      say={say}
      animateTally={animate}
      onToggleAnimation={toggleAnimation}
      theme={theme}
      onToggleTheme={toggleTheme}
    />
  )

  return (
    <div
      className="mx-auto min-h-svh max-w-md pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+4rem)]"
      onFocusCapture={(event) => setTyping(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)}
      onBlurCapture={() => setTyping(false)}
    >
      {!saved && (
        <p role="alert" className="sticky top-[env(safe-area-inset-top)] z-30 mx-3 mt-2 flex items-center gap-2 rounded-md bg-over/15 px-3 py-2 text-sm text-over backdrop-blur-md">
          <AlertIcon className="size-4 shrink-0" />
          Couldn't save. Export a backup from the ··· menu.
        </p>
      )}
      <NoticeBar
        notice={notice}
        onFix={(id) => {
          const entry = data.entries.find((e) => e.id === id)
          clear()
          if (entry) edit(entry)
        }}
        onUndo={(removed) => {
          commit(restoreEntry(data, removed))
          clear()
        }}
      />

      {/* Search sits up here, on both screens, where it doesn't crowd the date on a narrow phone. */}
      <div className="flex items-center justify-between gap-2 pt-1 pr-2 pl-3">
        <AnimatedTally key={activity} activity={activity} statusText={status} paused={typing || sheetOpen || drawerOpen || search.open} enabled={animate} />
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
          <LazyInsights
            data={data}
            today={today}
            menu={menu}
            onEditBudget={() => open("budget")}
            onEditGoal={() => open("goal")}
            onVote={vote}
            onBill={(item, decision) => commit(withBill(data, item, decision))}
          />
        </main>
      )}
      <TabBar tab={tab} onTab={setTab} />

      <input {...backup.input} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden />
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
      <EntryDrawer editing={editing} open={drawerOpen} onOpenChange={setDrawerOpen} onSave={(entry) => commit(upsertEntry(data, entry))} onDelete={remove} />
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
