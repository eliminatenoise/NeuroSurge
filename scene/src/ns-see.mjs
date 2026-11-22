/** NeuroSurge: whatever is hidden behind something shows through it as light-blue glass, and a limb hidden behind
 * another limb can be aimed at (18 November 2026; widened to everything on 19 November 2026).
 *
 * The owner, 17 November: "fix it when limbs become invisible because they're blocked behind other limbs"; "often limbs
 * become out of view and you can't control them anymore". 18 November: "make sure limbs can't be ... locked away or
 * occluded in inaccessible places". 11 November: "If limbs are overlapping, make sure their clearly defined with
 * outlines so they don't merge into each other" and "No invisible or transparent body parts".
 * 19 November: "The under torso or under any body of flesh outline is great. That sort of bluish transparent outline is
 * great. We actually want that for everything now. Whenever anything is occluded behind something, we want to see it
 * through as well with a highlighted outline, light bluish glass thing."
 *
 * WHAT IT DOES. Where a THING is covered by another thing, the covered part is drawn over the thing in front as a
 * GHOST: a clear light-blue line round the hidden part, a thin dark keyline just inside it, and (for some things) a
 * faint cool fill. Nothing in front becomes see-through: the ghost is only added on top. ONE LOOK for every ghost
 * (SEE.glass): until 19 November each limb's ghost had its colour family on the motor strip; the look the owner liked
 * was the left arm's blue one, and every ghost has it now. The strip, the beams and the muscles keep their colours.
 *
 * THE THINGS (a ghost code; SEE_THINGS): on each body its four limbs (1..4 yours: left arm, right arm, left leg, right
 * leg; 5..8 the mirror body's) and its trunk with the neck and head as one piece (9 yours, 10 the mirror body's); the
 * brain's surface (11); the eyeballs with their nerves (12); the motor strip, one code per GROUP of areas (13 and up:
 * the groups the strip's own labels name).
 *
 * WHICH PART IS A GHOST (the rule on the graphics card; seeShows is the same rule in plain code):
 *  - a thing never shows through itself (the fingers in front of their own palm, a forearm folded on its upper arm,
 *    the chest in front of the belly, one fold of the brain behind another, a motor area behind the brain's surface);
 *  - a part joined at a joint to the part in front is not hidden (a thigh going into the hip, an upper arm going into
 *    the shoulder; and the other way round, the trunk behind the root of its own limb);
 *  - the hidden part must lie at least SEE.gapM (plus SEE.gapRel of the distance) behind the part in front;
 *  - WITHIN A BODY the limbs show through each other and through the trunk (as before), and the trunk shows through a
 *    forearm, hand, shank or foot in front of it (SEE.rules.trunk);
 *  - ACROSS THE BODIES your limb or trunk shows through the mirror body and the mirror body through you
 *    (SEE.rules.across);
 *  - THE BRAIN (SEE.rules.brain): a body part behind the brain shows through it; the brain's surface or a group of motor
 *    areas behind a body part shows through that part (the eyeballs and nerves never do since 20 November 2026,
 *    SEE.eyesGlass, nor behind the brain's own surface; they still cover what is behind them). Per sample only ONE hidden thing is drawn: the nearest one behind what is seen there. Things that are
 *    not ghosts on the way (the same thing again, a joined root) are passed through: a hand pushed under the body shows
 *    through the thigh AND the pelvis in front of it.
 *  - a hidden sliver narrower than SEE.minWidthCm gets nothing (a tendon behind a thigh; and whatever lies behind a
 *    finger: the piece of it a finger covers is a sliver too). The width is that of the hidden PIECE: a hidden trunk
 *    and its hidden limbs count together, and so do the brain's things.
 *
 * WHERE THE LINE IS. Round the hidden part's OWN outline: where the next sample neither is that hidden thing nor shows
 * that thing itself in front. So a big thing behind a small one (the trunk behind a hand, the brain behind a leg) gets
 * a line only where its own edge passes behind the small one, never round the small one. Where two hidden things meet,
 * one line is drawn, on the side of the smaller kind (a limb, an area or an eyeball before a trunk, a trunk before the
 * brain's surface). Where the trunk goes on behind the root of its own limb (not a ghost there, see above) no line is
 * drawn across the joint.
 *
 * THE FILL (seeFillTargets). A limb keeps its light fill, and a strong one while it is LOCKED AWAY (hidden and hardly
 * seen anywhere in the picture: a leg behind the other thigh, an arm under the body). A trunk gets a fill only as far
 * as it is hidden (none while most of it shows), and the strong one when it too is hidden and hardly seen: a whole
 * body behind the brain is then one glass figure. The brain's surface gets none (it is behind almost everything; a
 * fill would tint every body in front of it). A group of motor areas and an eyeball get a faint one.
 * 20 November 2026, evening (the owner: "ensure, especially with the right arm, that muscles do not become transparent
 * under certain angles ... That shouldn't be happening"): a fill is drawn only where the BRAIN (its surface, an area, an
 * eyeball) is the thing in front (seeFillOver). Where a body part is in front (yours, the mirror body's, the game arm),
 * the ghost is its lines alone, so a muscle in front never reads as see-through: the strip's areas behind a raised arm
 * washed it light blue, and a thigh locked away behind the folded right arm laid its strong fill over the forearm. The
 * fill strengths below are unchanged; a whole body behind the brain is still one glass figure.
 *
 * WHICH PART THE CROSSHAIR TAKES (ns-app controlTargets): the ghost of a LOCKED-AWAY LIMB (strongly filled where the
 * brain is in front of it, its line alone where a body part is: 20 November 2026), where a
 * part of its own body covers it (seeHiddenEntry, seeTakesGhost) AND that ghost is the one drawn there (seeDrawnEntry,
 * 20 November 2026: one hidden thing is drawn per pixel, so where a trunk, the other body or the brain is drawn between
 * the part in front and the hidden limb, or the brain is in front, the crosshair keeps what is seen); everywhere else
 * the thing in front, and Shift reaches behind it (a hidden limb of the same body first, else the other item on the
 * ray). No trunk, brain, area or eyeball ghost takes the crosshair, and a motor area the look names is always the
 * default. A body behind the brain counts as hardly seen in the census (its ghost is the strong glass figure), so its
 * limbs are locked away: where one of them lies behind a part of its own body outside the brain, its strongly filled
 * ghost is drawn there and takes the crosshair, as any locked-away limb's does.
 *
 * COST. On the frames where the outline pass redraws its ID picture (the camera or a body moved): one more draw of the
 * outline's batch (geometry only) into a target of the ID picture's size; one small screen pass over it (the thing in
 * front, and the brain where a body hides it); the three small brain parts again. When the camera or the brain moved,
 * the brain's own picture first, at half the size (its surface in one draw, its areas in one draw, the eyeballs and
 * nerves): code and depth in one texel. Then the census (a 48 x 27 grid, also read back, never waited for), and the pass
 * for the lines and the composite, both drawn as the census's grid of cells and only in the cells that hold a ghost
 * that can show (TILE_VS). Measured (the graphics card's timer round the pass, 19 November): 1.4 ms a redrawn frame at
 * 1600 x 900 and 1.6 ms at 3200 x 2000, against 0.95 and 1.1 ms with the three new rules off.
 *
 * QA only (globalThis flags, read when set; none is set by the game): __nsSeeOff (the pass is skipped), __nsSeeRules
 * ({ trunk, across, brain } in place of SEE.rules), __nsSeeCodes (true: a colour per thing; 2 / 3: the brain's picture /
 * the ghost picture as they are), __nsSeeCount (state().counts: pixels and boxes per thing), __nsSeeLockAll (every
 * hidden limb counts as locked away), __nsSeeDebug (drawn strongly), __nsSeeGpu with __nsSeeGpuPart and
 * __nsSeeGpuReset (state().gpu: the graphics card's time for the pass, or for one part of it).
 *
 * Display only: a drawing aid and a picking aid. It changes no pose, activity value or collision.
 */
import { OUTLINE, OUTLINE_GROUPS, OUTLINE_ADJACENT, OUTLINE_MIRROR_OFFSET, OUTLINE_FACE_EDGE_GROUP, OUTLINE_ID_VS, OUTLINE_SKIN_ID_VS, OUTLINE_SKIN_BATCH_VS } from './ns-outline.mjs';

/** Display and picking choices (18 November 2026; the widening of 19 November 2026).
 *  gapM / gapRel: how far behind the front part (metres, plus a share of its distance) a part must lie to be hidden.
 *  lineCss: the ghost line's width (CSS px, on a near thing; tapered like the outline's lines by the on-screen size of a
 *  centimetre at the HIDDEN thing's distance, so the far mirror body's ghost gets a thinner line, but never under
 *  taperMin of the width: the outline's own lines go down to 0.42, and a ghost line that thin on the far brain or the
 *  mirror body was a hair that could hardly be seen, `after-1/z-start-mid.png`). lineAlpha: its opacity.
 *  glass: the one look of every ghost (linear RGB; 19 November 2026): `line` the light-blue line, `fill` the cool
 *  translucent fill. No channel is above 0.8, which is under the bloom's threshold (ns-scene-three HDR_BLOOM: 1.1 with a
 *  knee of 0.3), so a ghost does not glow. keyCss / keyAlpha: a thin dark band just inside the line (the outline's ink
 *  colour), so the light line holds on the pale pink brain and on pale tendon and bone as well as on dark muscle.
 *  rules: the three widenings of 19 November (see the header), each can be switched off by itself.
 *  LOCKED AWAY (per limb, from the census: a grid of censusCells cells across the picture, each noting which things are
 *  seen and which hidden in it, from censusGrid x censusGrid samples of the cell): a limb hidden in at least lockCells
 *  cells whose seen share (seen / (seen + hidden) cells) is under lockOn; it stays locked until the share rises over lockOff (no flicker near the threshold). Its ghost is
 *  filled at fillAlpha (where the brain is in front; a body part in front shows its line alone, seeFillOver) and the
 *  crosshair takes it; every other limb ghost gets the light fillLow and leaves the part in
 *  front to the crosshair (Shift reaches it). The fill strength eases over fillEaseS (at once under reduced motion).
 *  (First tried, per pixel: fill where the hidden part looked "closed" within 9 to 13 cm round the pixel. The fill came
 *  out patchy: a jagged diamond-shaped hole in the middle of a leg hidden behind the other thigh, `under-fix.png`, and a
 *  forearm across the edge of a thigh filled the thigh's strip, `ar-2.png`. A limb's visibility is a property of the
 *  whole limb, so it is now decided per limb.)
 *  fillTrunk / partFrom / partFull: a trunk's fill grows from nothing to fillTrunk as its hidden share (hidden /
 *  (seen + hidden) cells) goes from partFrom to partFull: a trunk that mostly shows gets lines only; hidden and hardly
 *  seen (the same rule as a limb's, lockOn / lockOff) it gets fillAlpha like a limb, so a whole body behind the brain
 *  reads as one glass figure (first the limbs were strongly filled and the trunk hollow, `after-3/a-4-brain-outside.png`).
 *  fillArea / fillEyes: the faint fill of a hidden group of motor areas and of the eyeballs. The brain's surface never
 *  gets a fill.
 *  brainStep: the brain's own picture has one sample per brainStep x brainStep samples of the ID picture (it is only
 *  asked "is the brain nearer here, and which of its things": half the size costs a quarter of the filling).
 *  minWidthCm: a hidden part narrower than this (its narrowest width through the pixel, in the world, at the hidden
 *  thing's own distance) gets no ghost: a finger tip or a tendon tucked behind a thigh is noise, the limb shows beside it.
 *  focusCss: the line round the limb that Shift would take (while Shift is held).
 *  eyesGlass (20 November 2026, evening; the owner: "And I'm not sure how important it is to have transparency outline
 *  effects for the eyes and their nerve cords"): false: the eyeballs, the optic nerves with their sheaths and the
 *  chiasm are never a ghost (no line, no fill: behind a body part, behind the brain's surface, anywhere). They still
 *  cover what lies behind them, and a body part behind an eyeball still shows through it. Before, the X of the nerves
 *  and the two circles of the eyeballs, which lie behind your own body at the start, were outlined in every opening
 *  picture (section 147's own "not right" list). */
