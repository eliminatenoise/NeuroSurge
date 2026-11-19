/** The brain turned half a turn, and the two eyeballs with their nerves at its front (19 November 2026).
 *
 * The owner: "invert the brain altogether so that the motor strip changed direction. But to make clear the direction of
 * the body, let's also include eyeballs with nerves connected to the brain."; "turning it 180 degrees, such that the U
 * becomes an inverted U, almost an N. Lowercase n, that is."; "the eyeballs will be at the bottom."
 *
 * Pure numbers and rules: the drawn axes of the turned brain (ns-brain BRAIN_VIEW.spinDeg, frameBrain,
 * brainViewTransform), the two fit rules added for the new start picture (motorCeilNdc, motorKeepPoints), the words that
 * name a side, and the eyeball / nerve meshes (ns-brain-eyes) against the atlas's own brain and eye meshes in the
 * source packets. No browser, no pixels (the pictures are in the package notes). Nothing here is biological evidence:
 * the eyeballs are an illustration of the brain's facing and say so.
 * Run: node --test tests/brain-turn.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import * as NB from '../scene/src/ns-brain.mjs';
import * as NE from '../scene/src/ns-brain-eyes.mjs';
import { HEMI_GAP, hemisphereSideOf } from '../scene/src/ns-brain-part.mjs';
import * as NT from '../scene/src/ns-text.mjs';
import { BRAIN_FRONT_DOWN, BRAIN_START, BRAIN_FLOOR, BRAIN_START_MOTOR_FRAC, brainFloorNdc, brainStartCeilNdc, areaChain } from '../scene/src/ns-app.mjs';
import { ORIENTATION_ALIGN } from '../scene/src/ns-scene-three.mjs';

/** A small stand-in for the two motor strips: an arch on each half of a brain 140 mm wide, its inner end (the leg end)
 * further BACK (+y) and higher than its outer end, as on the atlas. Source frame: +x left, +y posterior, +z superior. */
function strips() {
  const out = [];
  for (const side of [-1, 1]) {
    const p = [];
    for (let i = 0; i <= 12; i++) for (let j = 0; j <= 2; j++) {
      const t = i / 12;
      p.push(side * (2 + 62 * t), -40 - 65 * t + 6 * j, 1626 - 65 * t * t);
    }
    out.push({ positions: Float64Array.from(p), indices: null });
  }
  return out;
}
const BOUNDS = { min: [-70, -170, 1465], max: [69, 10, 1630] };
const frameOf = (o = {}) => NB.frameBrain(strips(), { aspect: 16 / 9, fovYDeg: 54, brainBounds: BOUNDS, viewportPx: { width: 1600, height: 900 }, ...o });
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

test('the game draws the brain turned half a turn: front down, its right half on the left, its top toward the player', () => {
  assert.equal(NB.BRAIN_VIEW.spinDeg, 180);
  assert.equal(BRAIN_FRONT_DOWN, true);
  const f = frameOf();
  assert.equal(f.spinDeg, 180);
  const v = NB.brainViewTransform({ frame: f });
  assert.equal(v.spinDeg, 180);
  // the drawn anatomical axes, in world axes (x to the right of the picture, y up, z toward the camera)
  assert.ok(v.axes.anterior[1] < -0.999, 'the front points DOWN the picture');
  assert.ok(v.axes.subjectRight[0] < -0.999, 'the brain\'s right half is on the LEFT of the picture');
  assert.ok(v.axes.superior[2] > 0.999, 'the top of the brain still faces the player');
  // a turn, never a mirror image
  const m = v.matrix, det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[4] * (m[1] * m[10] - m[2] * m[9]) + m[8] * (m[1] * m[6] - m[2] * m[5]);
  assert.ok(det > 0);
});

