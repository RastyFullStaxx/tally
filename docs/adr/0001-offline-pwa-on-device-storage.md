# ADR 0001: An offline Home Screen web app that keeps all data on the phone

Status: accepted (2026-10-05)

## Context

Step 0 of the Architecture Decisions checklist:

- One user (Rasty) on one iPhone, typing expenses as they happen.
- The data is the user's own spending. No third party ever receives it.
- It must work fully offline, every day.
- It must cost nothing, with no Mac and no paid Apple Developer account. The user works on Windows.
- No outside systems, and no expected lifespan limit.
- Quality attributes, in priority order: entry speed, then no data loss, then polish.

A free native app is possible only with a Mac or a cloud Mac build, plus re-signing the app every 7 days with a free Apple ID (AltStore, Sideloadly). Without that, it stops opening.

## Decision

Tally is a progressive web app, installed from Safari with Add to Home Screen.

- **Hosting.** A static host serves the files only for the install and for updates. The app runs from the service worker's cache.
- **Storage.** All data is one JSON document in the app's own `localStorage` under the key `tally:v1`.
  - Amounts are integer centavos.
  - Ids are UUIDs minted on the phone.
  - Dates are the phone's local `YYYY-MM-DD`.
- **No backend.** There are no accounts and no sync.
- **Backups.** Export and Import write and read a JSON file through the share sheet (Save to Files).
- **Spending tips.** They are worked out on the phone from rules over the user's own entries (`advise()`, now in `src/lib/insights.ts`; what learns on the phone is in ADR 0002). No AI service is involved, so they work offline and send nothing anywhere.

## Consequences

- **Free.** Installing and updating cost nothing, and nothing expires.
- **Updates.** A deploy downloads in the background the next time the app opens online, then waits for the user to tap Update (prompt mode, since 2026-10-11; see the README).
- **The URL is permanent.** The data is bound to the origin, so moving to a new address starts an empty app. Export, then Import, carries data across.
- **Deleting the Home Screen icon deletes the data.** Backups are manual, and the restore path is tested in `tests/ledger.test.ts`.
- **Storage ceiling.** `localStorage` holds about 5 MB, which is ten or more years at ten entries a day. Move to IndexedDB if it ever gets close.
- **No second device**, unless sync is built later.

## Alternatives considered

- **Native app with Capacitor.** It needs a Mac or a cloud Mac build plus re-signing every 7 days, or $99/yr. It can still wrap this same code later without a rewrite.
- **Next.js with static export.** There is no server, so its server features would go unused, and a static export plus a PWA plugin adds config. Vite, React and shadcn match fnb-lis and amkor-ims.
- **IndexedDB.** It's unnecessary at this data size, and `localStorage` is synchronous and simpler.
- **AI-generated tips.** They'd need the network and a paid API key, and would send spending data to a third party.

## Revisit when

- A second device, or sharing, is wanted. That brings sync, conflict rules and hosting with a server.
- Stored data passes 2 MB.
- A Mac or a paid Apple Developer account becomes available. At that point, wrap the app in Capacitor.
