# Tally motion guide

Implemented 2026-10-14. The header has a 56px full-body companion. Static contextual illustrations and install icons keep their existing roles.

| State | Playback | Trigger |
| --- | --- | --- |
| Idle | 8 frames, 800ms, once | After 10 seconds without typing, an open sheet, or a previous reaction |
| Wave | 10 frames, 833ms, once | Pointer tap; 3-second cooldown |
| Working | 12 frames, 1200ms, loop | Actual update check/download or backup import lasting over 400ms |
| Success | 12 frames, 1000ms, once | Backup merged and saved successfully |

Status text appears immediately. Fast operations have no artificial delay. Busy work overrides other reactions, ignores greeting taps, and disables duplicate manual update checks. Automatic foreground/hourly checks also report pending work. Keyboard activation gives a static greeting. A failed import keeps the existing notice and returns to idle; failed persistence does not celebrate.

OS reduced motion and the Animate Tally menu checkbox suppress all character animation. The preference lives under tally:animate-mascot, outside ledger backups. Typing and open sheets pause idle/greetings; hidden pages suppress all motion. Timers and event listeners are cleaned up. The mascot is decorative; status text carries the meaning.

## Assets and reproduction

Source sheets: animation-sources/{idle,wave,working,success}.png. Runtime: public/mascot/tally-cat/animation/*.webp. Each strip uses square 192px frames, transparent padding and a registered head/bottom baseline. Exact prompts are in animation-generation.json; per-frame extraction/scale records are beside each sheet. Run npm run mascot:animations, then npm run build. No new runtime dependency.

The generator finds transparent row/column gaps, refuses overlaps and clipping, and packs WebP strips. Two touching Idle source cells are replaced by clean neutral cells for the tail return. The corrected Wave uses two front arms and two hind feet; Success has two raised front paws and only two grounded hind paws. Never add raised paws on top of four grounded legs. Preserve one tail and the same cream fur, navy outline, gold forehead stripes/collar and lime charm.

Final payload: 293,734 bytes across four strips (49,280 Idle; 70,766 Wave; 86,304 Working; 87,384 Success). All four are precached by the existing service worker; source sheets are outside public. animation-preview.html loops all clips at 96px and 56px for inspection, supports pause and reduced motion, and can be opened directly or served from the repository root. animation-comparison.png captures the comparison; animation-mobile.png shows the header alongside expense entry.

## Verification

49 tests, lint and production build pass. Motion tests cover state priority, the pending threshold gate, typing/sheet pauses and suppression for reduced motion/hidden/disabled states. Browser review checked complete character silhouettes and corrected limb counts in the final source sheets, transparent registered strips, and readability at 56px/96px on navy.

Local Chromium production preview: mobile 390x844 and desktop; reduced motion gives a still greeting; toggle persists across reload; a synthetic successful backup import shows Backup imported and settles to idle; invalid JSON shows the existing error without celebration or data loss. Expense entry remains immediate and focused typing reports animation:none. Local Update applies successfully, and Check for updates settles with the existing notice. Console errors/warnings were empty. All four strips appear in the generated offline precache.

A separate local server delayed the actual service-worker request by 2 seconds: Checking updates appeared immediately with state working/motion still, then the hourglass reached motion working after the 400ms guard and returned to idle on completion. Tap-to-wave reached motion wave. Reload with that server stopped still loaded the app and cached animation. See animation-working.png.

Limits: background visibility transitions and performance on a real installed phone have not been exercised end to end. The state/timer guards are implemented and unit-tested where applicable. Small illustration differences between drawn frames remain; these are raster character reactions, not a skeletal rig. The existing large JavaScript chunk warning remains. No commit, push, PR or deployment was performed.

