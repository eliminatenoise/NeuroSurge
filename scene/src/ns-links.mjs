/** NeuroSurge: the LINKS between a motor area and the body part it moves (18 November 2026, package MAP).
 *
 * Owner, 18 November: "redo the entire corresponding color coding of the motor strip and its corresponding areas ...
 * And the wiring or clarity or indications in between the items, such that things are as easy to understand and as
 * obvious as possible." The links are the wiring. A link is a fine luminous line in the area's colour, drawn by the
 * scene (ns-scene-three updateGlow / emitRibbon) from the area's key on the strip to the muscles it drives:
 *  - LOOK (hover): while the look rests on an area, a soft link to the part it moves on the mirror body and, where it is
 *    in the picture, on your own body; those muscles take a thin rim of the area's colour (calm, no flash). Nothing is
 *    switched on by looking.
 *  - ON: a switched-on area's link is bright, blinks with the area and its muscles (ns-colors BLINK), and a pulse runs
 *    along it from the strip to the part at the moment it switches on, then again now and then while it stays on.
 *  - REVERSE: with the crosshair on a muscle of your body or of the mirror body, the area that moves it shows: its key
 *    gets the soft hint band, and a soft link runs from that key to the muscle ("what controls this?").
 *  - CROSSING: each half of the brain mainly moves the opposite side of the body. Where a link crosses the brain's
 *    midline it carries a small bright knot (crossKnot). 19 November 2026: the brain is now drawn turned half a turn
 *    (ns-brain BRAIN_VIEW.spinDeg 180: its right half on the LEFT of the picture, over your left side), so an area
 *    and the limb it moves are on the SAME side of the picture and a link to them no longer crosses the midline: the
 *    rule is unchanged (it is measured in the brain's own frame) and simply finds no crossing. The crossing itself is
 *    the same as ever (the brain's right half still moves your left side) and is now said in words: the area's card
 *    ("This spot in your brain's right half tells your left ...") and the Esc page (ns-text, "The glass brain").
 * Calm at rest: no line is drawn unless an area is looked at, switched on, or named from a muscle. A picture of the
 * game's simulated, unitless signal; not a nerve, a recording or a measured pathway.
 *
 * Pure, dependency-free ES module (browser and Node); no DOM.
 */

const freeze = Object.freeze;

/** Link look (display choices):
 *  - hoverLevel: the level a looked-at area's link carries (it sets the soft rim of its muscles: a calm hint, never the
 *    flash); hoverAlpha: the share of a lit link's light a looked-at link shows;
 *  - ownAlpha: links to your own body are a little fainter than those to the mirror body (they are long, from the strip
 *    down past your legs);
 *  - onsetS: the pulse of a switch-on runs from the strip to the part in this time (then GLOW_LINK.pulseS repeats);
 *  - crossKnot: the knot where a link crosses the brain's midline: its half-length along the link (curve share), the extra
 *    width (x the halo) and light (x the core) at its middle. */
export const LINKS = freeze({
  hoverLevel: 0.6, hoverAlpha: 0.9, ownAlpha: 0.75, onsetS: 0.32,
  crossKnot: freeze({ halfShare: 0.035, width: 0.9, light: 1.6 })
});

const str = v => (typeof v === 'string' ? v : '');

/** The action of a body-map region a look at it means: the marked one (`actionId`, the gaze's), else the region's first
 * action that names muscles; null for an area with no actions (the grey in-between areas). Pure. */
export function lookAction(region, actionId = null) {
  const acts = region && Array.isArray(region.actions) ? region.actions : [];
  if (!acts.length) return null;
  const id = str(actionId);
  const hit = id ? acts.find(a => a && (a.id === id || a.armActionId === id)) : null;
  if (hit) return hit;
  return acts.find(a => a && Array.isArray(a.agonists) && a.agonists.length) || acts[0] || null;
}

/** The soft link of a LOOKED-AT area (pure), as one entry of ns-actions glowLinks' shape for the scene's adapter
 * (glowLinksForScene): { key, regionId, isLeftArm, actionId, level, muscles, catalog, meshNames, hint: true, hover: true },
 * or null (no region, no action, or the area is lit already: its own link is drawn). */
