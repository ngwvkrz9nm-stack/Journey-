# My Journey backup format (schema 6)

One format for every platform. The PWA saves it as `MyJourney-Backup-YYYY-MM-DD.json`. The native iPhone and Android apps
will save the same bytes with the `.mjourney` extension and register that type, so a backup made on either platform restores on the other.

```jsonc
{
  "format": "my-journey-backup",   // identifies the file
  "schema": 6,                     // apps refuse files with a newer schema than they understand
  "app": "My Journey",
  "exportedAt": "2026-11-19T19:00:00.000Z",
  "counts": { "journeys": 2, "days": 120, "journal": 14 },
  "data": {
    "activeJourneyId": "j-…",
    "journeys": [{
      "id": "j-…", "name": "Mindful eating", "icon": "🍽", "start": "2026-01-01", "template": "eating", "createdAt": "…", "archived": false,
      "goal": "Did I stay around 2,100 calories?",            // current question 1
      "boundary": "Did I stay at or below 3,000 calories?",   // current question 2
      "chapters": [ { "from": "2026-01-01", "goal": "…2,300…", "boundary": "…3,200…" }, { "from": "2026-09-01", "goal": "…", "boundary": "…" } ],
      "entries": {                                            // keyed by local calendar date
        "2026-11-18": { "q1": "yes", "q2": "yes", "result": "good", "note": "", "at": "…" },
        "2026-11-19": { "pitstop": true, "note": "", "at": "…" }
      },
      "pit": { "spent": [ { "date": "2026-11-19", "at": "…" } ], "claimed": { "good-18": true, "streak#1": true, "participation-90": true } }
    }],
    "journal": [ { "id": "n-…", "date": "2026-11-18", "journeyId": "j-…", "type": "reflection", "text": "…", "createdAt": "…", "updatedAt": "" } ],
    "prefs": { "backupReminderDays": 30 }
  },
  "summary": [ { "journeyId": "j-…", "name": "…", "rank": "Pathfinder", "goodDays": 42, "badges": ["First Entry"], "pitCredits": { "earned": 2, "spent": 1, "available": 1 } } ]
}
```

Rules:
- **The classification is derived from the answers.** `result: "bad"` → Detour. Otherwise `q1: "yes"` → Goal, and `q1: "no"` → Progress. `pitstop: true` → Pit Stop.
- **`pit.claimed` holds the earned milestones and is never shrunk.** The balance is the number of claimed milestones minus `spent.length`.
- **`summary` is a readable record only.** It is recomputed on import.
- **Restore validates the whole file before anything is written.** It offers *Add to this device* (merge, never overwriting) or *Replace everything*.
- **Older backups still import.** Version 4 / Build 1 files (`"app": "calorie-calendar"`) are converted into one journey.
