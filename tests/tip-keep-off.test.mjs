// 25 November 2026 (hunt of update 78, finding 9): the pointer's tip keeps off the tutorial's rings, the aim mark, the
// marks' words and the region labels as well as the cards (ns-quiet TIP_KEEP_OFF, tipKeepOffBoxes), and in the crowded
// middle of a narrow picture it is slid to either side as well as up or down to find a clear place (tipSides).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuietUi, tipSides, tipStays, tipKeepOffBoxes, TIP_KEEP_OFF, TIP_SLIDE_MAX } from '../scene/src/ns-quiet.mjs';
import { readFileSync } from 'node:fs';
import { fakeDoc, all, hasClass } from './fake-doc.mjs';

// A small page: elements with classes, a box each, children; querySelector(All) for class chains such as
// ".a .b, .c" (descendant chains of class selectors, the only kind TIP_KEEP_OFF uses).
function page(spec) {
  const make = ({ cls = '', box = null, hidden = false, kids = [] }, parent) => {
    const e = { className: cls, hidden, parentNode: parent, children: [] };
    e.getBoundingClientRect = () => { const [l, t, r, b] = box || [0, 0, 0, 0]; return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t }; };
    e.children = kids.map(k => make(k, e));
    return e;
  };
  const root = make({ kids: spec }, null);
  const one = (e, part) => part.split('.').filter(Boolean).every(c => hasClass(e, c));
  const matches = (e, sel) => {
    const parts = sel.trim().split(/\s+/);
    if (!one(e, parts[parts.length - 1])) return false;
    let i = parts.length - 2;
    for (let p = e.parentNode; p && i >= 0; p = p.parentNode) if (one(p, parts[i])) i--;
    return i < 0;
  };
  const list = sel => all(root, e => sel.split(',').some(s => matches(e, s)));
  return { querySelectorAll: list, querySelector: sel => list(sel)[0] || null };
}

test('the tip keeps off the cards, the tutorial rings and the aim mark, their words and the region labels', () => {
  const doc = page([
    { cls: 'ns-infopanel', box: [20, 600, 700, 760] },
    { cls: 'ns-limbs', box: [150, 820, 550, 860], hidden: true },
    { cls: 'ns-emap-card', box: [0, 0, 0, 0] },
    { cls: 'ns-guide-cues', kids: [
      { cls: 'ns-guide-mark ns-guide-mark-motor', box: [319, 190, 349, 220], kids: [{ cls: 'ns-guide-mark-name', box: [190, 240, 322, 259] }] },
      { cls: 'ns-guide-mark ns-guide-mark-joint', box: [346, 241, 374, 249], kids: [{ cls: 'ns-guide-mark-name', box: [333, 288, 386, 306] }] },
      { cls: 'ns-guide-mark ns-guide-mark-limb', box: [0, 0, 0, 0], kids: [{ cls: 'ns-guide-mark-name', box: [0, 0, 0, 0] }] }
    ] },
    { cls: 'ns-guide-sr', box: [0, 0, 300, 20] },
    { cls: 'ns-guide-mark ns-guide-mark-motor', box: [50, 50, 80, 80] }, // (not in the tutorial's layer)
    { cls: 'ns-scene-overlay', kids: [
      { cls: 'ns-region-label ns-r3 ns-region-label-arm', box: [208, 207, 304, 233], kids: [{ cls: 'ns-region-label-part', box: [220, 210, 290, 230] }] },
      { cls: 'ns-region-label ns-r3', box: [235, 165, 315, 187], hidden: true }
    ] }
  ]);
  const boxes = tipKeepOffBoxes(doc, { left: 10, top: 20 });
  assert.deepEqual(boxes, [
    { x0: 10, y0: 580, x1: 690, y1: 740, weight: 4 },      // the information card, drawn over the tip
    { x0: 309, y0: 170, x1: 339, y1: 200, weight: 2 },     // the area's ring
    { x0: 180, y0: 220, x1: 312, y1: 239, weight: 2 },     // its words
    { x0: 336, y0: 221, x1: 364, y1: 229, weight: 2 },     // the aim mark
    { x0: 323, y0: 268, x1: 376, y1: 286, weight: 2 },     // "Hip aim"
    { x0: 198, y0: 187, x1: 294, y1: 213, weight: 1 }      // "Left arm", which gives way to the tip where it can
  ], 'a hidden card, a card of no size, a hidden mark or label and a mark outside the tutorial layer are left out');
  assert.deepEqual(tipKeepOffBoxes(null, { left: 0, top: 0 }), []);
  assert.deepEqual(tipKeepOffBoxes(doc, null), []);
  assert.deepEqual({ ...TIP_KEEP_OFF.weight }, { card: 4, mark: 2, label: 1 });
});

