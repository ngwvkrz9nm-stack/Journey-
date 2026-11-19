# Build notes

## Version 5 — Build 2 (November 19, 2026): one app, many journeys, the new Journey Path

### Owner decisions implemented
1. **Pit Stop credits:**
   - 1 credit for every **18 Good Days** (Goal + Progress).
   - 1 bonus credit for each run of 21 consecutive Goal Days.
   - 1 one-time credit at 90 recorded days.
   - Cooldown and consecutive-day rules are unchanged.
   - Credits are milestone IDs that are never removed, so editing history can neither duplicate nor take back a credit.
   - Credits earned under Version 4 (`target-14`, `target-28`, …) are kept and count toward the new 18-Good-Day series, so the same effort is never paid twice.
2. **Backup format:**
   - JSON in the PWA (`MyJourney-Backup-YYYY-MM-DD.json`).
   - The format is versioned (`schema: 6`) and platform-independent. Native apps will use the `.mjourney` extension for the same content (see `docs/BACKUP-FORMAT.md`). The restore picker already accepts `.mjourney`.
   - It contains every journey, check-in, note, goal chapter, Pit Stop ledger, journal entry, and an achievements/credits summary.
3. **Reset vs delete:**
   - *Reset journey entries* clears one journey's check-ins, notes and Pit Stop wallet, and **keeps all journal entries**.
   - *Delete entire journey* is separate. It offers "Export a backup first" and requires typing the journey's name. Linked journal entries are kept as general entries unless you tick a box.

### Data model and migration
- New store `my-journey-data-v6`: multiple journeys, each with its own days, goal chapters, Pit Stop wallet and road, plus a shared journal (entries can be linked to a journey, or not).
- **Automatic one-time migration** from Build 1 / Version 4 data:
  - Days, notes, Pit Stop days, the wallet, the journal and the last-backup date are carried over.
  - Goal **chapters are rebuilt** from the target/limit each day was saved with.
  - The result is verified before it is written. If anything doesn't match, nothing is written and the user is told.
  - **The original keys are left untouched** as a fallback copy.
- If stored data can't be read, the app becomes read-only rather than overwriting it.
- All rules live in `core.js` (pure JavaScript, unit-tested in Node). The old duplicate rule set (`app.js`) is gone.

### Journey Path (`road.js`), redrawn from scratch
- Canvas with true 3D perspective: a raised camera looks down a winding road that narrows toward the horizon.
- The scenery is layered:
  - **Sky:** stars, and a cool cyan horizon light.
  - **Mountains:** four ranges, paler and hazier with distance, rim-lit by the horizon.
  - **Valley:** mist bands, and foothills placed in 3D beside the road. The road disappears behind them and reappears, then winds into the far range.
- **Every section is a real recorded day.** Sections are laid into the road surface, coloured Goal, Progress, Detour or Pit Stop, in date order. The road ahead (dashed, with a soft travelling light) continues to the horizon with no end.
- **Check-in:** the new section grows out of the road, then the camera glides forward. Older sections pass beneath the viewer, and nothing is removed.
- **Edits:** editing a past day recolours that section with a highlight pulse, without adding a duplicate.
- **Interaction:** tap any section to see its date, status, the goal at the time, its note and that day's journal entries.
- **Empty journeys:** a new journey starts with the viewer at the beginning of an open road, with no fake history.
- **Performance and accessibility:**
  - Scenery is pre-rendered once per size; each frame draws only about 20 polygons.
  - Ambient motion runs at about 30 fps only while Today is on screen. It stops on other screens, in background tabs, and with reduced motion (no animation at all).
  - The road has a descriptive accessible label.

### Interface (`index.html`, `v5.css`, `v5.js`)
- One app with the approved bottom navigation: **Today · History · Insights · Journal · Journeys**. Settings and backup sit behind ⚙.
- The old advanced screens are rebuilt in the midnight-blue system:
  - **History:** month, year and lifetime views, plus a chapters timeline.
  - **Insights:** windows, totals, the trend chart, month comparison, ranks and milestones.
  - **Pit Stops:** the wallet, eligibility, earning progress and history.
  - `advanced.html` now redirects old links to the matching screen.
