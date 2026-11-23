/** NeuroSurge scene: the GLOW of the motor strip that needs no extra pass (21 November 2026).
 *
 * The owner, 21 November 2026: "The glow needs to be fixed, and the glow for the black parts of the motor strip also
 * need to be fixed. Right now, there's essentially no glow, and it's too much before as well." Message 208: "The black
 * motor parts should have some edge glow." Still standing: Message 2 ("an optogenetic glow activation but with
 * different colors/shades for each are"), Message 159 ("let's make brain activation almost bright white"), Message 203
 * ("as bright as possible"), and the three times it was too much (Messages 133, 170, 198).
 *
 * What was wrong. The only thing that spread light beyond a lit block was the full-screen bloom pass, and that pass is
 * the first thing the automatic picture quality drops (ns-scene-three HDR_BLOOM.offFromLevel 1): on a large or slow
 * display every glow ended at white, a flat white patch for 0.4 s, with its colour gone (AREA_LOOK.areaWhite 1). An
 * area under the look had only a weak light multiplied by its own colour: on an area tried before about what an untried
 * area shows at rest, on a black block nothing.
 *
 * What the player sees now, the same at every picture quality level:
 *  - THE HALO (AREA_HALO): a pool of light in the block's own glow colour on the surface round it (the neighbouring
 *    blocks and the brain tissue beside the strip), strongest at the block's edge and gone about one block width
 *    further out. It is worked out in the materials that are drawn anyway (the cortex and the areas), from the
 *    distance to the block's own shape (a line through the middle of the band it is, over the crown and down both
 *    banks, and the block's half width), so it lies on the surfaces, behind the bodies in front of them, costs a few
 *    lines of shader only while something glows, and does not depend on the bloom. The look gives the block under it
 *    `look` of the strength a contraction gives.
 *  - THE LIT BLOCK (AREA_LIT): white-hot in its middle (Messages 159, 203) with its own vivid colour along its borders
 *    and down its banks, so one glance tells which colour is on.
 *  - THE BLACK BLOCKS (ABYSS_EDGE): a quiet glow along the inside of their borders at rest, which brightens under the
 *    look; they move nothing, so they never flare white (areaFlares).
 *
 * Pure: numbers, typed arrays and shader strings; nothing imports 'three' or touches the page. Everything here is a
 * display rule for a simulated teaching picture: no light, current or activity is measured or implied.
 */

const glslFloat = x => (Number.isInteger(x) ? `${x}.0` : `${x}`);
const srgbToLinear = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** The halo (display choices).
 *  slots: how many areas can throw a halo at once (the looked-at area, the lit one, both hands' and both feet's areas
 *    of a Space grip); with more, the weakest are left out.
 *  lit / look / held: the strength of the halo of a movement that is switched on (x the area's glow strength, so it
 *    rises and ends with the 0.4 s of the contraction: nothing of it stays on the way back), of the area the look
 *    rests on (steady; it starts no movement, no beam and no muscle light), and of an area lit by a Space grip while
 *    it holds.
 *  easeS: the look's halo comes and goes over this time (no pulse; at once under prefers-reduced-motion). The lit
 *    halo is not eased here: it follows the area's own display level, which has its own short rise and fade.
 *  crownMm / bankMm / bankFrom / shoulder / middle / maxHalfMm: the block's shape (haloShape): its crown is its part
 *    up to crownMm of relief depth, a bank ends between bankFrom x bankMm and bankMm of depth (what is seen of it;
 *    deeper, the mesh closes under the surface and would pull the shape into the brain); the crown's two shoulders
 *    are its points in the outer `shoulder` share of its span on each side, its middle those in the middle
 *    `middle` share; the half width is never over maxHalfMm, and a block's width is held between fitLo and fitHi
 *    of what its run of the strip coordinate gives at the strip's own scale (haloFitWidths).
 *  reachWidths / reachMinMm / reachMaxMm: how far past the block's edge the pool reaches before it is gone:
 *    reachWidths block widths, never under reachMinMm (a 3 mm block still gets a pool that is seen) nor over
 *    reachMaxMm. The falloff is (1 - d)^2, so the pool is at a quarter at half the reach: what the eye takes for the
 *    pool is about one block width. (reachMaxMm 16 at first: the look's pool of the wide neck block lay over four of
 *    the narrow finger blocks beside it and turned them from teal to lilac for as long as the look rested there.)
 *  tissue: on the cortex. mix: how far the tissue's colour moves to the halo's colour at the block's edge (x the
 *    strength); gain / lift: the tissue's own light and shade x gain + lift carries that colour (the folds stay); add:
 *    light of the halo's colour added on top, so the pool also shows in the shade of a fold; the result is cut at
 *    display white (haloTissueInto is the same rule in numbers); grazeLo / grazeHi / grazeKeep: where the surface is
 *    seen edge-on the pool keeps only grazeKeep (it smeared into a long stain there).
 *    (22 November 2026, an independent check: in a shadowed fold beside the gold hand block the pool read as a dull
 *    olive stain, not light: the tissue's colour was replaced by the glow's but kept its darkness. mix 0.85 -> 0.6,
 *    add 0.1 -> 0.2: less of the dark replacement, more light of the colour.)
 *  strip: on the neighbouring blocks. add: light of the halo's colour added (x the strength x the falloff): their own
 *    colour stays readable under it (at 0.8 the cyan hand blocks beside a lit pink neck block read lilac). look /
 *    lookReachMm: the share of the LOOK's part they take, and only within lookReachMm past the block's edge (the lit
 *    part has the full reach). (22 November 2026, the check: with the look resting on the wide neck block the cyan
 *    thumb and finger blocks beside it turned violet for as long as the look stayed, the look's part at the full reach;
 *    look 1 -> 0; then 0.6 within 1.5 mm, see below.) The gaps between the blocks and the black blocks take none.
 * Tried and dropped: the halo as more slots of the tissue bloom (ns-brain-live BRAIN_LIVE.bloom): its slots also carry
 * the swell of the vertices, a disc, and ease out over 0.8 s, so the tissue stayed tinted long after the contraction
 * (a browser hunt saw it "turn lilac and fade only slowly"); and the tint as added light only: on the pale cortex it
 * clipped to a near-white stain without the colour. */
const LOOK_SET = 0.8, TISSUE_ADD = 0.3;
export const AREA_HALO = Object.freeze({
  on: true, slots: 6,
  // (22 November 2026, the check: with the look alone the pool showed only near the block's edge, +2 to +8 of 255 in a
  // band round it; the owner's complaint was "essentially no glow". look 0.4 -> 0.55, now that the neighbouring blocks
  // take none of it. A second check: still +1 to +5 of 255 in the band 28 to 70 px round the crosshair, only the block
  // itself brighter; the lead: a glow seen at a glance, at normal size. look 0.55 -> LOOK_SET below.)
  lit: 1, look: LOOK_SET, held: 0.4, easeS: 0.15,
  crownMm: 3, bankMm: 10, bankFrom: 0.6, shoulder: 0.15, middle: 0.3, maxHalfMm: 8, fitLo: 0.7, fitHi: 1.4, reachWidths: 2, reachMinMm: 9, reachMaxMm: 10,
  // (tissue.add 0.2 -> TISSUE_ADD below, with the look, 22 November 2026, the second check)
  tissue: Object.freeze({ mix: 0.6, gain: 1.12, lift: 0.12, add: TISSUE_ADD, grazeLo: 0.12, grazeHi: 0.45, grazeKeep: 0.35 }),
  // (22 November 2026, after the second check: with look 0.8 the pool showed where tissue lies beside a block (the
  // gold hand block), but round a block among blocks (the elbow) the tissue is far and nothing changed, +1 of 255.
  // look 0 -> 0.6 with lookReachMm 1.5: the neighbours take the look's light only in a band 1.5 mm past the block's
  // edge, a glow over the gap that leaves the rest of each neighbour its own colour; the lit part keeps the full reach.)
  strip: Object.freeze({ add: 0.45, look: 0.6, lookReachMm: 1.5 })
});