// Grid places measured in a tall window (tests run on update 80 and this change, 25 November 2026): the pointer, the
// tip's size, and the boxes there as drawn (k: c a card, r a ring or the aim mark, w a mark's words, l a region label).
const B = (x0, y0, x1, y1, k = 'w') => ({ x0, y0, x1, y1, weight: k === 'c' ? 4 : k === 'l' ? 1 : 2, k });
const CASES = [
  { name: '700x900, tutorial step 1: the tip lay on the area\'s ring', width: 700, height: 900, x: 174, y: 122, tipW: 196, tipH: 44,
    boxes: [B(8, 8, 300, 83, 'c'), B(147, 824, 553, 866, 'c'), B(309, 170, 339, 200, 'r'), B(180, 220, 312, 239), B(198, 187, 294, 213, 'l'), B(225, 145, 305, 167, 'l'),
      B(145, 305, 267, 327, 'l'), B(391, 145, 479, 167, 'l'), B(401, 187, 507, 213, 'l'), B(433, 305, 555, 327, 'l')] },
  { name: '700x900, a leg chosen: the tip lay on the aim mark', width: 700, height: 900, x: 198, y: 204, tipW: 196, tipH: 44,
    boxes: [B(12, 655, 688, 812, 'c'), B(147, 824, 553, 866, 'c'), B(336, 221, 364, 229, 'r'), B(323, 268, 376, 286), B(198, 187, 294, 213, 'l'), B(225, 145, 305, 167, 'l'),
      B(112, 291, 234, 313, 'l'), B(391, 145, 479, 167, 'l'), B(401, 187, 507, 213, 'l'), B(466, 291, 588, 313, 'l')] },
  { name: '700x900, the look step: the tip lay on the aim mark', width: 700, height: 900, x: 174, y: 190, tipW: 196, tipH: 44,
    boxes: [B(8, 8, 300, 83, 'c'), B(12, 655, 688, 812, 'c'), B(147, 824, 553, 866, 'c'), B(216, 395, 231, 410, 'r'), B(336, 221, 364, 229, 'r'), B(182, 417, 265, 435),
      B(249, 268, 451, 286), B(198, 187, 294, 213, 'l'), B(225, 145, 305, 167, 'l'), B(145, 305, 267, 327, 'l'), B(391, 145, 479, 167, 'l'), B(401, 187, 507, 213, 'l'), B(433, 305, 555, 327, 'l')] },
  { name: '720x800, the map on: the tip lay on "Left arm" and "Right arm"', width: 720, height: 800, x: 202, y: 112, tipW: 196, tipH: 44,
    boxes: [B(12, 555, 708, 712, 'c'), B(157, 724, 563, 766, 'c'), B(482, 64, 712, 242, 'c'), B(346, 196, 374, 204, 'r'), B(333, 215, 419, 233), B(261, 114, 357, 140, 'l'),
      B(150, 251, 272, 273, 'l'), B(358, 114, 464, 140, 'l'), B(448, 251, 570, 273, 'l')] }
];
const boxOf = (c, p) => {
  const x0 = (p.right ? c.x - 22 - c.tipW : c.x + 22) + (p.dx || 0), y0 = (p.low ? c.y - 18 - c.tipH : c.y + 18) + (p.dy || 0);
  return { x0, y0, x1: x0 + c.tipW, y1: y0 + c.tipH };
};
const over = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0;

for (const c of CASES) test(`in a tall window the tip finds a clear place: ${c.name}`, () => {
  const card = c.boxes.map(({ k, ...b }) => b);
  // before: only the cards and the marks' words were kept off, and the usual place lay on a ring, the aim mark or a label
  const before = tipSides({ ...c, card: c.boxes.filter(b => b.k === 'c' || b.k === 'w').map(({ k, ...b }) => b) });
  assert.ok(c.boxes.some(b => b.k !== 'c' && over(boxOf(c, before), b)), 'the case shows the fault with the old boxes');
  const p = tipSides({ ...c, card });
  const b = boxOf(c, p);
  for (const a of card) assert.ok(!over(b, a), `${JSON.stringify(p)}: clear of ${JSON.stringify(a)}`);
  assert.ok(b.x0 >= 0 && b.y0 >= 0 && b.x1 <= c.width && b.y1 <= c.height, 'inside the window');
  assert.ok(!over(b, { x0: c.x - 4, y0: c.y - 4, x1: c.x + 16, y1: c.y + 24 }), 'not on the pointer\'s arrow');
  assert.ok(Math.abs(p.dx || 0) <= TIP_SLIDE_MAX && Math.abs(p.dy || 0) <= TIP_SLIDE_MAX, 'slid at most TIP_SLIDE_MAX each way');
});