test('spinDeg 0 is the earlier picture, and the turn is exactly a half turn about the axis toward the camera', () => {
  const f0 = frameOf({ spinDeg: 0, motorCentreNdc: [0, 0], motorFrac: 0.4 }), f1 = frameOf({ spinDeg: 180, motorCentreNdc: [0, 0], motorFrac: 0.4 });
  const v0 = NB.brainViewTransform({ frame: f0 }), v1 = NB.brainViewTransform({ frame: f1 });
  assert.ok(v0.axes.anterior[1] > 0.999 && v0.axes.subjectRight[0] > 0.999 && v0.axes.superior[2] > 0.999);
  // the same size on screen: the strip's box is the same box, turned about its own middle
  assert.ok(near(f0.k, f1.k, 1e-9 * f0.k), 'the same scale');
  const b0 = f0.ndcBounds, b1 = f1.ndcBounds;
  assert.ok(near(b0.x1 - b0.x0, b1.x1 - b1.x0, 1e-6) && near(b0.y1 - b0.y0, b1.y1 - b1.y0, 1e-6));
  // every direction of the brain is drawn with its picture-plane part reversed and its depth kept
  for (const d of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.3, -0.5, 0.8]]) {
    const a = [0, 1, 2].map(r => v0.rotation[r] * d[0] + v0.rotation[3 + r] * d[1] + v0.rotation[6 + r] * d[2]);
    const b = [0, 1, 2].map(r => v1.rotation[r] * d[0] + v1.rotation[3 + r] * d[1] + v1.rotation[6 + r] * d[2]);
    assert.ok(near(a[0], -b[0], 1e-12) && near(a[1], -b[1], 1e-12) && near(a[2], b[2], 1e-12));
  }
  // the comparison framings of earlier rounds keep the earlier direction
  for (const old of [NB.BRAIN_VIEW_R5, NB.BRAIN_VIEW_R4, NB.BRAIN_VIEW_R3]) assert.equal(old.spinDeg, 0);
  assert.throws(() => frameOf({ spinDeg: NaN }));
});

test('the strip is now an n: the leg end of each half is above its face end in the picture', () => {
  const v = NB.brainViewTransform({ frame: frameOf() });
  const leg = NB.viewSourceToWorld([20, -40, 1626], v), face = NB.viewSourceToWorld([64, -105, 1561], v);
  assert.ok(leg[1] > face[1], 'the inner (leg) end is higher in the picture than the outer (face) end');
  // and an area of the brain's RIGHT half (x < 0, which moves the LEFT side of the body) is on the left of the picture
  const rightHalf = NB.viewSourceToWorld([-40, -70, 1600], v), leftHalf = NB.viewSourceToWorld([40, -70, 1600], v);
  assert.ok(rightHalf[0] < 0 && leftHalf[0] > 0);
});

test('the arrows still bring round the side they stand on; with the turn the upper one shows the BACK, and the words say so', () => {
  const f = frameOf();
  const rest = NB.brainViewTransform({ frame: f }), up = NB.brainViewTransform({ frame: f, orbitPitch: 15 }), right = NB.brainViewTransform({ frame: f, orbitYaw: 15 });
  const depth = (v, p) => NB.viewSourceToWorld(p, v)[2] - v.pivotWorld[2]; // toward the camera, from the brain's centre
  const back = [0, BOUNDS.max[1], 1560], front = [0, BOUNDS.min[1], 1560];
  assert.ok(depth(up, back) > depth(rest, back) && depth(up, front) < depth(rest, front), 'the upper ("forward") arrow brings the back toward you');
  const onRight = [BOUNDS.max[0], -80, 1560]; // the brain's LEFT half, on the right of the picture
  assert.ok(depth(right, onRight) > depth(rest, onRight), 'the right arrow brings the side on your right toward you');
  assert.match(NT.ARROWS.brain.tip.forward, /back/);
  assert.match(NT.ARROWS.brain.tip.back, /front/);
  assert.match(NT.ARROWS.brain.label.forward, /its back faces you/);
  assert.match(NT.ARROWS.brain.label.back, /its front faces you/);
  assert.match(NT.ORBIT.tip.forward, /back/);
  assert.match(NT.ARROWS.brain.tip.left, /on your left/);
});

test('the labels of the brain\'s sides and ends name the brain\'s own half and extend away from the brain', () => {
  assert.match(NT.ORIENTATION.right, /right half/);
  assert.match(NT.ORIENTATION.left, /left half/);
  assert.ok(!/[←→]/.test(NT.ORIENTATION.right + NT.ORIENTATION.left), 'no arrow that would point away from the half it names');
  assert.match(NT.ORIENTATION.anterior, /Front.*↓/);
  assert.match(NT.ORIENTATION.posterior, /↑.*Back/);
  // (x share of the label left of its anchor, y share above it): the right-half label is on the LEFT and extends left
  assert.deepEqual([...ORIENTATION_ALIGN.right], [1, 0.5]);
  assert.deepEqual([...ORIENTATION_ALIGN.left], [0, 0.5]);
  assert.deepEqual([...ORIENTATION_ALIGN.anterior], [0.5, 0]);
  assert.deepEqual([...ORIENTATION_ALIGN.posterior], [0.5, 1]);
  assert.match(NT.HUD.view, /front at the bottom/);
});

