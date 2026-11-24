// Where the words of a tutorial cue go beside its ring, and (at the end, 24 November 2026, HUD74) where the "Brain"
// ring itself goes (pure: no DOM, no three.js; tested in Node).
//
// 24 November 2026 (round r33, package UI5; DESIGN-DECISIONS section 205). An independent check of Body update 70: the
// tutorial's first cue, "Motor area · Left toes", put its words under its ring whenever the ring was in the top 16 % of
// the picture (ns-guide-cues data-vertical), and there they lay over the mirror body's neck at every window size looked
// at (1600x900, 1280x720, 1920x1080, 800x600); in the outside view they lay above the ring. The words now take the
// nearest place round the ring that covers none of the things the game hands in as keep-outs (the mirror body's head
// and neck, the region labels' own places, the turn arrows, the HUD's cards) and stays inside the picture, centred over
// or under the ring where it can be. Tried and dropped: four fixed places (above, below, left, right, with three
// alignments each), which at 800 by 600 found no clear one (the tutorial card on the left, the mirror body's up arrow
// above, its head on the right and below) and fell back to covering the arrow.

/** The rule (display choices, CSS px):
 * - gapPx: the least room between the ring and its words (the CSS's own 5 px);
 * - maxGapPx: the most (beyond it the words no longer read as the ring's);
 * - stepXPx / stepYPx: the grid of places tried round the ring;
 * - marginPx / topPx: the picture's edge and the limits line at the top, which the words keep inside;
 * - padPx: the room kept round every keep-out;
 * - sideCost: what one pixel of the words' middle off the ring's middle (sideways) costs against one pixel of room;
 * - belowCost: what a place under the ring costs more than one over it (the CSS's default is over it);
 * - overlapCost: with no clear place, the least covered one is taken: the covered area times the keep-out's `weight`
 *   (default 1), and this per pixel of room;
 * - keepBonus (pass 2, 24 November 2026): the place the words have now (`keep`, its offset from the ring) is kept while
 *   it stays inside the picture and clear of every keep-out (touching one without the padPx room is not yet a hit:
 *   keepPadPx), unless a clear place cheaper by more than this exists; larger than any place's cost, so the words stay
 *   until they are hit (with no clear place at all, the place they have stays unless another covers less than it by
 *   more than keepBadFrac of the least covered one's score plus keepBadPx weighted px2). The check of pass 1: placed afresh on every frame of a look, the words jumped round their ring
 *   (up to 216 px, their side changing 18 to 73 times in an 8 s look, on a shown label in 10 to 25 % of the frames)
 *   because a label 1 px nearer turned the cheapest place from over the ring to under it. 0: no memory, as pass 1;
 * - sameHalf: with a `half` line (the brain's midline on the screen, { x0, y0, dxdy }: x = x0 + (y - y0) dxdy) the
 *   words keep to the ring's side of it (at most halfCrossPx over it), so they never lie on the other half of the
 *   brain (pass 1 at 1280x720 from outside: "Left toes" across the right leg's areas); halfWeight: with no clear place,
 *   each pixel over the line counts as this many covered pixels per pixel of the words' height;
 * - (pass 3, 24 November 2026; the check of pass 2: while the ring passed something that does not move with the look,
 *   the tutorial card or the picture's edge, the words were placed afresh at the cheapest clear place round the ring on
 *   every frame they were hit, so they crept along it a grid step a frame and then jumped to another side, 156 to 199 px,
 *   and at 800x600 in a wide look moved 56 times with 12 quick back-and-forth returns, against update 70's 18 and 0):
 *   slide: a kept place that is hit first slides along its own side of the ring (over or under it: sideways; beside it:
 *   up or down) by the least shift that clears it (the words then stand still on the screen against what stopped them
 *   while the ring goes on), as long as they stay on that side; only when no slide clears it do they change side;
 *   nearFirst: they then take the clear place NEAREST the kept one (pass 2: the cheapest, often on the far side), clear
 *   by holdPx more room where such a place is at most holdPx further (so the next frame does not hit it again); with
 *   no clear place at all, the nearest of the places that cover at most keepBadPx (weighted px2) more than the least
 *   covered one, not the least covered anywhere round the ring ("nearest" from where the words are on the screen:
 *   the kept offset less the ring's move since the last placement, unless that move is over followPx, a jump to
 *   another area); backFrames: the side just left is not
 *   taken again within this many placements (ns-guide-cues counts them) while another clear place exists;
 *   keepAcross: the place is kept across a change of the caption (the ring moving to another area in a wide look),
 *   its near edge where it was, instead of being chosen afresh (pass 2 forgot it on every caption).
 *   false for all four: pass 2. */
export const CUE_WORDS = Object.freeze({ on: true, gapPx: 5, maxGapPx: 41, stepXPx: 6, stepYPx: 4, marginPx: 4, topPx: 26, padPx: 3,
  sideCost: 0.25, belowCost: 2, overlapCost: 0.05, keepBonus: 1000, keepPadPx: 0, keepBadFrac: 0.5, keepBadPx: 400, sameHalf: true, halfCrossPx: 0, halfWeight: 6,
  slide: true, nearFirst: true, holdPx: 8, followPx: 24, backFrames: 30, keepAcross: true });


