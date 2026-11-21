# My Journey — Complete Development Handoff (for ChatGPT)

**Written:** November 21, 2026
**Written by:** Claude (Anthropic), the developer who took over from Version 5 Prototype 2
**Repository:** GitHub `ngwvkrz9nm-stack/Journey-`, branch `claude/my-journey-handoff-0s3wet`
**Current build:** Version 5 · Build 3 (commit `a4961f0`)

This document describes everything that was fixed, built and changed in the My Journey app, from the moment I received Version 5 Prototype 2 to the current build. It also lists everything that is still unfinished. It is written so that another AI assistant (or developer) can continue the work without guessing.

---

## 1. What the app is (short version)

My Journey is an **offline-first personal accountability app**, currently a Progressive Web App (PWA). The user creates one or more *journeys* (personal commitments, such as mindful eating, walking or reading). Every day they answer **two yes/no questions they wrote themselves**:

1. **Full goal.** Example: "Did I stay around 2,100 calories?"
2. **Progress boundary,** an easier line. Example: "Did I stay at or below 3,000 calories?"

Each day becomes one of four statuses:

| Status | Rule | Colour |
|---|---|---|
| **Goal Day** | Met the full goal | Rich green |
| **Progress Day** | Missed the goal, but met the boundary. Still counts as a good day. | Light green |
| **Detour Day** | Missed the boundary. Never erases earlier progress. | Amber |
| **Pit Stop Day** | An earned day off from tracking, activated intentionally | Purple |

**Good Days % = (Goal + Progress) ÷ (Goal + Progress + Detour) × 100.** Pit Stops and unrecorded days are excluded.

The signature visual is the **Journey Path**: an animated road made of the user's real recorded days, winding toward mountains.

**Business model (decided by the owner):**
- One-time purchase (tentatively $7.99).
- No subscription, no ads, no account, no cloud service.
- Data stays on the device. Users protect it with manual backup files that work across iPhone and Android.

**Product rules that must never be broken:**
1. The user defines their own goals; the app never prescribes how to live.
2. Detours never erase progress.
3. Each journey has independent history.
4. The road shows only real recorded data and has no finish line.
5. Goal changes never rewrite the past.
6. The journal is a first-class feature.
7. The app works offline and keeps data under the user's control.
8. Data integrity matters more than visual effects.

---

## 2. How to run and test it

The app is plain HTML, CSS and JavaScript: **no framework, no build step, no dependencies**.

