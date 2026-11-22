/** NeuroSurge: the ELECTRICAL MAP's live scan and storms, the pure part (22 November 2026, section 192, part 3; the map
 * itself is ns-emap.mjs, its drawing ns-emap-three.mjs).
 *
 * The owner, 22 November about 01:25: "I mean like a live brain scan map where you have electrical wire, electrical
 * storm activity going everywhere." And on 20 November: "a connectomic activity map ... where we can actually see
 * activity, color-coded ... electrical storms and electrical activity and neural activity and networks and pathways ...
 * from brain to body and body to brain. And then we can tie that to muscle contraction."
 *
 * WHAT IT WORKS OUT, once a frame, as a few small arrays the drawing hands to its shaders (nothing per spot, per pulse
 * or per vertex on the processor):
 *  - the scan's resting sources (`base`): a few dozen soft hot spots on the brain's surface that swell, drift and fade,
 *    each slowly (no source changes faster than once in five seconds);
 *  - the storms (`storm0..2`): every one to three seconds a burst starts on a region (sometimes where the look rests),
 *    swells as a hot core with a wave rolling out over the surface, fires the fibres of the region's links so a front
 *    runs along each to the regions they join, which then flare in turn (one or two hops), and now and then sends a
 *    volley down the cord; each calms over one to two seconds; several overlap;
 *  - the activations (`act`): a switched-on area is the hottest spot of the scan while it is lit, its linked regions
 *    warm, and the feeling strip behind it warms when the report comes back.
 * Every function of light here is smooth: a point brightens and darkens at most about three times a second (the
 * owner: "The game currently physically hurts to look at with your eyes"); tests check it on the curves.
 *
 * WHAT IT IS. Made-up activity for the game, drawn like a live brain scan: not a recording, not a measurement.
 * No three.js, no DOM.
 */

const freeze = Object.freeze;

/** The scan and the storms (display choices, 22 November 2026; the owner's words above; tuned on pictures at 1600 x
 * 900). Millimetres are the brain atlas's; seconds are the map's clock.
 *  - slots: storms alive at once (primary and their hops), the size of the shaders' arrays;
 *  - everyS: a new storm starts after a pause drawn between these; lookShare: the share of storms that start on the
 *    region the look rests on;
 *  - riseS / fadeS: a storm swells over riseS, then calms over a time drawn between fadeS (its light is the product of
 *    the two smooth steps, so it rises once and falls once);
 *  - coreMm: the hot core's radius; waveMmS / waveWMm / waveGain / waveMaxMm: the wave rolling out over the surface
 *    (its speed, half width, light and how far it goes: a point under it brightens and darkens once in about
 *    2 * waveWMm / waveMmS = 0.58 s); a storm's place is the point of its region nearest the eye of pointsOf drawn
 *    at random (`eye`, stepStorms; a point nearer the midline than medialMm counts as that much farther: seen
 *    face-on through the gap between the halves a storm there was a bright block behind the mirror body), and a new
 *    storm's region the nearest of pickOf drawn (13 mm, 0.34 and 26 mm at first: the storms were small and many of
 *    them on the brain's far side, unseen; then 20 mm, 0.6 and 90 mm with strengths 0.7 to 1: close up, with an area
 *    lit, the heat summed to near white over most of the brain, a white-out); area: a lit area's own storm;
 *  - hops / hopGain / hopFan: a storm fires up to hopFan of its region's links; the regions they join flare when the
 *    front arrives (hop 1) and fire on once more (hop 2), each weaker;
 *  - fibreMmS: the fronts' speed along the fibres; fibreHeadMm: their head's half length (a point under a passing
 *    head brightens over about 2 * fibreHeadMm / fibreMmS = 0.15 s and settles to the storm's steady light: it travels,
 *    it does not blink);
 *  - cordShare / cordDelayS / cordRate: now and then a storm sends a volley down the cord, cordDelayS after it starts,
 *    running cordRate seconds of the route's own time coordinate a second (the route's front runs 1: this one is slower);
 *  - strength: a primary storm's strength is drawn between these;
 *  - base: the resting sources (n of them, each drifting driftMm about its place over driftS, swelling with a period
 *    drawn from periodS, up to gain, radius radiusMm); floor: the scan's light where nothing happens;
 *  - act: the activation's sources (at most n; the area itself at `level` of its level, a linked region at `link`, the
 *    feeling strip at `sens` once the report is back; radiusMm);
 *  - traffic: the pulses that run on every wire at all times: hz pulses a second pass any point (never more than
 *    1.1: three times a second is the limit), spacingMm apart (long bundles wider apart, so they run faster), gain. */
