# My Journey — Technical Audit of Version 5 Prototype 2

Audit date: November 19, 2026 · Audited build: V5 Prototype 2 (commit `f3aabc8`, unmodified upload)

Method: I read all of the source and ran it in headless Chromium (Playwright) at an iPhone-sized 390×844 viewport,
with seeded data. **No testing was done on a real iPhone or Android device.** Anything below marked
*verified* was run in that browser. Anything marked *code-level* was found by reading the code only.

---

## 1. File-by-file audit

| File | Role | Findings |
|---|---|---|
| `index.html` | V5 home shell: Today, History, Insights, Journal screens, check-in screen, bottom nav | Clean semantic structure. The bottom nav ends in **More**, not the approved **Journeys**. The menu (☰) and gear (⚙) buttons both go to the same place. `.stars` has no styles. |
| `v5.js` | V5 logic: home stats, month calendar, SVG road, check-in, journal, simple insights/history | Reads the same storage keys as V4, so the two pages share data. Defects are in §3. Contains no Pit Stop logic. |
| `v5.css` | V5 midnight-blue theme | Matches the approved palette. Mountains are three flat `clip-path` polygons. Has a reduced-motion override. |
| `advanced.html` | The V4 app with dark styling, opened from V5 for settings, Pit Stops, achievements, detailed insights, year/lifetime calendar, backup | Had no way back to the home screen (a dead end in an installed PWA). Two conflicting `.dot.bad` rules made the Detour legend **red** while Detour days were **amber**. |
| `app.js` | V4 logic, including the only Pit Stop, ranks, achievements, settings and backup code | Its Pit Stop and cooldown logic is correct (*verified*). Its backup was incomplete and its restore lost data (§4). It ignored the `#tab` links V5 sends. |
| `sw.js` | Service worker, cache-first, versioned cache name | Works for offline use. Updates only reach users when the cache name changes. Cache-first means a new version shows on the second launch after deploy. |
| `manifest.webmanifest` | PWA manifest | Valid. `id`, `scope` and `start_url` are relative, which suits Netlify Drop. |
| `icon-*.png` | App icons | Correct sizes, but they show the **old red/green-on-white calendar**, not the midnight-blue identity, and red is no longer a status colour. |

**Data storage (all `localStorage`, one implicit journey):**

| Key | Contents | Written by |
|---|---|---|
| `calorie-calendar-v1` | `{ "YYYY-MM-DD": {q1,q2,result,note,target,limit,journeyType} \| {pitstop:true,note,journeyType} }` | both pages |
| `journey-calendar-settings-v3` | name, type, target, limit, start, habit questions | advanced |
| `calorie-calendar-goals-v2` | legacy target/limit (V2) | advanced (mirror) |
| `journey-pit-wallet-v4` | `{spent:[{date,at}], claimed:{awardId:true}}` | advanced |
| `my-journey-journal-v5` | `{ "YYYY-MM-DD": "text" }`, one entry per date | home |

## 2. Features that work in Prototype 2

| Feature | Status |
|---|---|
| Two-question check-in on the home screen, with contradiction prevention ("goal met" implies "boundary met") | verified |
| Goal / Progress / Detour / Pit Stop classification from stored answers | verified |
| Good Days % = (Goal + Progress) ÷ (Goal + Progress + Detour), with Pit Stops and unrecorded days excluded | verified |
| Each saved day keeps the target/limit of the time it was recorded, so goal changes don't reclassify the past | code-level |
| Month calendar on home and on the advanced page; year and lifetime views on the advanced page | verified |
| Editing past days (advanced page and home calendar) | verified |
| Pit Stop wallet: 14 Target Days → 1 credit; 21-day Target streak → 1 credit per run; one-time 90-recorded-day credit; claimed IDs stop double awards | code-level |
| Pit Stop cooldowns 3/5/7 days, continuing a run of up to 3 days, Mon–Wed run → next eligible the following Thursday | verified |
| Pit Stop day locks tracking for that date and survives reloads | code-level |
| Ranks and achievements (cumulative, never decrease) | code-level |
| 7/30/90/365-day windows, 30-day rolling trend chart, month comparison (advanced page) | code-level |
| Road segments are generated from real stored entries, in date order | verified |
| Reduced-motion: the reveal animation and road transform are skipped | code-level |
| Offline after first load (service worker precache) | code-level, not run on a device |

