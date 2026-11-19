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
import * as NT from '../scene/src/ns-text.mjs';
import { BRAIN_FRONT_DOWN, BRAIN_START, BRAIN_FLOOR, BRAIN_START_MOTOR_FRAC, brainFloorNdc, areaChain } from '../scene/src/ns-app.mjs';
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

test('the start framing: the top of the n is pinned under the top edge and its lower ends stay above the floor', () => {
  assert.ok(BRAIN_START.topAimNdc > BRAIN_START.ceilNdc, 'the aim is above the ceiling, so the strip ends against it');
  assert.equal(brainFloorNdc({ width: 1600, height: 900 }), BRAIN_FLOOR.startNdc);
  assert.ok(BRAIN_FLOOR.startNdc < BRAIN_START.ceilNdc);
  const fo = { motorCentreNdc: [0, BRAIN_START.topAimNdc], motorFrac: BRAIN_START_MOTOR_FRAC, motorFloorNdc: BRAIN_FLOOR.startNdc, motorCeilNdc: BRAIN_START.ceilNdc };
  const f = frameOf(fo), b = f.beltFit.beltBoxNdc;
  assert.equal(f.fit, 'motor');
  assert.ok(near(b.y1, BRAIN_START.ceilNdc, 1e-5), 'the top of the strip is at the ceiling');
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
    for (const v of objVertices(rel)) P.push(v);
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
  assert.ok(Math.abs(mine.left[0] - c[0]) < 0.5, 'as far from the midline as the atlas eye');
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

test('the nerves run under the brain from each eyeball to a chiasm on the midline, and never through its surface on the way', () => {
  for (const side of [1, -1]) {
    const path = NE.nervePath(side), c = NE.eyeCentres()[side > 0 ? 'left' : 'right'];
    assert.ok(Math.hypot(path[0][0] - c[0], path[0][1] - c[1], path[0][2] - c[2]) < E.radiusMm, 'it starts inside the eyeball: no gap');
    const ch = path[E.nerve.chiasmIndex];
    assert.ok(Math.abs(ch[0] - E.midlineXmm) < 3, 'the chiasm is at the midline');
    // from the brain's edge to the last point before the chiasm the tube's top stays below the atlas brain's underside;
    // at the chiasm itself it comes up against that underside (within a few mm: it joins the brain there)
    for (let i = 1; i <= E.nerve.chiasmIndex; i++) for (let t = 0; t <= 1; t += 0.25) {
      const a = path[i - 1], b = path[i], p = [0, 1, 2].map(k => a[k] + (b[k] - a[k]) * t);
      const u = undersideAt(p[0], p[1]);
      if (u === null) continue;
      if (i < E.nerve.chiasmIndex) assert.ok(p[2] + E.nerve.radiusMm < u, `under the brain at ${p.map(v => v.toFixed(0))} (underside ${u.toFixed(0)})`);
      else assert.ok(p[2] + E.nerve.radiusMm < u + 3, `against the brain at ${p.map(v => v.toFixed(0))} (underside ${u.toFixed(0)})`);
    }
    // the tract ends inside the brain (it is not left hanging in the open)
    const end = path[path.length - 1], uEnd = undersideAt(end[0], end[1]);
    assert.ok(uEnd !== null && end[2] > uEnd, 'the tract ends inside the brain');
  }
  // the two sides are mirror images about the midline
  const l = NE.nervePath(1), r = NE.nervePath(-1);
  for (let i = 0; i < l.length; i++) assert.ok(near(l[i][0] - E.midlineXmm, -(r[i][0] - E.midlineXmm), 1e-9) && l[i][1] === r[i][1] && l[i][2] === r[i][2]);
  const ch = E.chiasm, u = undersideAt(E.midlineXmm, ch.centreMm[1]);
  assert.ok(u !== null && Math.abs(ch.centreMm[2] + ch.radiiMm[2] - u) < 3, 'the chiasm lies against the underside of the brain');
});

test('the two meshes are sound and light: closed, outward, a few thousand triangles', () => {
  let total = 0;
  for (const m of [NE.buildEyeballs(), NE.buildNerves()]) {
    const P = m.positions, N = m.normals, C = m.colors, I = m.indices, nv = P.length / 3;
    assert.ok(P.length % 3 === 0 && N.length === P.length && C.length === P.length && I.length % 3 === 0 && I.length / 3 === m.triangles);
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
    // (the tubes pinch on the inside of the bend at the chiasm: a few tiny triangles there, inside the chiasm's own body)
    assert.ok(inward <= 8, `${inward} triangles face inward`);
    total += m.triangles;
  }
  assert.ok(total > 1500 && total < 3200, `${total} triangles`);
  assert.equal(NE.buildEyeballs().triangles, 2 * (NE.buildEyeballs().triangles / 2));
});

test('they are named, and nothing more: no motor area, no words about what they do', () => {
  assert.deepEqual([...E.parts], ['eyeball', 'nerve']);
  assert.equal(NT.BRAIN_PARTS.eyeball, 'Eyeball');
  assert.equal(NT.BRAIN_PARTS.nerve, 'Optic nerve');
  assert.deepEqual(Object.keys(NT.BRAIN_PARTS), ['eyeball', 'nerve']);
});
