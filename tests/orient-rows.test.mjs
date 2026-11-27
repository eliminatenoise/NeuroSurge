// 25 November 2026 (hunt of update 78, finding 9): the orientation labels ("Front (anterior)", "Brain's right half", ...)
// keep off the limb buttons and the hint wherever those stand, with ORIENTATION_EDGE.rowGapPx of room. The rows reach
// placeOrientation as opts.labelRects (ns-app: the scene's overlayObstacles toasts and limbs, viewport fractions). On
// update 80, from outside at 1600x900 at the full reading level, "Front (anterior)" lay under the limb buttons
// (476-591 x 836-854 on the bar's 324-729 x 813-855), and "Brain's right half" under the two-line bar (349-462 x 822-839
// on 324-599 x 781-840): the HUD kept its labels off the hint only.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHud, ORIENTATION_EDGE } from '../scene/src/ns-scene-three.mjs';
import { fakeDoc } from './fake-doc.mjs';

const W = 1600, H = 900;
const LABELS = { right: 'Brain’s right half', left: 'Brain’s left half', anterior: 'Front (anterior) ↓', posterior: '↑ Back (posterior)' };
function hud() {
  const doc = fakeDoc();
  const root = doc.createElement('div');
  root.ownerDocument = doc;
  const h = createHud(root);
  h.render({ orientationLabels: LABELS });
  return h;
}
const frac = ([x0, y0, x1, y1]) => ({ x0: x0 / W, y0: y0 / H, x1: x1 / W, y1: y1 / H });
const meets = (a, b, gap = 0) => Math.min(a.x1, b[2] + gap) > Math.max(a.x0, b[0] - gap) && Math.min(a.y1, b[3] + gap) > Math.max(a.y0, b[1] - gap);
const at = (x, y) => ({ x: x / W, y: y / H, visible: true, front: true });
// the outside view of the finding at 1600x900: the brain's front at the foot of the picture, left of the middle
const FRONT_AT_FOOT = { anterior: at(533, 846), posterior: at(510, 250) };
const BAR = [324, 813, 729, 855], HINT = [324, 861, 735, 886], BAR_TIGHT = [324, 781, 599, 840];

test('ORIENTATION_EDGE.rowGapPx is a small room of a few px', () => {
  assert.ok(ORIENTATION_EDGE.rowGapPx >= 2 && ORIENTATION_EDGE.rowGapPx <= 8);
});

test('"Front (anterior)" whose place is under the limb buttons stands above them, with the gap, and is still shown', () => {
  const h = hud();
  // (what update 80 did: with only the hint handed over, the label kept the bottom edge clearance and lay on the bar)
  const before = h.placeOrientation(FRONT_AT_FOOT, { width: W, height: H }, { rects: [], ellipses: [] }, { labelRects: [frac(HINT)] });
  const b0 = before.find(q => q.key === 'anterior');
  assert.ok(b0 && meets(b0, BAR), `the hint alone: the label lies on the bar (${[b0.x0, b0.y0, b0.x1, b0.y1].map(Math.round)})`);
  const after = h.placeOrientation(FRONT_AT_FOOT, { width: W, height: H }, { rects: [], ellipses: [] }, { labelRects: [frac(HINT), frac(BAR)] });
  const a = after.find(q => q.key === 'anterior');
  assert.ok(a, 'the label is shown');
  assert.ok(!meets(a, BAR, ORIENTATION_EDGE.rowGapPx), `off the bar by the gap (${[a.x0, a.y0, a.x1, a.y1].map(Math.round)})`);
  assert.ok(!meets(a, HINT, ORIENTATION_EDGE.rowGapPx), 'and off the hint');
  assert.ok(a.y1 <= BAR[1] - ORIENTATION_EDGE.rowGapPx && a.y1 > BAR[1] - 80, 'just above the bar, near its own place');
  assert.ok(a.y0 >= 0 && a.y1 <= H && a.x0 >= 0 && a.x1 <= W, 'inside the window');
});

test('the side labels keep off the two-line bar beside the body and stay a level pair', () => {
  const h = hud();
  // the outside view at 1600x900 with the look a little up: the brain's right half low on the left, beside the bar
  const proj = { anterior: at(800, 640), posterior: at(797, 360), right: at(405, 822), left: at(1150, 822) };
  const rows = [frac(BAR_TIGHT), frac([324, 846, 648, 886])];
  const out = h.placeOrientation(proj, { width: W, height: H }, { rects: [], ellipses: [] }, { labelRects: rows });
  const r = out.find(q => q.key === 'right'), l = out.find(q => q.key === 'left');
  assert.ok(r && l, 'both side labels are shown');
  for (const q of [r, l]) for (const row of [BAR_TIGHT, [324, 846, 648, 886]]) assert.ok(!meets(q, row, ORIENTATION_EDGE.rowGapPx), `${q.key} off the rows (${[q.x0, q.y0, q.x1, q.y1].map(Math.round)})`);
  assert.ok(Math.abs(r.y0 - l.y0) < 1, 'level');
});

test('a label with no clear place beside the rows is not drawn rather than drawn on them', () => {
  const h = hud();
  // the bar fills the foot of the picture and a card stands over the inward places (no clear place on the axis)
  const wide = [frac([0, 700, W, 900])];
  const out = h.placeOrientation(FRONT_AT_FOOT, { width: W, height: H }, { rects: [frac([300, 500, 800, 700])], ellipses: [] }, { labelRects: wide });
  const a = out.find(q => q.key === 'anterior');
  assert.ok(!a || !meets(a, [0, 700, W, 900]), 'never on the rows');
});

test('rows given as anything but finite boxes are left out', () => {
  const h = hud();
  const out = h.placeOrientation(FRONT_AT_FOOT, { width: W, height: H }, { rects: [], ellipses: [] }, { labelRects: [null, { x0: NaN, y0: 0, x1: 1, y1: 1 }, frac(BAR)] });
  const a = out.find(q => q.key === 'anterior');
  assert.ok(a && !meets(a, BAR, ORIENTATION_EDGE.rowGapPx));
});