## 3. Broken or incomplete features

**Fixed in Build 1** (details in `docs/BUILD-NOTES.md`):

1. **Journal missing from backups.** *verified.* Export left out `my-journey-journal-v5`, so users who believed they were backed up would have lost every journal entry.
2. **Restore deleted Pit Stop days.** *verified.* Import kept only entries with yes/no answers. Pit Stop days vanished from the calendar, and their cooldown history went with them.
3. `advanced.html#settings` / `#pitstops` / `#insights` all opened the Calendar tab. *verified.*
4. No route back from the advanced page to Today. *verified.*
5. On the advanced page you could save "goal met" + "boundary missed". *verified.*
6. The Detour legend colour (red) didn't match Detour days (amber). *verified.*
7. The home screen kept yesterday's date after midnight if the app stayed open, so the next check-in was recorded on the wrong day. *code-level, fixed and verified with a mocked clock.*
8. The home screen allowed check-ins before the journey start date (the advanced page blocked them). *code-level.*
9. **The road had a built-in "finish line".** One recorded day was stretched over the whole road, so the road always looked complete. *verified.*
10. The road animation re-read and re-sorted all of localStorage on **every frame**, even while another screen was showing. That is a battery and performance problem with years of history. *code-level.*
11. Saving an empty journal entry silently deleted it, and there was no explicit delete. *code-level.*
12. Users who had never opened V4 settings saw default goals on the home screen instead of their V2 goals. *code-level.*

**Still missing or incomplete (planned):**

- **Multiple journeys: not implemented at all.** There is one global data set. This is the largest gap.
- **Goal chapters:** only per-day snapshots of target/limit exist. There is no chapter record, and the habit question wording isn't stored per day.
- **Journal:** one entry per date, no journey association, no search/filter, no milestone or reflection types.
- **Journeys tab** in the bottom nav (currently "More").
- **Pit Stop information on the home screen** (requirement 11.6). Pit Stop logic exists only in `app.js`.
- **Two separate apps share one store.** Home (`v5.js`) and advanced (`app.js`) each have their own classifier, settings defaults and save code. Every rule lives in two places.
- **Road inspection:** tapping a section opens the check-in for that day. It does not yet show date, status, goal-at-the-time and journal.
- **History screen** mini-grid lists recorded days only, with no date alignment, so gaps are invisible.
- **Accessibility:** calendar cells use colour only (an aria-label exists, but there is no visible icon or pattern). Answer buttons lack `aria-pressed`. Several texts are 9–10px.
- **Backup reminders** are not implemented. Build 1 records the last export date as groundwork.
- **Native packaging and purchases:** not started.

## 4. Data preservation and backup reliability

**Before Build 1, backup was not reliable.** A user who exported and restored after a phone change would have lost:
- every journal entry (never exported), and
- every Pit Stop day on the calendar (dropped on import), while the wallet still counted them as spent.

Other risks found:
- Import merged arbitrary fields from the file into settings without type checks.
- A restore failure could not partially write, but the messages did not say nothing had changed.
- There was no schema guard against importing a file from a future version.
- Reset deleted the Pit Stop wallet but said it only deleted "entries and notes".

**After Build 1** (verified by `tests/run.js`):
- The export (version 5) contains entries, Pit Stop days, the journal, the Pit Stop ledger and settings, and is named `MyJourney-Backup-YYYY-MM-DD.json`.
- Export → wipe → restore reproduces entries, journal and wallet exactly.
- The whole file is validated first and nothing is written until the user confirms a summary (days, Pit Stops, journal entries, and what will be replaced).
- Older V4 backups still import. Because they contain no journal, the current journal is **kept**, and the confirmation says so.
- Files from a newer schema, and files that are not My Journey backups, are refused. The message states that nothing changed.
- Settings are imported field by field, with validation.

