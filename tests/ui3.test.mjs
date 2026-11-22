/** The last small faults of the picture, the tips, the cards and the map (22 November 2026, round r30, package UI3;
 * DESIGN-DECISIONS 200). The owner's rules these cases pin: performance first, nothing that makes the game stutter
 * (a release's work is spread one piece per frame); a hint must be true (no "behind you" while the brain fills the
 * picture's edges); words whole or not at all (no sentence cut in the middle of a word); labels never cover a card. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RELEASE_STEPS, releaseStep, releaseCursorAt, releasePlanStage } from '../scene/src/ns-arrows3d.mjs';
import { ARROW_REPLAN, INFO_WHOLE, leadSentenceMark, LIVE_AT_LOW, liveRulesFor, QUALITY_LEVELS } from '../scene/src/ns-scene-three.mjs';
import { BRAIN_LIVE, createBrainLive, stepBeat } from '../scene/src/ns-brain-live.mjs';
import { BRAIN_LOST, brainSeenForTip, brainLostWords } from '../scene/src/ns-reference-graph.mjs';
import { createFrameTimer, FRAME_PARTS, FRAME_NOTES } from '../scene/src/ns-perf.mjs';

/** The steps a release goes through when the scene calls the arrows twice in each drawn frame (a pick before the
 * drawing, then the drawing), the way ns-scene-three updateArrows does: the step of each drawn frame. */
function walk({ released, mirrorPlanFrom = Infinity, frames = 12, hold = ARROW_REPLAN.holdFrames }) {
  let cursor = 0, at = -1, serial = 0; const releaseAt = 0, out = [];
  for (let f = 0; f < frames; f++) {
    // the pick before the frame's drawing sees the serial of the frame before
    let c = releaseCursorAt({ cursor, at, serial, releaseAt, hold }); cursor = c.cursor; at = c.at;
    const atPick = releaseStep(cursor, { released, mirrorPlan: cursor >= mirrorPlanFrom }).step;
    serial++; // the drawing
    c = releaseCursorAt({ cursor, at, serial, releaseAt, hold }); cursor = c.cursor; at = c.at;
    const r = releaseStep(cursor, { released, mirrorPlan: cursor >= mirrorPlanFrom });
    out.push({ pick: atPick, step: r.step, last: r.last, hidden: r.hidden });
    if (r.last) break;
  }
  return out;
}

test('UI3 item 1: a brain let go whose mirror tips may stay: two quiet frames, then the grids, the cover, the plan, one per frame', () => {
  assert.equal(ARROW_REPLAN.stepped, true);
  assert.equal(ARROW_REPLAN.holdFrames, 2);
  assert.deepEqual([...RELEASE_STEPS], ['prepare', 'tester-brain', 'plan-brain', 'tester-mirror', 'plan-mirror']);
  const w = walk({ released: 'brain' });
  assert.deepEqual(w.map(x => x.step), ['hold', 'hold', 'prepare', 'tester-brain', 'plan-brain']);
  // a pick before a frame's drawing repeats the step of the frame before (its work is done once): no step is skipped
  assert.deepEqual(w.map(x => x.pick), ['hold', 'hold', 'hold', 'prepare', 'tester-brain']);
  assert.deepEqual(w.map(x => x.last), [false, false, false, false, true], 'the brain\'s plan ends it');
  assert.deepEqual(w.map(x => x.hidden.brain), [true, true, true, true, false], 'the brain\'s arrows come back on the frame of its plan');
  assert.ok(w.every(x => x.hidden.mirror === false), 'the mirror body\'s tips stay where they are, shown');
});

test('UI3 item 1: a brain let go whose mirror tips must move: the mirror body is hidden from the decision and planned on its own frames', () => {
  const w = walk({ released: 'brain', mirrorPlanFrom: 1 }); // (decided on the 'prepare' step)
  assert.deepEqual(w.map(x => x.step), ['hold', 'hold', 'prepare', 'tester-brain', 'plan-brain', 'tester-mirror', 'plan-mirror']);
  assert.deepEqual(w.map(x => x.last), [false, false, false, false, false, false, true]);
  assert.deepEqual(w.map(x => x.hidden.mirror), [false, false, true, true, true, true, false], 'hidden while its old tips lie on the moved brain\'s motor areas');
  assert.deepEqual(w.map(x => x.hidden.brain), [true, true, true, true, false, false, false]);
});