/**
 * The words' box for a ring at (x, y) (CSS px, its middle) of half size `ringHalfPx` (across; `ringHalfYPx` up and down,
 * by default the same), words `w` x `h`, in a picture
 * `width` x `height`, kept clear of `keepOut` ([{ x0, y0, x1, y1, weight? }], CSS px). Returns { x0, y0, x1, y1, clear,
 * cost, side: 'above' | 'below' | 'left' | 'right' } or null (bad input). Every place on the grid round the ring
 * (rules.stepXPx / stepYPx) with its room to the ring between gapPx and maxGapPx is tried; of the clear ones (inside the
 * picture, padPx off every keep-out) the cheapest is taken: its room, plus sideCost per pixel of its middle off the
 * ring's middle sideways, plus belowCost under the ring. With none clear, the one inside the picture that covers least.
 */
// The places round a ring, cheapest first, kept per ring and words size (a few sizes are in use): working out and
// sorting them on every call, and testing every one against every keep-out, cost the look about 0.7 ms a frame of
// HUD time (the frame table's look phase); in cost order the first clear place ends the search.
const offsetMemo = new Map();
// (pass 3: the last list asked for is handed back without building its key string, which a look did on every frame)
const lastOff = { w: NaN, h: NaN, r: NaN, ry: NaN, R: null, list: null };
function offsetsFor(w, h, r, ry, R) {
  const L = lastOff;
  if (L.list && L.w === w && L.h === h && L.r === r && L.ry === ry && L.R === R) return L.list;
  const key = `${w}|${h}|${r}|${ry}|${R.gapPx}|${R.maxGapPx}|${R.stepXPx}|${R.stepYPx}|${R.sideCost}|${R.belowCost}`;
  let list = offsetMemo.get(key);
  L.w = w; L.h = h; L.r = r; L.ry = ry; L.R = R;
  if (list) { L.list = list; return list; }
  list = [];
  const reachX = w / 2 + r + R.maxGapPx, reachY = h / 2 + ry + R.maxGapPx;
  for (let dy = -Math.floor(reachY / R.stepYPx) * R.stepYPx; dy <= reachY; dy += R.stepYPx) {
    for (let dx = -Math.floor(reachX / R.stepXPx) * R.stepXPx; dx <= reachX; dx += R.stepXPx) {
      // the room between the ring and the words (the larger of the two axes' gaps; inside the ring's reach only)
      const gx = Math.abs(dx) - w / 2 - r, gy = Math.abs(dy) - h / 2 - ry, gap = Math.max(gx, gy);
      if (gap < R.gapPx - 1e-9 || gap > R.maxGapPx + 1e-9) continue;
      const below = dy - h / 2 >= ry - 1e-9;
      const side = gy >= gx ? (below ? 'below' : 'above') : (dx < 0 ? 'left' : 'right');
      list.push({ dx, dy, cost: gap + R.sideCost * Math.abs(dx) + (below ? R.belowCost : 0), side });
    }
  }
  list.sort((p, q) => p.cost - q.cost); // (stable: equal costs keep the grid's order)
  if (offsetMemo.size > 32) offsetMemo.clear();
  offsetMemo.set(key, list);
  L.list = list;
  return list;
}

// How far (CSS px) the box x0..x1 x y0..y1 lies over the line `half` toward the side other than `sign` (0 when on its
// own side; the line's x at the box's top and bottom, the larger crossing of the two).
function halfCross(half, sign, x0, y0, x1, y1) {
  if (!half || !sign) return 0;
  const m0 = half.x0 + (y0 - half.y0) * half.dxdy, m1 = half.x0 + (y1 - half.y0) * half.dxdy;
  return Math.max(0, sign > 0 ? Math.max(m0, m1) - x0 : x1 - Math.min(m0, m1));
}

