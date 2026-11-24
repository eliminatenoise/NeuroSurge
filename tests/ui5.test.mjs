// Section 205 (24 November 2026, round r33, UI5): nothing on the screen covers what it should not. The tutorial cue's
// words take the nearest clear place round its ring (ns-cue-place), its ring is an obstacle for the region labels, the
// mirror body's tips keep off its own head in the outside view, and the arrows keep clear of the tutorial card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CUE_WORDS, placeCueWords } from '../scene/src/ns-cue-place.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = rel => fs.readFileSync(path.join(repo, rel), 'utf8');
const sceneSrc = read('scene/src/ns-scene-three.mjs');
const fnOf = (src, name) => {
  const i = src.indexOf(`function ${name}`); assert.ok(i >= 0, `function ${name}`);
  const ls = src.lastIndexOf('\n', i) + 1, ind = src.slice(ls, i).match(/^\s*/)[0];
  const j = src.indexOf(`\n${ind}function `, i + 10);
  return src.slice(i, j > i ? j : i + 20000);
};
const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
// the start picture at 1600x900 as measured on update 70: the ring of "Motor area · Left toes" and its words' size
const RING = { x: 749, y: 102, ringHalfPx: 15, w: 132, h: 18, width: 1600, height: 900 };

test('the cue words\' rule is a frozen display constant', () => {
  assert.ok(Object.isFrozen(CUE_WORDS));
  assert.equal(CUE_WORDS.on, true);
  assert.equal(CUE_WORDS.gapPx, 5, 'the CSS\'s own room between the ring and its words');
  assert.ok(CUE_WORDS.maxGapPx > CUE_WORDS.gapPx && CUE_WORDS.topPx === 26);
});

test('with nothing in the way the words sit centred over the ring, 5 px above it', () => {
  const b = placeCueWords({ ...RING, keepOut: [] });
  assert.ok(b && b.clear);
  assert.equal(b.side, 'above');
  assert.ok(Math.abs((b.x0 + b.x1) / 2 - RING.x) <= CUE_WORDS.stepXPx / 2, 'centred');
  assert.ok(Math.abs(RING.y - RING.ringHalfPx - b.y1 - CUE_WORDS.gapPx) < CUE_WORDS.stepYPx, '5 px over the ring');
});

test('the words keep clear of the mirror body\'s head and neck, the labels and the arrows, and stay inside the picture', () => {
  // update 70's 1600x900 start: head and neck 765-835 x 93-200, "Left leg" 641-721 x 86-108, the mirror body's up tip
  // 768-830 x 29-56; the words went under the ring, over the neck
  const keepOut = [{ x0: 765, y0: 93, x1: 835, y1: 200, weight: 6 }, { x0: 641, y0: 86, x1: 721, y1: 108 }, { x0: 768, y0: 29, x1: 830, y1: 56, weight: 2 }];
  const b = placeCueWords({ ...RING, keepOut });
  assert.ok(b && b.clear, 'a clear place exists');
  for (const k of keepOut) assert.equal(overlap(b, { x0: k.x0 - CUE_WORDS.padPx, y0: k.y0 - CUE_WORDS.padPx, x1: k.x1 + CUE_WORDS.padPx, y1: k.y1 + CUE_WORDS.padPx }), 0);
  assert.ok(b.x0 >= CUE_WORDS.marginPx && b.y0 >= CUE_WORDS.topPx && b.x1 <= RING.width - CUE_WORDS.marginPx && b.y1 <= RING.height - CUE_WORDS.marginPx);
  const ring = { x0: RING.x - 15, y0: RING.y - 15, x1: RING.x + 15, y1: RING.y + 15 };
  assert.equal(overlap(b, ring), 0, 'not over its own ring');
  const gap = Math.max(ring.x0 - b.x1, b.x0 - ring.x1, ring.y0 - b.y1, b.y0 - ring.y1);
  assert.ok(gap >= CUE_WORDS.gapPx && gap <= CUE_WORDS.maxGapPx, 'beside the ring');
});

test('a ring near the top edge puts its words under it, and a ring by the left edge keeps its words in the picture', () => {
  const top = placeCueWords({ ...RING, y: 40, keepOut: [] });
  assert.equal(top.side, 'below');
  const left = placeCueWords({ ...RING, x: 30, keepOut: [] });
  assert.ok(left.x0 >= CUE_WORDS.marginPx);
});

