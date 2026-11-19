/* My Journey — core data model (schema 6).
 * Pure logic with no DOM access: storage, migration, classification, statistics,
 * Pit Stop ledger, achievements and backups. Runs in the browser (window.MJ) and in Node (tests).
 */
(function (root) {
'use strict';

/* ---------- dates (always local calendar days) ---------- */
const pad = n => String(n).padStart(2, '0');
const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = s => new Date(s + 'T12:00:00');
const addDays = (k, n) => { const d = parseDate(k); d.setDate(d.getDate() + n); return dateKey(d); };
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && dateKey(parseDate(s)) === s;
const todayKey = () => dateKey(new Date());
const monthKeys = (y, m) => Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) => `${y}-${pad(m + 1)}-${pad(i + 1)}`);
let idCounter = 0;
const uid = p => (p || 'id') + '-' + Date.now().toString(36) + '-' + (idCounter++).toString(36) + Math.random().toString(36).slice(2, 7);
const str = (v, max, def = '') => typeof v === 'string' && v.trim() ? v.slice(0, max) : def;

const STORE_KEY = 'my-journey-data-v6';
const SCHEMA = 6;
const LEGACY = { entries: 'calorie-calendar-v1', goals: 'calorie-calendar-goals-v2', settings: 'journey-calendar-settings-v3', pit: 'journey-pit-wallet-v4', journal: 'my-journey-journal-v5', lastBackup: 'my-journey-last-backup' };

/* ---------- day classification ---------- */
// Same rules as Version 4: the stored result is authoritative, answers decide Goal vs Progress.
function kind(e) {
  if (!e || typeof e !== 'object') return null;
  if (e.pitstop === true) return 'pit';
  if (!['yes', 'no'].includes(e.q1) || !['yes', 'no'].includes(e.q2)) return null;
  if (e.result === 'bad') return 'detour';
  if (e.result === 'good') return e.q1 === 'yes' ? 'goal' : 'progress';
  return e.q2 === 'no' ? 'detour' : e.q1 === 'yes' ? 'goal' : 'progress';
}
const KIND_LABEL = { goal: 'Goal Day', progress: 'Progress Day', detour: 'Detour Day', pit: 'Pit Stop Day' };
// Meeting the full goal implies meeting the easier boundary.
function normalizeAnswers(q1, q2) { return q1 === 'yes' ? { q1: 'yes', q2: 'yes' } : { q1, q2 }; }
function makeEntry(q1, q2, note) {
  const a = normalizeAnswers(q1, q2);
  return { q1: a.q1, q2: a.q2, result: a.q2 === 'no' ? 'bad' : 'good', note: String(note || '').slice(0, 2000), at: new Date().toISOString() };
}