test('the walk of the arrow keys keeps its order: the step itself follows where the two halves are drawn', () => {
  // (areaStep in ns-app reads the side from the drawn brain at each press; reversing this list as well turned the keys
  // round in the browser. The order is the one tests/area-step.test.mjs pins.)
  const c = areaChain([{ id: 'b', hemisphere: 'right', order: 1 }, { id: 'a', hemisphere: 'left', order: 0 }, { id: 'c', hemisphere: 'left', order: 2 }]);
  assert.deepEqual([...c], ['c', 'a', 'b']);
});

test('the start framing: the top of the n ends against its ceiling and its lower ends stay above the floor', () => {
  // (the ceiling is the height at which the leg areas are level with the mirror body's head: see the next test)
  const ceil = brainStartCeilNdc({ fovYDeg: 54 });
  assert.ok(BRAIN_START.topAimNdc > ceil, 'the aim is above the ceiling, so the strip ends against it');
  assert.equal(brainFloorNdc({ width: 1600, height: 900 }), BRAIN_FLOOR.startNdc);
  assert.ok(BRAIN_FLOOR.startNdc < ceil);
  const fo = { motorCentreNdc: [0, BRAIN_START.topAimNdc], motorFrac: BRAIN_START_MOTOR_FRAC, motorFloorNdc: BRAIN_FLOOR.startNdc, motorCeilNdc: ceil };
  const f = frameOf(fo), b = f.beltFit.beltBoxNdc;
  assert.equal(f.fit, 'motor');
  assert.ok(near(b.y1, ceil, 1e-5), 'the top of the strip is at the ceiling');
  assert.ok(b.y0 >= BRAIN_FLOOR.startNdc - 1e-6, 'its lower ends are above the floor');
  assert.ok(b.x0 > -1 && b.x1 < 1 && near((b.x0 + b.x1) / 2, 0, 1e-5), 'the whole strip is in the picture, in the middle');
  assert.ok(f.beltFit.beltWidthFrac <= BRAIN_START_MOTOR_FRAC + 1e-6, 'never wider than its largest share');
  // a ceiling may pass the frame's top a little (a camera that stands back sees this picture smaller), not without limit
  assert.throws(() => frameOf({ ...fo, motorCeilNdc: 1.6 }));
  // with a lower ceiling the strip no longer fits at that share: the whole brain is drawn smaller, the height decides
  const g = frameOf({ ...fo, motorCeilNdc: 0.2 });
  assert.equal(g.beltFit.limiting, 'height');
  assert.ok(g.k < f.k && near(g.beltFit.beltBoxNdc.y1, 0.2, 1e-5) && near(g.beltFit.beltBoxNdc.y0, BRAIN_FLOOR.startNdc, 1e-5));
});

test('the ceiling puts the middle of the leg areas at the height of the mirror body\'s head, whatever decides the strip\'s size', () => {
  // The owner: "let's center the motor strip on either side of the head of the mirror body ... almost hair coming out
  // of either side of the mirror body's head." The head's height is a fixed angle above the brain's own direction
  // (the mirror body is the literal reflection and the look is the launcher's; neither moves for this).
  const R = BRAIN_START, tanHalf = Math.tan(27 * Math.PI / 180), head = Math.tan(R.headUpDeg * Math.PI / 180) / tanHalf;
  assert.ok(R.headUpDeg > 5 && R.headUpDeg < 15 && R.legShare > 0.1 && R.legShare < 0.2);
  // the height decides (a 16:9 window): the strip fills the room between the floor and the ceiling
  const c = brainStartCeilNdc({ fovYDeg: 54 });
  assert.ok(near(c, 0.49, 2e-3), `the ceiling of a 16:9 window (${c})`);
  assert.ok(near(c - R.legShare * (c - BRAIN_FLOOR.startNdc), head, 2e-4), 'legShare of the strip\'s height below its top is the head');
  // the width decides (a 4:3 or upright window): the strip is shorter, and its top comes down to keep that true
  const short = brainStartCeilNdc({ fovYDeg: 54, stripHeightNdc: 0.5 });
  assert.ok(short < c && near(short - R.legShare * 0.5, head, 2e-4));
  // a wider lens (an upright window) shows the same head lower in the picture's own units
  assert.ok(brainStartCeilNdc({ fovYDeg: 70 }) < c);
  assert.throws(() => brainStartCeilNdc({}));
  // the strip's share of the width counts the gap between the two halves
  assert.equal(BRAIN_START_MOTOR_FRAC, 0.64);
});