test('with no clear place the words take the least covered one and say so', () => {
  const all = [{ x0: 0, y0: 0, x1: 1600, y1: 900 }];
  const b = placeCueWords({ ...RING, keepOut: all });
  assert.ok(b && b.clear === false);
  // a heavier keep-out is avoided first: the head (weight 6) against a label (weight 1) on the other side
  const two = [{ x0: 0, y0: 0, x1: RING.x - 16, y1: 900, weight: 1 }, { x0: RING.x - 16, y0: 0, x1: 1600, y1: 900, weight: 6 }];
  const c = placeCueWords({ ...RING, keepOut: two });
  assert.ok(c.x1 <= RING.x, 'on the lighter side');
});

// Pass 2 (the check of pass 1): the words keep their place while it is clear, and keep to their ring's half of the brain.
const HEAD70 = { x0: 765, y0: 93, x1: 835, y1: 200, weight: 6 }, TIP70 = { x0: 768, y0: 29, x1: 830, y1: 56, weight: 2 };
const labelAt = lx => ({ x0: lx, y0: 40, x1: lx + 80, y1: 62 });

test('a label 1 px nearer no longer sends the words to the other side of the ring: their place is kept while clear', () => {
  // the check's flip.mjs: with the label at x0 660 the words sit over the ring, at 661 placed afresh they go under it
  const a = placeCueWords({ ...RING, keepOut: [HEAD70, TIP70, labelAt(660)] });
  const fresh = placeCueWords({ ...RING, keepOut: [HEAD70, TIP70, labelAt(661)] });
  assert.ok(a.clear && fresh.clear);
  assert.notEqual(a.side, fresh.side, 'placed afresh, the 1 px move flips the side (pass 1)');
  const kept = placeCueWords({ ...RING, keepOut: [HEAD70, TIP70, labelAt(661)], keep: { dx: a.dx, dy: a.dy } });
  assert.equal(kept.kept, true);
  assert.deepEqual([kept.x0, kept.y0, kept.side], [a.x0, a.y0, a.side], 'kept where it was');
});

test('a kept place that is hit is placed afresh, and with no memory (keepBonus 0) as pass 1', () => {
  const a = placeCueWords({ ...RING, keepOut: [] });
  const hit = { x0: a.x0 + 10, y0: a.y0 + 2, x1: a.x0 + 40, y1: a.y1 - 2 };
  const b = placeCueWords({ ...RING, keepOut: [hit], keep: { dx: a.dx, dy: a.dy } });
  assert.ok(b.clear && overlap(b, hit) === 0 && b.slid === true, 'moved off the box that hit it (pass 3: slid along its side)');
  const b2 = placeCueWords({ ...RING, keepOut: [hit], keep: { dx: a.dx, dy: a.dy }, rules: { ...CUE_WORDS, slide: false } });
  assert.ok(b2.clear && b2.kept === false && overlap(b2, hit) === 0, 'without the slide: placed afresh (pass 2)');
  // touching the kept place inside the 3 px room is not yet a hit (keepPadPx 0); a fresh place keeps the full room
  const graze = { x0: a.x1 + 1, y0: a.y0, x1: a.x1 + 30, y1: a.y1 };
  assert.equal(placeCueWords({ ...RING, keepOut: [graze], keep: { dx: a.dx, dy: a.dy } }).kept, true);
  const noMemo = { ...CUE_WORDS, keepBonus: 0 };
  const c = placeCueWords({ ...RING, keepOut: [HEAD70, TIP70, labelAt(661)], keep: { dx: 0, dy: -40 }, rules: noMemo });
  const d = placeCueWords({ ...RING, keepOut: [HEAD70, TIP70, labelAt(661)], rules: noMemo });
  assert.deepEqual([c.x0, c.y0], [d.x0, d.y0]);
});