/** The lit block (display choices). Its middle stays white-hot (ns-colors AREA_LOOK.areaWhite 1); toward its borders
 * along the strip (rimCss CSS pixels in, at most rimShare of the block's width from each side; the outer rimFull of
 * that is the colour whole, the rest runs into the white) and down its banks (from reliefLoMm to reliefHiMm of relief
 * depth) its light is the area's own vivid colour x rimGain, so the white core sits in a rim of the colour that is
 * on. rimGain keeps the brightest channel a little above display white (the rim is as bright as the screen shows and
 * its colour is whole). (rimFull 0: the colour showed in the border's last pixel only, the rest a pale wash.) */
export const AREA_LIT = Object.freeze({ on: true, rimCss: 5, rimShare: 0.34, rimFull: 0.4, rimGain: 1.15, reliefLoMm: 1.5, reliefHiMm: 5 });

/** The look's own light on the block under it (display choices): while the look rests on an area it shows its full
 * colour and its full self-light whether it was tried before or not (unvisit: the "visited" dimming is lifted for as
 * long as the look is on it and comes back when the look leaves), plus the halo at AREA_HALO.look. */
export const LOOK_GLOW = Object.freeze({ unvisit: true });

/** The black blocks' edge glow (the owner, Message 208: "The black motor parts should have some edge glow."). The
 * strip's in-between areas are drawn in the abyss's black (Message 206), with a black gap round them: they read as
 * holes. Each now carries a soft glow along the INSIDE of its borders: brightest at the inner edge of its black border
 * and gone `css` CSS pixels in (a falloff (1 - t)^falloffPower), constant in screen pixels, in one cool pale colour on both
 * halves of the brain, at `rest` of that colour: plainly there, yet quieter than any coloured block. Under the look it
 * brightens (lookCss wide, `look` of the colour) and the block throws the look's halo in the same cool pale colour.
 * Its borders are the two ends of its run along the strip (the gap between blocks: exact, from the strip coordinate)
 * and, with `face` above 0, across the strip the gyrus's own outline as seen (where the surface turns away from the
 * eye: faceLo .. faceHi of its facing, at most the same width, x face). share: the glow takes at most this share of the block's width from each
 * side, so a narrow block keeps a black middle. colour: sRGB 0..255. halo: the share of the look's halo strength a
 * black block throws (its colour is pale, so the same strength lightened its neighbours far more than a coloured
 * block's halo does: measured +30 to +55 of 255 in the ring round it at the full strength).
 * It is NOT activity: it never changes when another area is switched on, lit or pressed (it is added after the keys'
 * press and focus rules), it does not flare, and it changes nothing in what is picked. on: false takes it away.
 * (The draft of 21 November read the outline pass's ink picture with 40 samples a fragment and a distance field per
 * block; it was never run and is not used: the area shader already has both distances.) */
// 22 November 2026 (an independent check: at rest the edge read as a thin steel-grey line with a streak along the lower
// bank, and under the look the white hover frame made it a hard white outline; the owner, Message 146: "much darker
// blacks instead of ugly grays"): it reads as LIGHT now. colour 150, 170, 205 (a grey-blue) -> 120, 160, 235 (a cool
// light blue); rest 0.5 -> 0.6; css 4 -> 6 and lookCss 7 -> 10 (a softer, longer falloff inward); face 1 -> 0: the
// glow along the gyrus's outline as seen (where the surface turns from the eye) is off, it made the streak on the
// coarse bank (faceLo / faceHi are kept for it); frame: under the look the block's frame is drawn in this colour,
// framePx CSS pixels wide, in place of the white hover frame (2.8 px).
// (22 November 2026, a second check: at rest it still read as a thin dark-blue line, its peak 66, 89, 133, darker than the
// pink beside it: the brightest part of the squared falloff lay under the ink and the gap's cover, and what showed began
// 2 to 3 px in at a quarter to under half. rest 0.6 -> 0.9, css 6 -> 9, lookCss 10 -> 13, and the falloff LINEAR
// (falloffPower 2 -> 1), so the light shows past the cover; share 0.38 keeps a black middle.)
export const ABYSS_EDGE = Object.freeze({ on: true, colour: Object.freeze([120, 160, 235]), rest: 0.9, look: 1, css: 9, lookCss: 13, falloffPower: 1, share: 0.38, face: 0, faceLo: 0.08, faceHi: 0.3, halo: 0.6, framePx: 1.4 });
/** ABYSS_EDGE.colour in linear light. Pure. */
export function abyssEdgeLinear(o = ABYSS_EDGE) { return o.colour.map(c => srgbToLinear(c / 255)); }

/** Whether an area can FLARE (turn white-hot while it is switched on). A black block (an in-between area: the game
 * maps no movement to it) cannot: it has nothing to contract, so a look gives it the look's soft glow only, with no
 * white fill, no one-second flash and no relight at each small look movement. NO_FLARE.noMovement extends the rule to
 * every area without a movement. (22 November 2026, the lead, after the check: the tongue areas lit for about a second
 * on a click, violet with a white core, and could relight at small look movements: noMovement false -> true. They now
 * glow in their own colour under the look like any block, take the click's key press, and keep their mark; their card
 * says so.) Pure. */
export const NO_FLARE = Object.freeze({ scan: true, noMovement: true });
export function areaFlares(region, scan = false, o = NO_FLARE) {
  if (scan && o.scan) return false;
  if (o.noMovement && !(region && Array.isArray(region.actions) && region.actions.length > 0)) return false;
  return true;
}
/** The activity an area is DRAWN with: its own, or 0 when it cannot flare. Pure. */
export function shownActivity(activity, region, scan = false, o = NO_FLARE) {
  return areaFlares(region, scan, o) && Number.isFinite(activity) ? activity : 0;
}

/** When a key is PRESSED (ns-brain-ink BRAIN_KEYS press: it darkens and a dark frame closes in for 0.2 s). The scene
 * presses a key at each new activation count. A look counts its activation 0.5 s after it started (ns-actions
 * GAZE_DWELL.markS), when the 0.4 s of its light has just ended: the press then came between the lit block and the
 * look's glow, a dark dip of about 0.1 s at the end of every activation (measured by an independent check, 22 November
 * 2026: the block's middle 221 lit, 99 pressed, 170 under the look), one blink per activation; the owner: "The game
 * currently physically hurts to look at with your eyes" (Message 133). A count that comes less than quietS after the
 * area's light ended presses nothing, so the light falls from lit to the look's glow without a dip; a click (counted at
 * once) still presses its key. Pure: countRose, the area is lit now, seconds since its light last ended. */