/* ---------- journeys ---------- */
const TEMPLATES = [
  { id: 'custom', name: '', icon: '◆', goal: '', boundary: '', label: 'Custom journey' },
  { id: 'eating', name: 'Mindful eating', icon: '🍽', goal: 'Did I stay around my calorie target today?', boundary: 'Did I stay at or below my upper limit today?', label: 'Mindful eating' },
  { id: 'walking', name: 'Walking', icon: '🚶', goal: 'Did I complete my full walk today?', boundary: 'Did I walk at least my minimum today?', label: 'Walking or exercise' },
  { id: 'reading', name: 'Reading', icon: '📖', goal: 'Did I read for my full goal today?', boundary: 'Did I read at least a little today?', label: 'Reading' },
  { id: 'saving', name: 'Saving money', icon: '💰', goal: 'Did I stay within my spending plan today?', boundary: 'Did I avoid my biggest spending trigger today?', label: 'Saving money' },
  { id: 'screen', name: 'Screen time', icon: '📵', goal: 'Did I stay under my screen-time goal today?', boundary: 'Did I stay under my upper screen-time limit?', label: 'Limiting screen time' },
  { id: 'practice', name: 'Practice', icon: '🎵', goal: 'Did I complete my full practice session today?', boundary: 'Did I practice at least my minimum today?', label: 'Practicing a skill' }
];
function newJourney({ name, icon, goal, boundary, start, template, summary }) {
  const s = isDate(start) ? start : todayKey();
  return { id: uid('j'), name: str(name, 60, 'My journey'), icon: str(icon, 4, '◆'), summary: str(summary, 60, ''), goal: str(goal, 160, 'Did I meet my goal today?'), boundary: str(boundary, 160, 'Did I stay within my progress boundary today?'), start: s, template: template || 'custom', createdAt: new Date().toISOString(), archived: false, chapters: [{ from: s, goal: str(goal, 160, 'Did I meet my goal today?'), boundary: str(boundary, 160, 'Did I stay within my progress boundary today?') }], entries: {}, pit: { spent: [], claimed: {} } };
}
function sortedKeys(entries) { return Object.keys(entries).filter(isDate).sort(); }
// Goal changes become chapters. Past days keep the result recorded under their chapter.
function chapterFor(j, date) {
  let c = j.chapters[0];
  for (const ch of j.chapters) if (ch.from <= date) c = ch;
  return c || { from: j.start, goal: j.goal, boundary: j.boundary };
}
function updateJourney(j, { name, icon, goal, boundary, start, summary }, effective = todayKey()) {
  if (name !== undefined) j.name = str(name, 60, j.name);
  if (summary !== undefined) j.summary = typeof summary === 'string' ? summary.trim().slice(0, 60) : j.summary;
  if (icon !== undefined) j.icon = str(icon, 4, j.icon);
  if (isDate(start)) { j.start = start; if (j.chapters[0] && (j.chapters.length < 2 || start < j.chapters[1].from)) j.chapters[0].from = start; }
  const g = str(goal, 160, j.goal), b = str(boundary, 160, j.boundary);
  if (g !== j.goal || b !== j.boundary) {
    j.goal = g; j.boundary = b;
    const last = j.chapters[j.chapters.length - 1];
    if (last && last.from >= effective) { last.goal = g; last.boundary = b; }
    else j.chapters.push({ from: effective, goal: g, boundary: b });
  }
  return j;
}

/* ---------- statistics ---------- */
function stats(entries, keys) {
  const r = { goal: 0, progress: 0, detour: 0, pit: 0 };
  for (const k of keys || Object.keys(entries)) { const c = kind(entries[k]); if (c) r[c]++; }
  r.good = r.goal + r.progress;
  r.recorded = r.good + r.detour; // Pit Stops and unrecorded days are excluded
  r.rate = r.recorded ? Math.round(r.good / r.recorded * 100) : null;
  return r;
}
function keysBetween(a, b) { const out = []; let k = a; for (let i = 0; k <= b && i < 40000; i++) { out.push(k); k = addDays(k, 1); } return out; }
function windowStats(j, days, today) { return stats(j.entries, keysBetween(addDays(today, -days + 1), today)); }
function trend(j, today, points = 90, span = 30) {
  const out = [];
  for (let i = points - 1; i >= 0; i--) { const end = addDays(today, -i); out.push(stats(j.entries, keysBetween(addDays(end, -span + 1), end)).rate); }
  return out;
}

/* ---------- achievements (cumulative, never decrease) ---------- */
const RANKS = [['First Step', 0], ['Explorer', 5], ['Wayfinder', 15], ['Pathfinder', 30], ['Trailblazer', 50], ['Pacesetter', 100], ['Veteran', 180], ['Master of the Journey', 365], ['Living Legacy', 730]];
function achievements(j) {
  const s = stats(j.entries), recordedAny = s.recorded + s.pit;
  let idx = 0; RANKS.forEach((r, i) => { if (s.good >= r[1]) idx = i; });
  const next = RANKS[idx + 1];
  const badges = [['First Entry', 1, recordedAny], ['Ten Recorded Days', 10, recordedAny], ['Fifty Recorded Days', 50, recordedAny], ['One Hundred Recorded Days', 100, recordedAny], ['Twenty-Five Goal Days', 25, s.goal], ['One Hundred Goal Days', 100, s.goal]]
    .map(([name, need, have]) => ({ name, need, have: Math.min(have, need), earned: have >= need }));
  return { good: s.good, rank: RANKS[idx][0], rankIndex: idx, next: next ? { name: next[0], need: next[1], remaining: next[1] - s.good } : null, progress: next ? (s.good - RANKS[idx][1]) / (next[1] - RANKS[idx][1]) : 1, ranks: RANKS.map(([name, need]) => ({ name, need, earned: s.good >= need })), badges };
}

