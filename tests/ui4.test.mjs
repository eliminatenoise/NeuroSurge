/** Letting go without a long frame, labels and cards right in small windows, smooth leg borders (22 November 2026, round
 * r31, package UI4; DESIGN-DECISIONS 202). The owner's rules these cases pin: performance first, nothing that makes the
 * game stutter (the work of a release in small pieces, the cheap ones merged); little text (a lead sentence longer
 * than four lines is left out of the short card, whole); a label is moved before it is faded; the strip's blocks keep
 * their places and areas while their drawn borders are smoothed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { RELEASE_STEPS, RELEASE_STEPS_FINE, RELEASE_FINE, releaseStep, releaseCursorAt } from '../scene/src/ns-arrows3d.mjs';
import { INFO_WHOLE, leadSentenceMark, leadSentenceLines, BODY_GPU_COPY, RELEASE_WARM, declutterLabels, LABEL_LAYOUT, LABEL_RETRY_STATS } from '../scene/src/ns-scene-three.mjs';
import * as NB from '../scene/src/ns-brain.mjs';
import { BODY_MOTOR_MAP } from '../scene/src/ns-bodymap.mjs';

const SRC = readFileSync(new URL('../scene/src/ns-scene-three.mjs', import.meta.url), 'utf8');

/** The steps of a release when the scene calls the arrows `calls` times in each drawn frame (the drawing and the
 * overlay may merge; a pick at the start of the next tick may not), each step costing cost(step) ms of work. */
function walk({ released, mirrorPlan = false, cost = () => 5, frames = 20, calls = 2, steps = RELEASE_STEPS_FINE, fine = RELEASE_FINE }) {
  let cursor = 0, at = -1, merges = 0, spent = 0, serial = 0;
  const out = [];
  for (let f = 0; f < frames; f++) {
    // a pick before the drawing: the frame number of the frame before, no merge
    let c = releaseCursorAt({ cursor, at, serial, releaseAt: 0, hold: 2 }); cursor = c.cursor; at = c.at;
    serial++; spent = 0; merges = 0;
    const frame = [];
    for (let k = 0; k < calls; k++) {
      const before = cursor;
      c = releaseCursorAt({ cursor, at, serial, releaseAt: 0, hold: 2, spentMs: spent, mergeMs: fine.mergeMs, merges, maxMerges: fine.maxMerges });
      cursor = c.cursor; at = c.at; merges = c.merges;
      const r = releaseStep(cursor, { released, mirrorPlan, steps });
      if (cursor !== before && r.step !== 'hold' && r.step !== 'done') { spent += cost(r.step); frame.push(r.step); }
      if (r.last) { out.push({ frame: serial, steps: frame, hidden: r.hidden, last: true }); return out; }
    }
    out.push({ frame: serial, steps: frame, hidden: releaseStep(cursor, { released, mirrorPlan, steps }).hidden, last: false });
  }
  return out;
}

test('UI4 item 1: the finer steps; the UI3 list stays behind the switch', () => {
  assert.equal(RELEASE_FINE.on, true);
  assert.ok(Object.isFrozen(RELEASE_FINE) && Object.isFrozen(RELEASE_STEPS_FINE));
  assert.deepEqual([...RELEASE_STEPS_FINE], ['prepare', 'grids', 'tester-brain', 'plan-brain', 'fit-brain', 'tester-mirror', 'tester-opening', 'plan-mirror', 'fit-mirror']);
  assert.deepEqual([...RELEASE_STEPS], ['prepare', 'tester-brain', 'plan-brain', 'tester-mirror', 'plan-mirror'], 'section 200\'s list, unchanged');
  // every step of the UI3 list is still a step of the fine one, in the same order
  const idx = RELEASE_STEPS.map(s => RELEASE_STEPS_FINE.indexOf(s));
  assert.ok(idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1])));
  assert.ok(RELEASE_FINE.mergeMs > 0 && RELEASE_FINE.mergeMs <= 2, 'only a step that found (almost) nothing to do lets the next run in its frame');
  // the scene goes through the fine list
  assert.match(SRC, /const RELEASE_LIST = NsArrows\.RELEASE_FINE && NsArrows\.RELEASE_FINE\.on \? NsArrows\.RELEASE_STEPS_FINE : NsArrows\.RELEASE_STEPS;/);
  assert.match(SRC, /NsArrows\.releaseStep\(releaseCursor, \{ released: arrowReleased, mirrorPlan: releaseKeepsM === false, steps: RELEASE_LIST \}\)/);
});

