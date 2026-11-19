/* My Journey — Journey Path renderer (Canvas 2D, true 3D perspective).
 *
 * Art direction: docs/reference/approved-journey-path.png. A glowing ribbon of day tiles enters from the
 * lower-left foreground and winds away to the right, up into a mountain pass lit by a rising sun.
 * Every tile is one recorded day, coloured by its classification, in date order. Beyond the newest day
 * the road continues as luminous cyan into the distance; it never ends.
 *
 * Performance: sky, sun, mountains, forest and ground are rendered once per size. Each frame draws the
 * road (~40 polygons), a cheap bloom (the road drawn into a small canvas and scaled up), and up to five
 * pins. Ambient motion (~30 fps) runs only while Today is visible and is off with reduced motion.
 */
(function (root) {
'use strict';
const COLORS = { goal: [22, 196, 120], progress: [150, 236, 120], detour: [255, 186, 40], pit: [160, 110, 255] };
const PIN = { goal: ['#2fd37e', '#0c8a4c'], progress: ['#9be88a', '#3fa55a'], detour: ['#ffd23f', '#d98a00'], pit: ['#b48cff', '#6c3fd0'] };
const FUTURE = [70, 170, 255];
const L = 0.3;             // length of one day along the road (world units)
const RW = 1.0;            // road width
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const ease = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function ridge(seed, n, rough) {
  const r = rng(seed), size = 2 ** n, a = new Float32Array(size + 1);
  a[0] = r(); a[size] = r();
  for (let step = size, amp = 1; step > 1; step /= 2, amp *= rough)
    for (let i = step / 2; i < size; i += step) a[i] = (a[i - step / 2] + a[i + step / 2]) / 2 + (r() - .5) * amp;
  let lo = Infinity, hi = -Infinity; for (const v of a) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return Array.from(a, v => (v - lo) / (hi - lo || 1));
}

/* The road is a fixed, art-directed curve on the valley floor (world x, z; the camera sits at the origin).
 * It enters from the lower-left, runs across the view (where recorded days are laid), then winds away to the
 * right into the pass. Days slide along it as new ones are added, which reads as the view moving forward. */
const CTRL = [[-6, 3.7], [-4.2, 3.95], [-2.6, 4.3], [-1.2, 4.8], [.05, 5.45], [1.15, 6.3], [2.3, 7.4], [3.3, 8.9], [3.7, 11], [5.0, 13.2], [5.5, 16.4], [7.2, 20.4], [7.6, 26], [10.2, 32], [11, 40.5], [14.6, 53], [20, 73], [34, 118], [60, 200]];
function catmull(p0, p1, p2, p3, t) { const t2 = t * t, t3 = t2 * t; return [0, 1].map(k => .5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)); }
const PATH = (() => {
  const pts = [];
  for (let i = 0; i < CTRL.length - 1; i++) { const p0 = CTRL[Math.max(0, i - 1)], p1 = CTRL[i], p2 = CTRL[i + 1], p3 = CTRL[Math.min(CTRL.length - 1, i + 2)]; for (let t = 0; t < 1; t += 1 / 60) pts.push(catmull(p0, p1, p2, p3, t)); }
  pts.push(CTRL[CTRL.length - 1]);
  const u = [0]; for (let i = 1; i < pts.length; i++) u.push(u[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, u, len: u[u.length - 1] };
})();
// Point and unit normal on the road centreline at arc length u.
function along(u) {
  const { pts, u: us } = PATH; u = clamp(u, 0, PATH.len - 1e-6);
  let lo = 0, hi = us.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (us[m] <= u) lo = m; else hi = m; }
  const t = (u - us[lo]) / (us[hi] - us[lo] || 1), a = pts[lo], b = pts[hi];
  const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
  return [x, z, -dz / l, dx / l];
}

class JourneyRoad {
  constructor(canvas, { onSelectDay } = {}) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.onSelectDay = onSelectDay;
    this.days = []; this.index = new Map(); this.camZ = 0; this.anims = []; this.active = true; this.inView = true; this.hit = []; this.pins = [];
    this.motion = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    this.t0 = performance.now(); this.lastFrame = 0; this.raf = 0;
    this.frame = this.frame.bind(this);
    this.glow = document.createElement('canvas'); this.glowCtx = this.glow.getContext('2d');
    this.resize();
    if (root.ResizeObserver) new ResizeObserver(() => { this.resize(); this.request(); }).observe(canvas);
    if (root.IntersectionObserver) new IntersectionObserver(es => { this.inView = es[0].isIntersecting; this.request(); }).observe(canvas);
    document.addEventListener('visibilitychange', () => this.request());
    if (this.motion.addEventListener) this.motion.addEventListener('change', () => this.request());
    canvas.addEventListener('click', e => this.click(e));
  }
  get reduced() { return this.motion.matches; }
  /* camZ is the position of the newest day's far edge along the road (arc length). */

  /* days: chronological [{date, kind}]; changed: the date just saved (animated). */
  setDays(days, { changed = null, intro = false } = {}) {
    if (!this.W) this.resize();
    const oldN = this.days.length, oldTip = this.camZ;
    this.days = days.slice();
    this.index = new Map(this.days.map((d, i) => [d.date, i]));
    const target = this.targetCam(this.days.length), now = performance.now();
    this.anims = [];
    if (this.reduced || !this.W) this.camZ = target;
    else if (changed && this.index.get(changed) === this.days.length - 1 && this.days.length === oldN + 1) {
      // A new day: its tile sweeps in just past the previous newest day and its pin drops;
      // then the whole road slides back toward the viewer, which reads as moving forward.
      this.camZ = oldN ? oldTip + L : target;
      this.anims.push({ type: 'grow', date: changed, t0: now, dur: 1000 });
      this.anims.push({ type: 'pin', date: changed, t0: now + 550, dur: 700 });
      if (Math.abs(this.camZ - target) > 1e-6) this.anims.push({ type: 'cam', from: this.camZ, to: target, t0: now + 700, dur: 1700 });
    } else if (changed) {
      // An earlier day was edited or inserted: its own tile updates in place.
      if (oldN && Math.abs(oldTip - target) > 1e-6) { this.anims.push({ type: 'cam', from: oldTip, to: target, t0: now, dur: 1200 }); this.camZ = oldTip; } else this.camZ = target;
      this.anims.push({ type: 'pulse', date: changed, t0: now, dur: 1400 });
    } else if (intro && this.days.length) {
      this.anims.push({ type: 'cam', from: target + 3 * L, to: target, t0: now, dur: 2000 });
      this.camZ = target + 3 * L;
    } else this.camZ = target;
    this.request();
  }
  setActive(on) { this.active = on; this.request(); }

  resize() {
    const r = this.canvas.getBoundingClientRect(), dpr = Math.min(root.devicePixelRatio || 1, 2);
    if (r.width < 2 || r.height < 2) return; // hidden: keep the last real size
    const W = Math.round(r.width), H = Math.round(r.height);
    if (W === this.W && H === this.H && dpr === this.dpr) return;
    this.W = W; this.H = H; this.dpr = dpr;
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    // Static camera at the origin, slightly pitched down. Horizontal scale follows the width so the road always
    // crosses the full view; the vertical layout follows the height.
    this.F = W;
    this.hy = H * .42;
    this.camH = H * .16 * 5.3 / this.F;
    this.glow.width = Math.max(1, Math.round(W / 3)); this.glow.height = Math.max(1, Math.round(H / 3));
    this.buildScenery();
    this.uRest = this.uAtX(W * .62); this.uStart = this.uAtX(W * .1);
    if (this.days && !this.anims.length) this.camZ = this.targetCam(this.days.length);
  }

  /* ---------- projection ---------- */
  project(x, z, h = 0) { h += clamp((z - 7.2) * .075, 0, 3.6); return [this.W / 2 + x * this.F / z, this.hy + (this.camH - h) * this.F / z, z]; }
  at(u, off = 0) { const [x, z, nx, nz] = along(u); return this.project(x + nx * off, z + nz * off); }
  uAtX(px) { let lo = 0, hi = 30; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (this.at(m)[0] < px) lo = m; else hi = m; } return (lo + hi) / 2; }
  // Newest day position for n recorded days: a new journey starts near the left; once the road is full the
  // newest day rests ~60% across the view and every new day slides the road back by one tile.
  targetCam(n) { if (!this.W) return n * L; return Math.min(this.uRest, this.uStart + n * L); }
  samples(u0, u1) { const out = [u1]; let u = u1; while (u > u0) { const z = along(u)[1]; u = Math.max(u0, u - clamp(z * .02, .04, 1.5)); out.push(u); } return out; }
  strip(u0, u1, a, b) {
    const us = this.samples(u0, u1), left = [], right = [];
    for (const u of us) { left.push(this.at(u, a * RW)); right.push(this.at(u, b * RW)); }
    return left.concat(right.reverse());
  }
  poly(g, pts, style) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fillStyle = style; g.fill(); }
  fogAt(u) { return clamp((along(u)[1] - 7) / 60, 0, .85); }
  /* ---------- static scenery ---------- */
  buildScenery() {
    const { W, H, hy, dpr } = this;
    const bg = document.createElement('canvas'); bg.width = Math.round(W * dpr); bg.height = Math.round(H * dpr);
    const g = bg.getContext('2d'); g.scale(dpr, dpr);
    const sunX = W * .78, sunY = hy - H * .07;
    this.sun = [sunX, sunY];
    // Sky
    let gr = g.createLinearGradient(0, 0, 0, hy);
    gr.addColorStop(0, '#020a1a'); gr.addColorStop(.45, '#05173a'); gr.addColorStop(.8, '#0c2f63'); gr.addColorStop(1, '#1d5594');
    g.fillStyle = gr; g.fillRect(0, 0, W, hy + 2);
    const glow = (x, y, rx, ry, stops) => { g.save(); g.translate(x, y); g.scale(1, ry / rx); const rg = g.createRadialGradient(0, 0, 0, 0, 0, rx); stops.forEach(([o, c]) => rg.addColorStop(o, c)); g.fillStyle = rg; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore(); };
    glow(sunX, sunY, W * .95, H * .42, [[0, 'rgba(120,190,255,.38)'], [.4, 'rgba(60,130,230,.14)'], [1, 'rgba(30,80,170,0)']]);
    // Stars
    const r = rng(7);
    for (let i = 0; i < 110; i++) { const x = r() * W, y = Math.pow(r(), 1.5) * hy * .75, a = .12 + r() * .55, s = .3 + r() * .75; g.fillStyle = `rgba(210,230,255,${a})`; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill(); }
    // Mountains: a few massive peaks, each with a sunlit face toward the pass and a shadowed face away from it.
    const range = (peaks, base, col, lit, seed) => {
      const nr = rng(seed), N = 260, ys = [];
      const noise = Array.from({ length: N + 1 }, () => nr()); for (let k = 0; k < 3; k++) for (let i = 1; i < N; i++) noise[i] = (noise[i - 1] + noise[i] + noise[i + 1]) / 3;
      for (let i = 0; i <= N; i++) { const x = W * i / N; let h = 0; for (const [c, ph, w] of peaks) { const d = Math.min(1, Math.abs(x - c * W) / (w * W)); h = Math.max(h, ph * H * (.55 * (1 - d) + .45 * (.5 + .5 * Math.cos(d * Math.PI)))); } ys.push([x, base - h - (noise[i] - .5) * H * .03 * (.4 + h / (H * .1))]); }
      g.beginPath(); g.moveTo(0, base + 2); ys.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(W, base + 2); g.closePath();
      const lg = g.createLinearGradient(0, base - H * .25, 0, base); lg.addColorStop(0, rgba(col)); lg.addColorStop(1, rgba(mix(col, [70, 120, 190], .35))); g.fillStyle = lg; g.fill();
      g.save(); g.clip();
      for (const [c, ph, w] of peaks) {
        const px = c * W, py = base - ph * H, dir = sunX > px ? 1 : -1, near = 1 - clamp(Math.abs(sunX - px) / W * 1.2, 0, .8);
        // sunlit face: from the summit toward the sun, down to the valley
        g.beginPath(); g.moveTo(px, py - 2); g.lineTo(px + dir * w * W * 1.05, base + 2); g.lineTo(px + dir * w * W * .12, base + 2); g.lineTo(px - dir * ph * H * .08, py + ph * H * .35); g.closePath();
        let gl = g.createLinearGradient(px, py, px + dir * w * W * .5, base);
        gl.addColorStop(0, `rgba(160,205,255,${.34 * lit * near})`); gl.addColorStop(.45, `rgba(90,150,230,${.14 * lit * near})`); gl.addColorStop(1, 'rgba(60,110,200,0)'); g.fillStyle = gl; g.fill();
        // shadow face away from the sun
        g.beginPath(); g.moveTo(px, py - 2); g.lineTo(px - dir * w * W * 1.05, base + 2); g.lineTo(px - dir * w * W * .1, base + 2); g.closePath();
        gl = g.createLinearGradient(px, py, px - dir * w * W * .5, base); gl.addColorStop(0, 'rgba(2,8,24,.35)'); gl.addColorStop(1, 'rgba(2,8,24,.05)'); g.fillStyle = gl; g.fill();
        // snow-bright ridge line catching the light
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + dir * w * W * .35, py + ph * H * .4);
        g.strokeStyle = `rgba(225,236,255,${.3 * lit * near})`; g.lineWidth = 1; g.stroke();
      }
      g.restore();
    };
    range([[.08, .06, .22], [.33, .09, .24], [.6, .17, .2], [.96, .23, .22]], hy - H * .01, [34, 64, 116], .9, 3);
    // Sun rising in the pass: a pale warm core inside a wide cool glow.
    glow(sunX, sunY + H * .02, W * .42, H * .15, [[0, 'rgba(255,226,180,.85)'], [.08, 'rgba(255,200,130,.5)'], [.3, 'rgba(130,190,255,.24)'], [1, 'rgba(90,160,255,0)']]);
    glow(sunX, sunY + H * .022, W * .035, H * .018, [[0, 'rgba(255,253,245,1)'], [.55, 'rgba(255,226,165,.85)'], [1, 'rgba(255,215,150,0)']]);
    range([[.16, .06, .22], [.55, .13, .18], [.99, .19, .18]], hy + H * .01, [18, 40, 82], .75, 9);
    range([[.05, .055, .2], [.3, .045, .2], [.66, .04, .16], [.9, .07, .18]], hy + H * .035, [9, 24, 52], .4, 15);
    // Mist where the ranges meet the valley
    gr = g.createLinearGradient(0, hy - H * .05, 0, hy + H * .06); gr.addColorStop(0, 'rgba(120,180,240,0)'); gr.addColorStop(.55, 'rgba(120,180,240,.2)'); gr.addColorStop(1, 'rgba(120,180,240,0)');
    g.fillStyle = gr; g.fillRect(0, hy - H * .05, W, H * .11);
    // Valley floor
    gr = g.createLinearGradient(0, hy + H * .02, 0, H);
    gr.addColorStop(0, '#0d2a52'); gr.addColorStop(.25, '#071a38'); gr.addColorStop(.6, '#041127'); gr.addColorStop(1, '#020a18');
    g.fillStyle = gr; g.fillRect(0, hy + H * .02, W, H);
    // Low rolling hills on the valley floor
    const hills = (seed, y0, amp, col, a) => { const p = ridge(seed, 7, .55), n = p.length - 1; g.beginPath(); g.moveTo(0, H); for (let i = 0; i <= n; i++) g.lineTo(W * i / n, y0 - p[i] * amp); g.lineTo(W, H); g.closePath(); g.fillStyle = rgba(col, a); g.fill(); };
    hills(61, hy + H * .06, H * .045, [10, 32, 66], 1);
    hills(67, hy + H * .13, H * .05, [6, 22, 48], 1);
    // Pine forests: a tree line on the left behind the road and darker trees lower right.
    const pine = (x, y, h, col, rim) => {
      const w = h * .42; g.beginPath(); g.moveTo(x, y - h);
      for (let k = 1; k <= 4; k++) { const t = k / 4, yy = y - h + h * t * .92, ww = w * t * (k % 2 ? 1 : .78); g.lineTo(x + ww / 2, yy); g.lineTo(x + ww * .22, yy - h * .05); }
      g.lineTo(x + w * .08, y); g.lineTo(x - w * .08, y);
      for (let k = 4; k >= 1; k--) { const t = k / 4, yy = y - h + h * t * .92, ww = w * t * (k % 2 ? 1 : .78); g.lineTo(x - ww * .22, yy - h * .05); g.lineTo(x - ww / 2, yy); }
      g.closePath(); g.fillStyle = col; g.fill();
      if (rim) { g.strokeStyle = rim; g.lineWidth = .6; g.stroke(); }
    };
    const tr = rng(101);
    for (let i = 0; i < 70; i++) { const x = tr() * W * .55, y = hy + H * (.09 + tr() * .05) + x / W * H * .02, h = H * (.025 + tr() * .045); pine(x, y, h, '#06142c', 'rgba(110,170,240,.12)'); }
    for (let i = 0; i < 40; i++) { const x = W * (.55 + tr() * .45), y = hy + H * (.2 + tr() * .06), h = H * (.03 + tr() * .05); pine(x, y, h, '#041024', 'rgba(110,170,240,.08)'); }
    for (let i = 0; i < 60; i++) { const x = tr() * W, y = hy + H * (.33 + tr() * .14), h = H * (.03 + tr() * .05); pine(x, y, h, '#030d20', 'rgba(110,170,240,.06)'); }
    this.bg = bg;
    // Vignette
    const vg = document.createElement('canvas'); vg.width = bg.width; vg.height = bg.height;
    const v = vg.getContext('2d'); v.scale(dpr, dpr);
    const vr = v.createRadialGradient(W * .55, H * .45, Math.min(W, H) * .3, W * .5, H * .5, Math.max(W, H) * .8);
    vr.addColorStop(0, 'rgba(1,5,14,0)'); vr.addColorStop(1, 'rgba(1,5,14,.6)'); v.fillStyle = vr; v.fillRect(0, 0, W, H);
    this.vignette = vg;
  }

  /* ---------- frame loop ---------- */
  request() { if (!this.raf) this.raf = requestAnimationFrame(this.frame); }
  shouldAnimate() { return this.active && this.inView && !document.hidden; }
  frame(t) {
    this.raf = 0;
    if (!this.shouldAnimate() || !this.W) return;
    const busy = this.anims.some(a => t < a.t0 + a.dur);
    if (busy || t - this.lastFrame >= 32 || !this.lastFrame) { this.lastFrame = t; this.draw(t); }
    if (busy || !this.reduced) this.raf = requestAnimationFrame(this.frame);
  }

  // Draws the road; used twice: into the small glow canvas (bloom) and crisply on screen.
  paintRoad(g, bloom, st) {
    const { tip, first, last, grow, pulse, light } = st, end = PATH.len - 1, uMin = .2;
    this.poly(g, this.strip(uMin, end, -.56, .56), bloom ? 'rgba(40,120,255,.4)' : 'rgba(6,18,42,.92)');
    // The road ahead: luminous cyan-blue fading into the distance; its seams drift as the road moves.
    if (tip < end) {
      const [ax, ay] = this.at(tip), [bx, by] = this.at(Math.min(end, tip + 12)), ahead = g.createLinearGradient(ax, ay, bx, by);
      ahead.addColorStop(0, rgba(FUTURE, .92)); ahead.addColorStop(1, rgba(mix(FUTURE, [200, 230, 255], .55), .6));
      this.poly(g, this.strip(Math.max(tip, uMin), end, -.44, .44), ahead);
      if (!bloom) for (let u = tip + L; u < Math.min(end, tip + 30 * L); u += L) this.poly(g, this.strip(u, u + .025, -.44, .44), `rgba(3,14,34,${.4 * (1 - this.fogAt(u))})`);
    }
    // Recorded days: one tile each, oldest nearest the viewer.
    for (let i = last; i >= first; i--) {
      const d = this.days[i], u1 = i === last ? tip : st.tipFull - (last - i) * L, u0 = (i === last ? st.tipFull : u1) - L;
      const a = Math.max(u0, uMin); if (u1 <= a) continue;
      let c = COLORS[d.kind] || COLORS.goal, k = 0;
      if (pulse && pulse.date === d.date) k = Math.sin(pulse.p * Math.PI) * .6;
      if (grow && grow.date === d.date) k = Math.max(k, (1 - grow.p) * .7);
      if (light !== null) k = Math.max(k, Math.exp(-Math.pow((i + .5 - light) / 1.1, 2)) * .75);
      c = mix(c, [255, 255, 255], k * .7);
      if (bloom) { this.poly(g, this.strip(a, u1, -.5, .5), rgba(c, .95)); continue; }
      const tile = this.strip(a, u1, -.44, .44);
      this.poly(g, tile, rgba(c, .97));
      this.poly(g, this.strip(a, u1, -.44, -.05), rgba(mix(c, [255, 255, 255], .22), .28));   // lit near half
      this.poly(g, this.strip(a, u1, .2, .44), 'rgba(0,10,30,.12)');                           // far half in shade
      if (u0 >= uMin) this.poly(g, this.strip(u0, Math.min(u0 + .02, u1), -.44, .44), 'rgba(3,14,34,.5)'); // seam
      this.hit.push({ date: d.date, poly: tile });
    }
    if (bloom) return;
    for (const sgn of [-1, 1]) this.poly(g, this.strip(uMin, end, sgn * .5 - .025, sgn * .5 + .025), sgn < 0 ? 'rgba(170,230,255,.9)' : 'rgba(120,200,255,.55)');
  }

  draw(t) {
    const { ctx: g, W, H, dpr } = this;
    let grow = null, pulse = null, pinDrop = null;
    for (const a of this.anims) {
      const p = clamp((t - a.t0) / a.dur, 0, 1);
      if (a.type === 'cam') this.camZ = a.from + (a.to - a.from) * easeInOut(p);
      if (a.type === 'grow' && p < 1) grow = { date: a.date, p: ease(p) };
      if (a.type === 'pulse' && p < 1) pulse = { date: a.date, p };
      if (a.type === 'pin' && t < a.t0 + a.dur) pinDrop = { date: a.date, p };
    }
    this.anims = this.anims.filter(a => t < a.t0 + a.dur);
    const time = this.reduced ? 0 : Math.max(0, t - this.t0) / 1000;
    const last = this.days.length - 1, tipFull = this.camZ, tip = tipFull - (grow ? L * (1 - grow.p) : 0);
    // Oldest tile still on screen (tiles further back have passed beyond the left edge).
    const first = Math.max(0, last - Math.ceil((tipFull - .2) / L));
    let light = null;
    if (!this.reduced && last >= first && !grow) { const span = last + 1 - first, cyc = (time / 2.6) % 1; light = first + cyc * (span + 3) - 1.5; }
    const st = { tip, tipFull, first, last, grow, pulse, light };

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.drawImage(this.bg, 0, 0, W, H);
    // Bloom: the road drawn small then scaled up gives a soft neon glow on the ground and in the air.
    const gg = this.glowCtx; gg.setTransform(this.glow.width / W, 0, 0, this.glow.height / H, 0, 0); gg.clearRect(0, 0, W, H);
    this.hit = []; this.paintRoad(gg, true, st);
    g.save(); g.globalCompositeOperation = 'lighter';
    g.globalAlpha = .75; g.drawImage(this.glow, 0, 0, W, H);
    g.globalAlpha = .45; g.drawImage(this.glow, -W * .03, -H * .05, W * 1.06, H * 1.1);
    g.restore();
    this.hit = []; this.paintRoad(g, false, st);
    // Light where the road enters the view, as in the reference.
    { const [x, y] = this.at(.35), rg = g.createRadialGradient(x, y, 0, x, y, W * .26); rg.addColorStop(0, 'rgba(210,245,255,.8)'); rg.addColorStop(.25, 'rgba(120,210,255,.35)'); rg.addColorStop(1, 'rgba(90,170,255,0)'); g.globalCompositeOperation = 'lighter'; g.fillStyle = rg; g.beginPath(); g.ellipse(x, y, W * .22, W * .08, -.2, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over'; }
    // The travelling light
    if (light !== null && light < last + 1.6) {
      const ul = clamp(tip - (last + .5 - light) * L, .3, tip), [px, py, d] = this.at(ul), rad = clamp(this.F / d * .5, 12, 50);
      const rg = g.createRadialGradient(px, py, 0, px, py, rad); rg.addColorStop(0, 'rgba(245,253,255,.9)'); rg.addColorStop(.3, 'rgba(170,230,255,.4)'); rg.addColorStop(1, 'rgba(120,200,255,0)');
      g.globalCompositeOperation = 'lighter'; g.fillStyle = rg; g.beginPath(); g.ellipse(px, py, rad, rad * .45, 0, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over';
    }
    this.drawPins(g, st, pinDrop);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.vignette, 0, 0);
  }

  /* Pins mark the newest day and the most recent visible day of each kind (at most 5, never overlapping). */
  drawPins(g, st, drop) {
    this.pins = [];
    if (st.last < 0) return;
    const pos = i => { const um = (i === st.last ? st.tip : st.tipFull - (st.last - i) * L) - .5 * L; return um < .5 ? null : this.at(um); };
    const order = [st.last], xs = [];
    { const p0 = pos(st.last); if (p0) xs.push(p0[0]); }
    for (const kind of ['goal', 'progress', 'detour', 'pit']) {
      for (let i = st.last - 1; i >= st.first; i--) {
        if (kind === this.days[st.last].kind) break;
        if (this.days[i].kind !== kind || order.includes(i)) continue;
        const p = pos(i); if (!p || p[0] < 14) break;
        if (xs.some(x => Math.abs(x - p[0]) < 27)) continue;
        order.push(i); xs.push(p[0]); break;
      }
    }
    const placed = [];
    for (const i of order) {
      const d = this.days[i], um = (i === st.last ? st.tip : st.tipFull - (st.last - i) * L) - .5 * L;
      if (um < .5) continue;
      const [x, y, depth] = this.at(um);
      if (x < 8 || x > this.W - 8) continue;
      const r = clamp(this.F / depth * .2, 12.5, 18);
      let lift = 0, sc = 1;
      if (drop && drop.date === d.date) { const p = drop.p; if (p < .01) continue; lift = (1 - ease(Math.min(1, p * 1.6))) * 36; sc = p < .6 ? .6 + p * .7 : 1 + Math.sin((p - .6) / .4 * Math.PI) * .12; }
      placed.push(x);
      this.pin(g, x, y - lift, r * sc, d.kind);
      this.pins.push({ date: d.date, x, y: y - r * 2.25 - lift, r: r * 1.2 });
    }
  }
  pin(g, x, y, r, kind) {
    const [c1, c2] = PIN[kind] || PIN.goal, cy = y - r * 2.25;
    // glow on the road under the pin
    const gl = g.createRadialGradient(x, y, 0, x, y, r * 1.6); gl.addColorStop(0, rgba(COLORS[kind], .55)); gl.addColorStop(1, rgba(COLORS[kind], 0));
    g.fillStyle = gl; g.beginPath(); g.ellipse(x, y, r * 1.6, r * .6, 0, 0, 7); g.fill();
    g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
    g.beginPath(); g.moveTo(x, y);
    g.bezierCurveTo(x - r * .35, y - r * .55, x - r, cy + r * .55, x - r, cy);
    g.arc(x, cy, r, Math.PI, 0);
    g.bezierCurveTo(x + r, cy + r * .55, x + r * .35, y - r * .55, x, y);
    const fill = g.createLinearGradient(x - r, cy - r, x + r, cy + r); fill.addColorStop(0, c1); fill.addColorStop(1, c2);
    g.fillStyle = fill; g.fill(); g.restore();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.stroke();
    // inner ring + glyph
    g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = Math.max(1.2, r * .13); g.beginPath(); g.arc(x, cy, r * .62, 0, 7); g.stroke();
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = Math.max(1.4, r * .16);
    const u = r * .3;
    if (kind === 'goal' || kind === 'progress') { g.beginPath(); g.moveTo(x - u, cy); g.lineTo(x - u * .25, cy + u * .75); g.lineTo(x + u * 1.05, cy - u * .7); g.stroke(); }
    else if (kind === 'detour') { g.beginPath(); g.moveTo(x, cy - u * 1.1); g.lineTo(x, cy + u * .3); g.stroke(); g.beginPath(); g.arc(x, cy + u * .95, g.lineWidth * .6, 0, 7); g.fill(); }
    else { g.fillRect(x - u * .75, cy - u * .85, u * .5, u * 1.7); g.fillRect(x + u * .25, cy - u * .85, u * .5, u * 1.7); }
    // soft top highlight
    const hl = g.createRadialGradient(x - r * .35, cy - r * .45, 0, x - r * .35, cy - r * .45, r * .8); hl.addColorStop(0, 'rgba(255,255,255,.35)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl; g.beginPath(); g.arc(x, cy, r, 0, 7); g.fill();
  }

  /* ---------- interaction ---------- */
  click(e) {
    if (!this.onSelectDay) return;
    const r = this.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const pin = this.pins.find(p => Math.hypot(p.x - x, p.y - y) < p.r + 6);
    if (pin) return this.onSelectDay(pin.date);
    const inside = p => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
    let hit = this.hit.find(h => inside(h.poly));
    if (!hit) { let best = 22; for (const h of this.hit) { const cx = h.poly.reduce((s, p) => s + p[0], 0) / h.poly.length, cy = h.poly.reduce((s, p) => s + p[1], 0) / h.poly.length, d = Math.hypot(cx - x, cy - y); if (d < best) { best = d; hit = h; } } }
    if (hit) this.onSelectDay(hit.date);
  }
}
root.JourneyRoad = JourneyRoad;
})(window);