/* ---------- Pit Stop ledger ----------
 * Credits: 1 per 18 cumulative Good Days (Goal + Progress); 1 bonus per qualifying run of 21 consecutive Goal Days;
 * 1 one-time credit at 90 recorded days. Awards are milestone IDs stored in pit.claimed and never removed,
 * so editing history can neither duplicate nor take back a credit.
 * Version 4 awarded 'target-14', 'target-28', … and 'streak-YYYY-MM-DD'. Those already-claimed credits are kept and
 * count toward the same series, so the rule change does not award the same cumulative effort twice.
 */
const PIT = { goodPerCredit: 18, streak: 21, participation: 90 };
function pitAwardIds(j) {
  const keys = sortedKeys(j.entries), claimed = j.pit.claimed;
  let good = 0, recorded = 0, runs = 0, streak = 0, prev = null;
  for (const k of keys) {
    const c = kind(j.entries[k]);
    if (!c) continue;
    recorded++;
    if (c === 'goal' || c === 'progress') good++;
    if (c === 'goal') { streak = prev && addDays(prev, 1) === k ? streak + 1 : 1; prev = k; if (streak === PIT.streak) runs++; }
    else { streak = 0; prev = null; }
  }
  const legacyCum = Object.keys(claimed).filter(id => /^target-\d+$/.test(id) && claimed[id]).length;
  const legacyRuns = Object.keys(claimed).filter(id => /^streak-\d{4}-\d{2}-\d{2}$/.test(id) && claimed[id]).length;
  const ids = [];
  for (let i = legacyCum + 1; i <= Math.floor(good / PIT.goodPerCredit); i++) ids.push('good-' + i * PIT.goodPerCredit);
  for (let i = legacyRuns + 1; i <= runs; i++) ids.push('streak#' + i);
  if (recorded >= PIT.participation) ids.push('participation-90');
  return { ids, good, recorded, legacyCum };
}
function reconcilePit(j) { const r = pitAwardIds(j); let added = 0; for (const id of r.ids) if (!j.pit.claimed[id]) { j.pit.claimed[id] = true; added++; } return added; }
function pitSummary(j, today) {
  const r = pitAwardIds(j);
  const earned = Object.values(j.pit.claimed).filter(v => v === true).length;
  const cumDone = Math.max(r.legacyCum, ...Object.keys(j.pit.claimed).filter(id => /^good-\d+$/.test(id)).map(id => Number(id.slice(5)) / PIT.goodPerCredit), 0);
  const nextAt = (cumDone + 1) * PIT.goodPerCredit;
  return { earned, spent: j.pit.spent.length, balance: Math.max(0, earned - j.pit.spent.length), good: r.good, nextAt, toNext: Math.max(0, nextAt - r.good), recorded: r.recorded, participationDone: !!j.pit.claimed['participation-90'], eligibility: pitEligibility(j, today) };
}
function pitEligibility(j, today) {
  const keys = sortedKeys(j.entries).filter(k => j.entries[k] && j.entries[k].pitstop === true);
  if (!keys.length) return { allowed: true, reason: 'You can take a Pit Stop whenever you have a credit.' };
  const last = keys[keys.length - 1];
  let run = 1;
  for (let i = keys.length - 2; i >= 0; i--) { if (addDays(keys[i], 1) === keys[i + 1]) run++; else break; }
  if (last === today) return { allowed: false, active: true, reason: 'Your Pit Stop is active today.' };
  if (addDays(last, 1) === today && run < 3) return { allowed: true, reason: `You can continue your Pit Stop run (day ${run + 1} of 3).` };
  const wait = run >= 3 ? 7 : run === 2 ? 5 : 3;
  const next = addDays(last, wait + 1);
  return today >= next ? { allowed: true, reason: 'You are eligible for a Pit Stop.' } : { allowed: false, next, reason: `Cooldown: ${wait} full days after your ${run}-day Pit Stop run.` };
}
function activatePit(j, today) {
  reconcilePit(j);
  const s = pitSummary(j, today);
  if (!s.eligibility.allowed) throw Error(s.eligibility.reason);
  if (s.balance < 1) throw Error('You have no Pit Stop credits available.');
  if (j.entries[today]) throw Error('Today already has an entry.');
  if (today < j.start) throw Error('Your journey has not started yet.');
  j.pit.spent.push({ date: today, at: new Date().toISOString() });
  j.entries[today] = { pitstop: true, note: '', at: new Date().toISOString() };
}

