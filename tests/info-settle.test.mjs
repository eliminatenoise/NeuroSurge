/** When the look takes over the information card (user Messages 55 and 56: easier to use; a learning tool). The motor
 * areas are small and lie side by side, so a look that leaves a chosen area for the body crosses others on its way.
 * The rule checked here (ns-app infoSettleStep and the `settled` / `ignore` inputs of infoOverlayModel): the card, and
 * with it the area the number keys act on, changes to an area only when the look has rested on it (or a click, a tap on
 * a muscle or a number key meant it); an area the look only crossed stays out of the "switched on now" card.
 * Pure parts only: no scene, model, browser or native fixture; every time and level below is a supplied number. These
 * cases establish which card model is built, never pixels, real look timing, learning outcomes or biology.
 * Run: node tests/info-settle.test.mjs (no arguments).
 */
import assert from 'node:assert/strict';

assert.equal(process.argv.length, 2, 'Run this test without arguments');
const target = new URL('../scene/src/ns-app.mjs', import.meta.url);
const app = await import(target.href);
const { BODY_MOTOR_MAP } = await import(new URL('../scene/src/ns-bodymap.mjs', import.meta.url).href);
const { GAZE_DWELL } = await import(new URL('../scene/src/ns-actions.mjs', import.meta.url).href);
const { infoSettleStep, infoOverlayModel, INFO_SETTLE, INFO_LIVE } = app;
const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: String(error) }); }
}
const A = 'rh_knee', B = 'rh_ankle', C = 'rh_hip';
const REST = INFO_SETTLE.restS;
const gazeOn = id => ({ target: 'region', regionId: id, actionId: null, regionActionId: null, hemisphere: 'right', isLeftArm: false, u: null });
const OFF = { target: 'none', regionId: null, actionId: null };
const cardOf = (id, extra = {}) => infoOverlayModel({ gaze: gazeOn(id), bodyMap: BODY_MOTOR_MAP, regionActivity: {}, ...extra });

check('the rest time is the activity\'s own: the card changes when a look\'s movement is taken', () => {
  assert.equal(REST, GAZE_DWELL.latchS);
  assert.ok(REST > 0 && INFO_SETTLE.graceS > 0);
});

check('with no card yet there is nothing to protect: the first area looked at is taken at once', () => {
  const s = infoSettleStep(null, { regionId: A, t: 5 });
  assert.equal(s.settled, true);
  assert.deepEqual(s.crossed, {});
  assert.equal(s.regionId, A);
  assert.equal(s.since, 5);
});

check('another area takes the card only after the look has rested on it', () => {
  let s = infoSettleStep(null, { regionId: A, t: 0 });
  s = infoSettleStep(s, { regionId: B, t: 1, keptId: A });
  assert.equal(s.settled, false);
  assert.ok(Object.hasOwn(s.crossed, B));
  s = infoSettleStep(s, { regionId: B, t: 1 + REST / 2, keptId: A });
  assert.equal(s.settled, false);
  s = infoSettleStep(s, { regionId: B, t: 1 + REST, keptId: A });
  assert.equal(s.settled, true);
  assert.deepEqual(s.crossed, {}, 'a rested-on area is no longer "only crossed"');
  const later = infoSettleStep(s, { regionId: B, t: 9, keptId: B });
  assert.equal(later.settled, true);
  assert.equal(later.since, 1, 'the arrival time is kept while the look stays on the area');
});

check('a sweep that rests nowhere changes nothing, and its crossed areas are remembered while they glow', () => {
  let s = infoSettleStep(null, { regionId: A, t: 0 });
  s = infoSettleStep(s, { regionId: B, t: 2.0, keptId: A, pulseId: B });
  s = infoSettleStep(s, { regionId: C, t: 2.1, keptId: A, pulseId: C, levels: { [B]: 0.9, [C]: 0.2 } });
  assert.equal(s.settled, false);
  s = infoSettleStep(s, { regionId: null, t: 2.2, keptId: A, pulseId: C, levels: { [B]: 0.7, [C]: 0.9 } });
  assert.equal(s.settled, false);
  assert.equal(s.regionId, null);
  assert.deepEqual(Object.keys(s.crossed).sort(), [B, C].sort());
  // After the grace time an area stays "crossed" only while its glow or pulse lasts.
  s = infoSettleStep(s, { regionId: null, t: 2.2 + INFO_SETTLE.graceS + 0.1, keptId: A, pulseId: C, levels: { [B]: 0, [C]: 0.5 } });
  assert.deepEqual(Object.keys(s.crossed), [C]);
  s = infoSettleStep(s, { regionId: null, t: 9, keptId: A, pulseId: null, levels: { [B]: 0, [C]: INFO_LIVE.minLevel } });
  assert.deepEqual(s.crossed, {});
});

check('coming back to the area whose card is kept needs no rest', () => {
  let s = infoSettleStep(null, { regionId: A, t: 0 });
  s = infoSettleStep(s, { regionId: null, t: 1, keptId: A });
  s = infoSettleStep(s, { regionId: A, t: 2, keptId: A });
  assert.equal(s.settled, true);
  assert.deepEqual(s.crossed, {});
});