- **Journeys:** templates (all wording editable, no prescribed numbers), custom journeys, icons, switching, and editing. Editing a goal starts a new chapter.
- **Journal:** several entries per day; reflection, note or milestone types; optional journey link; filters; search; edit; and delete with confirmation.
- **Today:** the journey's name and goal, the road with the Good Days %, totals, check-in status, a Pit Stop summary and the calendar.
- **Accessibility:** status glyphs (★ ✓ ↝ ☕) alongside colours, `aria-pressed` answers, 44 px+ touch targets, and no horizontal scroll at 320 px.
- **Other:**
  - An optional backup reminder (off, weekly, fortnightly, monthly, or every two months), dismissible.
  - Storage persistence is requested.
  - The day rolls over at midnight without a reload.
- New app icons in the approved palette (`tools/make-icons.js`).
- Service-worker cache bumped to `my-journey-v5-build2-20261119`.

### How it was tested
- `node tests/core.test.js` passes **55/55**: migration (including chapter rebuild and untouched originals), the 18/21/90 credit rules, Version 4 credit carry-over, no-duplicate edits, cooldowns, statistics, chapters, backup round trip and merge, reset and delete.
- `node tests/run.js` passes **63/63** in headless Chromium at 390×844: upgrade from Build 1 data; first launch; templates; the road matching data (append, edit in place, detour, tap to inspect, reduced motion); multiple independent journeys; chapters; journal; Pit Stops; export, replace, merge, invalid-file handling and Build 1 import; reset; delete; midnight rollover; old links; and 320 px width.
- **Not tested:** real iPhone and Android hardware, iOS file import/export hand-off, installed-PWA updates, and frame rate on low-end phones.

## Version 5 — Build 1 (November 19, 2026): Stabilise

Existing data is preserved: no storage keys were renamed or migrated. Prototype 2 data loads unchanged.

### Changed
**Backup and restore (`app.js`, `advanced.html`)**
- The export now includes the **journal** and is schema version 5. The file is named `MyJourney-Backup-YYYY-MM-DD.json`.
- Restore keeps **Pit Stop days**. Previously they were silently dropped.
- Restore validates the whole file before writing anything, then shows a summary and states what will be replaced.
- An older backup with no journal keeps the device's current journal.
- Backups from newer versions, and files that are not My Journey backups, are refused with "Nothing on this device was changed."
- Settings are imported field by field, with validation.
- The Settings tab shows when a backup was last exported, and warns that lost data cannot be recovered without a backup.
- The Reset confirmation now says exactly what is deleted and what is kept.

**Advanced page**
- `advanced.html#settings`, `#pitstops`, `#insights` and the other tab names open the right tab, so the home ⚙ / ☰ / More buttons now land where they say.
- Added a "‹ Today" link. The advanced page was a dead end in an installed app.
- Choosing "goal met" sets "boundary met", and choosing "boundary missed" clears "goal met", matching the home screen.
- The Detour legend colour now matches the amber Detour days.

**Home screen (`v5.js`)**
- The day rolls over at local midnight while the app stays open, without a reload, so typed text is not lost.
- Future days and days before the journey start date can't be selected.
- Journey Path: each recorded day is a fixed-length section, and untravelled dotted road always continues ahead, so there is no finish line. A brand-new journey shows only the road ahead and no fake history.
- The road animation no longer parses storage every frame and idles while another screen is open.
- Journal: an explicit **Delete entry** with confirmation; saving empty text asks before deleting.
- Users with only V2-era goals saved now see those goals instead of defaults.

**Other**
- Service-worker cache bumped to `my-journey-v5-build1-20261119`, so installed copies update.
- `tests/run.js`: a 40-check Playwright regression suite.

### How it was tested
`node tests/run.js` passes 40/40 checks in headless Chromium at phone size. It covers: backup round trip; V4 backup import; rejection of invalid and newer files; tab deep links; answer consistency; the Pit Stop cooldown boundary (Mon–Wed run → Thursday a week later); the empty-journey road; the first check-in; the 18-day road window; Good Days %; the midnight rollover (mocked clock); and journal delete.

**Not tested:** real iPhone or Android devices, iOS file import/export hand-off, offline install, and service-worker updates on a device.

### Not in this build (planned; see `docs/AUDIT.md` §6)
Multiple journeys, goal chapters, journal v2, Journeys tab, Pit Stop info on Today, and the cinematic Journey Path redesign.