test('UI4 item 1: a brain let go: grids, cover, search and rescue each on a frame of its own when each costs something', () => {
  const w = walk({ released: 'brain' });
  assert.deepEqual(w.map(f => f.steps.join('+')), ['', '', 'prepare', 'grids', 'tester-brain', 'plan-brain', 'fit-brain']);
  assert.deepEqual(w.map(f => f.hidden.brain), [true, true, true, true, true, true, false], 'the brain\'s arrows come back with its rescued tips');
  assert.ok(w.every(f => f.hidden.mirror === false));
  assert.equal(w[w.length - 1].last, true);
  // releaseStep: the brain's part of the fine list ends before 'tester-mirror'
  assert.equal(releaseStep(5, { released: 'brain', steps: RELEASE_STEPS_FINE }).last, true);
  assert.equal(releaseStep(5, { released: 'brain', steps: RELEASE_STEPS_FINE }).step, 'fit-brain');
});

test('UI4 item 1: the mirror body let go: its cover, the opening view, its search and its rescue on frames of their own', () => {
  const w = walk({ released: 'mirror', mirrorPlan: true });
  assert.deepEqual(w.map(f => f.steps.join('+')), ['', '', 'prepare', 'grids', 'tester-brain', 'plan-brain', 'fit-brain', 'tester-mirror', 'tester-opening', 'plan-mirror', 'fit-mirror']);
  assert.ok(w.slice(0, -1).every(f => f.hidden.mirror === true) && w[w.length - 1].hidden.mirror === false, 'hidden until its rescued tips are shown');
  assert.ok(w.every(f => f.hidden.brain === false));
});

test('UI4 item 1: cheap steps run in the frame of the step before, never more than mergeMs of work before them', () => {
  // the keep test and the grids memo-hit, the brain kept (no cover, no search): all of it in two frames
  const cheap = new Set(['prepare', 'grids', 'tester-brain', 'fit-brain', 'tester-opening']);
  const w = walk({ released: 'mirror', mirrorPlan: true, cost: s => (cheap.has(s) ? 0.2 : 6) });
  for (const f of w) {
    // a frame's steps: any number of cheap ones, then at most one that costs (nothing after it)
    const costly = f.steps.map(s => !cheap.has(s));
    assert.ok(costly.indexOf(true) < 0 || costly.indexOf(true) === costly.length - 1, `frame ${f.frame}: ${f.steps.join('+')}`);
  }
  assert.ok(w.length < 11, `fewer frames than one step each (${w.length})`);
  // all cheap: at most 1 + maxMerges steps in one frame, with the drawing and the overlay calling (two calls)
  const all = walk({ released: 'mirror', mirrorPlan: true, cost: () => 0.1, calls: 6 });
  assert.ok(all.every(f => f.steps.length <= 1 + RELEASE_FINE.maxMerges));
  // a pick at the start of the next tick never takes a step (it still sees the frame before)
  assert.deepEqual(releaseCursorAt({ cursor: 3, at: 7, serial: 7, releaseAt: 0, hold: 2 }), { cursor: 3, at: 7 });
  assert.match(SRC, /const F = NsArrows\.RELEASE_FINE, merge = mergeOk === true && releaseFine && F\.mergeMs > 0;/);
  assert.equal((SRC.match(/updateArrows\(true\);/g) || []).length, 2, 'only the drawing and the overlay layout may merge');
  // the merge rule itself
  assert.deepEqual(releaseCursorAt({ cursor: 2, at: 5, serial: 5, releaseAt: 0, hold: 2, spentMs: 0.4, mergeMs: 1.5, merges: 0, maxMerges: 3 }), { cursor: 3, at: 5, merges: 1 });
  assert.deepEqual(releaseCursorAt({ cursor: 2, at: 5, serial: 5, releaseAt: 0, hold: 2, spentMs: 2, mergeMs: 1.5, merges: 0, maxMerges: 3 }), { cursor: 2, at: 5, merges: 0 }, 'a step that cost something ends the frame');
  assert.deepEqual(releaseCursorAt({ cursor: 2, at: 5, serial: 5, releaseAt: 0, hold: 2, spentMs: 0, mergeMs: 1.5, merges: 3, maxMerges: 3 }), { cursor: 2, at: 5, merges: 3 });
  assert.deepEqual(releaseCursorAt({ cursor: 0, at: -1, serial: 2, releaseAt: 0, hold: 2, spentMs: 0, mergeMs: 1.5, merges: 0, maxMerges: 3 }), { cursor: 0, at: -1, merges: 0 }, 'the frames that hold do no work at all');
});