export const EMAP_STORM = freeze({
  slots: 16,
  everyS: freeze([1, 3]), lookShare: 0.35,
  riseS: 0.3, fadeS: freeze([1, 2]),
  coreMm: 18, waveMmS: 50, waveWMm: 16, waveGain: 0.45, waveMaxMm: 70,
  hops: 2, hopGain: freeze([1, 0.55, 0.3]), hopFan: 2,
  fibreMmS: 160, fibreHeadMm: 12,
  cordShare: 0.3, cordDelayS: 0.25, cordRate: 0.3,
  strength: freeze([0.55, 0.85]), pickOf: 3, pointsOf: 6, medialMm: 25, area: 0.5,
  // (22 November 2026, after a third checker: at rest one or two soft clouds at a time read as calm weather; between the
  // storms, small short flares of their own start every minor.everyS on the side the player sees: weaker, no cascade,
  // no volley, each rising once and falling once)
  minor: freeze({ everyS: freeze([0.45, 1.1]), strength: freeze([0.3, 0.5]), fadeS: freeze([0.6, 1.0]) }),
  base: freeze({ n: 12, driftMm: 16, driftS: freeze([7, 15]), periodS: freeze([5, 11]), gain: 0.45, radiusMm: 36 }),
  floor: 0.1,
  // (22 November 2026: the heat above the floor fades to nothing toward the midline, from midFadeMm[1] to midFadeMm[0]
  // millimetres off it: the halves' inner faces, seen face-on through the gap, glowed as a flat yellow bar behind the
  // mirror body; a checker and a reviewer found it, and that it spread there from storms placed elsewhere)
  midFadeMm: freeze([6, 22]),
  act: freeze({ n: 8, level: 0.75, link: 0.3, sens: 0.45, radiusMm: 14 }),
  traffic: freeze({ hz: freeze([0.6, 1.1]), spacingMm: freeze({ brain: 22, body: 60, bundle: 34 }), gain: 0.5 })
});

/** The scan's colour scale (a live functional scan's: deep violet at rest, through blue, cyan, green, yellow and
 * orange, to near white only at the hottest cores), as [heat, r, g, b] stops. */