test('over a simulated look the words move against their ring only when hit (pass 1 moved them on most label steps)', () => {
  // the ring slides right half a pixel a frame and a label (as the labels do while their layout settles) swings to and
  // fro across the place over the ring; the words' offset from the ring counts as a move when it changes by more than
  // 3 px (the check's own rule)
  const run = keepOn => {
    let keep = null, last = null, moves = 0, maxMove = 0;
    for (let f = 0; f < 240; f++) {
      const x = 700 + f * 0.5, lx = Math.round(610 + 90 * Math.sin(f / 15));
      const b = placeCueWords({ ...RING, x, keepOut: [HEAD70, TIP70, labelAt(lx)], keep: keepOn ? keep : null });
      if (b.clear) keep = { dx: b.dx, dy: b.dy };
      if (last) { const d = Math.hypot(b.dx - last.dx, b.dy - last.dy); if (d > 3) { moves++; maxMove = Math.max(maxMove, d); } }
      last = { dx: b.dx, dy: b.dy };
    }
    return { moves, maxMove };
  };
  const before = run(false), after = run(true);
  assert.ok(before.moves >= 10, `placed afresh the words move often (${before.moves})`);
  assert.ok(after.moves <= before.moves / 2, `kept: ${after.moves} moves against ${before.moves}`);
});

test('the words keep to their ring\'s half of the brain (the midline as a screen line)', () => {
  // a ring 20 px left of an upright midline: centred over it the words (132 px) would cross by 46 px
  const half = { x0: RING.x + 20, y0: 0, dxdy: 0 };
  const free = placeCueWords({ ...RING, keepOut: [] });
  assert.ok(free.x1 > half.x0, 'without the line they cross it');
  const b = placeCueWords({ ...RING, keepOut: [], half });
  assert.ok(b.clear && b.x1 <= half.x0 + CUE_WORDS.halfCrossPx, `on the ring's side (${b.x1} <= ${half.x0})`);
  // a ring right of the line keeps its words right of it; a slanted line is followed at the words' top and bottom
  const r = placeCueWords({ ...RING, x: half.x0 + 20, keepOut: [], half });
  assert.ok(r.x0 >= half.x0);
  const slant = { x0: RING.x + 20, y0: RING.y, dxdy: -0.5 };
  const s = placeCueWords({ ...RING, keepOut: [], half: slant });
  assert.ok(s.x1 <= Math.min(slant.x0 + (s.y0 - slant.y0) * slant.dxdy, slant.x0 + (s.y1 - slant.y0) * slant.dxdy));
  // a kept place over the line is not kept where it is (pass 3: it slides back to the ring's side; pass 2: afresh);
  // the switch off gives pass 1's place
  const k3 = placeCueWords({ ...RING, keepOut: [], half, keep: { dx: free.dx, dy: free.dy } });
  assert.ok(k3.slid && k3.x1 <= half.x0 + CUE_WORDS.halfCrossPx + 1e-9 && k3.dy === free.dy);
  assert.equal(placeCueWords({ ...RING, keepOut: [], half, keep: { dx: free.dx, dy: free.dy }, rules: { ...CUE_WORDS, slide: false } }).kept, false);
  const off = placeCueWords({ ...RING, keepOut: [], half, rules: { ...CUE_WORDS, sameHalf: false } });
  assert.deepEqual([off.x0, off.y0], [free.x0, free.y0]);
});

test('with no clear place the words stay where they are unless another place covers clearly less', () => {
  const all = [{ x0: 0, y0: 0, x1: 1600, y1: 900 }];
  const a = placeCueWords({ ...RING, keepOut: all });
  // a place one step off the least covered one, everything equally covered: kept
  const b = placeCueWords({ ...RING, keepOut: all, keep: { dx: a.dx + CUE_WORDS.stepXPx, dy: a.dy } });
  assert.ok(b.kept && b.clear === false && b.dx === a.dx + CUE_WORDS.stepXPx);
  // a kept place under a heavy box while a lighter one exists: left
  const heavy = [{ x0: 0, y0: 0, x1: RING.x, y1: 900, weight: 1 }, { x0: RING.x, y0: 0, x1: 1600, y1: 900, weight: 6 }];
  const c = placeCueWords({ ...RING, keepOut: heavy, keep: { dx: 90, dy: 0 } });
  assert.equal(c.kept, false);
  assert.ok(c.x1 <= RING.x + CUE_WORDS.padPx);
});