test('UI4 item 1: a plan\'s rescue pass waits for its own step; a new hold finishes it at once', () => {
  assert.match(SRC, /if \(releaseFine && rel\.step === 'plan-brain'\) B\.pendingFit = fitB; else fitB\(\);/);
  assert.match(SRC, /if \(releaseFine && rel\.step === 'plan-mirror'\) M\.pendingFit = fitM; else fitM\(\);/);
  assert.match(SRC, /if \(B\.pendingFit && \(rel\.step !== 'plan-brain' \|\| rel\.stage === 'none'\)\) finishPendingFit\(B\);/);
  assert.match(SRC, /if \(M\.pendingFit && \(rel\.step !== 'plan-mirror' \|\| rel\.stage === 'none'\)\) finishPendingFit\(M\);/);
  assert.match(SRC, /if \(t\) finishPendingFits\(\);/);
  // the grids and the opening view on their own steps
  assert.match(SRC, /if \(\(releaseFine \? rel\.step === 'grids' : preparing\) && showB\) \{/);
  assert.match(SRC, /if \(\(rel\.step === 'tester-opening' \|\| !releaseFine\) && mc\.look === mc\.start && mOpeningLandscape\) \{/);
});

test('UI4 item 1: the processor copies of the muscles the graphics card draws have a budget of their own', () => {
  assert.ok(Object.isFrozen(BODY_GPU_COPY));
  assert.ok(BODY_GPU_COPY.frameVertices > 0 && BODY_GPU_COPY.frameVertices < 60000, 'below the skin budget of a frame');
  assert.match(SRC, /if \(budget <= 0 \|\| \(copy && copyBudget <= 0\)\) \{ waiting\+\+; if \(firstWaiting < 0\) firstWaiting = at; continue; \}/);
});

test('UI4 item 3: a lead sentence longer than four lines is left out of the short card, whole', () => {
  assert.equal(INFO_WHOLE.on, true);
  assert.equal(INFO_WHOLE.maxLines, 4);
  assert.equal(leadSentenceMark({ overPx: 0, lines: 3 }), 'whole', '1600 x 900: two or three lines');
  assert.equal(leadSentenceMark({ overPx: 0, lines: 4 }), 'whole');
  assert.equal(leadSentenceMark({ overPx: 0, lines: 4.2 }), 'whole', 'a rounding of the line height is not a fifth line');
  assert.equal(leadSentenceMark({ overPx: 0, lines: 6 }), 'drop', '800 x 600: six or seven lines');
  assert.equal(leadSentenceMark({ overPx: 30, lines: 3 }), 'drop', 'the height rule of section 200 still holds');
  assert.equal(leadSentenceMark({ open: true, lines: 9 }), 'whole', 'key R\'s opened card scrolls');
  assert.equal(leadSentenceMark({ lines: 9, maxLines: 0 }), 'whole', '0: no line rule');
  assert.equal(leadSentenceMark({ lines: NaN }), 'whole', 'unknown lines: the height rule only');
  assert.equal(leadSentenceMark({ overPx: 0, lines: 5, othersShown: false }), 'whole', 'an in-between area\'s card: the sentence is its only body');
  assert.equal(leadSentenceMark({ overPx: 30, lines: 5, othersShown: false }), 'drop', 'unless the card runs over (section 200)');
  assert.equal(leadSentenceLines(107, 16.875), 107 / 16.875);
  assert.ok(Number.isNaN(leadSentenceLines(0, 16.875)) && Number.isNaN(leadSentenceLines(50, NaN)));
  assert.match(SRC, /const lead = leadSentenceMark\(\{ open, overPx: over, shown: shownLead, lines, othersShown \}\);/);
  assert.match(SRC, /const othersShown = drawnPart\(info\.moves, 'li'\) \|\| drawnPart\(info\.rows, 'dd'\);/);
});

// ---- item 2: the arm pair at 800 x 600 with the map on (the label items and obstacles read from the game, update 68)
const MAP_ON = {
  items: [
    { id: 'right:leftArm', x: 273.8, y: 121.5, w: 95, h: 28, priority: 100, required: true, text: 'Left arm', pair: 'arm', mirror: -1, side: { x0: 402.2, y0: 228.8, dxdy: -0.0008, sign: -1 } },
    { id: 'right:leg', x: 356.8, y: 82.1, w: 83, h: 23, priority: 50, required: false, text: 'Left leg', pair: 'leg', mirror: -1, side: { x0: 402.2, y0: 192, dxdy: -0.0008, sign: -1 } },
    { id: 'right:trunk', x: 330, y: 108.4, w: 130, h: 23, priority: 10, required: false, text: 'Belly and back', pair: 'trunk', mirror: -1, side: { x0: 402.2, y0: 216.9, dxdy: -0.0008, sign: -1 }, maxRings: 1 },
    { id: 'right:face', x: 227.1, y: 224.1, w: 122, h: 23, priority: 40, required: false, text: 'Face and neck', pair: 'face', mirror: -1, side: { x0: 402.1, y0: 323.1, dxdy: -0.0008, sign: -1 } },
    { id: 'left:leg', x: 443.3, y: 82.1, w: 91, h: 23, priority: 50, required: false, text: 'Right leg', pair: 'leg', mirror: 1, side: { x0: 402.2, y0: 192, dxdy: -0.0008, sign: 1 } },
    { id: 'left:trunk', x: 470, y: 108.4, w: 130, h: 23, priority: 10, required: false, text: 'Belly and back', pair: 'trunk', mirror: 1, side: { x0: 402.2, y0: 216.9, dxdy: -0.0008, sign: 1 }, maxRings: 1 },
    { id: 'left:arm', x: 526.2, y: 121.5, w: 104, h: 28, priority: 60, required: false, text: 'Right arm', pair: 'arm', mirror: 1, side: { x0: 402.2, y0: 228.8, dxdy: -0.0008, sign: 1 } },
    { id: 'left:face', x: 572.9, y: 224.1, w: 122, h: 23, priority: 40, required: false, text: 'Face and neck', pair: 'face', mirror: 1, side: { x0: 402.1, y0: 323.1, dxdy: -0.0008, sign: 1 } }
  ],
  // [x0, y0, x1, y1, words, weight]: the crosshair zone, the status card, the limb buttons, the map card, the mirror
  // body's boxes and your own body's, as the game laid them out (those below y 260)
  obstacles: [[340, 268, 460, 332, 0, 1], [16, 14, 276, 74, 1, 8], [197, 524, 603, 566, 1, 8], [562, 64, 792, 242, 1, 8], [368, 77, 431, 109, 0, 1], [148, 85, 180, 148, 0, 1],
    [619, 85, 651, 148, 0, 1], [380, 60, 420, 108, 0, 1], [384, 108, 416, 112, 0, 1], [336, 112, 456, 136, 0, 1], [316, 136, 456, 148, 0, 1], [460, 144, 480, 148, 0, 1],
    [304, 148, 492, 152, 0, 1], [304, 152, 500, 168, 0, 1], [304, 168, 360, 180, 0, 1], [364, 168, 500, 172, 0, 1], [364, 172, 496, 180, 0, 1], [304, 180, 448, 184, 0, 1],
    [460, 180, 488, 184, 0, 1], [308, 184, 448, 188, 0, 1], [316, 188, 448, 192, 0, 1], [352, 192, 448, 212, 0, 1], [332, 212, 468, 220, 0, 1], [328, 220, 396, 240, 0, 1],
    [404, 220, 468, 240, 0, 1], [328, 240, 388, 252, 0, 1], [412, 240, 468, 252, 0, 1], [263, 26, 312, 52, 0, 1], [314, 170, 340, 219, 0, 1], [458, 170, 484, 219, 0, 1]]
};
const mapOnLayout = rules => {
  const obstacles = MAP_ON.obstacles.map(o => ({ x0: o[0], y0: o[1], x1: o[2], y1: o[3], words: o[4] === 1, weight: o[5] }));
  return { obstacles, res: declutterLabels(MAP_ON.items.map(i => ({ ...i })), { width: 800, height: 600, topPx: 26, obstacles, maxShown: LABEL_LAYOUT.maxShownCompact, rules }) };
};

test('UI4 item 2: with the map on at 800 x 600 the arm pair is moved to a clear place, level and mirrored, not faded', () => {
  assert.equal(LABEL_LAYOUT.gridRetry, true);
  assert.equal(LABEL_LAYOUT.retryFrac, 0.125);
  assert.equal(LABEL_LAYOUT.retryMax, 400);
  const r0 = LABEL_RETRY_STATS.runs, t0 = LABEL_RETRY_STATS.tested;
  const { obstacles, res } = mapOnLayout(LABEL_LAYOUT);
  assert.equal(LABEL_RETRY_STATS.runs - r0, 1, 'one retry, for the arm pair');
  assert.ok(LABEL_RETRY_STATS.tested - t0 <= LABEL_LAYOUT.retryMax, `offsets tested: ${LABEL_RETRY_STATS.tested - t0}`);
  // a layout where no place is clear tests at most retryMax offsets
  const t1 = LABEL_RETRY_STATS.tested;
  declutterLabels(MAP_ON.items.map(i => ({ ...i })), { width: 800, height: 600, topPx: 26, obstacles: [{ x0: 0, y0: 0, x1: 800, y1: 600 }], maxShown: 6 });
  assert.ok(LABEL_RETRY_STATS.tested - t1 <= LABEL_LAYOUT.retryMax);
  const A = res[0], B = res[6], a = MAP_ON.items[0], b = MAP_ON.items[6];
  assert.ok(A.shown && B.shown && !A.faded && !B.faded, `placed at ${A.x},${A.y} and ${B.x},${B.y}`);
  assert.equal(A.y, B.y, 'level');
  assert.ok(Math.abs((A.x - a.x) + (B.x - b.x)) < 1e-9, 'mirrored sideways');
  assert.ok(Math.abs(A.x - a.x) <= 2 * (Math.max(a.w, b.w) / 2 + LABEL_LAYOUT.gapPx) + 0.5 && Math.abs(A.y - a.y) <= 2 * (28 + LABEL_LAYOUT.gapPx) + 0.5, 'within its rings');
  const g = LABEL_LAYOUT.gapPx / 2;
  for (const [q, it] of [[A, a], [B, b]]) {
    const box = { x0: q.x - it.w / 2 - g, y0: q.y - it.h / 2 - g, x1: q.x + it.w / 2 + g, y1: q.y + it.h / 2 + g };
    for (const o of obstacles) assert.ok(!(box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0), `${it.text} clear of [${o.x0},${o.y0},${o.x1},${o.y1}]`);
  }
  // section 200's result without the retry: both faded where they touch least
  const off = mapOnLayout({ ...LABEL_LAYOUT, gridRetry: false }).res;
  assert.ok(off[0].faded && off[6].faded);
  // (as the game drew it on update 68, 302 / 498 at 105; the fixture's anchors are rounded to 0.1 px)
  assert.ok([[off[0].x, 302], [off[0].y, 105], [off[6].x, 498], [off[6].y, 105]].every(([v, w]) => Math.abs(v - w) <= 1.5), `${off[0].x},${off[0].y} ${off[6].x},${off[6].y}`);
  // the rings' grid alone (quarter or half steps) does not reach the only clear band of heights
  assert.ok(mapOnLayout({ ...LABEL_LAYOUT, retryFrac: 0.25 }).res[0].faded);
});

test('UI4 item 2: a pair that is not required is still hidden when it has no clear place (the retry is for the arm pair)', () => {
  const items = [{ id: 'a', x: 100, y: 100, w: 80, h: 20, priority: 50, required: false, text: 'Left leg', pair: 'leg', mirror: -1 }, { id: 'b', x: 300, y: 100, w: 80, h: 20, priority: 50, required: false, text: 'Right leg', pair: 'leg', mirror: 1 }];
  const wall = [{ x0: 0, y0: 0, x1: 400, y1: 400 }];
  const r = declutterLabels(items, { width: 400, height: 400, obstacles: wall });
  assert.ok(!r[0].shown && !r[1].shown);
});

test('UI4 item 2: the map card coming or going reads the HUD boxes again (the app root\'s data-ns-emap, read once a frame)', () => {
  assert.match(SRC, /if \(emapRootChanged\(\)\) \{ hudDirty = true; hudReadIn = 0; overlayDirty = true; \}/);
  assert.match(SRC, /emapRootEl\.getAttribute\('data-ns-emap'\)/);
  // before the dirty test that skips the layout
  assert.ok(SRC.indexOf('if (emapRootChanged())') < SRC.indexOf('if (hudMo ? !overlayDirty && !hudDirty : !overlayDirty && hudReadIn > 0)'));
});

// ---- item 4: the leg blocks' drawn borders
function atlasSeg(drawn) {
  const root = new URL('../', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('inputs/MESH-MANIFEST.json', root), 'utf8'));
  const readObj = rel => {
    const P = [], I = [];
    for (const line of readFileSync(new URL(rel, root), 'utf8').split('\n')) {
      if (line[0] === 'v' && line[1] === ' ') { const a = line.split(/\s+/); P.push(Number(a[1]), Number(a[2]), Number(a[3])); }
      else if (line[0] === 'f' && line[1] === ' ') { const a = line.trim().split(/\s+/).slice(1).map(s => parseInt(s, 10) - 1); for (let k = 1; k + 1 < a.length; k++) I.push(a[0], a[k], a[k + 1]); }
    }
    return { positions: Float32Array.from(P), indices: Uint32Array.from(I) };
  };
  const atlas = manifest.assets.filter(a => (a.groups || []).includes('brain')).map(a => {
    const rel = existsSync(new URL(`packets/pov-demo-assets/${a.path}`, root)) ? `packets/pov-demo-assets/${a.path}` : `packets/pov-demo-assets-r2/${a.path}`;
    return { id: a.element_id, ...readObj(rel) };
  });
  return NB.segmentMotorStrips(NB.motorStripDescriptors(atlas), BODY_MOTOR_MAP, { outline: false, drawn });
}
let segs = null;
const bothSegs = () => (segs || (segs = { on: atlasSeg(NB.STRIP_DRAWN), off: atlasSeg({ on: false }) }));
/** Turns sharper than `deg` of the drawn borders at strip coordinates `levels`, in the surface's plane, where the crest
 * faces up (normal z above 0.4): level lines of v (drawn: crestStripV of uDraw), straight in each convexity triangle. */
function sharpTurns(S, U, levels, deg) {
  const P = S.positions, I = S.indices, f = Float64Array.from(U, s => NB.crestStripV(s));
  let n = 0;
  for (const sb of levels) {
    const c = NB.crestStripV(sb), segsAt = new Map(), ends = [];
    for (let t = 0; t < S.triangleCount; t++) {
      if (S.triSurface[t]) continue;
      const v = [I[3 * t], I[3 * t + 1], I[3 * t + 2]], pts = [];
      for (let k = 0; k < 3; k++) {
        const a = v[k], b = v[(k + 1) % 3];
        if ((f[a] < c) !== (f[b] < c)) { const u = (c - f[a]) / (f[b] - f[a]); pts.push({ key: a < b ? `${a}_${b}` : `${b}_${a}`, p: [0, 1, 2].map(q => P[3 * a + q] + u * (P[3 * b + q] - P[3 * a + q])) }); }
      }
      if (pts.length !== 2) continue;
      const e1 = [0, 1, 2].map(q => P[3 * v[1] + q] - P[3 * v[0] + q]), e2 = [0, 1, 2].map(q => P[3 * v[2] + q] - P[3 * v[0] + q]);
      const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], ln = Math.hypot(...nn);
      const s = { a: pts[0], b: pts[1], n: nn.map(x => x / ln) };
      ends.push(s);
      for (const e of [pts[0].key, pts[1].key]) { if (!segsAt.has(e)) segsAt.set(e, []); segsAt.get(e).push(s); }
    }
    for (const [key, list] of segsAt) {
      if (list.length !== 2) continue;
      const [s1, s2] = list, N = s1.n.map((x, q) => x + s2.n[q]), lN = Math.hypot(...N);
      if (!(N[2] / lN > 0.4)) continue;
      const at = s1.a.key === key ? s1.a.p : s1.b.p, p1 = s1.a.key === key ? s1.b.p : s1.a.p, p2 = s2.a.key === key ? s2.b.p : s2.a.p;
      const d1 = at.map((x, q) => x - p1[q]), d2 = p2.map((x, q) => x - at[q]), nz = N.map(x => x / lN);
      const pr = d => d.map((x, q) => x - nz[q] * (d[0] * nz[0] + d[1] * nz[1] + d[2] * nz[2]));
      const a = pr(d1), b = pr(d2), la = Math.hypot(...a), lb = Math.hypot(...b);
      if (la < 0.03 || lb < 0.03) continue;
      if (Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb)))) * 180 / Math.PI > deg) n++;
    }
  }
  return n;
}