// (22 November 2026, a second check: the time alone could not tell the look's count from a click's. A click late in its
// frame, 0.1 to 0.3 s after the light ended, lost its press in 4 of 20 frame phases at 60 frames a second and 11 of 20
// at 144 (the area's light rises a frame after its count); and an area that never lights (a black block, the tongue)
// still pressed at the look's count, a 5-frame dip half a second into the look. bySource: the key is pressed when the
// count rose AND the activity marked a CLICK on this area in the same step (ns-actions stepGated marks, source 'click':
// a click or a number key); never for the look's count. The time rule stays for an app that hands no marks.)
export const KEY_PRESS = Object.freeze({ bySource: true, quietS: 0.3 });
/** clicked: whether a click was marked on this area in this step (clickedArea), or null when the app hands no marks. */
export function keyPressed(countRose, lit, sinceLitS, clicked = null, o = KEY_PRESS) {
  if (!countRose) return false;
  if (o.bySource && clicked !== null && clicked !== undefined) return clicked === true;
  if (lit) return true;
  return !(Number.isFinite(sinceLitS) && sinceLitS >= 0 && sinceLitS < o.quietS);
}
/** Whether the step's activation marks (ns-actions stepGated: [{ regionId, source, ... }]) hold a click on `regionId`. Pure. */
export function clickedArea(marks, regionId) {
  if (!Array.isArray(marks)) return false;
  for (const m of marks) if (m && m.source === 'click' && m.regionId === regionId) return true;
  return false;
}

/** A click on an area that does not flare (a black block, the tongue: CLICK_GLOW). It used to light white for a second;
 * with no flare a click showed only the key's press, and a player could think it did not register (a second check,
 * 22 November 2026). Now it gives the area's halo a soft rise and fall in the area's own colour (a black block: its edge
 * glow's light blue) for the `s` seconds a contraction lasts, at `lit` of a contraction's halo, with no white core and
 * no flare; only a click starts it (the activity's click mark), so small look movements relight nothing. The lit part
 * of haloParts takes it (the neighbouring blocks and the tissue round the area). Under reduced motion: steady for `s`. */
export const CLICK_GLOW = Object.freeze({ on: true, lit: 0.5, s: 0.4 });
/** The click glow `ageS` seconds after the click: lit x sin(pi age / s) inside 0..s (steady lit under reduced motion), else 0. Pure. */
export function clickGlow(ageS, reduced = false, o = CLICK_GLOW) {
  if (!o.on || !(ageS >= 0 && ageS < o.s)) return 0;
  return reduced ? o.lit : o.lit * Math.sin(Math.PI * ageS / o.s);
}

/** The two parts of an area's halo (pure): { lit, look } in 0..1. glow: the area's glow strength now (0..1; ns-colors
 * glowIntensity of the activity it is drawn with); looked: the look rests on it; held: it is lit by a Space grip;
 * posture: its glow only shows a held posture (the neck while the head is turned: a calm background light, no halo);
 * scan: a black block (never a lit part of its own; its look part is ABYSS_EDGE.halo of the look's); click: the click
 * glow of an area that does not flare (clickGlow), taken as a lit part. The halo's strength is the larger of the two;
 * `look` is eased by stepHalo, `lit` is used as given. */
export function haloParts({ glow = 0, looked = false, held = false, posture = false, scan = false, click = 0 } = {}, out = { lit: 0, look: 0 }, o = AREA_HALO, edge = ABYSS_EDGE) {
  const g = Number.isFinite(glow) ? Math.min(1, Math.max(0, glow)) : 0;
  out.lit = Math.max(posture || scan ? 0 : g * (held ? o.held : o.lit), Number.isFinite(click) ? Math.min(1, Math.max(0, click)) : 0);
  out.look = looked ? o.look * (scan ? edge.halo : 1) : 0;
  return out;
}

/** Whose colour the whole brain's faint tint takes (the owner, Message 177: "have the whole brain light up slightly,
 * faintly, with whatever color area is being picked"), pure: { id, share } written into `out`. litId / litLevel: the
 * area of the strongest link that draws a line (an area in its contraction) and its level; lookId: the area the look
 * rests on; lookShare: the tint's share for a look (ns-scene-three BRAIN_PICK_TINT.look; 0 = a look gives none). A
 * contraction comes first (share = its level / 0.6, at most 1); else the look, for as long as it rests there. */
export function pickTintWant(litId, litLevel, lookId, lookShare = 1, out = { id: null, share: 0 }) {
  if (litId) { out.id = litId; out.share = Math.min(1, Math.max(0, (Number.isFinite(litLevel) ? litLevel : 0) / 0.6)); }
  else if (lookId && lookShare > 0) { out.id = lookId; out.share = Math.min(1, lookShare); }
  else { out.id = null; out.share = 0; }
  return out;
}

/* ------------------------------------------------------------------ the block's shape */

/** Sample points of every block of the strip (pure). parts: [{ positions (xyz, source mm), indices, s (strip
 * coordinate per vertex), depth (relief depth per vertex, mm; optional), row }]; rows: per row the runs
 * [{ lo, hi, owner }] of the strip coordinate (ns-scene-three ownerRuns: what the area shader draws). Every triangle
 * gives four points (its corners and its middle); each goes to the owner of the run its strip
 * coordinate lies in. Returns Map(owner -> { pts: number[] (xyz), depth: number[], s: number[] }). */
export function blockSamplePoints(parts, rows) {
  const out = new Map();
  const W = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1 / 3, 1 / 3, 1 / 3]];
  for (const part of parts || []) {
    const P = part && part.positions, I = part && part.indices, S = part && part.s, D = part && part.depth, runs = part && rows ? rows[part.row] : null;
    if (!P || !I || !S || !Array.isArray(runs) || !runs.length) continue;
    for (let t = 0; t + 2 < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      for (const w of W) {
        const s = w[0] * S[a] + w[1] * S[b] + w[2] * S[c];
        let lo = 0, hi = runs.length - 1;
        while (lo < hi) { const m = (lo + hi) >> 1; if (s >= runs[m].hi) lo = m + 1; else hi = m; }
        const run = runs[lo];
        if (!run || run.owner === null || run.owner === undefined || s < run.lo || s > run.hi) continue;
        let e = out.get(run.owner);
        if (!e) { e = { pts: [], depth: [], s: [] }; out.set(run.owner, e); }
        e.pts.push(w[0] * P[3 * a] + w[1] * P[3 * b] + w[2] * P[3 * c], w[0] * P[3 * a + 1] + w[1] * P[3 * b + 1] + w[2] * P[3 * c + 1], w[0] * P[3 * a + 2] + w[1] * P[3 * b + 2] + w[2] * P[3 * c + 2]);
        e.depth.push(D ? w[0] * D[a] + w[1] * D[b] + w[2] * D[c] : 0);
        e.s.push(s);
      }
    }
  }
  return out;
}

