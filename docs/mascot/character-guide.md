# Tally cat mascot

Created 2026-10-14 using the built-in image-generation tool. Integrated into Tally on 2026-10-14, including a simplified cat-head logo and app-icon source.

## Character
A calm, curious cream kitten with a large rounded head, dark navy oval eyes, peach cheeks and ear interiors, three golden forehead stripes, small paws, a curved cream tail, and a gold collar with a lime notebook charm. The Welcome pose is the master reference. Preserve these features when extending the set.

Palette direction (illustrations use shaded variations):
- Cream: #fff1d7
- Navy outline and features: #16243f
- Gold collar and stripes: #d8b56a
- Lime charm and accents: #d4ec5c
- App background: #0b1426
- Peach: soft muted peach for ears, cheeks and paw pads

Keep expressions encouraging. Do not use tears, blame, panic, or a judging expression for spending warnings.

## Assets and usage
| PNG in public/mascot/tally-cat | Meaning | Suggested future placement |
| --- | --- | --- |
| welcome.png | Friendly wave | Introduction and help |
| ready.png | Sitting with an open notebook | Empty states and first entry |
| thinking.png | Paw near chin, studying notebook | Insights and category guidance |
| saving.png | Dropping a coin into a jar | Savings goals and progress |
| celebration.png | Raised paws and a few sparkles | Goal completion and milestones |
| reassurance.png | Hugging notebook with a kind smile | Over-budget guidance and recoverable errors |

Use the complete square canvas with object-fit:contain; do not crop the ears, paws, tail, or props. These are source-resolution transparent PNGs. For future integration, size with CSS and use images sparingly on Tally's compact screens. Never use the mascot instead of readable status or error text. Decorative placements should have empty alt text; informative placements need short meaningful alt text.

At 48px the silhouette and expression communicate the state; detailed props and the charm are clearer at 96px. Use at least 96px where the prop conveys meaning. Do not stretch or add a background to the PNG.

## Review
Open comparison.html for all six poses on Tally navy with 48px and 96px examples. comparison.png is the saved visual receipt.
Verified: all six assets are 1254x1254 RGBA PNGs with transparent corners, alpha spanning 0-255, and visible subject padding. Visual review on Tally navy confirmed complete anatomy, consistent identity and scale, and readable silhouettes at 48px and 96px. The illustration colors are art direction, not an exact per-pixel token match.

## Generation prompts
All six images were made with the built-in image-generation tool. The five variants used welcome.png as their character reference. Prompt text is saved in generation.json; technical inspection results are in inspection.json.

## Boundaries
Screen integration and the app icon are implemented locally. No animation, commit, push, or deployment. No app data or storage changes.

## App integration
Runtime WebP files live in public/mascot/tally-cat/runtime; original PNGs remain the editable source assets.
Run npm run mascot:assets after changing a source pose or brandmark.png, then npm run build to regenerate install icons.
The optimized assets are precached offline; source PNGs are excluded. The shared Mascot component keeps images decorative.
App placements: header wordmark, welcome help, empty notebook days, Insights guidance and budget warnings, savings and goal completion.
See integration-qa.md for observed checks and device-installation limits.
## Additional pose pack — 2026-10-14

Six more poses reference the original welcome.png so the face, coat, forehead stripes, collar and notebook charm match the first set.

| Asset / Mascot pose | Character action | Suggested use |
| --- | --- | --- |
| income | Holding a gold coin | Income received |
| planning | Organizing coins beside a notebook | Budget planning |
| backup | Holding a folder securely | Backup/export and safe keeping |
| resting | Curled up asleep | Quiet or offline moments |
| waiting | Sitting beside an hourglass | Updates or waiting |
| peeking | Looking around a notebook | Tips, hints and onboarding |

All six have source transparent PNGs and optimized 320px runtime WebP files. The existing Mascot component accepts these pose names; for example, `<Mascot pose="income" size={96} />`.
These are reusable assets, not additional automatic UI behaviors. The current screen placements are unchanged.
Resting intentionally uses closed eyes and a curled silhouette. Use it with explicit explanatory text; offline status must not be inferred from the picture alone.
Props communicate best at 96px or larger. At 48px use the expression/silhouette as decoration beside readable text.

comparison-extra.html and comparison-extra.png show this pack on navy with 48px/96px examples.
generation.json retains the exact prompts; inspection.json retains each file's technical checks.

Verified for the additional pack: six 1254x1254 RGBA PNGs, transparent corners and visible padding; comparison review at 48px/96px. Lint and build pass. New runtime images total 124,712 bytes; all twelve poses plus logo total 253,878 bytes. All new runtime paths are precached, with source PNGs excluded.

## Animated header companion

The animation implementation supersedes the earlier static-only boundary for the header. See [animation-guide.md](animation-guide.md) for behavior, accessibility controls, corrected four-limb anatomy, production assets and verification limits. The existing contextual pose library and app icons stay static.
