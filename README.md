# Tally

An offline budget notebook for iPhone. You type a line like `jollibee 245` and it's saved. Insights
shows your budget pace, income against spending, where the money went, and what to do about it.
Everything stays on the phone. The decisions behind it are in
[docs/adr/0001](docs/adr/0001-offline-pwa-on-device-storage.md).

## Typing entries

| You type | Saved as |
| --- | --- |
| `coffee 120` or `120 coffee` | ₱120, Food |
| `grab to office 186` | ₱186, Transport |
| `+25000 salary` or `salary 25k` | ₱25,000 income |
| `2 coffees 240` | ₱240 (the largest number on the line is the amount) |

Categories are guessed from the words. Tap an entry to fix one, and the next entry with the same
first word follows your correction. Use ‹ › to file something on an earlier day.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # the rules: parsing, dates, totals, tips, backup restore
npm run build      # type-check, then build to dist/ with the offline service worker
npm run preview    # serve dist/ the way the phone will get it
```

## Put it on your iPhone

1. **Deploy `dist/` to a static host, once.** For example `npx vercel --prod` from this folder: the first run asks you to log in and link a project, and no git is involved. You can also drag `dist/` onto app.netlify.com/drop.
2. **Install it.** Open the URL in Safari, tap Share, then Add to Home Screen, and use the icon from then on. The Home Screen app keeps its own storage, separate from the Safari tab, so enter data there.
3. **Check it works offline.** Turn on airplane mode and open it. It works.

## Update it

Change the code, run `npm run build`, then deploy again with the same command.

Phones pick it up on their own. Whenever the app is opened online, and every hour it stays open, it
checks for a new version and downloads it in the background:

- **When it's ready.** The ↻ button on the Today screen becomes **Update**, with a red dot. Where the
  phone supports it, the home-screen icon shows a badge too.
- **Tap Update** to switch to the new version.
- **Tap ↻ any time** to check by hand.

Your entries aren't touched by an update.

## Keep your data safe

- **Never change the URL.** Your data belongs to that address.
- **Back up now and then.** In Insights, tap ··· → Export backup → Save to Files. To restore, use ··· → Import backup, which merges and never duplicates.
- **Deleting the Home Screen icon deletes its data.**
