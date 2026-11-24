// 24 November 2026 (package HUD74; the hunt of Body update 73): what is drawn over the picture.
//  - finding 11: the pause page's two tutorial buttons have the page's look and a focus mark;
//  - finding 10: the hint under the picture stands above the page's foot line;
//  - finding 6: a key's information card gives up whole parts until it fits its box, the short card has a greatest
//    height, and a card that cannot scroll starts at its top;
//  - finding 3: the tutorial's "Brain" ring goes where the game's own pick says a press takes the brain, and a cue's
//    words keep clear of the other cue marks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAIN_CUE, brainCueGrid, clearOfBoxes, createBrainCue } from '../scene/src/ns-cue-place.mjs';
import { KEY_CARD_FIT, keyCardStage, infoPanelContent } from '../scene/src/ns-scene-three.mjs';
import { FOOT_LINE, hintOverFoot, infoOverlayModel } from '../scene/src/ns-app.mjs';
import { GRASP_INFO, graspInfoCard, reachInfoCard } from '../scene/src/ns-text.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = rel => fs.readFileSync(path.join(repo, rel), 'utf8');

/* ---------------------------------------------------------------- finding 11: the pause page's tutorial buttons */

test('the pause page\'s tutorial buttons have the page\'s secondary look and a focus mark', () => {
  const css = read('scene/example/guide-cues.css'), page = read('scene/example/loading-r302.css');
  assert.match(css, /\.ns-guide-action\{border:1px solid #c7d2df;border-radius:8px;background:transparent;color:#e8eef5\}/);
  // the same line, glass and words as the page's own secondary button
  const sec = page.slice(page.indexOf('.ns-shell-secondary {'), page.indexOf('}', page.indexOf('.ns-shell-secondary {')));
  assert.match(sec, /border-radius: 8px;/); assert.match(sec, /border: 1px solid #c7d2df;/); assert.match(sec, /background: transparent;/); assert.match(sec, /color: #e8eef5;/);
  assert.match(css, /\.ns-guide-action:hover\{background:rgba\(232,238,245,\.08\)\}/);
  assert.match(css, /\.ns-guide-actions :focus-visible\{outline:3px solid #7cc4ff;outline-offset:2px\}/);
  assert.match(css, /\.ns-guide-action\{[^}]*min-height:2\.75rem/, 'still a 44 px target');
  assert.match(read('scene/src/ns-guide-cues.mjs'), /const button = element\(details, 'button', 'ns-guide-action', label\);/);
});

/* ---------------------------------------------------------------- finding 10: the hint and the page's foot line */

test('the hint stands above the page\'s foot line where they share a column', () => {
  const box = (left, top, right, bottom) => ({ left, top, right, bottom });
  assert.ok(Object.isFrozen(FOOT_LINE) && FOOT_LINE.on === true && FOOT_LINE.selector === '.preview-note');
  // the measured boxes of update 73 after a look up: 1280x720 and 1600x900 (8 px shared in height), and the start at 800x600
  assert.equal(hintOverFoot(box(23, 681, 434, 706), box(10, 698, 284, 714)), 706 + FOOT_LINE.gapPx - 698);
  assert.equal(hintOverFoot(box(140, 861, 551, 886), box(10, 878, 284, 894)), 886 + FOOT_LINE.gapPx - 878);
  assert.equal(hintOverFoot(box(200, 546, 600, 586), box(10, 578, 284, 594)), 586 + FOOT_LINE.gapPx - 578);
  // beside it (the bottom middle at 1280x720): nothing to clear
  assert.equal(hintOverFoot(box(434, 681, 846, 706), box(10, 698, 284, 714)), 0);
  // already above it with the gap
  assert.equal(hintOverFoot(box(23, 669, 434, 694), box(10, 698, 284, 714)), 0);
  assert.equal(hintOverFoot(box(23, 672, 434, 697), box(10, 698, 284, 714)), 3, 'nearer than the gap: raised to it');
  assert.equal(hintOverFoot(null, box(10, 698, 284, 714)), 0);
  assert.equal(hintOverFoot(box(23, 681, 434, 706), box(0, 0, 0, 0)), 0, 'no foot line on the page');
  assert.equal(hintOverFoot(box(23, 681, 434, 706), box(10, 698, 284, 714), { ...FOOT_LINE, on: false }), 0);
});

test('the shell measures the hint as placed against the foot line, and the limb buttons follow the raised hint', () => {
  const app = read('scene/src/ns-app.mjs');
  assert.match(app, /placeToast: \(spot, key = '', wide = false\) => \{/);
  assert.match(app, /raise = hintOverFoot\(toast\.getBoundingClientRect\(\), foot\.getBoundingClientRect\(\)\);/);
  assert.match(app, /const foot = FOOT_LINE\.on && wide && !toast\.hidden && doc && typeof doc\.querySelector === 'function' \? doc\.querySelector\(FOOT_LINE\.selector\) : null;/, 'a wide window only: an upright one places the hint by its top');
  assert.match(app, /shell\.placeToast\(toastSpotFor\(size\), `\$\{size\.width\}x\$\{size\.height\}`, size\.width >= size\.height\);/);
  assert.match(app, /const k = `\$\{key\}\|\$\{toast\.hidden \? '' : toast\.textContent\}\|\$\{toastSpotKey\}\|\$\{toastRaisePx\}\|\$\{bar \? 1 : 0\}`;/, 'clearHint measures again after a raise');
  assert.match(read('scene/example/quiet.css'), /\.preview-note, \.preview-note\[class\] \{\n\s*position: fixed; left: 10px; bottom: 6px;/, 'the foot line the selector names');
});

/* ---------------------------------------------------------------- finding 6: the information cards fit */

test('a key\'s card gives up one more whole part while it runs over, and stops at the first stage that fits', () => {
  assert.ok(Object.isFrozen(KEY_CARD_FIT) && KEY_CARD_FIT.on === true && KEY_CARD_FIT.max === 5);
  // (the grip card at 800x600, the short level: 692 px of words in the 396 px the card may have)
  const heights = [692, 440, 440, 317, 317, 240], box = 396, seen = [];
  assert.equal(keyCardStage(s => { seen.push(s); return heights[s] - box; }), 3);
  assert.deepEqual(seen, [0, 1, 2, 3], 'each stage is tried once, in order');
  assert.equal(keyCardStage(() => 0), 0, 'a card that fits keeps everything');
  assert.equal(keyCardStage(() => 1), 0, 'a pixel of rounding is no overrun');
  assert.equal(keyCardStage(() => 50), KEY_CARD_FIT.max, 'nothing more to give up');
  assert.equal(keyCardStage(() => NaN), 0, 'not measured (no layout): nothing is left out');
});

test('the grip card carries a short muscle line; the cards of the keys are marked, an area\'s card is not', () => {
  const close = graspInfoCard({ phase: 'close', holding: 'brain', kept: false }), open = graspInfoCard({ phase: 'open', holding: null });
  assert.equal(close.rowsShort[GRASP_INFO.rows.muscles], GRASP_INFO.close.musclesShort);
  assert.equal(open.rowsShort[GRASP_INFO.rows.muscles], GRASP_INFO.open.musclesShort);
  assert.ok(GRASP_INFO.close.musclesShort.length < GRASP_INFO.close.muscles.length / 3, 'a third of the long line at most');
  assert.doesNotMatch(GRASP_INFO.close.musclesShort, /\(/, 'plain names only');
  assert.match(GRASP_INFO.close.musclesShort, /finger, thumb and toe benders/);
  const model = infoOverlayModel({ gaze: { target: 'glass' }, grip: { phase: 'close', holding: 'brain', kept: false }, regionActivity: {} });
  const c = infoPanelContent(model);
  assert.equal(c.card, 'key');
  assert.equal(c.title, 'Hands and feet: grip');
  assert.equal(c.rowsShort[GRASP_INFO.rows.muscles], GRASP_INFO.close.musclesShort);
  assert.equal(c.more, null, 'no More detail: the card cannot scroll');
  const reach = infoPanelContent({ mode: 'region', key: 'reach|forward', card: reachInfoCard([{ dir: 'forward', level: 1 }]) });
  assert.equal(reach.card, 'key');
  assert.deepEqual(reach.rowsShort, {}, 'the reach keys\' muscle lines are short already');
  const glass = infoPanelContent(infoOverlayModel({ gaze: { target: 'glass' } }));
  assert.equal(glass.card, '');
  assert.deepEqual(glass.rowsShort, {});
});

test('the panel draws both muscle lines, fits a key\'s card by its own stages at every level, and starts a card that cannot scroll at its top', () => {
  const scene = read('scene/src/ns-scene-three.mjs');
  assert.match(scene, /attr\('data-ns-card', c\.card \|\| ''\);/);
  assert.match(scene, /if \(info\.scrollKey !== c\.key\) \{ info\.scrollKey = c\.key; if \(!c\.more\) \{ try \{ info\.panel\.scrollTop = 0; \}/);
  assert.match(scene, /el\('dd', `ns-infopanel-row-\$\{slug\}\$\{short \? ' ns-infopanel-row-long' : ''\}`, info\.rows\)\.textContent = v;/);
  assert.match(scene, /if \(short\) el\('dd', `ns-infopanel-row-\$\{slug\} ns-infopanel-row-short`, info\.rows\)\.textContent = short;/);
  assert.match(scene, /const rowsSig = JSON\.stringify\(\[c\.rows, c\.rowsShort\]\);/, 'a new short line draws the rows again');
  const i = scene.indexOf('function fitInfoCard()'), f = scene.slice(i, scene.indexOf('function readHudRectsNow', i));
  assert.match(f, /const keyCard = KEY_CARD_FIT\.on && p\.getAttribute\('data-ns-card'\) === 'key';/);
  assert.match(f, /keyCardStage\(st => \{ const mark = String\(st\); if \(p\.getAttribute\('data-ns-keyfit'\) !== mark\) p\.setAttribute\('data-ns-keyfit', mark\); return p\.scrollHeight - p\.clientHeight; \}\);\n\s*return;/);
  assert.ok(f.indexOf('keyCardStage(') < f.indexOf('for (let t = 0; t <= (open ? 0 : INFO_TRIM_MAX); t++)'), 'before the area cards\' rule, which the opened level skips');
  assert.match(f, /if \(!keyCard\) \{ if \(typeof p\.removeAttribute === 'function' && p\.getAttribute\('data-ns-keyfit'\) !== null\) p\.removeAttribute\('data-ns-keyfit'\); \}/);
});

test('the stylesheets: the stages leave out whole parts, and the short card has a greatest height', () => {
  const css = read('scene/example/neurosurge.css'), quiet = read('scene/example/quiet.css');
  assert.match(css, /\.ns-infopanel:not\(\[data-ns-card="key"\]:is\(\[data-ns-keyfit="1"\], \[data-ns-keyfit="2"\]\)\) \.ns-infopanel-rows dd\.ns-infopanel-row-short \{ display: none !important; \}/, 'the short line shows at stages 1 and 2 only');
  assert.match(css, /\.ns-infopanel\[data-ns-card="key"\]:is\(\[data-ns-keyfit="1"\], \[data-ns-keyfit="2"\]\) \.ns-infopanel-rows dd\.ns-infopanel-row-long \{ display: none !important; \}/);
  assert.match(css, /\[data-ns-keyfit="2"\], \[data-ns-keyfit="3"\], \[data-ns-keyfit="4"\], \[data-ns-keyfit="5"\]\) :is\(\.ns-infopanel-key-movement, \.ns-infopanel-row-movement\) \{ display: none !important; \}/);
  assert.match(css, /\[data-ns-keyfit="3"\], \[data-ns-keyfit="4"\], \[data-ns-keyfit="5"\]\) :is\(\.ns-infopanel-key-muscles, \.ns-infopanel-row-muscles\) \{ display: none !important; \}/);
  assert.match(css, /\[data-ns-keyfit="4"\], \[data-ns-keyfit="5"\]\) \.ns-infopanel-caveat \{ display: none !important; \}/);
  assert.match(css, /\.ns-infopanel\[data-ns-card="key"\]\[data-ns-keyfit="5"\] \.ns-infopanel-plain \{ display: none !important; \}/);
  assert.match(css, /\.ns-infopanel\[data-ns-card="key"\] :is\(\.ns-infopanel-simulated, \.ns-infopanel-caveat\) \{ -webkit-line-clamp: unset; \}/, 'its honesty lines are whole, not cut after three lines');
  assert.doesNotMatch(css, /data-ns-keyfit[^\n]*font-size/, 'the text keeps its size');
  assert.doesNotMatch(css, /data-ns-keyfit[^\n]*\.ns-infopanel-(title|key-key|row-key|key-strip|row-strip)\b/, 'the title, the key and the strip part always stay');
  assert.doesNotMatch(quiet, /\.ns-app\[data-ns-read="read"\] \.ns-infopanel \{ max-height: none/, 'the short card is no longer without a greatest height');
  assert.match(quiet, /\.ns-app\[data-ns-read="read"\] \.ns-infopanel \{ max-height: min\(calc\(100% - 30px - var\(--ns-gap, 12px\)\), var\(--ns-info-col-maxvh, 66vh\)\) !important;/);
});

/* ---------------------------------------------------------------- finding 3: the "Brain" ring's place */

// A picture for the tracker: `brain(x, y)` says where a press takes the brain; the brain can be moved (dx, dy), as a
// look or a carry moves it on the screen. Local points are picture points less the move.
function picture({ width = 800, height = 600, brain, plain = () => true } = {}) {
  const P = { width, height, dx: 0, dy: 0, picks: 0, frame: 0, t: 0, perPick: 0.4, brain, keepOut: [], busy: null, hold: false, view: 'eye', anchor: { x: width / 2, y: height / 2 } };
  P.input = () => ({ frame: P.frame, width, height, view: P.view, anchor: P.anchor, keepOut: P.keepOut, busy: P.busy, hold: P.hold,
    pick: (x, y) => { P.picks++; P.t += P.perPick; return P.brain(x - P.dx, y - P.dy) ? { brain: true, point: [x, y, 0], plain: plain(x - P.dx, y - P.dy) } : null; },
    toLocal: w => [w[0] - P.dx, w[1] - P.dy, 0],
    project: l => { const x = l[0] + P.dx, y = l[1] + P.dy; return x >= 0 && x <= width && y >= 0 && y <= height ? { x, y } : null; },
    now: () => P.t });
  // frames until the tracker gives a place (or `most` frames)
  P.run = (cue, most = 200) => { let at = null, n = 0; while (!at && n < most) { P.frame++; n++; const r = cue.step(P.input()); at = r ? { x: r.x, y: r.y } : null; } return { at, frames: n }; };
  return P;
}
const inRect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

test('the ring\'s rule is a frozen display constant, and the ring it measures is the stylesheet\'s', () => {
  assert.ok(Object.isFrozen(BRAIN_CUE));
  assert.equal(BRAIN_CUE.on, true);
  assert.ok(BRAIN_CUE.ringRoomPx > BRAIN_CUE.ringPx && BRAIN_CUE.midRoomPx > BRAIN_CUE.ringRoomPx && BRAIN_CUE.roomPx > BRAIN_CUE.midRoomPx);
  assert.match(read('scene/example/guide-cues.css'), /\.ns-guide-mark\{[^}]*width:26px;height:26px/, 'the ring is 26 px across: ringPx 13');
  assert.equal(BRAIN_CUE.ringPx, 13);
});

test('the places tried are a grid inside the picture\'s edges, off the bodies\' boxes first, then nearest the brain\'s middle', () => {
  const g = brainCueGrid({ width: 800, height: 600, anchor: { x: 400, y: 175 } });
  assert.ok(g.length > 100 && g.length < 400, `a few hundred places (${g.length})`);
  for (const p of g) assert.ok(p.x >= BRAIN_CUE.edgePx && p.x <= 800 - BRAIN_CUE.edgePx && p.y >= BRAIN_CUE.topPx && p.y <= 600 - BRAIN_CUE.edgePx);
  for (let i = 1; i < g.length; i++) assert.ok(g[i].d >= g[i - 1].d, 'nearest the anchor first');
  const busy = [{ x0: 300, y0: 100, x1: 500, y1: 300 }];
  const b = brainCueGrid({ width: 800, height: 600, anchor: { x: 400, y: 175 }, busy });
  const firstBusy = b.findIndex(p => p.busy);
  assert.ok(firstBusy > 0 && b.slice(firstBusy).every(p => p.busy) && b.slice(0, firstBusy).every(p => !p.busy), 'every place on a body comes after every place off them');
  assert.ok(!clearOfBoxes(b[firstBusy].x, b[firstBusy].y, BRAIN_CUE.ringPx, busy, 0));
  assert.deepEqual(brainCueGrid({ width: 60, height: 60 }), [], 'a picture too small for a grid');
  assert.deepEqual(brainCueGrid({}), []);
});

test('a place is clear of a box only with the ring and its room off it', () => {
  const boxes = [{ x0: 100, y0: 100, x1: 200, y1: 150 }, null, { x0: NaN, y0: 0, x1: 1, y1: 1 }];
  assert.equal(clearOfBoxes(50, 125, 13, boxes, 6), true);
  assert.equal(clearOfBoxes(85, 125, 13, boxes, 6), false, '15 px off the box: inside the ring\'s 13 and the room\'s 6');
  assert.equal(clearOfBoxes(85, 125, 13, boxes, 0), true, 'the ring itself is 2 px off it');
  assert.equal(clearOfBoxes(150, 125, 13, null), true);
});

test('the ring goes where the pick says brain, not to the brain\'s middle when something else is drawn there', () => {
  // (800x600 as the tester found it: the mirror body's pelvis at the brain's middle, 400,175; bare brain to the right)
  const mirror = inRect(330, 60, 470, 320);
  const P = picture({ brain: (x, y) => inRect(120, 40, 700, 520)(x, y) && !mirror(x, y) });
  const cue = createBrainCue();
  const { at, frames } = P.run(cue);
  assert.ok(at, 'a place is found');
  assert.ok(P.brain(at.x, at.y) && !mirror(at.x, at.y), `the place ${at.x},${at.y} is the brain, not the mirror body`);
  for (const [dx, dy] of [[BRAIN_CUE.roomPx, 0], [-BRAIN_CUE.roomPx, 0], [0, BRAIN_CUE.roomPx], [0, -BRAIN_CUE.roomPx]]) assert.ok(P.brain(at.x + dx, at.y + dy), 'with bare brain all round it');
  assert.equal(cue.state().roomy, true);
  assert.ok(frames > 1 && frames < 60, `the search is spread over frames (${frames})`);
  assert.ok(P.picks / frames <= BRAIN_CUE.maxPicks, 'never more than maxPicks in a frame');
});

test('a frame of the search spends about msPerFrame on picks, and at least minPicks', () => {
  const P = picture({ brain: () => false }); // (nothing to find: every place costs one pick)
  const cue = createBrainCue();
  let last = 0; const per = [];
  for (let i = 0; i < 12; i++) { P.frame++; cue.step(P.input()); per.push(P.picks - last); last = P.picks; }
  for (const n of per) assert.ok(n >= BRAIN_CUE.minPicks && n <= Math.ceil(BRAIN_CUE.msPerFrame / P.perPick) + 1, `${n} picks in a frame at 0.4 ms each`);
  // a slow machine (3 ms a pick): minPicks a frame, no more
  const S = picture({ brain: () => false }); S.perPick = 3;
  const slow = createBrainCue();
  S.frame++; slow.step(S.input());
  assert.equal(S.picks, BRAIN_CUE.minPicks);
});

test('the place rides with the brain, is kept while the pick there says brain, and is searched afresh when it does not', () => {
  const P = picture({ brain: inRect(100, 80, 700, 520) });
  const cue = createBrainCue();
  const a = P.run(cue).at;
  assert.ok(a);
  // the look moves the brain 30 px right and 10 down: the ring goes with it (a point of the brain), with no new search
  P.dx = 30; P.dy = 10; P.frame++;
  const b = cue.step(P.input());
  assert.deepEqual([b.x, b.y], [a.x + 30, a.y + 10]);
  assert.equal(cue.state().searches, 1);
  // checked with one pick every checkEvery frames: its middle and the points of the ring's room in turn
  const before = P.picks;
  for (let i = 0; i < BRAIN_CUE.checkEvery * 20; i++) { P.frame++; assert.ok(cue.step(P.input())); }
  assert.equal(P.picks - before, 20, 'one pick every checkEvery frames');
  // your arm comes over the place: the next check loses it and a new search finds another
  const arm = inRect(a.x - 40, a.y - 40, a.x + 40, a.y + 40), brainWas = P.brain;
  P.brain = (x, y) => brainWas(x, y) && !arm(x, y);
  P.dx = 0; P.dy = 0;
  let c = null;
  for (let i = 0; i < 200 && !(c && cue.state().lost === 1); i++) { P.frame++; const r = cue.step(P.input()); c = r ? { x: r.x, y: r.y } : null; }
  assert.equal(cue.state().lost, 1);
  assert.ok(c && !arm(c.x, c.y) && P.brain(c.x, c.y), 'the new place is off the arm');
});

test('nothing is picked while the brain is held or turned, and the ring stays on its point of the brain', () => {
  const P = picture({ brain: inRect(100, 80, 700, 520) });
  const cue = createBrainCue();
  const a = P.run(cue).at;
  P.hold = true;
  const before = P.picks;
  for (let i = 0; i < 80; i++) { P.frame++; P.dx += 2; const r = cue.step(P.input()); if (a.x + P.dx <= 800) assert.deepEqual([r.x, r.y], [a.x + P.dx, a.y]); else assert.equal(r, null, 'carried out of the picture: no ring'); }
  assert.equal(P.picks, before, 'no pick while held');
  // with no place yet, a hold starts no search
  const Q = picture({ brain: inRect(100, 80, 700, 520) }); Q.hold = true;
  const cue2 = createBrainCue();
  Q.frame++; assert.equal(cue2.step(Q.input()), null); assert.equal(Q.picks, 0);
});

test('the ring keeps off the keep-out boxes, and a box that comes over it moves it', () => {
  const P = picture({ brain: inRect(100, 80, 700, 520) });
  P.keepOut = [{ x0: 250, y0: 150, x1: 550, y1: 450 }]; // (a card over the brain's middle)
  const cue = createBrainCue();
  const a = P.run(cue).at;
  assert.ok(a && clearOfBoxes(a.x, a.y, BRAIN_CUE.ringPx, P.keepOut, BRAIN_CUE.padPx - 0.01));
  P.keepOut = [{ x0: a.x - 5, y0: a.y - 5, x1: a.x + 5, y1: a.y + 5 }];
  let b = null;
  for (let i = 0; i < 200 && !b; i++) { P.frame++; const r = cue.step(P.input()); b = r && (r.x !== a.x || r.y !== a.y) ? { x: r.x, y: r.y } : null; }
  assert.ok(b && clearOfBoxes(b.x, b.y, BRAIN_CUE.ringPx, P.keepOut, 0), 'a label laid over the ring: another place');
});

test('a roomy place is taken before a nearer one with only the ring\'s own room, and a named part of the brain is no roomy place', () => {
  // a narrow strip of brain through the middle (40 px wide: the ring's room only) and a wide patch far left
  const strip = inRect(380, 80, 420, 520), patch = inRect(60, 200, 240, 400);
  const P = picture({ brain: (x, y) => strip(x, y) || patch(x, y) });
  const cue = createBrainCue();
  const a = P.run(cue, 400).at;
  assert.ok(a && patch(a.x, a.y), `the wide patch (${a && a.x},${a && a.y}), though the strip is nearer the middle`);
  // the same picture with the patch a named part (the ventricle seen between the halves): the strip is taken
  const R = picture({ brain: (x, y) => strip(x, y) || patch(x, y), plain: (x, y) => !patch(x, y) });
  const cue2 = createBrainCue();
  const b = R.run(cue2, 400).at;
  assert.ok(b && R.brain(b.x, b.y));
  assert.equal(cue2.state().roomy, false);
});

test('with no brain to press there is no ring, and the search waits before it tries again', () => {
  const P = picture({ brain: () => false });
  const cue = createBrainCue();
  const r = P.run(cue, 400);
  assert.equal(r.at, null);
  assert.equal(cue.state().none >= 1, true);
  const picksThen = P.picks, searches = cue.state().searches;
  for (let i = 0; i < 10; i++) { P.frame++; cue.step(P.input()); }
  assert.ok(cue.state().searches <= searches + 1 && P.picks - picksThen < 10 * BRAIN_CUE.maxPicks);
  cue.reset();
  assert.deepEqual([cue.state().placed, cue.state().searching], [false, false]);
});

test('a change of view checks the place at once (from outside the mirror body may stand in front of it)', () => {
  const P = picture({ brain: inRect(100, 80, 700, 520) });
  const cue = createBrainCue();
  const a = P.run(cue).at;
  const hide = inRect(a.x - 30, a.y - 30, a.x + 30, a.y + 30), was = P.brain;
  P.view = 'outside'; P.brain = (x, y) => was(x, y) && !hide(x, y);
  P.frame++;
  const r = cue.step(P.input());
  assert.ok(r === null || !hide(r.x, r.y), 'the old place is not shown for one frame of the new view');
  assert.equal(cue.state().lost, 1);
});

test('while the camera is on its way between two views there is no ring and no pick; at rest the place is checked at once', () => {
  const P = picture({ brain: inRect(100, 80, 700, 520) });
  const cue = createBrainCue();
  const a = P.run(cue).at;
  const before = P.picks, input = () => ({ ...P.input(), away: true });
  for (let i = 0; i < 30; i++) { P.frame++; assert.equal(cue.step(input()), null); }
  assert.equal(P.picks, before);
  P.frame++;
  const r = cue.step(P.input());
  assert.deepEqual([r.x, r.y], [a.x, a.y], 'the same point of the brain');
  assert.equal(P.picks - before, 9, 'the whole of it is checked in the first frame at rest');
});

test('the game hands the tracker its own pick, the brain\'s frame and what the ring keeps off', () => {
  const app = read('scene/src/ns-app.mjs');
  assert.match(app, /import \{ createBrainCue \} from '\.\/ns-cue-place\.mjs';/);
  assert.doesNotMatch(app, /guidePoint\(out\.brainTransform\?\.pivotWorld, 'Brain'\)/, 'the ring no longer stands at the brain\'s turning point');
  assert.match(app, /pick: \(x, y\) => \{ const T = targetsAt\(x, y\), f = T && !T\.arrow \? T\.front : null; return f && f\.item === 'brain' && \(f\.kind === 'glass' \|\| f\.kind === 'outline'\)/, 'a press takes the brain: bare glass or outline in front, no arrow tip');
  assert.match(app, /toLocal: w => NsCollide\.apply\(inv \|\| \(inv = NsCollide\.affineInverse\(BT\.matrix\)\), w\[0\], w\[1\], w\[2\]\)/);
  assert.match(app, /if \(showJointAim\) \{[^\n]*brainCueKeep\.push\(brainCueJoint\); \}/, 'and off the shoulder or hip mark');
  assert.match(app, /guideCue: brainCueShown,/, 'inspect() reads the place back');
});

test('a cue\'s words keep clear of the other marks\' rings and of the words placed before them', () => {
  const g = read('scene/src/ns-guide-cues.mjs'), css = read('scene/example/guide-cues.css');
  assert.match(g, /export const CUE_RINGS = Object\.freeze\(\{ motor: Object\.freeze\(\[15, 15\]\), limb: Object\.freeze\(\[7\.5, 7\.5\]\), brain: Object\.freeze\(\[13, 13\]\), joint: Object\.freeze\(\[14, 4\]\) \}\);/);
  // the half sizes are the stylesheet's
  assert.match(css, /\.ns-guide-mark-motor\{width:30px;height:30px/);
  assert.match(css, /\.ns-guide-mark-limb\{width:15px;height:15px/);
  assert.match(css, /\.ns-guide-mark-joint\{width:28px;height:8px/);
  assert.match(g, /export const CUE_APART = Object\.freeze\(\{ on: true, ringWeight: 4, wordsWeight: 8 \}\);/);
  // the motor area's words first and as before; then the limb's, the joint's, the brain's, each off the others
  const i0 = g.indexOf('motorMark.move(motor, GUIDE.cue.motor, at);'), i1 = g.indexOf('limbMark.move(limbPoint'), i2 = g.indexOf('jointMark.move(jointPoint'), i3 = g.indexOf('brainMark.move(brain');
  assert.ok(i0 > 0 && i1 > i0 && i2 > i1 && i3 > i2, 'the order of placement');
  assert.match(g, /const apartLimb = apart\(\[motorMark\.ringBox, jointMark\.ringBox, brainMark\.ringBox, motorMark\.wordsBox\]\);/);
  assert.match(g, /const apartJoint = apart\(\[motorMark\.ringBox, limbMark\.ringBox, brainMark\.ringBox, motorMark\.wordsBox, limbMark\.wordsBox\]\);/);
  assert.match(g, /const apartBrain = apart\(\[motorMark\.ringBox, limbMark\.ringBox, jointMark\.ringBox, motorMark\.wordsBox, limbMark\.wordsBox, jointMark\.wordsBox\]\);/, 'the Brain word keeps off the shoulder or hip mark and its words');
  assert.match(g, /brainMark\.move\(brain, '', placeFor\(apartBrain, at\)\);/);
  assert.match(g, /B\.length = n;/, 'the list is refilled, not made anew a frame');
  assert.match(g, /limbMark\.move\(limbPoint, motor \? GUIDE\.cue\.limb : '', motor \? at : placeFor\(apartLimb, at\)\);/, 'steps 1 and 2, the motor area\'s mark with its body part\'s: as they were');
  const u = g.slice(g.indexOf('  function update(input = {}) {'), g.indexOf('  function dispose() {'));
  assert.doesNotMatch(u, /placeFor\([^)]*\[/, 'no list is made per frame for it');
});

test('the cue keeps off the arrows\' captions of step 7', () => {
  const scene = read('scene/src/ns-scene-three.mjs');
  const i = scene.indexOf('function guideCueKeepOut()'), k = scene.slice(i, scene.indexOf('/* ---- R5-scene (D16)', i));
  assert.match(k, /if \(guideGoalAttr === 'orbit'\) for \(const k in arrowTips\) \{\n\s*const T = arrowTips\[k\];\n\s*if \(!T\.shown \|\| !\(T\.w > 0\)\) continue;/, 'in step 7 only: the other steps\' cues are placed as they were');
  assert.match(k, /put\(x, y, x \+ T\.w, y \+ ARROW_CAPTION_H, HUD_CLEAR\.hudWeight, true\);/, 'a caption shown is a keep-out, a frame behind like the labels');
  const j = scene.indexOf('function layoutArrowTips('), l = scene.slice(j, scene.indexOf('function arrowsState()', j));
  assert.match(l, /h = ARROW_CAPTION_H;/, 'the height the captions are laid out with');
  assert.match(scene, /const ARROW_CAPTION_H = 22;/);
});
