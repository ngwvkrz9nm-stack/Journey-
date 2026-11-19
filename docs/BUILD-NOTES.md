# Build notes

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
