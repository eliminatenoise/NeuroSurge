/** Holding, letting go and the arrows (22 November 2026, browser hunt of update 64, H5 to H9; DESIGN-DECISIONS 196).
 * The owner's rules these cases pin: only what the player switches on lights up, and a part going back shows no light
 * (Message 206); performance first, nothing that makes the game stutter; an item that did not move keeps its arrows. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createActivity, GRIP_RELEASE } from '../scene/src/ns-actions.mjs';
import { OCCUPANCY_GRID, occupancyGrid, occupancyGridFast, occupancyGridSimple, viewPointInPlan, projectWorldPx, keptTipsClear, releasePlanStage } from '../scene/src/ns-arrows3d.mjs';
import { ARROW_REPLAN, MIRROR_RESET } from '../scene/src/ns-scene-three.mjs';
import { BRAIN_BEHIND, brainBehind, brainLostWords, CARRY_THROUGH } from '../scene/src/ns-reference-graph.mjs';
import { TIP } from '../scene/src/ns-text.mjs';

const H = 1 / 60;
function started(opts) {
  const A = createActivity(opts);
  let s = A.step(A.state, [], 2.5);
  s = A.step(s, [{ type: 'gaze', kind: 'empty', at: 0 }], H);
  return { A, s };
}
/** n frames after `ev`; per frame: the strip's Left hand area, the open-hand key light and drive, the grip's drive. */
function after(A, s0, ev, n) {
  let s = A.stepGated(s0, ev ? [ev] : [], H).state;
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({ area: s.regionActivity.rh_hand, openKey: s.keyDisplay.open_hand, openShown: s.display.open_hand, open: s.drive.open_hand, grip: s.drive.grasp_close, s });
    s = A.stepGated(s, [], H).state;
  }
  return { s, rows };
}

test('H5: letting go of Space sends the left hand back to its place, unlit, with no "open hand" movement switched on', () => {
  assert.equal(GRIP_RELEASE.openOnRelease, false);
  assert.ok(Object.isFrozen(GRIP_RELEASE));
  const { A, s } = started();
  const held = after(A, s, { type: 'grip', on: true, at: 0 }, 30);
  assert.ok(held.s.drive.grasp_close > 0.99 && held.s.regionActivity.rh_hand > 0.9, 'the grip closes the hand and lights its area while held');
  const r = after(A, held.s, { type: 'grip', on: false, at: 0 }, 60);
  assert.equal(r.s.openRemaining, 0, 'no opening window');
  assert.ok(r.rows.every(x => x.openKey === 0 && x.openShown === 0 && x.open === 0), 'open_hand is never lit nor driven after the release');
  // the grip's own light only fades (as the right hand's and the toes' do: about 0.14 s), and the hand is back by then
  const dark = r.rows.findIndex(x => x.area < 0.01);
  assert.ok(dark >= 0 && dark * H <= 0.16, `the Left hand area is dark ${(dark * H).toFixed(3)} s after the release`);
  assert.ok(r.rows.slice(dark).every(x => x.area < 0.01), 'and stays dark');
  for (let i = 1; i < r.rows.length; i++) assert.ok(r.rows[i].area <= r.rows[i - 1].area + 1e-12, 'the light only falls');
  const back = r.rows.findIndex(x => x.grip < 0.01);
  assert.ok(back >= 0 && back * H <= 0.2, `the hand is back at its place after ${(back * H).toFixed(3)} s`);
  assert.equal(r.s.drive.grasp_close, 0);
  // no link the release itself switched on: the only Space link after it is the grip's fading one
  for (const x of r.rows) {
    const links = A.glowLinks(x.s).links.filter(l => l.source === 'space');
    assert.ok(links.every(l => l.actionId === 'grasp_close'), `only the fading grip (${links.map(l => l.actionId).join(',')})`);
  }
});

test('H5: the old rule stays behind its switch: openOnRelease opens and lights the hand for spaceOpenSeconds', () => {
  const { A, s } = started({ gripRelease: { openOnRelease: true } });
  const held = after(A, s, { type: 'grip', on: true, at: 0 }, 30);
  const r = after(A, held.s, { type: 'grip', on: false, at: 0 }, 50);
  assert.ok(Math.max(...r.rows.map(x => x.openKey)) > 0.9, 'open_hand lit');
  assert.ok(Math.max(...r.rows.map(x => x.open)) > 0.9, 'the hand opens past neutral');
  assert.ok(r.rows[20].area > 0.5, 'the Left hand area still lit a third of a second after the release');
});