test('keeping the eyeballs in the start picture is possible and costs size: the choice the game does not take', () => {
  assert.equal(BRAIN_START.keepEyes, false);
  const keep = NE.eyeKeepPoints();
  assert.equal(keep.length, 2 * 6 * 3);
  const fo = { motorCentreNdc: [0, 0.85], motorFrac: BRAIN_START_MOTOR_FRAC, motorFloorNdc: -0.36, motorCeilNdc: 0.9 };
  const plain = frameOf(fo), kept = frameOf({ ...fo, motorKeepPoints: keep });
  const kb = kept.beltFit.keepBoxNdc;
  assert.ok(kb && kb.y0 >= -0.36 - 1e-5, 'the eyeballs stay above the floor');
  assert.ok(kb.y1 < kept.beltFit.beltBoxNdc.y0, 'they hang below the strip: the brain\'s front is at the bottom');
  assert.ok(near(kept.beltFit.beltBoxNdc.y1, 0.9, 1e-5), 'the strip\'s top stays at the ceiling');
  assert.equal(kept.beltFit.limiting, 'height');
  assert.ok(kept.k < 0.7 * plain.k, 'and the whole brain is drawn far smaller (the strip here: less than 0.7 of its size without them)');
  assert.equal(plain.beltFit.keepBoxNdc, null);
});

/* ---- the eyeballs and their nerves against the atlas ------------------------------------------------------------ */

const E = NE.BRAIN_EYES;
const root = new URL('../', import.meta.url);
const objVertices = rel => {
  const out = [];
  for (const line of readFileSync(new URL(rel, root), 'utf8').split('\n')) {
    if (line[0] !== 'v' || line[1] !== ' ') continue;
    const a = line.split(/\s+/); out.push(Number(a[1]), Number(a[2]), Number(a[3]));
  }
  return out;
};
let brainCache = null;
function atlasBrain() {
  if (brainCache) return brainCache;
  const manifest = JSON.parse(readFileSync(new URL('inputs/MESH-MANIFEST.json', root), 'utf8'));
  const P = [];
  for (const a of manifest.assets) {
    if (!(a.groups || []).includes('brain')) continue;
    const rel = existsSync(new URL(`packets/pov-demo-assets/${a.path}`, root)) ? `packets/pov-demo-assets/${a.path}` : `packets/pov-demo-assets-r2/${a.path}`;
    // the brain as the game draws it: each cerebral half moved HEMI_GAP.eachMm away from the midline (ns-brain-part)
    const V = objVertices(rel), d = hemisphereSideOf({ name: a.embedded_source_name, positions: V }) * HEMI_GAP.eachMm;
    for (let i = 0; i < V.length; i += 3) P.push(V[i] + d, V[i + 1], V[i + 2]);
  }
  // the lowest brain surface over each 4 mm cell of the top view, and the foremost point of each 4 mm column
  const under = new Map(), front = new Map();
  for (let i = 0; i < P.length; i += 3) {
    const kx = Math.round(P[i] / 4), key = `${kx},${Math.round(P[i + 1] / 4)}`;
    if (!under.has(key) || P[i + 2] < under.get(key)) under.set(key, P[i + 2]);
    if (!front.has(kx) || P[i + 1] < front.get(kx)) front.set(kx, P[i + 1]);
  }
  let minY = Infinity; for (let i = 1; i < P.length; i += 3) minY = Math.min(minY, P[i]);
  brainCache = { under, front, minY, count: P.length / 3 };
  return brainCache;
}
/** The atlas brain's underside (mm) over the top-view point (x, y): the lowest surface within about 6 mm, or null where
 * the brain is not above that point. */
function undersideAt(x, y) {
  const B = atlasBrain(); let lo = Infinity;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const z = B.under.get(`${Math.round(x / 4) + dx},${Math.round(y / 4) + dy}`); if (z !== undefined && z < lo) lo = z; }
  return Number.isFinite(lo) ? lo : null;
}