test('UI3 item 1: the mirror body let go: the brain first (kept or planned), then the mirror body, each on its own frame', () => {
  const w = walk({ released: 'mirror' });
  assert.deepEqual(w.map(x => x.step), ['hold', 'hold', 'prepare', 'tester-brain', 'plan-brain', 'tester-mirror', 'plan-mirror']);
  assert.deepEqual(w.map(x => x.hidden.mirror), [true, true, true, true, true, true, false]);
  assert.ok(w.every(x => x.hidden.brain === false), 'the brain\'s tips are not hidden at a mirror release');
  assert.equal(w[w.length - 1].last, true);
});

test('UI3 item 1: the cursor moves once per drawn frame and only after the frames that hold', () => {
  assert.deepEqual(releaseCursorAt({ cursor: 0, at: -1, serial: 2, releaseAt: 0, hold: 2 }), { cursor: 0, at: -1 }, 'two frames after: still holding');
  assert.deepEqual(releaseCursorAt({ cursor: 0, at: -1, serial: 3, releaseAt: 0, hold: 2 }), { cursor: 1, at: 3 });
  assert.deepEqual(releaseCursorAt({ cursor: 1, at: 3, serial: 3, releaseAt: 0, hold: 2 }), { cursor: 1, at: 3 }, 'a second call in the same frame keeps the step');
  assert.deepEqual(releaseCursorAt({ cursor: 1, at: 3, serial: 4, releaseAt: 0, hold: 2 }), { cursor: 2, at: 4 });
  // the first step waits while the bodies move (the hand going back), at most holdMax frames; later steps do not wait
  assert.equal(ARROW_REPLAN.holdMax, 0, 'tried at 12, never held in the measured releases: off');
  assert.deepEqual(releaseCursorAt({ cursor: 0, at: -1, serial: 5, releaseAt: 0, hold: 2, still: false, holdMax: 12 }), { cursor: 0, at: -1 });
  assert.deepEqual(releaseCursorAt({ cursor: 0, at: -1, serial: 6, releaseAt: 0, hold: 2, still: true, holdMax: 12 }), { cursor: 1, at: 6 });
  assert.deepEqual(releaseCursorAt({ cursor: 0, at: -1, serial: 13, releaseAt: 0, hold: 2, still: false, holdMax: 12 }), { cursor: 1, at: 13 }, 'a look that keeps moving: at most holdMax');
  assert.deepEqual(releaseCursorAt({ cursor: 2, at: 7, serial: 8, releaseAt: 0, hold: 2, still: false, holdMax: 12 }), { cursor: 3, at: 8 }, 'once started, one step per frame');
  // the steps past the last say done (and last), and a cursor that is not a number ends the release
  assert.deepEqual(releaseStep(9, { released: 'brain' }), { step: 'done', last: true, hidden: { brain: false, mirror: false } });
  assert.equal(releaseStep(NaN, { released: 'mirror' }).last, true);
  assert.equal(releaseStep(0, { released: 'brain' }).step, 'hold');
  // the old spread stays behind ARROW_REPLAN.stepped false
  assert.deepEqual([1, 2, 3, 4].map(a => releasePlanStage(a, ARROW_REPLAN.spreadFrames)), ['hold', 'hold', 'prepare', 'plan']);
});