test('H5: once the grip is let go the app sends no beam for the grip\'s fading links (ns-app setGlowLinks)', () => {
  const src = readFileSync(new URL('../scene/src/ns-app.mjs', import.meta.url), 'utf8');
  const at = src.indexOf("simState.activity.graspHold !== true && glowData.links.some(l => l.source === 'space')");
  assert.ok(at > 0, 'the rule is there');
  assert.ok(src.slice(at, at + 400).includes('line: false'), 'and it takes the line away');
  // and the grip's fading light switches no area on for the card (no "Left hand" card left behind after a carry)
  assert.match(src, /const gripFading = Boolean\(act\) && act\.graspHold !== true && \(\(act\.keyDisplay && act\.keyDisplay\.grasp_close > 0\) \|\| rightGrip > 0\);/);
  assert.match(src, /settled: gazeAreaId \? infoLook\.settled : true, ignore: infoIgnore,/);
});

test('H5: an area the card is told to leave out is not the "switched on now" card (infoOverlayModel ignore)', async () => {
  const { infoOverlayModel } = await import('../scene/src/ns-app.mjs');
  const { BODY_MOTOR_MAP } = await import('../scene/src/ns-bodymap.mjs');
  const empty = { target: 'empty', regionId: null, actionId: null };
  const lit = infoOverlayModel({ gaze: empty, bodyMap: BODY_MOTOR_MAP, regionActivity: { rh_hand: 0.6 } });
  assert.equal(lit.regionId, 'rh_hand', 'a lit area makes the live card');
  const left = infoOverlayModel({ gaze: empty, bodyMap: BODY_MOTOR_MAP, regionActivity: { rh_hand: 0.6 }, ignore: { rh_hand: 0 } });
  assert.notEqual(left.regionId, 'rh_hand', 'left out, it does not');
});

/* ---- H6: the motor areas' occupancy grid ---------------------------------------------------------------------- */

let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function mesh(N, x0, y0, w, h, jitter = 0.3) {
  const xy = [], idx = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) xy.push(x0 + w * (i + jitter * rnd()) / N, y0 + h * (j + jitter * rnd()) / N);
  for (let j = 0; j + 1 < N; j++) for (let i = 0; i + 1 < N; i++) { const a = j * N + i; idx.push(a, a + 1, a + N, a + 1, a + N + 1, a + N); }
  return { xy, idx };
}
function sameGrid(g1, g2) {
  assert.equal(g2.count, g1.count, 'the same number of cells');
  assert.equal(g2.gw, g1.gw); assert.equal(g2.gh, g1.gh);
  let diff = 0;
  for (let y = 0; y < g1.gh; y++) for (let x = 0; x < g1.gw; x++) {
    const b = { x0: x * g1.cellPx + 0.25, y0: y * g1.cellPx + 0.25, x1: (x + 1) * g1.cellPx - 0.25, y1: (y + 1) * g1.cellPx - 0.25 };
    if (g1.hits(b) !== g2.hits(b)) diff++;
  }
  assert.equal(diff, 0, 'every cell the same');
  for (const b of [{ x0: 0, y0: 0, x1: 1e4, y1: 1e4 }, { x0: 100, y0: 80, x1: 333, y1: 251 }, { x0: -50, y0: -50, x1: 20, y1: 20 }]) assert.equal(g2.hits(b), g1.hits(b));
}