test('the eyeballs stand where the atlas has its eyes, sideways and in height, and 30 mm further forward', () => {
  // the atlas's own scleras (the head packet, the same frame as the brain): the left one is FJ1317
  const L = objVertices('packets/bodyparts3d-head-r1/meshes/FJ1317.obj');
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < L.length; i += 3) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], L[i + a]); hi[a] = Math.max(hi[a], L[i + a]); }
  const c = [0, 1, 2].map(a => (lo[a] + hi[a]) / 2);
  const mine = NE.eyeCentres();
  assert.ok(Math.abs(mine.left[0] - (c[0] + HEMI_GAP.eachMm)) < 0.5, 'as far from the midline as the atlas eye, and moved out with its half of the brain');
  assert.equal(E.partMm, HEMI_GAP.eachMm);
  assert.ok(Math.abs(mine.left[2] - c[2]) < 0.5, 'as high as the atlas eye');
  assert.ok(Math.abs((c[1] - mine.left[1]) - E.forwardMm) < 0.5, 'moved straight forward by forwardMm, and by nothing else');
  assert.equal(E.forwardMm, 30);
  assert.ok(Math.abs((mine.left[0] + mine.right[0]) / 2 - E.midlineXmm) < 1e-9 && mine.left[1] === mine.right[1] && mine.left[2] === mine.right[2], 'a mirror pair about the brain\'s midline');
  // "about 24 mm across": the atlas scleras are 24.6 to 26.3 mm across
  assert.ok(2 * E.radiusMm >= 23 && 2 * E.radiusMm <= 26.5);
  for (let a = 0; a < 3; a++) assert.ok(hi[a] - lo[a] > 24 && hi[a] - lo[a] < 27);
  // in the atlas the eye lies UNDER the frontal lobes (hidden from above): that is why it is moved forward
  const B = atlasBrain();
  assert.ok(lo[1] > B.minY, 'the atlas eye\'s own front is behind the front of the atlas brain');
});

test('seen from above, each eyeball is clear of the brain and some of its nerve shows between them', () => {
  const B = atlasBrain(), m = NE.buildEyeballs(), P = m.positions;
  assert.ok(B.count > 100000, 'the atlas brain was read');
  let backMost = -Infinity;
  for (let i = 0; i < P.length; i += 3) {
    backMost = Math.max(backMost, P[i + 1]);
    const f = B.front.get(Math.round(P[i] / 4));
    if (f !== undefined) assert.ok(P[i + 1] < f - 3, 'every point of an eyeball is in front of the brain\'s edge in its own column');
  }
  const c = NE.eyeCentres().left, edge = B.front.get(Math.round(c[0] / 4));
  const shown = edge - (c[1] + E.radiusMm);
  assert.ok(shown >= 6 && shown <= 14, `about 9 mm of nerve between the eyeball and the brain's edge (${shown.toFixed(1)})`);
  assert.ok(Math.abs(backMost - (c[1] + E.radiusMm)) < 0.6);
});

test('the eyes look forward and up at whoever looks at the brain from above', () => {
  const g = NE.eyeGaze();
  assert.ok(near(Math.hypot(...g), 1, 1e-12) && g[0] === 0 && g[1] < -0.6 && g[2] > 0.5, 'forward (-y) and upward (+z)');
  assert.equal(E.gazeUpDeg, 40);
  // the pupil is where the look points; the white is everywhere away from it
  const m = NE.buildEyeballs(), c = m.centres.left, P = m.positions, C = m.colors;
  let darkest = Infinity, dark = -1;
  for (let i = 0; i < P.length / 2; i += 3) { const s = C[i] + C[i + 1] + C[i + 2]; if (s < darkest) { darkest = s; dark = i; } }
  const d = [P[dark] - c[0], P[dark + 1] - c[1], P[dark + 2] - c[2]], l = Math.hypot(...d);
  assert.ok((d[0] * g[0] + d[1] * g[1] + d[2] * g[2]) / l > 0.97, 'the pupil sits on the look\'s own axis');
  let white = 0, n = 0;
  for (let i = 0; i < P.length / 2; i += 3) { const q = [P[i] - c[0], P[i + 1] - c[1], P[i + 2] - c[2]]; if ((q[0] * g[0] + q[1] * g[1] + q[2] * g[2]) < 0) { n++; if (C[i] > 0.7 && C[i + 1] > 0.4) white++; } }
  assert.ok(n > 100 && white === n, 'the back half of the eyeball is pale');
});