export function hoverLink(region, { actionId = null, lit = false, level = LINKS.hoverLevel } = {}) {
  if (!region || typeof region.id !== 'string' || lit) return null;
  const a = lookAction(region, actionId);
  if (!a) return null;
  const muscles = Array.isArray(a.agonists) ? a.agonists.filter(m => typeof m === 'string' && m) : [];
  if (!muscles.length && !a.armActionId) return null;
  return { key: `hover:${region.id}`, regionId: region.id, isLeftArm: region.isLeftArm === true, actionId: a.armActionId || a.id,
    level, muscles, catalog: [], meshNames: [], hint: true, hover: true };
}

/** The REVERSE link (pure): the muscle under the crosshair (pick { id, name, kind, source, part? }) and the area that
 * moves it (route { regionId, actionId } from the app's muscle tap rule) -> one setGlowLinks entry that names only
 * that muscle: { key, regionId, level, hint: true, hover: true, reverse: true, bodyMeshIds | armMuscleNames }, or null. */
export function reverseLink(pick, route, { level = LINKS.hoverLevel } = {}) {
  if (!pick || pick.kind !== 'muscle' || !route || typeof route.regionId !== 'string') return null;
  const base = { key: `reverse:${route.regionId}`, regionId: route.regionId, level, hint: true, hover: true, reverse: true };
  if (pick.part === 'arm') {
    const n = str(pick.name).toLowerCase();
    return n ? { ...base, armMuscleKeys: [], armMuscleNames: [n] } : null;
  }
  return typeof pick.id === 'string' && pick.id ? { ...base, bodyMeshIds: { [pick.id]: 1 } } : null;
}

/** Pulse phase (0..1 along the link from the strip to the part; NaN = no pulse) of a link `ageS` seconds after its area
 * switched on: one run in onsetS at the switch-on, then one every pulseS. A looked-at link (hover) and reduced motion
 * have no pulse. Pure. */
export function linkPulsePhase(ageS, { hover = false, reduced = false, pulseS = 1.1, onsetS = LINKS.onsetS } = {}) {
  if (hover || reduced || !Number.isFinite(ageS) || ageS < 0) return NaN;
  if (ageS < onsetS) return ageS / onsetS;
  return ((ageS - onsetS) / Math.max(1e-3, pulseS)) % 1;
}

/** Where a sampled link crosses the brain's midline (pure): signed distances `side` (one per curve sample, e.g. the
 * brain-local x minus the midline x) -> the curve share s (0..1) of the first sign change, linearly interpolated, or -1
 * when the link stays on one side. */
export function midlineCrossing(side, n = side ? side.length : 0) {
  if (!side || n < 2) return -1;
  for (let i = 0; i + 1 < n; i++) {
    const a = side[i], b = side[i + 1];
    if (!(Number.isFinite(a) && Number.isFinite(b))) continue;
    if (a === 0) return i / (n - 1);
    if ((a < 0) !== (b < 0) && b !== a) return (i + a / (a - b)) / (n - 1);
  }
  return -1;
}

/** The knot's weight (0..1) at curve share s for a crossing at sc (crossKnot.halfShare wide, smooth). 0 when sc < 0. */
export function crossKnotWeight(s, sc, k = LINKS.crossKnot) {
  if (!(sc >= 0)) return 0;
  const d = Math.abs(s - sc) / Math.max(1e-6, k.halfShare);
  return d >= 1 ? 0 : (1 - d * d) * (1 - d * d);
}

/* ---- The light beam (19 November 2026) ---------------------------------------------------------------------------- */

