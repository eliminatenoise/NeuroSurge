/** Three faults of the limb keys and the limb push found by a browser hunt of update 62 (21 November 2026; the owner:
 * "The limb should never get stuck", Message 207; "whatever limb you're using at the time, if they collide into other
 * limbs, they'll push them out of the way", Message 174). Pure checks of the rules and of the limb solve on the game's
 * own body loaded from disk; how it plays was tried in the browser. Nothing here says anything about a real joint. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { LIMB_KEYS, LIMB_PUSH, limbKeyMove, limbKeyFollow, keepOutSlide, pushApproach, pushGivesWay, rodsNearest } = await import(path.join(repo, 'scene/src/ns-app.mjs'));
const G = await import(path.join(repo, 'scene/src/ns-grasp.mjs'));
const { loadBody } = await import(path.join(repo, 'tools/load-body.mjs'));
const { body, rig, baked } = await loadBody(repo);
const opts = { anchor: 'pelvis', baked, holdChest: false };
const asDrawn = q => body.poseBodySegments(rig, body.softExtensionAngles(body.passiveKneeAngles(q)), opts);
const limits = body.bodyPostureLimits(baked);
const project = t => body.clampBodyJointTargets(t).applied;
const start = project(body.bodyPostureAngles(baked));
const sub = (a, b) => a.map((v, k) => v - b[k]), nrm = a => Math.hypot(...a);

// H10: the right arm at the end of its D swing; S + D moved the hand 0 to 4 mm in 2 s, S alone 480 mm in 0.7 s.
test('two keys at once at the end of one key\'s swing: the pair is refused, the reach alone is taken (so the limb goes the way it can)', () => {
  const V = LIMB_KEYS.view, sp = V.speedMps * 1000 / 60, right = [-1, 0, 0]; // (body mm; +x is the body's left)
  const q = project({ ...start, r_shoulder_flex: -60, r_shoulder_abd: 63, r_elbow_flex: 14 });
  const root = G.limbPoint(rig, asDrawn(q), 'rightArm', 'root'), end = G.limbPoint(rig, asDrawn(q), 'rightArm', 'end');
  const solveTo = way => { const k = V.leadM * 1000 / nrm(way); return G.solveLimb({ rig, segmentsFor: asDrawn, targets: q, limb: 'rightArm', targetMm: end.map((v, i) => v + way[i] * k), limits, opts: G.LIMB_HOLD_TRACK, project, memo: null, spin: true }); };
  const pair = sub(limbKeyMove(end, root, right, 1, -1, sp), end), reach = sub(limbKeyMove(end, root, right, 0, -1, sp), end);
  const rp = solveTo(pair);
  assert.equal(limbKeyFollow(end, rp.endMm, pair).take, false, 'the pair\'s own answer goes nowhere the pair\'s way: it waits (the fault)');
  const rr = solveTo(reach), f = limbKeyFollow(end, rr.endMm, reach);
  assert.ok(f.take && f.share > 0, 'the reach alone is taken (what the hold now tries when a pair waits)');
  assert.ok(rr.joints.r_elbow_flex > q.r_elbow_flex, 'and it bends the elbow');
});

// H11: the right arm folded across the chest, its hand 3 mm inside the keep-out; W's step went a little deeper and was
// refused on every frame.
test('a key\'s step that grazes the body slides over it; one straight into it moves nothing', () => {
  // a ball of 100 mm round the origin; the hand 3 mm inside it at the top
  const c = [0, 0, 0], R = 100, out = p => { const d = nrm(sub(p, c)); return d >= R ? p : p.map((v, i) => c[i] + (v - c[i]) * R / d); };
  const from = [0, 0, R - 3];
  // grazing: mostly along the surface, a little in (10 mm, 15 degrees down)
  const K1 = [10 * Math.cos(15 * Math.PI / 180), 0, R - 3 - 10 * Math.sin(15 * Math.PI / 180)];
  assert.ok(nrm(sub(K1, c)) < nrm(sub(from, c)), 'the step goes deeper in');
  const s1 = keepOutSlide(from, K1, out(K1));
  assert.ok(s1 && Math.abs(nrm(sub(s1, c)) - R) < 1e-9, 'it slides: the hand goes on, on the surface');
  assert.ok(s1[0] > 5, 'the keys\' way');
  // straight in (or nearly): refused
  for (const deg of [90, 70]) {
    const K = [10 * Math.cos(deg * Math.PI / 180), 0, R - 3 - 10 * Math.sin(deg * Math.PI / 180)];
    assert.equal(keepOutSlide(from, K, out(K)), null, `${deg} degrees into the body: the hand stops`);
  }
});

// H12: a leg held against the other leg at its range end kept lifting the other leg after it had stopped.
test('a push takes only the mover\'s own approach, and a pushed limb gives way only along the push', () => {
  assert.ok(LIMB_PUSH.approachM > 0.0005 && LIMB_PUSH.approachM < 0.003, 'more than a held key\'s jitter at a range end, less than a slow move');
  assert.ok(LIMB_PUSH.giveOffDeg > 30 && LIMB_PUSH.giveOffDeg < 70 && LIMB_PUSH.giveShare > 0 && LIMB_PUSH.giveShare < 1);
  // the mover's rod along x at y 0; the other's rod along x at y 0.1 (the other limb lies on the +y side)
  const other = [[0, 0.1, 0], [1, 0.1, 0]];
  const at = y => rodsNearest([0, y, 0], [1, y, 0], other[0], other[1]);
  const q = at(0.01), n = q.c2.map((v, i) => v - q.c1[i]);
  assert.ok(Math.abs(pushApproach([[0, 0, 0], [1, 0, 0]], q, n) - 0.01) < 1e-9, 'came 10 mm nearer');
  assert.ok(Math.abs(pushApproach([[0, 0.0105, 0], [1, 0.0105, 0]], q, n) + 0.0005) < 1e-9, 'went back half a millimetre');
  assert.ok(pushApproach([[0, 0.0095, 0], [1, 0.0095, 0]], q, n) < LIMB_PUSH.approachM, 'a jitter of half a millimetre pushes nothing');
  assert.equal(pushApproach(null, q, n), Infinity, 'no frame before: the push is not held back');
  // giving way: along the push yes; up (at right angles) no; too little no
  const d = [0, 0.01, 0];
  assert.equal(pushGivesWay([0, 0.009, 0.001], d), true);
  assert.equal(pushGivesWay([0, 0.002, 0.02], d), false, 'mostly upward: the leg lifted knee to chest');
  assert.equal(pushGivesWay([0, 0.001, 0], d), false, 'a tenth of what was asked');
  assert.equal(pushGivesWay([0, 0, 0], d), false);
});
