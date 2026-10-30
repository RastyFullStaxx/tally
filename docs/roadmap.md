# Roadmap

Work lands on `rasty/tally-next`, one feature branch (`rasty/tally-<feature>`) at a time. `main` is
production and only the owner merges into it.

## Shipped (on rasty/tally-next)

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

- **ADR 0003, accounts and sync, prepared and off** (`rasty/tally-accounts-seam`, started 2026-10-30 15:10 UTC)
  - [ ] `docs/adr/0003-accounts-and-sync.md`: guarantees any sync must keep, the merge rules (per-entry last
        write wins, tombstones), Supabase / Firebase / Auth.js / Google Drive app folder, recommendation,
        owner decisions, future env vars, sources
  - [ ] `src/lib/sync.ts`: `AuthProvider`, `SyncAdapter`, local no-op defaults; `src/lib/flags.ts`:
        `accountsEnabled` from `VITE_TALLY_ACCOUNTS`, off unless `on`; `.env.example`
  - [ ] ··· → Account sheet, only with the flag on; says sign-in isn't connected while the provider is local
  - [ ] `tests/sync.test.ts` in `npm test`; build with the flag off has no Account item; with it on, the sheet
        renders; gate; merge

## Next up (ranked)

1. **ADR 0003, accounts and sync (prepared, off).** Compare Supabase, Firebase, and Auth.js with a small
   backend; data ownership; merging with `tally:v1`; why the origin never changes. Then an
   `AuthProvider`/`SyncAdapter` seam with a local no-op default and a flagged-off sign-in screen.
2. **Confirm detected bills.** `recurringBills()` finds them; let the user confirm or dismiss each one.
   Detected bills are never added on their own. (Storing confirmations changes the data format, so
   see Owner decisions.)
3. **Category prediction quality.** Measure the Naive Bayes model's held-out accuracy on synthetic and
   real-shaped entries, and compare a kNN over merchant text before changing anything.
4. **Anomaly flags and a seasonality-aware forecast** in `insights.ts`, advising only on the days ahead.
5. **Bundle, round two.** Radix and vaul in the entry chunk; check whether the sheets (help, category
   guide) can load on demand too.

## Owner decisions

- **Merged branches to delete on GitHub:** `rasty/tally-undo-delete`, `rasty/tally-search`,
  `rasty/tally-narrow-header` and `rasty/tally-csv-export`. All are fully merged into `rasty/tally-next`; this environment's git proxy drops
  branch deletions, so they couldn't be removed from here.
- No product decisions waiting yet. Per-category budgets and confirmed bills both need new fields in `tally:v1`; they
  will be asked here before either is built.