test('boxes laid out a frame behind are moved by how far the ring moved since (lagDx, lagDy)', () => {
  const a = placeCueWords({ ...RING, keepOut: [] });
  // a label drawn 10 px left of the words' kept place, laid out when the ring was 13 px further left: now it is on them
  const label = { x0: a.x0 - 90, y0: a.y0, x1: a.x0 - 3 - CUE_WORDS.padPx - 1, y1: a.y1, lag: true };
  assert.equal(placeCueWords({ ...RING, keepOut: [label], keep: { dx: a.dx, dy: a.dy } }).kept, true);
  const moved = placeCueWords({ ...RING, keepOut: [label], keep: { dx: a.dx, dy: a.dy }, lagDx: 13 });
  assert.ok(moved.slid === true && moved.x0 >= label.x1 + 13 + CUE_WORDS.padPx - 1e-9, 'slid off the label where it is now');
  assert.equal(placeCueWords({ ...RING, keepOut: [label], keep: { dx: a.dx, dy: a.dy }, lagDx: 13, rules: { ...CUE_WORDS, slide: false } }).kept, false);
  assert.equal(placeCueWords({ ...RING, keepOut: [{ ...label, lag: false }], keep: { dx: a.dx, dy: a.dy }, lagDx: 13 }).kept, true, 'a box drawn now is not moved');
});

test('an out object is filled and returned (no new object a frame)', () => {
  const out = {};
  const b = placeCueWords({ ...RING, keepOut: [], out });
  assert.equal(b, out);
  assert.ok(Number.isFinite(out.dx) && Number.isFinite(out.dy) && out.kept === false);
});

// ---- pass 3 (24 November 2026, the check of pass 2): steady beside things that do not move with the look ----------
// the tutorial card at 1600x900 (top left) and a ring that slides left under its right end and back, 8 px a frame
const CARD = { x0: 16, y0: 14, x1: 416, y1: 94, weight: 8 };
const pass2 = { ...CUE_WORDS, slide: false, nearFirst: false, keepAcross: false };
function sweepPast(rules, xs, y = 107, extra = []) {
  let keep = null, last = null, scr = null, left = '', until = 0, n = 0, lastSide = '';
  const r = { moves: 0, both: 0, maxMove: 0, maxScreen: 0, sides: 0, returns: 0, onCard: 0, seq: [] };
  for (const x of xs) {
    n++;
    const b = placeCueWords({ ...RING, x, y, keepOut: [CARD, ...extra], keep, avoid: left && n <= until ? left : null, rules });
    keep = { dx: b.dx, dy: b.dy };
    if (last) {
      const d = Math.hypot(b.dx - last.dx, b.dy - last.dy), ds = Math.hypot(b.x0 - scr[0], b.y0 - scr[1]);
      if (d > 3) { r.moves++; r.maxMove = Math.max(r.maxMove, d); if (ds > 3) { r.both++; r.maxScreen = Math.max(r.maxScreen, ds); } }
    }
    if (lastSide && b.side !== lastSide) { r.sides++; if (r.seq.length >= 2 && r.seq[r.seq.length - 2] === b.side && n - r.at < 8) r.returns++; left = lastSide; until = n + (rules.backFrames || 0); r.at = n; r.seq.push(b.side); }
    if (!lastSide) r.seq.push(b.side);
    lastSide = b.side; last = { dx: b.dx, dy: b.dy }; scr = [b.x0, b.y0];
    if (overlap(b, CARD) > 0) r.onCard++;
  }
  return r;
}
const there = [], back = [];
for (let f = 0; f < 60; f++) there.push(560 - f * 8);
for (let f = 0; f < 60; f++) back.push(80 + f * 8);

test('(pass 3) a kept place hit by the tutorial card slides along its side: the words stand still on the screen against it', () => {
  const xs = [];
  for (let x = 560; x >= 424; x -= 8) xs.push(x);
  let keep = null, x0s = [];
  for (const x of xs) {
    const b = placeCueWords({ ...RING, x, keepOut: [CARD], keep });
    keep = { dx: b.dx, dy: b.dy };
    assert.ok(b.clear && overlap(b, CARD) === 0 && b.side === 'above', `x ${x}: over the ring and off the card`);
    if (b.slid) { assert.equal(b.kept, true); x0s.push(b.x0); }
  }
  assert.ok(x0s.length >= 4, `slid on ${x0s.length} frames`);
  for (const v of x0s) assert.ok(Math.abs(v - (CARD.x1 + CUE_WORDS.padPx)) <= 0.5 + 1e-9, `held at the card's edge plus its room (${v})`);
});

