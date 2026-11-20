/** 20 November 2026 (package HUD, browser hunt H2-3 to H2-8): labels, tips and cards that covered each other.
 * Pure software checks on supplied values and on the style sheets' text; no browser. The pictures that show the
 * layouts themselves are made with the browser harness (the scenario list is in the package notes). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tipActionId, infoMoves } from '../scene/src/ns-app.mjs';
import { BODY_MOTOR_MAP } from '../scene/src/ns-bodymap.mjs';

const region = id => BODY_MOTOR_MAP.regions.find(r => r.id === id);
const css = name => readFileSync(new URL(`../scene/example/${name}`, import.meta.url), 'utf8');

test('H2-7: the left forearm turn tip names the movement under the look, as every other area does', () => {
  const fore = region('rh_forearm');
  assert.ok(fore && fore.isLeftArm, 'the left forearm turn is a left-arm area');
  // Its gaze carries no action id (palm down / up are not game-arm actions); the activity picked one by the look's place.
  const gaze = { target: 'region', regionId: 'rh_forearm', isLeftArm: true, actionId: null, regionActionId: null };
  for (const [part, words] of [['pronation', /palm down/], ['supination', /palm up/]]) {
    const id = tipActionId(gaze, 'rh_forearm', `rh_forearm/${part}`);
    assert.equal(id, part);
    const row = infoMoves(fore, { leftArm: true }).find(m => m.id === id);
    assert.ok(row && words.test(row.label), `${part}: ${row && row.label}`);
  }
  // The gaze's own ids still come first; another area's activity pick is never taken.
  assert.equal(tipActionId({ regionActionId: 'lh_elbow_flex', actionId: null }, 'lh_elbow', 'lh_elbow/lh_elbow_ext'), 'lh_elbow_flex');
  assert.equal(tipActionId({ regionActionId: null, actionId: 'wrist_flexion' }, 'rh_wrist', 'rh_wrist/wrist_extension'), 'wrist_flexion');
  assert.equal(tipActionId({ regionActionId: null, actionId: null }, 'rh_forearm', 'rh_wrist/wrist_flexion'), null);
  assert.equal(tipActionId({ regionActionId: null, actionId: null }, 'rh_forearm', 'rh_forearm/'), null);
  assert.equal(tipActionId(null, 'rh_forearm', null), null);
});

test('H2-4: no card that holds the floating "Try this" chip is moved by a transform (it would hold the fixed chip)', () => {
  // A transformed (or translated, filtered, perspective) ancestor becomes the containing block of a position: fixed child,
  // so the chip's window place would be measured from the card's corner.
  const sheets = css('quiet.css') + '\n' + css('neurosurge.css');
  const rules = sheets.replace(/\/\*[\s\S]*?\*\//g, '').split('}');
  // (the element a selector styles is its last compound: ".ns-hud .ns-panel-info" styles the card)
  const chipAncestor = sel => sel.split(',').some(s => /(\.ns-panel-info|\.ns-hud-col|\.ns-hud|\.ns-hud-root|\.ns-app)(\[[^\]]*\]|:[\w-]+(\([^)]*\))?)*$/.test(s.trim().split(/[\s>+~]+/).pop() || ''));
  const bad = rules.filter(r => chipAncestor(r.split('{').slice(-2, -1)[0] || r.split('{')[0] || '')
    && /(^|[;{\s])(transform|translate|filter|backdrop-filter|perspective|will-change|contain)\s*:/.test(r.split('{').pop() || ''));
  assert.deepEqual(bad.map(r => r.trim().slice(0, 120)), []);
});

test('H2-5: the portrait colour key docks at the band top, the card under it, lifted only as far as needed', async () => {
  const { portraitLegendDock, PORTRAIT_LEGEND_DOCK: R, infoPanelRect } = await import('../scene/src/ns-scene-three.mjs');
  const band = (W, H) => { const r = infoPanelRect({ width: W, height: H }); assert.equal(r.layout, 'portrait'); return { bandY0: r.y0, bandY1: r.y1 }; };
  // 700 by 900, the full-width key 143 px tall, limb buttons 84 px: room enough, no lift; the card's top lands under it
  let d = portraitLegendDock({ ...band(700, 900), legendH: 143, limbsReservePx: 84 });
  assert.equal(d.liftPx, 0);
  const b7 = band(700, 900), cardLift = 84 - 12;
  assert.equal(b7.bandY0 + d.reservePx - cardLift, b7.bandY0 + 143 + R.gapPx, 'card top = key bottom + gap');
  assert.ok(d.cardPx >= R.cardMinPx);
  // 600 by 900, key 163 px: a small lift; never the card's whole lift
  d = portraitLegendDock({ ...band(600, 900), legendH: 163, limbsReservePx: 84 });
  assert.ok(d.liftPx > 0 && d.liftPx < cardLift, `lift ${d.liftPx}`);
  assert.ok(Math.abs(d.cardPx - R.cardMinPx) <= 1);
  // 390 by 844, key 208 px, two-line limb buttons (102 px): lifted by at most the card's own lift, the card still >= least
  d = portraitLegendDock({ ...band(390, 844), legendH: 208, limbsReservePx: 102 });
  assert.ok(d && d.liftPx <= 102 - 12 && d.cardPx >= R.cardLeastPx, JSON.stringify(d));
  // a key too tall for the band: not docked
  assert.equal(portraitLegendDock({ ...band(390, 844), legendH: 260, limbsReservePx: 102 }), null);
  // without limb buttons the card is not lifted and neither is the key
  d = portraitLegendDock({ ...band(600, 900), legendH: 163, limbsReservePx: 0 });
  assert.equal(d.liftPx, 0);
  assert.equal(d.reservePx, 163 + R.gapPx);
  assert.equal(portraitLegendDock({ bandY0: NaN, bandY1: 1, legendH: 1 }), null);
});

test('wide windows, full level: the colour key and the status card stand on the note line and never reach the limits line', async () => {
  const { cornerStackFit, CORNER_STACK: C } = await import('../scene/src/ns-scene-three.mjs');
  // 1600 by 900: both whole, the status card 20 px over the floor, the key directly above it
  let f = cornerStackFit({ height: 900, topPx: 34, gapPx: 12, statusH: 152, legendH: 202 });
  assert.equal(f.statusY, 900 - 12 - C.footPx - 152);
  assert.equal(f.legendY, f.statusY - 12 - 202);
  assert.ok(f.statusMax >= 152 && f.legendMax >= 202, 'no cap where both fit');
  // 1024 by 600 (status 277, key 300 px): capped; the key keeps under the limits line and off the status card
  f = cornerStackFit({ height: 600, topPx: 28, gapPx: 12, statusH: 277, legendH: 300 });
  const hs = Math.min(277, f.statusMax), hl = Math.min(300, f.legendMax);
  assert.ok(f.legendY >= 28, `key top ${f.legendY}`);
  assert.ok(f.legendY + hl <= f.statusY - 12 + 0.5, 'key above the status card');
  assert.ok(f.statusY + hs <= 600 - 12 - C.footPx + 0.5, 'status card above the note line');
  // the caps depend on the view and (for the key) on the status card only: a capped measurement gives the same fit
  const again = cornerStackFit({ height: 600, topPx: 28, gapPx: 12, statusH: hs, legendH: hl });
  assert.deepEqual(again, f);
});

test('a required brain label with no clear place is never forced onto the HUD\'s words', async () => {
  const { declutterLabels, LABEL_WORDS_WEIGHT } = await import('../scene/src/ns-scene-three.mjs');
  const item = { id: 'r:arm', x: 200, y: 200, w: 100, h: 30, priority: 9, required: true, text: 'Left arm' };
  const wall = { x0: 0, y0: 0, x1: 400, y1: 400 }; // the picture (a body) everywhere: forced, faded
  let [r] = declutterLabels([item], { width: 400, height: 400, obstacles: [wall] });
  assert.ok(r.shown && r.faded);
  // a card of words everywhere: left out instead
  [r] = declutterLabels([item], { width: 400, height: 400, obstacles: [{ ...wall, words: true, weight: LABEL_WORDS_WEIGHT }] });
  assert.equal(r.shown, false);
  // the picture on one side, words on the other: the forced label goes over the picture
  const words = { x0: 0, y0: 0, x1: 200, y1: 400, words: true, weight: LABEL_WORDS_WEIGHT }, body = { x0: 200, y0: 0, x1: 400, y1: 400 };
  [r] = declutterLabels([{ ...item, x: 205 }], { width: 400, height: 400, obstacles: [words, body] });
  assert.ok(r.shown && r.x - 50 >= 200 - 2, `label at ${r.x}`);
});

// 20 November 2026 (review of section 165): a required label with no clear place is hidden only where every place it
// has touches words; the best place on the picture alone is taken before one that touches words by a sliver.
test('a required label takes a place on the picture rather than vanish beside a card\'s edge', async () => {
  const { declutterLabels, LABEL_WORDS_WEIGHT } = await import('../scene/src/ns-scene-three.mjs');
  const item = { id: 'r:arm', x: 200, y: 200, w: 100, h: 30, priority: 9, required: true, text: 'Left arm' };
  const pic = [{ x0: 0, y0: 0, x1: 800, y1: 180 }, { x0: 0, y0: 220, x1: 800, y1: 600 }, { x0: 0, y0: 180, x1: 140, y1: 220 }, { x0: 260, y0: 180, x1: 800, y1: 220 }];
  const card = { x0: 0, y0: 100, x1: 149, y1: 300, words: true, weight: LABEL_WORDS_WEIGHT };
  const [r] = declutterLabels([item], { width: 800, height: 600, obstacles: [...pic, card] });
  assert.equal(r.shown, true, 'shown, on the picture');
  const overlap = (b, o) => Math.max(0, Math.min(b.x1, o.x1) - Math.max(b.x0, o.x0)) * Math.max(0, Math.min(b.y1, o.y1) - Math.max(b.y0, o.y0));
  const box = r.box || (Number.isFinite(r.x) ? { x0: r.x, y0: r.y, x1: r.x + item.w, y1: r.y + item.h } : null);
  if (box) assert.equal(overlap(box, card), 0, 'not on the card\'s words');
  // where only words are left, it is not shown
  const all = { x0: 0, y0: 0, x1: 800, y1: 600, words: true, weight: LABEL_WORDS_WEIGHT };
  const [r2] = declutterLabels([item], { width: 800, height: 600, obstacles: [all] });
  assert.equal(r2.shown, false);
});