test('each nerve runs under the brain from its eyeball and comes out into the gap between the halves, never through the brain on the way', () => {
  const P = NE.nerveParts(), m = E.midlineXmm;
  for (const [key, side] of [['left', 1], ['right', -1]]) {
    const path = P.nerve[key], c = NE.eyeCentres()[key], last = path.length - 1;
    assert.ok(Math.hypot(path[0][0] - c[0], path[0][1] - c[1], path[0][2] - c[2]) < E.radiusMm, 'it starts inside the eyeball: no gap');
    // from the brain's edge on, the tube's top stays below the brain's underside (the brain as the game draws it); on
    // its last stretch it comes up beside the brain's inner wall into the gap (within a few mm of that wall's foot)
    for (let i = 1; i <= last; i++) for (let t = 0; t <= 1; t += 0.25) {
      const a = path[i - 1], b = path[i], p = [0, 1, 2].map(k => a[k] + (b[k] - a[k]) * t);
      const u = undersideAt(p[0], p[1]);
      if (u === null) continue;
      if (i < last) assert.ok(p[2] + E.nerve.radiusMm < u, `under the brain at ${p.map(v => v.toFixed(0))} (underside ${u.toFixed(0)})`);
      else assert.ok(p[2] + E.nerve.radiusMm < u + 3, `beside the brain at ${p.map(v => v.toFixed(0))} (underside ${u.toFixed(0)})`);
    }
    // it ends in the gap: nearer the midline than the inner wall of its half (which is drawn eachMm out)
    assert.ok(side * (path[last][0] - m) > 0 && Math.abs(path[last][0] - m) < HEMI_GAP.eachMm, 'the nerve comes out into the gap, on its own side');
  }
  // the two sides are mirror images about the midline
  for (let i = 0; i < P.nerve.left.length; i++) { const l = P.nerve.left[i], r = P.nerve.right[i]; assert.ok(near(l[0] - m, -(r[0] - m), 1e-9) && l[1] === r[1] && l[2] === r[2]); }
});

test('at the chiasm each nerve parts in two: one strand crosses, one over the other, and one stays; the crossing shows from above', () => {
  const P = NE.nerveParts(), m = E.midlineXmm, ch = E.chiasm;
  for (const [key, side] of [['left', 1], ['right', -1]]) {
    const end = P.nerve[key][P.nerve[key].length - 1], X = P.crossing[key], U = P.uncrossed[key];
    // both strands start inside the nerve's end, side by side: the crossing one toward the midline, the other away from it
    assert.ok(Math.hypot(X[0][0] - end[0], X[0][1] - end[1], X[0][2] - end[2]) < E.nerve.endRadiusMm, 'the crossing strand starts inside the nerve\'s end');
    assert.ok(Math.hypot(U[0][0] - end[0], U[0][1] - end[1], U[0][2] - end[2]) < E.nerve.endRadiusMm, 'and so does the one that stays');
    assert.ok(side * (U[0][0] - X[0][0]) > 1, 'side by side, the uncrossed one outermost');
    assert.ok(near(X[1][0], m, 1e-9), 'it passes through the midline');
    assert.ok(side * (X[2][0] - m) < 0, 'and ends on the OTHER side');
    assert.ok(U.every(p => side * (p[0] - m) > 0), 'the uncrossed strand stays on its own side');
    assert.ok(Math.abs(U[1][0] - m) > Math.abs(X[1][0] - m) + ch.crossRadiusMm + ch.sideRadiusMm, 'and passes clear of the crossing');
    assert.deepEqual(U[2], P.crossing[key === 'left' ? 'right' : 'left'][2], 'a tract begins where its own uncrossed strand and the other eye\'s crossed one meet');
  }
  // one passes over the other with room between them, so it reads as a crossing and not as one lump
  const over = P.crossing.left[1][2] - P.crossing.right[1][2];
  assert.ok(near(over, 2 * ch.overMm, 1e-9) && over > 1.2 && over < 2 * ch.crossRadiusMm, 'the left eye\'s strand lies on the right eye\'s');
  assert.ok(ch.crossRadiusMm > ch.sideRadiusMm && ch.crossRadiusMm < E.nerve.radiusMm);
  assert.ok(ch.shade > 0.4 && ch.shade < 0.9, 'the lower strand is darkened under the upper one');
  // seen from above the crossing lies in the open gap: no brain point is over (or under) the 4 mm cell it is in, and
  // it lies in front of the hypothalamus, which would hide it
  const B = atlasBrain();
  assert.equal(B.under.get(`${Math.round((m + ch.crossMm[0]) / 4)},${Math.round(ch.crossMm[1] / 4)}`), undefined, 'nothing of the brain covers the crossing');
  assert.ok(ch.crossMm[1] < -112, 'in front of the hypothalamus (whose front is at y -110)');
  assert.ok(Math.abs(ch.inMm[0]) < HEMI_GAP.eachMm && Math.abs(ch.outMm[0]) < HEMI_GAP.eachMm, 'the whole X is inside the gap');
});

