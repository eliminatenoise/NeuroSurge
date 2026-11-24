// 25 November 2026 (FIX76; a second play-through of Body update 74, finding 7; the owner, Message 207: "The limb should
// never get stuck"). The pure rules: the hold's solve starts from the knee as drawn (HOLD_DRAWN), and a keys' answer
// refused at your own body is asked again for a place on its surface (BODY_SLIDE). The game itself is tried in
// tests/browser-limb-stuck.mjs.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { HOLD_DRAWN, holdBendAsDrawn, BODY_SLIDE, keyBodySlide } from '../scene/src/ns-limb-pace.mjs';
import { passiveKneeAngles, clampBodyJointTargets, HIP_KNEE_COUPLING } from '../scene/src/ns-body.mjs';
import { keyMoveCut } from '../scene/src/ns-app.mjs';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/* ---------------------------------------------------------------- finding 7: the limb that S did not move */

test('after a drag has lifted the thigh, the solve starts from the knee as it is drawn', () => {
  assert.ok(Object.isFrozen(HOLD_DRAWN) && HOLD_DRAWN.on === true);
  // (the pose the tester's drag leaves: the thigh at its 110 degrees, the activity's knee still at its 6)
  const after = { hip_flex_L: 110, hip_abd_L: 7, knee_ext_L: -6, hip_flex_R: 0, knee_ext_R: -6 };
  const knee = holdBendAsDrawn(after, 'knee_ext_L', passiveKneeAngles);
  assert.ok(Math.abs(knee - -45) < 1e-9, `the knee the picture shows (${knee})`);
  // what was wrong: the combined-range rule lowers that thigh for the activity's knee, and keeps it for the drawn one
  const C = t => clampBodyJointTargets(t).applied;
  assert.ok(C(after).hip_flex_L < 102, 'from the activity\'s knee the solve started with the thigh 9 degrees lower than drawn');
  assert.equal(C({ ...after, knee_ext_L: knee }).hip_flex_L, 110, 'from the drawn knee it starts where the leg is drawn');
  assert.ok(HIP_KNEE_COUPLING.straightKneeMaxDeg === 100, 'the rule both sides of this test stand on');
});

test('only a knee the drawn pose bends further is changed', () => {
  assert.equal(holdBendAsDrawn({ hip_flex_L: 110, knee_ext_L: -80 }, 'knee_ext_L', passiveKneeAngles), -80, 'a knee bent further already');
  assert.equal(holdBendAsDrawn({ hip_flex_L: 60, knee_ext_L: -6 }, 'knee_ext_L', passiveKneeAngles), -6, 'a thigh a straight knee allows');
  assert.equal(holdBendAsDrawn({ hip_flex_R: 105, knee_ext_R: 0 }, 'knee_ext_R', passiveKneeAngles), -22.5, 'the right leg too');
  assert.equal(holdBendAsDrawn({ r_shoulder_flex: 180, r_elbow_flex: 8 }, 'r_elbow_flex', passiveKneeAngles), 8, 'an elbow has no such rule');
  assert.equal(holdBendAsDrawn({ hip_flex_L: 110, knee_ext_L: -6 }, 'knee_ext_L', null), -6, 'no rule given');
  assert.equal(holdBendAsDrawn({ hip_flex_L: 110, knee_ext_L: -6 }, 'knee_ext_L', passiveKneeAngles, { on: false }), -6, 'the switch');
  assert.equal(holdBendAsDrawn({ hip_flex_L: 110 }, 'knee_ext_L', passiveKneeAngles), undefined, 'no angle: none made up');
});

test('the app takes the drawn knee into the hold\'s start, and asks a refused answer again on the body\'s surface', () => {
  const app = read('scene/src/ns-app.mjs');
  assert.match(app, /if \(c\.bend\) start\[c\.bend\] = NsPace\.holdBendAsDrawn\(start, c\.bend, mods\.body\.passiveKneeAngles\);/);
  assert.match(app, /if \(offWay && \(holdDbg\.atBody \|\| 0\) > atBody0 && !swEnd\) \{/);
  assert.match(app, /NsPace\.keyBodySlide\(pts\.end, eW, handKeepOut\(eW\), way, keyMoveCut\)/);
});

test('a keys\' answer that grazes your body is asked again for a place just outside it; one straight into it is not', () => {
  assert.ok(Object.isFrozen(BODY_SLIDE) && BODY_SLIDE.on === true && BODY_SLIDE.clearM > 0);
  // the body's surface is the plane x = 0 with the body at x < 0; the hand is on it and the keys go up along it, a little in
  const from = [0, 0, 0], way = [-0.004, 0.01, 0];
  const to = [-0.006, 0.011, 0], out = [0, 0.011, 0]; // (the answer 6 mm in; taken out to the surface)
  const T = keyBodySlide(from, to, out, way, keyMoveCut);
  assert.ok(T, 'what is left still goes the keys\' way');
  assert.ok(Math.abs(T[0] - BODY_SLIDE.clearM) < 1e-12 && T[1] === 0.011, 'the place on the surface, clearM further out');
  // straight in: nothing of it is left along the surface
  assert.equal(keyBodySlide(from, [-0.01, 0, 0], [0, 0, 0], [-0.01, 0, 0], keyMoveCut), null, 'the hand stops at the body');
  // what is left goes back against the keys' way
  assert.equal(keyBodySlide(from, [-0.006, -0.004, 0], [0, -0.004, 0], [-0.01, 0.001, 0], keyMoveCut), null);
  // too little left to be a move
  assert.equal(keyBodySlide(from, [-0.006, 0.0005, 0], [-0.0031, 0.0005, 0], [-0.004, 0.01, 0], keyMoveCut), null);
  assert.equal(keyBodySlide(from, to, to, way, keyMoveCut), null, 'an answer that was not inside: nothing to slide on');
  assert.equal(keyBodySlide(from, to, out, way, keyMoveCut, { ...BODY_SLIDE, on: false }), null, 'the switch');
});
