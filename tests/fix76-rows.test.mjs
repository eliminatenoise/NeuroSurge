// 25 November 2026 (FIX76; a second play-through of Body update 74, finding 9). In the outside view the limb buttons
// and the hint stand in the strip beside your head and trunk (ROWS_OUTSIDE). The pure rule on the boxes the game gave;
// the game itself is tried in tests/browser-hud-clear.mjs.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { ROWS_OUTSIDE, ballsBox, rowsBesideBody } from '../scene/src/ns-rows-place.mjs';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/* ---------------------------------------------------------------- finding 9: the two rows in the outside view */

const strip = (W, H, body, taken = []) => rowsBesideBody({ W, H, body: { x0: body[0], y0: body[1], x1: body[2], y1: body[3] }, taken: taken.map(t => ({ x0: t[0], y0: t[1], x1: t[2], y1: t[3] })) });

test('in the outside view the two rows take the strip to the left of your head and trunk', () => {
  assert.ok(Object.isFrozen(ROWS_OUTSIDE) && ROWS_OUTSIDE.on === true && ROWS_OUTSIDE.tightPx < ROWS_OUTSIDE.barPx);
  // (the boxes the game gave at these sizes: your head and trunk, and the cards of the full reading level)
  const a = strip(1280, 720, [563, 602, 717, 720]);
  assert.deepEqual({ side: a.side, x0: a.x0, x1: a.x1, tight: a.tight }, { side: 'left', x0: 12, x1: 551, tight: false });
  assert.deepEqual(a.bar, { left: 12 });
  assert.deepEqual(a.hint, { bottom: 14, maxWidth: 420, align: 'left', left: 12 });
  const b = strip(800, 600, [336, 501, 464, 600]);
  assert.deepEqual({ side: b.side, x0: b.x0, x1: b.x1, tight: b.tight }, { side: 'left', x0: 12, x1: 324, tight: true }, 'a narrower strip: two lines a button');
  assert.equal(b.hint.maxWidth, 312, 'and the hint no wider than the strip');
  const c = strip(1600, 900, [703, 752, 897, 900]);
  assert.equal(c.side, 'left'); assert.equal(c.tight, false);
});

test('a card in the corner ends the strip; with no strip wide enough the rows keep their usual place', () => {
  // 1280 by 720, the full level: the status card bottom left, the information card bottom right
  const a = strip(1280, 720, [563, 602, 717, 720], [[12, 538, 252, 688], [12, 245, 312, 525], [1028, 233, 1268, 708]]);
  assert.deepEqual({ side: a.side, x0: a.x0, x1: a.x1, tight: a.tight }, { side: 'left', x0: 264, x1: 551, tight: true });
  // 800 by 600, the full level: 162 px of status card, 154 px to your trunk, the information card on the right
  assert.equal(strip(800, 600, [336, 501, 464, 600], [[12, 331, 162, 568], [638, 192, 788, 588]]), null);
  // the left taken, the right free: the right strip, its rows measured from the right edge
  const r = strip(1280, 720, [563, 602, 717, 720], [[12, 538, 420, 688]]);
  assert.deepEqual({ side: r.side, x0: r.x0, x1: r.x1 }, { side: 'right', x0: 729, x1: 1268 });
  assert.deepEqual(r.bar, { right: 12 });
  assert.equal(r.hint.right, 12); assert.equal(r.hint.align, 'right');
  // a card above the strip at the bottom is not in the way
  assert.equal(strip(1280, 720, [563, 602, 717, 720], [[12, 245, 312, 525]]).x0, 12);
});

test('nothing is moved when your head and trunk are not in the strip at the bottom, or the rule is off', () => {
  assert.equal(strip(1280, 720, [563, 300, 717, 500]), null, 'the body higher up: the rows are not on it');
  assert.equal(rowsBesideBody({ W: 1280, H: 720, body: null }), null, 'not in the picture');
  assert.equal(rowsBesideBody({ W: 1280, H: 720, body: { x0: 563, y0: 602, x1: 717, y1: 720 } }, { ...ROWS_OUTSIDE, on: false }), null);
});

test('the box round the balls of your head and trunk, clipped to the window', () => {
  assert.deepEqual(ballsBox([{ x: 640, y: 700, r: 60 }, { x: 600, y: 650, r: 30 }, { x: NaN, y: 0, r: 5 }], 1280, 720), { x0: 570, y0: 620, x1: 700, y1: 720 });
  assert.equal(ballsBox([{ x: 640, y: 900, r: 60 }], 1280, 720), null, 'below the window');
  assert.equal(ballsBox([], 1280, 720), null);
});

test('the app moves the rows only in the outside view at rest, and the eye view keeps the style sheet\'s places', () => {
  const app = read('scene/src/ns-app.mjs');
  assert.match(app, /if \(!ROWS_OUTSIDE\.on \|\| !cam \|\| cam\.view === 'first' \|\| !\(sz\.width >= sz\.height\)\) \{ rowsOutNow = null; rowsOutBody = null; rowsOutFor = ''; return null; \}/);
  assert.match(app, /if \(cam\.progress !== 1 \|\| [^\n]*\) return rowsOutNow;/, 'on the way between the views the rows stay where they were');
  assert.match(app, /if \(!rows\) \{ st\.left = ''; st\.right = ''; st\.transform = ''; \}/, 'back at its own place');
  assert.match(app, /shell\.clearHint\(limbHud\.box, `\$\{size\.width\}x\$\{size\.height\}\|\$\{placeLimbBar\(limbHud\.box, rowsOut\)\}`\);/, 'the bar is measured against the hint again when it moved (section 207)');
  const css = read('scene/example/quiet.css');
  assert.ok(css.includes('.ns-limbs-tight .ns-limbs-chip { flex-direction: column; gap: 2px; padding: 3px 5px; }'), 'two lines a button in a narrow strip');
});