test('(pass 3) past the card and back the words change side once, by a small step, and never straight back', () => {
  const a = sweepPast(CUE_WORDS, [...there, ...back]);
  assert.equal(a.onCard, 0, 'never on the card');
  assert.ok(a.sides <= 2 && a.returns === 0, `side changes ${a.sides}, quick returns ${a.returns}`);
  assert.ok(a.maxScreen <= 40, `the largest move on the screen is small (${Math.round(a.maxScreen)} px)`);
  assert.ok(a.both <= 3, `moves both against the ring and on the screen: ${a.both}`);
  // pass 2 (the switches off) on the same path, for the record: it too stays off the card
  const b = sweepPast(pass2, [...there, ...back]);
  assert.equal(b.onCard, 0);
});

test('(pass 3) with no slide that clears it, the words go to the clear place nearest the kept one (pass 2: the cheapest)', () => {
  // the words over the ring; a box over them and over the whole row above the ring: no slide clears them
  const a = placeCueWords({ ...RING, keepOut: [] });
  const roof = { x0: 0, y0: a.y0 - 2, x1: 1600, y1: a.y1 + 2 };
  const keep = { dx: a.dx + 60, dy: a.dy };
  const near = placeCueWords({ ...RING, keepOut: [roof], keep });
  const cheap = placeCueWords({ ...RING, keepOut: [roof], keep, rules: { ...CUE_WORDS, nearFirst: false } });
  assert.ok(near.clear && cheap.clear && near.slid === false);
  const dist = b => Math.hypot(b.dx - keep.dx, b.dy - keep.dy);
  assert.ok(dist(near) <= dist(cheap), `nearest ${Math.round(dist(near))} px against cheapest ${Math.round(dist(cheap))} px`);
  // the side just left is not taken again while another clear place exists
  const av = placeCueWords({ ...RING, keepOut: [roof], keep, avoid: near.side });
  assert.ok(av.clear && av.side !== near.side);
});

test('(pass 3) with no clear place, a kept place pushed past the picture\'s edge slides back inside instead of jumping', () => {
  const all = [{ x0: 0, y0: 0, x1: 1600, y1: 900 }];
  // a ring near the left edge, its words kept over it and to the left, now 6 px past the edge
  const x = 70, keep = { dx: -(x - CUE_WORDS.marginPx + 6) + 66, dy: -29 };
  const b = placeCueWords({ ...RING, x, keepOut: all, keep });
  assert.ok(b.kept && b.slid && b.clear === false, 'kept and slid');
  assert.ok(Math.abs(b.x0 - CUE_WORDS.marginPx) < 1e-9 && b.dy === keep.dy, `at the edge, same height (${b.x0})`);
  const off = placeCueWords({ ...RING, x, keepOut: all, keep, rules: pass2 });
  assert.equal(off.kept, false, 'pass 2 gave it up');
});

test('(pass 3) with no clear place and the kept one too covered, the words take the nearest of the least covered places', () => {
  const all = { x0: 0, y0: 0, x1: 1600, y1: 900, weight: 1 };
  const heavy = { x0: RING.x + 40, y0: RING.y - 20, x1: RING.x + 200, y1: RING.y + 20, weight: 6 };
  const keep = { dx: 100, dy: 0 };
  const near = placeCueWords({ ...RING, keepOut: [all, heavy], keep });
  const far = placeCueWords({ ...RING, keepOut: [all, heavy], keep, rules: { ...CUE_WORDS, nearFirst: false } });
  assert.ok(near.clear === false && near.kept === false && far.kept === false);
  assert.equal(overlap(near, heavy), 0, 'off the heavy box');
  const dist = b => Math.hypot(b.dx - keep.dx, b.dy - keep.dy);
  assert.ok(dist(near) < dist(far) - 20, `nearest ${Math.round(dist(near))} px against the least covered anywhere ${Math.round(dist(far))} px`);
});

test('(pass 3) the switches off give pass 2\'s places', () => {
  const xs = [...there, ...back];
  const a = sweepPast(pass2, xs), b = sweepPast({ ...CUE_WORDS, slide: false, nearFirst: false, keepAcross: false, holdPx: 99, backFrames: 0 }, xs);
  assert.deepEqual([a.moves, a.maxMove, a.sides], [b.moves, b.maxMove, b.sides]);
  assert.ok(Object.isFrozen(CUE_WORDS) && CUE_WORDS.slide && CUE_WORDS.nearFirst && CUE_WORDS.keepAcross && CUE_WORDS.backFrames > 0);
});

test('bad input gives no place', () => {
  assert.equal(placeCueWords({ ...RING, w: 0 }), null);
  assert.equal(placeCueWords({ ...RING, x: NaN }), null);
});

