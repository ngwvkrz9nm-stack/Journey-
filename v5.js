/* My Journey — Version 5 interface. All data rules live in core.js (MJ); this file only renders and wires events. */
'use strict';
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const fmtDate = (k, o = { month: 'long', day: 'numeric', year: 'numeric' }) => MJ.parseDate(k).toLocaleDateString('en-US', o);
const GLYPH = { goal: '★', progress: '✓', detour: '↝', pit: '☕' };
const ICONS = ['◆', '🍽', '🚶', '🏃', '📖', '💰', '📵', '🎵', '🧘', '💧', '🌱', '✍️', '💤', '🧠', '🎯', '⛰'];

/* ---------- state ---------- */
let store, readOnly = false, today = MJ.todayKey();
try {
  const r = MJ.load(localStorage);
  store = r.store;
  if (r.migrated) sessionStorage.setItem('mj-migrated', '1');
} catch (e) {
  store = MJ.emptyStore(); readOnly = true;
  $('fatal').textContent = 'Your saved data could not be opened, so nothing will be changed. Please export or contact support before continuing. (' + e.message + ')';
  $('fatal').classList.remove('hidden');
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

let screen = 'today', calY, calM, hView = 'month', hY, hM, checkDay = null, answers = { q1: null, q2: null };
let migratedNow = false, jfReady = false, noteFilter = { type: 'all', journey: 'all', q: '' }, editingNote = null, jfMode = 'new', jfTemplate = 'custom', jfIcon = '◆', pendingRoad = null, roadJourney = null, roadSig = '';
const resetCal = () => { const d = MJ.parseDate(today); calY = hY = d.getFullYear(); calM = hM = d.getMonth(); };
resetCal();

const active = () => store.journeys.find(j => j.id === store.activeJourneyId) || null;
function persist() {
  if (readOnly) { alert('Changes cannot be saved because existing data could not be read.'); return false; }
  try { MJ.save(localStorage, store); return true; }
  catch (e) { alert('Could not save: this device is out of storage space for My Journey. Export a backup, then free some space.'); return false; }
}

/* ---------- navigation (hash based so the system back gesture works) ---------- */
const SCREENS = ['today', 'history', 'insights', 'journal', 'journeys', 'journeyForm', 'check', 'pit', 'settings'];
const TAB_FOR = { journeyForm: 'journeys', check: 'today', pit: 'today', settings: null };
function go(name) { if (location.hash !== '#' + name) location.hash = name; else show(name); }
function show(name) {
  if (!SCREENS.includes(name)) name = 'today';
  if (!store.journeys.length && name !== 'journeyForm' && name !== 'settings') { openJourneyForm('new'); return; }
  if (name === 'check' && !checkDay) name = 'today';
  if (name === 'journeyForm' && !jfReady) { openJourneyForm('new'); return; }
  screen = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('hidden', s.id !== name));
  const tab = name in TAB_FOR ? TAB_FOR[name] : name;
  document.querySelectorAll('[data-nav]').forEach(b => { b.classList.toggle('on', b.dataset.nav === tab); if (b.dataset.nav === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  document.body.classList.toggle('onboarding', !store.journeys.length);
  if (name !== 'journeyForm') jfReady = false;
  road.setActive(name === 'today');
  renderHeader();
  ({ today: renderToday, history: renderHistory, insights: renderInsights, journal: renderJournal, journeys: renderJourneys, pit: renderPit, settings: renderSettings }[name] || (() => {}))();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => show(location.hash.slice(1) || 'today'));
document.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => go(b.dataset.nav));
document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => history.length > 1 ? history.back() : go('today'));
$('journeyChip').onclick = () => go('journeys');
$('openSettings').onclick = () => go('settings');

function renderHeader() { const j = active(); $('chipIcon').textContent = j ? j.icon : '◆'; $('chipName').textContent = j ? j.name : 'My Journey'; }

/* ---------- road ---------- */
const road = new JourneyRoad($('road'), { onSelectDay: d => openDay(d) });
function roadDays(j) { return MJ.sortedKeys(j.entries).map(date => ({ date, kind: MJ.kind(j.entries[date]) })).filter(d => d.kind); }
function syncRoad(j) {
  const days = roadDays(j), sig = j.id + '|' + days.length + '|' + days.map(d => d.date + d.kind[0]).join('');
  if (roadJourney !== j.id) { road.setDays(days, { intro: !matchMedia('(prefers-reduced-motion: reduce)').matches }); roadJourney = j.id; }
  else if (pendingRoad) road.setDays(days, { changed: pendingRoad });
  else if (sig !== roadSig) road.setDays(days);
  roadSig = sig;
  const s = MJ.stats(j.entries), last = days[days.length - 1];
  $('road').setAttribute('aria-label', days.length ? `Journey path of ${days.length} recorded days: ${s.goal} Goal, ${s.progress} Progress, ${s.detour} Detour, ${s.pit} Pit Stop. Most recent: ${fmtDate(last.date)}, ${MJ.KIND_LABEL[last.kind]}. The road continues ahead.` : 'Journey path: no days recorded yet. The road ahead is open.');
  if (pendingRoad) $('roadAnnouncement').textContent = 'Your day was added to your journey path.';
  pendingRoad = null;
}

/* ---------- calendar ---------- */
function calendar(j, y, m, onPick) {
  const wrap = el('div');
  const week = el('div', 'week'); ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(t => week.append(el('span', '', t))); week.setAttribute('aria-hidden', 'true');
  const grid = el('div', 'cal');
  for (let i = 0; i < new Date(y, m, 1).getDay(); i++) grid.append(el('span'));
  for (const k of MJ.monthKeys(y, m)) {
    const c = MJ.kind(j.entries[k]), b = el('button', 'day' + (c ? ' ' + c : '') + (k === today ? ' today' : ''));
    b.append(String(Number(k.slice(8))));
    if (c) { const g = el('span', 'g', GLYPH[c]); g.setAttribute('aria-hidden', 'true'); b.append(g); }
    b.setAttribute('aria-label', `${fmtDate(k)}: ${c ? MJ.KIND_LABEL[c] : k > today ? 'future' : 'not recorded'}`);
    if (k > today || k < j.start) b.disabled = true;
    b.onclick = () => onPick(k);
    grid.append(b);
  }
  wrap.append(week, grid);
  return wrap;
}
function mini(j, y, m) {
  const box = el('button', 'mini'); box.append(el('b', '', new Date(y, m, 1).toLocaleDateString('en-US', { month: 'short' })));
  const grid = el('div', 'cal');
  for (let i = 0; i < new Date(y, m, 1).getDay(); i++) grid.append(el('i', 'blank'));
  for (const k of MJ.monthKeys(y, m)) grid.append(el('i', MJ.kind(j.entries[k]) || ''));
  const s = MJ.stats(j.entries, MJ.monthKeys(y, m));
  box.append(grid, el('small', '', s.recorded + s.pit ? `${s.good} good · ${s.detour} detour${s.pit ? ' · ' + s.pit + ' pit' : ''}` : '—'));
  box.setAttribute('aria-label', `${new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}: ${s.good} good days, ${s.detour} detours, ${s.pit} Pit Stops`);
  box.onclick = () => { hView = 'month'; hY = y; hM = m; renderHistory(); };
  return box;
}

/* ---------- Today ---------- */
function renderToday() {
  const j = active(); if (!j) return;
  MJ.reconcilePit(j);
  const s = MJ.stats(j.entries), p = MJ.pitSummary(j, today);
  $('jName').textContent = j.name;
  $('jGoal').textContent = j.goal;
  $('pct').textContent = s.rate === null ? '—' : s.rate + '%';
  $('pctLabel').textContent = s.recorded ? `Good days · ${s.good} of ${s.recorded} recorded` : 'Your road begins here';
  $('heroHint').classList.toggle('hidden', !s.recorded && !s.pit);
  $('stats').replaceChildren(...[['goal', 'Goal', s.goal, '★'], ['progress', 'Progress', s.progress, '✓'], ['detour', 'Detours', s.detour, '↝'], ['pit', 'Pit credits', p.balance, '☕']].map(([k, label, n, g]) => {
    const m = el('div', 'metric'), st = el('strong', 't-' + k); const i = el('i', '', g); i.setAttribute('aria-hidden', 'true'); st.append(i, String(n)); m.append(st, el('small', '', label)); return m;
  }));
  const act = $('todayAction'); act.replaceChildren();
  const e = j.entries[today], c = MJ.kind(e);
  if (c === 'pit') {
    const card = el('div', 'today-card pitday'); const dot = el('div', 'dot', '☕'); dot.style.background = '#4b3a8f';
    const g = el('div', 'grow'); g.append(el('b', '', 'Pit Stop Day — enjoy the journey'), el('span', '', 'No questions today. Tracking returns after midnight.')); card.append(dot, g); act.append(card);
  } else if (c) {
    const card = el('div', 'today-card'); const dot = el('div', 'dot', GLYPH[c]); dot.style.background = `var(--${c})`; dot.style.color = c === 'progress' || c === 'detour' ? '#06281e' : '#fff';
    const g = el('div', 'grow'); g.append(el('b', '', 'Today · ' + MJ.KIND_LABEL[c]), el('span', '', c === 'detour' ? 'Recorded. A detour never erases the road behind you.' : 'Recorded. Your road grew today.'));
    const b = el('button', 'link', 'Edit'); b.onclick = () => openCheck(today); card.append(dot, g, b); act.append(card);
  } else if (today < j.start) {
    const card = el('div', 'today-card'); const g = el('div', 'grow'); g.append(el('b', '', 'Your journey begins ' + fmtDate(j.start)), el('span', '', 'Check-ins open on your start date.')); card.append(g); act.append(card);
  } else {
    const b = el('button', 'primary', '✓  Check In Today'); b.id = 'checkin'; b.onclick = () => openCheck(today); act.append(b);
  }
  const pr = $('pitRow'); pr.replaceChildren();
  const left = el('div'); const top = el('b', '', `☕ ${p.balance} Pit Stop credit${p.balance === 1 ? '' : 's'}`);
  left.append(top, el('small', '', p.eligibility.active ? 'Pit Stop active today' : p.balance && p.eligibility.allowed ? 'Available to use today' : `${p.toNext} more Good Day${p.toNext === 1 ? '' : 's'} to your next credit`));
  pr.append(left, el('span', 'muted', '›')); pr.onclick = () => go('pit');
  $('calTitle').textContent = new Date(calY, calM, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  $('calendar').replaceChildren(calendar(j, calY, calM, openDay));
  renderReminder();
  syncRoad(j);
}
$('calPrev').onclick = () => { if (--calM < 0) { calM = 11; calY--; } renderToday(); };
$('calNext').onclick = () => { if (++calM > 11) { calM = 0; calY++; } renderToday(); };

/* ---------- day detail ---------- */
function openDay(k) {
  const j = active(); if (!j) return;
  const e = j.entries[k], c = MJ.kind(e), ch = MJ.chapterFor(j, k);
  $('dayEyebrow').textContent = j.icon + ' ' + j.name.toUpperCase();
  $('dayTitle').textContent = fmtDate(k, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const body = $('dayBody'); body.replaceChildren();
  const chip = el('span', 'status-chip ' + (c || 'none'), c ? GLYPH[c] + ' ' + MJ.KIND_LABEL[c] : 'Not recorded'); body.append(chip);
  if (c !== 'pit') {
    const kv = el('div', 'kv'); kv.append('Goal at the time', el('b', '', ch.goal)); const kv2 = el('div', 'kv'); kv2.append('Progress boundary', el('b', '', ch.boundary)); body.append(kv, kv2);
    if (e && e.note) { const kv3 = el('div', 'kv'); kv3.append('Note', el('b', '', e.note)); body.append(kv3); }
  } else body.append(el('p', 'small muted', 'An earned day away from tracking. It is preserved as part of your journey.'));
  const notes = store.journal.filter(n => n.date === k && (n.journeyId === j.id || !n.journeyId));
  for (const n of notes) { const kv = el('div', 'kv'); kv.append('Journal · ' + n.type, el('b', '', n.text.length > 280 ? n.text.slice(0, 280) + '…' : n.text)); body.append(kv); }
  const canCheck = c !== 'pit' && k <= today && k >= j.start;
  $('dayCheck').classList.toggle('hidden', !canCheck);
  $('dayCheck').textContent = e ? 'Edit check-in' : 'Check in for this day';
  $('dayNote').classList.toggle('hidden', k > today);
  const dlg = $('dayDialog');
  dlg.onclose = () => { if (dlg.returnValue === 'check') openCheck(k); if (dlg.returnValue === 'note') openNote(null, { date: k, journeyId: j.id }); };
  dlg.returnValue = ''; dlg.showModal();
}

/* ---------- check-in ---------- */
function openCheck(k) {
  const j = active(); if (!j) return;
  if (k > today) { alert('You can record a day once it arrives.'); return; }
  if (k < j.start) { alert('This date is before your journey started.'); return; }
  if (j.entries[k] && j.entries[k].pitstop) { alert('This is a Pit Stop Day. Your recorded break is preserved.'); return; }
  checkDay = k;
  const e = j.entries[k] || {}, ch = MJ.chapterFor(j, k);
  answers = { q1: e.q1 || null, q2: e.q2 || null };
  $('checkDate').textContent = (k === today ? 'TODAY · ' : '') + fmtDate(k).toUpperCase();
  $('q1Label').textContent = ch.goal; $('q2Label').textContent = ch.boundary;
  $('checkNote').value = e.note || '';
  $('clearCheck').classList.toggle('hidden', !j.entries[k]);
  refreshAnswers();
  go('check');
}
function refreshAnswers() {
  document.querySelectorAll('[data-q]').forEach(b => b.setAttribute('aria-pressed', String(answers[b.dataset.q] === b.dataset.v)));
  const c = answers.q1 && answers.q2 ? MJ.kind(MJ.makeEntry(answers.q1, answers.q2, '')) : null;
  const pv = $('checkPreview'); pv.textContent = c ? GLYPH[c] + ' ' + MJ.KIND_LABEL[c] + (c === 'detour' ? ' — it never erases your progress' : '') : 'Answer both questions';
  pv.className = 'result-preview ' + (c ? 't-' + c : 'muted');
}
document.querySelectorAll('[data-q]').forEach(b => b.onclick = () => {
  answers[b.dataset.q] = b.dataset.v;
  if (b.dataset.q === 'q1' && b.dataset.v === 'yes') answers.q2 = 'yes';   // full goal implies the boundary
  if (b.dataset.q === 'q2' && b.dataset.v === 'no') answers.q1 = 'no';     // missing the boundary means the goal was missed
  refreshAnswers();
});
$('saveCheck').onclick = () => {
  const j = active(); if (!j || !checkDay) return;
  if (!answers.q1 || !answers.q2) { alert('Please answer both questions.'); return; }
  if (j.entries[checkDay] && j.entries[checkDay].pitstop) return;
  j.entries[checkDay] = MJ.makeEntry(answers.q1, answers.q2, $('checkNote').value);
  MJ.reconcilePit(j);
  if (!persist()) return;
  pendingRoad = checkDay; const d = MJ.parseDate(checkDay); calY = d.getFullYear(); calM = d.getMonth();
  checkDay = null; go('today');
};
$('clearCheck').onclick = () => {
  const j = active(); if (!j || !checkDay || !j.entries[checkDay]) return;
  if (!confirm(`Clear the check-in and note for ${fmtDate(checkDay)}? Earned Pit Stop credits are kept.`)) return;
  delete j.entries[checkDay]; if (!persist()) return; checkDay = null; go('today');
};

/* ---------- History ---------- */
document.querySelectorAll('[data-hview]').forEach(b => b.onclick = () => { hView = b.dataset.hview; renderHistory(); });
$('hPrev').onclick = () => { if (hView === 'year') hY--; else if (--hM < 0) { hM = 11; hY--; } renderHistory(); };
$('hNext').onclick = () => { if (hView === 'year') hY++; else if (++hM > 11) { hM = 0; hY++; } renderHistory(); };
function renderHistory() {
  const j = active(); if (!j) return;
  document.querySelectorAll('[data-hview]').forEach(b => b.classList.toggle('on', b.dataset.hview === hView));
  $('hPrev').disabled = $('hNext').disabled = hView === 'lifetime';
  const body = $('hBody'); body.replaceChildren(); let keys;
  if (hView === 'month') { $('hTitle').textContent = new Date(hY, hM, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); body.append(calendar(j, hY, hM, openDay)); keys = MJ.monthKeys(hY, hM); }
  else if (hView === 'year') { $('hTitle').textContent = String(hY); const g = el('div', 'years'); for (let m = 0; m < 12; m++) g.append(mini(j, hY, m)); body.append(g); keys = []; for (let m = 0; m < 12; m++) keys.push(...MJ.monthKeys(hY, m)); }
  else {
    $('hTitle').textContent = 'Lifetime'; const all = MJ.sortedKeys(j.entries), first = Number((all[0] || j.start).slice(0, 4)), last = Number(today.slice(0, 4));
    for (let y = last; y >= Math.min(first, Number(j.start.slice(0, 4))); y--) { body.append(el('h3', 'year-head', String(y))); const g = el('div', 'years'); for (let m = 0; m < 12; m++) g.append(mini(j, y, m)); body.append(g); }
    keys = null;
  }
  const s = MJ.stats(j.entries, keys);
  $('hStats').textContent = `${s.goal} goal · ${s.progress} progress · ${s.detour} detour · ${s.pit} Pit Stop · ${s.rate === null ? 'no recorded days' : s.rate + '% good days'}`;
  const ch = $('chapters'); ch.replaceChildren();
  j.chapters.slice().reverse().forEach((c, idx, arr) => {
    const nextFrom = idx === 0 ? null : arr[idx - 1].from;
    const ks = MJ.sortedKeys(j.entries).filter(k => k >= c.from && (!nextFrom || k < nextFrom)), st = MJ.stats(j.entries, ks);
    const d = el('div', 'chapter'); d.append(el('b', '', `Chapter ${arr.length - idx} · ${fmtDate(c.from, { month: 'short', day: 'numeric', year: 'numeric' })}${nextFrom ? ' – ' + fmtDate(MJ.addDays(nextFrom, -1), { month: 'short', day: 'numeric', year: 'numeric' }) : ' – now'}`), el('p', '', c.goal), el('small', '', `Boundary: ${c.boundary} · ${st.recorded} recorded${st.rate === null ? '' : ' · ' + st.rate + '% good'}`));
    ch.append(d);
  });
}

/* ---------- Insights ---------- */
function renderInsights() {
  const j = active(); if (!j) return;
  const s = MJ.stats(j.entries);
  $('iRate').textContent = s.rate === null ? '—' : s.rate + '%';
  $('iRateText').textContent = s.recorded ? `${s.good} of ${s.recorded} recorded days were good days (Goal + Progress). Pit Stops are not counted.` : 'Your first recorded day starts your picture.';
  $('iWindows').replaceChildren(...[7, 30, 90, 365].map(n => { const w = MJ.windowStats(j, n, today), t = el('div', 'tile'); t.append(el('strong', '', w.rate === null ? '—' : w.rate + '%'), el('small', '', `${n} days · ${w.good}/${w.recorded}`)); return t; }));
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)) - 1;
  const rows = [['This month', MJ.stats(j.entries, MJ.monthKeys(y, m))], ['This year', MJ.stats(j.entries, MJ.keysBetween(`${y}-01-01`, today))], ['Lifetime', s]];
  const tb = el('table', 'totals'); const hr = el('tr'); ['', 'Goal', 'Progress', 'Detour', 'Pit', 'Good'].forEach(h => hr.append(el('th', '', h))); tb.append(hr);
  rows.forEach(([name, r]) => { const tr = el('tr'); [name, r.goal, r.progress, r.detour, r.pit, r.rate === null ? '—' : r.rate + '%'].forEach(v => tr.append(el('td', '', String(v)))); tb.append(tr); });
  $('iTotals').replaceChildren(tb);
  // trend
  const svg = $('iTrend'), ns = 'http://www.w3.org/2000/svg'; svg.replaceChildren();
  const pts = MJ.trend(j, today);
  for (const v of [0, 50, 100]) { const l = document.createElementNS(ns, 'line'); Object.entries({ x1: 0, x2: 600, y1: 170 - v * 1.5, y2: 170 - v * 1.5, stroke: '#1d3a62', 'stroke-width': 1 }).forEach(([a, b]) => l.setAttribute(a, b)); svg.append(l); }
  let d = ''; pts.forEach((v, i) => { if (v === null) return; const x = i / (pts.length - 1) * 600, yy = 170 - v * 1.5; d += (i === 0 || pts[i - 1] === null ? 'M' : 'L') + x.toFixed(1) + ',' + yy.toFixed(1) + ' '; });
  if (d) { const p = document.createElementNS(ns, 'path'); Object.entries({ d, fill: 'none', stroke: '#5cc8ff', 'stroke-width': 3, 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }).forEach(([a, b]) => p.setAttribute(a, b)); svg.append(p); }
  else { const t = document.createElementNS(ns, 'text'); Object.entries({ x: 300, y: 95, 'text-anchor': 'middle', fill: '#9bb2cf', 'font-size': 18 }).forEach(([a, b]) => t.setAttribute(a, b)); t.textContent = 'Record days to see your trend'; svg.append(t); }
  if (!$('cmpA').value) { const pm = new Date(y, m - 1, 1); $('cmpA').value = `${pm.getFullYear()}-${MJ.pad(pm.getMonth() + 1)}`; $('cmpB').value = `${y}-${MJ.pad(m + 1)}`; }
  renderCompare();
  const a = MJ.achievements(j);
  $('rank').textContent = a.rank; $('rankBar').style.width = Math.round(a.progress * 100) + '%';
  $('rankNext').textContent = a.next ? `${a.next.remaining} more good day${a.next.remaining === 1 ? '' : 's'} to ${a.next.name} · ${a.good} lifetime good days` : `Highest rank reached · ${a.good} lifetime good days`;
  $('ranks').replaceChildren(...a.ranks.map(r => { const b = el('div', 'badge' + (r.earned ? '' : ' locked')); b.append(el('b', '', (r.earned ? '★ ' : '☆ ') + r.name), el('small', '', r.need + ' good days')); return b; }));
  $('badges').replaceChildren(...a.badges.map(r => { const b = el('div', 'badge' + (r.earned ? '' : ' locked')); b.append(el('b', '', (r.earned ? '★ ' : '☆ ') + r.name), el('small', '', `${r.have} / ${r.need}`)); return b; }));
}
function renderCompare() {
  const j = active(); if (!j) return;
  $('cmpOut').replaceChildren(...['cmpA', 'cmpB'].filter(id => /^\d{4}-\d{2}$/.test($(id).value)).map(id => {
    const [y, m] = $(id).value.split('-').map(Number), s = MJ.stats(j.entries, MJ.monthKeys(y, m - 1)), box = el('div', 'cmp');
    box.append(el('span', 'muted small', new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })), el('strong', '', s.rate === null ? '—' : s.rate + '%'), el('span', 'muted small', `${s.good} good · ${s.detour} detour · ${s.pit} pit`)); return box;
  }));
}
$('cmpA').onchange = $('cmpB').onchange = renderCompare;