test('UI4 item 4: the drawn coordinate leaves every block where it was: the same triangles, the same mm2, the same owner runs', () => {
  assert.equal(NB.STRIP_DRAWN.on, true);
  assert.equal(NB.STRIP_DRAWN.mu, 1); assert.equal(NB.STRIP_DRAWN.vBand, 0.12);
  const { on, off } = bothSegs();
  assert.equal(on.regions.length, off.regions.length);
  on.regions.forEach((r, i) => { assert.equal(r.areaMm2, off.regions[i].areaMm2, r.id); assert.equal(r.triangleCount, off.regions[i].triangleCount, r.id); });
  on.strips.forEach((S, k) => { assert.deepEqual(Array.from(S.triRegion), Array.from(off.strips[k].triRegion)); assert.deepEqual(Array.from(S.u), Array.from(off.strips[k].u)); });
  on.parts.forEach((p, k) => assert.deepEqual(Array.from(p.s), Array.from(off.parts[k].s), 'the parts\' own coordinate (assignment) unchanged'));
  // only the primary convexity strips carry a drawn coordinate; it differs only below the band, and the medial parts have none
  for (const S of on.strips) {
    if (S.kind !== 'precentral') continue;
    assert.ok(S.uDraw && S.uDraw.length === S.u.length);
    let moved = 0;
    for (let i = 0; i < S.u.length; i++) { if (NB.crestStripV(S.u[i]) >= NB.STRIP_DRAWN.vBand && !(S.triSurface && false)) assert.ok(Math.abs(S.uDraw[i] - S.u[i]) < 1e-6 || NB.crestStripV(S.u[i]) < NB.STRIP_DRAWN.vBand, 'held from the band on'); if (Math.abs(S.uDraw[i] - S.u[i]) > 1e-6) moved++; }
    assert.ok(moved > 50, `${S.hemisphere}: ${moved} vertices drawn differently`);
  }
  assert.ok(on.parts.filter(p => p.surface === 'medial').every(p => p.sDraw === null));
  assert.ok(off.strips.every(S => !S.uDraw) && off.parts.every(p => !p.sDraw), 'off: as before');
});

