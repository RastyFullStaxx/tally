# Roadmap

Work lands on `rasty/tally-next`, one feature branch (`rasty/tally-<feature>`) at a time. `main` is
production and only the owner merges into it.

## Shipped (on rasty/tally-next)

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

- **Category prediction quality** (`rasty/tally-classifier-eval`, started 2026-10-30 15:35 UTC)
  - [ ] `scripts/eval-classifier.ts` (`npm run eval:classifier`): seeded synthetic personas with their own
        merchants, filing habits, typos and short forms; prequential accuracy (each entry guessed from the
        ones before it, the way the chip guesses), split by where the guess came from
  - [ ] Baseline numbers for today's model; candidates: kNN over character trigrams of the note, and a
        trigram fallback only when no word is known
  - [ ] Change `classifier.ts` only if a candidate wins clearly and loses nothing; tests for it; ADR 0002
        updated with the numbers and sources
  - [ ] Gate; merge

## Next up (ranked)

1. **Confirm detected bills.** `recurringBills()` finds them; let the user confirm or dismiss each one.
   Detected bills are never added on their own. (Storing confirmations changes the data format, so
   see Owner decisions.)
3. **Anomaly flags and a seasonality-aware forecast** in `insights.ts`, advising only on the days ahead.
4. **Bundle, round two.** Radix and vaul in the entry chunk; check whether the sheets (help, category
   guide) can load on demand too.

## Owner decisions

- **Merged branches to delete on GitHub:** `rasty/tally-undo-delete`, `rasty/tally-search`,
  `rasty/tally-narrow-header`, `rasty/tally-csv-export` and
  `rasty/tally-accounts-seam`. All are fully merged into `rasty/tally-next`; this environment's git proxy drops
  branch deletions, so they couldn't be removed from here.
- **Accounts and sync (ADR 0003).** First, try Google sign-in in the installed app on the iPhone (Supabase's
  PKCE redirect and Google Identity Services). Then pick the provider (recommended: Supabase, encrypted,
  over plain `fetch`), say yes or no to the format change (tombstones and settings stamps in `tally:v1`),
  and choose between a passphrase-encrypted copy and plain JSON.
- Other product decisions: Per-category budgets and confirmed bills both need new fields in `tally:v1`; they
  will be asked here before either is built.