test('with no clear corner and no clear slide off the first box, the clear place moved least is taken, sideways too', () => {
  // the aim mark case: the up-left corner, 20 px past the window's left edge, slid right to 6 px from that edge, is
  // clear of "Left leg" and "Left arm" above and below it and of the pointer
  const c = CASES[1], card = c.boxes.map(({ k, ...b }) => b);
  assert.deepEqual(tipSides({ ...c, card }), { right: true, low: true, dx: 26 });
  // a free picture: the usual place, no slide
  assert.deepEqual(tipSides({ ...c, card: [] }), { right: false, low: false });
  // one small box on the usual place: another corner, as before (section 207)
  assert.deepEqual(tipSides({ ...c, card: [{ x0: 300, y0: 230, x1: 330, y1: 240 }] }), { right: false, low: true });
  // every corner blocked but the usual one can slide down past the first box it lies on: that slide, as before
  const below = [{ x0: 300, y0: 230, x1: 330, y1: 240 }, { x0: 0, y0: 100, x1: 700, y1: 190 }];
  assert.deepEqual(tipSides({ ...c, card: below }), { right: false, low: false, dy: 24 }); // (240 + 6 - 222)
});

test('the tip is drawn where tipSides puts it, slid sideways as well', () => {
  const doc = fakeDoc(), root = doc.createElement('div');
  const ui = createQuietUi({ doc, root });
  const tip = all(root, e => hasClass(e, 'ns-tip'))[0];
  tip.offsetWidth = 196; tip.offsetHeight = 44;
  const c = CASES[1], card = c.boxes.map(({ k, ...b }) => b);
  const p = tipSides({ ...c, card });
  ui.update({ tip: { kind: 'hold', title: 'Space holds the brain', hint: '', rows: [], key: 'hold|x' }, x: c.x, y: c.y, width: c.width, height: c.height, cards: card });
  assert.equal(tip.style.left, `${c.x + (p.dx || 0)}px`);
  assert.equal(tip.style.top, `${c.y + (p.dy || 0)}px`);
});

