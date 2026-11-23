// Section 204 (24 November 2026, CAM70): update 70 with the player-controlled camera from GitHub main. The start
// framing's rule for that camera (ns-app BRAIN_START_PLAYER, playerCameraUsed) and Reset body dropping main's joint aim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAIN_START, BRAIN_START_PLAYER, BRAIN_FLOOR, brainStartCeilNdc, playerCameraUsed } from '../scene/src/ns-app.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const near = (a, b, tol) => Math.abs(a - b) <= tol;

test('the player camera has its own start framing: the same rule with the mirror body\'s head 1.2 degrees higher', () => {
  // (the mirror body rises against the strip when the camera stands further back; the brain is raised to match)
  assert.equal(BRAIN_START_PLAYER.headUpDeg, 11.6);
  assert.equal(BRAIN_START.headUpDeg, 10.4, 'the earlier camera keeps its rule (the whole-arm display)');
  for (const k of ['topAimNdc', 'legShare', 'keepEyes']) assert.equal(BRAIN_START_PLAYER[k], BRAIN_START[k]);
  assert.ok(Object.isFrozen(BRAIN_START_PLAYER));
  // the ceiling is higher by the head's own rise, whatever decides the strip's size
  const fov = 54, head = d => Math.tan(d * Math.PI / 180) / Math.tan(fov * Math.PI / 360);
  const c0 = brainStartCeilNdc({ fovYDeg: fov }), c1 = brainStartCeilNdc({ fovYDeg: fov, rule: BRAIN_START_PLAYER });
  assert.ok(c1 > c0);
  assert.ok(near(c1 - BRAIN_START.legShare * (c1 - BRAIN_FLOOR.startNdc), head(11.6), 2e-4), 'the leg areas\' middle at the new head height');
  const s0 = brainStartCeilNdc({ fovYDeg: fov, stripHeightNdc: 0.5 }), s1 = brainStartCeilNdc({ fovYDeg: fov, stripHeightNdc: 0.5, rule: BRAIN_START_PLAYER });
  assert.ok(near(s1 - s0, head(11.6) - head(10.4), 2e-4), 'a strip the width decides goes up by the same');
  assert.ok(c1 < 1, 'still under the top of the placement picture');
});

test('which camera the game plays with: the player camera with the reference graph and without the whole-arm display', () => {
  assert.equal(playerCameraUsed({ referenceGraph: {}, wholeArmOption: null }), true);
  assert.equal(playerCameraUsed({ referenceGraph: {}, wholeArmOption: { on: true } }), false);
  assert.equal(playerCameraUsed({ referenceGraph: null, wholeArmOption: null }), false);
  assert.equal(playerCameraUsed(), false);
});

// (these read the game's own source, as tests/limbs5.test.mjs does: the rule must be wired where the game runs it)
const appSrc = fs.readFileSync(path.join(repo, 'scene/src/ns-app.mjs'), 'utf8');
const fnBody = name => {
  const i = appSrc.indexOf(`function ${name}`); assert.ok(i >= 0, `function ${name} in ns-app`);
  const ls = appSrc.lastIndexOf('\n', i) + 1, ind = appSrc.slice(ls, i).match(/^\s*/)[0];
  const j = appSrc.indexOf(`\n${ind}function `, i + 10);
  return appSrc.slice(i, j > i ? j : i + 20000);
};