export const SEE = Object.freeze({
  gapM: 0.012, gapRel: 0.01,
  lineCss: 2.0, lineAlpha: 1, keyCss: 1.0, keyAlpha: 0.55, taperMin: 0.75,
  fillAlpha: 0.42, fillLow: 0.16, fillEaseS: 0.15, minWidthCm: 3,
  fillTrunk: 0.16, partFrom: 0.15, partFull: 0.5, fillArea: 0.2, fillEyes: 0.12, brainStep: 2,
  censusCells: 48, censusGrid: 8, lockCells: 2, lockOn: 0.35, lockOff: 0.5,
  focusCss: 3.0, eyesGlass: false,
  glass: Object.freeze({ line: Object.freeze([0.14, 0.53, 0.8]), fill: Object.freeze([0.24, 0.57, 0.8]) }),
  rules: Object.freeze({ trunk: true, across: true, brain: true })
});

/** The four limbs in their ghost code order (1..4 your body, 5..8 the mirror body; 0 = not a limb). */
export const SEE_LIMBS = Object.freeze(['leftArm', 'rightArm', 'leftLeg', 'rightLeg']);
/** The ghost codes that are not limbs (19 November 2026): each body's trunk with its neck and head, the brain's surface,
 * the eyeballs with their nerves, and the motor strip (area + a number, at most maxCode). The scene gives one code to
 * each GROUP of areas, the groups the strip's own labels name (the left arm's areas, the face and neck's, ...; each
 * half of the brain its own), so a hidden piece of the strip shows the outlines of those groups and not of every one of
 * its 54 areas (tried first: an arm in front of the strip was covered in contour lines, `after-3/a-6-mirror-in.png`).
 * `count`: the number of fill strengths (index = min(code, area)). */
export const SEE_THINGS = Object.freeze({ ownTrunk: 9, mirrorTrunk: 10, brain: 11, eyes: 12, area: 13, maxCode: 63, count: 14 });
const G = OUTLINE_GROUPS, T = SEE_THINGS;
const LIMB_OF_GROUP = (() => {
  const t = new Uint8Array(OUTLINE_MIRROR_OFFSET);
  for (const k of ['lUpper', 'lFore', 'lHand']) t[G[k]] = 1;
  for (const k of ['rUpper', 'rFore', 'rHand']) t[G[k]] = 2;
  for (const k of ['lThigh', 'lShank', 'lFoot']) t[G[k]] = 3;
  for (const k of ['rThigh', 'rShank', 'rFoot']) t[G[k]] = 4;
  return t;
})();
const ADJ = new Set(OUTLINE_ADJACENT.map(([a, b]) => `${Math.min(G[a], G[b])}:${Math.max(G[a], G[b])}`));

/** The ghost code of an outline group (ns-outline groupOf: 1..14 your body, 17..30 the mirror body): 1..4 your left arm,
 * right arm, left leg, right leg; 5..8 the same on the mirror body; 0 for the trunk, the head and anything unknown. */
export function seeLimbOfGroup(group) {
  const g = Number.isInteger(group) ? group : -1;
  if (g <= 0 || g >= 2 * OUTLINE_MIRROR_OFFSET) return 0;
  const m = g >= OUTLINE_MIRROR_OFFSET, k = m ? g - OUTLINE_MIRROR_OFFSET : g;
  const l = LIMB_OF_GROUP[k] || 0;
  return l ? l + (m ? 4 : 0) : 0;
}
/** { limb ('leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg'), source ('own' | 'mirror') } of a ghost code, or null. */
export function seeLimbKey(code) {
  if (!Number.isInteger(code) || code < 1 || code > 8) return null;
  return { limb: SEE_LIMBS[(code - 1) % 4], source: code > 4 ? 'mirror' : 'own' };
}
const bodyOfGroup = g => (g >= OUTLINE_MIRROR_OFFSET ? 2 : g > 0 ? 1 : 0);
/** The THING (ghost code) of an outline group (19 November 2026): its limb (seeLimbOfGroup), or its body's trunk (the
 * trunk, neck and head are one piece: SEE_THINGS.ownTrunk / mirrorTrunk); 0 when it is no body group. The face's moving
 * edges (ns-outline OUTLINE_FACE_EDGE_GROUP, 15 and the mirror body's 31; update 65) are the head's. */
export function seeThingOfGroup(group) {
  const g = Number.isInteger(group) ? group : -1;
  if (g <= 0 || g >= 2 * OUTLINE_MIRROR_OFFSET) return 0;
  const k = g >= OUTLINE_MIRROR_OFFSET ? g - OUTLINE_MIRROR_OFFSET : g;
  if (k === OUTLINE_FACE_EDGE_GROUP) return g >= OUTLINE_MIRROR_OFFSET ? T.mirrorTrunk : T.ownTrunk;
  if (!(k >= 1 && k <= G.rFoot)) return 0;
  return seeLimbOfGroup(g) || (g >= OUTLINE_MIRROR_OFFSET ? T.mirrorTrunk : T.ownTrunk);
}
/** The body a thing belongs to (1 yours, 2 the mirror body, 0 the brain's things or none). */
export function seeBodyOfThing(code) {
  if ((code >= 1 && code <= 4) || code === T.ownTrunk) return 1;
  if ((code >= 5 && code <= 8) || code === T.mirrorTrunk) return 2;
  return 0;
}
/** The ghost code of motor area (or group of areas) number `index`. */
export function seeAreaCode(index) { return Math.min(T.maxCode, T.area + Math.max(0, index | 0)); }
/** THE DRAWING RULE (pure; the graphics card applies the same): whether `behind`, lying behind `front` by more than the
 * gap, is drawn as a ghost. Both are either { group } (a body part: an outline group, 1..14 yours, 17..30 the mirror
 * body's) or { thing } (one of the brain's: SEE_THINGS.brain, .eyes, or an area code). */
export function seeShows(front, behind, rules = SEE.rules) {
  const gOf = x => (x && Number.isInteger(x.group) ? x.group : 0), tOf = x => (x && Number.isInteger(x.thing) ? x.thing : seeThingOfGroup(gOf(x)));
  const tf = tOf(front), tb = tOf(behind);
  if (!(tf > 0 && tb > 0) || tf === tb) return false;                       // nothing, or a thing behind itself
  if (tb === T.eyes && SEE.eyesGlass === false) return false;                // the eyeballs and nerves are never a ghost
  const bf = seeBodyOfThing(tf), bb = seeBodyOfThing(tb);
  if (bf === 0 || bb === 0) {
    if (!rules.brain) return false;
    if (bf === 0 && bb === 0) return tb === T.eyes;                         // of the brain's own things only the eyeballs show through the brain
    return true;                                                            // a body part behind the brain, or one of the brain's things behind a body part
  }
  if (bf !== bb) return rules.across === true;                              // across the two bodies
  if (tb >= T.ownTrunk && !rules.trunk) return false;                       // the trunk behind one of its own limbs
  const off = bodyOfGroup(gOf(front)) === 2 ? OUTLINE_MIRROR_OFFSET : 0, a = gOf(front) - off, b = gOf(behind) - off;
  return !ADJ.has(`${Math.min(a, b)}:${Math.max(a, b)}`);                    // not joined at a joint
}
/** THE FILL'S PLACE (pure; INK_FS applies the same per sample, nsFillOver): whether a ghost's fill may be drawn where
 * `front` is the thing in front (a ghost code as nsFrontAt gives it: 1..10 a body part, + 128 a limb's root; 11 and up
 * one of the brain's things; 0 nothing). Only the brain's things: over a body part a ghost is its lines alone (20
 * November 2026, owner Message 198: a muscle in front must never read as see-through). */
export function seeFillOver(front) {
  const f = Number.isInteger(front) ? (front >= 128 ? front - 128 : front) : 0;
  return f >= T.brain && f <= T.maxCode;
}
/** THE PICKING RULE (unchanged on 19 November 2026): whether a part of outline group `behind`, lying behind a part of
 * group `front` (by more than the gap), is a hidden LIMB the controls can reach: the same body, another piece (the
 * trunk and head are one), a limb, not joined to the front part at a joint. Narrower than the drawing rule (seeShows)
 * on purpose: the new ghosts (a trunk, the other body, the brain's things) are seen, not aimed at. */
export function seeGhostEligible(front, behind) {
  if (!(Number.isInteger(front) && Number.isInteger(behind)) || front <= 0 || behind <= 0) return false;
  if (bodyOfGroup(front) !== bodyOfGroup(behind)) return false;
  const lf = seeLimbOfGroup(front), lb = seeLimbOfGroup(behind);
  if (lb === 0 || lb === lf) return false;
  const off = front >= OUTLINE_MIRROR_OFFSET ? OUTLINE_MIRROR_OFFSET : 0;
  const a = front - off, b = behind - off;
  return !ADJ.has(`${Math.min(a, b)}:${Math.max(a, b)}`);
}
/** The hidden limb on a ray (pure; the picking rule): `layers` as the scene's controlLayersAt gives them (nearest first;
 * body entries { item: 'own' | 'mirror', distance, rec: { group } }, brain entries are passed over). The front is the
 * first body entry; behind it, the first entry of the same body that lies beyond the gap and is a hidden limb against
 * the front (seeGhostEligible), or null. */
export function seeHiddenEntry(layers, o = SEE) {
  if (!Array.isArray(layers)) return null;
  const body = l => l && (l.item === 'own' || l.item === 'mirror') && Number.isFinite(l.distance) && l.rec && Number.isInteger(l.rec.group) && l.rec.group > 0;
  let front = null;
  for (const l of layers) {
    if (!body(l)) continue;
    if (!front) { front = l; continue; }
    if (l.item !== front.item) continue;
    if (l.distance < front.distance + o.gapM + o.gapRel * front.distance) continue;
    if (seeGhostEligible(front.rec.group, l.rec.group)) return l;
  }
  return null;
}
/** THE GHOST DRAWN ON A RAY (pure; 20 November 2026, from a code review): the entry of `layers` (controlLayersAt,
 * nearest first) whose ghost the graphics card draws at that pixel, or null. As there (nsFrontAt, GHOST_FS, BEHIND_FS,
 * PART_FS): what is in FRONT is the nearer of the first body entry and the first entry of the brain's own picture (its
 * surface, a motor area, an eyeball or a nerve: kind 'glass' or 'area'; not 'outline', which is no surface; none while
 * the brain's rule is off), and the ghost is the NEAREST entry behind the front, past the gap, that the drawing rule
 * shows against it (seeShows). One hidden thing per pixel: a trunk, the other body or the brain lying between the part
 * in front and a hidden limb is what is drawn there (legs crossed: the pelvis behind the shank, not the other thigh
 * behind the pelvis), and with the brain in front the ghost is the body part nearest behind it.
 * The brain's picture holds ONE of its surface and small parts per pixel, the nearest (drawBrain; its areas are drawn
 * over it): the brain's surface behind an eyeball, a nerve or a nearer fold of itself is not in it, so it is passed
 * (20 November 2026, from a review of Body updates 60 and 61: with an eyeball between your hand and the brain's surface,
 * the graphics card drew the locked-away thigh behind them, as the eyeballs are never a ghost, while this rule named the
 * surface, so the crosshair refused the thigh whose glass was drawn there). */
export function seeDrawnEntry(layers, o = SEE, rules = o.rules) {
  if (!Array.isArray(layers)) return null;
  const R = rules || SEE.rules;
  const thingOf = l => {
    if (!l || !Number.isFinite(l.distance)) return null;
    if ((l.item === 'own' || l.item === 'mirror') && l.rec && Number.isInteger(l.rec.group) && l.rec.group > 0) return { group: l.rec.group };
    if (R.brain && l.item === 'brain' && (l.kind === 'glass' || l.kind === 'area')) return { thing: l.kind === 'area' ? T.area : l.part === 'eyeball' || l.part === 'nerve' ? T.eyes : T.brain };
    return null;
  };
  let front = null, ft = null, glassMet = false;
  for (const l of layers) {
    const t = thingOf(l);
    if (!t) continue;
    if (t.thing === T.brain || t.thing === T.eyes) { if (glassMet && t.thing === T.brain) continue; glassMet = true; } // (the brain's picture: see above)
    if (!front) { front = l; ft = t; continue; }
    if (l.distance < front.distance + o.gapM + o.gapRel * front.distance) continue;
    if (seeShows(ft, t, R)) return l;
  }
  return null;
}
/** Whether the crosshair takes the hidden entry (pure): its limb is locked away (`locked`: [9] booleans by ghost code,
 * the scene's census answer, as seeLockedAway gives it; its ghost is drawn filled) and, given the ray's `layers`, its
 * ghost is the one drawn at that pixel (seeDrawnEntry; 20 November 2026: the crosshair took a locked-away thigh through
 * a pelvis whose ghost was drawn there, and a limb of a body behind the brain whose trunk's ghost was drawn there). */