// A review: the tip kept a clear place while the pointer stood still, but tipStays looked only at the boxes it keeps
// off, not at your own left hand's box (section 189), so a hand that moved onto the tip stayed under it; and a slide
// made for the other boxes could land on the hand (2 of 23 tips at 700x900 lay on its box after a pointer move).
const tipBox = (c, p) => { const x0 = (p.right ? c.x - 22 - c.tipW : c.x + 22) + (p.dx || 0), y0 = (p.low ? c.y - 18 - c.tipH : c.y + 18) + (p.dy || 0); return { x0, y0, x1: x0 + c.tipW, y1: y0 + c.tipH }; };
const overlaps = (b, a) => b.x0 < a.x1 && b.x1 > a.x0 && b.y0 < a.y1 && b.y1 > a.y0;
test('a slide made for the other boxes keeps off your own hand where a clear place off it exists', () => {
  const c = CASES[1], card = c.boxes.map(({ k, ...b }) => b);
  const free = tipSides({ ...c, card });
  assert.deepEqual(free, { right: true, low: true, dx: 26 }, 'without the hand: the place moved least');
  const hand = { x0: 0, y0: 130, x1: 215, y1: 195 }; // over that place
  assert.ok(overlaps(tipBox(c, free), hand));
  const p = tipSides({ ...c, card, avoid: hand }), b = tipBox(c, p);
  assert.ok(!overlaps(b, hand), `off the hand (${JSON.stringify(p)})`);
  assert.ok(!card.some(a => overlaps(b, a)), 'clear of the other boxes');
  assert.ok(b.x0 >= 0 && b.y0 >= 0 && b.x1 <= c.width && b.y1 <= c.height, 'inside the window');
  // a hand over every clear place: the place moved least, as before (the hand never slides the tip by itself)
  assert.deepEqual(tipSides({ ...c, card, avoid: { x0: 0, y0: 0, x1: 700, y1: 900 } }), free);
  // the first slide, off the box over every corner (section 207), keeps off the hand too where it can (the case in the
  // browser: W raised the hand onto a tip slid down 25 px, and the tip was placed again on the same slide)
  const d = { width: 700, height: 900, x: 236, y: 276, tipW: 140, tipH: 68 }, over = [{ x0: 60, y0: 180, x1: 420, y1: 300 }];
  assert.deepEqual(tipSides({ ...d, card: over }), { right: false, low: false, dy: 12 }, 'without the hand: slid down past the box');
  const hand2 = { x0: 250, y0: 300, x1: 420, y1: 420 }, q = tipSides({ ...d, card: over, avoid: hand2 }), qb = tipBox(d, q);
  assert.ok(!overlaps(qb, hand2) && !overlaps(qb, over[0]), `with the hand there: a slide off it (${JSON.stringify(q)})`);
  assert.deepEqual(tipSides({ ...d, card: over, avoid: { x0: 0, y0: 300, x1: 700, y1: 420 } }), { right: false, low: false, dy: 12 }, 'no slide off the hand: the same slide as before');
  // the usual place on the hand and the only side clear of it under a region label, which gives way to the tip: that
  // side (in the browser, W raised the hand onto the tip at 8 of 38 places where update 80 put it above the pointer)
  const e = { width: 700, height: 900, x: 164, y: 312, tipW: 280, tipH: 84 }, handUp = { x0: 154, y0: 383, x1: 385, y1: 698 };
  const label = { x0: 300, y0: 230, x1: 420, y1: 256, weight: 1 };
  assert.deepEqual(tipSides({ ...e, card: [label], avoid: handUp }), { right: false, low: true }, 'above the pointer, over the label');
  assert.deepEqual(tipSides({ ...e, card: [{ ...label, weight: 2 }], avoid: handUp }), { right: false, low: false }, 'a tutorial mark stays clear: the usual place');
  assert.deepEqual(tipSides({ ...e, card: [label] }), { right: false, low: false }, 'no hand there: the usual place, clear of the label');
});
test('tipStays checks your own hand\'s box when it is given', () => {
  const c = { x: 300, y: 400, width: 700, height: 900, tipW: 196, tipH: 68 }, place = { right: false, low: false };
  assert.equal(tipStays({ ...c, place }), true);
  assert.equal(tipStays({ ...c, place, avoid: { x0: 0, y0: 700, x1: 200, y1: 900 } }), true, 'a hand elsewhere');
  assert.equal(tipStays({ ...c, place, avoid: { x0: 310, y0: 410, x1: 560, y1: 520 } }), false, 'the hand on the tip');
  assert.equal(tipStays({ ...c, place, avoid: { x0: NaN, y0: 0, x1: 1, y1: 1 } }), true, 'no usable box');
});
test('the tip moves off your own hand when the hand comes onto it with the pointer still; a tip with no side clear of the hand stays', () => {
  const doc = fakeDoc(), root = doc.createElement('div');
  const ui = createQuietUi({ doc, root });
  const tip = all(root, e => hasClass(e, 'ns-tip'))[0];
  tip.offsetWidth = 196; tip.offsetHeight = 68;
  const drawn = () => { const r = /calc/.test(tip.style.transform.split(',')[0]), l = /calc/.test(tip.style.transform.split(',')[1]); const x = parseFloat(tip.style.left), y = parseFloat(tip.style.top); const x0 = r ? x - 22 - 196 : x + 22, y0 = l ? y - 18 - 68 : y + 18; return { x0, y0, x1: x0 + 196, y1: y0 + 68 }; };
  const base = { tip: { kind: 'area', title: 'Left hand', hint: '', rows: [{ n: 1, words: 'Close left hand' }], key: 'area|lh_hand' }, x: 300, y: 400, width: 700, height: 900, cards: [] };
  ui.update({ ...base, avoid: { x0: 0, y0: 700, x1: 200, y1: 900 } });
  assert.deepEqual(drawn(), { x0: 322, y0: 418, x1: 518, y1: 486 }, 'the usual place below right');
  const hand = { x0: 310, y0: 410, x1: 560, y1: 520 }; // the hand rises onto it (a look, or a movement)
  ui.update({ ...base, avoid: hand });
  assert.ok(!overlaps(drawn(), hand), `the tip moved off the hand (${JSON.stringify(drawn())})`);
  // a hand over the whole picture: no side is clear of it; the place then stays while the hand moves on
  const big = { x0: 0, y0: 0, x1: 700, y1: 900 };
  ui.update({ ...base, avoid: big });
  const kept = drawn();
  ui.update({ ...base, avoid: { ...big, x0: 2 } });
  assert.deepEqual(drawn(), kept);
});
test('the extra read of the boxes after the tutorial\'s marks moved passes the step, as the placement does', () => {
  const src = readFileSync(new URL('../scene/src/ns-app.mjs', import.meta.url), 'utf8');
  const calls = src.match(/tipCards\(now,[^\n]*/g) || [];
  assert.ok(calls.length >= 2, 'the placement and the extra read');
  for (const c of calls) {
    // the arguments up to the call's closing parenthesis, at its own depth
    let depth = 0, end = -1;
    for (let i = c.indexOf('('); i < c.length; i++) { if (c[i] === '(') depth++; else if (c[i] === ')' && --depth === 0) { end = i; break; } }
    const args = c.slice(c.indexOf('(') + 1, end);
    let n = 1; depth = 0;
    for (const ch of args) { if ('([{'.includes(ch)) depth++; else if (')]}'.includes(ch)) depth--; else if (ch === ',' && depth === 0) n++; }
    assert.equal(n, 4, `tipCards called with the step: ${c.slice(0, 90)}`);
  }
});