/* ---------- sanitising (used for storage, migration and restore) ---------- */
function cleanEntry(v) {
  if (!v || typeof v !== 'object') return null;
  const note = typeof v.note === 'string' ? v.note.slice(0, 2000) : '';
  const extra = {};
  if (typeof v.at === 'string') extra.at = v.at.slice(0, 40);
  if (v.journeyType === 'calories' || v.journeyType === 'habit') extra.journeyType = v.journeyType;
  if (v.pitstop === true) return { pitstop: true, note, ...extra };
  if (!['yes', 'no'].includes(v.q1) || !['yes', 'no'].includes(v.q2)) return null;
  const e = { q1: v.q1, q2: v.q2, note, ...extra };
  if (v.result === 'good' || v.result === 'bad') e.result = v.result;
  if (Number.isFinite(v.target)) e.target = v.target;
  if (Number.isFinite(v.limit)) e.limit = v.limit;
  return e;
}
function cleanEntries(obj) {
  const out = {}; let skipped = 0;
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) for (const [k, v] of Object.entries(obj)) { const e = isDate(k) ? cleanEntry(v) : null; if (e) out[k] = e; else skipped++; }
  return { entries: out, skipped };
}
function cleanPit(p) {
  const out = { spent: [], claimed: {} };
  if (p && typeof p === 'object') {
    if (Array.isArray(p.spent)) out.spent = p.spent.filter(x => x && typeof x === 'object' && isDate(x.date)).map(x => ({ date: x.date, at: typeof x.at === 'string' ? x.at.slice(0, 40) : '' }));
    if (p.claimed && typeof p.claimed === 'object') for (const [k, v] of Object.entries(p.claimed)) if (v === true && k.length < 64) out.claimed[k] = true;
  }
  return out;
}
function cleanJourney(j) {
  if (!j || typeof j !== 'object') return null;
  const start = isDate(j.start) ? j.start : todayKey();
  const goal = str(j.goal, 160, 'Did I meet my goal today?'), boundary = str(j.boundary, 160, 'Did I stay within my progress boundary today?');
  let chapters = Array.isArray(j.chapters) ? j.chapters.filter(c => c && isDate(c.from)).map(c => ({ from: c.from, goal: str(c.goal, 160, goal), boundary: str(c.boundary, 160, boundary) })).sort((a, b) => a.from.localeCompare(b.from)) : [];
  if (!chapters.length) chapters = [{ from: start, goal, boundary }];
  return { id: str(j.id, 80, uid('j')), name: str(j.name, 60, 'My journey'), icon: str(j.icon, 4, '◆'), summary: str(j.summary, 60, ''), goal, boundary, start, template: str(j.template, 20, 'custom'), createdAt: str(j.createdAt, 40, new Date().toISOString()), archived: j.archived === true, chapters, entries: cleanEntries(j.entries).entries, pit: cleanPit(j.pit) };
}
const JOURNAL_TYPES = ['reflection', 'note', 'milestone'];
function cleanJournalEntry(e) {
  if (!e || typeof e !== 'object' || !isDate(e.date) || typeof e.text !== 'string' || !e.text.trim()) return null;
  return { id: str(e.id, 80, uid('n')), date: e.date, journeyId: typeof e.journeyId === 'string' ? e.journeyId : null, type: JOURNAL_TYPES.includes(e.type) ? e.type : 'reflection', text: e.text.slice(0, 20000), createdAt: str(e.createdAt, 40, new Date().toISOString()), updatedAt: str(e.updatedAt, 40, '') };
}
function emptyStore() { return { schema: SCHEMA, activeJourneyId: null, journeys: [], journal: [], prefs: { backupReminderDays: 30, lastBackupAt: null, reminderSnoozedAt: null } }; }
function cleanStore(s) {
  const out = emptyStore();
  if (!s || typeof s !== 'object') return out;
  out.journeys = (Array.isArray(s.journeys) ? s.journeys : []).map(cleanJourney).filter(Boolean);
  const seen = new Set(); out.journeys.forEach(j => { if (seen.has(j.id)) j.id = uid('j'); seen.add(j.id); });
  out.journal = (Array.isArray(s.journal) ? s.journal : []).map(cleanJournalEntry).filter(Boolean);
  out.activeJourneyId = out.journeys.some(j => j.id === s.activeJourneyId) ? s.activeJourneyId : (out.journeys[0] || {}).id || null;
  const p = s.prefs || {};
  out.prefs.backupReminderDays = [0, 7, 14, 30, 60].includes(p.backupReminderDays) ? p.backupReminderDays : 30;
  out.prefs.lastBackupAt = typeof p.lastBackupAt === 'string' ? p.lastBackupAt : null;
  out.prefs.reminderSnoozedAt = typeof p.reminderSnoozedAt === 'string' ? p.reminderSnoozedAt : null;
  if (s.migration && typeof s.migration === 'object') out.migration = s.migration;
  return out;
}

