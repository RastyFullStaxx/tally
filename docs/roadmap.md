# Roadmap

Work lands on `rasty/tally-next`, one feature branch (`rasty/tally-<feature>`) at a time. `main` is
production and only the owner merges into it.

When working in an interactive session (not the hourly routine), feature branches stay local: only
`rasty/tally-next` is pushed, so finished work doesn't leave branches behind on GitHub.

## Shipped (on rasty/tally-next)

- 2026-10-30: `npm run e2e` walks the main flows in Chromium at iPhone size (logging, the typo check and Fix, delete
  and Undo, search, CSV export, answering a bill). Playwright stays optional, so `npm ci` and Vercel are unchanged.
- 2026-10-30: The tips (`advise()`) moved to `src/lib/advice.ts` and load with Insights: the launch script drops
  from 155.4 to 147.6 KB gzipped.
- 2026-10-30: Confirm detected bills. Insights asks once per detected bill (Yes / Not a bill); answers live in
  `tally:v1` as an optional `bills` map (owner approved the format change), travel in backups, and "not a
  bill" removes the item from the forecast, safe-to-spend, the day's line and tips. Nothing is ever added.
- 2026-10-30: A steadier month-end forecast. A one-off big buy counts once instead of being projected, and a
  young month leans on the last 4 weeks when most of them were logged. On `npm run eval:forecast` (five
  synthetic people, six months each) the average miss from the 7th falls from 13.8% to 11.1%, the bias from
  +7.1% to +3.7%, and the second week's miss from 19.5% to 14.5%. Weekday weights were tried: no gain.
- 2026-10-30: A likely typo in an amount is caught as it's logged. When a new line is far off what the same
  thing (first word and category, 5+ times in 180 days) usually costs, a notice says so ("₱1,200 for coffee
  is 10× the usual ₱125. An extra zero?") with Fix, which opens the entry.
- 2026-10-30: Category guesses survive typos and short forms. When no word is known and no keyword fits, the
  past notes most alike by their letters vote. On `npm run eval:classifier` (three synthetic personas,
  8,018 expenses, each guessed from the ones before it) accuracy goes from 93.9% to 97.2%, and from 74.4%
  to 88.5% the first time a note is typed. A full kNN did no better. Details in ADR 0002.
- 2026-10-30: Accounts and sync, prepared and off. ADR 0003 sets what any sync must keep (the phone stays the
  source of truth, the origin never changes, per-entry last write wins, tombstones for deletes, an encrypted
  copy) and compares Supabase, Firebase, Auth.js and a Google Drive app folder. `AuthProvider` and
  `SyncAdapter` with local no-op defaults; ··· → Account only when built with `VITE_TALLY_ACCOUNTS=on`.
- 2026-10-30: Export for spreadsheets (··· menu). Every entry as a CSV, oldest first: Date, Type, Category,
  Note and Amount as a plain number. UTF-8 with a BOM so Excel shows ₱ and ñ; notes that start like a
  formula are kept as text.
- 2026-10-30: Today's date stays on one line. On a past day in a long month, "30 September" used to wrap at
  390px and below, and the Today button overlapped it at 320px. The month now goes short ("30 Sept") only
  when the buttons leave too little room; screen readers still hear the full date.
- 2026-10-30: Search and filter. The magnifier at the top of both screens finds entries from any month
  by part of a note, a category name or an exact amount, with category chips (Income and Savings
  included), totals for what matched, and results by month with each month's spending. Tapping a result
  opens it for editing; the search is kept for when you come back.
- 2026-10-30: Undo after delete. Deleting an entry shows "Deleted <note> · ₱<amount>" with Undo for 5 seconds,
  which puts it back with the same id in the same place. The notice area is now a live region that
  stays mounted, so screen readers announce every notice.
- 2026-10-30: Insights and Recharts load on demand. Today's launch JS drops from 263 KB to 151 KB
  gzipped and the large-chunk build warning is gone. The chunk is still precached and fetched on idle,
  with a skeleton while it loads and a Try again (reload) card if it can't be read.

## In progress

- Nothing.

## Next up (ranked)

1. **Sheets on demand (parked).** vaul and the bottom sheets are about 10 KB gzipped of the entry script. Once
   installed, launches read the script from the phone's cache, so this mostly helps the first visit. Measured
   2026-10-30 with Lighthouse (slow 4G, 4× CPU): performance 82–86, accessibility 100, best practices 100;
   preloading the cat image didn't help.

## Owner decisions

- **Merged branches to delete on GitHub.** Each is squashed into `rasty/tally-next` (checked file by file), so
  deleting them loses nothing. This environment's git proxy refuses branch deletions (HTTP 403), so run, from
  a clone of the repo:
  `git push origin --delete rasty/tally-undo-delete rasty/tally-search rasty/tally-narrow-header rasty/tally-csv-export rasty/tally-accounts-seam rasty/tally-classifier-eval rasty/tally-odd-amounts`
- **Accounts and sync (ADR 0003).** First, try Google sign-in in the installed app on the iPhone (Supabase's
  PKCE redirect and Google Identity Services). Then pick the provider (recommended: Supabase, encrypted,
  over plain `fetch`), say yes or no to the format change (tombstones and settings stamps in `tally:v1`),
  and choose between a passphrase-encrypted copy and plain JSON.
- Other product decisions: per-category budgets would need new fields in `tally:v1`; ask here first.