/** The owner, 19 November 2026: "Instead of making the corresponding connection a curved light beam, let's make it a
 * direct sort of conical light stream beam, almost angelic in nature, and like the light beam of the Isaac Newton glass
 * triangle prism from one to many light beam, but I guess the corresponding color. So sort of like a prism conical light
 * beam between the muscle area and the brain area, and make it direct and make it match the relevant surface area of
 * both brain and muscle. So that's the shape of the cone"; "like a sort of halo ... in any UFO movie where there's a
 * massive light beam"; "Ensure it's precise to its correlates."
 *
 * So a link is no longer one thin line on a curve to the middle of a muscle group. From the part of the motor area that
 * does the movement (its KEY on the strip) one straight cone of light goes to EACH muscle the movement drives (one to
 * many, as the colours leave a prism), in the area's colour with a white middle. Each cone is as wide at the brain as
 * the key is, seen from where you look, and as wide at the body as that muscle is; the light lies over the key and
 * over the muscle themselves at capLevel of its strength. A picture of the game's simulated, unitless signal: not a
 * nerve, a recording or a measured pathway.
 *
 *  - segments / across: the samples along a beam and across it (across: shares of its half width);
 *  - maxBeams: the most beams one body's buffer holds; maxPerArea: the most muscles one area's movement sends a beam
 *    to on one body (the heaviest drives first);
 *  - alpha: the peak additive light of the cone's body; coreAlpha / coreWidth: the brighter middle line; rimAlpha: the
 *    faint brighter edge of a cone of light seen from the side; white: how white the middle is (the edge keeps the
 *    area's colour);
 *  - capLevel: the share of the light that lies over the key and over the muscle;
 *  - veil: light alone cannot be seen on the pale brain, so the beam also covers what is behind it by this share of
 *    its own light (0 = pure added light): on the brain it reads as a tint of the area's colour, on black as light;
 *  - rays: fine streaks along the beam that drift slowly sideways ([waves across, drift in turns a second, phase],
 *    summed, amp of the light); none under reduced motion;
 *  - pulseAmp / pulseWidth: the brighter band that runs from the brain to the muscle (the scene's pulse clock), and,
 *    with pulseBoth, a second one that runs back from the muscle to the brain at the same time;
 *  - minHalfM: the least half width of an end (a key or a muscle seen edge-on is still a line of light);
 *  - tight: the beam's half width as a share of the key's and the muscle's own (the owner: "the beam should be focused
 *    and not touch any irrelevant areas"): the light, which fades to nothing at the beam's edge, stays inside both;
 *  - overBrain: the share drawn where a beam crosses the brain's picture, so it never hides the strip;
 *  - hoverAlpha / ownAlpha: a looked-at (not switched-on) area's beams, and beams to your own body, are fainter;
 *  - manyPower: n beams of one movement each carry n^-manyPower of the light where they leave the key together, so
 *    a movement of many muscles does not burn the strip white; each comes up to manyRise times that share (at most
 *    its full light) between manyFrom and manyTo of the way to its muscle: beams to muscles that lie side by side
 *    never part, and at full light each they hid the limb they were pointing at. */