test('behind the chiasm each tract fans into three thin bundles that end inside the brain', () => {
  const P = NE.nerveParts(), m = E.midlineXmm, tr = E.tract;
  for (const [key, side] of [['left', 1], ['right', -1]]) {
    const T = P.tract[key];
    assert.equal(T.length, 3);
    for (const b of T) {
      assert.deepEqual(b[0], T[0][0], 'the bundles leave the chiasm together');
      const end = b[b.length - 1], uEnd = undersideAt(end[0], end[1]);
      assert.ok(side * (end[0] - m) > Math.abs(b[0][0] - m) && end[1] > b[0][1], 'back and outward');
      assert.ok(uEnd !== null && end[2] > uEnd, 'each bundle ends inside the brain (it is not left hanging in the open)');
    }
    const spread = Math.hypot(T[0][2][0] - T[2][2][0], T[0][2][1] - T[2][2][1]);
    assert.ok(near(spread, 2 * tr.fanMm, 1e-6), 'the outer two end 2 x fanMm apart');
    const mid = Math.hypot(T[0][1][0] - T[2][1][0], T[0][1][1] - T[2][1][1]);
    assert.ok(mid < 0.4 * spread, 'they stand apart only toward the end: a fan');
    assert.ok(tr.endRadiusMm < tr.radiusMm);
  }
});

test('the nerve wears a sheath where it leaves the eyeball, is striped along its length and carries two fine vessels', () => {
  const N = E.nerve, m = NE.buildNerves(), P = m.positions, around = N.around;
  // the first tube in the mesh is the left nerve: ring i has `around` points round its centre line; a tube of n rings
  // has 2 x around x (n - 1) triangles and `around` more in the cone that closes its end
  const rings = (m.counts.nerve / 2 - around) / (2 * around) + 1;
  assert.ok(Number.isInteger(rings) && rings > 15 && rings < 40, `${rings} rings`);
  const centre = i => { const c = [0, 0, 0]; for (let j = 0; j < around; j++) for (let a = 0; a < 3; a++) c[a] += P[3 * (i * around + j) + a] / around; return c; };
  const radius = i => { const c = centre(i); let r = 0; for (let j = 0; j < around; j++) r += Math.hypot(P[3 * (i * around + j)] - c[0], P[3 * (i * around + j) + 1] - c[1], P[3 * (i * around + j) + 2] - c[2]) / around; return r; };
  const eye = NE.eyeCentres().left, fromEye = i => Math.hypot(...centre(i).map((v, a) => v - eye[a]));
  // where it leaves the eyeball it is at least half as thick again as the nerve itself, and it tapers
  let atExit = 0; while (atExit < rings && fromEye(atExit) < E.radiusMm) atExit++;
  assert.ok(atExit > 0 && radius(atExit) > 1.5 * N.radiusMm, `thick at the eyeball (${radius(atExit).toFixed(2)} mm)`);
  for (let i = atExit; i + 1 < rings; i++) assert.ok(radius(i + 1) <= radius(i) + 1e-3, 'it never thickens again');
  // the sheath ends in a small step: one ring to the next loses most of stepMm at once
  let step = 0, at = -1;
  for (let i = atExit; i + 1 < rings; i++) { const d = radius(i) - radius(i + 1), gap = Math.hypot(...centre(i).map((v, a) => v - centre(i + 1)[a])); if (gap < 0.8 && d > step) { step = d; at = i; } }
  assert.ok(step > 0.6 * N.sheath.stepMm, `the sleeve's end is a step (${step.toFixed(2)} mm)`);
  const stepFromEye = fromEye(at) - E.radiusMm;
  assert.ok(stepFromEye > 3 && stepFromEye < 7, `a few millimetres from the eyeball (${stepFromEye.toFixed(1)}), so the step and the striped nerve beyond it show before the brain's edge`);
  assert.ok(Math.abs(radius(at + 4) - N.radiusMm) < 0.02, 'beyond it the nerve has its own thickness');
  assert.ok(Math.abs(radius(rings - 1) - N.endRadiusMm) < 0.02 && N.endRadiusMm < N.radiusMm, 'and it narrows a little where it parts in two');
  // fibre lines: along the nerve every second line is darker
  const C = m.colors, k = (rings - 3) * around, lum = j => C[3 * (k + j)] + C[3 * (k + j) + 1] + C[3 * (k + j) + 2];
  assert.ok(near(lum(1) / lum(0), 1 - N.stripe, 1e-6) && near(lum(2), lum(0), 1e-9));
  // the vessels: thin, red, and lying ON the nerve (their centre line just outside its surface), on its upper half
  const V = E.vessels;
  assert.equal(V.anglesDeg.length, 2);
  assert.ok(V.radiusMm < 0.25 * N.radiusMm && V.sinkMm < V.radiusMm);
  for (const [a0, a1] of V.anglesDeg) assert.ok(Math.abs(a0) + V.waveDeg < 80 && Math.abs(a1) + V.waveDeg < 80, 'within 80 degrees of the upper side: seen from above');
  assert.ok(m.counts.vessels > 0 && m.counts.nerve > 0 && m.counts.chiasm > 0 && m.counts.tract > 0);
  const red = NE.hexLinear(E.colors.vessel); assert.ok(red[0] > 3 * red[1] && red[0] > 3 * red[2]);
});