test('H6: the fast occupancy grid marks exactly the cells of the plain one (every margin, odd triangles, points off the grid)', () => {
  assert.equal(OCCUPANCY_GRID.fast, true);
  const cases = [
    { ...mesh(40, 60, 40, 500, 260), width: 800, height: 450, cellPx: 4 },
    { ...mesh(60, -300, -200, 2400, 1500), width: 1600, height: 900, cellPx: 4 }, // a brain carried close: larger than the view
    { ...mesh(30, 10, 10, 40, 30, 0.9), width: 320, height: 200, cellPx: 3 }, // tiny, crumpled triangles
    { ...mesh(20, 100, 100, 300, 300, 0), width: 640, height: 480, cellPx: 5 } // corners exactly on cell lines
  ];
  // degenerate (flat) triangles, a point that is NaN, an index past the end, a triangle wider than 40,000 cells
  const extra = { xy: [10, 10, 50, 50, 90, 90, NaN, 5, 0, 0, 1500, 0, 0, 890, 1590, 890], idx: [0, 1, 2, 3, 4, 5, 4, 5, 99, 4, 5, 6, 5, 7, 6], width: 1600, height: 900, cellPx: 4 };
  cases.push(extra);
  for (const c of cases) for (const dilate of [0, 1, 2, 3]) {
    const o = { width: c.width, height: c.height, cellPx: c.cellPx, dilate, indices: c.idx };
    sameGrid(occupancyGridSimple(c.xy, o), occupancyGridFast(c.xy, o));
    sameGrid(occupancyGridSimple(c.xy, { ...o, indices: null }), occupancyGridFast(c.xy, { ...o, indices: null })); // points only
  }
  const c = cases[0];
  sameGrid(occupancyGridSimple(c.xy, { width: c.width, height: c.height, cellPx: 4, dilate: 0, indices: c.idx }), occupancyGrid(c.xy, { width: c.width, height: c.height, cellPx: 4, dilate: 0, indices: c.idx }));
  assert.throws(() => occupancyGridFast([], { width: 0, height: 10 }));
});

test('H6: the fast grid is much quicker on a brain-sized mesh (8,100 points, 16,000 triangles)', () => {
  const { xy, idx } = mesh(90, 100, 50, 1400, 800);
  const o = { width: 1600, height: 900, cellPx: 4, dilate: 0, indices: idx };
  // (the best of nine runs each, and a loose ratio: measured alone about 1.8 ms against 82 ms; the whole suite runs its
  // files side by side on a shared processor)
  const best = f => { let b = Infinity; for (let k = 0; k < 9; k++) { const t = performance.now(); f(); b = Math.min(b, performance.now() - t); } return b; };
  const slow = best(() => occupancyGridSimple(xy, o)), fast = best(() => occupancyGridFast(xy, o));
  assert.ok(fast * 2 < slow, `fast ${fast.toFixed(2)} ms against ${slow.toFixed(2)} ms`);
});