export function seeTakesGhost(locked, hidden, layers = null) {
  if (!Array.isArray(locked) || !hidden || !hidden.rec) return false;
  const c = seeLimbOfGroup(hidden.rec.group);
  if (!(c > 0 && locked[c] === true)) return false;
  return !Array.isArray(layers) || seeDrawnEntry(layers) === hidden;
}
/** The ghost look (linear RGB): { line, fill }, the same for every ghost (SEE.glass). Pure. */
export function seeGlassColours(o = SEE) {
  return { line: o.glass.line.slice(), fill: o.glass.fill.slice() };
}

/* ---- the ghost pass (THREE injected; nothing here imports 'three') ------------------------------------------------- */
const M = OUTLINE_MIRROR_OFFSET;
/** The most areas the owner table may name (their codes are a uniform array of this length). */
const OWNERS = 96;
/** Per outline group of one body (index = the group's code, 0..M-1): a bit for each group it is or joins at a joint
 * (ns-outline OUTLINE_ADJACENT). The graphics card's "joined at a joint" test reads these (exported for the tests). */
export const SEE_JOIN_MASKS = (() => {
  const t = new Array(M).fill(0);
  for (const g of Object.values(G)) t[g] |= 1 << g;
  for (const [a, b] of OUTLINE_ADJACENT) { t[G[a]] |= 1 << G[b]; t[G[b]] |= 1 << G[a]; }
  // (update 65: the face's moving edges, OUTLINE_FACE_EDGE_GROUP, join what the head joins, the head itself included)
  const F = OUTLINE_FACE_EDGE_GROUP;
  if (F > 0 && F < M) {
    for (let g = 0; g < M; g++) if ((t[g] >> G.head) & 1) t[g] |= 1 << F;
    t[F] = t[G.head];
  }
  return Object.freeze(t);
})();
const JOIN_MASKS = SEE_JOIN_MASKS;
const GROUP_GLSL = `
int nsGroupOf( vec4 c ) { return int( c.r * 255.0 + 0.5 ); }
// ghost code of an outline group (seeLimbOfGroup): 1..4 your limbs, 5..8 the mirror body's, 0 trunk / head / none
int nsLimbOf( int g ) {
	int m = g >= ${M} ? 4 : 0;
	int k = g >= ${M} ? g - ${M} : g;
	if ( k == ${OUTLINE_FACE_EDGE_GROUP} ) k = ${G.head}; // (the face's moving edges are the head's)
	if ( k >= ${G.lUpper} && k <= ${G.lHand} ) return 1 + m;
	if ( k >= ${G.rUpper} && k <= ${G.rHand} ) return 2 + m;
	if ( k >= ${G.lThigh} && k <= ${G.lFoot} ) return 3 + m;
	if ( k >= ${G.rThigh} && k <= ${G.rFoot} ) return 4 + m;
	return 0;
}
// the thing of an outline group (seeThingOfGroup): its limb, else its body's trunk (with the neck and head)
int nsThingOf( int g ) {
	if ( g <= 0 || g >= ${2 * M} ) return 0;
	int l = nsLimbOf( g );
	if ( l > 0 ) return l;
	int k = g >= ${M} ? g - ${M} : g;
	if ( k == ${OUTLINE_FACE_EDGE_GROUP} ) k = ${G.head}; // (the face's moving edges are the head's)
	if ( k < 1 || k > ${G.rFoot} ) return 0;
	return g >= ${M} ? ${T.mirrorTrunk} : ${T.ownTrunk};
}
// a limb's root: the part that joins its trunk (upper arm, thigh)
bool nsRootOf( int g ) {
	int k = g >= ${M} ? g - ${M} : g;
	return k == ${G.lUpper} || k == ${G.rUpper} || k == ${G.lThigh} || k == ${G.rThigh};
}
int nsBodyOf( int g ) { return g >= ${M} ? 2 : g > 0 ? 1 : 0; }
// two groups of ONE body that are the same group or join at a joint (ns-outline OUTLINE_ADJACENT; a bit per group)
const int NS_JOIN[ ${M} ] = int[ ${M} ]( ${JOIN_MASKS.join(', ')} );
bool nsJoined( int a, int b ) {
	int ka = a >= ${M} ? a - ${M} : a, kb = b >= ${M} ? b - ${M} : b;
	return ( ( NS_JOIN[ ka ] >> kb ) & 1 ) == 1;
}
int nsBodyOfThing( int t ) { return ( ( t >= 1 && t <= 4 ) || t == ${T.ownTrunk} ) ? 1 : ( ( t >= 5 && t <= 8 ) || t == ${T.mirrorTrunk} ) ? 2 : 0; }
float nsViewDist( float d, vec4 view ) {
	if ( view.w > 0.5 ) return ( view.y * view.z ) / ( view.z - ( view.z - view.y ) * d );
	return view.y + d * ( view.z - view.y );
}
// a depth (0..1) in three bytes, and back
vec3 nsPack( float d ) {
	vec3 e = fract( clamp( d, 0.0, 0.9999999 ) * vec3( 1.0, 255.0, 65025.0 ) );
	e.xy -= e.yz / 255.0;
	return e;
}
float nsUnpack( vec3 e ) { return dot( e, vec3( 1.0, 1.0 / 255.0, 1.0 / 65025.0 ) ); }
// a distance (0.05 m .. 12.8 m) in one byte (steps of 2.2 %), and back
float nsDistByte( float z ) { return clamp( log2( max( z, 1e-4 ) / 0.05 ) / 8.0, 0.0, 1.0 ); }
float nsByteDist( float b ) { return 0.05 * exp2( b * 8.0 ); }`;
/* THE BRAIN'S PICTURE (a smaller target with its own depth): alpha = the thing's code (the surface, an area, the
 * eyeballs and nerves), rgb = its depth packed, so one fetch gives both. The vertex shader keeps Three's begin_vertex
 * chunk, so the scene can give it the living brain's vertex rule (as it does for the outline's strip).
 * WHICH AREA a fragment of the motor strip is: the scene's areas are not whole triangles (the strip's triangles are long
 * shards; ns-scene-three REGION_BORDER decides per fragment, from the strip coordinate s and a table of owners), so the
 * same table is read here (tOwn, uOwnW texels wide; attribute nsOwn = s and the table's row, row < 0: no table): the
 * code is uOwnCode[the owner's number] (the scene's choice: one code per GROUP of areas, see SEE_THINGS). Where the
 * table names no owner (a gap in the map) or there is no table, the triangle's own code (attribute nsCode) stands. */
const BRAIN_VS = `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float nsCode;
attribute vec2 nsOwn;
uniform float uCode;
flat varying float vNsCode;
varying vec2 vNsOwn;
void main() {
	#include <begin_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	vNsCode = uCode > 0.0 ? uCode : nsCode;
	vNsOwn = nsOwn;
}`;
const BRAIN_FS = `
precision highp float;
precision highp int;
flat varying float vNsCode;
varying vec2 vNsOwn;
uniform highp sampler2D tOwn;
uniform float uOwnW;
uniform float uOwnCode[ ${OWNERS} ];
${GROUP_GLSL}
void main() {
	float code = floor( vNsCode + 0.5 );
	if ( uOwnW > 0.0 && vNsOwn.y > - 0.5 ) {
		float sv = clamp( vNsOwn.x, 0.0, 1.0 );
		int ti = clamp( int( floor( sv * uOwnW ) ), 0, int( uOwnW ) - 1 );
		vec4 ta = texelFetch( tOwn, ivec2( ti, 2 * int( vNsOwn.y + 0.5 ) ), 0 );
		float owner = sv < ta.z ? ta.x : ta.y;
		if ( owner > - 0.5 && owner < ${OWNERS}.0 - 0.5 ) code = uOwnCode[ int( owner + 0.5 ) ];
	}
	gl_FragColor = vec4( nsPack( gl_FragCoord.z ), code / 255.0 );
}`;
/* What is in FRONT at a sample of the ID picture: the nearer of the body part there (the ID picture and its depth) and
 * the brain there (its picture, uBrain.x times smaller in each direction; uBrain.y: whether it is drawn at all). */
const FRONT_GLSL = `
uniform sampler2D tId;
uniform highp sampler2D tDepth;
uniform sampler2D tBrain;
uniform ivec2 uBrain; // x: ID samples per sample of the brain's picture, y: 1 while the brain is in it
uniform vec4 uView;
uniform vec2 uGap;
${GROUP_GLSL}
float nsGap( float z ) { return uGap.x + uGap.y * z; }
vec4 nsBrainAt( ivec2 p ) { return uBrain.y > 0 ? texelFetch( tBrain, p / uBrain.x, 0 ) : vec4( 0.0 ); }
// the thing in front at p (+ 128: a limb's root), 0 = nothing
int nsFrontAt( ivec2 p ) {
	int gf = nsGroupOf( texelFetch( tId, p, 0 ) );
	vec4 bp = nsBrainAt( p );
	int bc = int( bp.a * 255.0 + 0.5 );
	if ( bc > 0 && ( gf == 0 || nsUnpack( bp.rgb ) < texelFetch( tDepth, p, 0 ).r ) ) return bc;
	return gf > 0 ? nsThingOf( gf ) + ( nsRootOf( gf ) ? 128 : 0 ) : 0;
}`;
/* GHOST GEOMETRY PASS: the outline batch again (same instances), into a target of the ID target's size with its own depth.
 * Each fragment reads what is in FRONT at its sample (the nearer of the body part in the ID picture and the brain in its
 * picture): only a ghost against that front (seeShows) lying behind it by the gap is kept; the nearest such fragment
 * wins the depth test. It writes r = its thing, b = its distance.
 * 20 November 2026 (from a code review): it carries the ID pass's clipping too (ns-outline setClip: the box that ends
 * your own body at the collar in the eye view; the planes come with the ID pass, afterId's ctx.clip), cut the same way:
 * only your own trunk and head. Before, the pieces of neck muscle the picture leaves out were drawn here, and with a
 * hand, the other body or the brain in front of them they became light-blue outlines of muscle drawn nowhere. */
const GHOST_FS = `
precision highp float;
precision highp int;
flat varying vec3 vNsId;
uniform vec3 uRules; // x: the trunk behind its own limbs, y: across the two bodies (z: the brain, which is its picture)
#include <clipping_planes_pars_fragment>
${FRONT_GLSL}
void main() {
	float gb = floor( vNsId.g * 255.0 + 0.5 );
	bool flip = gb >= 128.0;
	if ( flip ) gb -= 128.0;
	bool dbl = gb >= 64.0;
	if ( dbl ) gb -= 64.0;
	if ( ! dbl && gl_FrontFacing == flip ) discard;
	int g = int( vNsId.r * 255.0 + 0.5 );
	#if NUM_CLIPPING_PLANES > 0
	if ( g == ${G.trunk} || g == ${G.head} ) {
		#include <clipping_planes_fragment>
	}
	#endif
	int tg = nsThingOf( g );
	ivec2 p = ivec2( gl_FragCoord.xy );
	int gf = nsGroupOf( texelFetch( tId, p, 0 ) );
	if ( tg == 0 || gf == 0 ) discard;
	float df = texelFetch( tDepth, p, 0 ).r;
	float z = nsViewDist( gl_FragCoord.z, uView );
	vec4 bp = nsBrainAt( p );
	if ( bp.a > 0.0 && nsUnpack( bp.rgb ) < df ) {
		// the brain is what is seen here: the nearest body part behind it shows through it
		float zb = nsViewDist( nsUnpack( bp.rgb ), uView );
		if ( z < zb + nsGap( zb ) ) discard;
	} else {
		float zf = nsViewDist( df, uView );
		if ( z < zf + nsGap( zf ) ) discard;
		if ( tg == nsThingOf( gf ) ) discard;
		if ( nsBodyOf( g ) == nsBodyOf( gf ) ) {
			if ( tg >= ${T.ownTrunk} && uRules.x < 0.5 ) discard;
			if ( nsJoined( gf, g ) ) discard;
		} else if ( uRules.y < 0.5 ) discard;
	}
	gl_FragColor = vec4( float( tg ) / 255.0, 0.0, nsDistByte( z ), 1.0 );
}`;
const SCREEN_VS = `
void main() {
	gl_Position = vec4( position.xy, 0.0, 1.0 );
}`;
/* THE BRAIN BEHIND A BODY PART (one screen triangle into the ghost picture, after the bodies, depth tested): where a body
 * part is in front of the brain by the gap, r = the brain's thing there (its surface, an area, an eyeball), written at
 * the brain's own depth, so a hidden body part that is nearer still wins. Everywhere else nothing is written. */
