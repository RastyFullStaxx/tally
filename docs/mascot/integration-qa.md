# Tally cat integration QA — 2026-10-14

## Summary
Cat branding and all six pose roles are implemented locally. No commit, push or deployment.

## Environment
Production build served at http://127.0.0.1:8780/; Codex in-app browser (CUA), 390x844 mobile and default 1265px desktop viewport. Browser plugin/skill was not listed; the available CUA browser was used. Synthetic entries only in this isolated localhost origin.

## Verified changes
- Cat-head wordmark in the app shell; navy app-icon tile generated from the same head.
- Welcome in help, Ready on empty days, Thinking in Insights guidance, Saving in savings, Celebration when goal.left is zero, Reassurance on warning status.
- Generated icon manifest: 64, 192, 512 and maskable 512; build also generates the Apple touch icon and favicon.
- Runtime images are optimized WebP: 129166 bytes total for all seven. Full source PNGs are excluded from offline precache; all seven runtime images are included.
- Logo is padded within the Android maskable safe zone. Decorative images have empty alt text and existing readable status text stays present.

## Checks
| Check | Result |
| --- | --- |
| Page identity | Pass: localhost preview, title Tally |
| Nonblank page | Pass: welcome guide, Today and Insights render |
| Framework overlay | Pass: none |
| Console health | Pass: no error/warn entries during online flow |
| Mobile/desktop layout | Pass: screenshot review; help content and Got it fit at 390x844 |
| Entry interaction | Pass: coffee 1500 saved and Ready state disappeared |
| Savings/budget interaction | Pass: save 2000, budget 1000, goal 1000; warning and goal reached remained accurate |
| Update compatibility | Pass: Update applied second local build, retaining both entries, budget and goal |
| Offline reload | Pass: after stopping preview server, reload and Insights switch worked; logo/reassurance/thinking/celebration images loaded |
| Gate | Pass: 45 tests, lint and production build |
| Asset/manifest checks | Pass: expected icon sizes and all runtime precache paths, no source-pose PNG cache |
| Diff whitespace | Pass |

## Evidence and limits
qa-today.png shows fresh Today; qa-insights.png shows final warning/guidance; icon-preview.png shows the generated maskable icon.
Real iPhone/Android installation and installed-icon refresh behavior were not tested. Existing installed icons may be cached by the OS. The pre-existing large JS chunk warning remains. No animation, money-rule or storage-schema change.