test('UI4 item 4: every area\'s pick point picks the same area and movement with the drawn coordinate', () => {
  const { on, off } = bothSegs();
  const bands = new Map();
  for (const r of off.regions) {
    if (r.medialSurface) continue;
    bands.set(r.id, [r.extent[0], r.extent[1]]);
    const lohi = new Map();
    for (let i = 0; i <= 2000; i++) { const s = r.extent[0] + (r.extent[1] - r.extent[0]) * i / 2000, a = NB.regionActionAt(r, s, s); if (!a) continue; const e = lohi.get(a.id) || [Infinity, -Infinity]; e[0] = Math.min(e[0], s); e[1] = Math.max(e[1], s); lohi.set(a.id, e); }
    for (const [id, e] of lohi) bands.set(`${r.id}/${id}`, e);
  }
  let n = 0;
  for (const S of off.strips) {
    if (S.kind !== 'precentral') continue;
    const P = S.positions, I = S.indices, owners = off._owners[S.hemisphere].all, best = new Map();
    for (let t = 0; t < S.triangleCount; t++) {
      if (S.triSurface[t]) continue;
      const a = I[3 * t], b = I[3 * t + 1], c = I[3 * t + 2], va = NB.crestStripV(S.u[a]), vb = NB.crestStripV(S.u[b]), vc = NB.crestStripV(S.u[c]);
      for (let i = 1; i < 6; i++) for (let j = 1; j < 6 - i; j++) {
        const wb = i / 6, wc = j / 6, wa = 1 - wb - wc, s = NB.crestBendFull(wa * va + wb * vb + wc * vc), r = NB.regionOwnerAt(owners, s, off.options.gapTolU);
        if (!r) continue;
        const act = NB.regionActionAt(r, s, s);
        for (const key of [r.id, act ? `${r.id}/${act.id}` : null]) {
          if (!key || !bands.has(key)) continue;
          const [lo, hi] = bands.get(key), m = Math.min(s - lo, hi - s);
          if (!best.has(key) || m > best.get(key).m) best.set(key, { m, t, w: [wa, wb, wc] });
        }
      }
    }
    for (const [key, p] of best) {
      const v = [I[3 * p.t], I[3 * p.t + 1], I[3 * p.t + 2]], C = [0, 1, 2].map(q => p.w[0] * P[3 * v[0] + q] + p.w[1] * P[3 * v[1] + q] + p.w[2] * P[3 * v[2] + q]);
      const e1 = [0, 1, 2].map(q => P[3 * v[1] + q] - P[3 * v[0] + q]), e2 = [0, 1, 2].map(q => P[3 * v[2] + q] - P[3 * v[0] + q]);
      const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], ln = Math.hypot(...nn), N = nn.map(x => x / ln);
      for (const sg of [1, -1]) {
        const o = C.map((x, q) => x + sg * 2 * N[q]), d = N.map(x => -sg * x), A = NB.classifyRegionGaze(o, d, off);
        if (A.kind !== 'region' || !A.point || Math.hypot(...A.point.map((x, q) => x - C[q])) > 0.05) continue;
        const isAct = key.includes('/'), mine = q => (isAct ? `${q.regionId}/${q.mapActionId}` : q.regionId) === key;
        if (!mine(A)) continue;
        const B = NB.classifyRegionGaze(o, d, on);
        assert.ok(mine(B), `${S.hemisphere} ${key}: ${B.kind} ${B.regionId}/${B.mapActionId}`);
        n++;
        break;
      }
    }
  }
  assert.ok(n >= 100, `${n} areas tested`);
});