const BEHIND_FS = `
precision highp float;
precision highp int;
${FRONT_GLSL}
void main() {
	ivec2 p = ivec2( gl_FragCoord.xy );
	int gf = nsGroupOf( texelFetch( tId, p, 0 ) );
	if ( gf == 0 ) discard;
	vec4 bp = nsBrainAt( p );
	int bc = int( bp.a * 255.0 + 0.5 );
	if ( bc == 0 ) discard;
	${SEE.eyesGlass === false ? `if ( bc == ${T.eyes} ) discard; // the eyeballs and nerves are never a ghost (SEE.eyesGlass)` : ''}
	float db = nsUnpack( bp.rgb );
	float zf = nsViewDist( texelFetch( tDepth, p, 0 ).r, uView ), zb = nsViewDist( db, uView );
	if ( zb < zf + nsGap( zf ) ) discard;
	gl_FragDepth = db;
	gl_FragColor = vec4( float( bc ) / 255.0, 0.0, nsDistByte( zb ), 1.0 );
}`;
/* A SMALL PART OF THE BRAIN AS A GHOST (the eyeballs and nerves, drawn again into the ghost picture): kept where it
 * lies behind what is seen (a body part, or the brain's own surface or an area) by the gap. */
const PART_FS = `
precision highp float;
precision highp int;
flat varying float vNsCode;
varying vec2 vNsOwn;
${FRONT_GLSL}
void main() {
	ivec2 p = ivec2( gl_FragCoord.xy );
	int gf = nsGroupOf( texelFetch( tId, p, 0 ) );
	vec4 bp = nsBrainAt( p );
	int bc = int( bp.a * 255.0 + 0.5 );
	if ( gf == 0 && bc == 0 ) discard;
	float zf = gf > 0 ? nsViewDist( texelFetch( tDepth, p, 0 ).r, uView ) : 1e9;
	float zb = bc > 0 ? nsViewDist( nsUnpack( bp.rgb ), uView ) : 1e9;
	int code = int( vNsCode + 0.5 );
	if ( zb < zf && bc == code ) discard;
	float zFront = min( zf, zb );
	float z = nsViewDist( gl_FragCoord.z, uView );
	if ( z < zFront + nsGap( zFront ) ) discard;
	gl_FragColor = vec4( float( code ) / 255.0, 0.0, nsDistByte( z ), 1.0 );
}`;
/* GHOST INK PASS (drawing-buffer pixels): per pixel, from its uSS x uSS samples of the ghost picture:
 *  r: the line's coverage (a sample within the line's width of the hidden part's own outline, `rimOf`), or of the FOCUS
 *     line (uFocus, a limb's ghost code; 0 = none: a line round everything of that limb, seen or hidden), averaged over
 *     the samples;
 *  g: the ghost's coverage of the pixel where it may be filled (the brain's thing in front, fillOver: 20 November
 *     2026, never over a body part), times `keep` (0 where the hidden part is a sliver narrower than uThin: its
 *     narrowest width through the pixel, from 8 walks out to where it stops);
 *  b: the ghost code; a: 0.5 + half the dark keyline's coverage (0.5 and above: something is written here).
 * Most ghost pixels lie well inside their ghost: a ring of 8 probes round the pixel finds that out. A thing that gets
 * no fill (uFill: the brain's surface, a trunk that mostly shows) is then left at once; another gets a second ring and
 * 8 probes at the sliver width, and skips the walks (19 November 2026: with everything a ghost, whole bodies are
 * inside one). Whether the thing goes on at a sample is looked up only where a walk ends (rimOf). The focus line is a
 * second build of this shader (NS_FOCUS), used only while Shift is held, so the everyday one carries none of it. */
const INK_FS = `
precision highp float;
precision highp int;
uniform sampler2D tGhost;
uniform ivec2 uSize;
uniform int uSS;
uniform vec4 uLine;   // x: line width (samples, at full size), y: focus line width (samples), z: samples per cm at 1 m, w: taper full (CSS px per cm)
uniform float uKey;   // the dark keyline's width inside the line (samples)
uniform float uTaperMin;
uniform float uCssPerSample;
uniform float uThin;   // the narrowest hidden part that gets a ghost (cm)
uniform int uFocus;
uniform float uFill[ ${T.count} ]; // each thing's fill strength now (0: lines only)
${FRONT_GLSL}
int ghostAt( ivec2 q ) { return int( texelFetch( tGhost, q, 0 ).r * 255.0 + 0.5 ); }
bool inside( ivec2 q ) { return q.x >= 0 && q.y >= 0 && q.x < uSize.x && q.y < uSize.y; }
// a ghost's fill only where the brain's thing is in front, never over a body part (seeFillOver; Message 198)
bool fillOver( ivec2 q ) { int f = nsFrontAt( q ); if ( f >= 128 ) f -= 128; return f >= ${T.brain}; }
bool brainIs( ivec2 q ) { return int( nsBrainAt( q ).a * 255.0 + 0.5 ) == ${T.brain}; }
// which of two hidden things that meet carries the line: a limb, an area or an eyeball before a trunk, a trunk before
// the brain's surface; of two alike, the higher code
int rankOf( int c ) { return c == ${T.brain} ? 1 : ( c == ${T.ownTrunk} || c == ${T.mirrorTrunk} ) ? 2 : 3; }
// the hidden part's own outline at sample q, whose hidden code h is not c: q is not a hidden thing that carries the
// line itself, and the thing does not go on at q (seen there, or there but not as a ghost). For one of the brain's
// things, the brain's own picture says whether it is at q at all; for a body part, the ID picture says whether that
// part is the body part in front at q, or (for a trunk) the root of its own limb, behind which the trunk goes on
// without being a ghost: no line across the joint.
bool rimOf( ivec2 q, int h, int c ) {
	if ( h > 0 ) { int rc = rankOf( c ), rn = rankOf( h ); if ( rc < rn || ( rc == rn && c < h ) ) return false; }
	if ( c >= ${T.brain} ) {
		int bq = int( nsBrainAt( q ).a * 255.0 + 0.5 );
		${SEE.eyesGlass === false ? `if ( bq == ${T.eyes} ) return false; // (an eyeball or nerve in front of it: no edge of the thing there; SEE.eyesGlass)` : ''}
		return bq != c;
	}
	int gq = nsGroupOf( texelFetch( tId, q, 0 ) );
	int f = nsThingOf( gq );
	if ( f == c ) return false;
	if ( c >= ${T.ownTrunk} && nsRootOf( gq ) && nsBodyOfThing( f ) == nsBodyOfThing( c ) ) return false;
	return true;
}
ivec2 dirOf( int i ) {
	return i == 0 ? ivec2( 1, 0 ) : i == 1 ? ivec2( - 1, 0 ) : i == 2 ? ivec2( 0, 1 ) : i == 3 ? ivec2( 0, - 1 ) :
		i == 4 ? ivec2( 1, 1 ) : i == 5 ? ivec2( - 1, 1 ) : i == 6 ? ivec2( 1, - 1 ) : ivec2( - 1, - 1 );
}
// whether the 8 samples at about r samples round s are all this ghost
bool ringIs( ivec2 s, float r, int c ) {
	for ( int k = 0; k < 8; k ++ ) {
		ivec2 q = s + ivec2( round( vec2( dirOf( k ) ) * ( k < 4 ? r : r * 0.70710678 ) ) );
		if ( ! inside( q ) || ghostAt( q ) != c ) return false;
	}
	return true;
}
// For the sliver rule the hidden PIECE counts, not each thing of it: a hidden trunk and its hidden limbs are one piece
// (one body), and so are the brain's things. (Measured per thing, a whole body seen through the brain had holes at its
// shoulders and hips, where a narrow bit of the trunk lies between two limbs: after-5/d2/z-brain-in.png.)
bool pieceIs( int h, int c ) {
	if ( h == c ) return true;
	if ( h == 0 ) return false;
	return c >= ${T.brain} ? h >= ${T.brain} : nsBodyOfThing( h ) == nsBodyOfThing( c );
}
bool ringPiece( ivec2 s, float r, int c ) {
	for ( int k = 0; k < 8; k ++ ) {
		ivec2 q = s + ivec2( round( vec2( dirOf( k ) ) * ( k < 4 ? r : r * 0.70710678 ) ) );
		if ( ! inside( q ) || ! pieceIs( ghostAt( q ), c ) ) return false;
	}
	return true;
}
#ifdef NS_FOCUS
// the FOCUS line (while Shift is held): round everything of limb uFocus, seen (the body part in front) or hidden
bool inFocus( ivec2 q ) {
	if ( ! inside( q ) ) return false;
	return ghostAt( q ) == uFocus || nsLimbOf( nsGroupOf( texelFetch( tId, q, 0 ) ) ) == uFocus;
}
#endif
void main() {
	ivec2 b = ivec2( gl_FragCoord.xy ) * uSS;
	int n = uSS * uSS;
	int cs[ 4 ]; float zs[ 4 ];
	int code = 0; ivec2 s0 = b; int cnt = 0, fcnt = 0, bcnt = 0; bool one = true;
	float zNear = 1e9;
	for ( int i = 0; i < 4; i ++ ) {
		cs[ i ] = 0; zs[ i ] = 1.0;
		if ( i >= n ) continue;
		ivec2 s = min( b + ivec2( i - 2 * ( i / 2 ), i / 2 ), uSize - 1 );
		vec4 t = texelFetch( tGhost, s, 0 );
		int c = int( t.r * 255.0 + 0.5 );
		cs[ i ] = c; zs[ i ] = nsByteDist( t.b );
		if ( c > 0 ) {
			cnt ++; if ( code == 0 ) { code = c; s0 = s; } else if ( c != code ) one = false; zNear = min( zNear, zs[ i ] );
			if ( uFill[ min( c, ${T.area} ) ] > 0.0 && fillOver( s ) ) bcnt ++; // (asked only of a thing that has a fill now)
		}
	}
	float line = 0.0, fline = 0.0, key = 0.0, fkey = 0.0;
	#ifdef NS_FOCUS
	for ( int i = 0; i < 4; i ++ ) {
		if ( i >= n ) break;
		ivec2 s = min( b + ivec2( i - 2 * ( i / 2 ), i / 2 ), uSize - 1 );
		if ( ! inFocus( s ) ) continue;
		fcnt ++;
		float zi = cs[ i ] > 0 ? zs[ i ] : nsViewDist( texelFetch( tDepth, s, 0 ).r, uView );
		float taper = clamp( sqrt( uLine.z * uCssPerSample / max( zi, 1e-3 ) / uLine.w ), uTaperMin, 1.0 );
		float w = uLine.y * taper, d = 1e3;
		int reachSteps = int( ceil( w + uKey * taper ) ) + 1;
		for ( int k = 0; k < 8; k ++ ) {
			ivec2 o = dirOf( k );
			for ( int j = 1; j <= 9; j ++ ) {
				if ( j > reachSteps ) break;
				ivec2 q = s + j * o;
				if ( ! inside( q ) ) break;
				if ( ! inFocus( q ) ) { d = min( d, float( j ) * ( k < 4 ? 1.0 : 1.41421356 ) ); break; }
			}
		}
		float lc = clamp( w + 0.5 - d, 0.0, 1.0 );
		fline += lc; fkey += clamp( w + uKey * taper + 0.5 - d, 0.0, 1.0 ) - lc;
	}
	#endif
	if ( cnt == 0 && fcnt == 0 ) discard;
	// the widths taper with the on-screen size of a centimetre at the hidden thing's distance (as the outline's lines do)
	float taper0 = clamp( sqrt( uLine.z * uCssPerSample / max( zNear, 1e-3 ) / uLine.w ), uTaperMin, 1.0 );
	float reach0 = ceil( uLine.x * taper0 + uKey * taper0 ) + 3.0;
	// A thing that gets no fill here (none now, or a body part in front at each of its samples) is left at once when no
	// line can be near: four probes far enough out that a straight edge within the line's reach would cross one. The
	// brain's surface is a ghost under EVERY body in front of it, and
	// its line can only lie where the brain's own picture ends (rimOf), so its probes ask that picture: a pixel next to
	// a body's edge, with the brain going on all round, is left too. Another thing's probes ask the ghost picture.
	bool deep = cnt == n && one;
	if ( one && fcnt == 0 && ( uFill[ min( code, ${T.area} ) ] <= 0.0 || bcnt == 0 ) ) {
		int far = int( ceil( 1.45 * reach0 ) );
		ivec2 qa = s0 + ivec2( far, 0 ), qb = s0 - ivec2( far, 0 ), qc = s0 + ivec2( 0, far ), qd = s0 - ivec2( 0, far );
		if ( inside( qa ) && inside( qb ) && inside( qc ) && inside( qd ) ) {
			if ( code == ${T.brain} ) { if ( brainIs( qa ) && brainIs( qb ) && brainIs( qc ) && brainIs( qd ) ) discard; }
			else if ( deep && ghostAt( qa ) == code && ghostAt( qb ) == code && ghostAt( qc ) == code && ghostAt( qd ) == code ) discard;
		}
	}
	// well inside its ghost (no other sample within the line's reach on two rings): no line here
	deep = deep && ringIs( s0, reach0, code ) && ringIs( s0, max( 2.0, 0.5 * reach0 ), code );
	if ( ! deep ) for ( int i = 0; i < 4; i ++ ) {
		if ( i >= n ) break;
		int c = cs[ i ];
		if ( c == 0 ) continue;
		ivec2 s = min( b + ivec2( i - 2 * ( i / 2 ), i / 2 ), uSize - 1 );
		float taper = clamp( sqrt( uLine.z * uCssPerSample / max( zs[ i ], 1e-3 ) / uLine.w ), uTaperMin, 1.0 );
		float w = uLine.x * taper, d = 1e3;
		int reachSteps = int( ceil( w + uKey * taper ) ) + 1;
		for ( int k = 0; k < 8; k ++ ) {
			// out along this direction to the first sample that is not this ghost; then, once, whether the thing ends there
			ivec2 o = dirOf( k );
			int jEnd = 0, hEnd = 0;
			for ( int j = 1; j <= 9; j ++ ) {
				if ( j > reachSteps ) break;
				ivec2 q = s + j * o;
				if ( ! inside( q ) ) break;
				int hq = ghostAt( q );
				if ( hq != c ) { jEnd = j; hEnd = hq; break; }
			}
			if ( jEnd > 0 && rimOf( s + jEnd * o, hEnd, c ) ) d = min( d, float( jEnd ) * ( k < 4 ? 1.0 : 1.41421356 ) );
		}
		float lc = clamp( w + 0.5 - d, 0.0, 1.0 );
		line += lc; key += clamp( w + uKey * taper + 0.5 - d, 0.0, 1.0 ) - lc;
	}
	float keep = 1.0;
	if ( cnt > 0 ) {
		// The hidden part's narrowest width through this pixel (the four lines through it: across, up, the two slants), from
		// 8 walks out of the pixel's first ghost sample to where it stops being this ghost (stepping out by about half again
		// each time, then halving back three times onto the edge). A thin sliver (a finger tip or a tendon behind a thigh)
		// gets no ghost: it is noise, the limb shows beside it. A pixel with its piece all round it at 0.65 of the width
		// is wide enough in every direction and skips the walks.
		float minW = uThin * uLine.z / max( zNear, 1e-3 );   // samples
		if ( ! ringPiece( s0, 0.65 * minW, code ) ) {
			float reach = 1.4 * minW;
			float dk[ 8 ];
			for ( int k = 0; k < 8; k ++ ) {
				ivec2 o = dirOf( k );
				float len = k < 4 ? 1.0 : 1.41421356;
				float t0 = 0.0, t = 1.0, d = reach;
				for ( int j = 0; j < 12; j ++ ) {
					if ( t > reach ) break;
					ivec2 q = s0 + ivec2( round( vec2( o ) * ( t / len ) ) );
					if ( ! inside( q ) ) { d = t0; break; }
					if ( ! pieceIs( ghostAt( q ), code ) ) {
						float a = t0, bb = t;
						for ( int r = 0; r < 3; r ++ ) {
							float m = 0.5 * ( a + bb );
							if ( pieceIs( ghostAt( s0 + ivec2( round( vec2( o ) * ( m / len ) ) ) ), code ) ) a = m; else bb = m;
						}
						d = 0.5 * ( a + bb );
						break;
					}
					t0 = t; t = max( t + 1.0, t * 1.5 );
				}
				dk[ k ] = d;
			}
			float thick = min( min( dk[ 0 ] + dk[ 1 ], dk[ 2 ] + dk[ 3 ] ), min( dk[ 4 ] + dk[ 7 ], dk[ 5 ] + dk[ 6 ] ) );
			keep = smoothstep( 0.7 * minW, 1.3 * minW, thick );
		}
	}
	float gl = line * keep, gk = max( key * keep, fkey );
	float fill = float( bcnt ) / float( n ) * keep;
	if ( max( gl, fline ) <= 0.0 && fill <= 0.0 && gk <= 0.0 ) discard;
	int outCode = code != 0 ? code : uFocus;
	gl_FragColor = vec4( max( gl, fline ) / float( n ), fill, float( outCode ) / 255.0, 0.5 + 0.5 * gk / float( n ) );
}`;
/* CENSUS PASS (a small grid, one pixel per cell of the picture): which things are SEEN (in front) and which are HIDDEN
 * (a ghost) somewhere in the cell, as two 16-bit masks (bit = min(code, SEE_THINGS.area) - 1; r, g = seen low, high;
 * b, a = hidden low, high), from uGrid x uGrid samples of the cell. Read back (small, never waited for), it says per
 * thing how much of it shows: a limb hidden here and hardly seen anywhere is locked away. */
const CENSUS_FS = `
precision highp float;
precision highp int;
uniform sampler2D tGhost;
uniform ivec2 uSize;
uniform ivec2 uCells;
uniform int uGrid;
${FRONT_GLSL}
void main() {
	ivec2 cell = ivec2( gl_FragCoord.xy );
	vec2 c0 = vec2( cell ) * vec2( uSize ) / vec2( uCells ), cs = vec2( uSize ) / vec2( uCells );
	int seen = 0, hidden = 0;
	bool surface = false, other = false;
	for ( int y = 0; y < 8; y ++ ) {
		if ( y >= uGrid ) break;
		for ( int x = 0; x < 8; x ++ ) {
			if ( x >= uGrid ) break;
			ivec2 q = clamp( ivec2( c0 + ( vec2( x, y ) + 0.5 ) * cs / float( uGrid ) ), ivec2( 0 ), uSize - 1 );
			int f = nsFrontAt( q ), hd = int( texelFetch( tGhost, q, 0 ).r * 255.0 + 0.5 );
			if ( f >= 128 ) f -= 128;
			if ( f > 0 ) seen = seen | ( 1 << ( min( f, ${T.area} ) - 1 ) );
			if ( hd > 0 ) hidden = hidden | ( 1 << ( min( hd, ${T.area} ) - 1 ) );
			if ( int( nsBrainAt( q ).a * 255.0 + 0.5 ) == ${T.brain} ) surface = true; else other = true;
		}
	}
	// (+ 128 in g: the brain's surface ends somewhere in this cell, in its own picture: only there can its ghost have a line)
	gl_FragColor = vec4( float( seen & 255 ), float( seen >> 8 ) + ( surface && other ? 128.0 : 0.0 ), float( hidden & 255 ), float( hidden >> 8 ) ) / 255.0;
}`;
/* THE TILES. The line pass and the composite are not drawn over the whole screen but as the census's own grid of
 * cells, and a cell is drawn only when it (or a cell next to it) holds a ghost that can show: any hidden thing but the
 * brain's surface, or the brain's surface where its own edge is. The vertex shader reads the census picture of this
 * same frame (no read-back), so nothing lags; a cell that is not drawn costs four vertices. (Before: with everything a
 * ghost the two passes ran over every pixel on every frame, 0.8 ms on the graphics card at 3200 x 2000 for the line
 * pass alone, most of it pixels that were then left at the first test.) uAll = 1 draws every cell (the focus line
 * while Shift is held, which also runs round a limb that is not hidden; the QA views). */
const TILE_VS = `
attribute vec2 nsCell;
uniform sampler2D tCensus;
uniform ivec2 uCells;
uniform float uAll;
bool nsBusy( ivec2 c ) {
	if ( c.x < 0 || c.y < 0 || c.x >= uCells.x || c.y >= uCells.y ) return false;
	ivec4 t = ivec4( texelFetch( tCensus, c, 0 ) * 255.0 + 0.5 );
	int hidden = t.b + ( t.a & 31 ) * 256;
	if ( ( hidden & ${~(1 << (T.brain - 1)) & 0x1fff} ) != 0 ) return true;
	return hidden != 0 && t.g >= 128;
}
void main() {
	ivec2 c = ivec2( nsCell + 0.5 );
	bool on = uAll > 0.5;
	for ( int dy = - 1; dy <= 1; dy ++ ) for ( int dx = - 1; dx <= 1; dx ++ ) if ( ! on && nsBusy( c + ivec2( dx, dy ) ) ) on = true;
	gl_Position = on ? vec4( position.xy / vec2( uCells ) * 2.0 - 1.0, 0.0, 1.0 ) : vec4( 2.0, 2.0, 2.0, 1.0 );
}`;
/* COMPOSITE (main scene, after the brain's surface and the bodies' own passes, under the beams, links and arrows):
 * line over keyline over fill, in the one glass look, the fill at that thing's strength (uFillA), premultiplied. */
const COMPOSITE_FS = `
precision highp float;
precision highp int;
uniform sampler2D tInk;
uniform vec3 uCol;
uniform vec3 uFillCol;
uniform float uFillA[ ${T.count} ];
uniform vec3 uKeyCol;
uniform vec2 uAlpha; // line, keyline
uniform float uCodes; // QA only: 1 = each thing's ghost in a colour of its own, strongly filled; 2 / 3 = the brain's picture / the ghost picture as they are
uniform sampler2D tQa;
uniform vec2 uQaScale;
void main() {
	if ( uCodes > 1.5 ) {
		vec4 t = texelFetch( tQa, ivec2( gl_FragCoord.xy * uQaScale ), 0 );
		int code = int( ( uCodes > 2.5 ? t.r : t.a ) * 255.0 + 0.5 );
		if ( code == 0 ) discard;
		gl_FragColor = vec4( 0.7 * ( 0.5 + 0.5 * cos( 6.2831853 * ( float( code ) * 0.381966 + vec3( 0.0, 0.33, 0.67 ) ) ) ), 0.7 );
		return;
	}
	vec4 k = texelFetch( tInk, ivec2( gl_FragCoord.xy ), 0 );
	if ( k.a < 0.25 ) discard;
	int code = int( k.b * 255.0 + 0.5 );
	if ( code <= 0 ) discard;
	float fa = uFillA[ min( code, ${T.area} ) ];
	if ( uCodes > 0.5 ) {
		vec3 c = 0.5 + 0.5 * cos( 6.2831853 * ( float( code ) * 0.381966 + vec3( 0.0, 0.33, 0.67 ) ) );
		float a = max( k.r, fa > 0.0 ? 0.55 * k.g : 0.0 );
		gl_FragColor = vec4( c * a, a );
		return;
	}
	float l = k.r * uAlpha.x, f = k.g * fa, d = clamp( ( k.a - 0.5 ) * 2.0, 0.0, 1.0 ) * uAlpha.y;
	float a = 1.0 - ( 1.0 - l ) * ( 1.0 - d ) * ( 1.0 - f );
	if ( a <= 0.003 ) discard;
	vec3 lc = linearToOutputTexel( vec4( uCol, 1.0 ) ).rgb, fo = linearToOutputTexel( vec4( uFillCol, 1.0 ) ).rgb, ko = linearToOutputTexel( vec4( uKeyCol, 1.0 ) ).rgb;
	gl_FragColor = vec4( l * lc + ( 1.0 - l ) * ( d * ko + ( 1.0 - d ) * f * fo ), a );
}`;

/** Locked-away limbs from a census (pure): `census` = { seen: [...], hidden: [...] } cell counts per ghost code (index
 * 1..8 are read); `prev` = the last answer ([9] booleans). A limb is locked away while it is hidden in at least
 * SEE.lockCells cells and its seen share (seen / (seen + hidden)) is under SEE.lockOn; it stays so until that share
 * rises over SEE.lockOff or it is no longer hidden (so a share near the threshold does not flicker).
 * 19 November 2026: `last` (default 8, the limbs) can be SEE_THINGS.mirrorTrunk to ask the same of the two trunks as
 * well (the answer is then [last + 1] booleans): a trunk that is hidden and hardly seen is filled like such a limb. */
export function seeLockedAway(census, prev = null, o = SEE, last = 8) {
  const out = new Array(last + 1).fill(false);
  if (!census || !Array.isArray(census.seen) || !Array.isArray(census.hidden)) return out;
  for (let c = 1; c <= last; c++) {
    const s = Number(census.seen[c]) || 0, h = Number(census.hidden[c]) || 0;
    if (h < o.lockCells) continue;
    const share = s / (s + h), was = Boolean(prev && prev[c]);
    out[c] = was ? share <= o.lockOff : share < o.lockOn;
  }
  return out;
}
/** The fill strength each thing's ghost goes to (pure; [SEE_THINGS.count] numbers, index = min(code, SEE_THINGS.area)):
 * a limb SEE.fillLow, or SEE.fillAlpha while it is hidden and hardly seen (`locked`: seeLockedAway's answer, with the
 * two trunks: [11] booleans); a trunk the same strong fill while it is hidden and hardly seen (a whole body behind the
 * brain is then one glass figure, limbs and trunk alike), else from nothing to SEE.fillTrunk as its hidden share
 * (hidden / (seen + hidden) cells of the census) goes from SEE.partFrom to SEE.partFull (smoothly, so a share that
 * wanders changes the fill a little, never on and off); the brain's surface nothing; the eyeballs SEE.fillEyes; a group
 * of motor areas SEE.fillArea. */
export function seeFillTargets(census, locked = null, o = SEE) {
  const out = new Array(T.count).fill(0);
  for (let c = 1; c <= 8; c++) out[c] = locked && locked[c] ? o.fillAlpha : o.fillLow;
  for (const c of [T.ownTrunk, T.mirrorTrunk]) {
    const s = census && Array.isArray(census.seen) ? Number(census.seen[c]) || 0 : 0, h = census && Array.isArray(census.hidden) ? Number(census.hidden[c]) || 0 : 0;
    const share = h > 0 ? h / (s + h) : 0, x = Math.min(1, Math.max(0, (share - o.partFrom) / Math.max(1e-6, o.partFull - o.partFrom)));
    out[c] = locked && locked[c] ? o.fillAlpha : o.fillTrunk * x * x * (3 - 2 * x);
  }
  out[T.brain] = 0; out[T.eyes] = o.fillEyes; out[T.area] = o.fillArea;
  return out;
}

/**
 * The ghost pass. createGhostPass({ THREE, renderer, outline, reducedMotion }) wires itself to the outline pass
 * (outline.setAfterId) and returns:
 *  - composite: the mesh to add to the main scene, and afterBrain: whether the scene must draw it after the brain's
 *    surface and the bodies' own late passes, under the beams, links and arrows (true with SEE.rules.brain: a body
 *    behind the brain shows through it). With that rule off it keeps its old place right after the outline's ink, so
 *    the brain covers every ghost it is in front of, as before;
 *  - setBrain({ group, surface, areas, areaOwners, parts }): the brain's things. group: the Object3D whose world matrix
 *    and visibility they follow; surface: a Mesh (its geometry is the brain's whole surface in the group's frame);
 *    areas: a BufferGeometry of every motor area in the group's frame with a float attribute nsCode (a seeAreaCode per
 *    vertex) and, with areaOwners { texture, texels, codes } (the scene's per-fragment owner table, and the code of
 *    each owner it names), a vec2 attribute nsOwn (the strip coordinate and the table's row, row -1 where a triangle
 *    has none); parts: Meshes of the eyeballs and nerves (each followed by its own world matrix). null removes them;
 *  - brainMaterials: the materials that draw them (the scene gives them the living brain's vertex rule), and
 *    touchBrain(): the brain's vertices moved without a matrix change (that rule), so its picture is drawn again;
 *  - frame(): once per frame after outline.render: the occlusion and census answers, the fill strengths (eased), the
 *    composite's visibility, a screen pass when only the focus changed;
 *  - locked(): [9] booleans, the limbs (ghost codes) locked away (filled, taken by the crosshair), or null;
 *  - setFocus(code): the limb (ghost code, 0 = none) that gets a line all round (what Shift would take);
 *  - setEnabled(on), state(), dispose().
 */
export function createGhostPass({ THREE, renderer, outline, enabled = true, reducedMotion = false } = {}) {
  if (!THREE || !renderer || !outline || typeof outline.setAfterId !== 'function') throw new Error('createGhostPass needs THREE, a renderer and the outline pass');
  const ok = typeof THREE.WebGLRenderTarget === 'function' && typeof THREE.ShaderMaterial === 'function' && renderer.capabilities && renderer.capabilities.isWebGL2 !== false;
  const nearest = extra => new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, stencilBuffer: false, ...extra });
  const ghostTarget = ok ? nearest({ depthBuffer: true }) : null;
  const brainTarget = ok ? nearest({ depthBuffer: true }) : null;
  const inkTarget = ok ? nearest({ depthBuffer: false }) : null;
  const censusTarget = ok ? nearest({ depthBuffer: false }) : null;
  const view = new THREE.Vector4(1, 0.01, 100, 1);
  // the rules in force (SEE.rules; QA only: globalThis.__nsSeeRules = { trunk, across, brain } replaces them, to look at
  // and to time each widening by itself)
  const R = { ...SEE.rules };
  const geoUni = { tId: { value: null }, tDepth: { value: null }, tBrain: { value: brainTarget ? brainTarget.texture : null }, uBrain: { value: [SEE.brainStep, 0] }, uView: { value: view },
    uGap: { value: new THREE.Vector2(SEE.gapM, SEE.gapRel) }, uRules: { value: new THREE.Vector3(R.trunk ? 1 : 0, R.across ? 1 : 0, R.brain ? 1 : 0) } };
  // (the bodies' materials clip like the ID pass's: `clipping`, planes from afterId's ctx.clip)
  const geoOf = (vertexShader, uniforms, fragmentShader = GHOST_FS) => new THREE.ShaderMaterial({ uniforms: { ...geoUni, ...uniforms }, vertexShader, fragmentShader, clipping: fragmentShader === GHOST_FS, side: THREE.DoubleSide, depthTest: true, depthWrite: true, blending: THREE.NoBlending, toneMapped: false, fog: false });
  const geoMat = geoOf(OUTLINE_ID_VS, {});
  // 19 November 2026 (performance): the muscles skinned on the graphics card are in the ID pass as a skinned batch (the
  // body's) and as skinned proxies (the left game arm's); they are drawn here with the same vertex shaders.
  const geoSkinBatchMat = geoOf(OUTLINE_SKIN_BATCH_VS, { nsBoneTex: { value: null }, nsHalf: { value: 128 } });
  const geoSkinIdMat = geoOf(OUTLINE_SKIN_ID_VS, { nsId: { value: new THREE.Vector3() } });
  // 19 November 2026: the brain's things. Its picture (surface, areas, small parts), and the small parts as ghosts.
  const picMat = code => new THREE.ShaderMaterial({ uniforms: { uCode: { value: code }, tOwn: { value: null }, uOwnW: { value: 0 }, uOwnCode: { value: new Array(OWNERS).fill(T.area) } }, vertexShader: BRAIN_VS, fragmentShader: BRAIN_FS, side: THREE.DoubleSide, depthTest: true, depthWrite: true, blending: THREE.NoBlending, toneMapped: false, fog: false });
  const picSurfaceMat = picMat(T.brain), picAreaMat = picMat(0), picPartMat = picMat(T.eyes);
  const partGhostMat = geoOf(BRAIN_VS, { uCode: { value: T.eyes } }, PART_FS);
  const behindMat = new THREE.ShaderMaterial({ uniforms: geoUni, vertexShader: SCREEN_VS, fragmentShader: BEHIND_FS, depthTest: true, depthWrite: true, depthFunc: THREE.LessEqualDepth, blending: THREE.NoBlending, toneMapped: false, fog: false });
  const brainMaterials = [picSurfaceMat, picAreaMat, picPartMat, partGhostMat];
  const fillA = seeFillTargets(null, null);
  const inkUni = {
    tGhost: { value: ghostTarget ? ghostTarget.texture : null }, tId: geoUni.tId, tDepth: geoUni.tDepth, tBrain: geoUni.tBrain, uBrain: geoUni.uBrain, uView: geoUni.uView, uGap: geoUni.uGap,
    uSize: { value: [1, 1] }, uSS: { value: 1 }, uFill: { value: fillA },
    uLine: { value: new THREE.Vector4(SEE.lineCss, SEE.focusCss, 1, OUTLINE.taperFullPxCm) }, uTaperMin: { value: SEE.taperMin },
    uCssPerSample: { value: 1 }, uThin: { value: SEE.minWidthCm }, uKey: { value: SEE.keyCss }, uFocus: { value: 0 }
  };
  const screenMat = (fs, uniforms, vertexShader = SCREEN_VS) => new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader: fs, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false, fog: false });
  // the tiles (TILE_VS): the census picture and its grid; uAll = 1 draws every cell
  const tileUni = { tCensus: { value: censusTarget ? censusTarget.texture : null }, uCells: { value: [SEE.censusCells, 1] }, uAll: { value: 0 } };
  const inkMat = screenMat(INK_FS, { ...inkUni, ...tileUni }, TILE_VS), inkFocusMat = screenMat(INK_FS, { ...inkUni, tCensus: tileUni.tCensus, uCells: tileUni.uCells, uAll: { value: 1 } }, TILE_VS);
  inkFocusMat.defines = { NS_FOCUS: 1 };
  const censusUni = { tGhost: inkUni.tGhost, tId: geoUni.tId, tDepth: geoUni.tDepth, tBrain: geoUni.tBrain, uBrain: geoUni.uBrain, uView: geoUni.uView, uGap: geoUni.uGap, uSize: inkUni.uSize, uCells: tileUni.uCells, uGrid: { value: SEE.censusGrid } };
  const censusMat = screenMat(CENSUS_FS, censusUni);
  const v3 = c => new THREE.Vector3(c[0], c[1], c[2]);
  const glass = seeGlassColours();
  const keyCol = new THREE.Color().setRGB(...OUTLINE.colour, THREE.SRGBColorSpace);
  const compMat = new THREE.ShaderMaterial({
    uniforms: { tInk: { value: inkTarget ? inkTarget.texture : null }, uCol: { value: v3(glass.line) }, uFillCol: { value: v3(glass.fill) }, uFillA: { value: fillA },
      uKeyCol: { value: new THREE.Vector3(keyCol.r, keyCol.g, keyCol.b) }, uAlpha: { value: new THREE.Vector2(SEE.lineAlpha, SEE.keyAlpha) }, uCodes: { value: 0 }, tQa: { value: null }, uQaScale: { value: new THREE.Vector2(1, 1) },
      tCensus: tileUni.tCensus, uCells: tileUni.uCells, uAll: { value: 0 } },
    vertexShader: TILE_VS, fragmentShader: COMPOSITE_FS, transparent: true, premultipliedAlpha: true,
    blending: THREE.NormalBlending, depthTest: false, depthWrite: false, toneMapped: false, fog: false
  });
  const quad = new THREE.BufferGeometry();
  quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const screenMesh = (mat, name) => { const m = new THREE.Mesh(quad, mat); m.name = name; m.frustumCulled = false; m.matrixAutoUpdate = false; m.raycast = () => {}; return m; };
  const still = (s, name) => { s.name = name; s.matrixWorldAutoUpdate = false; return s; };
  const sceneOf = (mat, name) => { const s = still(new THREE.Scene(), name); s.add(screenMesh(mat, name)); return s; };
  // the grid of tiles for a census of cw x ch cells: ONE kept, for the size in use (it changes only with the window's
  // shape). 20 November 2026 (from a code review): each size used to be kept until the pass was disposed, so a session
  // of window resizes piled up dead vertex and index buffers on the graphics card; the grid of the size left is now
  // released when the next is made (the caller puts the new one on both meshes before anything is drawn).
  let tileGeo = null, tileKey = '';
  const tilesFor = (cw, ch) => {
    const key = `${cw}x${ch}`;
    if (tileGeo && key === tileKey) return tileGeo;
    const n = cw * ch, pos = new Float32Array(12 * n), cell = new Float32Array(8 * n), idx = new Uint32Array(6 * n);
    for (let j = 0, k = 0; j < ch; j++) for (let i = 0; i < cw; i++, k++) {
      for (let v = 0; v < 4; v++) { pos[12 * k + 3 * v] = i + (v & 1); pos[12 * k + 3 * v + 1] = j + (v >> 1); cell[8 * k + 2 * v] = i; cell[8 * k + 2 * v + 1] = j; }
      idx.set([4 * k, 4 * k + 1, 4 * k + 2, 4 * k + 2, 4 * k + 1, 4 * k + 3], 6 * k);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('nsCell', new THREE.BufferAttribute(cell, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    if (tileGeo) tileGeo.dispose();
    tileGeo = g; tileKey = key;
    return g;
  };
  const inkScene = sceneOf(inkMat, 'ns-see ghost ink pass'), inkMesh = inkScene.children[0], censusScene = sceneOf(censusMat, 'ns-see census pass');
  inkMesh.geometry = tilesFor(SEE.censusCells, 1);
  // drawn into the ghost picture after the bodies, while the brain is in its picture: the brain behind a body part (one
  // triangle), then the brain's small parts
  const behindScene = sceneOf(behindMat, 'ns-see the brain behind a body part');
  const picScene = still(new THREE.Scene(), 'ns-see brain picture (surface, eyeballs and nerves)'), picAreaScene = still(new THREE.Scene(), 'ns-see brain picture (motor areas)');
  const composite = screenMesh(compMat, 'ns-see ghost composite (hidden things drawn over what is in front as light-blue glass; display only)');
  composite.geometry = tilesFor(SEE.censusCells, 1);
  composite.renderOrder = OUTLINE.renderOrder + 1;
  composite.visible = false;
  let on = enabled !== false && ok, drawn = false, last = null, focus = 0, focusDrawn = 0;
  const stats = { frames: 0, inkOnly: 0, ms: 0, census: 0, brainFrames: 0 };
  // Only while something is covered: the bodies' ghost pass is wrapped in an occlusion query (WebGL2, read a frame or
  // two later, never waited for); while the last answer is "nothing" and the brain is not drawn, the screen passes and
  // the composite are skipped.
  const gl = typeof renderer.getContext === 'function' ? renderer.getContext() : null;
  const queries = Boolean(gl && typeof gl.createQuery === 'function' && gl.ANY_SAMPLES_PASSED_CONSERVATIVE !== undefined);
  let pendingQuery = null, bodyGhost = true, inkStale = false;
  // 20 November 2026 (from a code review): the things whose fill was 0 when the line pass last ran (INK_FS leaves out the
  // inside of such a ghost); when one's fill rises with nothing moving, the ink is drawn again (frame())
  const inkZero = new Array(T.count).fill(true);
  // the ID pass's clip planes now on the bodies' ghost materials (afterId)
  let clipPlanes = null;
  // The census: read back after each screen pass while something is covered.
  // (`locked`: the limbs AND the two trunks that are hidden and hardly seen, [11]; the first [9] are the limbs the crosshair takes)
  const LAST = T.mirrorTrunk;
  let censusWant = false, censusBusy = false, censusBuf = null, census = null, locked = new Array(LAST + 1).fill(false), fillTo = fillA.slice();
  // QA only (globalThis.__nsSeeCount = true): after each ghost picture, the whole picture is read back once and counted.
  let counts = null, countBusy = false;
  // QA only (globalThis.__nsSeeGpu = true): the time the graphics card spends on this pass's draws (a timer query round
  // them, read a few frames later, never waited for): the mean and the largest of the answers so far, in ms.
  const gpu = { ext: undefined, pending: null, n: 0, sumMs: 0, maxMs: 0 };
  let lastFrameAt = null;
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  // ---- the brain's things -------------------------------------------------------------------------------------------
  const brain = { group: null, surface: null, areas: null, parts: [], shown: false, stale: true, key: new Float64Array(0) };
  const proxy = (geometry, material, name, scene) => {
    const m = new THREE.Mesh(geometry, material);
    m.name = name; m.matrixAutoUpdate = false; m.matrixWorldAutoUpdate = false; m.frustumCulled = false; m.raycast = () => {};
    scene.add(m);
    return m;
  };
  function setBrain(o) {
    for (const s of [picScene, picAreaScene]) for (const c of s.children.slice()) s.remove(c);
    for (const p of brain.parts) behindScene.remove(p.ghost);
    Object.assign(brain, { group: null, surface: null, areas: null, parts: [], stale: true });
    if (!ok || !o || !o.group || !o.group.matrixWorld) return false;
    brain.group = o.group;
    if (o.surface && o.surface.isMesh && o.surface.geometry) brain.surface = { src: o.surface, pic: proxy(o.surface.geometry, picSurfaceMat, 'ns-see brain surface', picScene) };
    if (o.areas && o.areas.attributes && o.areas.attributes.position && o.areas.attributes.nsCode) brain.areas = { pic: proxy(o.areas, picAreaMat, 'ns-see motor areas', picAreaScene) };
    // the table that says which area owns a fragment of the strip (see BRAIN_FS); without it, whole triangles
    const own = o.areaOwners && o.areaOwners.texture && o.areaOwners.texels > 0 && o.areas && o.areas.attributes && o.areas.attributes.nsOwn ? o.areaOwners : null;
    picAreaMat.uniforms.tOwn.value = own ? own.texture : null; picAreaMat.uniforms.uOwnW.value = own ? own.texels : 0;
    { const c = picAreaMat.uniforms.uOwnCode.value, src = own && own.codes ? own.codes : null; for (let i = 0; i < OWNERS; i++) c[i] = src && i < src.length && src[i] >= T.area ? Math.min(T.maxCode, src[i]) : seeAreaCode(i); }
    for (const src of Array.isArray(o.parts) ? o.parts : []) {
      if (!src || !src.isMesh || !src.geometry) continue;
      brain.parts.push({ src, pic: proxy(src.geometry, picPartMat, `ns-see brain part: ${src.name}`, picScene), ghost: proxy(src.geometry, partGhostMat, `ns-see brain part as a ghost: ${src.name}`, behindScene) });
    }
    brain.key = new Float64Array(32 + 16 * (1 + brain.parts.length)).fill(NaN);
    outline.invalidate();
    return true;
  }
  const visibleChain = o => { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; };
  /** The brain's picture for this camera: drawn again only when the camera, the brain or one of its parts moved (or
   * touchBrain / a new size). Returns whether the brain is in the picture. */
  function drawBrain(ctx) {
    const [w, h] = ctx.size, cam = ctx.camera;
    const want = on && R.brain && Boolean(brain.group) && visibleChain(brain.group) && Boolean(brain.surface || brain.areas || brain.parts.length);
    const bw = Math.ceil(w / SEE.brainStep), bh = Math.ceil(h / SEE.brainStep);
    if (brainTarget.width !== bw || brainTarget.height !== bh) { brainTarget.setSize(bw, bh); brain.stale = true; }
    if (!want) { geoUni.uBrain.value[1] = 0; brain.shown = false; brain.stale = true; return false; }
    geoUni.uBrain.value[1] = 1;
    // what its picture depends on: the camera, the group's matrix, each part's
    const k = brain.key, a = cam.matrixWorldInverse.elements, b = cam.projectionMatrix.elements, gm = brain.group.matrixWorld.elements;
    let moved = brain.stale;
    for (let i = 0; i < 16; i++) { if (k[i] !== a[i]) { k[i] = a[i]; moved = true; } if (k[16 + i] !== b[i]) { k[16 + i] = b[i]; moved = true; } if (k[32 + i] !== gm[i]) { k[32 + i] = gm[i]; moved = true; } }
    brain.parts.forEach((p, n) => { const e = p.src.matrixWorld.elements, at = 48 + 16 * n; for (let i = 0; i < 16; i++) if (k[at + i] !== e[i]) { k[at + i] = e[i]; moved = true; } });
    for (const p of brain.parts) { const v = p.src.visible !== false; if (p.pic.visible !== v) { p.pic.visible = v; moved = true; } p.ghost.visible = v && SEE.eyesGlass !== false; }
    if (brain.surface) { const v = brain.surface.src.visible !== false && visibleChain(brain.surface.src); if (brain.surface.pic.visible !== v) { brain.surface.pic.visible = v; moved = true; } }
    if (!moved) { brain.shown = true; return true; }
    if (brain.surface) { const s = brain.surface; if (s.pic.geometry !== s.src.geometry) s.pic.geometry = s.src.geometry; s.pic.matrixWorld.copy(brain.group.matrixWorld); }
    if (brain.areas) brain.areas.pic.matrixWorld.copy(brain.group.matrixWorld);
    for (const p of brain.parts) { p.pic.matrixWorld.copy(p.src.matrixWorld); p.ghost.matrixWorld.copy(p.src.matrixWorld); }
    const prevAuto = renderer.autoClear;
    try {
      // the surface and the small parts first; then, over a cleared depth, the areas: an area is seen wherever it is the
      // nearest AREA (the main picture cuts the surface away over the strip), whatever fold of the surface lies over it
      renderer.autoClear = true;
      renderer.setRenderTarget(brainTarget); renderer.render(picScene, cam);
      if (brain.areas) { renderer.autoClear = false; renderer.clearDepth(); renderer.render(picAreaScene, cam); }
    } finally { renderer.autoClear = prevAuto; }
    brain.stale = false; brain.shown = true;
    stats.brainFrames++;
    return true;
  }
  function touchBrain() { brain.stale = true; }

  function ink(ctx) {
    inkUni.uSize.value = ctx.size; inkUni.uSS.value = ctx.ss;
    inkUni.uCssPerSample.value = 1 / Math.max(1e-6, ctx.pr * ctx.ss);
    // widths in samples; samples per cm at 1 m (the outline's CSS px per cm at 1 m times the samples per CSS px)
    inkUni.uLine.value.set(SEE.lineCss * ctx.pr * ctx.ss, SEE.focusCss * ctx.pr * ctx.ss, ctx.pxPerCmAt1m * ctx.pr * ctx.ss, OUTLINE.taperFullPxCm);
    inkUni.uKey.value = SEE.keyCss * ctx.pr * ctx.ss;
    inkUni.uFocus.value = focus; focusDrawn = focus;
    for (let c = 1; c < T.count; c++) inkZero[c] = !(fillA[c] > 0);
    inkMesh.material = focus > 0 ? inkFocusMat : inkMat;
    if (inkTarget.width !== ctx.bufW || inkTarget.height !== ctx.bufH) inkTarget.setSize(ctx.bufW, ctx.bufH);
    const cw = SEE.censusCells, ch = Math.max(1, Math.round(cw * ctx.bufH / Math.max(1, ctx.bufW)));
    if (censusTarget.width !== cw || censusTarget.height !== ch) censusTarget.setSize(cw, ch);
    tileUni.uCells.value[0] = cw; tileUni.uCells.value[1] = ch;
    { const g = tilesFor(cw, ch); if (inkMesh.geometry !== g) inkMesh.geometry = g; if (composite.geometry !== g) composite.geometry = g; }
    const prev = renderer.getRenderTarget();
    // the census first: the line pass and the composite draw only the cells it finds a ghost in (TILE_VS)
    renderer.setRenderTarget(censusTarget); renderer.render(censusScene, ctx.camera);
    renderer.setRenderTarget(inkTarget); renderer.render(inkScene, ctx.camera);
    renderer.setRenderTarget(prev);
    censusWant = true;
    if (globalThis.__nsSeeCount === true && !countBusy && typeof renderer.readRenderTargetPixelsAsync === 'function') {
      countBusy = true;
      const w = inkTarget.width, h = inkTarget.height, buf = new Uint8Array(w * h * 4);
      const cssPer = 1 / Math.max(1e-6, ctx.pr); // the boxes in CSS px
      renderer.readRenderTargetPixelsAsync(inkTarget, 0, 0, w, h, buf).then(b => {
        const c = { line: {}, fill: {}, boxes: {} };
        for (let i = 0; i < b.length; i += 4) {
          if (b[i + 3] < 100) continue;
          const k = b[i + 2]; if (!(k >= 1 && k <= T.maxCode)) continue;
          if (b[i] > 25) c.line[k] = (c.line[k] || 0) + 1;
          if (b[i + 1] > 25) c.fill[k] = (c.fill[k] || 0) + 1;
          const px = (i / 4) % w, py = h - 1 - Math.floor(i / 4 / w), bx = c.boxes[k] || (c.boxes[k] = [px, py, px, py]);
          if (b[i] > 25 || b[i + 1] > 25) { bx[0] = Math.min(bx[0], px); bx[1] = Math.min(bx[1], py); bx[2] = Math.max(bx[2], px); bx[3] = Math.max(bx[3], py); }
        }
        for (const k of Object.keys(c.boxes)) c.boxes[k] = c.boxes[k].map(v => Math.round(v * cssPer));
        counts = c;
      }).catch(() => {}).finally(() => { countBusy = false; });
    }
  }
  function afterId(ctx) {
    if (!on || globalThis.__nsSeeOff === true) { drawn = false; return; } // (__nsSeeOff: QA only, to time the game without this pass)
    const t0 = now();
    { const q = globalThis.__nsSeeRules && typeof globalThis.__nsSeeRules === 'object' ? globalThis.__nsSeeRules : SEE.rules;
      if (Boolean(q.trunk) !== R.trunk || Boolean(q.across) !== R.across || Boolean(q.brain) !== R.brain) { R.trunk = Boolean(q.trunk); R.across = Boolean(q.across); R.brain = Boolean(q.brain); geoUni.uRules.value.set(R.trunk ? 1 : 0, R.across ? 1 : 0, R.brain ? 1 : 0); } }
    const [w, h] = ctx.size;
    if (ghostTarget.width !== w || ghostTarget.height !== h) ghostTarget.setSize(w, h);
    // the ID pass's clip box (ns-outline setClip; GHOST_FS): the same planes on the bodies' draw here
    { const c = Array.isArray(ctx.clip) && ctx.clip.length ? ctx.clip : null;
      if (c !== clipPlanes) { clipPlanes = c; for (const m of [geoMat, geoSkinBatchMat, geoSkinIdMat]) { m.clippingPlanes = c; m.clipIntersection = true; m.needsUpdate = true; } } }
    const cam = ctx.camera;
    view.set(1, cam.near, cam.far, cam.isOrthographicCamera ? 0 : 1);
    geoUni.tId.value = ctx.target.texture; geoUni.tDepth.value = ctx.depthTexture;
    const prevAuto = renderer.autoClear;
    let tq = null;
    const part = typeof globalThis.__nsSeeGpuPart === 'string' ? globalThis.__nsSeeGpuPart : 'all'; // QA only: which part is timed
    const tBegin = name => {
      if (name !== part || tq || globalThis.__nsSeeGpu !== true || !gl || gpu.pending) return;
      if (gpu.ext === undefined) { try { gpu.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') || null; } catch { gpu.ext = null; } }
      if (gpu.ext) { try { tq = gl.createQuery(); gl.beginQuery(gpu.ext.TIME_ELAPSED_EXT, tq); } catch { tq = null; } }
    };
    const tEnd = name => { if (name === part && tq) { try { gl.endQuery(gpu.ext.TIME_ELAPSED_EXT); gpu.pending = tq; } catch { gpu.pending = null; } tq = null; } };
    tBegin('all'); tBegin('brain');
    drawBrain(ctx);
    tEnd('brain'); tBegin('bodies');
    // each thing of the ID pass with its own vertex shader and the ghost fragment shader (the batch, the skinned batch,
    // then the skinned proxies over the same depth), then the front pass and the brain's small parts
    const scene = ctx.idScene, sb = ctx.skinBatch || null, sk = ctx.skinScene || null;
    const prevBatch = ctx.batch ? ctx.batch.material : null, prevSb = sb ? sb.material : null, prevSk = sk ? sk.overrideMaterial : null;
    if (ctx.batch) ctx.batch.material = geoMat;
    if (sb) { sb.material = geoSkinBatchMat; geoSkinBatchMat.uniforms.nsBoneTex.value = ctx.skinBatchUniforms.nsBoneTex.value; geoSkinBatchMat.uniforms.nsHalf.value = ctx.skinBatchUniforms.nsHalf.value; }
    if (sk) sk.overrideMaterial = geoSkinIdMat;
    let q = null;
    if (queries && !pendingQuery) { try { q = gl.createQuery(); if (q) gl.beginQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE, q); } catch { q = null; } }
    try {
      renderer.autoClear = true;
      renderer.setRenderTarget(ghostTarget); renderer.render(scene, cam);
      renderer.autoClear = false;
      if (sk) renderer.render(sk, cam);
    } finally {
      if (ctx.batch) ctx.batch.material = prevBatch;
      if (sb) sb.material = prevSb;
      if (sk) sk.overrideMaterial = prevSk;
      if (q) { try { gl.endQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE); pendingQuery = q; } catch { pendingQuery = null; } }
    }
    tEnd('bodies'); tBegin('front');
    try { if (brain.shown) renderer.render(behindScene, cam); } finally { renderer.autoClear = prevAuto; }
    tEnd('front'); tBegin('ink');
    if (bodyGhost || brain.shown || focus) { ink(ctx); inkStale = false; } else inkStale = true;
    tEnd('ink'); tEnd('all');
    last = ctx; drawn = true;
    stats.frames++; stats.ms = now() - t0;
  }
  outline.setAfterId(ok ? afterId : null);

  /** Once per frame, after outline.render. */
  function frame() {
    const t = now(), dt = lastFrameAt === null ? 0 : Math.min(0.25, (t - lastFrameAt) / 1000); lastFrameAt = t;
    if (pendingQuery) {
      try {
        if (gl.getQueryParameter(pendingQuery, gl.QUERY_RESULT_AVAILABLE)) { bodyGhost = Boolean(gl.getQueryParameter(pendingQuery, gl.QUERY_RESULT)); gl.deleteQuery(pendingQuery); pendingQuery = null; }
      } catch { pendingQuery = null; bodyGhost = true; }
    }
    if (gpu.pending) {
      try {
        if (gl.getQueryParameter(gpu.pending, gl.QUERY_RESULT_AVAILABLE)) {
          const ms = gl.getQueryParameter(gpu.pending, gl.QUERY_RESULT) / 1e6;
          if (!gl.getParameter(gpu.ext.GPU_DISJOINT_EXT)) { gpu.n++; gpu.sumMs += ms; gpu.maxMs = Math.max(gpu.maxMs, ms); }
          gl.deleteQuery(gpu.pending); gpu.pending = null;
        }
      } catch { gpu.pending = null; }
    }
    if (globalThis.__nsSeeGpuReset === true) { globalThis.__nsSeeGpuReset = false; gpu.n = 0; gpu.sumMs = 0; gpu.maxMs = 0; }
    // The brain moved since its picture was drawn and the outline pass did not redraw this frame (it follows the brain
    // only through the motor strip's own picture, which an older kind of brain does not have): ask for a redraw.
    if (on && brain.shown && brain.group && brain.key.length >= 48) {
      const e = brain.group.matrixWorld.elements, k = brain.key;
      for (let i = 0; i < 16; i++) if (k[32 + i] !== e[i]) { outline.invalidate(); break; }
    }
    const covered = bodyGhost || brain.shown;
    if (!covered && locked.some(Boolean)) { locked = new Array(LAST + 1).fill(false); fillTo = seeFillTargets(census, locked); }
    // the fill strength of each thing eases to its target, at once under reduced motion
    const k = reducedMotion || !(dt > 0) ? 1 : 1 - Math.exp(-dt / SEE.fillEaseS);
    for (let c = 1; c < T.count; c++) { const target = fillTo[c]; fillA[c] += (target - fillA[c]) * k; if (Math.abs(target - fillA[c]) < 0.004) fillA[c] = target; }
    { // QA only: a colour per thing (true), or the brain's picture (2) or the ghost picture (3) as they are
      const q = globalThis.__nsSeeCodes, u = compMat.uniforms;
      u.uCodes.value = q === true ? 1 : q === 2 || q === 3 ? q : 0;
      if (u.uCodes.value > 1 && last) { const t = q === 2 ? brainTarget : ghostTarget; u.tQa.value = t.texture; u.uQaScale.value.set(t.width / Math.max(1, last.bufW), t.height / Math.max(1, last.bufH)); }
    }
    compMat.uniforms.uAll.value = focusDrawn > 0 || compMat.uniforms.uCodes.value > 1 ? 1 : 0; // every tile: the focus line; the QA pictures
    if (globalThis.__nsSeeDebug === true) { compMat.uniforms.uAlpha.value.set(1, 1); for (let c = 1; c < T.count; c++) fillA[c] = 0.9; } // QA only: drawn strongly
    // A fill that rises from 0 after the ink ran (the census answer comes a frame or two after it: a trunk that became
    // mostly hidden on the last frame that moved): the ink left that ghost's inside out, so it is drawn again now
    // (20 November 2026, from a code review: the trunk stayed hollow until something moved).
    if (!inkStale) for (let c = 1; c < T.count; c++) if (inkZero[c] && fillA[c] > 0) { inkStale = true; break; }
    // (20 November 2026: with the raw look's lines off the outline draws no composite, but its ID picture is still this
    // frame's: idLive)
    composite.visible = on && drawn && (outline.composite.visible === true || outline.idLive === true) && (covered || focus > 0);
    if (!composite.visible || !last) return;
    if (focus !== focusDrawn || inkStale) {
      const prevAuto = renderer.autoClear, prevAlpha = renderer.getClearAlpha(), c = new THREE.Color();
      renderer.getClearColor(c); renderer.setClearColor(0x000000, 0); renderer.autoClear = true;
      try { ink(last); inkStale = false; stats.inkOnly++; } finally { renderer.setClearColor(c, prevAlpha); renderer.autoClear = prevAuto; }
    }
    if (censusWant && covered && !censusBusy && typeof renderer.readRenderTargetPixelsAsync === 'function') {
      const w = censusTarget.width, h = censusTarget.height;
      if (!censusBuf || censusBuf.length !== w * h * 4) censusBuf = new Uint8Array(w * h * 4);
      censusBusy = true; censusWant = false;
      renderer.readRenderTargetPixelsAsync(censusTarget, 0, 0, w, h, censusBuf).then(b => {
        const seen = new Array(T.count).fill(0), hidden = new Array(T.count).fill(0);
        for (let i = 0; i < b.length; i += 4) {
          const s = (b[i] | (b[i + 1] << 8)) & 0x1fff, hd = (b[i + 2] | (b[i + 3] << 8)) & 0x1fff;
          if (!s && !hd) continue;
          for (let c = 1; c < T.count; c++) { const bit = 1 << (c - 1); if (s & bit) seen[c]++; if (hd & bit) hidden[c]++; }
        }
        census = { seen, hidden };
        locked = globalThis.__nsSeeLockAll === true ? hidden.slice(0, LAST + 1).map((h, c) => c > 0 && h > 0) : seeLockedAway(census, locked, SEE, LAST); // QA only: every hidden limb
        fillTo = seeFillTargets(census, locked);
        stats.census++;
      }).catch(() => {}).finally(() => { censusBusy = false; });
    }
  }
  function setFocus(code) { focus = Number.isInteger(code) && code >= 1 && code <= 8 ? code : 0; }
  function setEnabled(v) { on = v !== false && ok; if (!on) composite.visible = false; outline.invalidate(); return on; }
  function state() {
    return { supported: ok, enabled: on, drawn, shown: composite.visible, covered: bodyGhost || brain.shown, queries, frames: stats.frames, focusOnlyFrames: stats.inkOnly, censusReads: stats.census,
      cpuMs: Math.round(stats.ms * 100) / 100, focus, locked: locked.slice(0, 9).map((v, c) => (v ? c : 0)).filter(Boolean), hardlySeen: locked.map((v, c) => (v ? c : 0)).filter(Boolean), census, counts,
      fill: fillA.map(v => Math.round(v * 1000) / 1000), rules: { ...R },
      brain: { set: Boolean(brain.group), shown: brain.shown, surface: Boolean(brain.surface), areas: Boolean(brain.areas), parts: brain.parts.length, pictures: stats.brainFrames },
      gpu: gpu.n ? { samples: gpu.n, meanMs: Math.round(gpu.sumMs / gpu.n * 100) / 100, maxMs: Math.round(gpu.maxMs * 100) / 100 } : null,
      target: ghostTarget ? [ghostTarget.width, ghostTarget.height] : null, tiles: tileKey, clipped: Boolean(clipPlanes) };
  }
  function dispose() {
    outline.setAfterId(null);
    if (pendingQuery) { try { gl.deleteQuery(pendingQuery); } catch { /* lost context */ } pendingQuery = null; }
    for (const t of [ghostTarget, brainTarget, inkTarget, censusTarget]) if (t) t.dispose();
    for (const m of [geoMat, geoSkinBatchMat, geoSkinIdMat, picSurfaceMat, picAreaMat, picPartMat, partGhostMat, behindMat, inkMat, inkFocusMat, censusMat, compMat]) m.dispose();
    quad.dispose(); if (tileGeo) tileGeo.dispose(); tileGeo = null; tileKey = '';
  }
  return { composite, afterBrain: SEE.rules.brain === true, frame, locked: () => (on && composite.visible ? locked.slice(0, 9) : null), setFocus, setEnabled, setBrain, touchBrain, brainMaterials, state, dispose, get enabled() { return on; } };
}