// (pass 3: the search's working values live here, set at the start of each call, and its helpers are plain functions,
// so a placement makes no closure or object a frame; the check of pass 2 found three closures and an object per call)
const S = { w: 0, h: 0, xLo: 0, xHi: 0, yLo: 0, yHi: 0, list: [], ldx: 0, ldy: 0, line: null, sign: 0, cross: 0 };
const usable = k => k && Number.isFinite(k.x0) && Number.isFinite(k.y0) && Number.isFinite(k.x1) && Number.isFinite(k.y1);
// inside the picture, on the ring's half, and `p` px off every keep-out (a box marked `lag` moved by ldx, ldy)
function clearAt(x0, y0, p) {
  const x1 = x0 + S.w, y1 = y0 + S.h;
  if (x0 < S.xLo || x1 > S.xHi || y0 < S.yLo || y1 > S.yHi) return false;
  if (S.sign && halfCross(S.line, S.sign, x0, y0, x1, y1) > S.cross) return false;
  const L = S.list;
  for (let i = 0; i < L.length; i++) {
    const k = L[i];
    if (!usable(k)) continue;
    const sx = k.lag ? S.ldx : 0, sy = k.lag ? S.ldy : 0;
    if (x0 < k.x1 + sx + p && x1 > k.x0 + sx - p && y0 < k.y1 + sy + p && y1 > k.y0 + sy - p) return false;
  }
  return true;
}
// how much a place covers (keep-outs weighted, the midline too), its cost deciding between equals; Infinity outside
function badAt(b0, c0, cost, R, pad) {
  const b1 = b0 + S.w, c1 = c0 + S.h;
  if (b0 < S.xLo || b1 > S.xHi || c0 < S.yLo || c1 > S.yHi) return Infinity;
  let bad = S.sign ? Math.max(0, halfCross(S.line, S.sign, b0, c0, b1, c1) - S.cross) * S.h * (Number.isFinite(R.halfWeight) ? R.halfWeight : 1) : 0;
  const L = S.list;
  for (let i = 0; i < L.length; i++) {
    const k = L[i];
    if (!usable(k)) continue;
    const sx = k.lag ? S.ldx : 0, sy = k.lag ? S.ldy : 0;
    const a = Math.max(0, Math.min(b1, k.x1 + sx + pad) - Math.max(b0, k.x0 + sx - pad)) * Math.max(0, Math.min(c1, k.y1 + sy + pad) - Math.max(c0, k.y0 + sy - pad));
    if (a > 0) bad += a * (Number.isFinite(k.weight) ? k.weight : 1);
  }
  return bad + R.overlapCost * cost;
}
function costOf(dx, dy, r, ry, R) {
  const gx = Math.abs(dx) - S.w / 2 - r, gy = Math.abs(dy) - S.h / 2 - ry, below = dy - S.h / 2 >= ry - 1e-9;
  return Math.max(gx, gy) + R.sideCost * Math.abs(dx) + (below ? R.belowCost : 0);
}
function sideOf(dx, dy, r, ry) {
  const gx = Math.abs(dx) - S.w / 2 - r, gy = Math.abs(dy) - S.h / 2 - ry, below = dy - S.h / 2 >= ry - 1e-9;
  return gy >= gx ? (below ? 'below' : 'above') : (dx < 0 ? 'left' : 'right');
}
function giveTo(o, x0, y0, clear, cost, side, dx, dy, kept, slid) {
  o.x0 = x0; o.y0 = y0; o.x1 = x0 + S.w; o.y1 = y0 + S.h; o.clear = clear; o.cost = cost; o.side = side; o.dx = dx; o.dy = dy; o.kept = kept; o.slid = slid;
  return o;
}
// (pass 3, rules.slide) the least shift along the place's own side (over or under the ring: sideways; beside it: up or
// down) that makes the words at x0, y0 clear with `pad` room and keeps them on that side, or NaN. The shifts tried are
// the ones that put the words' edge just past a keep-out's edge (padded), the picture's edge or the midline, smallest
// first, so a static box stops the words where they touch it.
const SHIFTS = new Float64Array(512);
function slideShift(x0, y0, side, dx, dy, r, ry, pad) {
  const w = S.w, h = S.h, row = side === 'above' || side === 'below', L = S.list;
  let n = 0;
  if (row) { SHIFTS[n++] = S.xLo - x0; SHIFTS[n++] = S.xHi - (x0 + w); } else { SHIFTS[n++] = S.yLo - y0; SHIFTS[n++] = S.yHi - (y0 + h); }
  for (let i = 0; i < L.length && n < SHIFTS.length - 3; i++) {
    const k = L[i];
    if (!usable(k)) continue;
    const sx = k.lag ? S.ldx : 0, sy = k.lag ? S.ldy : 0;
    if (row) {
      if (!(y0 < k.y1 + sy + pad && y0 + h > k.y0 + sy - pad)) continue;
      SHIFTS[n++] = k.x1 + sx + pad - x0; SHIFTS[n++] = k.x0 + sx - pad - (x0 + w);
    } else {
      if (!(x0 < k.x1 + sx + pad && x0 + w > k.x0 + sx - pad)) continue;
      SHIFTS[n++] = k.y1 + sy + pad - y0; SHIFTS[n++] = k.y0 + sy - pad - (y0 + h);
    }
  }
  if (row && S.sign) { const c = halfCross(S.line, S.sign, x0, y0, x0 + w, y0 + h) - S.cross; if (c > 0) SHIFTS[n++] = S.sign > 0 ? c : -c; }
  for (let i = 1; i < n; i++) { const v = SHIFTS[i]; let j = i - 1; while (j >= 0 && Math.abs(SHIFTS[j]) > Math.abs(v)) { SHIFTS[j + 1] = SHIFTS[j]; j--; } SHIFTS[j + 1] = v; }
  // the side's reach: over or under the ring while the words' sideways gap is no larger than their gap above or below
  // it (beside it: the other way round)
  const reach = row ? w / 2 + r + (Math.abs(dy) - h / 2 - ry) : h / 2 + ry + (Math.abs(dx) - w / 2 - r), at = row ? dx : dy;
  for (let i = 0; i < n; i++) {
    const s = SHIFTS[i];
    if (!Number.isFinite(s) || Math.abs(at + s) > reach + 1e-9) continue;
    if (row ? clearAt(x0 + s, y0, pad) : clearAt(x0, y0 + s, pad)) return s;
  }
  return NaN;
}
// (pass 3, rules.nearFirst) the clear place (with `p` room) nearest the offset kdx, kdy, not on side `avoid`; equals:
// the cheaper (the list is in cost order); or null
// (pass 3) the nearest clear place with `pad` room, or the nearest with holdPx more room where that one is no more than
// holdPx further away (so the next frame is less likely to hit it again, without a longer jump for it)
function nearestHeld(offsets, x, y, kdx, kdy, pad, holdPx, avoid) {
  const a = nearestClear(offsets, x, y, kdx, kdy, pad, avoid);
  if (!a || !(holdPx > 0)) return a;
  const b = nearestClear(offsets, x, y, kdx, kdy, pad + holdPx, avoid);
  return b && Math.hypot(b.dx - kdx, b.dy - kdy) <= Math.hypot(a.dx - kdx, a.dy - kdy) + holdPx ? b : a;
}
function nearestClear(offsets, x, y, kdx, kdy, p, avoid) {
  let best = null, bestD = Infinity;
  for (let i = 0; i < offsets.length; i++) {
    const o = offsets[i];
    if (avoid && o.side === avoid) continue;
    const d = (o.dx - kdx) * (o.dx - kdx) + (o.dy - kdy) * (o.dy - kdy);
    if (!(d < bestD - 1e-9)) continue;
    if (clearAt(x + o.dx - S.w / 2, y + o.dy - S.h / 2, p)) { best = o; bestD = d; }
  }
  return best;
}

