# Tally

An offline budget notebook for iPhone. You type a line like `jollibee 245` and it's saved. Insights
shows your budget pace, income against spending, where the money went, and what to do about it.
Everything stays on the phone. The decisions behind it are in
[docs/adr/0001](docs/adr/0001-offline-pwa-on-device-storage.md) (offline, on-device storage) and
[docs/adr/0002](docs/adr/0002-on-device-learning.md) (what learns, and where a future model plugs in).

## Typing entries

| You type | Saved as |
| --- | --- |
| `coffee 120` or `120 coffee` | ₱120, Food |
| `grab to office 186` | ₱186, Transport |
| `+25000 salary` or `salary 25k` | ₱25,000 income |
| `2 coffees 240` | ₱240 (the largest number on the line is the amount) |
| `1000 savings`, `save 1000 laptop` or `ipon 1000` | ₱1,000 put into savings |
| `withdraw 500` | ₱500 taken out of savings |

Save, savings, ipon or withdraw can go anywhere in the line, and the other words become the note. Savings
are neither spending nor income, so they don't count against the budget. They go into one savings total,
and the savings goal (··· → Savings goal) tracks that total.

Categories are guessed, and the guesses learn. Every entry you save and every category you fix trains
a small model on the phone, and recent entries count most.

- The guess shows on the chip at the end of the line, before you press return. If it's wrong, tap the
  chip and pick the right category, and the line is saved with it.
- To fix an entry you've already saved, tap it.
- Both lists show what goes in each category. **··· → Which category?** adds a few questions that decide
  for you.

To file something on an earlier day, use ‹ ›, or tap the date for the calendar. Each day there shows what
you spent, in coral when it was more than a day's share of your budget after bills.

## What to do

Insights reads the month the way a financial advisor would: where you stand first, then a plan for the
days left. It never tells you to cut money that's already spent.

- **Priorities, in order:** don't run out before the month ends, cover the bills, keep a safety cushion of
  3 to 6 months of essentials, then goals, then habits.
- **Your own numbers:** usual essentials per day, usual spending and income, bills that repeat, paydays. A
  tip that needs history waits until it exists.
- **It learns which tips you use:** Helpful and Not helpful reorder them. Everything is worked out on the
  phone, with no AI service.

## The ··· menu

On both screens, top right:

- **How to use Tally.** The whole app on one screen. It also opens by itself the first time Tally runs on a phone.
- **Install Tally.** Android and desktop Chrome show the real install prompt. iPhone shows the Add to Home Screen steps. Hidden once installed.
- **Check for updates.** Becomes **Update now** when a new version is waiting.
- **Monthly budget**, also behind the pencil on the Insights budget card and the safe-to-spend line on Today.
- **Savings goal.** Insights shows how close you are and when you'll get there.
- **Which category?**, **Export backup** and **Import backup**.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # parsing, dates, totals, insights, the category model, backup restore
npm run icons      # regenerate src/components/icons.tsx (MingCute icons, fetched with better-icons)
npm run build      # type-check, then build to dist/ with the offline service worker
npm run preview    # serve dist/ the way the phone will get it
```

To add an icon, put its MingCute name in `scripts/icons.mjs` and run `npm run icons`.

## Put it on your iPhone

1. **Deploy `dist/` to a static host, once.** For example `npx vercel --prod` from this folder: the first run asks you to log in and link a project, and no git is involved. You can also drag `dist/` onto app.netlify.com/drop.
2. **Install it.** Open the URL in Safari, tap Share, then Add to Home Screen, and use the icon from then on. The Home Screen app keeps its own storage, separate from the Safari tab, so enter data there.
3. **Check it works offline.** Turn on airplane mode and open it. It works.

## Update it

Push changes to `main` to trigger Vercel production deployment at https://tally-omega-roan.vercel.app.
Vercel runs `npm ci`, tests, lint and the TypeScript/Vite build before updating the live URL.
A failed check keeps the previous deployment live. GitHub Actions is configured to run the same checks on main pushes
and pull requests; Vercel runs its own gate rather than waiting for the Actions result.

The existing Vercel project `tally` is connected to `RastyFullStaxx/tally`, with `main` as the
production branch (configured 2026-10-14). Commit and push this setup to activate GitHub CI, then
verify the first Actions result and Vercel hosted gate at the same commit.
No Vercel token is needed in GitHub Actions. Update pinned action SHAs deliberately when upgrading.

Manual fallback: from this folder, run `npx vercel --prod --yes`. It deploys local files, including
uncommitted changes, through the same Vercel build gate. Never create a replacement project or URL.

Phones pick it up on their own. Whenever the app is opened online, and every hour it stays open, it
checks for a new version and downloads it in the background:

- **When it's ready.** A gold **Update** button appears next to ···, and ··· gets a red dot. Where the
  phone supports it, the home-screen icon shows a badge too.
- **Tap Update** to switch to the new version.
- **··· → Check for updates** checks by hand.

Your entries aren't touched by an update.

## Keep your data safe

- **Never change the URL.** Your data belongs to that address.
- **Back up now and then.** Tap ··· → Export backup → Save to Files. To restore, use ··· → Import backup, which merges and never duplicates. Backups include your savings goal and tip feedback.
- **Deleting the Home Screen icon deletes its data.**
