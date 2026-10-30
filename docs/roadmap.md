# Roadmap

Work lands on `rasty/tally-next`, one feature branch (`rasty/tally-<feature>`) at a time. `main` is
production and only the owner merges into it.

## Shipped (on rasty/tally-next)

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

- **Today's header on narrow phones** (`rasty/tally-narrow-header`, started 2026-10-30 14:40 UTC)
  - [ ] Measured: on a past day, "30 September" wraps to two lines at 390px and below, and at 320px the
        Today button overlaps it
  - [ ] The date never wraps: the title box is a size container and the month goes short ("30 Sept") when
        it is under 11rem; the chevron hides under 6.5rem; the aria-label keeps the full date
  - [ ] Check 320, 340, 360, 375, 390, 430 on today and on a past day; gate; merge

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

- **Merged branches to delete on GitHub:** `rasty/tally-undo-delete` (and `rasty/tally-search` if it is
  still listed). Both are fully merged into `rasty/tally-next`; this environment's git proxy drops
  branch deletions, so they couldn't be removed from here.
- No product decisions waiting yet. Per-category budgets and confirmed bills both need new fields in `tally:v1`; they
  will be asked here before either is built.
