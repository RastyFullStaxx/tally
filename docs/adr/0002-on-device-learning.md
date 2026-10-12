# ADR 0002: Learning on the phone: a category classifier and tip feedback

Status: accepted (2026-10-13)

## Context

- Picking a category is the slowest part of fixing an entry, and the built-in keyword list only knows
  common Philippine merchants. It should learn the words its user actually types.
- Insights should get smarter with use, and leave room for a trained model later.
- ADR 0001 still holds: offline, free, and no spending data leaves the phone.

## Decision

**Categories: a Naive Bayes classifier trained on the phone** (`src/lib/classifier.ts`).

- **Training data.** Every saved entry's final category. Saving an edit stamps `updatedAt`, so a corrected
  category counts as the newest example.
- **Features.** The note's words, its first word (the strongest signal, e.g. "grab") and an amount band.
- **Recency.** Examples are weighted with a 90-day half-life, measured from the newest entry so training
  stays a pure function. A correction made last week outweighs an old habit.
- **Seeds.** The keyword list trains in at weight 0.3, so a new phone already guesses sensibly.
- **When.** Today retrains on every change to the entries (`useMemo`). The model is never stored: it's
  always derived from the entries, so nothing needs migrating or versioning.
- **The guess, in order:** an exact repeat of a saved note → the model, if it knows any of the words and
  is at least 40% sure → the keyword list → Other.

**Insights: rules over the user's own baselines** (`src/lib/insights.ts`): a usual week (the middle of up
to 8 weeks), bills that come monthly, a month-end forecast and a safe-to-spend figure.

**Tips learn from Helpful / Not helpful.**

- Votes are kept in `Data.votes`, up to the last 500, and travel in backups.
- Each vote stores a numeric snapshot of the month (`tipFeatures()`): training data for a future model.
- Ranking multiplies each kind's weight by (helpful + 1) ÷ (not helpful + 1). Not helpful also hides that
  tip for the month.

**Where a trained model plugs in:** `predictCategory()` and the ranking step at the end of `advise()`.
Either can be replaced without touching the UI. The model must run on the phone.

## Consequences

- **Cost.** Retraining is linear in the number of entries: about 5 ms at 1,000 entries and 37 ms at
  20,000 (5 years at 10 a day), measured on a desktop. Phones run slower.
- **Corrections take effect at once.** The exact-repeat rule means one fix changes the next guess for that note.
- **No inspection.** What the model learned shows only through its guesses. The category guide
  (··· → Which category?) explains the categories, not the model.
- **Backups carry everything** that learning depends on: entries and votes.

## Alternatives considered

- **A cloud LLM for categories or tips.** It needs the network and a paid key, and sends spending data to
  a third party.
- **A TensorFlow.js or ONNX model.** It adds megabytes to an app that must load offline, and there's no
  training data until votes accumulate.
- **Keywords only.** It never learns the user's own merchants or corrections.
- **A stored, incrementally trained model.** It's faster at scale but adds a format to migrate. Not
  needed below tens of thousands of entries.

## Revisit when

- Votes reach a few hundred: enough to train a ranking model on `tipFeatures()`.
- Entries pass about 20,000, or retraining is noticeable on the phone. Then train incrementally.
- A second device needs the same guesses, which brings sync (see ADR 0001).