/* ---------- Journal ---------- */
function journeyName(id) { const j = store.journeys.find(x => x.id === id); return j ? j.icon + ' ' + j.name : 'No journey'; }
function fillJourneySelect(sel, { all = false, none = true, value } = {}) {
  sel.replaceChildren();
  if (all) sel.append(new Option('All journeys', 'all'));
  store.journeys.forEach(j => sel.append(new Option(j.icon + ' ' + j.name, j.id)));
  if (none) sel.append(new Option('No journey (general)', ''));
  if (value !== undefined) sel.value = value;
}
document.querySelectorAll('#noteTypes button').forEach(b => b.onclick = () => { noteFilter.type = b.dataset.type; renderJournal(); });
$('noteJourney').onchange = () => { noteFilter.journey = $('noteJourney').value; renderJournal(); };
$('noteSearch').oninput = () => { noteFilter.q = $('noteSearch').value.trim().toLowerCase(); renderJournal(); };
$('newNote').onclick = () => openNote(null, { date: today, journeyId: store.activeJourneyId });
function renderJournal() {
  document.querySelectorAll('#noteTypes button').forEach(b => b.classList.toggle('on', b.dataset.type === noteFilter.type));
  fillJourneySelect($('noteJourney'), { all: true, value: noteFilter.journey });
  if ($('noteJourney').value !== noteFilter.journey) { noteFilter.journey = 'all'; $('noteJourney').value = 'all'; }
  const list = store.journal.filter(n => (noteFilter.type === 'all' || n.type === noteFilter.type) && (noteFilter.journey === 'all' || (n.journeyId || '') === noteFilter.journey) && (!noteFilter.q || n.text.toLowerCase().includes(noteFilter.q)))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const out = $('notes'); out.replaceChildren();
  if (!list.length) { out.append(el('p', 'empty', store.journal.length ? 'No entries match.' : 'No entries yet. Your journal begins whenever you choose.')); return; }
  for (const n of list) {
    const card = el('article', 'note'), h = el('header'), left = el('div');
    left.append(el('div', 'when', fmtDate(n.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })), el('div', 'muted small', journeyName(n.journeyId)));
    h.append(left, el('span', 'tag ' + n.type, n.type));
    const acts = el('div', 'actions'), ed = el('button', 'link', 'Edit'), del = el('button', 'link danger-text', 'Delete');
    ed.onclick = () => openNote(n); del.style.background = 'none'; del.style.border = '0';
    del.onclick = () => { if (confirm(`Delete this journal entry from ${fmtDate(n.date)}? This cannot be undone without a backup.`)) { store.journal = store.journal.filter(x => x.id !== n.id); persist(); renderJournal(); } };
    acts.append(ed, del);
    card.append(h, el('p', '', n.text), acts); out.append(card);
  }
}
function openNote(n, preset = {}) {
  editingNote = n ? n.id : null;
  $('noteTitle').textContent = n ? 'Edit journal entry' : 'New journal entry';
  $('nDate').max = today; $('nDate').value = n ? n.date : preset.date || today;
  $('nType').value = n ? n.type : preset.type || 'reflection';
  fillJourneySelect($('nJourney'), { value: n ? n.journeyId || '' : preset.journeyId || '' });
  $('nText').value = n ? n.text : ''; $('nError').textContent = '';
  $('nDelete').classList.toggle('hidden', !n);
  $('noteDialog').returnValue = ''; $('noteDialog').showModal();
}
$('noteForm').addEventListener('submit', e => {
  const v = e.submitter ? e.submitter.value : '';
  if (v === 'save') {
    const text = $('nText').value.trim(), date = $('nDate').value;
    if (!MJ.isDate(date) || date > today) { e.preventDefault(); $('nError').textContent = 'Choose today or an earlier date.'; return; }
    if (!text) { e.preventDefault(); $('nError').textContent = 'Write something first, or cancel.'; return; }
    const now = new Date().toISOString(), fields = { date, type: $('nType').value, journeyId: $('nJourney').value || null, text: text.slice(0, 20000) };
    if (editingNote) { const n = store.journal.find(x => x.id === editingNote); Object.assign(n, fields, { updatedAt: now }); }
    else store.journal.push(MJ.cleanJournalEntry({ ...fields, createdAt: now }));
    persist();
  } else if (v === 'delete') {
    if (!confirm('Delete this journal entry? This cannot be undone without a backup.')) { e.preventDefault(); return; }
    store.journal = store.journal.filter(x => x.id !== editingNote); persist();
  }
});
$('noteDialog').addEventListener('close', () => { if (screen === 'journal') renderJournal(); });

