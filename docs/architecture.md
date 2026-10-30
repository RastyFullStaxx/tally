# Architecture

Tally is a static, offline web app: React on the phone, data in `localStorage`, no server (ADR 0001). The code
is in layers, and each layer only imports from the ones below it.

```
src/
  App.tsx          composes the app: wires hooks to screens and sheets; no business rules
  screens/         one per tab: Today, Insights (Insights loads on demand, see insights-chunk.ts)
  sheets/          bottom sheets: edit entry, search, calendar, budget/goal/help, account
  components/      shared pieces: menu, tab bar, notice bar, category chips, icons, ui/ (shadcn)
  hooks/           React state with one job each: useLedger, useNotice, useImport, useToday
  lib/             pure TypeScript, no React and no DOM (except store.ts), tested under plain Node
```

## `lib/`, the core

| Module | Owns |
| --- | --- |
| `model.ts` | The stored shape (`Data`, `Entry`, `Goal`, `TipVote`, `BillDecision`), categories, `isExpense` / `isIncome` / `isSaving` |
| `parse.ts` | Reading a typed line (`parseLine`, `parseAmount`, keywords) |
| `dates.ts` | Local `YYYY-MM-DD` dates (`localDate`, `shiftDay`, `shiftMonth`, …). Never `toISOString()` |
| `format.ts` | Pesos and words as shown (`formatPeso`, `capitalize`) |
| `ledger.ts` | Working with entries: month totals, search, add/replace, delete and undo, bill answers |
| `backup.ts` | JSON backup and restore (`mergeBackup`), CSV export |
| `classifier.ts` | The on-phone category model (ADR 0002) |
| `insights.ts` | Numbers about your money: patterns, bills, forecast, safe-to-spend, savings, income |
| `advice.ts` | Tips written from those numbers; loads with Insights, not at launch |
| `store.ts` | The only module that touches `localStorage` and the share sheet |
| `sync.ts`, `flags.ts` | The switched-off accounts seam (ADR 0003) |

Dependencies point down: `advice → insights → ledger → parse/dates/format → model`. Nothing in `lib/` imports
React or a component.

## Rules that keep it easy to change

- **Business rules live in `lib/` as pure functions** that take data and return data. Components call them;
  they never reimplement them. That's what lets `npm test` cover the app's behaviour without a browser.
- **State changes go through `commit(next)`** (`useLedger`), which saves to the phone. New operations are pure
  functions in `ledger.ts` (`upsertEntry`, `removeEntry`, `withBill`) that return the next `Data`.
- **Notices carry data, not callbacks** (`useNotice`), so a button acts on the entries as they are when tapped.
- **The stored format only grows by optional fields**, so older builds keep working. Any change to it is an
  owner decision (see `docs/roadmap.md`).
- **Heavy screens load on demand.** Insights, its charts and the tip text are a separate chunk, precached for
  offline and fetched when the phone is idle.

## Adding a feature

1. Put the logic in the right `lib/` module, with tests in `tests/`.
2. If it changes data, add a pure `Data → Data` function to `ledger.ts` and call it through `commit`.
3. Put the UI in the screen or sheet it belongs to; give it its own component when it grows past a screenful.
4. Check: `npm test`, `npm run lint`, `npm run format:check`, `npm run build`, then `npm run e2e`.
