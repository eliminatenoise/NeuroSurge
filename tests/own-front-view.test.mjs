/** The picture down your own front (18 November 2026): the eye view's camera stands a little behind the eye on its own
 line of sight (18 November 2026, later: above it), the chest muscles are drawn flat, and the belly is closed at the midline. Pure checks of the
 * arithmetic: how far back the camera stands for a look and that it changes without a jump, that only the camera
 * moves (the eye stays the arm's parent point and the crosshair line still passes through the eye), that the chest
 * rule scales a slab's height above its own deep side without moving that side or a part held on a bone, and that the
 * belly rule closes a slot and leaves the outer borders alone. No browser, no picture: whether the shoulders, the flat
 * chest and the belly read well was judged in screenshots, not here. */
import test from 'node:test';
import assert from 'node:assert/strict';

const NC = await import('../scene/src/ns-camera.mjs');
const NB = await import('../scene/src/ns-body.mjs');
const DEG = Math.PI / 180;
const back = (yawDeg, pitchDeg) => NC.eyeDollyBackM({ yaw: yawDeg * DEG, pitch: pitchDeg * DEG });

test('the camera rides above and behind the eyes on the head, by the same amount at every look, without a jump anywhere', () => {
  // 19 November 2026 (the owner: "whenever you look to the far side of any screen, everything gets super magnified"):
  // this test asked for the camera to ease back to the eye for upward and far-side looks and to follow a table below
  // the start look. That is withdrawn: the stand-off is one length everywhere (tests/flat-view.test.mjs has the rule).
  const E = NC.EYE_DOLLY, at = (yawDeg, pitchDeg) => NC.eyeDolly({ yaw: yawDeg * DEG, pitch: pitchDeg * DEG });
  assert.equal(E.headAboveLookDeg, NB.POSTURE_EYES.downDeg, 'the head is bowed less than the look by the posture\'s eye lowering');
  assert.equal(E.headLevelEndDeg, NB.POSTURE_EYES.endAtHeadUpDeg);
  assert.equal(E.byPitch, undefined); assert.equal(E.upFullDeg, undefined); assert.equal(E.sideFullDeg, undefined);
  for (const [y, p] of [[0, -52], [0, -75], [0, 0], [0, 85], [100, -40], [-180, -72], [40, -40]]) {
    const d = at(y, p);
    assert.ok(d.upM === E.upM && d.backM === E.backM, `the full offset at ${y}/${p}`);
  }
  assert.ok(Math.abs(at(0, -52).headPitch / DEG + 22) < 1e-9, 'the head is bowed 22 degrees at a look of 52');
  assert.ok(Math.abs(at(0, -75).headPitch / DEG + 45) < 1e-9, 'bowed 45 degrees at a look of 75');
  // upM along the head's own up (for a bowed head it leans forward: forward is -z at yaw 0), less backM along the line of sight
  for (const pitch of [-52, -75, -30]) {
    const d = at(0, pitch), h = d.headPitch, g = NC.gazeDirection(0, pitch * DEG), want = [-d.backM * g[0], d.upM * Math.cos(h) - d.backM * g[1], d.upM * Math.sin(h) - d.backM * g[2]];
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(d.offset[k] - want[k]) < 1e-12, `offset at a look of ${pitch}`);
  }
  assert.ok(at(0, -52).offset[1] > 0.1 && Math.abs(at(0, -52).offset[0]) < 1e-12, 'mostly upward at a look of 52');
  assert.ok(Math.abs(at(-50, -40).offset[1] - at(50, -40).offset[1]) < 1e-12 && Math.abs(at(-50, -40).offset[0] + at(50, -40).offset[0]) < 1e-12, 'mirrored to either side');
  assert.equal(back(0, -60), at(0, -60).backM);
  // no jump: a quarter of a degree of look never moves the camera more than three millimetres
  const step = (a, b) => Math.hypot(a.offset[0] - b.offset[0], a.offset[1] - b.offset[1], a.offset[2] - b.offset[2]);
  for (let yaw = -180; yaw <= 180; yaw += 7.5) for (let pitch = -88; pitch < 88; pitch += 0.25) assert.ok(step(at(yaw, pitch), at(yaw, pitch + 0.25)) < 0.003, `pitch step at ${yaw}/${pitch}`);
  for (let pitch = -80; pitch <= 80; pitch += 10) for (let yaw = -180; yaw < 179.9; yaw += 0.25) assert.ok(step(at(yaw, pitch), at(yaw + 0.25, pitch)) < 0.003, `yaw step at ${yaw}/${pitch}`);
});
function smooth01(t) { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); }