/* ---------- Journeys ---------- */
function renderJourneys() {
  const list = $('journeyList'); list.replaceChildren();
  for (const j of store.journeys) {
    const s = MJ.stats(j.entries), b = el('button', 'jcard' + (j.id === store.activeJourneyId ? ' active' : ''));
    const ic = el('div', 'ic', j.icon), g = el('div', 'grow');
    g.append(el('b', '', j.name), el('span', '', j.goal), el('span', '', `${s.recorded + s.pit} days recorded · since ${fmtDate(j.start, { month: 'short', day: 'numeric', year: 'numeric' })}${j.id === store.activeJourneyId ? ' · current' : ''}`));
    b.append(ic, g, el('div', 'pct', s.rate === null ? '—' : s.rate + '%'));
    b.setAttribute('aria-label', `${j.name}, ${s.rate === null ? 'no recorded days' : s.rate + '% good days'}${j.id === store.activeJourneyId ? ', current journey' : ''}`);
    b.onclick = () => { store.activeJourneyId = j.id; persist(); resetCal(); go('today'); };
    list.append(b);
  }
}
$('newJourney').onclick = () => openJourneyForm('new');
$('editJourney').onclick = () => openJourneyForm('edit');
function openJourneyForm(mode) {
  jfReady = true; jfMode = mode; const j = mode === 'edit' ? active() : null, first = !store.journeys.length;
  $('jfEyebrow').textContent = mode === 'edit' ? 'EDIT JOURNEY' : first ? 'WELCOME TO MY JOURNEY' : 'NEW JOURNEY';
  $('jfTitle').textContent = mode === 'edit' ? j.name : first ? 'Where are you heading?' : 'Start a journey';
  $('jfIntro').textContent = mode === 'edit' ? 'Your goals belong to you. Change them whenever your journey changes.' : 'Choose what you want to track. You decide what counts — templates are only starting points, and every word can be changed.';
  $('jfTemplates').classList.toggle('hidden', mode === 'edit');
  $('jfTemplates').replaceChildren(...MJ.TEMPLATES.map(t => { const b = el('button', t.id === 'custom' ? 'on' : '', (t.id === 'custom' ? '' : t.icon + ' ') + t.label); b.type = 'button'; b.onclick = () => applyTemplate(t); return b; }));
  jfTemplate = 'custom'; jfIcon = j ? j.icon : '◆';
  $('jfName').value = j ? j.name : ''; $('jfGoal').value = j ? j.goal : ''; $('jfBoundary').value = j ? j.boundary : ''; $('jfStart').value = j ? j.start : today; $('jfStart').max = today;
  $('jfChapterNote').textContent = mode === 'edit' ? 'Changing either question starts a new chapter from today. Days already recorded keep their original results.' : '';
  $('jfError').textContent = ''; $('jfSave').textContent = mode === 'edit' ? 'Save changes' : 'Start this journey';
  document.querySelectorAll('#journeyForm [data-back]').forEach(b => b.classList.toggle('hidden', first));
  renderIcons();
  if (location.hash !== '#journeyForm') location.hash = 'journeyForm'; else { screen = 'journeyForm'; document.querySelectorAll('.screen').forEach(s => s.classList.toggle('hidden', s.id !== 'journeyForm')); document.body.classList.toggle('onboarding', first); road.setActive(false); }
}
function applyTemplate(t) {
  jfTemplate = t.id; document.querySelectorAll('#jfTemplates button').forEach((b, i) => b.classList.toggle('on', MJ.TEMPLATES[i].id === t.id));
  if (t.id !== 'custom') { $('jfName').value = t.name; $('jfGoal').value = t.goal; $('jfBoundary').value = t.boundary; jfIcon = t.icon; renderIcons(); }
}
function renderIcons() { $('jfIcons').replaceChildren(...ICONS.map(i => { const b = el('button', i === jfIcon ? 'on' : '', i); b.type = 'button'; b.setAttribute('aria-label', 'Icon ' + i); b.setAttribute('aria-pressed', String(i === jfIcon)); b.onclick = () => { jfIcon = i; renderIcons(); }; return b; })); }
$('jfSave').onclick = () => {
  const name = $('jfName').value.trim(), goal = $('jfGoal').value.trim(), boundary = $('jfBoundary').value.trim(), start = $('jfStart').value;
  if (!name) return void ($('jfError').textContent = 'Give your journey a name.');
  if (!goal || !boundary) return void ($('jfError').textContent = 'Write both questions — your full goal and your progress boundary.');
  if (!MJ.isDate(start) || start > today) return void ($('jfError').textContent = 'Choose a start date of today or earlier.');
  if (jfMode === 'edit') {
    const j = active(), firstEntry = MJ.sortedKeys(j.entries)[0];
    if (firstEntry && start > firstEntry) return void ($('jfError').textContent = `The start date can't be after your first recorded day (${fmtDate(firstEntry)}).`);
    MJ.updateJourney(j, { name, icon: jfIcon, goal, boundary, start }, today);
  } else {
    const j = MJ.newJourney({ name, icon: jfIcon, goal, boundary, start, template: jfTemplate });
    store.journeys.push(j); store.activeJourneyId = j.id; resetCal();
  }
  if (!persist()) return;
  go('today');
};

