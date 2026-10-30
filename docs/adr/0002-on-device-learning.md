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
  is at least 40% sure → the keyword list → the most alike past notes by their letters → Other.
- **Alike by letters** (added 2026-10-30). A typo or a short form ("jolibee", "pureg", "titamel") shares
  no word with anything saved, so it used to fall through to Other. Each distinct expense note is kept as
  the three-letter pieces of its words, with the category it was last saved under. A new note compares its
  pieces with each one (cosine similarity), and the three most alike at 0.4 or more vote, each by how alike
  it is. Character n-grams are the standard way to make text matching survive misspellings [1][2].

**Insights: rules over the user's own baselines** (`src/lib/insights.ts`): a usual week (the middle of up
to 8 weeks), bills that come monthly, a month-end forecast and a safe-to-spend figure.

**Tips learn from Helpful / Not helpful.**

- Votes are kept in `Data.votes`, up to the last 500, and travel in backups.
- Each vote stores a numeric snapshot of the month (`tipFeatures()`): training data for a future model.
- Ranking multiplies each kind's weight by (helpful + 1) ÷ (not helpful + 1). Not helpful also hides that
  tip for the month.

**Where a trained model plugs in:** `predictCategory()` and the ranking step at the end of `advise()`.
Either can be replaced without touching the UI. The model must run on the phone.

## Measuring it

`npm run eval:classifier` (`scripts/eval-classifier.ts`) replays three seeded, synthetic half-years: a
commuter, a student and a household, 8,018 expenses in all. Each persona has its own merchants (most aren't
in the keyword list), filing habits that go against the keywords (Watsons as shopping, 7-Eleven as
groceries), typos and short forms in about 1 in 5 notes, and one habit that changes halfway. Each entry is
guessed from the entries before it, the way the chip guesses while you type, and scored against the
category it was saved under.

| | All guesses | First time a note is typed |
| --- | --- | --- |
| Before letters (2026-10-13 model) | 93.9% | 74.4% |
| With letters as the last step | **97.2%** | **88.5%** |
| kNN over letters instead of Naive Bayes | 97.2% | 88.6% |
| Letters, plus letter matches against the keyword list | 97.3% | 88.8% |

Letters cut wrong guesses by more than half, and their own guesses are right 98% of the time. A full kNN
does no better than Naive Bayes with letters as a fallback, and matching typos of keywords adds only 0.1
points, so neither was taken. These are synthetic notebooks: the owner's real habits are the real test.

## The month-end forecast (2026-10-30)

`forecastMonth()` adds what's spent, the recurring bills still to come, and everyday spending at a daily rate
for the days left. `npm run eval:forecast` (`scripts/eval-forecast.ts`) replays five seeded, synthetic people
for six months each and asks for the month's total on every day, using only what was logged by then. They
spend more on weekends and after payday, make the odd big buy, pay monthly bills, and have hotter and cooler
months. The household also has a weekly grocery run, one person's spending jumps by half and stays there, and
one forgets to log about one day in five, plus a week now and then.

| From the 7th (when the forecast tip shows) | Average miss | Bias | 7th–13th | Month a habit changes |
| --- | --- | --- | --- | --- |
| Before: this month's rate so far | 13.8% | +7.1% | 19.5% | 8.8% |
| **Now** | **11.1%** | **+3.7%** | **14.5%** | **7.7%** |

What changed, and what didn't:

- **One-offs count once.** A big buy (over 2.5× a usual day) of something not logged in the 4 weeks before
  is in what's spent, but isn't projected onto the days left. Capping every big day instead also flattened
  the weekly grocery run and pushed the forecast below the real total, the worse way to be wrong for a budget.
- **A young month leans on the last 4 weeks** as if they were 14 more days of it, so a payday splurge on the
  1st doesn't set the pace. Only when at least 14 of those 28 days have entries, since unlogged days aren't
  days without spending.
- **Weekday weights were tried and dropped.** They changed nothing: over a month, weekends fall about evenly
  into the days gone and the days left.

## Consequences

- **Cost.** Retraining is linear in the number of entries: about 5 ms at 1,000 entries and 37 ms at
  20,000 (5 years at 10 a day), measured on a desktop. Phones run slower. Keeping each distinct note's
  letters adds about a third (28 → 37 ms at 18,000 entries), and a guess that reaches the letters step
  takes about 0.2 ms over 900 distinct notes.
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

## Sources

1. W. B. Cavnar and J. M. Trenkle, "N-Gram-Based Text Categorization," Proceedings of SDAIR-94, 1994.
2. P. Bojanowski, E. Grave, A. Joulin and T. Mikolov, "Enriching Word Vectors with Subword Information,"
   Transactions of the ACL 5, 2017 (character n-grams for words never seen in training).
