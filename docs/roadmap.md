# Roadmap

Work lands on `rasty/tally-next`, one feature branch (`rasty/tally-<feature>`) at a time. `main` is
production and only the owner merges into it.

## Shipped (on rasty/tally-next)

- 2026-10-30: Undo after delete. Deleting an entry shows "Deleted <note> · ₱<amount>" with Undo for 5 seconds,
  which puts it back with the same id in the same place. The notice area is now a live region that
  stays mounted, so screen readers announce every notice.
- 2026-10-30: Insights and Recharts load on demand. Today's launch JS drops from 263 KB to 151 KB
  gzipped and the large-chunk build warning is gone. The chunk is still precached and fetched on idle,
  with a skeleton while it loads and a Try again (reload) card if it can't be read.

## In progress

- **Search and filter entries** (`rasty/tally-search`, started 2026-10-30 14:05 UTC)
  - [ ] `searchEntries(entries, query, filter)` and `totalsOf(entries)` in `ledger.ts`: every typed word
        must match the note (substring, accents ignored), the category name (prefix) or the amount
        (`245`, `₱245`, `1,250`, `1k`); newest first
  - [ ] Tests in `tests/ledger.test.ts`
  - [ ] `SearchIcon`, `CloseIcon` in `scripts/icons.mjs` and `icons.tsx` (MingCute `search-line`,
        `close-line`; api.iconify.design is blocked here, so bodies come from `@iconify-json/mingcute`)
  - [ ] `SearchSheet.tsx`: input with clear, filter chips (All, 8 categories, Income, Savings), totals
        line, results grouped by month with the month's spending, 36px rows, newest 150 rows shown
  - [ ] Search button in the Today header; tapping a result closes search and opens the edit drawer;
        the query and filter survive, so reopening search returns to the same results
  - [ ] README + How to use mention it; gate; browser check at phone width; merge

## Next up (ranked)

2. **ADR 0003, accounts and sync (prepared, off).** Compare Supabase, Firebase, and Auth.js with a small
   backend; data ownership; merging with `tally:v1`; why the origin never changes. Then an
   `AuthProvider`/`SyncAdapter` seam with a local no-op default and a flagged-off sign-in screen.
3. **Confirm detected bills.** `recurringBills()` finds them; let the user confirm or dismiss each one.
   Detected bills are never added on their own. (Storing confirmations changes the data format, so
   see Owner decisions.)
4. **CSV export** next to the JSON backup, for spreadsheets.
5. **Category prediction quality.** Measure the Naive Bayes model's held-out accuracy on synthetic and
   real-shaped entries, and compare a kNN over merchant text before changing anything.
6. **Anomaly flags and a seasonality-aware forecast** in `insights.ts`, advising only on the days ahead.
7. **Bundle, round two.** Radix and vaul in the entry chunk; check whether the sheets (help, category
   guide) can load on demand too.

## Owner decisions

- None waiting yet. Per-category budgets and confirmed bills both need new fields in `tally:v1`; they
  will be asked here before either is built.