/* ---------- Pit Stops ---------- */
function renderPit() {
  const j = active(); if (!j) return;
  MJ.reconcilePit(j); persist();
  const p = MJ.pitSummary(j, today);
  $('pitBalance').textContent = p.balance; $('pitEarned').textContent = p.earned; $('pitUsed').textContent = p.spent;
  let reason = p.eligibility.reason; if (p.eligibility.next) reason += ' Next eligible: ' + fmtDate(p.eligibility.next) + '.';
  if (p.balance === 0 && !p.eligibility.active) reason = 'No credits available yet. ' + (p.eligibility.allowed ? '' : reason);
  if (MJ.kind(j.entries[today]) && !p.eligibility.active) reason = 'Today is already recorded, so a Pit Stop can start tomorrow at the earliest.';
  $('pitEligibility').textContent = reason;
  $('takePit').disabled = !(p.eligibility.allowed && p.balance > 0 && !j.entries[today] && today >= j.start);
  $('pitProgress').textContent = `${p.good} Good Days so far · ${p.toNext} more to your next credit${p.participationDone ? '' : ` · ${Math.max(0, 90 - p.recorded)} more recorded days to the 90-day bonus`}`;
  const h = $('pitHistory'); h.replaceChildren();
  const used = j.pit.spent.slice().sort((a, b) => b.date.localeCompare(a.date));
  if (!used.length) h.append(el('p', 'muted small', 'None yet.')); else used.forEach(s => h.append(el('p', 'small', '☕ ' + fmtDate(s.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }))));
}
$('takePit').onclick = () => {
  const j = active(); if (!j) return;
  if (!confirm('Use one Pit Stop credit today? Tracking for this journey closes until midnight.')) return;
  try { MJ.activatePit(j, today); } catch (e) { alert(e.message); return; }
  if (!persist()) return; pendingRoad = today; go('today');
};