// the largest principal direction of a 3x3 symmetric matrix (xx, xy, xz, yy, yz, zz) by power iteration (pure)
function mainAxis(m, out) {
  let x = m[0] >= m[3] && m[0] >= m[5] ? 1 : 0, y = m[3] > m[0] && m[3] >= m[5] ? 1 : 0, z = x + y === 0 ? 1 : 0;
  x += 0.31; y += 0.17; z += 0.23; // (never exactly across the main direction)
  for (let i = 0; i < 48; i++) {
    const nx = m[0] * x + m[1] * y + m[2] * z, ny = m[1] * x + m[3] * y + m[4] * z, nz = m[2] * x + m[4] * y + m[5] * z, l = Math.hypot(nx, ny, nz);
    if (!(l > 1e-12)) break;
    x = nx / l; y = ny / l; z = nz / l;
  }
  const l = Math.hypot(x, y, z) || 1;
  out[0] = x / l; out[1] = y / l; out[2] = z / l;
  return out;
}
const unit = v => { const l = Math.hypot(v[0], v[1], v[2]); if (!(l > 1e-9)) return false; v[0] /= l; v[1] /= l; v[2] /= l; return true; };
// how a value changes with the position over a set of points: the least-squares gradient g of val ~ g . (p - centre),
// a little damped across the directions the points do not spread in (they lie on a surface). Pure.
function gradientOf(pts, list, val, out) {
  const n = list.length;
  let cx = 0, cy = 0, cz = 0, vm = 0;
  for (const i of list) { cx += pts[3 * i] / n; cy += pts[3 * i + 1] / n; cz += pts[3 * i + 2] / n; vm += val[i] / n; }
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0, bx = 0, by = 0, bz = 0;
  for (const i of list) {
    const x = pts[3 * i] - cx, y = pts[3 * i + 1] - cy, z = pts[3 * i + 2] - cz, v = val[i] - vm;
    xx += x * x; xy += x * y; xz += x * z; yy += y * y; yz += y * z; zz += z * z; bx += v * x; by += v * y; bz += v * z;
  }
  const lam = 0.02 * (xx + yy + zz) / 3 + 1e-9;
  xx += lam; yy += lam; zz += lam;
  const det = xx * (yy * zz - yz * yz) - xy * (xy * zz - yz * xz) + xz * (xy * yz - yy * xz);
  if (!(Math.abs(det) > 1e-18)) { out[0] = out[1] = out[2] = 0; return out; }
  out[0] = (bx * (yy * zz - yz * yz) - xy * (by * zz - yz * bz) + xz * (by * yz - yy * bz)) / det;
  out[1] = (xx * (by * zz - yz * bz) - bx * (xy * zz - yz * xz) + xz * (xy * bz - by * xz)) / det;
  out[2] = (xx * (yy * bz - by * yz) - xy * (xy * bz - by * xz) + bx * (xy * yz - yy * xz)) / det;
  return out;
}

/** The shape that stands for a block in the halo (pure): { p: [p0 .. p4] (each [x, y, z], source mm), r, reach, width,
 * length, n, kind }. A block is a band ACROSS the gyrus: over the crown and down both banks, often bent like a V on
 * the crown. The shape is the line p0 .. p4 through the middle of the band (the end of one bank, one shoulder of the
 * crown, the crown's middle, the other shoulder, the end of the other bank) with the radius r = half the block's
 * width along the strip, so the halo starts at the block's own edges all the way round.
 * pts: the block's points (flat xyz); depth: their relief depth (mm, 0 on the crown; optional); s: their strip
 * coordinate (optional). With both, the block's own directions come from them: ALONG the strip (the way the strip
 * coordinate rises over the crown points: its least-squares gradient), INTO the brain (the way the depth rises) and
 * ACROSS the gyrus (the third). Of the crown points (depth <= o.crownMm), those in the outer o.shoulder of the
 * crown's span on each side give the two shoulders, those in its middle o.middle the crown's middle, each as the
 * middle of its own points (so a bent band is followed); a bank's end is the middle of that side's points between
 * o.bankFrom and 1 of o.bankMm of depth (the seen part of a bank; deeper, the mesh closes under the surface). The
 * width is the block's run of the strip coordinate over the gradient's size, the middle one of the three crown
 * groups' (kind 'band'; `run`: that run, for haloFitWidths).
 * Without depth and strip coordinate (or when the points do not say): one segment along the main direction of the
 * points' spread, shortened by the half width at each end (kind 'segment').
 * reach: how far past the shape the halo goes (AREA_HALO.reach*). null without three points. */