/** `lagDx`, `lagDy` (CSS px, pass 2): how far the ring moved since the keep-outs marked `lag` were laid out (the region
 * labels and the turn arrows are laid out when the frame is drawn, after the words are placed, so during a look they
 * are a frame behind: the check's probe saw the words kept 7 px over "Left leg" frame after frame); those boxes are
 * moved by it. `keep` ({ dx, dy }: the words' middle from the ring's middle, CSS px, as last placed; or null) is kept while clear
 * (rules.keepBonus); `half` ({ x0, y0, dxdy } or null) is the brain's midline the words keep to the ring's side of
 * (rules.sameHalf; the side is the ring's middle's, none within 1 px of the line). The result also carries the place's
 * `dx`, `dy`, `kept` (true when it is `keep`, or `keep` slid along its side) and `slid` (pass 3: true when slid,
 * rules.slide); `avoid` (pass 3: 'above' | 'below' | 'left' | 'right' or null) is a side the words just left, not taken
 * again while another clear place exists (rules.backFrames); `out`, when given, is filled and returned (no new object). */
export function placeCueWords({ x, y, ringHalfPx, ringHalfYPx = ringHalfPx, w, h, width, height, keepOut = [], keep = null, half = null, out = null, lagDx = 0, lagDy = 0, avoid = null, rules = CUE_WORDS } = {}) {
  if (![x, y, ringHalfPx, ringHalfYPx, w, h, width, height].every(Number.isFinite) || !(w > 0 && h > 0 && width > 0 && height > 0)) return null;
  const R = rules || CUE_WORDS, r = Math.max(0, ringHalfPx), ry = Math.max(0, ringHalfYPx), pad = R.padPx || 0;
  S.w = w; S.h = h; S.list = Array.isArray(keepOut) ? keepOut : [];
  S.xLo = R.marginPx; S.xHi = width - R.marginPx; S.yLo = Math.max(R.marginPx, R.topPx); S.yHi = height - R.marginPx;
  S.ldx = Number.isFinite(lagDx) ? lagDx : 0; S.ldy = Number.isFinite(lagDy) ? lagDy : 0;
  const line = R.sameHalf && half && Number.isFinite(half.x0) && Number.isFinite(half.y0) && Number.isFinite(half.dxdy) ? half : null;
  const lineX = line ? line.x0 + (y - line.y0) * line.dxdy : NaN;
  S.line = line; S.sign = line && Math.abs(x - lineX) > 1 ? (x > lineX ? 1 : -1) : 0; S.cross = Number.isFinite(R.halfCrossPx) ? R.halfCrossPx : 0;
  const o = out || {};
  const offsets = offsetsFor(w, h, r, ry, R);
  // (pass 2) the place the words have now stays while it is clear, unless a clear place cheaper by keepBonus exists
  const hasKeep = R.keepBonus > 0 && keep && Number.isFinite(keep.dx) && Number.isFinite(keep.dy);
  let limit = Infinity, kept = false, kx0 = NaN, ky0 = NaN, kCost = NaN, kSide = '';
  if (hasKeep) {
    kx0 = x + keep.dx - w / 2; ky0 = y + keep.dy - h / 2; kCost = costOf(keep.dx, keep.dy, r, ry, R); kSide = sideOf(keep.dx, keep.dy, r, ry);
    if (clearAt(kx0, ky0, Number.isFinite(R.keepPadPx) ? R.keepPadPx : pad)) { kept = true; limit = kCost - R.keepBonus; }
    else if (R.slide) {
      // (pass 3) hit: slide along its own side first
      const s = slideShift(kx0, ky0, kSide, keep.dx, keep.dy, r, ry, pad);
      if (Number.isFinite(s)) {
        const row = kSide === 'above' || kSide === 'below', ndx = row ? keep.dx + s : keep.dx, ndy = row ? keep.dy : keep.dy + s;
        return giveTo(o, x + ndx - w / 2, y + ndy - h / 2, true, costOf(ndx, ndy, r, ry, R), kSide, ndx, ndy, true, true);
      }
    }
  }
  // (pass 3) "nearest" counts from where the words are on the screen now: the kept offset less the ring's move since the
  // last placement (lagDx, lagDy), unless the ring jumped (to another area: more than followPx), then the kept offset
  const lagged = Math.hypot(S.ldx, S.ldy) <= (R.followPx || 0), tdx = hasKeep ? keep.dx - (lagged ? S.ldx : 0) : 0, tdy = hasKeep ? keep.dy - (lagged ? S.ldy : 0) : 0;
  if (!kept && hasKeep && R.nearFirst) {
    // (pass 3) no slide clears it: the clear place nearest the kept one, with holdPx more room where one has it, not on
    // the side just left while another is clear
    const n = nearestHeld(offsets, x, y, tdx, tdy, pad, R.holdPx || 0, avoid || null) || (avoid ? nearestHeld(offsets, x, y, tdx, tdy, pad, R.holdPx || 0, null) : null);
    if (n) return giveTo(o, x + n.dx - w / 2, y + n.dy - h / 2, true, n.cost, n.side, n.dx, n.dy, false, false);
  } else {
    // cheapest first: the first place inside the picture that touches no keep-out (padded) wins
    for (let i = 0; i < offsets.length; i++) {
      const p = offsets[i];
      if (p.cost >= limit) break;
      if (clearAt(x + p.dx - w / 2, y + p.dy - h / 2, pad)) return giveTo(o, x + p.dx - w / 2, y + p.dy - h / 2, true, p.cost, p.side, p.dx, p.dy, false, false);
    }
    if (kept) return giveTo(o, kx0, ky0, true, kCost, kSide, keep.dx, keep.dy, true, false);
  }
  // none clear: the one that covers least (keep-outs weighted), its cost deciding between equals
  let bestBad = null, bestScore = Infinity;
  for (let i = 0; i < offsets.length; i++) {
    const p = offsets[i], c = badAt(x + p.dx - w / 2, y + p.dy - h / 2, p.cost, R, pad);
    if (c < bestScore - 1e-9) { bestScore = c; bestBad = p; }
  }
  if (!bestBad) return null;
  // (pass 2: with none clear, the place the words have stays unless another covers clearly less: keepBadFrac of the
  // least covered one's score plus keepBadPx; without it the least covered place changed from frame to frame in a
  // crowded corner at 800x600, and the words flipped between two places. Pass 3, rules.slide: a kept place pushed past
  // the picture's edge is first slid back inside along its own side, so the edge alone does not throw it away.)
  if (hasKeep) {
    let ndx = keep.dx, ndy = keep.dy;
    if (R.slide) {
      const row = kSide === 'above' || kSide === 'below';
      const reach = row ? w / 2 + r + (Math.abs(ndy) - h / 2 - ry) : h / 2 + ry + (Math.abs(ndx) - w / 2 - r);
      if (row) { const a = x + ndx - w / 2, s = a < S.xLo ? S.xLo - a : a + w > S.xHi ? S.xHi - a - w : 0; if (s && Math.abs(ndx + s) <= reach + 1e-9) ndx += s; }
      else { const a = y + ndy - h / 2, s = a < S.yLo ? S.yLo - a : a + h > S.yHi ? S.yHi - a - h : 0; if (s && Math.abs(ndy + s) <= reach + 1e-9) ndy += s; }
    }
    const nx0 = x + ndx - w / 2, ny0 = y + ndy - h / 2, nCost = costOf(ndx, ndy, r, ry, R), enough = bestScore * (1 + (R.keepBadFrac || 0)) + (R.keepBadPx || 0);
    if (badAt(nx0, ny0, nCost, R, pad) <= enough) return giveTo(o, nx0, ny0, false, nCost, kSide, ndx, ndy, true, ndx !== keep.dx || ndy !== keep.dy);
    // (pass 3, rules.nearFirst) of the places that cover at most keepBadPx more than the least covered one, the one
    // nearest the kept place, not the least covered anywhere round the ring: in the crowded top left corner at 800x600
    // the least covered place changed from frame to frame and the words followed it (up to 93 px a frame)
    if (R.nearFirst) {
      let near = null, nearD = Infinity;
      const nearEnough = bestScore + (R.keepBadPx || 0);
      for (let i = 0; i < offsets.length; i++) {
        const p = offsets[i], d = (p.dx - tdx) * (p.dx - tdx) + (p.dy - tdy) * (p.dy - tdy);
        if (!(d < nearD - 1e-9) || badAt(x + p.dx - w / 2, y + p.dy - h / 2, p.cost, R, pad) > nearEnough) continue;
        near = p; nearD = d;
      }
      if (near) return giveTo(o, x + near.dx - w / 2, y + near.dy - h / 2, false, near.cost, near.side, near.dx, near.dy, false, false);
    }
  }
  return giveTo(o, x + bestBad.dx - w / 2, y + bestBad.dy - h / 2, false, bestBad.cost, bestBad.side, bestBad.dx, bestBad.dy, false, false);
}