/* ---------- Settings, backup, reset, delete ---------- */
function renderSettings() {
  const j = active();
  $('sJourney').textContent = j ? j.icon + ' ' + j.name : 'No journey';
  $('resetBtn').disabled = $('deleteBtn').disabled = !j;
  const last = store.prefs.lastBackupAt;
  $('backupStatus').textContent = last ? 'Last backup exported ' + new Date(last).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + '.' : 'No backup exported from this device yet.';
  $('reminderDays').value = String(store.prefs.backupReminderDays);
}
$('reminderDays').onchange = () => { store.prefs.backupReminderDays = Number($('reminderDays').value); store.prefs.reminderSnoozedAt = null; persist(); };
function exportBackup() {
  const data = MJ.buildBackup(store, today), blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = el('a'); a.href = url; a.download = `MyJourney-Backup-${today}.json`; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  store.prefs.lastBackupAt = new Date().toISOString(); store.prefs.reminderSnoozedAt = null; persist();
  if (screen === 'settings') renderSettings(); renderReminder();
}
$('exportBtn').onclick = exportBackup;
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  let parsed;
  try {
    if (file.size > 25 * 1024 * 1024) throw Error('This file is too large to be a My Journey backup.');
    let obj; try { obj = JSON.parse(await file.text()); } catch { throw Error('The file could not be read as a My Journey backup.'); }
    parsed = MJ.parseBackup(obj);
  } catch (err) { alert('Could not restore: ' + err.message + '\n\nNothing on this device was changed.'); return; }
  const d = MJ.describeBackup(parsed), body = $('restoreBody'); body.replaceChildren();
  const when = parsed.exportedAt && !isNaN(Date.parse(parsed.exportedAt)) ? new Date(parsed.exportedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'an unknown date';
  body.append(el('p', 'small', `Backup from ${when}${parsed.kind === 'legacy' ? ' (earlier version of My Journey)' : ''}:`));
  const ul = el('ul', 'rules'); [`${d.journeys} journey${d.journeys === 1 ? '' : 's'}: ${d.names.join(', ')}`, `${d.days} recorded days (${d.pits} Pit Stop days)`, d.hasJournal ? `${d.journal} journal entries` : 'No journal in this backup', d.skipped ? `${d.skipped} unreadable records will be skipped` : ''].filter(Boolean).forEach(t => ul.append(el('li', '', t)));
  body.append(ul,
    el('p', 'small', '“Add to this device” keeps everything here and adds the backup’s journeys beside it. Nothing is overwritten.'),
    el('p', 'small', `“Replace everything” removes the journeys on this device${d.hasJournal ? ' and its journal' : ''} and uses the backup instead.${d.hasJournal ? '' : ' Your current journal is kept.'} Consider exporting a backup first.`));
  const dlg = $('restoreDialog'); dlg.returnValue = '';
  dlg.onclose = () => {
    const mode = dlg.returnValue; if (mode !== 'merge' && mode !== 'replace') return;
    if (mode === 'replace' && store.journeys.length && !confirm('Replace all journeys on this device with the backup? This cannot be undone unless you have another backup.')) return;
    const next = MJ.applyRestore(store, parsed, mode), prev = store; store = next;
    if (!persist()) { store = prev; return; }
    roadJourney = null; resetCal(); alert('Backup restored.'); go('today');
  };
  dlg.showModal();
};
$('resetBtn').onclick = () => {
  const j = active(); if (!j) return; const s = MJ.stats(j.entries);
  $('resetBody').textContent = `This clears ${s.recorded + s.pit} recorded days, their notes, and the Pit Stop wallet for “${j.name}”. The journey, its goals and chapters, and all journal entries are kept. This cannot be undone without a backup.`;
  const dlg = $('resetDialog'); dlg.returnValue = '';
  dlg.onclose = () => {
    if (dlg.returnValue === 'export') { exportBackup(); setTimeout(() => $('resetBtn').click(), 300); return; }
    if (dlg.returnValue !== 'reset') return;
    MJ.resetEntries(store, j.id); if (persist()) { roadJourney = null; go('today'); }
  };
  dlg.showModal();
};
$('deleteBtn').onclick = () => {
  const j = active(); if (!j) return; const s = MJ.stats(j.entries), linked = store.journal.filter(n => n.journeyId === j.id).length;
  $('deleteBody').textContent = `This permanently removes “${j.name}”: ${s.recorded + s.pit} recorded days, notes, goal chapters, Pit Stop credits and achievements. Other journeys are not affected.`;
  $('deleteNotes').checked = false; $('deleteNotesLabel').textContent = linked ? `Also delete the ${linked} journal entr${linked === 1 ? 'y' : 'ies'} linked to this journey (otherwise they are kept as general entries)` : 'Also delete linked journal entries (there are none)';
  $('deleteNotes').disabled = !linked;
  $('deleteConfirm').value = ''; $('deleteConfirm').placeholder = j.name; $('deleteGo').disabled = true;
  $('deleteConfirm').oninput = () => { $('deleteGo').disabled = $('deleteConfirm').value.trim() !== j.name.trim(); };
  $('deleteExport').onclick = exportBackup;
  const dlg = $('deleteDialog'); dlg.returnValue = '';
  dlg.onclose = () => {
    if (dlg.returnValue !== 'delete' || $('deleteConfirm').value.trim() !== j.name.trim()) return;
    MJ.deleteJourney(store, j.id, { deleteJournal: $('deleteNotes').checked });
    if (persist()) { roadJourney = null; resetCal(); go(store.journeys.length ? 'today' : 'journeyForm'); }
  };
  dlg.showModal();
};