test('UI3 item 1: the scene builds the covers ahead on their steps and the plan uses them; no frame plans both items', () => {
  const src = readFileSync(new URL('../scene/src/ns-scene-three.mjs', import.meta.url), 'utf8');
  assert.match(src, /if \(!test\) test = sightFor\(cam\);/, 'the planner\'s sight lines take the cover built ahead');
  assert.match(src, /if \(rel\.step === 'tester-brain' && showB\) \{/);
  assert.match(src, /if \(arrowReleased === 'mirror' \|\| !B\.plan \|\| !at \|\| arrowCameraKey\(rc\) !== B\.planningCameraKey \|\| at\.some\(\(v, i\) => v !== c\[i\]\)\) sightAheadFor\(rc\);/);
  assert.match(src, /const bMay = rel\.stage === 'none' \? !heldNow : rel\.step === 'plan-all' \|\| rel\.step === 'plan-brain';/);
  assert.match(src, /const mMay = rel\.stage === 'none' \? !heldNow : rel\.step === 'plan-all' \|\| rel\.step === 'plan-mirror';/);
});

test('UI3 item 2: "behind you" waits while the box round the brain\'s points in front of the camera meets the picture', () => {
  assert.equal(BRAIN_LOST.boundsToo, true);
  assert.ok(Object.isFrozen(BRAIN_LOST));
  // the view from outside after a carry behind you: no sample point in the picture, but the brain round the camera
  assert.equal(brainSeenForTip({ share: 0, boundsMeet: true }), null);
  assert.equal(brainLostWords({ behind: true, seenShare: brainSeenForTip({ share: 0, boundsMeet: true }) }), null, 'no tip in the outside view');
  // the eye view after the same carry: every point behind the camera, so no box at all
  assert.equal(brainSeenForTip({ share: 0, boundsMeet: false }), 0);
  assert.equal(brainLostWords({ behind: true, seenShare: brainSeenForTip({ share: 0, boundsMeet: false }) }), 'behind', 'the tip in the eye view');
  // a share above 0 is passed on; nothing known stays nothing known; the rule of section 196 behind the switch
  assert.equal(brainSeenForTip({ share: 0.25, boundsMeet: true }), 0.25);
  assert.equal(brainSeenForTip({ share: null, boundsMeet: false }), null);
  assert.equal(brainSeenForTip({ share: NaN }), null);
  assert.equal(brainSeenForTip({ share: 0, boundsMeet: true, rules: { boundsToo: false } }), 0);
});

test('UI3 item 4: the lead sentence is whole, or left out whole when the short card would run over; never clamped', () => {
  assert.equal(INFO_WHOLE.on, true);
  assert.equal(leadSentenceMark({ overPx: 0 }), 'whole');
  assert.equal(leadSentenceMark({ overPx: 1 }), 'whole', 'a pixel of rounding is not running over');
  assert.equal(leadSentenceMark({ overPx: 17 }), 'drop');
  assert.equal(leadSentenceMark({ open: true, overPx: 300 }), 'whole', 'the opened card scrolls');
  assert.equal(leadSentenceMark({ shown: false, overPx: 40 }), 'whole', 'nothing to leave out');
  assert.equal(leadSentenceMark({ on: false, overPx: 40 }), null, 'off: the clamp of before');
  assert.equal(leadSentenceMark({ overPx: NaN }), 'whole');
  // the stylesheet: no clamp on a whole lead (also in the landscape short card, whose own clamp rule is stronger), and
  // a dropped one is not drawn
  const css = readFileSync(new URL('../scene/example/neurosurge.css', import.meta.url), 'utf8');
  assert.match(css, /\.ns-infopanel\[data-ns-lead="whole"\] \.ns-infopanel-plain \{ -webkit-line-clamp: unset; \}/);
  assert.match(css, /\.ns-app:not\(\[data-ns-unfold="true"\]\) \.ns-infopanel\[data-ns-lead="whole"\]:not\(:has\(\.ns-infopanel-detail\[open\]\)\) \.ns-infopanel-plain \{ -webkit-line-clamp: unset; \}/);
  assert.match(css, /\.ns-app:not\(\[data-ns-unfold="true"\]\) \.ns-infopanel\[data-ns-lead="drop"\]:not\(:has\(\.ns-infopanel-detail\[open\]\)\) \.ns-infopanel-plain \{ display: none; \}/);
});

test('UI3 item 3: the map card is an obstacle for the region labels only (the arrows keep their places)', () => {
  const src = readFileSync(new URL('../scene/src/ns-scene-three.mjs', import.meta.url), 'utf8');
  assert.match(src, /for \(const e of parent\.querySelectorAll\('\.ns-emap-card'\)\) \{\n\s+roWatch\(e\);/);
  assert.match(src, /hudRectCache\.push\(\{ x0: r\.left - o\.left, y0: r\.top - o\.top, x1: r\.right - o\.left, y1: r\.bottom - o\.top, quiet: true, emap: true \}\);/);
  assert.match(src, /if \(r\.info \|\| r\.orient \|\| r\.chip \|\| r\.quiet\) continue;/, 'arrowObstacles leaves the quiet boxes out');
});

test('UI3: the frame timer gives the last frames part by part, oldest first, only when asked', () => {
  let t = 0;
  const T = createFrameTimer({ now: () => t, window: 4 });
  const frame = (ms) => { T.begin(); for (const [p, d] of ms) { t += d; T.mark(p); } T.end(); };
  frame([['pick', 1], ['draw', 5]]);
  frame([['sim', 2], ['draw', 30]]);
  frame([['skin', 7], ['draw', 9]]);
  assert.deepEqual(T.recent(2), [{ frame: 2, totalMs: 32, ms: { sim: 2, draw: 30 } }, { frame: 3, totalMs: 16, ms: { skin: 7, draw: 9 } }]);
  assert.equal(T.recent(10).length, 3, 'no more than were drawn');
  frame([['draw', 4]]); frame([['draw', 6]]); // the ring of 4 wraps
  const r = T.recent(4);
  assert.deepEqual(r.map(f => f.frame), [2, 3, 4, 5]);
  assert.deepEqual(r.map(f => f.totalMs), [32, 16, 4, 6]);
  assert.deepEqual(T.recent(0), []);
  assert.ok(FRAME_PARTS.includes('draw'));
});

test('UI3 item 6: at Low the brain does not swell with the beat (its edges stepped a pixel), but it still beats', () => {
  assert.equal(LIVE_AT_LOW.swellAtLow, false);
  const low = QUALITY_LEVELS.length - 1;
  assert.equal(QUALITY_LEVELS[low].name, 'lite-0.6');
  assert.equal(liveRulesFor(0), BRAIN_LIVE, 'the full level swells as before');
  assert.equal(liveRulesFor(low - 1), BRAIN_LIVE, 'and every level above Low');
  const R = liveRulesFor(low);
  assert.equal(R.beat.swell, 0); assert.equal(R.beat.breathSwell, 0);
  // (22 November, the combined check of update 68: at Low the beat is carried by a stronger flush, LIVE_AT_LOW.flushAtLow,
  // because without the swell the brain no longer visibly beat)
  assert.equal(R.beat.flush, LIVE_AT_LOW.flushAtLow); assert.ok(R.beat.flush > BRAIN_LIVE.beat.flush * 3, 'a flush you can see');
  assert.equal(R.beat.slide, BRAIN_LIVE.beat.slide);
  assert.deepEqual(R.rate, BRAIN_LIVE.rate);
  assert.equal(liveRulesFor(low, { swellAtLow: true }), BRAIN_LIVE, 'the switch brings the swell back');
  // stepped over two seconds: the same beat and breath, no swell at Low
  const a = createBrainLive(), b = createBrainLive();
  let most = 0;
  for (let i = 0; i < 120; i++) {
    stepBeat(a, 1 / 60, 0, 0, BRAIN_LIVE); stepBeat(b, 1 / 60, 0, 0, R);
    assert.equal(b.beat, a.beat); assert.equal(b.breath, a.breath); assert.equal(b.swell, 0);
    most = Math.max(most, Math.abs(a.swell));
  }
  assert.ok(most > 0.001, `the full level swells (${most})`);
});

test('UI3: notes inside a part (the arrows, the overlay) are kept per frame beside the parts and never added to the total', () => {
  assert.deepEqual([...FRAME_NOTES], ['arrows', 'overlay']);
  let t = 0;
  const T = createFrameTimer({ now: () => t, window: 3 });
  T.begin(); t += 20; T.note('arrows', 6); T.note('overlay', 2); T.note('arrows', 1); T.note('nothing', 9); T.mark('draw'); T.end();
  T.begin(); t += 5; T.mark('draw'); T.end();
  T.note('arrows', 50); // outside a frame: ignored
  const r = T.recent(2);
  assert.deepEqual(r[0], { frame: 1, totalMs: 20, ms: { draw: 20 }, notes: { arrows: 7, overlay: 2 } });
  assert.deepEqual(r[1], { frame: 2, totalMs: 5, ms: { draw: 5 } }, 'a frame with no notes has none');
  assert.equal(T.state().totalMeanMs, 12.5, 'the totals are the parts only');
});