export const LIGHT_BEAM = freeze({
  on: true, segments: 16,
  across: freeze([-1, -0.94, -0.84, -0.7, -0.54, -0.38, -0.22, -0.09, 0, 0.09, 0.22, 0.38, 0.54, 0.7, 0.84, 0.94, 1]),
  maxBeams: 48, maxPerArea: 10,
  // (the owner, on seeing it: "way too bright at the moment, and there should be some transparency involved so that
  // you can still see which muscle is being activated and which brain part is being activated": about half the light
  // of the first build, a thinner veil, and little of it over the key and the muscle themselves)
  // (20 November 2026, evening, the owner, Message 198: "let's have the corresponding pulses be a lot thinner and a lot
  // less opaque. As right now they're obstructing the view": about 40 % of the light and a third of the veil, and the
  // cone narrower: tight 0.85 -> 0.4 of the key's and the muscle's width, and never more than maxHalfM across at
  // either end (a wide area's beam was half a metre and more wide at its key))
  alpha: 0.05, coreAlpha: 0.04, coreWidth: 0.12, rimAlpha: 0.015, white: 0.3, capLevel: 0.12, veil: 0.1, maxHalfM: 0.05,
  rays: freeze({ amp: 0.2, lanes: freeze([freeze([2.6, 0.07, 0.3]), freeze([4.3, -0.05, 2.1]), freeze([1.4, 0.03, 4.4])]) }),
  pulseAmp: 0.42, pulseWidth: 0.09, pulseBoth: true, minHalfM: 0.002, tight: 0.4, overBrain: 0.7, hoverAlpha: 0.75, ownAlpha: 0.8, manyPower: 0.8, manyFrom: 0.1, manyTo: 0.7, manyRise: 2,
  // 20 November 2026 (browser hunt: with the brain carried behind you, Space drew the hand area's beam from the corner
  // of the picture, a quarter of the screen wide): a beam is drawn only while the middle of its key on the strip is in
  // front of the eye and within keyInView of the picture's half size from its middle (1 = the picture's edge). A
  // display choice: a beam must be seen to start at its area.
  keyInView: 1.15,
  // 22 November 2026 (LOOK2; hunt of update 64 H23: "Light beams to your own hands cross the face blocks as wide,
  // bright bands"; Message 198, "a lot thinner and a lot less opaque ... they're obstructing the view"):
  //  - maxHalfPx 4: the half width is also held to this many CSS pixels on the screen at every point along the beam
  //    (beamHalfCapM). maxHalfM caps metres, which is thin at the key 6.7 m away (about 6.6 px a side) but not near the
  //    eye: a cone to your own left hand crossed the face blocks 1.8 to 2.4 m away at 13 to 20 px across, and 16 to 36
  //    px at the hand. Now at most 8 px across anywhere (a mirror beam at its key: 6.6 -> 4 px a side).
  //  - ownPerLink 1: a beam to YOUR OWN body goes to the one muscle the movement drives most, not to each of them (up to
  //    maxPerArea): Left hand drew five cones about 12 px apart to your forearm, a band about 30 px wide with about 2.8
  //    times one cone's light where they overlapped. The mirror body keeps a cone per muscle (it is far, the cones are
  //    thin there). 0 = no limit, as before.
  maxHalfPx: 4, ownPerLink: 1
});

/** LIGHT_BEAM.maxHalfPx: a beam's half width hwM (metres) at a point depthM in front of the eye (along the view),
 * held to maxHalfPx CSS pixels on the screen; mPerPx1: metres per CSS pixel at 1 m in front of the eye (2 tan(fovY / 2)
 * / the view's CSS height). Not a number or no limit: hwM as it is. Pure. */
export function beamHalfCapM(hwM, depthM, mPerPx1, maxHalfPx = LIGHT_BEAM.maxHalfPx) {
  if (!(maxHalfPx > 0) || !(depthM > 0) || !(mPerPx1 > 0)) return hwM;
  const cap = maxHalfPx * depthM * mPerPx1;
  return hwM < cap ? hwM : cap;
}

/** LIGHT_BEAM.keyInView: whether a beam's key, at normalised picture place (x, y) (-1..1 across and up; behind: the
 * point is behind the eye), is in the picture enough to draw the beam. Pure. */
