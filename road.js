/* My Journey — Journey Path renderer (Canvas 2D, true perspective).
 *
 * A pitched camera looks down a winding road toward layered mountains. Each recorded day is one
 * fixed-length section of road surface, coloured by its classification, in chronological order.
 * The road beyond the newest day continues to the horizon (the future); there is no end.
 *
 * Performance: the sky, stars, mountains and ground are rendered once per size into offscreen
 * canvases. Each frame only draws ~20 road polygons. Ambient motion runs at ~30 fps while the
 * Today screen is visible and stops completely otherwise or with reduced motion.
 */
(function (root) {
'use strict';
const COLORS = { goal: [24, 201, 140], progress: [168, 238, 200], detour: [246, 178, 66], pit: [170, 140, 255] };
const FOG = [58, 108, 168];
const ROAD = [10, 24, 50];
const L = 0.5;          // world length of one day (road width = 1)
const TIP_DEPTH = 11.5;   // distance from camera to the newest day
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const ease = t => 1 - Math.pow(1 - t, 3);
const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Deterministic randomness so the landscape is identical every launch.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function ridge(seed, n, rough) {
  const r = rng(seed), size = 2 ** n, a = new Float32Array(size + 1);
  a[0] = r(); a[size] = r();
  for (let step = size, amp = 1; step > 1; step /= 2, amp *= rough)
    for (let i = step / 2; i < size; i += step) a[i] = (a[i - step / 2] + a[i + step / 2]) / 2 + (r() - .5) * amp;
  let lo = Infinity, hi = -Infinity; for (const v of a) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  return Array.from(a, v => (v - lo) / (hi - lo || 1));
}

// The road's winding centreline, in road widths, as a function of distance.
const centre = z => 1.5 * Math.sin(z * 0.24 + 0.6) + 1.1 * Math.sin(z * 0.083 + 2.1) + 0.25 * Math.sin(z * 0.61 + 1);

class JourneyRoad {
  constructor(canvas, { onSelectDay } = {}) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.onSelectDay = onSelectDay;
    this.days = []; this.camZ = 0; this.anims = []; this.active = true; this.inView = true; this.hit = [];
    this.motion = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    this.t0 = performance.now(); this.lastFrame = 0; this.raf = 0;
    this.frame = this.frame.bind(this);
    this.resize();
    if (root.ResizeObserver) new ResizeObserver(() => { this.resize(); this.request(); }).observe(canvas);
    if (root.IntersectionObserver) new IntersectionObserver(es => { this.inView = es[0].isIntersecting; this.request(); }).observe(canvas);
    document.addEventListener('visibilitychange', () => this.request());
    if (this.motion.addEventListener) this.motion.addEventListener('change', () => this.request());
    canvas.addEventListener('click', e => this.click(e));
  }
  get reduced() { return this.motion.matches; }
  get tipZ() { return this.days.length * L; }

  /* days: chronological [{date, kind}]; changed: the date just saved (to animate). */
  setDays(days, { changed = null, intro = false } = {}) {
    if (!this.W) this.resize();
    const oldN = this.days.length, oldCam = this.camZ;
    this.days = days.slice();
    this.index = new Map(this.days.map((d, i) => [d.date, i]));
    const target = this.targetCam(this.days.length), now = performance.now();
    this.anims = [];
    if (this.reduced) { this.camZ = target; }
    else if (changed && this.index.has(changed) && this.index.get(changed) === this.days.length - 1 && this.days.length === oldN + 1) {
      // A new day: the section grows out of the road ahead, then the camera moves forward.
      this.anims.push({ type: 'grow', date: changed, t0: now, dur: 1100 });
      this.anims.push({ type: 'cam', from: oldCam, to: target, t0: now + 350, dur: 1800 });
      this.camZ = oldCam;
    } else if (changed) {
      // An earlier day was edited or added: its own section updates in place.
      if (Math.abs(oldCam - target) > 1e-6) { this.anims.push({ type: 'cam', from: oldCam, to: target, t0: now, dur: 1200 }); this.camZ = oldCam; } else this.camZ = target;
      this.anims.push({ type: 'pulse', date: changed, t0: now, dur: 1400 });
    } else if (intro) {
      this.anims.push({ type: 'cam', from: target - 2.4 * L, to: target, t0: now, dur: 2200 });
      this.camZ = target - 2.4 * L;
    } else this.camZ = target;
    this.request();
  }
  // A new journey starts right in front of the viewer; the viewing distance grows with the first days.
  targetCam(n) { const base = this.nearDz() + 1.1; return n * L - Math.min(TIP_DEPTH, base + n * L * .55); }
  setActive(on) { this.active = on; this.request(); }

  resize() {
    const r = this.canvas.getBoundingClientRect(), dpr = Math.min(root.devicePixelRatio || 1, 2);
    if (r.width < 2 || r.height < 2) return; // hidden (another screen is showing): keep the last real size
    const W = Math.round(r.width), H = Math.round(r.height);
    if (W === this.W && H === this.H && dpr === this.dpr) return;
    this.W = W; this.H = H; this.dpr = dpr;
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    // Camera: pitched down toward the road, horizon at ~41% height.
    this.pitch = 0.43; this.camH = 2.15; this.F = Math.min(W, H * 1.2);
    this.hy = H * 0.37; this.cy = this.hy + this.F * Math.tan(this.pitch);
    this.margin = Math.round(W * 0.25);
    this.buildScenery();
    if (this.days && !this.anims.length) this.camZ = this.targetCam(this.days.length);
  }

  /* ---------- projection ---------- */
  cameraX(camZ) { return centre(camZ + 4.2); }
  yawFor(camZ) { const look = 9; return clamp((centre(camZ + look) - this.cameraX(camZ)) / look, -0.12, 0.12); }
  project(x, z) {
    const dz = z - this.camZ, dx = x - this.camX - this.yaw * dz;
    const s = Math.sin(this.pitch), c = Math.cos(this.pitch);
    const depth = this.camH * s + dz * c, up = -this.camH * c + dz * s;
    return [this.W / 2 + dx * this.F / depth, this.cy - up * this.F / depth, depth];
  }
  projectH(x, z, h) {
    const dz = z - this.camZ, dx = x - this.camX - this.yaw * dz, s = Math.sin(this.pitch), c = Math.cos(this.pitch);
    const depth = (this.camH - h) * s + dz * c, up = (h - this.camH) * c + dz * s;
    return [this.W / 2 + dx * this.F / depth, this.cy - up * this.F / depth, depth];
  }
  /* Rolling hills fixed in world space beside the road. They are deterministic per stretch of road, so they stay put
   * and pass by as the camera advances. Placement keeps the next 12 units of road beyond each hill uncovered. */
  hillsBetween(z0, z1) {
    const out = [], CELL = 1.7;
    for (let cell = Math.floor(z0 / CELL); cell * CELL < z1; cell++) for (const side of [-1, 1]) {
      const r = rng((cell * 2 + (side > 0 ? 1 : 0)) * 2654435761 + 97); if (r() > .62) continue;
      const z = cell * CELL + r() * CELL, w = .9 + r() * 2.1, h = .5 + r() * 2.4, peak = (r() - .5) * .7;
      let off = side * (w + 1.3 + r() * 4.5); const xc = () => centre(z) + off;
      for (let k = 0; k < 40; k++) { let ok = true; for (let t = 0; t <= 12; t += .5) { const rc = centre(z + t); if (Math.abs(xc() - rc) < w + .9) { ok = false; break; } } if (ok) break; off += side * .35; }
      if (z >= z0 && z < z1) out.push({ z, x: xc(), w, h, peak, seed: cell * 7 + side });
    }
    return out.sort((a, b) => b.z - a.z);
  }
  drawHills(zNear, zFar) {
    for (const hl of this.hillsBetween(zNear + .8, zFar)) {
      const r = rng(hl.seed * 131 + 7), n = 20, pts = [], fog = this.fogAt(hl.z);
      for (let i = 0; i <= n; i++) { const t = i / n * 2 - 1, u = t < hl.peak ? (t - hl.peak) / (1 + hl.peak) : (t - hl.peak) / (1 - hl.peak), bump = Math.pow(Math.max(0, 1 - Math.abs(u)), 1.6) * (1 + (r() - .5) * .22); pts.push(this.projectH(hl.x + t * hl.w, hl.z, hl.h * bump)); }
      if (pts.some(p => p[2] <= .05)) continue;
      const [lx, ly] = this.project(hl.x - hl.w, hl.z), [rx, ry] = this.project(hl.x + hl.w, hl.z);
      const poly = pts.concat([[rx, ry + 2], [lx, ly + 2]]);
      const top = Math.min(...pts.map(p => p[1])), base = Math.max(ly, ry);
      const gr = this.ctx.createLinearGradient(0, top, 0, base);
      gr.addColorStop(0, rgba(mix([22, 46, 86], FOG, fog * .62))); gr.addColorStop(1, rgba(mix([5, 13, 30], [26, 58, 104], fog * .7)));
      this.fillPoly(poly, gr);
      const g = this.ctx; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
      g.strokeStyle = `rgba(150,210,255,${.1 * (1 - fog * .5)})`; g.lineWidth = .8; g.stroke();
    }
  }
  nearDz() {
    if (!this.W) return 3; const s = Math.sin(this.pitch), c = Math.cos(this.pitch), u = (this.cy - (this.H + 30)) / this.F; return this.camH * (u * s + c) / (s - u * c); }
  samples(z0, z1) { // far → near, finer close to the camera
    const out = [z1]; let z = z1;
    while (z > z0) { const d = Math.max(0.03, (z - this.camZ) * 0.045); z = Math.max(z0, z - d); out.push(z); }
    return out;
  }
  // Polygon for the strip between lateral offsets a..b (in road widths) from z0 to z1.
  strip(z0, z1, a, b) {
    const zs = this.samples(z0, z1), left = [], right = [];
    for (const z of zs) { const x = centre(z); left.push(this.project(x + a, z)); right.push(this.project(x + b, z)); }
    return left.concat(right.reverse());
  }
  fillPoly(pts, style) { const g = this.ctx; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fillStyle = style; g.fill(); }
  fogAt(z) { const d = Math.max(0, z - this.camZ); return clamp(1 - Math.exp(-d / 26), 0, .92); }

  /* ---------- static scenery ---------- */
  buildScenery() {
    const { W, H, hy, dpr, margin } = this, BW = W + margin * 2;
    const mk = () => { const c = document.createElement('canvas'); c.width = Math.round(BW * dpr); c.height = Math.round(H * dpr); const g = c.getContext('2d'); g.scale(dpr, dpr); return [c, g]; };
    const [bg, g] = mk(), cx = BW / 2;
    // Sky
    let gr = g.createLinearGradient(0, 0, 0, hy);
    gr.addColorStop(0, '#020713'); gr.addColorStop(.42, '#061430'); gr.addColorStop(.8, '#0c2853'); gr.addColorStop(1, '#1a4a85');
    g.fillStyle = gr; g.fillRect(0, 0, BW, hy + 2);
    // Stars
    const r = rng(7);
    for (let i = 0; i < 90; i++) { const x = r() * BW, y = Math.pow(r(), 1.6) * hy * .72, a = .15 + r() * .6, s = .35 + r() * .8; g.fillStyle = `rgba(210,230,255,${a})`; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill(); }
    // Horizon light: cool, cyan-white, behind the mountains
    const glow = (rx, ry, stops) => { g.save(); g.translate(cx, hy); g.scale(1, ry / rx); const rg = g.createRadialGradient(0, 0, 0, 0, 0, rx); stops.forEach(([o, c]) => rg.addColorStop(o, c)); g.fillStyle = rg; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore(); };
    glow(W * .75, H * .34, [[0, 'rgba(120,200,255,.42)'], [.35, 'rgba(70,150,235,.18)'], [1, 'rgba(40,90,180,0)']]);
    glow(W * .22, H * .07, [[0, 'rgba(225,245,255,.75)'], [.5, 'rgba(150,215,255,.25)'], [1, 'rgba(120,200,255,0)']]);
    // Mountain layers: far = taller, paler, hazier (atmospheric perspective); near = lower and darker.
    const layers = [
      { seed: 11, peak: .25, base: 0, top: [70, 118, 176], bottom: [52, 98, 156], rim: .38, rough: .56 },
      { seed: 23, peak: .19, base: 0, top: [40, 80, 136], bottom: [34, 72, 128], rim: .3, rough: .58 },
      { seed: 37, peak: .14, base: 0, top: [24, 54, 102], bottom: [22, 52, 98], rim: .22, rough: .6 },
      { seed: 51, peak: .095, base: 0, top: [14, 34, 70], bottom: [16, 40, 78], rim: .16, rough: .62 }
    ];
    const drawRange = (gg, L, x0, w, rimAlpha) => {
      const pts = ridge(L.seed, 8, L.rough), n = pts.length - 1, ys = [];
      const bottom = hy + Math.max(0, L.base) + 2; gg.beginPath(); gg.moveTo(x0, bottom);
      for (let i = 0; i <= n; i++) { const x = x0 + w * i / n, y = hy - (0.18 + 0.82 * pts[i]) * L.peak * H + L.base; ys.push([x, y]); gg.lineTo(x, y); }
      gg.lineTo(x0 + w, bottom); gg.closePath();
      const lg = gg.createLinearGradient(0, hy - L.peak * H + Math.max(0, L.base), 0, bottom);
      lg.addColorStop(0, rgba(L.top)); lg.addColorStop(1, L.blend ? rgba(L.blend) : rgba(mix(L.bottom, FOG, .45)));
      gg.fillStyle = lg; gg.fill();
      // Rim light on the ridgeline, strongest toward the bright horizon.
      const rl = gg.createLinearGradient(x0, 0, x0 + w, 0);
      rl.addColorStop(0, 'rgba(150,215,255,0)'); rl.addColorStop(.5 - (x0 - (cx - w / 2)) / w, `rgba(170,225,255,${rimAlpha})`); rl.addColorStop(1, 'rgba(150,215,255,0)');
      gg.beginPath(); ys.forEach(([x, y], i) => i ? gg.lineTo(x, y) : gg.moveTo(x, y)); gg.strokeStyle = rl; gg.lineWidth = 1.1; gg.stroke();
    };
    layers.forEach((Lr, i) => {
      drawRange(g, Lr, 0, BW, Lr.rim);
      // Haze settles in the valleys between ranges.
      const m = g.createLinearGradient(0, hy - H * (.05 + .02 * (3 - i)), 0, hy + 1);
      m.addColorStop(0, rgba(FOG, 0)); m.addColorStop(1, rgba(mix(FOG, [130, 190, 240], .3), .30 - i * .05));
      g.fillStyle = m; g.fillRect(0, hy - H * .1, BW, H * .1 + 1);
    });
    // Ground plane
    gr = g.createLinearGradient(0, hy, 0, H);
    gr.addColorStop(0, '#14335f'); gr.addColorStop(.12, '#0b2146'); gr.addColorStop(.5, '#06142c'); gr.addColorStop(1, '#030a18');
    g.fillStyle = gr; g.fillRect(0, hy, BW, H - hy);
    // Light from the horizon reflected on the valley floor; darker toward the edges.
    g.save(); g.translate(cx, hy); g.scale(1, .28);
    let rg2 = g.createRadialGradient(0, 0, 0, 0, 0, W * .9); rg2.addColorStop(0, 'rgba(90,160,235,.28)'); rg2.addColorStop(.4, 'rgba(50,110,200,.08)'); rg2.addColorStop(1, 'rgba(20,50,110,0)');
    g.fillStyle = rg2; g.fillRect(-W * .9, 0, W * 1.8, W * .9 / .28); g.restore();
    // Low ground mist bands.
    const gm = rng(91);
    for (let i = 0; i < 5; i++) { const y = hy + 4 + i * i * 5 + gm() * 6, h = 3 + i * 2.5; const lg2 = g.createLinearGradient(0, y - h, 0, y + h); lg2.addColorStop(0, 'rgba(110,170,230,0)'); lg2.addColorStop(.5, `rgba(110,170,230,${.07 - i * .01})`); lg2.addColorStop(1, 'rgba(110,170,230,0)'); g.fillStyle = lg2; g.fillRect(0, y - h, BW, h * 2); }
    this.bg = bg; this.BW = BW;

    // Foothills drawn in front of the far road, so the road winds into the mountains.
    const [fg, f] = mk();
    const foot = { seed: 77, peak: .085, base: H * .045, top: [13, 33, 68], bottom: [14, 34, 68], blend: [17, 44, 84], rim: .14, rough: .62 };
    drawRange(f, foot, 0, BW, foot.rim);
    const fy = hy + H * .045, fm = f.createLinearGradient(0, fy - H * .03, 0, fy + H * .02);
    fm.addColorStop(0, 'rgba(90,150,215,0)'); fm.addColorStop(.6, 'rgba(90,150,215,.16)'); fm.addColorStop(1, 'rgba(90,150,215,0)');
    f.fillStyle = fm; f.fillRect(0, fy - H * .03, BW, H * .05);
    this.fg = fg;

    // Vignette for a cinematic frame.
    const [vg, v] = [document.createElement('canvas'), null];
    vg.width = this.canvas.width; vg.height = this.canvas.height;
    const vv = vg.getContext('2d'); vv.scale(dpr, dpr);
    const vr = vv.createRadialGradient(W / 2, H * .45, Math.min(W, H) * .35, W / 2, H * .5, Math.max(W, H) * .78);
    vr.addColorStop(0, 'rgba(1,5,14,0)'); vr.addColorStop(1, 'rgba(1,5,14,.55)');
    vv.fillStyle = vr; vv.fillRect(0, 0, W, H);
    this.vignette = vg; void v;
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
  draw(t) {
    const { ctx: g, W, H, dpr } = this;
    // Advance animations.
    let grow = null, pulse = null;
    for (const a of this.anims) {
      const p = clamp((t - a.t0) / a.dur, 0, 1);
      if (a.type === 'cam') this.camZ = a.from + (a.to - a.from) * easeInOut(p);
      if (a.type === 'grow' && p < 1) grow = { date: a.date, p: ease(p) };
      if (a.type === 'pulse' && p < 1) pulse = { date: a.date, p };
    }
    this.anims = this.anims.filter(a => t < a.t0 + a.dur);
    this.camX = this.cameraX(this.camZ); this.yaw = this.yawFor(this.camZ);
    const vpShift = -this.yaw * this.F;
    const time = this.reduced ? 0 : Math.max(0, t - this.t0) / 1000;

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.drawImage(this.bg, -this.margin + vpShift, 0, this.BW, H);

    const zNear = this.camZ + this.nearDz() - 0.05, zFar = this.camZ + 170;
    const tip = this.tipZ - (grow ? L * (1 - grow.p) : 0);

    // Soft light the road casts on the ground.
    // Road surface, fading into the haze toward the horizon.
    const surf = g.createLinearGradient(0, this.hy, 0, H);
    surf.addColorStop(0, rgba(mix(ROAD, FOG, .8))); surf.addColorStop(.18, rgba(mix(ROAD, FOG, .35))); surf.addColorStop(1, rgba(ROAD));
    this.fillPoly(this.strip(zNear, zFar, -.5, .5), surf);

    // Recorded days: coloured sections laid into the road surface.
    this.hit = [];
    const first = Math.max(0, Math.floor((zNear) / L)), last = this.days.length - 1;
    for (let i = last; i >= first; i--) {
      const d = this.days[i], z0 = i * L, z1 = Math.min((i + 1) * L, i === last ? tip : (i + 1) * L);
      if (z1 <= zNear || z1 <= z0) continue;
      const a = Math.max(z0, zNear), mid = (a + z1) / 2, fog = this.fogAt(mid);
      let c = mix(COLORS[d.kind] || COLORS.goal, FOG, fog * .7);
      let glowA = .32 * (1 - fog);
      if (pulse && pulse.date === d.date) { const k = Math.sin(pulse.p * Math.PI); c = mix(c, [255, 255, 255], .35 * k); glowA += .4 * k; }
      if (grow && grow.date === d.date) glowA += .35 * (1 - grow.p);
      this.fillPoly(this.strip(a, z1, -.56, .56), rgba(c, glowA * .6));             // glow bleeding onto the shoulders
      const poly = this.strip(a, z1, -.44, .44);
      this.fillPoly(poly, rgba(c, .96));
      this.fillPoly(this.strip(a, z1, -.1, .1), rgba(mix(c, [255, 255, 255], .35), .35)); // sheen along the crown
      this.fillPoly(this.strip(Math.max(z0, zNear), Math.min(z0 + .035, z1), -.46, .46), rgba(mix(ROAD, FOG, fog * .6), .9)); // seam between days
      this.hit.push({ date: d.date, poly });
    }

    // Edge lines: thin cyan lines with a soft glow, the full length of the road.
    const edge = g.createLinearGradient(0, this.hy, 0, H);
    edge.addColorStop(0, 'rgba(140,220,255,.05)'); edge.addColorStop(.25, 'rgba(120,210,255,.55)'); edge.addColorStop(1, 'rgba(120,210,255,.9)');
    const edgeGlow = g.createLinearGradient(0, this.hy, 0, H);
    edgeGlow.addColorStop(0, 'rgba(90,180,255,0)'); edgeGlow.addColorStop(1, 'rgba(90,180,255,.22)');
    for (const s of [-1, 1]) {
      this.fillPoly(this.strip(zNear, zFar, s * .5 - .06, s * .5 + .06), edgeGlow);
      this.fillPoly(this.strip(zNear, zFar, s * .5 - .014, s * .5 + .014), edge);
    }
    // The road ahead: dashed centre line drifting gently toward the horizon.
    const dashL = .3, gap = .42, period = dashL + gap, phase = (time * .22) % period;
    for (let z = tip + .25 + phase; z < this.camZ + 90; z += period) {
      if (z + dashL < zNear) continue;
      const f = this.fogAt(z), a = (1 - f) * .75;
      if (a < .03) break;
      this.fillPoly(this.strip(Math.max(z, zNear), z + dashL, -.022, .022), `rgba(150,225,255,${a})`);
    }
    // A soft light travelling along the road ahead.
    if (!this.reduced) {
      const cyc = (time / 6.5) % 1, z = tip + .5 + Math.pow(cyc, 1.7) * 70;
      const [px, py, depth] = this.project(centre(z), z), rad = clamp(this.F / depth * .42, 2, 26), al = .42 * Math.sin(cyc * Math.PI);
      const rg = g.createRadialGradient(px, py, 0, px, py, rad); rg.addColorStop(0, `rgba(200,240,255,${al})`); rg.addColorStop(1, 'rgba(120,200,255,0)');
      g.globalCompositeOperation = 'lighter'; g.fillStyle = rg; g.beginPath(); g.ellipse(px, py, rad, rad * .5, 0, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over';
    }
    // "You are here": a glowing marker at the newest day.
    if (this.days.length || tip > zNear) {
      const zt = Math.max(tip, zNear + .2), [px, py, depth] = this.project(centre(zt), zt), s = this.F / depth;
      const breathe = this.reduced ? 1 : 1 + .08 * Math.sin(time * 2.2);
      const rg = g.createRadialGradient(px, py, 0, px, py, s * .55 * breathe);
      rg.addColorStop(0, 'rgba(235,250,255,.95)'); rg.addColorStop(.25, 'rgba(160,230,255,.55)'); rg.addColorStop(1, 'rgba(90,190,255,0)');
      g.globalCompositeOperation = 'lighter'; g.fillStyle = rg; g.beginPath(); g.ellipse(px, py, s * .55 * breathe, s * .3 * breathe, 0, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#f2fbff'; g.beginPath(); g.ellipse(px, py, Math.max(2, s * .07), Math.max(1.3, s * .04), 0, 0, 7); g.fill();
    }

    this.drawHills(zNear, this.camZ + 120);
    g.drawImage(this.fg, -this.margin + vpShift, 0, this.BW, H);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.vignette, 0, 0);
  }

  /* ---------- interaction ---------- */
  click(e) {
    if (!this.onSelectDay) return;
    const r = this.canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const inside = (p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
    let hit = this.hit.find(h => inside(h.poly));
    if (!hit) { // forgiving taps on thin distant sections
      let best = 22; for (const h of this.hit) { const cx = h.poly.reduce((s, p) => s + p[0], 0) / h.poly.length, cy = h.poly.reduce((s, p) => s + p[1], 0) / h.poly.length, d = Math.hypot(cx - x, cy - y); if (d < best) { best = d; hit = h; } }
    }
    if (hit) this.onSelectDay(hit.date);
  }
}
root.JourneyRoad = JourneyRoad;
})(window);