/* ---------------------------------------------------------------- where the "Brain" ring itself goes */

// 24 November 2026 (package HUD74; the hunt of Body update 73, finding 3). Steps 6 and 7 of the tutorial ("Hold Space on
// the brain, carry it, then release", "Drag the brain to turn it") mark the brain with a dashed ring and the word
// "Brain". The ring stood at the brain's turning point as drawn on the screen, whatever was drawn there: at 800x600
// and 1024x768 that is the mirror body's pelvis (the tip read "Sacrum · Space holds the mirror body", Space took the
// mirror body and the step stayed 6/9); from outside at 1280x720 and 1600x900 its left shoulder. The ring now goes
// where the game's own pick says a press takes the brain: the brain's bare glass (or the inside of its outline), not a
// motor area, not an arrow's tip, not the mirror body and not one of your limbs seen through the glass, where it can
// with bare brain all round it, clear of the labels, the arrows, the cards and the other cue marks, and with a clear
// place beside it for its word.
//
// The game hands in the pick (ns-app targetsAt, about 0.4 ms each on the test machine), so the search is spread over
// frames; the place found is kept as a point of the brain (in the brain's own frame), so the ring rides with the brain
// while it is looked at, carried or turned, and is tried again only when the pick there stops saying "brain".
/** The rule (display choices; CSS px unless said):
 * - ringPx: the ring's half size (guide-cues.css: 26 px across); ringRoomPx: the room round the place that must be
 *   the brain too at eight points (the ring and a little more); roomPx: the wider room of a "roomy" place, eight more
 *   points (and eight at midRoomPx between): bare brain well round the ring, so the ring is seen to be on the brain
 *   and on nothing else;
 * - gridFrac / gridMinPx: the grid of places tried, this share of the picture's shorter side apart. The roomy place
 *   nearest the brain's middle, with a clear place for its word, wins; places off the two bodies' boxes on the
 *   screen (`busy`) are tried first, since the bare brain is seldom between your limbs. With no roomy place (a small
 *   window), the nearest place with the middle room, else the nearest of the first `spare` places that are the brain
 *   with the ring's own room; one whose word has a clear place first;
 * - edgePx / topPx: the picture's edge and its top band, which the ring keeps inside (topPx leaves room for the word
 *   over the ring);
 * - padPx: the room between the ring and a keep-out box when a place is chosen (a place in use is given up only when
 *   a box reaches the ring itself);
 * - wordsW / wordsH: the box of the word "Brain" as guide-cues.css draws it, for the test that it has a clear place;
 * - msPerFrame, minPicks, maxPicks: the picks of one frame (at least minPicks, then until msPerFrame is spent, never
 *   more than maxPicks); a search goes on in the next frame where it stopped;
 * - checkEvery: frames between two picks at the place in use: one pick at a time, its middle and one of the eight
 *   points of the ring's room in turn (its middle every 2 x checkEvery frames, each point every 16 x checkEvery);
 * - retryFrames: frames to wait after a search that found no place (the brain out of sight, or all of it covered). */
