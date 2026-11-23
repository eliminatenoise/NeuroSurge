/** Touching muscles always told apart (21 November 2026, DESIGN-DECISIONS section 188).
 *
 * The owner, Messages 195 and 202: "more clear contrast and differentiation between muscle groups"; "each muscle group
 * ... should have its own sort of shading system, such that muscles next to each other can be obviously told apart".
 * Measured on the screen, three lightness steps left clusters of four or five touching muscles of one group drawn nearly
 * equal, and the shade floor joined every dark muscle in the deepest shade. Now each muscle also takes a warm step (a
 * quieter or fuller rose at the same lightness), the steps are given out from the muscles seen side by side as well as
 * those that touch, and the floor keeps the colours' ratios (ns-raw-look; tests/look-fixes-r26.test.mjs).
 * The browser check of the colours drawn is tests/browser-muscle-shades.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MUSCLE_GROUPS, MUSCLE_STEP, MUSCLE_GROUP_TONES, assignMuscleSteps, drawnMuscleLab, drawnMuscleLightness, muscleGroupTone, muscleGroupBaseInto, muscleToneKey, oklchMaxChroma } from '../scene/src/ns-colors.mjs';
import { MUSCLE_SEEN_CONTACTS, seenContactMap, seenLightMap } from '../scene/src/ns-muscle-seen.mjs';
import { seenRows, seenModuleText } from './muscle-shades-probe.mjs';

const lch = l => [l[0], Math.hypot(l[1], l[2]), Math.atan2(l[2], l[1]) * 180 / Math.PI];
const dE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const contactsOf = list => {
  const c = new Map();
  for (const [a, b, w] of list) for (const [x, y] of [[a, b], [b, a]]) { if (!c.has(x)) c.set(x, new Map()); c.get(x).set(y, w); }
  return c;
};
const toneL = g => muscleGroupTone(g).oklch[0];

test('every muscle colour stays one rose red: hue 10-28, chroma 0.08-0.19; a warm step leaves the lightness that tells the groups apart', () => {
  for (const g of MUSCLE_GROUPS) for (const st of MUSCLE_STEP.steps) {
    const plain = drawnMuscleLab(g.id, 'outer', st, 0);
    for (const w of MUSCLE_STEP.warm.steps) {
      const [L, C, h] = lch(drawnMuscleLab(g.id, 'outer', st, w));
      assert.ok(h >= 9.95 && h <= 28.05, `${g.id} step ${st} warm ${w}: hue ${h.toFixed(1)} (no pink, no orange)`);
      assert.ok(C >= 0.08 && C <= 0.19, `${g.id} step ${st} warm ${w}: chroma ${C.toFixed(3)} (not grey, not candy red)`);
      assert.ok(Math.abs(L - plain[0]) < 0.035, `${g.id} step ${st} warm ${w}: lightness ${L.toFixed(3)} against ${plain[0].toFixed(3)}`);
    }
  }
  // the warm steps part two muscles of the same lightness clearly (22 November 2026: on the dark tones, where the screen
  // has little room for a fuller red and a quieter one reads mauve, less clearly)
  for (const [g, d] of [['shoulder', 0.07], ['calf', 0.07], ['forearmFlexors', 0.035]]) {
    const q = drawnMuscleLab(g, 'outer', 0, -1), f = drawnMuscleLab(g, 'outer', 0, 1);
    assert.ok(dE(q, f) > d, `${g}: quieter and fuller ${dE(q, f).toFixed(3)} apart`);
  }
  // on a dark colour the quieter step turns toward crimson and keeps more of its chroma (a quieter dark red reads mauve
  // or brown); on a light one it keeps more chroma too and never turns cooler than the rose's 22 degrees (it reads pink)
  const dark = lch(drawnMuscleLab('chest', 'outer', 0, -1)), dark0 = lch(drawnMuscleLab('chest', 'outer', 0, 0));
  const mid = lch(drawnMuscleLab('shoulder', 'outer', 0, -1)), mid0 = lch(drawnMuscleLab('shoulder', 'outer', 0, 0));
  assert.ok(dark[2] < dark0[2] - 5 && mid[2] < mid0[2] - 3, 'toward crimson');
  assert.ok(dark[1] / dark0[1] > mid[1] / mid0[1], `the dark tone keeps more chroma (${(dark[1] / dark0[1]).toFixed(2)} against ${(mid[1] / mid0[1]).toFixed(2)})`);
  for (const g of MUSCLE_GROUPS) for (const st of MUSCLE_STEP.steps) {
    const [L, C, h] = lch(drawnMuscleLab(g.id, 'outer', st, -1)), own = lch(drawnMuscleLab(g.id, 'outer', st, 0));
    if (L > MUSCLE_STEP.warm.lowLightFrom) assert.ok(h >= MUSCLE_STEP.warm.lowLightHue - 0.05 && C >= 0.75 * own[1], `${g.id} ${st}: a light quieter step, hue ${h.toFixed(1)}, chroma ${C.toFixed(3)} of ${own[1].toFixed(3)} (not pink)`);
  }
  // the fuller step stays under 0.85 of the screen's most chroma (no channel driven to its end: the blood crimson), or
  // at the group's own chroma where the screen has no more room; no channel of any colour drawn under 14 of 255
  const srgb8 = v => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  for (const g of MUSCLE_GROUPS) for (const st of MUSCLE_STEP.steps) {
    const [L, C, h] = lch(drawnMuscleLab(g.id, 'outer', st, 1)), own = lch(drawnMuscleLab(g.id, 'outer', st, 0));
    assert.ok(C <= MUSCLE_STEP.gamut * oklchMaxChroma(L, h) + 1e-3 || Math.abs(C - own[1]) < 1e-3, `${g.id} ${st}: fuller chroma ${C.toFixed(3)}, the screen's most ${oklchMaxChroma(L, h).toFixed(3)}`);
    for (const w of MUSCLE_STEP.warm.steps) {
      const rgb = muscleGroupBaseInto(g.id, 'k', 'outer', [0, 0, 0], undefined, undefined, st, MUSCLE_STEP, w).map(srgb8);
      assert.ok(Math.min(...rgb) >= 14, `${g.id} ${st}/${w}: ${rgb}`);
    }
  }
  // the darkest tone's lower step is no longer cut short by the clamp (minL)
  assert.ok(drawnMuscleLightness('chest', 'outer', 0) - drawnMuscleLightness('chest', 'outer', -1) > MUSCLE_STEP.stepL - 0.01);
  // without a warm step a muscle draws exactly as before
  assert.deepEqual(muscleGroupBaseInto('thighFront', 'k', 'outer', [0, 0, 0], undefined, undefined, 1), muscleGroupBaseInto('thighFront', 'k', 'outer', [0, 0, 0], undefined, undefined, 1, MUSCLE_STEP, 0));
});

test('five muscles of one group that all touch (the forearm\'s flexors) are all drawn apart; three lightness steps alone cannot', () => {
  const keys = ['pronator teres', 'flexor carpi radialis', 'palmaris longus', 'flexor digitorum superficialis', 'flexor carpi ulnaris'];
  const list = [];
  // (contacts as long as the forearm's are in the pictures: a warm step has a cost, MUSCLE_STEP.warm.cost, and a short
  // contact that is only a little under its goal does not earn one)
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) list.push([keys[i], keys[j], 180]);
  const c = contactsOf(list), group = () => 'forearmFlexors';
  const minPair = o => {
    const st = assignMuscleSteps(keys, c, group, toneL, o);
    let m = Infinity;
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
      m = Math.min(m, dE(drawnMuscleLab('forearmFlexors', null, st.get(keys[i]), st.warm.get(keys[i]), o), drawnMuscleLab('forearmFlexors', null, st.get(keys[j]), st.warm.get(keys[j]), o)));
    }
    return { m, st };
  };
  const now = minPair(MUSCLE_STEP);
  // (22 November 2026: the forearm's flexors are the darkest tone, where the warm steps are smallest now: see the first test)
  assert.ok(now.m >= 0.03, `every pair at least ${now.m.toFixed(3)} apart in OKLab`);
  const lightnessOnly = minPair(Object.freeze({ ...MUSCLE_STEP, warm: Object.freeze({ ...MUSCLE_STEP.warm, steps: [0] }) }));
  assert.ok(lightnessOnly.m < 0.03, `lightness alone leaves a pair ${lightnessOnly.m.toFixed(3)} apart`);
  assert.equal(now.st.worst.contacts, 10);
  assert.ok(now.st.worst.same >= 0.03);
  // with the warm steps free (and the first part's stronger dark steps) every pair of the five is 0.07 apart or more:
  // the cost keeps a muscle on its group's own colour where the gain is small, and the colour rule keeps the steps mild
  const free = minPair(Object.freeze({ ...MUSCLE_STEP, gamut: null, warm: Object.freeze({ ...MUSCLE_STEP.warm, cost: 1e-4, costLow: 0.01, lowDark: [-0.25, -8], lowFrom: 0.5, lowFromDrawn: false }) }));
  assert.ok(free.m >= 0.07, `free warm steps: ${free.m.toFixed(3)}`);
  // deterministic
  assert.deepEqual([...assignMuscleSteps(keys, c, group, toneL).warm], [...now.st.warm]);
});

test('a pair seen side by side but not touching (ns-muscle-seen) is drawn apart too; a group border keeps its lightness gap', () => {
  // a and b each touch c heavily (one group); a and b do not touch in the cells, but the pictures show them side by side
  const c = contactsOf([['a', 'c', 200], ['b', 'c', 200]]), group = () => 'thighFront';
  const apart = (st, x, y) => dE(drawnMuscleLab('thighFront', null, st.get(x), st.warm.get(x)), drawnMuscleLab('thighFront', null, st.get(y), st.warm.get(y)));
  const without = assignMuscleSteps(['a', 'b', 'c'], c, group, toneL);
  const withSeen = assignMuscleSteps(['a', 'b', 'c'], c, group, toneL, MUSCLE_STEP, null, null, contactsOf([['a', 'b', 80]]));
  assert.ok(apart(without, 'a', 'b') < 0.03, `not known: the same colour (${apart(without, 'a', 'b').toFixed(3)})`);
  assert.ok(apart(withSeen, 'a', 'b') >= 0.075, `seen: ${apart(withSeen, 'a', 'b').toFixed(3)} apart`);
  assert.ok(apart(withSeen, 'a', 'c') >= 0.075 && apart(withSeen, 'b', 'c') >= 0.075, 'and both still apart from the third');
  assert.equal(withSeen.worst.contacts, 3); assert.equal(without.worst.contacts, 2);
  // (22 November 2026) a muscle the table names that the body does not have is counted, not silently dropped; and a
  // seenWeight of 0 switches the table off (it was read as 1)
  const unknown = assignMuscleSteps(['a', 'b', 'c'], c, group, toneL, MUSCLE_STEP, null, null, contactsOf([['a', 'b', 80], ['a', 'zz gone', 50]]));
  assert.equal(unknown.worst.seenUnknown, 1); assert.equal(withSeen.worst.seenUnknown, 0);
  const off = assignMuscleSteps(['a', 'b', 'c'], c, group, toneL, Object.freeze({ ...MUSCLE_STEP, seenWeight: 0 }), null, null, contactsOf([['a', 'b', 80]]));
  assert.deepEqual([[...off], [...off.warm]], [[...without], [...without.warm]]);
  // two groups side by side: the border muscles stay otherGoal apart in lightness (the groups are told apart by it)
  const g2 = k => (k === 'g' ? 'thighInner' : 'thighFront');
  const st = assignMuscleSteps(['v', 'g'], contactsOf([['v', 'g', 100]]), g2, toneL);
  assert.ok(Math.abs(drawnMuscleLightness('thighFront', null, st.get('v')) - drawnMuscleLightness('thighInner', null, st.get('g'))) >= MUSCLE_STEP.otherGoal - 1e-9);
});

test('the table of muscles seen side by side: side-free keys, each pair once, both ways in the map', () => {
  assert.ok(MUSCLE_SEEN_CONTACTS.length > 150, `${MUSCLE_SEEN_CONTACTS.length} pairs`);
  const seen = new Set();
  for (const [a, b, n] of MUSCLE_SEEN_CONTACTS) {
    assert.ok(typeof a === 'string' && typeof b === 'string' && a < b, `${a} / ${b}: sorted, two muscles`);
    assert.ok(Number.isInteger(n) && n >= 6, `${a} / ${b}: seen along ${n} px`);
    assert.equal(muscleToneKey('x', a), a, `${a}: a side-free tone key`);
    assert.ok(!seen.has(`${a}|${b}`)); seen.add(`${a}|${b}`);
  }
  const m = seenContactMap();
  for (const [a, b, n] of MUSCLE_SEEN_CONTACTS) { assert.equal(m.get(a).get(b), n); assert.equal(m.get(b).get(a), n); }
  // the light seen on the two sides: at most six samples a pair, hundredths of the full light, the other way round swapped
  const light = seenLightMap();
  let withLight = 0;
  for (const [a, b, , samples] of MUSCLE_SEEN_CONTACTS) {
    assert.ok(Array.isArray(samples) && samples.length <= 6, `${a} / ${b}: light samples`);
    for (const q of samples) assert.ok(q.length === 2 && q.every(v => Number.isInteger(v) && v >= 1 && v <= 150), `${a} / ${b}: ${JSON.stringify(q)}`);
    if (!samples.length) { assert.ok(!light.has(a) || !light.get(a).has(b)); continue; }
    withLight++;
    assert.deepEqual(light.get(a).get(b), samples.map(q => [q[0] / 100, q[1] / 100]));
    assert.deepEqual(light.get(b).get(a), samples.map(q => [q[1] / 100, q[0] / 100]));
  }
  assert.ok(withLight > 250, `${withLight} pairs with light samples`);
  // the tones themselves are unchanged (section 168): the group tones and their lightness order
  assert.deepEqual(MUSCLE_GROUP_TONES.rose.oklch, [0.602, 0.134, 24]);
});

test('the light the pictures show on the two sides of a pair counts: a lightness step the light would cancel is turned round or replaced', () => {
  const lightOf = list => {
    const c = new Map();
    for (const [a, b, q] of list) { if (!c.has(a)) c.set(a, new Map()); c.get(a).set(b, q); if (!c.has(b)) c.set(b, new Map()); c.get(b).set(a, q.map(([x, y]) => [y, x])); }
    return c;
  };
  // the two colours as they are drawn under a light of ka on a and kb on b (colour x light = OKLab vector x cube root)
  const under = (st, g, ka, kb) => {
    const A = drawnMuscleLab(g, null, st.get('a'), st.warm.get('a')).map(v => v * Math.cbrt(ka)), B = drawnMuscleLab(g, null, st.get('b'), st.warm.get('b')).map(v => v * Math.cbrt(kb));
    return dE(A, B);
  };
  const c = contactsOf([['a', 'b', 100]]);
  for (const g of ['thighFront', 'forearmFlexors', 'abdominalWall']) {
    const plain = assignMuscleSteps(['a', 'b'], c, () => g, toneL);
    // one of the two ways the light can fall cancels most of the plain choice's step
    const worse = Math.min(under(plain, g, 0.9, 0.55), under(plain, g, 0.55, 0.9));
    assert.ok(worse < 0.09, `${g}: the plain choice under the wrong light ${worse.toFixed(3)}`);
    for (const [ka, kb] of [[0.9, 0.55], [0.55, 0.9]]) {
      const lit = assignMuscleSteps(['a', 'b'], c, () => g, toneL, MUSCLE_STEP, null, null, null, lightOf([['a', 'b', [[ka, kb]]]]));
      assert.ok(under(lit, g, ka, kb) >= 0.19, `${g}: with the light known (${ka}, ${kb}) ${under(lit, g, ka, kb).toFixed(3)}`);
      assert.ok(under(lit, g, 1, 1) >= MUSCLE_STEP.sameGoal, `${g}: and still apart in equal light`);
    }
    // a left and a right muscle share one colour and the light falls the other way on the other side: both samples hold
    const both = assignMuscleSteps(['a', 'b'], c, () => g, toneL, MUSCLE_STEP, null, null, null, lightOf([['a', 'b', [[0.9, 0.55], [0.55, 0.9]]]]));
    const least = Math.min(under(both, g, 0.9, 0.55), under(both, g, 0.55, 0.9));
    assert.ok(least >= 0.06 && least >= worse - 1e-9, `${g}: both ways ${least.toFixed(3)} (the plain choice ${worse.toFixed(3)})`);
  }
  // light.even: a pair the pictures always show under very different light must not rely on that light alone: with
  // the same light on both sides it is still light.goal apart or close to it
  // (an option, off in the game: MUSCLE_STEP.light.even 0; see the note there)
  const even = Object.freeze({ ...MUSCLE_STEP, light: Object.freeze({ ...MUSCLE_STEP.light, even: 2 }) });
  const far = assignMuscleSteps(['a', 'b'], c, () => 'forearmFlexors', toneL, even, null, null, null, lightOf([['a', 'b', [[0.2, 0.9], [0.25, 0.8], [0.15, 0.7]]]]));
  assert.ok(under(far, 'forearmFlexors', 1, 1) >= 0.08, `the same light on both: ${under(far, 'forearmFlexors', 1, 1).toFixed(3)}`);
  assert.equal(MUSCLE_STEP.light.even, 0);
  // no samples, or the rule switched off: the steps of before
  const plain = assignMuscleSteps(['a', 'b'], c, () => 'thighFront', toneL);
  const off = assignMuscleSteps(['a', 'b'], c, () => 'thighFront', toneL, Object.freeze({ ...MUSCLE_STEP, light: null }), null, null, null, lightOf([['a', 'b', [[0.9, 0.55]]]]));
  assert.deepEqual([[...off], [...off.warm]], [[...plain], [...plain.warm]]);
  assert.deepEqual([[...assignMuscleSteps(['a', 'b'], c, () => 'thighFront', toneL, MUSCLE_STEP, null, null, null, new Map())], [...plain]][0], [...plain]);
});

test('the table of seen pairs is written from the views: the longest boundary, up to six different lights, a pair seen once is kept', () => {
  const view = contacts => ({ contacts });
  const c = (ka, kb, n, la, lb, twin = false) => ({ ka, kb, n, la, lb, twin });
  const rows = seenRows([
    view([c('b muscle', 'a muscle', 40, 0.9, 0.5), c('a muscle', 'c muscle', 12, 0.3, 0.31), c('x', 'x', 50, 1, 1, true)]),
    view([c('a muscle', 'b muscle', 70, 0.52, 0.88), c('a muscle', 'b muscle', 9, 0.5, 0.9)])
  ], [['a muscle', 'c muscle', 30, [[10, 20]]], ['old one', 'old two', 25, []]]);
  assert.deepEqual(rows, [
    ['a muscle', 'b muscle', 70, [[52, 88]]], // the longest boundary first; the first view's sample is the same light (a 0.5, b 0.9), the third nearly so
    ['a muscle', 'c muscle', 30, [[30, 31]]], // the longest boundary ever seen, the new light
    ['old one', 'old two', 25, []] // not seen this time: kept
  ]);
  // different lights are all kept, at most six
  const many = seenRows([view([0.1, 0.2, 0.4, 0.8, 1.2, 2.5, 5, 9].map((r, i) => c('p', 'q', 20 + i, 0.5, Math.min(1, 0.5 / r))))]);
  assert.equal(many[0][3].length, 6);
  assert.match(seenModuleText([view([c('p', 'q', 20, 0.5, 0.25)])]), /^ {2}\["p", "q", 20, \[\[50,25\]\]\]$/);
  // (22 November 2026) the view where the light on the two sides is most nearly the same is always kept, even when
  // longer contacts show the pair under very different light
  const even = seenRows([view([c('p', 'q', 90, 0.9, 0.2), c('p', 'q', 80, 0.2, 0.9), c('p', 'q', 70, 0.8, 0.25), c('p', 'q', 60, 0.15, 0.7), c('p', 'q', 50, 0.95, 0.15), c('p', 'q', 40, 0.1, 0.8), c('p', 'q', 12, 0.17, 0.18)])]);
  assert.deepEqual(even[0][3][0], [17, 18]);
  assert.equal(even[0][3].length, 6);
});