export const SCAN_STOPS = freeze([
  freeze([0, 0.16, 0.06, 0.42]), freeze([0.22, 0.08, 0.2, 0.85]), freeze([0.42, 0.0, 0.72, 0.9]), freeze([0.58, 0.18, 0.88, 0.36]),
  freeze([0.72, 0.96, 0.9, 0.18]), freeze([0.86, 1.0, 0.48, 0.08]), freeze([1, 1.0, 0.93, 0.82])
]);

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The heat as it is shown: up to 0.7 as it is, above that at half the rate, so near white needs a heat of 1.3 (one
 * storm's core alone stays orange; near white is where a storm, a hop and a lit area meet). Pure. */
export const scanTone = h => (h > 0.7 ? 0.7 + 0.5 * (h - 0.7) : h);

/** The scan colour of a heat (0..1, clamped): [r, g, b]. The shaders use the same stops (scanRampGlsl). Pure. */
export function scanRamp(h, out = [0, 0, 0]) {
  const x = Math.min(1, Math.max(0, Number.isFinite(h) ? h : 0)), S = SCAN_STOPS;
  for (let i = 1; i < S.length; i++) {
    if (x <= S[i][0] || i === S.length - 1) {
      const a = S[i - 1], b = S[i], t = Math.min(1, Math.max(0, (x - a[0]) / (b[0] - a[0])));
      out[0] = a[1] + (b[1] - a[1]) * t; out[1] = a[2] + (b[2] - a[2]) * t; out[2] = a[3] + (b[3] - a[3]) * t;
      return out;
    }
  }
  return out;
}

/** How strongly the scan is laid over the picture at a heat (0..1): a faint veil of colour at rest, never more than
 * 0.74 (the brain's shape stays readable under the hottest core; 0.85 at first). Pure. */
export const scanAmount = h => 0.24 + 0.5 * sm(0.08, 1, Number.isFinite(h) ? h : 0);

/** The GLSL of the colour scale and the amount (the same numbers). */
export function scanRampGlsl() {
  const S = SCAN_STOPS, f = v => { const s = String(Math.round(v * 1e6) / 1e6); return /[.e]/.test(s) ? s : `${s}.0`; };
  let body = `vec3 nsScanRamp( float h ) {\n\tfloat x = clamp( h, 0.0, 1.0 );\n\tvec3 c = vec3( ${f(S[0][1])}, ${f(S[0][2])}, ${f(S[0][3])} );\n`;
  for (let i = 1; i < S.length; i++) body += `\tc = mix( c, vec3( ${f(S[i][1])}, ${f(S[i][2])}, ${f(S[i][3])} ), clamp( ( x - ${f(S[i - 1][0])} ) / ${f(S[i][0] - S[i - 1][0])}, 0.0, 1.0 ) );\n`;
  body += '\treturn c;\n}\nfloat nsScanAmount( float h ) { return 0.24 + 0.5 * smoothstep( 0.08, 1.0, h ); }\nfloat nsScanTone( float h ) { return h > 0.7 ? 0.7 + 0.5 * ( h - 0.7 ) : h; }\n';
  return body;
}

/** A storm's light at tau seconds after it starts, fading over fadeS: rises once over riseS, falls once (0..1). */
export function stormEnvelope(tau, fadeS, o = EMAP_STORM) {
  if (!(tau > 0)) return 0;
  return sm(0, o.riseS, tau) * (1 - sm(o.riseS, o.riseS + fadeS, tau));
}

/** One resting source's place and strength at time t (out: [x, y, z, strength]). Pure. */
export function baseSourceAt(src, t, o = EMAP_STORM, out = [0, 0, 0, 0]) {
  const B = o.base, k = 2 * Math.PI;
  out[0] = src.p[0] + B.driftMm * Math.sin(k * t / src.dx + src.ph[0]);
  out[1] = src.p[1] + B.driftMm * Math.sin(k * t / src.dy + src.ph[1]);
  out[2] = src.p[2] + B.driftMm * 0.7 * Math.sin(k * t / src.dz + src.ph[2]);
  out[3] = B.gain * (0.5 - 0.5 * Math.cos(k * t / src.period + src.ph[3]));
  return out;
}

const rnd = S => { S.rng = (Math.imul(S.rng, 1664525) + 1013904223) >>> 0; return S.rng / 4294967296; };
const between = (S, ab) => ab[0] + (ab[1] - ab[0]) * rnd(S);

/**
 * The storm state for a model's scan regions. regions: [{ id, centre: [x, y, z], pts: Float32Array (surface points,
 * xyz), side }]; links: [{ a, b, lenMm }] (region indices, the fibres' mean length); basePts: Float32Array of surface
 * points to place the resting sources on (or the regions' points). Pure (draws with its own seeded generator).
 */
export function createStorms({ regions = [], links = [], basePts = null, seed = 20261122, o = EMAP_STORM } = {}) {
  const K = o.slots, nB = o.base.n, nA = o.act.n;
  const S = {
    kind: 'ns-emap-storms', o, regions, links, rng: seed >>> 0,
    near: regions.map(() => []),
    slots: [], nextAt: 0.6, nextMinorAt: 0.3, started: 0, minorStarted: 0, hopsStarted: 0, cordVolleys: 0, now: 0, reduced: false, eye: null,
    base: new Float32Array(4 * nB), baseSrc: [],
    storm0: new Float32Array(4 * K), storm1: new Float32Array(4 * K), storm2: new Float32Array(4 * K),
    act: new Float32Array(4 * nA), nAct: 0, nOn: 0, tmp4: [0, 0, 0, 0]
  };
  for (const l of links) { if (S.near[l.a] && S.near[l.b]) { S.near[l.a].push({ to: l.b, mm: l.lenMm }); S.near[l.b].push({ to: l.a, mm: l.lenMm }); } }
  for (let i = 0; i < K; i++) S.slots.push({ on: false, region: -1, c: [0, 0, 0], t0: 0, s: 0, fadeS: 1, hop: 0, send: false, cord: false });
  // the resting sources: spread over the surface points (every n-th), each with its own slow periods and phases
  const P = basePts && basePts.length >= 3 ? basePts : (() => { const a = []; for (const r of regions) if (r.pts) for (let i = 0; i < r.pts.length; i++) a.push(r.pts[i]); return Float32Array.from(a); })();
  const nP = Math.floor(P.length / 3);
  for (let i = 0; i < nB; i++) {
    const j = nP ? Math.floor(((i + 0.5) / nB) * nP + rnd(S) * (nP / nB) * 0.5) % nP : 0;
    S.baseSrc.push({ p: nP ? [P[3 * j], P[3 * j + 1], P[3 * j + 2]] : [0, 0, 0], dx: between(S, o.base.driftS), dy: between(S, o.base.driftS), dz: between(S, o.base.driftS), period: between(S, o.base.periodS),
      ph: [rnd(S) * 6.283, rnd(S) * 6.283, rnd(S) * 6.283, rnd(S) * 6.283] });
  }
  for (let i = 0; i < K; i++) S.storm1[4 * i + 2] = -1;
  return S;
}

/** The storms' own clocks set back to the start (the map's clock starts at 0 again when the map is switched on): no storm
 * alive, the next storm at 0.6 s and the next small flare at 0.3 s. Pure. */
export function restartStorms(S) {
  for (const q of S.slots) q.on = false;
  S.nextAt = 0.6; S.nextMinorAt = 0.3; S.now = 0;
  return S;
}

/** A free storm slot (or the weakest one that has nearly calmed), or null. */
function takeSlot(S, now, s) {
  let best = null, low = Infinity;
  for (const q of S.slots) {
    if (!q.on) return q;
    const left = q.s * stormEnvelope(now - q.t0, q.fadeS, S.o);
    if (now - q.t0 > S.o.riseS && left < low) { low = left; best = q; }
  }
  return best && low < 0.25 * s ? best : null;
}

/** Start a storm on region `region` (index; -1 for none: then it only flares at c) at time t0 with strength s; hop: 0
 * for a storm of its own, 1 or 2 for one a front has carried there. send: its links fire; cord: a volley down the cord.
 * Its hops are scheduled at once, each with the time its front arrives. Returns the slot or null. Pure. */
export function stormAt(S, t0, region, c, s, { hop = 0, send = true, cord = false, fadeS = null, minor = false } = {}) {
  const o = S.o;
  const q = takeSlot(S, t0, s);
  if (!q) return null;
  q.on = true; q.region = region; q.c[0] = c[0]; q.c[1] = c[1]; q.c[2] = c[2]; q.t0 = t0; q.s = s; q.hop = hop;
  q.fadeS = Number.isFinite(fadeS) ? fadeS : between(S, o.fadeS); q.send = send && region >= 0 && hop < o.hops; q.cord = cord;
  if (minor) S.minorStarted++; else if (hop === 0) S.started++; else S.hopsStarted++;
  if (cord) S.cordVolleys++;
  if (q.send) {
    const near = S.near[region] || [], n = Math.min(o.hopFan, near.length);
    // the links fired: n of them, drawn without repeats
    let picked = 0;
    for (let k = 0; k < near.length && picked < n; k++) {
      const left = near.length - k, need = n - picked;
      if (rnd(S) * left >= need) continue;
      picked++;
      const e = near[k];
      if (!S.regions[e.to]) continue;
      const at = pointOf(S, e.to);
      stormAt(S, t0 + o.riseS * 0.5 + e.mm / o.fibreMmS, e.to, at, s * o.hopGain[hop + 1] / o.hopGain[hop], { hop: hop + 1, send: true, cord: false });
    }
  }
  return q;
}

/** How far a point is from the eye, a point near the midline counting as farther (EMAP_STORM.medialMm). */
const eyeScore = (S, x, y, z) => Math.hypot(x - S.eye[0], y - S.eye[1], z - S.eye[2]) + 2 * Math.max(0, S.o.medialMm - Math.abs(x));
/** A region's surface point: the one nearest the eye (S.eye, brain millimetres) of pointsOf drawn at random, or a
 * random one when the eye is not known; the centre when the region has no points. */
function pointOf(S, region) {
  const R = S.regions[region];
  if (!R) return [0, 0, 0];
  const pts = R.pts, n = pts ? Math.floor(pts.length / 3) : 0;
  if (!n) return R.centre;
  // (a point nearer the midline than medialMm is not taken while there is another; with the eye known, the nearest)
  let best = -1, bd = Infinity, any = Math.floor(rnd(S) * n);
  for (let k = 0; k < S.o.pointsOf; k++) {
    const m = Math.floor(rnd(S) * n);
    if (Math.abs(pts[3 * m]) < S.o.medialMm) continue;
    const d = S.eye ? eyeScore(S, pts[3 * m], pts[3 * m + 1], pts[3 * m + 2]) : k;
    if (d < bd) { bd = d; best = m; }
  }
  if (best < 0) for (let m = 0; m < n; m++) if (Math.abs(pts[3 * m]) >= S.o.medialMm) { best = m; break; }
  if (best < 0) best = any;
  return [pts[3 * best], pts[3 * best + 1], pts[3 * best + 2]];
}
/** A region for a new storm: the nearest to the eye of pickOf drawn at random (any when the eye is not known). */
function pickRegion(S) {
  const nR = S.regions.length;
  let best = Math.floor(rnd(S) * nR);
  if (!S.eye) return best;
  let bd = Infinity;
  for (let k = 0; k < S.o.pickOf; k++) {
    const r = Math.floor(rnd(S) * nR), R = S.regions[r], pts = R.pts, n = pts ? Math.floor(pts.length / 3) : 0;
    let d = eyeScore(S, R.centre[0], R.centre[1], R.centre[2]);
    for (let m = 0; m < n; m += 3) d = Math.min(d, eyeScore(S, pts[3 * m], pts[3 * m + 1], pts[3 * m + 2]));
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

/**
 * One frame of the storms at time `now` (seconds on the map's clock). lookRegion: the region index the look rests on
 * (or -1). reduced: no storms at all and the resting sources stand still (a steady scan). eye: the eye's place in
 * the brain's millimetres (or null): storms start on the side the player sees. Writes base, storm0..2 (the
 * shaders' arrays) in place; no allocation once running. Pure.
 *   base[i]   = x, y, z, strength                                  (resting source i)
 *   storm0[k] = x, y, z, core light (strength times the envelope)  (storm k)
 *   storm1[k] = wave radius, wave light, region, the fibre front's distance from that region (mm; -1: not sending)
 *   storm2[k] = the fibres' light, the cord front (the route's time coordinate a; -9: none), the cord light, hop
 */
export function stepStorms(S, now, { lookRegion = -1, reduced = false, eye = null } = {}) {
  const o = S.o, K = o.slots;
  S.now = now; S.reduced = reduced === true; S.eye = eye;
  const t = S.reduced ? 0 : now;
  const tmp = S.tmp4;
  for (let i = 0; i < S.baseSrc.length; i++) { baseSourceAt(S.baseSrc[i], t, o, tmp); S.base[4 * i] = tmp[0]; S.base[4 * i + 1] = tmp[1]; S.base[4 * i + 2] = tmp[2]; S.base[4 * i + 3] = S.reduced ? o.base.gain * 0.5 : tmp[3]; }
  if (S.reduced) { for (const q of S.slots) q.on = false; S.nextAt = now + o.everyS[0]; S.nextMinorAt = now + (o.minor ? o.minor.everyS[0] : 0); }
  else if (now >= S.nextAt && S.regions.length) {
    S.nextAt = now + between(S, o.everyS);
    const region = lookRegion >= 0 && lookRegion < S.regions.length && rnd(S) < o.lookShare ? lookRegion : pickRegion(S);
    stormAt(S, now, region, pointOf(S, region), between(S, o.strength), { cord: rnd(S) < o.cordShare });
  }
  if (!S.reduced && o.minor && now >= S.nextMinorAt && S.regions.length) {
    S.nextMinorAt = now + between(S, o.minor.everyS);
    const region = pickRegion(S);
    stormAt(S, now, region, pointOf(S, region), between(S, o.minor.strength), { send: false, cord: false, fadeS: between(S, o.minor.fadeS), minor: true });
  }
  // the live storms are written first and counted (nOn): the shaders stop at that count (22 November 2026: a frame
  // with the map on took 77 ms; the scan's sum over every slot for every pixel was part of it)
  let n = 0;
  for (let k = 0; k < K; k++) {
    const q = S.slots[k];
    const tau = now - q.t0;
    if (q.on && tau > o.riseS + q.fadeS + 0.05) q.on = false;
    if (!q.on) continue;
    const b = 4 * n++;
    const env = q.on ? stormEnvelope(tau, q.fadeS, o) : 0;
    S.storm0[b] = q.c[0]; S.storm0[b + 1] = q.c[1]; S.storm0[b + 2] = q.c[2]; S.storm0[b + 3] = q.s * env;
    const R = Math.min(o.waveMaxMm, Math.max(0, tau) * o.waveMmS);
    S.storm1[b] = R; S.storm1[b + 1] = q.s * env * o.waveGain * (1 - R / o.waveMaxMm); S.storm1[b + 2] = q.on ? q.region : -1;
    S.storm1[b + 3] = q.on && q.send && tau > 0 ? tau * o.fibreMmS : -1;
    S.storm2[b] = q.send ? q.s * env : 0;
    const ct = tau - o.cordDelayS;
    S.storm2[b + 1] = q.on && q.cord && ct > 0 ? -0.011 + ct * o.cordRate : -9; S.storm2[b + 2] = q.on && q.cord ? q.s * (1 - sm(0, q.fadeS, ct)) : 0; S.storm2[b + 3] = q.hop;
  }
  for (let k = n; k < K; k++) { const b = 4 * k; S.storm0[b + 3] = 0; S.storm1[b] = 0; S.storm1[b + 1] = 0; S.storm1[b + 2] = -1; S.storm1[b + 3] = -1; S.storm2[b] = 0; S.storm2[b + 1] = -9; S.storm2[b + 2] = 0; }
  S.nOn = n;
  return S;
}

/** One activation source into the array at k (when there is room and it is lit); returns the next k. */
function putAct(A, n, k, p, level) {
  if (k >= n || !p || !(level > 0.01)) return k;
  A[4 * k] = p[0]; A[4 * k + 1] = p[1]; A[4 * k + 2] = p[2]; A[4 * k + 3] = level;
  return k + 1;
}

/** The activations' sources from the map's state (ns-emap: the lit areas' slots): each lit area's own place at its
 * level, its linked regions at `link` of it, the feeling strip behind it once the report is back. No allocation. */
export function stormActs(S, model, st, now) {
  const o = S.o, A = S.act, n = o.act.n;
  let k = 0;
  const nArea = model.o.slots - model.o.sparkSlots;
  for (let i = 0; i < nArea && k < n; i++) {
    const s = st.slots[i];
    if (s.mode !== 1 || s.area < 0 || !(s.level > 0.01)) continue;
    const rec = model.areas[s.area];
    k = putAct(A, n, k, rec.centre, s.level * o.act.level);
    const back = s.arrivalS > 0 ? (now - s.t0) - s.arrivalS * (1 + 1 / model.kUp) * 0.6 : -1;
    if (rec.sens && back > 0) k = putAct(A, n, k, rec.sens, s.level * o.act.sens * sm(0, 0.4, back));
    const ends = rec.linkEnds || [];
    for (let j = 0; j < ends.length && k < n; j++) k = putAct(A, n, k, ends[j], s.level * o.act.link * sm(0.1, 0.6, now - s.t0));
  }
  for (let j = k; j < n; j++) A[4 * j + 3] = 0;
  S.nAct = k;
  return k;
}

/** The scan's heat at a brain point p at the current frame (the scan shader, in JS: the same sum of the same arrays).
 * Pure; for tests. */
export function scanHeatAt(S, p) {
  const o = S.o;
  let h = o.floor;
  const g = (d, r) => Math.exp(-(d * d) / (r * r));
  const d3 = (A, i) => Math.hypot(p[0] - A[i], p[1] - A[i + 1], p[2] - A[i + 2]);
  for (let i = 0; i < o.base.n; i++) h += S.base[4 * i + 3] * g(d3(S.base, 4 * i), o.base.radiusMm);
  for (let k = 0; k < o.slots; k++) {
    const d = d3(S.storm0, 4 * k);
    h += S.storm0[4 * k + 3] * g(d, o.coreMm) + S.storm1[4 * k + 1] * g(d - S.storm1[4 * k], o.waveWMm);
  }
  h = o.floor + (h - o.floor) * sm(o.midFadeMm[0], o.midFadeMm[1], Math.abs(p[0]));
  // (the activation after the fade: an area near the midline keeps its own heat)
  for (let j = 0; j < o.act.n; j++) h += S.act[4 * j + 3] * g(d3(S.act, 4 * j), o.act.radiusMm);
  return h;
}

/** The light of a point of a storm fibre (mm from its end A, of length len, joining regions a and b): the fronts of the
 * storms that send from either end (the shader's rule, in JS). Pure; for tests. */
export function fibreLightAt(S, a, b, mmFromA, len) {
  const o = S.o;
  let L = 0;
  for (let k = 0; k < o.slots; k++) {
    const r = S.storm1[4 * k + 2], front = S.storm1[4 * k + 3], amp = S.storm2[4 * k];
    if (!(front >= 0) || !(amp > 0) || (r !== a && r !== b)) continue;
    const x = r === a ? mmFromA : len - mmFromA;
    if (x > front + 3 * o.fibreHeadMm) continue;
    const head = Math.exp(-(((x - front) / o.fibreHeadMm) ** 2));
    L += amp * (x <= front ? 0.45 + 0.55 * head : head);
  }
  return L;
}

/** The pulse light of the traffic on a wire at mm along it at time t (hz pulses a second pass any point, spacing mm
 * apart, phase 0..1, dir +1 outward or -1): the shader's bead, in JS. Pure; for tests. */
export function trafficAt(mm, t, { hz, spacing, phase = 0, dir = 1 }) {
  const p = (((mm / spacing - dir * t * hz + phase) % 1) + 1) % 1;
  return Math.exp(-p * 4.5) + Math.exp(-(1 - p) * 28);
}

/** A wire's traffic: its rate and spacing from its kind and a number of its own (the shader's rule, in JS). */
export function trafficOf(wireId, cls, o = EMAP_STORM) {
  const h = Math.abs(Math.sin(wireId * 12.9898 + 0.5) * 43758.5453) % 1;
  return { hz: o.traffic.hz[0] + (o.traffic.hz[1] - o.traffic.hz[0]) * h, spacing: o.traffic.spacingMm[cls] || o.traffic.spacingMm.brain, phase: (h * 7.31) % 1, dir: h < 0.5 ? 1 : -1 };
}

/** How many times a curve (samples at a fixed rate) brightens and darkens within any one second, at most: the number
 * of its peaks (a rise and then a fall, each more than `minStep` of the curve's range) in the busiest one-second
 * window. The owner's rule is about three. Pure; for tests. */
export function peaksPerSecond(samples, rateHz, minStep = 0.06) {
  let lo = Infinity, hi = -Infinity;
  for (const v of samples) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const range = hi - lo;
  if (!(range > 1e-9)) return 0;
  const thr = minStep * range, peaks = [];
  let dir = 0, ext = samples[0], extAt = 0;
  for (let i = 1; i < samples.length; i++) {
    const v = samples[i];
    if (dir >= 0) { if (v > ext) { ext = v; extAt = i; } else if (ext - v > thr) { if (dir > 0) peaks.push(extAt); dir = -1; ext = v; extAt = i; } }
    if (dir < 0) { if (v < ext) { ext = v; extAt = i; } else if (v - ext > thr) { dir = 1; ext = v; extAt = i; } }
    if (dir === 0 && v - samples[0] > thr) dir = 1;
  }
  let best = 0;
  for (let i = 0, j = 0; i < peaks.length; i++) { while (peaks[i] - peaks[j] >= rateHz) j++; best = Math.max(best, i - j + 1); }
  return best;
}