/* ---------- migration from Version 4 / V5 Prototype keys ---------- */
const fmt = n => Number(n).toLocaleString('en-US');
// Builds one journey (plus its journal) from the old single-journey format.
function fromLegacy({ entries, settings, goals, pit, journal }) {
  const g = goals && typeof goals === 'object' ? goals : {};
  const s = { name: 'My calorie journey', type: 'calories', target: g.target || 2100, limit: g.limit || 3000, start: '2026-11-09', habitTarget: 'Did I complete my main goal?', habitLimit: 'Did I do at least the minimum?', ...(settings && typeof settings === 'object' ? settings : {}) };
  const questions = (type, t, l) => type === 'habit' ? [str(s.habitTarget, 160, 'Did I complete my main goal?'), str(s.habitLimit, 160, 'Did I do at least the minimum?')] : [`Did I stay around ${fmt(t)} calories?`, `Did I stay at or below ${fmt(l)} calories?`];
  const cleaned = cleanEntries(entries);
  const keys = sortedKeys(cleaned.entries);
  const start = isDate(s.start) ? (keys[0] && keys[0] < s.start ? keys[0] : s.start) : (keys[0] || todayKey());
  // Rebuild goal chapters from the target/limit each day was saved with.
  const chapters = []; let sig = null;
  for (const k of keys) {
    const e = cleaned.entries[k]; if (e.pitstop) continue;
    const type = e.journeyType || s.type;
    const has = type !== 'habit' && Number.isFinite(e.target) && Number.isFinite(e.limit);
    if (!has && type !== 'habit') continue;
    const sg = type === 'habit' ? 'h' : `c:${e.target}:${e.limit}`;
    if (sg !== sig) { const [goal, boundary] = questions(type, e.target, e.limit); chapters.push({ from: chapters.length ? k : start, goal, boundary }); sig = sg; }
  }
  const [curGoal, curBoundary] = questions(s.type, s.target, s.limit);
  const curSig = s.type === 'habit' ? 'h' : `c:${s.target}:${s.limit}`;
  if (!chapters.length) chapters.push({ from: start, goal: curGoal, boundary: curBoundary });
  else if (curSig !== sig) { const after = addDays(keys[keys.length - 1], 1); chapters.push({ from: after > todayKey() ? todayKey() : after, goal: curGoal, boundary: curBoundary }); }
  const j = cleanJourney({ id: uid('j'), name: str(s.name, 60, 'My journey'), icon: s.type === 'habit' ? '◆' : '🍽', summary: s.type === 'habit' ? '' : `Around ${fmt(s.target)} calories`, goal: curGoal, boundary: curBoundary, start, template: s.type === 'habit' ? 'custom' : 'eating', chapters, entries: cleaned.entries, pit: cleanPit(pit) });
  const notes = [];
  if (journal && typeof journal === 'object' && !Array.isArray(journal)) for (const [date, text] of Object.entries(journal)) { const n = cleanJournalEntry({ date, text, journeyId: j.id, type: 'reflection' }); if (n) notes.push(n); }
  return { journey: j, journal: notes, skipped: cleaned.skipped };
}
function readLegacy(ls) {
  const read = k => { try { return JSON.parse(ls.getItem(k)); } catch { return null; } };
  return { entries: read(LEGACY.entries), settings: read(LEGACY.settings), goals: read(LEGACY.goals), pit: read(LEGACY.pit), journal: read(LEGACY.journal), lastBackup: ls.getItem(LEGACY.lastBackup) };
}
function hasLegacy(p) { return !!((p.entries && Object.keys(p.entries).length) || (p.journal && Object.keys(p.journal).length) || p.settings || (p.pit && p.pit.spent && p.pit.spent.length)); }