export const BRAIN_CUE = Object.freeze({ on: true, ringPx: 13, ringRoomPx: 18, midRoomPx: 26, roomPx: 36, gridFrac: 1 / 14, gridMinPx: 34, edgePx: 34, topPx: 64, padPx: 6, spare: 12,
  wordsW: 42, wordsH: 19, msPerFrame: 2, minPicks: 3, maxPicks: 24, checkEvery: 5, retryFrames: 45 });

const fin = v => Number.isFinite(v);

/** The places tried, in the order they are tried (pure): [{ x, y }] in CSS px, a grid over the picture inside its
 * edges; first the places off every `busy` box ([{ x0, y0, x1, y1 }]: the two bodies as drawn), nearest the anchor
 * first, then the places on one. `anchor` ({ x, y } or null: the picture's middle) is where the brain's middle is
 * drawn. Empty for a picture too small to hold a grid. */
export function brainCueGrid({ width, height, anchor = null, busy = null, rules = BRAIN_CUE } = {}) {
  if (!(width > 0 && height > 0)) return [];
  const step = Math.max(rules.gridMinPx, Math.round(Math.min(width, height) * rules.gridFrac));
  const x0 = rules.edgePx, x1 = width - rules.edgePx, y0 = Math.max(rules.edgePx, rules.topPx), y1 = height - rules.edgePx;
  if (!(x1 > x0 && y1 > y0)) return [];
  const nx = Math.floor((x1 - x0) / step) + 1, ny = Math.floor((y1 - y0) / step) + 1;
  const ox = x0 + ((x1 - x0) - (nx - 1) * step) / 2, oy = y0 + ((y1 - y0) - (ny - 1) * step) / 2;
  const ax = anchor && fin(anchor.x) ? anchor.x : width / 2, ay = anchor && fin(anchor.y) ? anchor.y : height / 2;
  const list = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = Math.round(ox + i * step), y = Math.round(oy + j * step);
    list.push({ x, y, d: (x - ax) * (x - ax) + (y - ay) * (y - ay), busy: !clearOfBoxes(x, y, rules.ringPx, busy, 0) });
  }
  list.sort((p, q) => (p.busy ? 1 : 0) - (q.busy ? 1 : 0) || p.d - q.d);
  return list;
}