test('the start framing and start() ask the same question, and the framing uses the player camera\'s rule', () => {
  assert.match(appSrc, /const startRule = playerCameraUsed\(\{ referenceGraph, wholeArmOption \}\) \? BRAIN_START_PLAYER : BRAIN_START;/);
  const framing = fnBody('brainFramingForViewport(');
  assert.equal((framing.match(/rule: startRule/g) || []).length, 2, 'both ceilings of the start framing use it');
  assert.match(appSrc, /if \(playerCameraUsed\(\{ referenceGraph, wholeArmOption \}\)\) playerCamera = NC\.createPlayerCamera\(/);
});

test('Reset body drops main\'s joint aim, and the aim is taken up again only from a frame drawn after the reset', () => {
  // (a browser check before this: the left hand 0.44 m from its start place after Reset body at the start look, held at
  // the place the look had aimed it)
  assert.match(fnBody('resetBody() {'), /jointAim = null; jointAimStaleOut = current\.out;/);
  const rescue = appSrc.slice(appSrc.indexOf('const rescueAfterLongSkip'), appSrc.indexOf('const rescueAfterLongSkip') + 1500);
  assert.match(rescue, /jointAim = null; jointAimStaleOut = current\.out;/, 'the display rescue resets the body too');
  const aim = fnBody('updateJointAim(');
  assert.match(aim, /if \(jointAimStaleOut\) \{ if \(current\.out === jointAimStaleOut\) \{ jointAim = null; return; \} jointAimStaleOut = null; \}/);
  assert.ok(aim.indexOf('jointAimStaleOut') < aim.indexOf('const chain = NsGrasp.LIMB_CHAIN[limb]'), 'checked before the aim is taken up');
  assert.equal((appSrc.match(/let jointAim = null/g) || []).length, 1, 'one joint aim, the one Reset body clears');
});

test('the arrows are planned in the view the player gets: the player camera\'s eye view (setPlanEye)', () => {
  // (until then the plan views stood at the earlier eye view's place, the eye plus EYE_DOLLY's stand-off, 0.46 m in front
  // of where the player camera stands: with the strip framed for the new camera the mirror body's top tip came out on the
  // left leg area at 1600x900)
  assert.match(appSrc, /if \(playerCamera && sceneFn\('setPlanEye'\)\) callScene\('setPlanEye', playerCamera\.first\);/);
  const sceneSrc = fs.readFileSync(path.join(repo, 'scene/src/ns-scene-three.mjs'), 'utf8');
  const i = sceneSrc.indexOf('function arrowRefAt(look) {');
  assert.ok(i > 0);
  assert.match(sceneSrc.slice(i, i + 200), /^function arrowRefAt\(look\) \{\s*if \(planEye\) return planEye\.slice\(\);/);
  assert.match(sceneSrc, /const refAt = arrowRefAt;/, 'the plan of every frame uses the same place');
  assert.match(sceneSrc, /\$\{planEye \? planEye\.join\(','\) : ''\}/, 'a new plan eye makes a new plan');
  assert.match(sceneSrc, /setView, setEyePosition, setReferenceOrigin, setPlanEye,/);
  assert.equal((sceneSrc.match(/eyeDolly\(look\)\.offset/g) || []).length, 1, 'one place keeps the earlier rule');
});

// (pass 2, after an independent check: the mirror body's lower tip lay on the player's crosshair at the start, and the
// tutorial's first cue lay under a region label)
const sceneSrc2 = fs.readFileSync(path.join(repo, 'scene/src/ns-scene-three.mjs'), 'utf8');
const sceneFn = name => {
  const i = sceneSrc2.indexOf(`function ${name}`); assert.ok(i >= 0, `function ${name} in ns-scene-three`);
  const ls = sceneSrc2.lastIndexOf('\n', i) + 1, ind = sceneSrc2.slice(ls, i).match(/^\s*/)[0];
  const j = sceneSrc2.indexOf(`\n${ind}function `, i + 10);
  return sceneSrc2.slice(i, j > i ? j : i + 20000);
};

test('with the player camera the mirror body\'s opening plan looks along the player\'s start look, as the brain\'s does', async () => {
  const { PLAN_EYE_MIRROR } = await import('../scene/src/ns-scene-three.mjs');
  assert.equal(PLAN_EYE_MIRROR.startLook, true);
  assert.ok(Object.isFrozen(PLAN_EYE_MIRROR));
  const m = sceneFn('mirrorPlanCamFor(c)');
  assert.match(m, /const opening = !camPose && !mirror\.worldCentre;/);
  assert.match(m, /const onStartLook = opening && \(cssW < cssH \|\| \(planEye !== null && PLAN_EYE_MIRROR\.startLook\)\);/,
    'an upright window as before; a landscape one only with a plan eye');
  assert.match(m, /const start = onStartLook \? \{ yaw: referenceLook\.yaw, pitch: referenceLook\.pitch \} : \{ yaw: referenceAngles\.yaw, pitch: referenceAngles\.pitch \};/);
  // the brain's opening plan already did so (the comparison this follows)
  assert.match(sceneFn('brainPlanCamFor()'), /const brainLook = defaultLandscape \? referenceLook : arrowRef;/);
});

test('the start check and mirror-compass look at the mirror body\'s tips against the crosshair; keyboard-aim at the capture click', () => {
  const boot = fs.readFileSync(path.join(repo, 'scene/example/eye-view-r558.mjs'), 'utf8');
  assert.match(boot, /'the mirror body\\'s ' \+ d \+ ' tip must not lie on the crosshair at the start look'/);
  assert.match(boot, /requireCase\(!s\.controlTargets \|\| s\.controlTargets\.arrow !== true,/);
  const mc = fs.readFileSync(path.join(repo, 'tests/browser-mirror-compass.mjs'), 'utf8');
  assert.match(mc, /does not start on the crosshair/);
  const ka = fs.readFileSync(path.join(repo, 'tests/browser-keyboard-aim.mjs'), 'utf8');
  assert.equal((ka.match(/assert\.deepEqual\(turnOf\(/g) || []).length, 2, 'both capture clicks leave the mirror body as it was');
  assert.match(ka, /for \(let n = 0; n < 4 && /, 'four carries, as before the first pass');
  assert.match(ka, /assert\.ok\(inLimbBand\(end, BAND_SLACK\), `\$\{name\}: from the start view/, 'the band, not only the picture');
});

test('a guide cue\'s words are an obstacle for the region labels only (a label gives way to them)', () => {
  const r = sceneFn('readHudRectsNow(key)');
  const i = r.indexOf(".ns-guide-cues .ns-guide-mark-name");
  assert.ok(i > 0, 'the cue words are read with the HUD boxes');
  assert.match(r.slice(i, i + 400), /quiet: true, cue: true/);
  // quiet boxes are skipped by the arrows' plan (it must not move while a cue moves) and kept by the labels as words
  assert.match(sceneFn('arrowObstacles()'), /if \(r\.info \|\| r\.orient \|\| r\.chip \|\| r\.quiet\) continue;/);
  assert.match(r, /for \(const r of hudRectCache\) \{ r\.words = r !== tipZone; r\.weight = LABEL_WORDS_WEIGHT; \}/);
});