test('the meshes are sound and light: closed tubes, outward, under five thousand triangles in all', () => {
  let total = 0;
  for (const m of [NE.buildEyeballs(), NE.buildNerves()]) {
    const P = m.positions, N = m.normals, C = m.colors, I = m.indices, nv = P.length / 3;
    assert.ok(P.length % 3 === 0 && N.length === P.length && C.length === P.length && I.length % 3 === 0 && I.length / 3 === m.triangles);
    assert.ok(nv < 65536, 'the indices fit sixteen bits');
    for (const v of P) assert.ok(Number.isFinite(v));
    for (const v of C) assert.ok(v >= 0 && v <= 1);
    for (let i = 0; i < N.length; i += 3) assert.ok(near(Math.hypot(N[i], N[i + 1], N[i + 2]), 1, 1e-4));
    let inward = 0;
    for (let t = 0; t < I.length; t += 3) {
      assert.ok(I[t] < nv && I[t + 1] < nv && I[t + 2] < nv);
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], w = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      if (n[0] * (N[a] + N[b] + N[c]) + n[1] * (N[a + 1] + N[b + 1] + N[c + 1]) + n[2] * (N[a + 2] + N[b + 2] + N[c + 2]) <= 0) inward++;
    }
    // (a tube pinches a little on the inside of its tightest bend: a few tiny triangles)
    assert.ok(inward <= 8, `${inward} triangles face inward`);
    total += m.triangles;
  }
  // "a few thousand triangles more at most": the nerves were 1 160 triangles as plain tubes
  const nerves = NE.buildNerves().triangles;
  assert.ok(nerves > 2000 && nerves < 3400, `${nerves} triangles in the nerves`);
  assert.ok(total < 5000, `${total} triangles`);
  assert.equal(NE.buildEyeballs().triangles, 2 * (NE.buildEyeballs().triangles / 2));
});

test('they are named, and nothing more: no motor area, no words about what they do', () => {
  assert.deepEqual([...E.parts], ['eyeball', 'nerve']);
  assert.equal(NT.BRAIN_PARTS.eyeball, 'Eyeball');
  assert.equal(NT.BRAIN_PARTS.nerve, 'Optic nerve');
  // 20 November 2026 (the owner: "Through the gap, you should be able to peak into the brain's inner structures"): the
  // same list also names the inner parts seen through the opening between the halves (ns-brain-gap), and nothing more:
  // bare names, two or three words, no words about what they do.
  assert.deepEqual(Object.keys(NT.BRAIN_PARTS).slice(0, 2), ['eyeball', 'nerve']);
  for (const [k, v] of Object.entries(NT.BRAIN_PARTS)) assert.ok(/^[A-Z][a-z]+( [a-z]+){0,2}$/.test(v), `${k}: ${v}`);
});