export function haloShape(pts, depth = null, s = null, o = AREA_HALO) {
  const n = pts ? Math.floor(pts.length / 3) : 0;
  if (n < 3) return null;
  const hasD = Boolean(depth && depth.length === n), hasS = Boolean(s && s.length === n);
  let crown = [];
  if (hasD) {
    for (let i = 0; i < n; i++) if (depth[i] <= o.crownMm) crown.push(i);
    if (crown.length < 6) crown = Array.from({ length: n }, (_, i) => i).sort((p, q) => depth[p] - depth[q]).slice(0, Math.max(3, Math.ceil(n / 3)));
  } else crown = Array.from({ length: n }, (_, i) => i);
  const nc = crown.length;
  const C = [0, 0, 0];
  for (const i of crown) { C[0] += pts[3 * i] / nc; C[1] += pts[3 * i + 1] / nc; C[2] += pts[3 * i + 2] / nc; }
  const q = (a, f) => a[Math.min(a.length - 1, Math.max(0, Math.round(f * (a.length - 1))))];
  const reachOf = width => Math.min(o.reachMaxMm, Math.max(o.reachMinMm, o.reachWidths * width));
  const dist = (u, v) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
  if (hasD && hasS && nc >= 12) {
    const along = gradientOf(pts, crown, s, [0, 0, 0]);
    const capped = new Float64Array(n);
    for (let i = 0; i < n; i++) capped[i] = Math.min(depth[i], o.bankMm);
    const into = gradientOf(pts, Array.from({ length: n }, (_, i) => i), capped, [0, 0, 0]);
    if (unit(along) && unit(into)) {
      const across = [along[1] * into[2] - along[2] * into[1], along[2] * into[0] - along[0] * into[2], along[0] * into[1] - along[1] * into[0]];
      if (unit(across)) {
        const xOf = i => (pts[3 * i] - C[0]) * across[0] + (pts[3 * i + 1] - C[1]) * across[1] + (pts[3 * i + 2] - C[2]) * across[2];
        const meanOf = list => { const m = [0, 0, 0]; for (const i of list) { m[0] += pts[3 * i] / list.length; m[1] += pts[3 * i + 1] / list.length; m[2] += pts[3 * i + 2] / list.length; } return m; };
        // the crown's points in three groups by where they lie across the gyrus (by place, not by count: the mesh's
        // small triangles give many points): the two shoulders and the middle; never fewer than three points each
        const byX = crown.slice().sort((u, v) => xOf(u) - xOf(v)), xs = byX.map(xOf);
        const x0 = q(xs, 0.05), x1 = q(xs, 0.95), span = Math.max(x1 - x0, 1e-6), xm = (x0 + x1) / 2;
        let k0 = 0, k2 = 0;
        while (k0 < nc && xs[k0] <= x0 + o.shoulder * span) k0++;
        while (k2 < nc && xs[nc - 1 - k2] >= x1 - o.shoulder * span) k2++;
        k0 = Math.min(nc, Math.max(3, k0)); k2 = Math.min(nc, Math.max(3, k2));
        let ma = 0, mb = nc;
        while (ma < nc && xs[ma] < xm - 0.5 * o.middle * span) ma++;
        while (mb > ma && xs[mb - 1] > xm + 0.5 * o.middle * span) mb--;
        while (mb - ma < 3 && (ma > 0 || mb < nc)) { if (ma > 0) ma--; if (mb - ma < 3 && mb < nc) mb++; }
        const groups = [byX.slice(0, k0), byX.slice(ma, mb), byX.slice(nc - k2)];
        // the block's width where each group is: its run of the strip coordinate over how fast that coordinate rises
        // there (right for a bent band too); the middle one of the three. (haloFitWidths then holds every block's width
        // to the strip's own scale: near the midline, where the strip turns over the edge, the rise is not steady.)
        let s0 = Infinity, s1 = -Infinity;
        for (let i = 0; i < n; i++) { if (s[i] < s0) s0 = s[i]; if (s[i] > s1) s1 = s[i]; }
        const g = [0, 0, 0], widths = [];
        for (const list of groups) { gradientOf(pts, list, s, g); const gl = Math.hypot(g[0], g[1], g[2]); if (gl > 1e-9) widths.push((s1 - s0) / gl); }
        widths.sort((u, v) => u - v);
        if (widths.length) {
          const half = Math.min(o.maxHalfMm, Math.max(0.5, q(widths, 0.5) / 2));
          const bank = sign => {
            const list = [];
            for (let i = 0; i < n; i++) if (depth[i] > o.bankFrom * o.bankMm && depth[i] <= o.bankMm && sign * xOf(i) > 0) list.push(i);
            return list.length >= 3 ? meanOf(list) : null;
          };
          const sh1 = meanOf(groups[0]), mid = meanOf(groups[1]), sh2 = meanOf(groups[2]), p0 = bank(-1) || sh1, p4 = bank(1) || sh2;
          const len = dist(p0, sh1) + dist(sh1, mid) + dist(mid, sh2) + dist(sh2, p4);
          return { p: [p0, sh1, mid, sh2, p4], r: half, reach: reachOf(2 * half), width: 2 * half, length: len + 2 * half, n, kind: 'band', run: s1 - s0 };
        }
      }
    }
  }
  // one segment along the main direction of the spread
  const m = [0, 0, 0, 0, 0, 0];
  for (const i of crown) {
    const x = pts[3 * i] - C[0], y = pts[3 * i + 1] - C[1], z = pts[3 * i + 2] - C[2];
    m[0] += x * x; m[1] += x * y; m[2] += x * z; m[3] += y * y; m[4] += y * z; m[5] += z * z;
  }
  const e1 = mainAxis(m, [0, 0, 0]);
  const l1 = m[0] * e1[0] * e1[0] + m[3] * e1[1] * e1[1] + m[5] * e1[2] * e1[2] + 2 * (m[1] * e1[0] * e1[1] + m[2] * e1[0] * e1[2] + m[4] * e1[1] * e1[2]);
  const d = [m[0] - l1 * e1[0] * e1[0], m[1] - l1 * e1[0] * e1[1], m[2] - l1 * e1[0] * e1[2], m[3] - l1 * e1[1] * e1[1], m[4] - l1 * e1[1] * e1[2], m[5] - l1 * e1[2] * e1[2]];
  const e2 = mainAxis(d, [0, 0, 0]);
  const dot12 = e1[0] * e2[0] + e1[1] * e2[1] + e1[2] * e2[2];
  for (let k = 0; k < 3; k++) e2[k] -= dot12 * e1[k];
  const has2 = unit(e2);
  const t = [], w = [];
  for (const i of crown) {
    const x = pts[3 * i] - C[0], y = pts[3 * i + 1] - C[1], z = pts[3 * i + 2] - C[2];
    t.push(x * e1[0] + y * e1[1] + z * e1[2]); w.push(has2 ? x * e2[0] + y * e2[1] + z * e2[2] : 0);
  }
  t.sort((u, v) => u - v); w.sort((u, v) => u - v);
  const t0 = q(t, 0.05), t1 = q(t, 0.95), w0 = q(w, 0.05), w1 = q(w, 0.95);
  const half = Math.min(o.maxHalfMm, Math.max(0.5, (w1 - w0) / 2)), len = Math.max(0, (t1 - t0) / 2), mid = (t0 + t1) / 2, wm = (w0 + w1) / 2, seg = Math.max(0, len - half);
  const px = C[0] + e1[0] * mid + e2[0] * wm, py = C[1] + e1[1] * mid + e2[1] * wm, pz = C[2] + e1[2] * mid + e2[2] * wm;
  const a = [px - e1[0] * seg, py - e1[1] * seg, pz - e1[2] * seg], b = [px + e1[0] * seg, py + e1[1] * seg, pz + e1[2] * seg];
  return { p: [a, a.slice(), [px, py, pz], b.slice(), b], r: half, reach: reachOf(2 * half), width: 2 * half, length: 2 * Math.max(len, half), n, kind: 'segment' };
}

/** Hold every block's width to the strip's own scale (pure; changes the shapes in place and returns the scale, mm per
 * unit of the strip coordinate: the middle one of width / run over the 'band' shapes). A block whose width is under
 * o.fitLo or over o.fitHi of its run x that scale is set to that limit (near the midline the strip turns over the
 * brain's edge and its coordinate does not rise steadily: an ankle block measured 16 mm wide, a toes block 1 mm), and
 * its reach follows. Shapes without a run (kind 'segment') are left. */
export function haloFitWidths(shapes, o = AREA_HALO) {
  const ratios = [];
  for (const sh of shapes) if (sh && sh.kind === 'band' && sh.run > 1e-9) ratios.push(sh.width / sh.run);
  if (ratios.length < 3) return null;
  ratios.sort((u, v) => u - v);
  const scale = ratios[Math.floor(ratios.length / 2)];
  for (const sh of shapes) {
    if (!sh || sh.kind !== 'band' || !(sh.run > 1e-9)) continue;
    const w = Math.min(2 * o.maxHalfMm, Math.max(1, Math.min(o.fitHi * sh.run * scale, Math.max(o.fitLo * sh.run * scale, sh.width))));
    if (w !== sh.width) { sh.length += w - sh.width; sh.width = w; sh.r = w / 2; sh.reach = Math.min(o.reachMaxMm, Math.max(o.reachMinMm, o.reachWidths * w)); }
  }
  return scale;
}

const segDist2 = (p, a, b) => {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2], x = p[0] - a[0], y = p[1] - a[1], z = p[2] - a[2], L = bx * bx + by * by + bz * bz;
  const t = L > 1e-6 ? Math.min(1, Math.max(0, (x * bx + y * by + z * bz) / L)) : 0;
  const ex = x - bx * t, ey = y - by * t, ez = z - bz * t;
  return ex * ex + ey * ey + ez * ez;
};
/** How far point p (source mm) is from a block's shape, in mm past its edge (0 on the block). Pure. */
export function haloDistance(shape, p) {
  const P = shape.p;
  let d2 = Infinity;
  for (let k = 0; k + 1 < P.length; k++) d2 = Math.min(d2, segDist2(p, P[k], P[k + 1]));
  return Math.max(0, Math.sqrt(d2) - shape.r);
}
/** How strongly a block's halo lands on point p (source mm), 0..1: 1 on the block, (1 - d)^2 over the reach, 0 beyond.
 * The same rule as the shaders' nsHaloAt. Pure. */
export function haloFalloff(shape, p) {
  const d = haloDistance(shape, p) / shape.reach;
  return d < 1 ? (1 - d) * (1 - d) : 0;
}

/* ------------------------------------------------------------------ the state */

/** The halos' state (plain numbers and typed arrays; nothing is allocated after this). Per slot: id (the area, null =
 * free), self (the area's number in the area shaders, so its own block takes none of its own halo), shape (five
 * points x (xyz, w): p0 with r, p1 with 1 / reach, p2, p3, p4), col (rgb, brightest channel 1), lit (0..1, as given),
 * lookT (the look part it goes to), look (the look part now, eased). n: slots in use; dirty: the uniforms must be
 * written; easing: a look part is still moving. */