test('only the camera moves: the eye stays the arm\'s parent point, and the crosshair ray starts at the camera', () => {
  const eye = [0.01, -0.03, -0.02];
  const frame = () => ({ position: eye, bodyToWorld: [0.001, 0, 0, 0, 0, 0, -0.001, 0, 0, 0.001, 0, 0, 0, 0, 0, 1], eyeBp: [0, -158, 1513] });
  const first = NC.createCameraState({ view: 'first' });
  for (const [yaw, pitch] of [[0, -25], [30, -60], [-70, -10], [0, -41]]) {
    const look = { yaw: yaw * DEG, pitch: pitch * DEG };
    const p = NC.cameraPose(first, { look, firstPersonFrame: frame });
    const dl = NC.eyeDolly(look), d = dl.backM, dir = NC.gazeDirection(look.yaw, look.pitch);
    assert.ok(p.firstPerson && p.blend === 0);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(p.position[k] - (eye[k] + dl.offset[k])) < 1e-12, `camera above the eye on the head (${yaw}/${pitch})`);
    assert.deepEqual(p.gazeRay.origin, p.position, 'the crosshair ray starts at the camera the picture uses');
    assert.deepEqual(p.gazeRay.dir, dir);
    assert.deepEqual(p.armParentPosition, eye, 'the arm still hangs on the anatomical eye');
    assert.equal(p.yaw, look.yaw); assert.equal(p.pitch, look.pitch);
    // the crosshair ray is the eye's own line moved up by the raise
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(p.gazeRay.origin[k] - eye[k] - dl.offset[k]) < 1e-12);
    assert.ok(d >= 0);
  }
  // (19 November 2026) with the look up the camera still stands off the eye, and the eye is still the arm's parent point
  const up = NC.cameraPose(first, { look: { yaw: 0, pitch: 40 * DEG }, firstPersonFrame: frame });
  assert.ok(Math.hypot(up.position[0] - eye[0], up.position[1] - eye[1], up.position[2] - eye[2]) > 0.25); assert.deepEqual(up.armParentPosition, eye);
  // going out to the view from behind starts from where the eye view's camera stands
  const moving = { ...NC.createCameraState({ view: 'third' }), progress: 1e-6 };
  const look = { yaw: 0, pitch: -25 * DEG }, m = NC.cameraPose(moving, { look, firstPersonFrame: frame }), f = NC.cameraPose(first, { look, firstPersonFrame: frame });
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(m.position[k] - f.position[k]) < 1e-6, 'no jump when E is pressed');
});

/** A slab lying on a tube of the rule's own shape: an inner (deep) sheet at the tube's surface and an outer sheet
 * `thick` mm further out, over angles -0.9..-0.1 rad (the right half of the chest) and heights 1150..1300 mm. */
function slab(thick) {
  const { yMm: yc, halfWidthMm: A, halfDepthMm: B } = NB.CHEST_FLATTEN.axis, pos = [], na = 41, nz = 31;
  const put = (th, z, extra) => { const x = A * Math.sin(th), y = -B * Math.cos(th), k = 1 + extra / Math.hypot(x, y); pos.push(x * k, yc + y * k, z); };
  for (let layer = 0; layer < 2; layer++) for (let i = 0; i < na; i++) for (let j = 0; j < nz; j++) put(-0.9 + (0.8 * i) / (na - 1), 1150 + (150 * j) / (nz - 1), layer ? thick : 0);
  return { positions: Float32Array.from(pos), indices: new Uint32Array(0), n: na * nz };
}
const radial = (p, i) => { const { yMm: yc, halfWidthMm: A, halfDepthMm: B } = NB.CHEST_FLATTEN.axis; return Math.hypot(p[3 * i] / A, (p[3 * i + 1] - yc) / B); };