/* Load the store. Legacy keys are migrated once, verified, and left in place untouched as a fallback copy. */
function load(ls) {
  const raw = ls.getItem(STORE_KEY);
  if (raw) { let parsed; try { parsed = JSON.parse(raw); } catch { throw Error('Saved data could not be read.'); } return { store: cleanStore(parsed), migrated: false }; }
  const legacy = readLegacy(ls);
  if (!hasLegacy(legacy)) return { store: emptyStore(), migrated: false, fresh: true };
  const m = fromLegacy(legacy);
  // Verify nothing was lost before anything is written.
  const expectDays = cleanEntries(legacy.entries).entries, expectJournal = legacy.journal && typeof legacy.journal === 'object' ? Object.values(legacy.journal).filter(t => typeof t === 'string' && t.trim()).length : 0;
  const okDays = Object.keys(expectDays).every(k => JSON.stringify(m.journey.entries[k]) === JSON.stringify(expectDays[k])) && Object.keys(m.journey.entries).length === Object.keys(expectDays).length;
  const okJournal = m.journal.length === expectJournal;
  const okPit = m.journey.pit.spent.length === cleanPit(legacy.pit).spent.length;
  if (!okDays || !okJournal || !okPit) throw Error('Migration check failed; your previous data was left unchanged.');
  const store = emptyStore();
  store.journeys = [m.journey]; store.journal = m.journal; store.activeJourneyId = m.journey.id;
  if (legacy.lastBackup) store.prefs.lastBackupAt = legacy.lastBackup;
  store.migration = { from: 'v4-v5-local', at: new Date().toISOString(), days: Object.keys(m.journey.entries).length, journal: m.journal.length, pitStopsTaken: m.journey.pit.spent.length, skipped: m.skipped };
  save(ls, store);
  return { store, migrated: true };
}
function save(ls, store) { ls.setItem(STORE_KEY, JSON.stringify(store)); }

/* ---------- backups ----------
 * One versioned JSON format for every platform. The PWA saves it as .json; native apps will use the
 * .mjourney extension for the same content.
 */
function buildBackup(store, today = todayKey()) {
  const journeys = store.journeys.map(j => { const copy = JSON.parse(JSON.stringify(j)); reconcilePit(copy); return copy; });
  return {
    format: 'my-journey-backup', schema: SCHEMA, app: 'My Journey', exportedAt: new Date().toISOString(),
    counts: { journeys: journeys.length, days: journeys.reduce((n, j) => n + Object.keys(j.entries).length, 0), journal: store.journal.length },
    data: { activeJourneyId: store.activeJourneyId, journeys, journal: store.journal, prefs: { backupReminderDays: store.prefs.backupReminderDays } },
    // Achievements and Pit Stop wallets are reproducible from the data above; they are included as a readable record.
    summary: journeys.map(j => { const a = achievements(j), p = pitSummary(j, today); return { journeyId: j.id, name: j.name, rank: a.rank, goodDays: a.good, badges: a.badges.filter(b => b.earned).map(b => b.name), pitCredits: { earned: p.earned, spent: p.spent, available: p.balance } }; })
  };
}
function parseBackup(obj) {
  if (!obj || typeof obj !== 'object') throw Error('This file is not a My Journey backup.');
  if (obj.format === 'my-journey-backup') {
    if (!(Number(obj.schema) >= 1)) throw Error('This backup is missing its version.');
    if (Number(obj.schema) > SCHEMA) throw Error('This backup was made by a newer version of My Journey. Update the app, then try again.');
    const d = obj.data || {};
    if (!Array.isArray(d.journeys)) throw Error('This backup contains no journeys.');
    const s = cleanStore({ journeys: d.journeys, journal: d.journal, activeJourneyId: d.activeJourneyId, prefs: d.prefs });
    return { kind: 'v6', journeys: s.journeys, journal: s.journal, hasJournal: Array.isArray(d.journal), activeJourneyId: s.activeJourneyId, exportedAt: obj.exportedAt, skipped: 0 };
  }
  if (obj.app === 'calorie-calendar' && obj.entries && typeof obj.entries === 'object' && !Array.isArray(obj.entries)) {
    if (Number(obj.version) > 5) throw Error('This backup was made by a newer version of My Journey. Update the app, then try again.');
    const m = fromLegacy({ entries: obj.entries, settings: obj.settings, goals: obj.goals, pit: obj.pit, journal: obj.journal });
    return { kind: 'legacy', journeys: [m.journey], journal: m.journal, hasJournal: !!(obj.journal && typeof obj.journal === 'object'), activeJourneyId: m.journey.id, exportedAt: obj.exportedAt, skipped: m.skipped };
  }
  throw Error('This file is not a My Journey backup.');
}
function describeBackup(p) {
  const days = p.journeys.reduce((n, j) => n + Object.keys(j.entries).length, 0), pits = p.journeys.reduce((n, j) => n + Object.values(j.entries).filter(e => e.pitstop).length, 0);
  return { journeys: p.journeys.length, names: p.journeys.map(j => j.name), days, pits, journal: p.journal.length, hasJournal: p.hasJournal, skipped: p.skipped };
}
/* mode 'replace': the device's journeys become the backup's. The journal is replaced too, unless the backup has none.
 * mode 'merge': backup journeys are added beside existing ones (never overwriting), journal entries added without duplicates. */
