# Roadmap

Work lands on `rasty/tally-next`, one feature branch (`rasty/tally-<feature>`) at a time. `main` is
production and only the owner merges into it.

## Shipped (on rasty/tally-next)

- 2026-10-30: Insights and Recharts load on demand. Today's launch JS drops from 263 KB to 151 KB
  gzipped and the large-chunk build warning is gone. The chunk is still precached and fetched on idle,
  with a skeleton while it loads and a Try again (reload) card if it can't be read.

## In progress

- Nothing.

## Next up (ranked)

1. **Undo after delete.** Deleting an entry in the edit drawer is instant and final. A 5-second
   "Deleted · Undo" notice restores it with the same id.
2. **Search and filter entries.** Find a merchant or note across months, filter by category, and tap a
   result to edit it.
3. **ADR 0003, accounts and sync (prepared, off).** Compare Supabase, Firebase, and Auth.js with a small
   backend; data ownership; merging with `tally:v1`; why the origin never changes. Then an
   `AuthProvider`/`SyncAdapter` seam with a local no-op default and a flagged-off sign-in screen.
4. **Confirm detected bills.** `recurringBills()` finds them; let the user confirm or dismiss each one.
   Detected bills are never added on their own. (Storing confirmations changes the data format, so
   see Owner decisions.)
5. **CSV export** next to the JSON backup, for spreadsheets.
6. **Category prediction quality.** Measure the Naive Bayes model's held-out accuracy on synthetic and
   real-shaped entries, and compare a kNN over merchant text before changing anything.
7. **Anomaly flags and a seasonality-aware forecast** in `insights.ts`, advising only on the days ahead.
8. **Bundle, round two.** Radix and vaul in the entry chunk; check whether the sheets (help, category
   guide) can load on demand too.

## Owner decisions

- None waiting yet. Per-category budgets and confirmed bills both need new fields in `tally:v1`; they
  will be asked here before either is built.
