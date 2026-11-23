/** 21 November 2026 (package FIXHUD2, browser hunt of Body update 62: H15 to H22): the words, labels, cards and the
 * tutorial. Pure checks on supplied values and on the style sheets' text; no browser. The browser scenarios that show
 * each fix are listed in DESIGN-DECISIONS section 186. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { declutterLabels, LABEL_LAYOUT, BRAIN_TIP_RULES } from '../scene/src/ns-scene-three.mjs';
import { frameArrowSpots, FRAME_PAIR } from '../scene/src/ns-arrows3d.mjs';
import { graspInfoCard, GUIDE, SHELL } from '../scene/src/ns-text.mjs';
import { createGuide, guideStep, guideView } from '../scene/src/ns-guide.mjs';
import { quietPromptText } from '../scene/src/ns-quiet.mjs';

const css = name => readFileSync(new URL(`../scene/example/${name}`, import.meta.url), 'utf8');

test('H17: a label is never placed clearly nearer another part\'s anchor than its own (it would name the wrong colour)', () => {
  // The leg pair at the top, the arm pair under it (not shown here: the cap of two labels): the legs' only free places
  // are down and out, onto the arms' areas (800 by 600: a card along the top, the mirror body in the middle).
  const leg = { w: 80, h: 22, priority: 50, pair: 'leg' }, arm = { w: 96, h: 26, priority: 40, pair: 'arm' };
  const items = [
    { id: 'r:leg', x: 357, y: 82, mirror: -1, text: 'Left leg', ...leg },
    { id: 'l:leg', x: 443, y: 82, mirror: 1, text: 'Right leg', ...leg },
    { id: 'r:arm', x: 274, y: 121, mirror: -1, text: 'Left arm', ...arm },
    { id: 'l:arm', x: 526, y: 121, mirror: 1, text: 'Right arm', ...arm }
  ];
  const obstacles = [{ x0: 0, y0: 0, x1: 800, y1: 100 }, { x0: 320, y0: 0, x1: 480, y1: 200 }];
  const near = (q, it) => Math.hypot(q.x - it.x, q.y - it.y);
  const off = declutterLabels(items, { width: 800, height: 600, obstacles, maxShown: 2, rules: { ...LABEL_LAYOUT, ownArea: false } });
  const wrong = off.filter((q, i) => q.shown && items.some((o, j) => j !== i && o.pair !== items[i].pair && near(q, o) < near(q, items[i])));
  assert.equal(wrong.length, 2, 'without the rule both leg labels land on the arm areas (the fault)');
  const on = declutterLabels(items, { width: 800, height: 600, obstacles, maxShown: 2 });
  assert.equal(on[0].shown || on[1].shown, false, 'the leg labels have no place by their own blocks: not shown');
  on.forEach((q, i) => {
    if (!q.shown) return;
    for (const [j, o] of items.entries()) if (j !== i && o.pair !== items[i].pair) assert.ok(near(q, o) >= LABEL_LAYOUT.ownAreaRatio * near(q, items[i]) - 0.5, `${items[i].text} at ${q.x},${q.y} is nearer ${o.text}`);
  });
  // a required label with nowhere else to go still shows, faded, at the least bad place
  const req = declutterLabels([{ ...items[2], required: true, pair: null }, { ...items[0], pair: null }], { width: 800, height: 600, obstacles: [{ x0: 0, y0: 0, x1: 800, y1: 600 }] });
  assert.ok(req[0].shown && req[0].faded);
});

test('H17: the arm labels\' boxes follow the reading level (the second line shows only at the full level)', () => {
  const q = css('quiet.css');
  for (const level of ['read', 'off']) assert.match(q, new RegExp(`\\.ns-app\\[data-ns-read="${level}"\\] \\.ns-region-label-hemi`), `${level} hides the second line`);
});

test('H15: the brain\'s top tip keeps the default inward cap; its bottom tip may still go up the strip\'s hollow', () => {
  assert.equal(BRAIN_TIP_RULES.ends.inwardMaxFracBy.forward, FRAME_PAIR.inwardMaxFrac);
  assert.equal(BRAIN_TIP_RULES.ends.inwardMaxFrac, 1.6);
  // a frame whose top middle is blocked down to well past half its height (the lifted mirror body)
  const rect = { x0: 400, y0: 100, x1: 1200, y1: 550 }, bounds = { x0: 10, y0: 28, x1: 1590, y1: 890 };
  const blocked = (dir, x, y) => dir === 'forward' && x > 640 && x < 960 && y < 300;
  const spots = frameArrowSpots(rect, { halfAlongPx: 18, halfAcrossPx: 40, bounds, blocked, rules: BRAIN_TIP_RULES });
  const half = (rect.y1 - rect.y0) / 2;
  assert.ok(spots.forward.y - rect.y0 <= FRAME_PAIR.inwardMaxFrac * half + 1, `top tip ${spots.forward.y - rect.y0} px in (cap ${FRAME_PAIR.inwardMaxFrac * half})`);
  // (the fault: with the bottom tip's cap the top tip went down past the blocked stretch, into the brain's middle)
  const old = frameArrowSpots(rect, { halfAlongPx: 18, halfAcrossPx: 40, bounds, blocked, rules: { ends: { ...BRAIN_TIP_RULES.ends, inwardMaxFracBy: null } } });
  assert.ok(old.forward.y >= 300, `without its own cap the top tip goes to ${old.forward.y}`);
  // the bottom tip alone, blocked at its side's middle, still goes up past the frame's middle as before
  const blockedB = (dir, x, y) => dir === 'back' && y > 240;
  const b = frameArrowSpots(rect, { halfAlongPx: 18, halfAcrossPx: 40, bounds, blocked: blockedB, rules: BRAIN_TIP_RULES });
  assert.ok(b.back.y <= 240 && rect.y1 - b.back.y > half, `bottom tip at ${b.back.y}`);
});

test('H16: Space on one of your limbs: the grip card says the limb is chosen, not "Nothing is held"', () => {
  const card = graspInfoCard({ phase: 'close', holding: null, chosen: 'rightLeg', kept: false });
  assert.match(card.lead, /^Your right leg is chosen: W A S D and your look move it\.$/);
  assert.doesNotMatch(card.lead, /Nothing is held/);
  assert.notEqual(card.key, graspInfoCard({ phase: 'close', holding: null, kept: false }).key);
  // a real hold still wins, and nothing chosen keeps the old line
  assert.match(graspInfoCard({ phase: 'close', holding: 'brain', chosen: 'rightLeg' }).lead, /^Holding the brain\./);
  assert.match(graspInfoCard({ phase: 'close', holding: null, chosen: null }).lead, /^Nothing is held/);
  assert.match(graspInfoCard({ phase: 'close', holding: null, chosen: 'leftArm', kept: true }).lead, /Your left arm is chosen.*Tap Space again/);
});

test('H18: an area that moved nothing during the first tutorial step asks for another colour; one that moved goes on', () => {
  let g = createGuide({ tutorial: true });
  assert.equal(guideView(g, 0).goalId, 'lookStrip');
  g = guideStep(g, [{ type: 'activate', regionId: 'rh_tongue', isLeftArm: false, kind: 'effector', moves: false, source: 'gaze' }], 1);
  let v = guideView(g, 1);
  assert.equal(v.goalId, 'lookStrip');
  assert.equal(v.text, GUIDE.partial.lookStripStill);
  assert.equal(quietPromptText(v, GUIDE.short), 'Nothing moved: look at another colour');
  // a click on an area that moves clears the hint (a click does not do this step), a look that moves does the step
  g = guideStep(g, [{ type: 'activate', regionId: 'rh_brow', isLeftArm: false, kind: 'effector', moves: true, source: 'click' }], 2);
  assert.equal(guideView(g, 2).text, GUIDE.goals.lookStrip);
  g = guideStep(g, [{ type: 'activate', regionId: 'rh_brow', isLeftArm: false, kind: 'effector', moves: true, source: 'gaze' }], 3);
  assert.equal(guideView(g, 3).goalId, 'pressArea');
});

test('H22: the Esc page says W and S move along the limb and A and D swing it', () => {
  const move = SHELL.menu.find(m => m.id === 'move');
  const rows = Object.fromEntries(move.rows);
  assert.equal(rows['W S'], 'reach it out or draw it in');
  assert.equal(rows['A D'], 'swing it left or right');
  for (const list of [SHELL.controls, SHELL.introControls]) {
    const words = list.map(r => r.join(' ')).join('\n');
    assert.doesNotMatch(words, /hand or foot forward|left\/right|back\/closer|S closer/);
  }
  assert.match(SHELL.controls.map(r => r.join(' ')).join('\n'), /straight out from its shoulder or hip/);
});

test('H20: the start and Esc pages end above the "Simulated activity" line in a wide window too', () => {
  assert.match(css('quiet.css'), /@media \(min-aspect-ratio: 1\/1\) \{ \.ns-shell:not\(\[hidden\]\) \{ padding-bottom: 28px; \} \}/);
});