check('a click, a tap on a muscle or a number key means its area at once', () => {
  let s = infoSettleStep(null, { regionId: A, t: 0 });
  const clicked = infoSettleStep(s, { regionId: B, t: 1, keptId: A, clickedId: B, pulseId: B });
  assert.equal(clicked.settled, true);
  assert.deepEqual(clicked.crossed, {});
  const chosen = infoSettleStep(s, { regionId: B, t: 1, keptId: A, chosenId: B });
  assert.equal(chosen.settled, true);
  // A crossed area that is then meant (a tap on one of its muscles while looking at the body) is crossed no longer.
  s = infoSettleStep(s, { regionId: B, t: 1, keptId: A, pulseId: B });
  s = infoSettleStep(s, { regionId: null, t: 1.1, keptId: A, pulseId: B, levels: { [B]: 0.9 } });
  assert.ok(Object.hasOwn(s.crossed, B));
  s = infoSettleStep(s, { regionId: null, t: 1.2, keptId: A, pulseId: B, clickedId: B, levels: { [B]: 0.9 } });
  assert.deepEqual(s.crossed, {});
});

check('a clock that went back (a reset) starts the rest again; bad input is no area', () => {
  let s = infoSettleStep(null, { regionId: A, t: 0 });
  s = infoSettleStep(s, { regionId: B, t: 50, keptId: A });
  s = infoSettleStep(s, { regionId: B, t: 3, keptId: A });
  assert.equal(s.settled, false);
  assert.equal(s.since, 3);
  const none = infoSettleStep(s, { regionId: 7, t: NaN, keptId: A });
  assert.equal(none.regionId, null);
  assert.equal(none.settled, false);
  assert.equal(infoSettleStep(undefined).settled, false);
});

check('the card: an unsettled look keeps the kept area\'s card and its numbered movements', () => {
  const kept = cardOf(A);
  assert.equal(kept.mode, 'region');
  assert.equal(kept.movesRegionId, A);
  const unsettled = infoOverlayModel({ gaze: gazeOn(B), bodyMap: BODY_MOTOR_MAP, regionActivity: {}, last: kept, settled: false, ignore: { [B]: 1 } });
  assert.equal(unsettled.regionId, A);
  assert.equal(unsettled.viewed, 'last');
  assert.equal(unsettled.movesRegionId, A, 'the number keys go on acting on the kept area');
  const settled = infoOverlayModel({ gaze: gazeOn(B), bodyMap: BODY_MOTOR_MAP, regionActivity: {}, last: kept, settled: true });
  assert.equal(settled.regionId, B);
  assert.equal(settled.viewed, 'now');
  assert.equal(settled.movesRegionId, B);
});

check('the card: a crossed area\'s look pulse is not "switched on now"; the kept or still glowing area is', () => {
  const kept = cardOf(A);
  const pulse = { regionId: B, actionId: null };
  const crossedOnly = infoOverlayModel({ gaze: OFF, bodyMap: BODY_MOTOR_MAP, regionActivity: { [B]: 0.9 }, last: kept, pulse, ignore: { [B]: 1 } });
  assert.equal(crossedOnly.regionId, A);
  assert.equal(crossedOnly.viewed, 'last');
  const glowing = infoOverlayModel({ gaze: OFF, bodyMap: BODY_MOTOR_MAP, regionActivity: { [A]: 0.4, [B]: 0.9 }, last: kept, pulse, ignore: { [B]: 1 } });
  assert.equal(glowing.regionId, A);
  assert.equal(glowing.source, 'live');
  // Without the rule (no `ignore`) the crossed area took the card: the behaviour this test guards against.
  const before = infoOverlayModel({ gaze: OFF, bodyMap: BODY_MOTOR_MAP, regionActivity: { [B]: 0.9 }, last: kept, pulse });
  assert.equal(before.regionId, B);
  // An area switched on on purpose (not crossed) still takes the card with the look elsewhere.
  const meant = infoOverlayModel({ gaze: OFF, bodyMap: BODY_MOTOR_MAP, regionActivity: { [C]: 0.9 }, last: kept, pulse: { regionId: C, actionId: null }, ignore: { [B]: 1 } });
  assert.equal(meant.regionId, C);
  assert.equal(meant.source, 'live');
});

check('the defaults leave the card as it was: settled, nothing ignored', () => {
  const m = infoOverlayModel({ gaze: gazeOn(B), bodyMap: BODY_MOTOR_MAP, regionActivity: {} });
  assert.equal(m.regionId, B);
  assert.equal(m.viewed, 'now');
});

const failed = results.filter(r => !r.passed);
process.stdout.write(JSON.stringify({
  suite: 'info-settle',
  module: target.href,
  cases: results.length,
  failed: failed.length,
  results,
  scope: 'Pure checks of when the look takes over the information card (ns-app infoSettleStep; infoOverlayModel settled / ignore): the rest time, the first card, a sweep that rests nowhere, the areas only crossed, and a click or number key meaning its area at once. Not checked here: what is drawn, real look timing, whether this is easier to use, or any biology.'
}, null, 2) + '\n');
if (failed.length) process.exitCode = 1;