export function createHalo({ slots = AREA_HALO.slots, reducedMotion = false } = {}) {
  return {
    kind: 'ns-area-halo', slots, reducedMotion: reducedMotion === true,
    id: new Array(slots).fill(null), self: new Float64Array(slots).fill(-1), shape: new Float64Array(20 * slots), col: new Float64Array(3 * slots),
    lit: new Float64Array(slots), lookT: new Float64Array(slots), look: new Float64Array(slots), n: 0, dirty: true, easing: false
  };
}
const slotStrength = (H, i) => Math.max(H.lit[i], H.look[i]);

/** Give area `id` a halo, or change it: shape (haloShape), colour (r, g, b linear, any strength: scaled so its
 * brightest channel is 1), its two parts (haloParts) and its number in the area shaders (-1: none). The slot of the
 * same id is reused; else a free one; else the weakest slot when this one is to be stronger (else it is not shown:
 * -1). With both parts 0 the halo is let go (it fades with its look part). Returns the slot. */
export function haloSet(H, id, shape, r, g, b, lit, look, self = -1) {
  let s = H.id.indexOf(id);
  const want = Math.max(lit, look);
  if (s < 0) {
    if (!(want > 0) || !shape) return -1;
    s = H.id.indexOf(null);
    if (s < 0) { let low = want; for (let i = 0; i < H.slots; i++) { const v = Math.max(H.lit[i], H.lookT[i], H.look[i]); if (v < low) { low = v; s = i; } } }
    if (s < 0) return -1;
    H.id[s] = id; H.look[s] = 0;
    for (let k = 0; k < 5; k++) { const p = shape.p[k]; H.shape[20 * s + 4 * k] = p[0]; H.shape[20 * s + 4 * k + 1] = p[1]; H.shape[20 * s + 4 * k + 2] = p[2]; H.shape[20 * s + 4 * k + 3] = 0; }
    H.shape[20 * s + 3] = shape.r; H.shape[20 * s + 7] = 1 / Math.max(shape.reach, 1e-3);
    const m = Math.max(r, g, b);
    if (m > 1e-6) { H.col[3 * s] = r / m; H.col[3 * s + 1] = g / m; H.col[3 * s + 2] = b / m; } else { H.col[3 * s] = 1; H.col[3 * s + 1] = 1; H.col[3 * s + 2] = 1; }
    H.self[s] = self;
  }
  H.lit[s] = lit; H.lookT[s] = look;
  H.dirty = true;
  return s;
}

/** Step the halos by dtS seconds: every look part eases to where it goes (at once under reduced motion); a halo with
 * nothing left frees its slot. Sets n, easing; returns whether anything changed (the uniforms must be written). Costs
 * one comparison per slot while nothing glows. */
export function stepHalo(H, dtS, o = AREA_HALO) {
  let n = 0, easing = false, changed = H.dirty;
  const k = H.reducedMotion || !(o.easeS > 0) ? 1 : dtS > 0 ? 1 - Math.exp(-Math.min(dtS, 0.25) / o.easeS) : 0;
  for (let i = 0; i < H.slots; i++) {
    if (H.id[i] === null) continue;
    if (H.look[i] !== H.lookT[i]) {
      let v = H.look[i] + (H.lookT[i] - H.look[i]) * k;
      if (Math.abs(H.lookT[i] - v) < 0.004) v = H.lookT[i];
      if (v !== H.look[i]) { H.look[i] = v; changed = true; }
      if (v !== H.lookT[i]) easing = true;
    }
    if (!(slotStrength(H, i) > 0) && !(H.lookT[i] > 0)) { H.id[i] = null; H.self[i] = -1; changed = true; continue; }
    n++;
  }
  H.n = n; H.easing = easing; H.dirty = false;
  return changed;
}

/** Write the state into the shared uniform values (flat typed arrays): p[20 x slots] (per slot five vec4: p0 xyz
 * and r, p1 xyz and 1 / reach, p2 xyz and the share of the strength that is the LIT part (lit / strength: what the
 * neighbouring blocks take, AREA_HALO.strip.look), p3 xyz, p4 xyz), c[4 x slots] (colour x strength rgb, the area's own
 * number), n[4] (x: how many slots are written, 0 = the shaders skip the halo altogether). The slots in use are
 * packed first. */
export function writeHaloUniforms(H, U) {
  let k = 0;
  for (let i = 0; i < H.slots; i++) {
    if (H.id[i] === null) continue;
    const s = slotStrength(H, i);
    if (!(s > 0)) continue;
    for (let j = 0; j < 20; j++) U.p[20 * k + j] = H.shape[20 * i + j];
    U.p[20 * k + 11] = Math.min(1, H.lit[i] / s);
    U.c[4 * k] = H.col[3 * i] * s; U.c[4 * k + 1] = H.col[3 * i + 1] * s; U.c[4 * k + 2] = H.col[3 * i + 2] * s; U.c[4 * k + 3] = H.self[i];
    k++;
  }
  for (let i = 20 * k; i < 20 * H.slots; i++) U.p[i] = 0;
  for (let i = 4 * k; i < 4 * H.slots; i++) U.c[i] = 0;
  U.n[0] = k;
  return U;
}

/** QA: the halos now, as plain data. `out`: an array of slot records made once (areaHaloRecords), filled in place
 * (nothing is allocated): { id (null = free), lit, look, strength, widthMm, reachMm, r, g, b }. Returns out. */
export function areaHaloRecords(slots = AREA_HALO.slots) { return Array.from({ length: slots }, () => ({ id: null, lit: 0, look: 0, strength: 0, widthMm: 0, reachMm: 0, r: 0, g: 0, b: 0 })); }
export function areaHaloState(H, out = areaHaloRecords(H.slots)) {
  for (let i = 0; i < H.slots && i < out.length; i++) {
    const o = out[i], on = H.id[i] !== null;
    o.id = H.id[i]; o.lit = on ? H.lit[i] : 0; o.look = on ? H.look[i] : 0; o.strength = on ? slotStrength(H, i) : 0;
    o.widthMm = on ? 2 * H.shape[20 * i + 3] : 0; o.reachMm = on && H.shape[20 * i + 7] > 0 ? 1 / H.shape[20 * i + 7] : 0;
    o.r = on ? H.col[3 * i] : 0; o.g = on ? H.col[3 * i + 1] : 0; o.b = on ? H.col[3 * i + 2] : 0;
  }
  return out;
}

/* ------------------------------------------------------------------ shaders */

/** The halo's uniforms and its rule (fragment shaders). nsHaloAt( p, self, litOnly ): the light of every halo landing
 * on the rest position p (source mm), linear rgb, colour x strength x falloff, leaving out the halo of the area
 * numbered `self` (a block takes none of its own halo; -1 for the cortex); litOnly 1 (a neighbouring block) takes the
 * lit part whole and the look's part at AREA_HALO.strip.look within strip.lookReachMm of the block's edge only. Costs nothing while no halo is on (nsHaloN.x 0).
 * haloAt is the same rule in numbers (for tests: HALO_SKIP, HALO_DIST and HALO_FALLOFF are the shader's own text). */