/* ---------- backup reminder ---------- */
function renderReminder() {
  const days = store.prefs.backupReminderDays, total = store.journeys.reduce((n, j) => n + Object.keys(j.entries).length, 0) + store.journal.length;
  const since = t => t ? (Date.now() - Date.parse(t)) / 864e5 : Infinity;
  const show = !migratedNow && days > 0 && total >= 5 && since(store.prefs.lastBackupAt) >= days && since(store.prefs.reminderSnoozedAt) >= Math.min(7, days);
  $('reminder').classList.toggle('hidden', !show);
  if (show) $('reminderText').textContent = store.prefs.lastBackupAt ? `It's been ${Math.floor(since(store.prefs.lastBackupAt))} days since your last backup.` : 'Your journey is only stored on this device. Export a backup to keep it safe.';
}
$('reminderBackup').onclick = exportBackup;
$('reminderLater').onclick = () => { store.prefs.reminderSnoozedAt = new Date().toISOString(); persist(); renderReminder(); };

/* ---------- day rollover, other tabs, offline ---------- */
function rollDay() {
  const k = MJ.todayKey(); if (k === today) return;
  today = k; resetCal();
  if (!['check', 'journeyForm'].includes(screen) && !document.querySelector('dialog[open]')) show(screen);
}
setInterval(rollDay, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) rollDay(); });
window.addEventListener('storage', e => { if (e.key === MJ.STORE_KEY && e.newValue) { try { store = MJ.cleanStore(JSON.parse(e.newValue)); roadJourney = null; show(screen); } catch {} } });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});

if (sessionStorage.getItem('mj-migrated') === '1' && store.journeys.length) {
  sessionStorage.removeItem('mj-migrated');
  const m = store.migration;
  $('fatal').className = 'banner'; $('fatal').textContent = `Welcome to the new My Journey. Your ${m ? m.days : ''} recorded days${m && m.journal ? ', ' + m.journal + ' journal entr' + (m.journal === 1 ? 'y' : 'ies') : ''} and Pit Stop wallet were carried over. Your original data is also still kept on this device.`;
  const ok = el('button', 'link', 'Got it'); ok.onclick = () => $('fatal').classList.add('hidden'); $('fatal').append(el('br'), ok);
  migratedNow = true; renderReminder();
}
{ const start = location.hash.slice(1); show(['journeyForm', 'check'].includes(start) && store.journeys.length ? 'today' : start || 'today'); }