test('UI4 item 4: the leg borders lose their kinks, and every leg block keeps its drawn area within 4 %', () => {
  const { on, off } = bothSegs();
  const levels = [0.032, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 0.11];
  for (const h of ['right', 'left']) {
    const S0 = off.strips.find(S => S.kind === 'precentral' && S.hemisphere === h), S1 = on.strips.find(S => S.kind === 'precentral' && S.hemisphere === h);
    const before = sharpTurns(S0, S0.u, levels, 45), after = sharpTurns(S1, S1.uDraw, levels, 45);
    assert.ok(before >= 8 && after <= 3, `${h}: turns sharper than 45 degrees ${before} -> ${after}`);
    const b25 = sharpTurns(S0, S0.u, levels, 25), a25 = sharpTurns(S1, S1.uDraw, levels, 25);
    assert.ok(a25 < b25 / 2, `${h}: sharper than 25 degrees ${b25} -> ${a25}`);
    // drawn area of each block on the convexity, sampled 6 x 6 per triangle
    const owners = off._owners[h].all, area = U => {
      const P = S0.positions, I = S0.indices, out = new Map();
      for (let t = 0; t < S0.triangleCount; t++) {
        if (S0.triSurface[t]) continue;
        const v = [I[3 * t], I[3 * t + 1], I[3 * t + 2]], e1 = [0, 1, 2].map(q => P[3 * v[1] + q] - P[3 * v[0] + q]), e2 = [0, 1, 2].map(q => P[3 * v[2] + q] - P[3 * v[0] + q]);
        const A = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]) / 2, f = v.map(i => NB.crestStripV(U[i]));
        for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6 - i; j++) { const wb = i / 6, wc = j / 6, r = NB.regionOwnerAt(owners, NB.crestBendFull((1 - wb - wc) * f[0] + wb * f[1] + wc * f[2]), off.options.gapTolU); if (r) out.set(r.id, (out.get(r.id) || 0) + A / 28); }
      }
      return out;
    };
    const A0 = area(S0.u), A1 = area(S1.uDraw);
    // (the toes give the most: the staircase's own vertices rise in the drawn coordinate; measured -2.5 to -3.4 %)
    for (const [id, a] of A0) if (/toes|ankle|knee|hip|trunk/.test(id)) assert.ok(Math.abs(A1.get(id) - a) / a < 0.04, `${id}: ${a.toFixed(0)} -> ${A1.get(id).toFixed(0)} mm2`);
  }
});