/** The halo's three scalar rules in the shader, as its own text (each is also valid JavaScript with Math's max and
 * sqrt in scope, so a test evaluates the very text the shader runs): skip a block's own halo; the distance past the
 * shape in mm (e) and in reaches (d); the falloff over the reach. */
export const HALO_SKIP = 'abs( cs.w - self ) < 0.5';
export const HALO_EDGE = 'max( sqrt( d2 ) - p0.w, 0.0 )';
export const HALO_DIST = 'e * p1.w';
export const HALO_FALLOFF = '( 1.0 - d ) * ( 1.0 - d )';
export function haloFragmentHead(slots = AREA_HALO.slots, o = AREA_HALO) {
  return `uniform vec4 nsHaloP[ ${5 * slots} ];
uniform vec4 nsHaloC[ ${slots} ];
uniform vec4 nsHaloN;
float nsHaloFall( float d ) { return ${HALO_FALLOFF}; }
float nsHaloSeg( vec3 p, vec3 a, vec3 b ) {
	vec3 ab = b - a, ap = p - a;
	vec3 e = ap - ab * clamp( dot( ap, ab ) / max( dot( ab, ab ), 1e-6 ), 0.0, 1.0 );
	return dot( e, e );
}
vec3 nsHaloAt( vec3 p, float self, float litOnly ) {
	vec3 c = vec3( 0.0 );
	int n = int( nsHaloN.x + 0.5 );
	for ( int i = 0; i < ${slots}; i ++ ) {
		if ( i >= n ) break;
		vec4 cs = nsHaloC[ i ];
		if ( ${HALO_SKIP} ) continue;
		vec4 p0 = nsHaloP[ 5 * i ], p1 = nsHaloP[ 5 * i + 1 ], p2 = nsHaloP[ 5 * i + 2 ];
		vec3 p3 = nsHaloP[ 5 * i + 3 ].xyz, p4 = nsHaloP[ 5 * i + 4 ].xyz;
		float d2 = min( min( nsHaloSeg( p, p0.xyz, p1.xyz ), nsHaloSeg( p, p1.xyz, p2.xyz ) ), min( nsHaloSeg( p, p2.xyz, p3 ), nsHaloSeg( p, p3, p4 ) ) );
		float e = ${HALO_EDGE};
		float d = ${HALO_DIST};
		if ( d < 1.0 ) {
			float f = nsHaloFall( d );
			float wl = p2.w * f + ( 1.0 - p2.w ) * ${glslFloat(o.strip.look)} * nsHaloFall( min( e * ${glslFloat(1 / o.strip.lookReachMm)}, 1.0 ) );
			c += cs.rgb * mix( f, wl, litOnly );
		}
	}
	return c;
}
`;
}

/** GLSL (fragment, brain surface): the halos on the tissue. `pos`: the atlas position (source mm) in scope; `col`:
 * the tissue's lit colour (a vec3 that is changed in place); `facing`: |N.V| in scope. The tissue takes the halo's
 * colour and keeps its own light and shade, plus a little light of that colour. Pure. */
export function haloTissueGlsl(pos = 'vNsObj', col = 'nsCol', facing = 'nsFacing', o = AREA_HALO) {
  const T = o.tissue, f = glslFloat;
  return `if ( nsHaloN.x > 0.5 ) {
		vec3 nsHlC = nsHaloAt( ${pos}, - 1.0, 0.0 );
		float nsHlM = max( nsHlC.r, max( nsHlC.g, nsHlC.b ) );
		if ( nsHlM > 0.0 ) {
			float nsHlZ = mix( ${f(T.grazeKeep)}, 1.0, smoothstep( ${f(T.grazeLo)}, ${f(T.grazeHi)}, ${facing} ) );
			float nsHlY = dot( min( ${col}, vec3( 1.0 ) ), vec3( 0.2126, 0.7152, 0.0722 ) );
			vec3 nsHlH = nsHlC / nsHlM;
			${col} = mix( ${col}, nsHlH * ( ${f(T.gain)} * nsHlY + ${f(T.lift)} ), ${f(T.mix)} * min( nsHlM, 1.0 ) * nsHlZ );
			${col} += nsHlC * ( ${f(T.add)} * nsHlZ );
		}
	}`;
}

/** haloAt in numbers: the light of every halo written in U (writeHaloUniforms) at point p (source mm), the same rule
 * as the shaders' nsHaloAt (the scalar parts evaluated from the shader's own text). Writes out[0..2]. Pure. */
// (made when haloAt is first called, in tests: the page itself never evaluates text, whatever its content policy)
let haloFns = null;
const haloScalar = (expr, names) => new Function('abs', 'max', 'sqrt', ...names, `return ${expr};`); // eslint-disable-line no-new-func
export function haloAt(U, p, self = -1, litOnly = 0, out = [0, 0, 0], o = AREA_HALO) {
  if (!haloFns) haloFns = { skip: haloScalar(HALO_SKIP, ['cs', 'self']), edge: haloScalar(HALO_EDGE, ['d2', 'p0']), dist: haloScalar(HALO_DIST, ['e', 'p1']), fall: haloScalar(HALO_FALLOFF, ['d']) };
  const haloSkipFn = haloFns.skip, haloEdgeFn = haloFns.edge, haloDistFn = haloFns.dist, haloFallFn = haloFns.fall;
  out[0] = out[1] = out[2] = 0;
  const n = Math.round(U.n[0]);
  for (let i = 0; i < n; i++) {
    const cs = { w: U.c[4 * i + 3] };
    if (haloSkipFn(Math.abs, Math.max, Math.sqrt, cs, self)) continue;
    const P = k => [U.p[20 * i + 4 * k], U.p[20 * i + 4 * k + 1], U.p[20 * i + 4 * k + 2]];
    let d2 = Infinity;
    for (let k = 0; k < 4; k++) d2 = Math.min(d2, segDist2(p, P(k), P(k + 1)));
    const e = haloEdgeFn(Math.abs, Math.max, Math.sqrt, d2, { w: U.p[20 * i + 3] }), d = haloDistFn(Math.abs, Math.max, Math.sqrt, e, { w: U.p[20 * i + 7] });
    if (!(d < 1)) continue;
    const share = U.p[20 * i + 11], fall = x => haloFallFn(Math.abs, Math.max, Math.sqrt, x), f = fall(d);
    const k = litOnly ? share * f + (1 - share) * o.strip.look * fall(Math.min(e / o.strip.lookReachMm, 1)) : f;
    out[0] += U.c[4 * i] * k; out[1] += U.c[4 * i + 1] * k; out[2] += U.c[4 * i + 2] * k;
  }
  return out;
}

/** The pool on the tissue in numbers (haloTissueGlsl's rule): the lit tissue colour col (linear rgb, changed in
 * place) under the halo light h (linear rgb, colour x strength x falloff), seen at facing; cut at display white as the
 * shader's next step does. Returns col. Pure. */
export function haloTissueInto(col, h, facing = 1, o = AREA_HALO) {
  const T = o.tissue, m = Math.max(h[0], h[1], h[2]);
  if (m > 0) {
    const t = Math.min(1, Math.max(0, (facing - T.grazeLo) / (T.grazeHi - T.grazeLo))), z = T.grazeKeep + (1 - T.grazeKeep) * t * t * (3 - 2 * t);
    const y = 0.2126 * Math.min(col[0], 1) + 0.7152 * Math.min(col[1], 1) + 0.0722 * Math.min(col[2], 1), k = T.mix * Math.min(m, 1) * z;
    for (let i = 0; i < 3; i++) col[i] = col[i] + ((h[i] / m) * (T.gain * y + T.lift) - col[i]) * k + h[i] * T.add * z;
  }
  for (let i = 0; i < 3; i++) col[i] = Math.min(col[i], 1);
  return col;
}