export function beamKeySeen(x, y, behind, o = LIGHT_BEAM) {
  if (behind || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const k = Number.isFinite(o.keyInView) ? o.keyInView : Infinity;
  return Math.abs(x) <= k && Math.abs(y) <= k;
}

const sstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** The light across a beam at share r of its half width (-1..1) and time tS (seconds; NaN = no drifting rays):
 * { light (0 at the edge, peak about alpha + coreAlpha in the middle), white (0..1: how white there) }. The body is
 * the chord of a round cone seen from the side, softened; the rim is its faint bright edge. Pure. */
export function beamAcross(r, tS = NaN, o = LIGHT_BEAM) {
  const x = Math.abs(r);
  if (!(x < 1)) return { light: 0, white: 0 };
  const chord = Math.pow(1 - x * x, 1.2);
  const core = Math.exp(-(x * x) / (2 * o.coreWidth * o.coreWidth));
  const rim = sstep(0.7, 0.9, x) * (1 - sstep(0.9, 1, x));
  let rays = 1;
  if (Number.isFinite(tS) && o.rays && o.rays.amp > 0) {
    let s = 0;
    for (const L of o.rays.lanes) s += Math.sin(2 * Math.PI * (L[0] * r + L[1] * tS) + L[2]);
    rays = 1 + o.rays.amp * s / Math.max(1, o.rays.lanes.length);
  }
  return { light: (o.alpha * chord + o.rimAlpha * rim) * rays + o.coreAlpha * core * chord, white: o.white * chord * chord };
}

/** The light along a beam at share s of its whole length (0 = the middle of the key, 1 = the far edge of the muscle),
 * with the key ending at sA and the muscle beginning at sB: it rises from nothing over the key to capLevel, runs at
 * full strength between the two, and falls over the muscle from capLevel to nothing. phase (0..1, or NaN): where the
 * running band is, as a share of the way from sA to sB. Pure. */
export function beamAlong(s, sA, sB, phase = NaN, o = LIGHT_BEAM) {
  if (!(s > 0 && s < 1)) return 0;
  const a = Math.min(Math.max(sA, 1e-4), 0.45), b = Math.max(Math.min(sB, 1 - 1e-4), 0.55);
  let v;
  if (s <= a) v = o.capLevel * sstep(0, a, s);
  else if (s >= b) v = o.capLevel * (1 - sstep(b, 1, s));
  else { const e = Math.min(0.08, (b - a) / 4); v = o.capLevel + (1 - o.capLevel) * sstep(a, a + e, s) * (1 - sstep(b - e, b, s)); }
  if (Number.isFinite(phase)) {
    // (the owner: "an Iron Man pulse going both ways": one band runs from the brain to the muscle and one comes back)
    const u = (s - a) / Math.max(1e-6, b - a), d = u - phase, d2 = u - (1 - phase), w2 = 2 * o.pulseWidth * o.pulseWidth;
    v *= 1 - o.pulseAmp + 2 * o.pulseAmp * Math.max(Math.exp(-(d * d) / w2), o.pulseBoth === false ? 0 : Math.exp(-(d2 * d2) / w2));
  }
  return v;
}

/** The beam's half width at share s: the key's (hwA) while over the key, the muscle's (hwB) while over the muscle, and
 * a straight run from one to the other between them: the cone. Pure. */
export function beamHalfWidth(s, sA, sB, hwA, hwB) {
  if (s <= sA) return hwA;
  if (s >= sB) return hwB;
  return hwA + (hwB - hwA) * ((s - sA) / Math.max(1e-9, sB - sA));
}

/** How far a cloud of points (flat [x, y, z, ...], n points) reaches from `centre` along the unit `axis`:
 * { lo, hi } (the least and greatest of (p - centre) . axis; 0, 0 for no points). Pure; the width of a key or a muscle
 * across a beam is max(-lo, hi) along the beam's sideways axis. */
export function extentAlong(pts, n, centre, axis, out = { lo: 0, hi: 0 }) {
  let lo = 0, hi = 0;
  for (let i = 0; i < n; i++) {
    const d = (pts[3 * i] - centre[0]) * axis[0] + (pts[3 * i + 1] - centre[1]) * axis[1] + (pts[3 * i + 2] - centre[2]) * axis[2];
    if (d < lo) lo = d; else if (d > hi) hi = d;
  }
  out.lo = lo; out.hi = hi;
  return out;
}

/** The share of the light each of n beams of one movement carries where they leave the key (1 for one beam). Pure. */
export function beamShare(n, o = LIGHT_BEAM) { return n > 1 ? Math.pow(n, -o.manyPower) : 1; }
/** That share at f of the way from the key to the muscle (0..1): `share` at the key, up to manyRise times it (at most 1)
 * farther on. Pure. */
export function beamShareAt(share, f, o = LIGHT_BEAM) { return share + (Math.min(1, share * o.manyRise) - share) * sstep(o.manyFrom, o.manyTo, f); }
