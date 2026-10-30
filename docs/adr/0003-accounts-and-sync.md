# ADR 0003: Accounts and sync, prepared and switched off

Status: proposed (2026-10-30). Nothing here is live. The seam is in the code, the Account screen is behind
a flag that is off, and choosing the provider is the owner's call (see Owner decisions).

## Context

- ADR 0001 keeps all data in this origin's `localStorage` (`tally:v1`), with no accounts and no server. Its
  "revisit when" list starts with: a second device, or sharing, is wanted.
- Today the only way to move data is ··· → Export backup and Import backup through Files. A restore merges
  by id, and the phone's copy wins.
- **Storage.** WebKit gives a Home Screen web app its own storage, separate from Safari. It counts its own
  days of use, so Safari's 7-day cap on script-written storage isn't meant to delete an installed app's
  data [1]. The real loss risks are still the ones ADR 0001 names: deleting the icon, or losing the phone. A
  copy held in an account covers both.
- **Signing in from the installed app is the hard part on iPhone.** For years, an OAuth flow that left the
  standalone app finished in Safari, whose storage is separate, so the app never saw the result ("No
  matching state found in storage") [2][3]. A 2024 vendor note says Google sign-in now works in installed
  web apps on recent iOS [4], but there is no Apple documentation behind it. It has to be tried on the
  iPhone, in the installed app, before anything is chosen.

## What any sync must guarantee

1. **The phone stays the source of truth and works offline.** `tally:v1` is read and written exactly as
   today, and no screen waits on the network. Sync is a copy that catches up when the phone is online.
2. **The origin never changes.** `https://tally-omega-roan.vercel.app` owns the data in `localStorage` and
   the service worker, and it will be the OAuth client's authorized JavaScript origin and redirect URI. A
   new address is an empty app and a broken sign-in.
3. **The data stays the user's.**
   - Signing out never deletes anything on the phone.
   - Deleting the account's copy is one button.
   - The copy should be end-to-end encrypted: AES-GCM through WebCrypto, with a key derived from a passphrase
     only the user knows (PBKDF2). The host then stores one opaque document per account and can't read the
     spending. Without encryption, ADR 0001's "no third party ever receives it" stops being true and has to
     be restated.
4. **Merging never loses an entry.**
   - **Entries merge by id.** When both sides have the same id, the newer `updatedAt ?? createdAt` wins:
     last write wins, per entry. Two phones' clocks disagree by seconds, which is fine for one person's
     notebook. If it's ever shared between people, move to a hybrid logical clock [5].
   - **Deletes become tombstones.** Store `deleted: { [id]: deletedAt }`, kept for a year. Without them, a
     delete on one phone comes straight back from the other ("ghost" entries) [5]. Undo removes the
     tombstone along with restoring the entry.
   - **Budget, goal and tip votes** each get their own `updatedAt` and merge the same way.
   - **First sign-in with entries on both sides** takes the union, drops nothing, and says how many came in.
   - **Import stays as it is** (the phone wins), because a restore isn't a sync.
   - **A copy that can't be read or decrypted** is never merged and never overwrites the phone. It's set
     aside, the way `load()` sets aside unreadable local data.
5. **Size.** The synced document is the same JSON as `tally:v1`, a few hundred KB after years of use. Moving
   to IndexedDB stays its own decision (ADR 0001).

Tombstones and the settings stamps change the stored format, so they wait for the owner (see below). They
only add optional fields: an older build ignores them, and an import drops them.

## Options

| | Supabase | Firebase | Auth.js and a small backend | Google Drive app folder |
| --- | --- | --- | --- | --- |
| Sign-in | Supabase Auth, Google, PKCE redirect | Firebase Auth, Google, redirect or popup | Auth.js on our own server | Google Identity Services, in the browser |
| Where the copy lives | One row per user in Postgres, behind row-level security | One Firestore document per user | Our database (for example Vercel functions and Postgres) | A hidden per-app folder in the user's own Drive |
| Free tier | 50,000 monthly users, 500 MB database, 2 projects [6] | 50,000 monthly users for Google sign-in; Firestore 1 GiB, 50,000 reads and 20,000 writes a day [7] | Depends on the host | Counts against the user's own Drive quota |
| Catches | A free project **pauses after a week without requests** [6]; sync stops until it's restored in the dashboard | The web SDK is the heaviest option and keeps its own IndexedDB cache, a second copy beside `tally:v1`. The redirect flow needs its auth handler on our domain where third-party storage is blocked (Safari), which means rewrites on Vercel | Servers, a database and sessions to keep running. Changes the deploy | Google's script loads at sign-in. Tokens last about an hour with no refresh token in the browser, so sync after that may need a tap. Scope and consent-screen rules still need checking |
| New dependency | `supabase-js`, over the 30 KB rule; or about 150 lines of `fetch` against its REST endpoints | `firebase` (Auth and Firestore), well over 30 KB | `next-auth` on the server, plus a database driver | None: Google's own script, loaded only when signing in |

Figures in [6] and [7] come from third-party guides written this year. Check supabase.com/pricing and
firebase.google.com/pricing before deciding.

## Recommendation (for the owner to confirm)

1. **Try it on the iPhone first.** In the installed app (not Safari), run the Google sign-in round trip for
   Supabase's PKCE redirect and for Google Identity Services. It's about half a day, using throwaway
   projects. Whichever flow comes back to the installed app reliably is the one that can work.
2. **If Supabase passes: Supabase**, with one encrypted row per user, called with plain `fetch` to stay under
   the 30 KB rule. It's the only option that syncs on its own in the background with no server of ours.
   Mitigate the weekly pause by showing "Sync is paused" and keeping everything working offline.
3. **If only Google Identity Services passes: the Drive app folder.** There's no server and nothing pauses,
   but sync runs when the user taps Sync rather than on its own.
4. **Not Firebase.** Its web SDK is the heaviest, its offline cache duplicates `tally:v1`, and its redirect
   fix needs Vercel rewrites. **Not Auth.js:** a backend to run for one person's notebook.

## Owner decisions

- **Which provider**, after the iPhone test.
- **The format change:** tombstones and settings stamps in `tally:v1`.
- **Encryption:** use a passphrase (forgetting it makes the cloud copy unreadable, though the phone's data is
  unaffected), or store plain JSON and restate ADR 0001.
- **Where the env vars go:** the Vercel project's settings. Setting them is the owner's job.

## What's in the code now (switched off)

- `src/lib/sync.ts`: the `AuthProvider` and `SyncAdapter` interfaces, and `localAuth` / `localSync`, which
  do nothing. `connected: false` means no provider is behind them.
- `src/lib/flags.ts`: `accountsEnabled` is true only when the build has `VITE_TALLY_ACCOUNTS=on`.
- With the flag on, ··· → Account explains what signing in will do and says it isn't connected yet. With
  it off (the default, and production), nothing shows.
- No network calls, no client IDs, no keys, and no change to `tally:v1`.

## Environment variables (for later; none are set)

| Variable | Used by | Value |
| --- | --- | --- |
| `VITE_TALLY_ACCOUNTS` | Every route | `on` shows ··· → Account. Unset means off |
| `VITE_GOOGLE_CLIENT_ID` | Google Identity Services, and Supabase's Google provider setup | The OAuth web client ID. Authorized JavaScript origins: `https://tally-omega-roan.vercel.app` and `http://localhost:5173` |
| `VITE_SUPABASE_URL` | Supabase | The project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase | The public anon key. Row-level security is what protects the data |

Each one is public once built into the app, and no flow here needs a client secret. Even so, real values
live only in the Vercel project's environment and in `.env.local`, which git ignores, never in the repo.
`.env.example` lists the names.

## Revisit when

- The iPhone test is done.
- A second phone, or a second person, actually needs the data.
- `tally:v1` passes 2 MB (ADR 0001).

## Sources

1. WebKit, "Full Third-Party Cookie Blocking and More" (2020), quoted in
   https://groups.google.com/g/tiddlywiki/c/-SX3TiRPVaY/m/Bd39oeP7AgAJ; https://bugs.webkit.org/show_bug.cgi?id=237350
2. https://github.com/nolanlawson/pinafore/issues/45
3. https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/53948916/oidc-and-pwa-add-to-home-screen;
   https://developer.apple.com/forums/thread/649699
4. https://intercom.help/progressier/en/articles/9519381-google-oauth2-is-not-working-in-my-pwa-on-ios-why
5. https://www.techinterview.org/post/3233474986/design-offline-first-mobile-app/;
   https://bloglab-65579.firebaseapp.com/blogs/mobile-development/offline-first-apps-sync-conflicts-without-user-tears.html
6. https://automationatlas.io/answers/supabase-free-tier-limits-2026/;
   https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/
7. https://firebase.google.cn/docs/projects/billing/firebase-pricing-plans?hl=en;
   https://magora-systems.com/firebase-pricing/