/** True when the square of half size `half` round (x, y), grown by `pad`, meets none of `boxes` ([{ x0, y0, x1, y1 }],
 * CSS px; a box that is not finite is passed over). Pure. */
export function clearOfBoxes(x, y, half, boxes, pad = 0) {
  if (!Array.isArray(boxes)) return true;
  const r = half + pad;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (!b || !(fin(b.x0) && fin(b.y0) && fin(b.x1) && fin(b.y1))) continue;
    if (x - r < b.x1 && x + r > b.x0 && y - r < b.y1 && y + r > b.y0) return false;
  }
  return true;
}

// the eight points round a place that must be the brain too, r px out
const discMemo = new Map();
function discOffsets(r) {
  let list = discMemo.get(r);
  if (list) return list;
  list = [];
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; list.push([Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r)]); }
  discMemo.set(r, list);
  return list;
}

/**
 * The ring's place from frame to frame. `step(input)` returns { x, y } (CSS px, the ring's middle) or null (no place:
 * none found yet, or the brain is not there). input:
 *  - frame: the frame's number; width, height: the picture (CSS px); view: any string that changes with the view
 *    (eye view or outside): the place in use is checked at once when it changes;
 *  - anchor: { x, y } where the brain's middle is drawn, or null;
 *  - pick(x, y): the game's pick there: { brain: true when a press takes the brain's bare glass or the inside of its
 *    outline, point: [x, y, z] the world point hit, plain: false on a named part of the brain (an eyeball, a nerve, a
 *    ventricle seen between the halves): such a place is no roomy one } (or null); maybe(x, y) (optional): false
 *    where the brain cannot be (outside its outline): no pick is spent there;
 *  - toLocal(point): that world point in the brain's own frame; project(local): where such a point is drawn now,
 *    { x, y } in CSS px, or null when it is not in the picture;
 *  - keepOut: boxes the ring keeps off ([{ x0, y0, x1, y1 }]); wordsKeepOut: the boxes its word keeps off (by
 *    default the same); half: the brain's midline for the word (ns-cue-place), or null; busy: the two bodies' boxes
 *    on the screen (places on them are tried last), or null;
 *  - hold: the brain is carried or turned now: the place is kept and nothing is picked; away: the camera is on its
 *    way between two views: no ring and no pick until it rests (the place is then checked at once, by `view`);
 *  - now(): a clock in ms for the frame's budget.
 */