test('UI4 item 4: smoothStripDrawnV evens the gradient across edges, stays near v, and holds every vertex from the band on', () => {
  // a 12 x 6 grid of 1 mm squares; the medial wall: the left column of triangles plus a staircase of notches into it
  const P = [], I = [], nx = 12, ny = 6, id = (i, j) => j * (nx + 1) + i;
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) P.push(i, j, 0);
  const triMedial = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    I.push(id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j), id(i + 1, j + 1), id(i, j + 1));
    const med = i === 0 || (i === 1 && j % 2 === 0);
    triMedial.push(med ? 1 : 0, med ? 1 : 0);
  }
  // v: 0 on the medial vertices, else a field that follows the staircase (distance to the notches)
  const isMed = new Uint8Array((nx + 1) * (ny + 1));
  for (let t = 0; t < triMedial.length; t++) if (triMedial[t]) for (let k = 0; k < 3; k++) isMed[I[3 * t + k]] = 1;
  const v = new Float64Array(isMed.length);
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { let d = Infinity; for (let q = 0; q < isMed.length; q++) if (isMed[q]) d = Math.min(d, Math.hypot(P[3 * q] - i, P[3 * q + 1] - j)); v[id(i, j)] = 0.01 * d; }
  const r = NB.smoothStripDrawnV(Float32Array.from(P), Uint32Array.from(I), v, Uint8Array.from(triMedial), { mu: 1, vBand: 0.08 });
  assert.ok(r.free > 0 && r.iterations > 0);
  for (let q = 0; q < v.length; q++) if (!isMed[q] && v[q] >= 0.08) assert.equal(r.v[q], v[q], 'held');
  // the jumps of the gradient across shared edges of non-medial triangles shrink
  const jumps = f => {
    const grad = t => { const [a, b, c] = [I[3 * t], I[3 * t + 1], I[3 * t + 2]]; const x = k => P[3 * k], y = k => P[3 * k + 1]; const den = (x(b) - x(a)) * (y(c) - y(a)) - (x(c) - x(a)) * (y(b) - y(a)); return [((f[b] - f[a]) * (y(c) - y(a)) - (f[c] - f[a]) * (y(b) - y(a))) / den, ((f[c] - f[a]) * (x(b) - x(a)) - (f[b] - f[a]) * (x(c) - x(a))) / den]; };
    const edge = new Map(); let s = 0;
    for (let t = 0; t < triMedial.length; t++) { if (triMedial[t]) continue; for (let k = 0; k < 3; k++) { const a = I[3 * t + k], b = I[3 * t + (k + 1) % 3], key = Math.min(a, b) * 1000 + Math.max(a, b); if (edge.has(key)) { const g0 = grad(edge.get(key)), g1 = grad(t); s += (g0[0] - g1[0]) ** 2 + (g0[1] - g1[1]) ** 2; } else edge.set(key, t); } }
    return s;
  };
  assert.ok(jumps(r.v) < 0.5 * jumps(v), `${jumps(v)} -> ${jumps(r.v)}`);
  // and stays near v (a fraction of the band)
  let most = 0; for (let q = 0; q < v.length; q++) most = Math.max(most, Math.abs(r.v[q] - v[q]));
  assert.ok(most < 0.01, `largest change ${most}`);
});

test('UI4 item 4: the renderer and the picker take the drawn coordinate', () => {
  assert.match(SRC, /const S = part\.sDraw && part\.sDraw\.length === n \? part\.sDraw : part\.s && part\.s\.length === n \? part\.s : part\.u;\n\s+geo\.setAttribute\('nsS'/);
  assert.match(SRC, /const lo = Math\.max\(0, Math\.min\(S\[a\], S\[b\], S\[c\]\)\), hi = Math\.max\(0, S\[a\], S\[b\], S\[c\]\);/);
  const brain = readFileSync(new URL('../scene/src/ns-brain.mjs', import.meta.url), 'utf8');
  assert.match(brain, /const SU = S\.uDraw && S\.uDraw\.length === S\.u\.length \? S\.uDraw : S\.u;/);
});