test('the scene\'s switches are frozen and on', async () => {
  const { HUD_CLEAR } = await import('../scene/src/ns-scene-three.mjs');
  assert.ok(Object.isFrozen(HUD_CLEAR));
  for (const k of ['cueWords', 'ringLabels', 'mirrorTipsOffHead', 'promptKeep', 'mirrorTipReach', 'cueHalf']) assert.equal(HUD_CLEAR[k], true, k);
  assert.ok(HUD_CLEAR.headPadPx > 0 && HUD_CLEAR.headWeight > 1 && HUD_CLEAR.hudWeight > 1);
});

test('the rings are obstacles for the labels; (pass 2) the labels give way to the words again, which keep clear of the labels as laid out', () => {
  const r = fnOf(sceneSrc, 'readHudRectsNow(key)');
  assert.match(r, /if \(HUD_CLEAR\.ringLabels\) for \(const e of parent\.querySelectorAll\('\.ns-guide-cues \.ns-guide-mark'\)\)/);
  assert.match(r, /quiet: true, cue: true, ring: true/);
  assert.match(sceneSrc, /for \(const r of hudRects\) if \(!\(orientLive && r\.orient\) && !\(HUD_CLEAR\.cueWords && !HUD_CLEAR\.labelsYield && r\.cue && !r\.ring\)\) obst\.push\(r\);/);

  // the arrows' plans still skip every quiet box but the tutorial card's kept box
  assert.match(fnOf(sceneSrc, 'arrowObstacles()'), /if \(r\.info \|\| r\.orient \|\| r\.chip \|\| r\.quiet\) continue;/);
  const k = fnOf(sceneSrc, 'guideCueKeepOut()');
  for (const part of [/mirrorHeadBoxPx\(arrowCam\(\)\)/, /L\.last\.shown === true/, /set\.boxes\[d\]/, /!r\.cue && r !== tipZone/]) assert.match(k, part);
  // (pass 2) the labels and the arrows are laid out when the frame is drawn: marked as a frame behind (ns-cue-place lagDx)
  assert.match(k, /put\(b\.x - b\.w \/ 2, b\.y - b\.h \/ 2, b\.x \+ b\.w \/ 2, b\.y \+ b\.h \/ 2, 1, true\)/);
  assert.match(k, /put\(b\.x0, b\.y0, b\.x1, b\.y1, 2, true\)/);
});

test('the mirror body\'s head and neck are measured with the body and kept by a reset', () => {
  const c = fnOf(sceneSrc, 'computeMirrorBody()');
  assert.match(c, /b\.anatomicalPart === 'face' \|\| b\.anatomicalPart === 'neck'/);
  assert.match(c, /mirror\.headSample = head\.length >= 3 \? Float64Array\.from\(head\) : null;/);
  assert.match(c, /mirror\.headSample = mirror\.start\.headSample \|\| null;/);
  assert.match(fnOf(sceneSrc, 'mirrorHeadBoxPx(cam, ground = true)'), /NsArrows\.projectPointsPx\(W, null, cam\)/);
});

test('from outside the mirror body\'s tips keep off its own head and on their own half of the body', () => {
  const o = fnOf(sceneSrc, 'outsideCompassAnchors(brain, mirrorSet, cam, obstacles)');
  assert.match(o, /HUD_CLEAR\.mirrorTipsOffHead && mirrorRoot\.visible \? mirrorHeadBoxPx\(ref\) : null/);
  assert.match(o, /&& !\(headOff && tip\.set === mirrorSet && headKeep && overlaps\(box, headKeep\)\);/);
  assert.match(o, /if \(ownHalf && sx \* \(x - ownHalf\[0\]\) \+ sy \* \(y - ownHalf\[1\]\) < 0\) return;/);
  // (pass 2) a moved tip stays inside the body's box grown by one tip size, else it keeps its place from the plan
  assert.match(o, /const reachPad = ownHalf && HUD_CLEAR\.mirrorTipReach \? 2 \* Math\.max\(tip\.hx, tip\.hy\) : NaN;/);
  assert.match(o, /if \(reach && \(moved\.x0 < reach\.x0 \|\| moved\.y0 < reach\.y0 \|\| moved\.x1 > reach\.x1 \|\| moved\.y1 > reach\.y1\)\) return;/);
  assert.match(o, /if \(!best && reach && headKeep\) \{ headOff = false; search\(\); headOff = true; if \(best\) tip\.onHead = true; \}/,
    'with no clear place off the head near the body, the place update 70 gave it');
  assert.match(o, /onHead: t\.onHead === true/);
});