- **Run it locally:** from the repo root, run `python3 -m http.server 8765`, then open `http://localhost:8765/index.html`.
- **Deploy it:** drag the repo folder onto Netlify Drop (https://app.netlify.com/drop). It must be served over HTTPS for the service worker and install prompt to work.
- **Logic tests:** `node tests/core.test.js` runs 55 Node unit tests and needs no browser.
- **Browser tests:** `node tests/run.js` runs 67 end-to-end checks in Playwright + Chromium at an iPhone-sized 390×844 viewport. Playwright must be installed and able to launch Chromium.
- **Art iteration page:** `tools/road-lab.html` renders the Journey Path with sample data next to the approved reference image. It's for development only.
- **Icons:** `node tools/make-icons.js` regenerates `icon-180/192/512.png`.

All 55 + 67 tests passed at Build 3. **Nothing has been tested on a real iPhone or Android phone yet.**

---

## 3. Starting point: what I received (Version 5 Prototype 2)

I received 7 files: `index.html`, `v5.js`, `v5.css` (the new midnight-blue home screen), `advanced.html` + `app.js` (the older Version 4 app restyled dark, holding settings, Pit Stops, achievements and backup), `sw.js` (service worker) and `manifest.webmanifest`, plus three icons.

I committed them unchanged as the baseline (commit `f3aabc8`) so every later change is visible as a diff.

### Audit findings (full audit in `docs/AUDIT.md`)

**What worked:**
- The check-in and classification.
- The Good Days % formula.
- The Pit Stop earning, cooldown and run rules.
- Ranks and achievements.
- The 7/30/90/365-day windows and the trend chart.

**Serious data-loss bugs:**
1. **The journal was never included in backups.** Restoring on a new phone would lose every journal entry.
2. **Restoring a backup deleted every Pit Stop day.** The importer required yes/no answers, and Pit Stop entries have none. Their cooldown history was lost too, while the wallet still counted them as spent.

**Other bugs:**
- Links such as `advanced.html#settings` always opened the Calendar tab.
- The advanced page had no way back to the home screen, a dead end in an installed PWA.
- The advanced page allowed contradictory answers ("goal met" with "boundary missed").
- The Detour legend was **red** while Detour days were **amber** (a CSS rule was duplicated).
- If the app stayed open past midnight, the home screen kept yesterday's date and saved check-ins on the wrong day.
- The home screen allowed check-ins before the journey's start date.
- **The road had a fake finish line:** one recorded day was stretched across the entire road.
- The road animation re-read and re-sorted all of localStorage **every frame**, a battery and performance problem.
- Saving an empty journal entry silently deleted it.
- Users who had only Version 2 goal settings saw default goals instead of their own.

**Missing features:**
- Multiple journeys (there was only one global data set).
- Goal chapters.
- Journal v2 (only one entry per date was possible).
- The Journeys tab.
- Pit Stop info on the home screen.
- The cinematic road visuals.
- Proper app icons in the approved palette.

**Architecture problem:** two separate apps (`v5.js` and `app.js`) each had their own copy of the rules over the same storage.

---

## 4. Owner decisions (made during this work)

1. **Pit Stop credits:**
   - **1 credit for every 18 Good Days** (Goal + Progress). Version 4 used 14 Goal Days.
   - Kept: 1 bonus credit for each run of **21 consecutive Goal Days**, and **1 one-time credit at 90 recorded days**.
   - Cooldown and consecutive-day rules are unchanged.
   - Historical edits must never duplicate credits.
2. **Backup format:**
   - JSON files in the PWA.
   - The native iPhone and Android apps will use the **`.mjourney`** extension with the **same versioned, cross-platform format**.
   - Every backup must include all journeys, journal entries, Pit Stop credits, achievements and historical records.
3. **Reset and delete:**
   - **"Reset Journey Entries" must keep journal entries.**
   - A separate **"Delete Entire Journey"** option is required, with an explicit confirmation and a chance to export a backup first.
4. **Art direction:**
   - The owner supplied the original approved design image (`docs/reference/approved-journey-path.png`, a 9-frame GIF converted to PNG).
   - It is the **primary visual reference** from now on: a midnight-blue scene, a winding glowing road of coloured day tiles, map-pin markers, a sunrise in a mountain pass, the large Good Days % and a glass stats panel.

---

## 5. Build 1: Stabilise (commit `e309500`)

Focus: stop data loss without changing the data format.

**Backup and restore**
- Export now includes the journal.
- Restore keeps Pit Stop days and validates the whole file before writing anything.
- Restore shows a summary and states what will be replaced.
- An old backup without a journal keeps the current journal.
- Files from newer versions and foreign files are refused with "Nothing on this device was changed."
- Settings are imported field by field with validation.
- Backup file name: `MyJourney-Backup-YYYY-MM-DD.json`. The app shows when the last backup was exported, and warns that lost data cannot be recovered without a backup.

**Navigation fixes**
- `#tab` links now open the right tab.
- The advanced page has a "‹ Today" link.

**Smaller fixes**
- Answer consistency is enforced on both pages.
- The legend colour is fixed.
- The day rolls over at midnight without a reload.
- Check-ins before the start date are blocked.

**Road**
- Days became fixed-length sections with dotted road ahead, removing the fake finish line.
- No more per-frame storage reads.

**Journal and settings**
- Journal entries can be deleted, with confirmation.
- V2 goals are honoured.

**Tests:** I added the first Playwright regression suite (40 checks).

---

## 6. Build 2: one app, many journeys, new data model (commit `2414dd2`)

### 6.1 New data model, `core.js` (schema 6)

All rules now live in **one pure-JavaScript file, `core.js`**, with no DOM access. It's used by the app (`window.MJ`) and by the Node tests (`require`). The data is stored in one localStorage key, **`my-journey-data-v6`**:

```text
store = {
  schema: 6,
  activeJourneyId,
  journeys: [ {
    id, name, icon, summary, goal, boundary, start, template, createdAt, archived,
    chapters: [ { from: "YYYY-MM-DD", goal, boundary } ],     // goal history
    entries:  { "YYYY-MM-DD": { q1, q2, result, note, at } |   // a check-in
                              { pitstop: true, note, at } },   // a Pit Stop day
    pit: { spent: [ { date, at } ], claimed: { milestoneId: true } }
  } ],
  journal: [ { id, date, journeyId | null, type: "reflection" | "note" | "milestone", text, createdAt, updatedAt } ],
  prefs: { backupReminderDays, lastBackupAt, reminderSnoozedAt },
  migration?: { from, at, days, journal, pitStopsTaken, skipped }
}
```

(`summary` was added in Build 3.)

- **Classification:**
  - `result: "bad"` → Detour.
  - Otherwise `q1: "yes"` → Goal, and `q1: "no"` → Progress.
  - `pitstop: true` → Pit Stop.
  - "Goal met" automatically implies "boundary met".
- **Goal chapters:** changing either question starts a new chapter dated today. Past days keep the result they were saved with. The check-in screen and day details show the goal **from that day's chapter**.

### 6.2 Migration from old data (automatic, one-time, verified)

On first launch, if `my-journey-data-v6` doesn't exist, the app reads the old keys:
- `calorie-calendar-v1` (entries)
- `journey-calendar-settings-v3` (settings)
- `calorie-calendar-goals-v2` (old goals)
- `journey-pit-wallet-v4` (Pit Stop wallet)
- `my-journey-journal-v5` (journal)
- `my-journey-last-backup` (last backup date)

What migration does:
- Builds one journey from those keys.
- **Rebuilds goal chapters** from the target/limit numbers saved on each old entry.
- Links journal entries to the journey.
- Keeps the wallet and the last-backup date.
- **Verifies** day count, entries, journal count and Pit Stops before writing anything. If verification fails, nothing is written.
- **The old keys are never modified or deleted.** They remain as a fallback copy.
- A one-time banner tells the user their data was carried over.

If the saved data can't be read, the app switches to **read-only** rather than overwriting it.

### 6.3 Pit Stop ledger (owner decision 1)

- **Credits are milestone IDs** that are only ever added, never removed:
  - `good-18`, `good-36`, … (one per 18 Good Days)
  - `streak#1`, `streak#2`, … (qualifying 21-Goal-Day runs)
  - `participation-90`
- **Why this prevents duplicates:** an edit can't award the same milestone twice, and toggling a day back and forth adds nothing.
- **Credits from Version 4 are kept and count toward the new series**, so the same effort is never paid twice. That covers `target-14`, `target-28`, … and `streak-YYYY-MM-DD`. Example: two old `target-*` credits mean the next cumulative credit comes at 54 Good Days.
- **Balance** = claimed milestones − spent.
- **Pit Stop rules:**
  - Activation is manual and costs 1 credit.
  - It closes tracking for that journey until midnight and survives reloads.
  - Up to 3 consecutive days.
  - **Cooldown** after a run of 1, 2 or 3 days: 3, 5 or 7 full days, starting after the run ends. Example: Mon–Wed run → the next eligible day is the following Thursday.
  - Cooldown blocks Pit Stops only, never check-ins.
- **Each journey has its own wallet.**

### 6.4 Backups (owner decision 2), format in `docs/BACKUP-FORMAT.md`

- **File:** `{ format: "my-journey-backup", schema: 6, app, exportedAt, counts, data: { activeJourneyId, journeys, journal, prefs }, summary }`.
- **`summary`** is a readable per-journey record of rank, good days, earned badges and Pit Stop credits. It is recomputed on import.
- **Contents:** every journey, check-in, note, chapter, Pit Stop ledger and journal entry.
- **PWA file name:** `MyJourney-Backup-YYYY-MM-DD.json`. The restore picker already accepts `.mjourney`.
- **Restore** validates first, then offers:
  - **"Add to this device"** (merge): never overwrites. Clashing journeys get new IDs and a "(restored)" suffix; duplicate journal entries are skipped.
  - **"Replace everything":** with an extra confirmation.
- **Compatibility:** Build 1 / Version 4 backups (`"app": "calorie-calendar"`) still import as one journey. Newer schemas are refused.

### 6.5 Reset and delete (owner decision 3)

- **Reset journey entries:** clears that journey's check-ins, notes and Pit Stop wallet. **Keeps all journal entries**, the journey itself, its goals and its chapters. A dialog offers "Export a backup first".
- **Delete entire journey** is a separate option:
  - The dialog has an "Export a backup first" button.
  - The user must **type the journey's name** to enable deletion.
  - Linked journal entries are kept as general entries unless the user ticks a box to delete them.

### 6.6 Unified interface

- **One app:** `advanced.html` now only redirects old links to the matching screen. `app.js` is no longer used (see §9 for a leftover).
- **Bottom navigation:** Today · History · Insights · Journal · Journeys. Settings and backup sit behind the header button.
- **History:** month / year / lifetime calendars and a chapters timeline.
- **Insights:**
  - Good Days %.
  - 7/30/90/365-day windows.
  - Totals for the month, year and lifetime.
  - The 30-day rolling trend.
  - Month comparison.
  - Ranks: First Step 0, Explorer 5, Wayfinder 15, Pathfinder 30, Trailblazer 50, Pacesetter 100, Veteran 180, Master of the Journey 365 and Living Legacy 730 good days.
  - Milestones: first entry, 10/50/100 recorded days, 25/100 Goal Days.
- **Journal:**
  - Several entries per day.
  - Types: reflection, note or milestone.
  - Optional link to a journey.
  - Filters by type and journey, plus search.
  - Edit, and delete with confirmation.
- **Journeys:**
  - List and switch journeys.
  - Templates: Mindful eating, Walking, Reading, Saving money, Screen time, Practice. All wording is editable and no numbers are prescribed.
  - Custom journeys and icon choice.
  - Editing a journey starts a new chapter when the questions change.
  - First launch shows the create-journey screen, with no fake data.
- **Pit Stops screen:**
  - Available / earned / used credits.
  - Eligibility explanation.
  - "Take a Pit Stop today" button.
  - Earning rules and progress.
  - Cooldown rules.
  - History of Pit Stops taken.
- **Settings:**
  - Export and restore.
  - Last backup date.
  - **Backup reminder:** off, weekly, every 2 weeks, monthly or every 2 months. Dismissible.
  - The data-loss warning.
  - Reset and delete.
  - About.
- **Other:**
  - `navigator.storage.persist()` is requested.
  - The day rolls over at midnight.
  - Changes in other tabs are picked up.
  - Status glyphs accompany colours, for accessibility.
  - 44 px+ touch targets.
  - No horizontal scroll at 320 px.
- **App icons:** new, in the midnight-blue palette, generated by `tools/make-icons.js`.

### 6.7 First Journey Path redesign (later replaced in Build 3)

This was a Canvas 2D perspective road seen from behind, with layered mountains and 3D foothills. It was superseded once the owner supplied the reference image.

### 6.8 Bugs found and fixed during Build 2 testing

- **Hidden-canvas resize:** while the canvas was hidden (on another screen), the resize observer reported 0×0. The renderer rebuilt at 1×1 px, and after every check-in the road was never redrawn and couldn't be tapped. Fixed: resizes are ignored while the canvas is hidden.
- **Startup on another screen:** if the app opened on another screen, the canvas had no size yet. Fixed: it measures on first use.
- **Negative animation time:** the first animation timestamp could be earlier than the start time, producing NaN. Fixed.
- **Routing:** reloading on the journey form showed a blank new-journey form. Startup now goes to Today when journeys exist.

---

## 7. Build 3: the approved art direction (commit `a4961f0`)

### 7.1 Journey Path renderer rebuilt, `road.js` (Canvas 2D)

- **Composition, matching the reference:**
  - The road is a **fixed, art-directed Catmull-Rom spline** on the ground plane, viewed by a static perspective camera.
  - It enters from the **lower-left** as a glowing ribbon of tiles and **rises across the scene**.
  - It then **winds away to the right and climbs into a mountain pass** where the sun rises.
  - Beyond the newest day, the road continues as luminous cyan into the distance. **There is no end.**
- **Real data only:**
  - Each tile is one recorded day, in date order, with the oldest nearest the viewer. Older tiles pass off the left edge.
  - Editing a past day recolours that same tile with a highlight pulse, never adding a duplicate.
- **Pins (map markers),** as in the reference:
  - They mark the newest day plus the most recent visible day of each other kind: up to 4–5 pins, never overlapping.
  - Glyphs: ✓ Goal, ✓ Progress, ! Detour, ‖ Pit Stop.
  - Tapping a pin or a tile opens that day's details: date, status, the goal from that day's chapter, the note and that day's journal entries.
- **Check-in animation:**
  - The new tile sweeps in at the end of the road and its pin drops in with a small bounce.
  - **Once the road has reached its resting length,** the whole road glides back one tile toward the viewer, so the journey "moves forward". On a new journey the road simply grows toward the mountains until it reaches that length.
- **Ambient animation:** a light pulse travels along the road already travelled, as in the reference GIF. It runs at about 30 fps, only while Today is visible and the page is in the foreground.
- **Reduced motion:** everything is completely static.
- **Scenery** is rendered once per size into an offscreen canvas:
  - Starry midnight sky.
  - A small warm sun core inside a wide cool-blue glow, sitting in a mountain pass.
  - Three mountain ranges built from massive peaks, with sunlit faces toward the pass, shadowed faces away from it, and light-catching ridgelines.
  - Valley mist, rolling hills, pine tree lines and a vignette.
- **Neon bloom:** the road is redrawn into a 1/3-size canvas and scaled up with additive blending, giving a cheap glow.
- **Performance:** about 0.9 ms per frame with 10 years of history (3,650 days). This was measured in headless Chromium on a cloud computer, **not on a phone**.
- **Public interface, used by `v5.js` and the tests:**
  - `new JourneyRoad(canvas, { onSelectDay })`
  - `setDays(days, { changed, intro })`
  - `setActive(bool)`
  - Properties: `days`, `anims`, `camZ` (the newest tile's position along the road), `targetCam(n)`, `hit`, `pins`.

### 7.2 Today layout, matching the reference

- **Header:** ☰ (opens Settings), the italic **"My Journey"** wordmark with a gradient swoosh, and a 🔔 bell. The bell opens a reminders sheet (backup status and Pit Stop availability) and shows a dot when a backup is due. On Today the header sits inside the scene.
- **Journey row inside the scene:** a circular glowing badge (a cyan target icon when no emoji is chosen), the journey name ⌄ (opens Journeys), and "Current Journey • *summary*".
- **Good Days %** on the right, with "Good Days" and a small cyan bar whose width equals the percentage.
- **Glass stats panel** at the bottom of the scene: Goal / Progress / Detour / Pit Stop **Days**, with round SVG badges that match the pins.
- **Below the scene:** the "Check In Today" button (or a card with today's status and Edit, or the purple Pit Stop Day card), a Pit Stop credits row and the month calendar.
- **New `summary` field** per journey (for example "Around 2,100 calories"). It's optional and editable in the journey form, and migration fills it in for calorie journeys.

### 7.3 Fixes in Build 3

- **Routing:** routes now use `#/screen` instead of `#screen`. The old hashes matched section IDs, so the browser treated them as in-page anchors and **scrolled the header off screen** when switching screens. That bug was also present in Build 2. Old `#screen` links and `advanced.html#…` links still work.

### 7.4 Comparison images

- `docs/build3-vs-reference.png`: the reference beside the running app.
- `docs/build3-checkin-animation.png`: the check-in sequence.

---

## 8. Current file map

| File | Purpose |
|---|---|
| `index.html` | The whole app shell: all screens, dialogs, header and tab bar |
| `v5.css` | The midnight-blue design system. The Build 3 reference-layout styles are appended at the end. |
| `v5.js` | Interface logic: rendering, events and routing (`#/today`, `#/history`, `#/insights`, `#/journal`, `#/journeys`, `#/journeyForm`, `#/check`, `#/pit`, `#/settings`). It holds no business rules. |
| `core.js` | All data rules: storage, migration, classification, stats, chapters, Pit Stop ledger, achievements, backups, reset and delete |
| `road.js` | The Journey Path renderer |
| `sw.js` | Service worker: precaches everything, cache-first, cache name `my-journey-v5-build3-20261119`. **Bump the name on every release.** |
| `manifest.webmanifest` | PWA manifest |
| `advanced.html` | Redirect only (old links → matching screen) |
| `icon-*.png` | App icons |
| `tests/core.test.js`, `tests/run.js` | Unit tests and browser tests |
| `tools/make-icons.js`, `tools/road-lab.html` | Development tools |
| `docs/AUDIT.md`, `docs/BUILD-NOTES.md`, `docs/BACKUP-FORMAT.md` | Audit, per-build change log and backup specification |
| `docs/reference/approved-journey-path.png` | The approved art reference |

---

## 9. Known issues, caveats and honest limitations

1. **`app.js` is still in the repository.** Build 2 meant to delete it, but the delete command failed silently. Nothing loads it (not `index.html`, not the service worker), so it's harmless. It should be deleted with `git rm app.js`.
2. **No real-device testing yet.** Everything was verified in headless Chromium only. In particular:
   - iOS Safari and installed-PWA behaviour.
   - The iOS Files app import/export hand-off.
   - Android Chrome.
   - Service-worker updates on an installed app (updates appear on the second launch after deploying).
   - Smoothness of the animation on low-end phones.
   - `backdrop-filter` and `<dialog>` support. Both need iOS 15.4+.
3. **Phone portrait only.** The road composition was tuned for phone-portrait widths (about 320–500 px). Tablets, landscape and desktop widths have not been art-checked.
4. **Visual gaps versus the reference:**
   - The reference is a wide image; the phone layout is taller and stacks a bit more vertically.
   - The mountains are drawn procedurally, so they look more stylised than the painted reference.
   - The road has no fine surface texture.
   - The rounded font (`ui-rounded`) exists only on Apple devices; other platforms fall back to the system font.
5. **Storage:**
   - Data lives in `localStorage`, about 5 MB per site. Ten years of one journey is roughly 300 KB, but very large journals could approach the limit.
   - Writes are protected by a "storage full" alert, but there is no usage indicator.
   - IndexedDB, or native storage in the packaged app, is advisable before release.
6. **The road's forward motion is designed, not literal.** The road shape is fixed and the tiles slide along it. This was chosen deliberately so the composition always matches the reference.
7. **The chapter rebuild during migration is a best effort.** The date of the final settings change isn't known, so that chapter is dated the day after the last recorded entry.
8. **Locale:** all dates are en-US formatted, and there is no localisation.
9. **Not built:**
   - Archiving journeys (the `archived` field exists but has no interface).
   - Reordering journeys.
   - Password-protected backups (optional per the owner).
   - System notifications for backup reminders (the reminder is in-app only).

---

## 10. What still needs to be done (recommended order)

### A. Immediately
1. **Owner visual review** of Build 3 on a real phone, then art polish if requested: mountain painting detail, road texture, pin sizes, wordmark.
2. **Delete the leftover `app.js`.**
3. **Real-device test pass**, then fix whatever it finds:
   - iPhone Safari, plus Add to Home Screen.
   - Android Chrome, plus install.
   - Offline launch.
   - Export → restore on another device in both directions (iPhone ↔ Android).
   - Midnight rollover.
   - Reduced motion.
   - VoiceOver and TalkBack.
   - Small (320 px) and large phones.

### B. Before commercial release
4. **Storage hardening:** move to IndexedDB (or native storage after packaging), with a verified migration from `my-journey-data-v6`. Add a storage-usage readout.
5. **Accessibility audit:** contrast, screen-reader labels for the road and pins, dynamic type, focus order inside dialogs.
6. **Journey management:** archive and unarchive, reorder, and optionally duplicate a journey.
7. **Tablet and landscape layouts**, with the road composition checked at those sizes.
8. **Optional features the owner has mentioned:** password-protected backups (with a clear "a forgotten password means no recovery" warning), and native local notifications for backup reminders.

### C. Native packaging and the store (Phase 7 of the original plan)
9. **Wrap the PWA with Capacitor.** It suits this codebase: static files, no build step. Then add:
   - iOS and Android projects, a splash screen and icons.
   - **Registration of the `.mjourney` file type**, so backups open in the app.
   - Native share and save for backups (Files app, Google Drive picker).
   - Native file storage.
10. **One-time purchase:**
    - Apple StoreKit and Google Play Billing, with "Restore purchase".
    - **No custom licence server.** Purchases are platform-specific; a user moving between platforms buys again.
    - Personal data still moves across platforms through the backup file.
    - The app must work offline once entitlement is established.
11. **Store compliance:**
    - Privacy labels ("no data collected": nothing leaves the device).
    - Store listings, screenshots and age rating.
    - App signing.
    - Release and upgrade testing, including migration from a PWA install. PWA and native storage are separate, so users will need export → import; document this.

### D. Things that are decided and should NOT be changed without the owner
- Pit Stop rules (18 Good Days / 21-Goal-Day streak / 90 recorded days; cooldowns 3/5/7; at most 3 in a row).
- The backup format (schema 6). Extend it only with a schema bump, and keep importing older schemas.
- Reset keeps the journal; delete is separate and requires typing the journey's name.
- The visual direction is the reference image: midnight blue, a glowing day-tile road and a sunrise pass.
- No ads, accounts, subscriptions or cloud services.

---

## 11. Notes for whoever continues

- **Rules live in `core.js` only.** Change logic there and add tests to `tests/core.test.js`. Keep `v5.js` free of business rules.
- **Never write over user data without validating first.** Follow the existing pattern: parse → validate → show a summary → confirm → write.
- **When changing the stored format:** bump `SCHEMA`, add a migration that keeps the old copy, and extend `parseBackup` so older backups still import.
- **After any visual change to the road,** compare it with `docs/reference/approved-journey-path.png` using `tools/road-lab.html`, and rerun `node tests/run.js` (several tests check the road against real data).
- **Bump `CACHE` in `sw.js`** on every release, or installed apps won't update.
- **Be honest about testing.** Say what was verified and where; nothing has been tested on a real phone so far.