test('H6, H7: what letting go plans again (ARROW_REPLAN) and the mirror body\'s reset (MIRROR_RESET)', () => {
  assert.deepEqual({ ...ARROW_REPLAN }, { keepUnmoved: true, keepClearOfMotor: true, liveCrosshair: true, liveCrossPx: 32, restGrids: 4, startPlans: 8,
    spreadFrames: 3, hudReadLag: true, stepped: true, holdFrames: 2, holdMax: 0 }); // (stepped, holdFrames, holdMax: UI3, section 200)
  assert.ok(Object.isFrozen(ARROW_REPLAN) && Object.isFrozen(MIRROR_RESET));
  assert.equal(MIRROR_RESET.keepStart, true);
  // the decisions are the pure functions below; the scene only feeds them (one line each, read from the source)
  const src = readFileSync(new URL('../scene/src/ns-scene-three.mjs', import.meta.url), 'utf8');
  assert.match(src, /if \(!NsArrows\.keptTipsClear\(boxes, \{ grid: \{ hits: b => \(motorCoversRect\(b, 0\) \? 1 : 0\) \} \}\)\) return false;/);
  assert.match(src, /NsArrows\.keptTipsClear\(NsArrows\.anchorBoxesPx\(M\.plan\.anchors, \{ cam: mCam, sizePx \}\), \{ grid: motorRestGrid\(mCam\), padPx: 1 \}\)/);
  assert.match(src, /if \(mKeeps && releasing && releaseKeepsM === false\) \{ mKeeps = false; mForce = true; \}/);
  // a frame planned again for that reason is planned afresh (the start's plan, taken back, put the tip on the area again)
  assert.match(src, /if \(mForce \|\| !useStartPlan\(M, key\)\) \{/);
  assert.match(src, /keptB = NsArrows\.keptTipsClear\(NsArrows\.anchorBoxesPx\(B\.plan\.anchors, \{ cam: refCam, sizePx: B\.plan\.sizes\.sizePx \}\), \{ avoid: \[mPad, mTop\] \}\);/);
  assert.match(src, /stage = NsArrows\.releasePlanStage\(age, ARROW_REPLAN\.spreadFrames\)/);
});

test('H7 (second pass): kept tips stay only while none lies on a motor area of the brain where it is now, or on a box to avoid', () => {
  // a grid with the motor areas of a brain carried aside: one block of cells, 200..400 x 100..300 px
  const xy = [200, 100, 400, 100, 400, 300, 200, 300];
  const grid = occupancyGridFast(xy, { width: 800, height: 450, cellPx: 4, dilate: 0, indices: [0, 1, 2, 0, 2, 3] });
  const tip = (x, y, h = 20) => ({ x0: x - h, y0: y - h, x1: x + h, y1: y + h });
  assert.equal(keptTipsClear([tip(600, 200), tip(100, 380)], { grid }), true, 'all clear of the areas: the tips stay');
  assert.equal(keptTipsClear([tip(600, 200), tip(390, 200)], { grid }), false, 'one tip on the areas: the frame is planned again');
  // the grid test can be padded as the planner pads it (the first marked cell is x 196 to 200: its corner lies on the
  // areas' edge; cells are 4 px): a box ending at x 195 is clear, the same box grown by 4 px is not
  assert.equal(keptTipsClear([tip(175, 200)], { grid }), true);
  assert.equal(keptTipsClear([tip(176.5, 200)], { grid, padPx: 4 }), false);
  // boxes to avoid: strict overlap, null skipped (the brain's tips against the moved mirror body's padded box and top tip)
  assert.equal(keptTipsClear([tip(100, 100)], { avoid: [null, { x0: 120, y0: 0, x1: 200, y1: 50 }] }), true, 'touching edges do not count');
  assert.equal(keptTipsClear([tip(100, 100)], { avoid: [{ x0: 119, y0: 0, x1: 200, y1: 81 }] }), false);
  assert.equal(keptTipsClear([], { grid }), true);
  assert.equal(keptTipsClear([null, tip(600, 200)], { grid, avoid: null }), true);
});

test('H6 (second pass): a release is planned some drawn frames after it; nothing of the plan on the release frame', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(a => releasePlanStage(a, ARROW_REPLAN.spreadFrames)), ['hold', 'hold', 'hold', 'prepare', 'plan', 'plan']);
  assert.deepEqual([0, 1, 2, 3, 4].map(a => releasePlanStage(a, 2)), ['hold', 'hold', 'prepare', 'plan', 'plan']);
  assert.deepEqual([0, 1, 2].map(a => releasePlanStage(a, 1)), ['hold', 'prepare', 'plan']);
  assert.equal(releasePlanStage(0, 0), 'plan', 'spreadFrames 0: the first frame plans, as before');
  assert.equal(releasePlanStage(NaN, 2), 'plan');
});

/* ---- H7: the crosshair the player sees, in a plan's view ------------------------------------------------------- */