const HALO_VERTEX_HOOK = '#include <begin_vertex>';
const HALO_LIGHT_HOOK = '#include <lights_fragment_begin>';
const HALO_OPAQUE_HOOK = '#include <opaque_fragment>';
/** Shader patch (pure) of a motor area's material for the glow of this module. Compose it AFTER the area's border,
 * glow-rim, power-up and ink patches (their values are used where they are in scope; without them the parts that
 * need them are left out). Per-area uniforms: nsHaloOwn (rgb: the area's own vivid colour, linear; w: how strongly it
 * is lit now, 0..1, 0 for a held posture's glow), nsHaloSet (x: the area's own number for nsHaloAt, y: 1 when the look
 * is on it, z: 1 for a black block, w: -). Shared: the halo's (haloFragmentHead).
 *  - the lit block's rim (AREA_LIT), just before the lights: its emission moves to its own colour toward its borders
 *    along the strip and down its banks, so the keys' frame, which takes the emission's colour, is in that colour too;
 *  - the halos of the other areas, added to the finished colour (not in the gap between blocks, not on a black block);
 *  - a black block's edge glow (ABYSS_EDGE), added last.
 * Returns { vertexShader, fragmentShader, rim, edge } or null when a hook is missing (the area then draws as before). */
export function patchAreaHaloShaders(vertexShader, fragmentShader, { slots = AREA_HALO.slots, halo = AREA_HALO, lit = AREA_LIT, edge = ABYSS_EDGE } = {}) {
  if (typeof vertexShader !== 'string' || typeof fragmentShader !== 'string') return null;
  if (!vertexShader.includes(HALO_VERTEX_HOOK) || !fragmentShader.includes(HALO_LIGHT_HOOK) || !fragmentShader.includes(HALO_OPAQUE_HOOK) || !fragmentShader.includes('vViewPosition') ||
    !fragmentShader.includes('totalEmissiveRadiance') || fragmentShader.includes('nsHaloOwn')) return null;
  const f = glslFloat;
  const border = fragmentShader.includes('float nsDLo') && fragmentShader.includes('nsKHi') && fragmentShader.includes('nsGapCov') && fragmentShader.includes('nsTerrCov') && fragmentShader.includes('nsHiCov') && fragmentShader.includes('uniform vec4 nsSlice');
  const relief = fragmentShader.includes('varying float vNsRel');
  // CSS pixels from the inner edge of the block's black border along the strip, and the block's width between them
  const runPx = border ? `float nsHgw = nsSlice.w > 0.5 ? max( nsSlice.x / nsFw, nsSlice.y ) : 0.0;
		float nsHlo = nsKLo >= 1.0 ? nsDLo - nsHgw : 1e6, nsHhi = nsKHi >= 1.0 ? nsDHi - nsHgw : 1e6;
		float nsHin = min( nsHlo, nsHhi ), nsHw = min( nsHlo + nsHhi, 1e4 );` : 'float nsHin = 1e6, nsHw = 1e4;';
  const rimOn = lit && lit.on !== false;
  const rimBody = rimOn ? `	if ( nsHaloOwn.w > 0.0 ) { // AREA_LIT: the lit block's own colour toward its borders and down its banks
		${runPx}
		float nsHrw = max( min( ${f(lit.rimCss)}, ${f(lit.rimShare)} * nsHw ), 0.5 );
		float nsHrm = 1.0 - smoothstep( ${f(lit.rimFull)} * nsHrw, nsHrw, max( nsHin, 0.0 ) );
		${relief ? `nsHrm = max( nsHrm, smoothstep( ${f(lit.reliefLoMm)}, ${f(lit.reliefHiMm)}, vNsRel ) );` : ''}
		// (the white core is far above display white; mixed as it is, the rim showed its colour in its last pixel only:
		// inside the rim the core counts as display white)
		vec3 nsHrE = mix( totalEmissiveRadiance, min( totalEmissiveRadiance, vec3( 1.0 ) ), smoothstep( 0.0, 0.12, nsHrm ) );
		totalEmissiveRadiance = mix( nsHrE, nsHaloOwn.rgb * ( ${f(lit.rimGain)} * nsHaloOwn.w ), nsHrm * min( 1.0, nsHaloOwn.w * 4.0 ) );
	}
` : '';
  const edgeOn = edge && edge.on !== false && border;
  const el = edgeOn ? abyssEdgeLinear(edge) : [0, 0, 0];
  const edgeBody = edgeOn ? `	if ( nsHaloSet.z > 0.5 ) { // ABYSS_EDGE: a black block's edge glow (not activity)
		${runPx}
		float nsHeW = min( mix( ${f(edge.css)}, ${f(edge.lookCss)}, nsHaloSet.y ), max( ${f(edge.share)} * nsHw, 1.0 ) );
		float nsHeF = abs( dot( normalize( normal ), normalize( vViewPosition ) ) );
		float nsHeA = 1.0 - smoothstep( ${f(edge.faceLo)}, ${f(edge.faceHi)}, nsHeF ); // the gyrus's own outline as seen
		float nsHeS = 1.0 - clamp( max( nsHin, 0.0 ) / nsHeW, 0.0, 1.0 );
		float nsHeG = max( ${edge.falloffPower === 1 ? 'nsHeS' : 'nsHeS * nsHeS'}, ${f(edge.face || 0)} * nsHeA * nsHeA ) * ( 1.0 - nsGapCov ) * ( 1.0 - nsTerrCov * nsTerr.a ) * ( 1.0 - nsHiCov );
		outgoingLight += vec3( ${el.map(f).join(', ')} ) * ( nsHeG * mix( ${f(edge.rest)}, ${f(edge.look)}, nsHaloSet.y ) );
		diffuseColor.a = max( diffuseColor.a, nsHeG );
	}
` : '';
  const haloOn = halo && halo.on !== false;
  const haloBody = haloOn ? `	if ( nsHaloN.x > 0.5 && nsHaloSet.z < 0.5 ) { // AREA_HALO: the other areas' halos on this block
		vec3 nsHsC = nsHaloAt( vNsHp, nsHaloSet.x, 1.0 );
		outgoingLight += nsHsC * ( ${f(halo.strip.add)}${border ? ' * ( 1.0 - nsGapCov )' : ''} );
	}
` : '';
  const head = `uniform vec4 nsHaloOwn;\nuniform vec4 nsHaloSet;\nvarying vec3 vNsHp;\n${haloFragmentHead(slots)}`;
  const vs = 'varying vec3 vNsHp;\n' + vertexShader.replace(HALO_VERTEX_HOOK, `${HALO_VERTEX_HOOK}\n\tvNsHp = position;`);
  const fs = head + fragmentShader.replace(HALO_LIGHT_HOOK, rimBody + HALO_LIGHT_HOOK).replace(HALO_OPAQUE_HOOK, haloBody + edgeBody + HALO_OPAQUE_HOOK);
  return { vertexShader: vs, fragmentShader: fs, rim: rimOn, edge: Boolean(edgeOn), halo: Boolean(haloOn), border };
}
