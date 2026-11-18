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
 *    midline it carries a small bright knot (crossKnot), so the crossing is one of the first things a new player sees.
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