test('the chest rule scales a muscle\'s height above its own deep side and leaves that side where it is', () => {
  const m = slab(24), id = NB.CHEST_FLATTEN.rows[0].id;
  const { meshesById, report } = NB.flattenChest(new Map([[id, m]]));
  const q = meshesById.get(id).positions;
  assert.notEqual(q, m.positions, 'the source array is not changed');
  let deepMoved = 0, ratioSum = 0, cnt = 0;
  for (let i = 0; i < m.n; i++) deepMoved = Math.max(deepMoved, Math.hypot(q[3 * i] - m.positions[3 * i], q[3 * i + 1] - m.positions[3 * i + 1]));
  assert.ok(deepMoved < 0.5, `the deep side stays (${deepMoved.toFixed(2)} mm)`);
  for (let i = m.n; i < 2 * m.n; i++) {
    if (Math.abs(m.positions[3 * i]) > NB.CHEST_FLATTEN.fade.fromMm) continue;
    assert.equal(q[3 * i + 2], m.positions[3 * i + 2], 'heights are kept');
    const before = radial(m.positions, i) - radial(m.positions, i - m.n), after = radial(q, i) - radial(q, i - m.n);
    ratioSum += after / before; cnt++;
  }
  assert.ok(cnt > 100 && Math.abs(ratioSum / cnt - NB.CHEST_FLATTEN.thicknessShare) < 0.03, `height above the deep side x ${(ratioSum / cnt).toFixed(3)}`);
  assert.equal(report[0].id, id);
  const want = 24 * (1 - NB.CHEST_FLATTEN.thicknessShare);
  assert.ok(Math.abs(report[0].maxMovedMm - want) < 1.5, `the front comes down by the share of the thickness the rule takes off (${report[0].maxMovedMm} mm, ${want} wanted)`);
});

test('the chest rule moves nothing that lies on the collar bone or the breastbone', () => {
  const m = slab(24), id = NB.CHEST_FLATTEN.rows[0].id, boneId = NB.CHEST_FLATTEN.hold.bones[1][0];
  // a "bone" made of the outer sheet's own upper edge: the vertices on it must stay
  const edge = [];
  for (let i = m.n; i < 2 * m.n; i++) if (m.positions[3 * i + 2] >= 1299.9) edge.push(m.positions[3 * i], m.positions[3 * i + 1], m.positions[3 * i + 2]);
  const { meshesById } = NB.flattenChest(new Map([[id, m], [boneId, { positions: Float32Array.from(edge), indices: new Uint32Array(0) }]]));
  const q = meshesById.get(id).positions;
  let onBone = 0, far = 0;
  for (let i = m.n; i < 2 * m.n; i++) {
    const moved = Math.hypot(q[3 * i] - m.positions[3 * i], q[3 * i + 1] - m.positions[3 * i + 1]);
    if (m.positions[3 * i + 2] >= 1299.9) onBone = Math.max(onBone, moved);
    if (m.positions[3 * i + 2] < 1250 && Math.abs(m.positions[3 * i]) < 100) far = Math.max(far, moved);
  }
  assert.ok(onBone < 1e-6, 'held on the bone');
  assert.ok(far > 10, 'and flattened away from it');
});

test('the belly rule brings the two straight muscles together and leaves their outer borders alone', () => {
  const box = (x0, x1) => { const p = []; for (let z = 800; z <= 1150; z += 5) for (let x = x0; x <= x1 + 1e-9; x += (x1 - x0) / 20) for (const y of [-200, -190]) p.push(x, y, z); return { positions: Float32Array.from(p), indices: new Uint32Array(0) }; };
  const R = box(-80, -6), L = box(4, 78);
  const { meshesById, report } = NB.closeBellyMidline(new Map([[NB.BELLY_MIDLINE.right, R], [NB.BELLY_MIDLINE.left, L]]));
  const r = meshesById.get(NB.BELLY_MIDLINE.right).positions, l = meshesById.get(NB.BELLY_MIDLINE.left).positions;
  let rIn = -Infinity, lIn = Infinity, rOut = Infinity, lOut = -Infinity;
  for (let i = 0; i < r.length; i += 3) { rIn = Math.max(rIn, r[i]); rOut = Math.min(rOut, r[i]); assert.equal(r[i + 1], R.positions[i + 1]); assert.equal(r[i + 2], R.positions[i + 2]); }
  for (let i = 0; i < l.length; i += 3) { lIn = Math.min(lIn, l[i]); lOut = Math.max(lOut, l[i]); }
  assert.ok(rIn >= lIn, `no slot left (${rIn.toFixed(2)} / ${lIn.toFixed(2)})`);
  assert.ok(rIn - lIn <= 2 * NB.BELLY_MIDLINE.overlapMm + 1e-6, 'and no more overlap than the rule says');
  assert.ok(Math.abs((rIn + lIn) / 2 + 1) < 1e-6, 'they meet in the middle of the slot');
  assert.equal(rOut, -80); assert.equal(lOut, 78);
  assert.deepEqual(report.slotMm, [10, 10]);
  // a wide gap (the muscles parting round the breastbone) is left open
  const wide = NB.closeBellyMidline(new Map([[NB.BELLY_MIDLINE.right, box(-80, -20)], [NB.BELLY_MIDLINE.left, box(20, 80)]]));
  assert.equal(wide.report.rightMovedMm, 0);
});