function applyRestore(store, p, mode) {
  const s = JSON.parse(JSON.stringify(store));
  if (mode === 'replace') {
    s.journeys = p.journeys;
    if (p.hasJournal) s.journal = p.journal;
    const ids = new Set(s.journeys.map(j => j.id));
    s.journal.forEach(n => { if (n.journeyId && !ids.has(n.journeyId)) n.journeyId = null; });
    s.activeJourneyId = ids.has(p.activeJourneyId) ? p.activeJourneyId : (s.journeys[0] || {}).id || null;
  } else {
    const remap = {}, existing = new Set(s.journeys.map(j => j.id));
    for (const j of p.journeys) {
      const copy = JSON.parse(JSON.stringify(j));
      if (existing.has(copy.id)) { const old = copy.id; copy.id = uid('j'); remap[old] = copy.id; if (s.journeys.some(x => x.name === copy.name)) copy.name = (copy.name + ' (restored)').slice(0, 60); }
      existing.add(copy.id); s.journeys.push(copy);
    }
    const sig = n => `${n.date}|${n.journeyId}|${n.text}`;
    const have = new Set(s.journal.map(n => n.id)), haveSig = new Set(s.journal.map(sig));
    for (const n of p.journal) {
      const copy = { ...n, journeyId: n.journeyId && remap[n.journeyId] ? remap[n.journeyId] : n.journeyId };
      if (have.has(copy.id) || haveSig.has(sig(copy))) continue;
      s.journal.push(copy);
    }
    if (!s.activeJourneyId) s.activeJourneyId = (s.journeys[0] || {}).id || null;
  }
  return cleanStore(s);
}

/* ---------- destructive actions ---------- */
// Reset keeps the journey, its settings and goal chapters, and every journal entry.
function resetEntries(store, journeyId) { const j = store.journeys.find(x => x.id === journeyId); if (!j) return; j.entries = {}; j.pit = { spent: [], claimed: {} }; }
// Deleting a journey keeps linked journal entries (unlinked) unless the user asks to delete them too.
function deleteJourney(store, journeyId, { deleteJournal = false } = {}) {
  store.journeys = store.journeys.filter(j => j.id !== journeyId);
  if (deleteJournal) store.journal = store.journal.filter(n => n.journeyId !== journeyId);
  else store.journal.forEach(n => { if (n.journeyId === journeyId) n.journeyId = null; });
  if (store.activeJourneyId === journeyId) store.activeJourneyId = (store.journeys.find(j => !j.archived) || store.journeys[0] || {}).id || null;
}

const MJ = { pad, dateKey, parseDate, addDays, isDate, todayKey, monthKeys, keysBetween, uid, STORE_KEY, SCHEMA, LEGACY, kind, KIND_LABEL, normalizeAnswers, makeEntry, TEMPLATES, newJourney, sortedKeys, chapterFor, updateJourney, stats, windowStats, trend, RANKS, achievements, PIT, pitAwardIds, reconcilePit, pitSummary, pitEligibility, activatePit, cleanEntry, cleanEntries, cleanJourney, cleanJournalEntry, cleanStore, emptyStore, JOURNAL_TYPES, fromLegacy, readLegacy, load, save, buildBackup, parseBackup, describeBackup, applyRestore, resetEntries, deleteJourney };
if (typeof module !== 'undefined' && module.exports) module.exports = MJ; else root.MJ = MJ;
})(typeof window !== 'undefined' ? window : globalThis);