test('H7: viewPointInPlan maps the crosshair of the view in use into a frame\'s reference view', () => {
  const W = 1600, Hh = 900, base = { width: W, height: Hh, fovYDeg: 60, position: [0, 0.36, 0.46] };
  const centre = [0, -1.5, -5.9];
  const same = { ...base, yaw: 0, pitch: -0.445 };
  const p0 = viewPointInPlan(same, centre, same, W / 2, Hh / 2);
  assert.ok(Math.abs(p0.x - W / 2) < 1e-6 && Math.abs(p0.y - Hh / 2) < 1e-6, 'the same camera: the crosshair is the crosshair');
  // the plan made 12.5 degrees above the look (a brain carried up): the real crosshair lies BELOW the plan's middle
  const plan = { ...base, yaw: 0, pitch: -0.445 + 0.218 };
  const p = viewPointInPlan(plan, centre, same, W / 2, Hh / 2);
  assert.ok(Math.abs(p.x - W / 2) < 1 && p.y > Hh / 2 + 100, `below the plan's middle (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
  // and it is where the crosshair's sight line meets the plane through the centre
  const fwd = [0, Math.sin(plan.pitch), -Math.cos(plan.pitch)];
  const D = (centre[0] - base.position[0]) * fwd[0] + (centre[1] - base.position[1]) * fwd[1] + (centre[2] - base.position[2]) * fwd[2];
  const d = [0, Math.sin(same.pitch), -Math.cos(same.pitch)], t = D / (d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2]);
  const q = projectWorldPx([base.position[0] + t * d[0], base.position[1] + t * d[1], base.position[2] + t * d[2]], plan);
  assert.ok(Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.y - p.y) < 1e-6);
  // a look away from the plane, or a centre behind the plan camera: nothing
  assert.equal(viewPointInPlan(plan, centre, { ...base, yaw: Math.PI, pitch: 0 }, W / 2, Hh / 2), null);
  assert.equal(viewPointInPlan(plan, [0, 0, 5], same, W / 2, Hh / 2), null);
  assert.equal(viewPointInPlan(plan, null, same, W / 2, Hh / 2), null);
});

/* ---- H9: the brain behind you ---------------------------------------------------------------------------------- */

test('H9: brainBehind is true for a brain carried behind you while you look ahead, and false once you turn round', () => {
  assert.equal(CARRY_THROUGH, true, 'the keys still carry the brain through you');
  assert.deepEqual({ ...BRAIN_BEHIND }, { behindM: 0, facingCos: 0 });
  const eye = [0, 0.358, 0.462];
  assert.equal(brainBehind({ centre: [0.005, -1.513, -5.944], eye, lookYaw: 0 }), false, 'the start place');
  assert.equal(brainBehind({ centre: [0.005, -1.513, 1.384], eye, lookYaw: 0 }), true, 'the hunt\'s brain, behind the eye');
  assert.equal(brainBehind({ centre: [0.005, -1.513, 1.87], eye, lookYaw: -0.4 }), true, 'looking a little aside');
  assert.equal(brainBehind({ centre: [0.005, -1.513, 1.87], eye, lookYaw: 170 * Math.PI / 180 }), false, 'turned round: the brain is in view');
  assert.equal(brainBehind({ centre: [0.005, -1.513, 1.87], eye, lookYaw: 80 * Math.PI / 180 }), true, 'turned 80 degrees: not yet');
  assert.equal(brainBehind({ centre: [0.005, -1.513, 0.4], eye, lookYaw: 0 }), false, 'in you, not behind you');
  // (yaw -90 degrees looks along +x: a brain at x -2.5 is behind that start look, one at x +2.5 in front of it)
  assert.equal(brainBehind({ centre: [-2.5, -1.5, 0.46], eye, startYaw: -Math.PI / 2, lookYaw: -Math.PI / 2 }), true, 'a start look to the right turns the rule with it');
  assert.equal(brainBehind({ centre: [2.5, -1.5, 0.46], eye, startYaw: -Math.PI / 2, lookYaw: -Math.PI / 2 }), false);
  assert.equal(brainBehind({ centre: null, eye }), false);
  assert.equal(brainBehind({ centre: [0, 0, NaN], eye }), false);
});

test('H9: the tip says where the brain is and the two ways back, in a few plain words', () => {
  const t = TIP.brainBehind;
  assert.equal(t.title, 'The brain is behind you');
  assert.match(t.hint, /Turn round/);
  assert.match(t.hint, /Esc, then Reset brain view/);
  assert.ok(`${t.title} ${t.hint}`.split(/\s+/).length <= 14, 'few words');
  assert.equal(TIP.brainAway.title, 'The brain is out of sight');
  assert.match(TIP.brainAway.hint, /Esc, then Reset brain view/);
  assert.ok(`${TIP.brainAway.title} ${TIP.brainAway.hint}`.split(/\s+/).length <= 16, 'few words');
});

test('H9 (second pass): the lost-brain words only while none of the brain is in the picture', () => {
  assert.equal(brainLostWords({ behind: true, seenShare: 0 }), 'behind');
  assert.equal(brainLostWords({ behind: true, away: true, seenShare: 0 }), 'behind', 'behind wins');
  assert.equal(brainLostWords({ away: true, seenShare: 0 }), 'away');
  // the check's cases: turned 86 degrees with the strip filling a third of the picture; half the brain on screen
  assert.equal(brainLostWords({ behind: true, seenShare: 0.3 }), null);
  assert.equal(brainLostWords({ away: true, seenShare: 0.56 }), null);
  assert.equal(brainLostWords({ behind: true, seenShare: 0.002 }), null, 'one point of it in view is enough');
  assert.equal(brainLostWords({ behind: true, seenShare: null }), null, 'not known: no words');
  assert.equal(brainLostWords({ seenShare: 0 }), null, 'not carried away: no words');
  const src = readFileSync(new URL('../scene/src/ns-app.mjs', import.meta.url), 'utf8');
  assert.match(src, /else if \(!tipModel && !arrowTip && NT\.TIP\.brainBehind\) \{/);
  assert.match(src, /const brainAway = \(out\.brainBehind === true && brainSeenShare === 0 && !grabbing && !onArrow\) \|\|/);
});