test('(pass 2, 3) the cue layer keeps the words\' place, across a new caption too, and forgets it on a new step, size or a hidden cue', () => {
  const g = read('scene/src/ns-guide-cues.mjs');
  assert.match(g, /keep: Number\.isFinite\(keepDx\) \? keep : null, half, out: placed/);
  // (pass 3) no key string: the caption, size and step compared one by one; a new caption alone keeps the place
  assert.match(g, /if \(caption !== sCaption \|\| place\.width !== sWidth \|\| place\.height !== sHeight \|\| step !== sStep\)/);
  assert.match(g, /const across = CUE_WORDS\.keepAcross && sCaption !== null && step === sStep && place\.width === sWidth && place\.height === sHeight && Number\.isFinite\(keepDx\);/);
  assert.match(g, /if \(!across\) forget\(\);/);
  assert.match(g, /keepDx \+= \(oldSide === 'left' \? -1 : 1\) \* \(wordsW - oldW\) \/ 2;/);
  assert.doesNotMatch(g, /const sk = caption/, 'no key string a frame');
  // (pass 3) the side just left is handed back for backFrames placements
  assert.match(g, /avoid: leftSide && placements <= avoidUntil \? leftSide : null/);
  assert.match(g, /if \(side && b\.side !== side\) \{ leftSide = side; avoidUntil = placements \+ \(CUE_WORDS\.backFrames \|\| 0\); \}/);
  assert.match(g, /if \(!node\.hidden\) node\.hidden = true;\n\s*forget\(\);/);
  assert.match(g, /place\.step = step \|\| '';/);
  assert.doesNotMatch(g, /const key = `\$\{Math\.round\(x\)\}/, 'no key string a frame');
  const k = fnOf(sceneSrc, 'guideCueKeepOut()');
  assert.match(k, /const half = cueMidline\(\);/);
  assert.doesNotMatch(k, /cueKeepPool\.slice/, 'the boxes\' list is refilled, not copied a frame');
  assert.match(fnOf(sceneSrc, 'cueMidline()'), /HUD_CLEAR\.cueHalf && brainTransformSet/);
});

test('both plans keep every tip clear of the tutorial card, at the largest it has been in this window', () => {
  const u = fnOf(sceneSrc, 'updateArrows(mergeOk = false)');
  assert.match(u, /const promptBox = hudObs\.find\(r => r\.prompt\) \|\| null;/);
  assert.match(u, /const bAvoid = \(crossBox \? \[crossBox\] : \[\]\)\.concat\(mTop \? \[mTop\] : \[\], promptBox \? \[promptBox\] : \[\]\);/);
  assert.match(u, /\.concat\(crossBox \? \[crossBox\] : \[\], promptBox \? \[promptBox\] : \[\]\);/);
  assert.match(u, /\|\$\{promptPlanKey\}`;/, 'the card\'s first sight (or its growth over a shown tip) plans again');
  assert.match(fnOf(sceneSrc, 'arrowObstacles()'), /if \(HUD_CLEAR\.promptKeep && promptKeep\) out\.push\(\{ \.\.\.promptKeep, prompt: true \}\);/);
  const n = fnOf(sceneSrc, 'notePromptKeep(r)');
  assert.match(n, /Math\.min\(was\.x0, r\.x0\)/, 'it only grows');
});

test('the cue layer places the words through the game\'s keep-outs, and the page counts one more script', () => {
  const g = read('scene/src/ns-guide-cues.mjs');
  assert.match(g, /import \{ CUE_WORDS, placeCueWords \} from '\.\/ns-cue-place\.mjs';/);
  assert.match(g, /motorMark\.move\(motor, GUIDE\.cue\.motor, at\);/);
  assert.match(read('scene/example/guide-cues.css'), /\.ns-guide-mark\[data-place\] \.ns-guide-mark-name\{left:var\(--ns-cue-x,50%\);top:var\(--ns-cue-y,auto\)/);
  assert.match(read('scene/src/ns-app.mjs'), /keepOut: cueKeep, width: size\.width, height: size\.height,/);
  assert.match(read('scene/example/early-load.mjs'), /const PAGE_SCRIPTS = 63;/);
});