export function createBrainCue(rules = BRAIN_CUE) {
  let place = null, search = null, waitUntil = -1, viewSeen = null;
  const give = { x: 0, y: 0 }, words = {};
  const stats = { searches: 0, picks: 0, found: 0, lost: 0, none: 0, roomy: false, searchPicks: 0, searchFrames: 0 };
  let used = 0, t0 = 0, clock = null;
  const spent = () => used >= rules.maxPicks || (used >= rules.minPicks && clock !== null && clock() - t0 >= rules.msPerFrame);
  const ask = (input, x, y) => { used++; stats.picks++; if (search) search.picks++; let r = null; try { r = input.pick(x, y); } catch { r = null; } return r && r.brain === true ? r : null; };
  const inside = (p, w, h) => p.x >= rules.edgePx && p.x <= w - rules.edgePx && p.y >= Math.max(rules.edgePx, rules.topPx) && p.y <= h - rules.edgePx;
  const out = p => { give.x = p.x; give.y = p.y; return give; };
  // the brain at eight points r px round (x, y)
  const roomAt = (input, x, y, r) => { for (const o of discOffsets(r)) if (!ask(input, x + o[0], y + o[1])) return false; return true; };
  const wordsClear = (input, x, y) => {
    const b = placeCueWords({ x, y, ringHalfPx: rules.ringPx, w: rules.wordsW, h: rules.wordsH, width: input.width, height: input.height,
      keepOut: Array.isArray(input.wordsKeepOut) ? input.wordsKeepOut : Array.isArray(input.keepOut) ? input.keepOut : [], half: input.half || null, out: words });
    return Boolean(b && b.clear);
  };
  // the place is taken when, picked afresh in this frame, it is the brain with the ring's own room
  const take = (input, c, roomy) => {
    const hit = ask(input, c.x, c.y);
    if (!hit || !roomAt(input, c.x, c.y, rules.ringRoomPx)) return false;
    let local = null;
    try { local = Array.isArray(hit.point) ? input.toLocal(hit.point) : null; } catch { local = null; }
    if (!Array.isArray(local) || local.length !== 3 || !local.every(fin)) return false;
    place = { local, checkedAt: input.frame, x: c.x, y: c.y, seq: 0 };
    stats.found++; stats.roomy = roomy; stats.searchPicks = search ? search.picks : 0; stats.searchFrames = search ? input.frame - search.startedAt + 1 : 0;
    search = null;
    return true;
  };
  function runSearch(input) {
    if (!search) {
      search = { list: brainCueGrid({ width: input.width, height: input.height, anchor: input.anchor, busy: input.busy, rules }), i: 0, stage: 0, plain: true, spare: [], spareAt: -1, pass: 0, picks: 0, startedAt: input.frame };
      stats.searches++;
    }
    const Q = search;
    // one place at a time, in four steps (its middle, the ring's room, the middle room, the wide room), each whole
    // within a frame
    while (Q.i < Q.list.length) {
      if (spent()) return false; // (goes on in the next frame, at this step)
      const c = Q.list[Q.i];
      if (Q.stage === 0) {
        if (!clearOfBoxes(c.x, c.y, rules.ringPx, input.keepOut, rules.padPx) || (typeof input.maybe === 'function' && input.maybe(c.x, c.y) === false)) { Q.i++; continue; }
        const hit = ask(input, c.x, c.y);
        if (!hit) { Q.i++; continue; }
        Q.plain = hit.plain !== false; Q.stage = 1;
        continue;
      }
      if (Q.stage === 1) {
        if (!roomAt(input, c.x, c.y, rules.ringRoomPx)) { Q.i++; Q.stage = 0; continue; }
        Q.stage = 2;
        continue;
      }
      if (Q.stage === 2) {
        // (a named part of the brain, or no middle room: a place with the ring's own room only)
        if (!Q.plain || !roomAt(input, c.x, c.y, rules.midRoomPx)) { Q.i++; Q.stage = 0; if (Q.spare.length < rules.spare) Q.spare.push({ c, mid: false }); continue; }
        Q.stage = 3;
        continue;
      }
      const roomy = roomAt(input, c.x, c.y, rules.roomPx);
      Q.i++; Q.stage = 0;
      if (roomy && wordsClear(input, c.x, c.y)) { if (take(input, c, true)) return true; continue; }
      if (Q.spare.length < rules.spare || !Q.spare.some(e => e.mid)) Q.spare.push({ c, mid: true });
    }
    // no roomy place with a clear place for its word: of the places kept, the nearest with the middle room and a clear
    // place for its word, then any with the middle room, then the nearest whose word has a clear place, then any
    if (Q.spareAt < 0) Q.spareAt = 0;
    for (; Q.pass < 4; Q.pass++, Q.spareAt = 0) {
      while (Q.spareAt < Q.spare.length) {
        if (spent()) return false;
        const e = Q.spare[Q.spareAt++];
        if ((Q.pass < 2) !== e.mid) continue;
        if (!clearOfBoxes(e.c.x, e.c.y, rules.ringPx, input.keepOut, rules.padPx)) continue;
        if ((Q.pass === 0 || Q.pass === 2) && !wordsClear(input, e.c.x, e.c.y)) continue;
        if (take(input, e.c, false)) return true;
      }
    }
    search = null; stats.none++; waitUntil = input.frame + rules.retryFrames;
    return false;
  }
  return {
    step(input) {
      if (!rules.on || !input || !(input.width > 0 && input.height > 0) || typeof input.pick !== 'function' || typeof input.project !== 'function' || typeof input.toLocal !== 'function' || !fin(input.frame)) return null;
      used = 0; clock = typeof input.now === 'function' ? input.now : null; t0 = clock ? clock() : 0;
      const view = `${input.width}x${input.height}|${input.view || ''}`, hold = input.hold === true;
      if (input.away === true) { viewSeen = null; search = null; return null; }
      if (place) {
        let p = null;
        try { p = input.project(place.local); } catch { p = null; }
        const on = Boolean(p) && fin(p.x) && fin(p.y);
        if (hold) { viewSeen = view; return on && p.x >= 0 && p.x <= input.width && p.y >= 0 && p.y <= input.height ? out(p) : null; }
        let ok = on && inside(p, input.width, input.height) && clearOfBoxes(p.x, p.y, rules.ringPx, input.keepOut, 0);
        if (ok && view !== viewSeen) {
          // another view, or the camera at rest again: the whole of it at once
          place.checkedAt = input.frame;
          ok = Boolean(ask(input, p.x, p.y)) && roomAt(input, p.x, p.y, rules.ringRoomPx);
        } else if (ok && input.frame - place.checkedAt >= rules.checkEvery) {
          // one pick: the place's middle and, in turn, one of the eight points of the ring's room
          place.checkedAt = input.frame;
          const n = place.seq++, D = discOffsets(rules.ringRoomPx), o = n % 2 ? D[(n >> 1) % D.length] : null;
          ok = Boolean(o ? ask(input, p.x + o[0], p.y + o[1]) : ask(input, p.x, p.y));
        }
        viewSeen = view;
        if (ok) return out(p);
        place = null; stats.lost++; waitUntil = -1;
      }
      if (hold) return null;
      if (view !== viewSeen) { viewSeen = view; search = null; waitUntil = -1; }
      if (input.frame < waitUntil) return null;
      if (!runSearch(input) || !place) return null;
      let p = null;
      try { p = input.project(place.local); } catch { p = null; }
      return p && fin(p.x) && fin(p.y) ? out(p) : out(place);
    },
    /** Forgets the place (the cue is not shown): the next step searches afresh. */
    reset() { place = null; search = null; waitUntil = -1; viewSeen = null; },
    /** For checks: { placed, searching, ...counts }. */
    state() { return { placed: Boolean(place), searching: Boolean(search), ...stats }; }
  };
}