**Remaining risks:**
- All data lives in `localStorage`. iOS Safari can evict storage for sites not added to the Home Screen after about 7 days without use. Installed PWAs are exempt in practice, but this is not guaranteed. Phase 2 should call `navigator.storage.persist()` and consider IndexedDB.
- No real-device import has been tested. On iOS, the file picker and the Files app hand-off need checking.
- The Phase 2 multi-journey migration is the next point where data could be lost. It must be a one-way, verified migration that keeps the old keys until it succeeds.

## 5. Implemented UI vs. approved visual direction

| Approved | Prototype 2 | Gap |
|---|---|---|
| Midnight navy background, crisp white type, dark restrained panels | Present | Small. Typography sizes need a pass (several 8–10px labels). |
| Layered mountains, distant illuminated horizon, atmosphere | 3 flat polygon layers, one radial "sun" glow | **Large.** No depth haze, ridgeline detail or stars, and the horizon glow reads orange, not cyan/blue. |
| Winding illuminated road extending into the distance (perspective) | A flat sine curve across the card, side-on, uniform width | **Large.** There is no perspective (narrowing toward the horizon), so it reads as a chart line, not a road. |
| Colour-coded daily sections | Present, from real data | Build 1 made sections a fixed length, with untravelled road ahead. |
| Soft blue/cyan light travelling along the road | A white dot that drifts slightly | Medium. |
| Forward viewpoint motion on new day | Small translate/scale on the whole SVG | Medium. It reads as a jiggle, not as moving forward. |
| Bottom nav Today/History/Insights/Journal/**Journeys** | "More" instead of Journeys | Small (depends on the multi-journey work). |
| Premium single app | The advanced page is a different, older visual system (grey-blue V4 panels) | **Large.** Settings, Pit Stops and achievements still feel like a different app. |
| App icon | Old red/green calendar on white | Needs a new icon in the approved palette. |

## 6. Prioritised plan

| # | Increment | Why first | Status |
|---|---|---|---|
| 1 | **Build 1: Stabilise.** Complete backup/restore, navigation dead ends, midnight rollover, answer consistency, road truthfulness and performance, journal delete, regression tests | Data loss bugs come before anything else | **Done this session** |
| 2 | **Build 2: Unified core + data model v5.** One shared `core.js` (classification, stats, Pit Stop ledger, storage); a `journeys[]` model with per-journey entries, chapters, wallet and journal links; a one-time verified migration from the V4 keys, with old keys retained; `navigator.storage.persist()` | Multiple journeys and chapters require it, and it removes the duplicate rule sets | Next |
| 3 | **Build 3: Core features on the new model.** Journeys tab (create from templates or custom, edit, archive, switch); chapters recorded on goal change and shown in History; journal v2 (many entries, journey link, type filter, search); Pit Stop summary on Today | Approved functionality | Planned |
| 4 | **Build 4: Universal backup v6.** All journeys, chapters and journals; `.mjourney` extension decision; per-journey or full restore with replace-vs-merge choice; optional reminders | Must follow the data model | Planned |
| 5 | **Build 5: Journey Path visual pass.** Perspective road with depth narrowing, layered atmospheric mountains, cyan travelling light, forward-camera reveal, inspect-a-section sheet; then fold the advanced page into the V5 visual system | The visual centerpiece, done once the data under it is final | Planned |
| 6 | Mobile and accessibility pass, plus real-device testing on iPhone and Android | | Planned |
| 7 | Native packaging (Capacitor is the likely fit: no framework, static files) and store purchases | | Planned |

### Decisions needed from the owner
1. **Pit Stop earning rule:** Build 1 keeps V4 behaviour (Goal Days only, 14/21/90). Should Progress Days count (the "18 good days" proposal)?
2. **Backup extension:** keep `.json` for now? On iOS, a custom `.mjourney` extension can be greyed out in the file picker until the native app registers the type. Recommendation: `.json` in the PWA, and `.mjourney` once native.
3. **Reset:** should "Reset journey entries" also delete the journal? Build 1 keeps it and says so.
