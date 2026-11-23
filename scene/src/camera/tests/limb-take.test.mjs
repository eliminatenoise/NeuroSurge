import test from 'node:test';
import assert from 'node:assert/strict';
import {createLimbTake, createTakeTimeline, createVideoTakeWindow} from '../limb-take.mjs';

const left = {bearing: [-0.3, 0.7, 0], upper: [-0.6, 0.2, 0], elbowDeg: 0};
const right = {r_shoulder_abd: 0, r_shoulder_flex: 0, r_elbow_flex: 18.265};

test('a selected playback interval preserves unequal source times, zero angles and per-side gaps', t => {
  let now = 0, callback;
  const events = [];
  const element = () => ({style: {}, setAttribute() {}, addEventListener() {}, append() {}});
  for (const [key, value] of Object.entries({
    document: {createElement: element},
    requestAnimationFrame: fn => { callback = fn; return 1; },
    cancelAnimationFrame: () => { callback = null; }
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, {value, configurable: true});
    t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
  }
  t.mock.method(performance, 'now', () => now);
  const ui = createLimbTake({panel:element(), onReplay() {}, emit(pose, side) {events.push([now, side, pose]);}});
  const left = {joints:{knee_ext_L: -12}}, right = {joints:{knee_ext_R: 0}};
  const both = {joints:{knee_ext_L: 0, knee_ext_R: -15}};
  const take = {name:'Both knees', limb:'bothKnees', duration:500, frames:[
    {time:100, pose:both}, {time:200, pose:left}, {time:280, pose:null},
    {time:330, pose:right}, {time:380, pose:both}, {time:451.25, pose:left}
  ]};
  const original = structuredClone(take);
  function play(start, end, times) {
    events.length = 0;
    now = 0;
    ui.play(take, 'Knees', {start, end});
    for (now of times) callback();
    assert.equal(ui.playing, false);
    return [...events];
  }
  assert.deepEqual(play(240, 380, [39, 40, 89, 90, 139, 140]), [
    [40, 'bothKnees', null], [90, 'bothKnees', right], [140, undefined, null]
  ]);
  assert.deepEqual(play(300, 330, [5, 80]), [[80, undefined, null]]);
  assert.deepEqual(play(101, 199, [0, 40, 98]), [[98, undefined, null]]);
  assert.deepEqual(play(0, 100, [99, 100]), [[100, undefined, null]]);
  assert.deepEqual(play(330, 500, [49, 50, 121.25, 170]), [
    [0, 'bothKnees', right], [50, 'bothKnees', both], [121.25, 'bothKnees', left], [170, undefined, null]
  ]);
  assert.deepEqual(take, original);
});

test('paired frames retain the acquisition timeline, anatomical sides and zero joint angles', () => {
  const t = createTakeTimeline('bothArms', 1000);
  const input = {leftArm: structuredClone(left), joints: {...right, knee_ext_L: -10}, pixels: [55]};
  t.observe(input, 999.5);
  t.observe(input, 1012.5);
  input.leftArm.bearing[0] = -1;
  input.joints.r_elbow_flex = 90;
  t.observe({leftArm: left}, 1100);
  t.observe(null, 1183.5);
  t.observe(null, 1190);
  t.observe({joints: right}, 1200);
  t.observe(input, 1200);
  t.observe(input, 1199);
  t.observe(input, 9000);
  const saved = t.finish(1259);
  assert.deepEqual(saved.frames.map(f => [f.time, f.pose]), [
    [12.5, {leftArm: left, joints: right}], [100, {leftArm: left}], [183.5, null], [200, {joints: right}]
  ]);
  assert.equal(saved.limb, 'bothArms');
  assert.deepEqual(saved.counts, [2, 2]);
  assert.equal(saved.count, 3);
  assert.equal(saved.duration, 259);
});

test('knee gaps are independent and insufficient evidence on either side cannot finish a pair', () => {
  const t = createTakeTimeline('bothKnees', 10);
  t.observe({joints: {knee_ext_R: 0}}, 12);
  t.observe({joints: {knee_ext_L: NaN, knee_ext_R: -110}}, 20);
  t.observe({joints: {knee_ext_L: -3.25, knee_ext_R: Infinity}}, 27.5);
  assert.equal(t.finish(30), null);
  t.observe({joints: {knee_ext_L: 0, knee_ext_R: -87, r_elbow_flex: 99}}, 100);
  assert.deepEqual(t.finish(110).frames.map(f => [f.time, f.pose.joints]), [
    [2, {knee_ext_R: 0}], [10, {knee_ext_R: -110}], [17.5, {knee_ext_L: -3.25}], [90, {knee_ext_L: 0, knee_ext_R: -87}]
  ]);
});

test('a delayed accepted frame supersedes a timeout it preceded; a genuine stale interval stays empty', () => {
  const t = createTakeTimeline('rightArm', 300);
  t.observe({joints: right}, 350);
  t.observe(null, 1550, true);
  t.observe({joints: right}, 350); // duplicate cannot remove the expiry
  t.observe({joints: right}, 1565);
  t.observe(null, 2765, true);
  t.observe({joints: right}, 2600); // the frame was already acquired at expiry
  t.observe(null, 3800, true);
  assert.deepEqual(t.finish(4000).frames.map(f => [f.time, !!f.pose]), [
    [50, true], [1250, false], [1265, true], [2300, true], [3500, false]
  ]);
});

test('four-limb takes preserve partial visibility on the original frame clock', () => {
  const timeline = createTakeTimeline('armsAndKnees', 1000);
  const all = {leftArm:left, joints:{...right,knee_ext_L:-92,knee_ext_R:0}};
  timeline.observe(all,1003.5);
  assert.equal(timeline.finish(1010), null);
  timeline.observe({joints:{...right,knee_ext_L:-89}},1112);
  timeline.observe({leftArm:left,joints:{knee_ext_R:-112}},1245.75);
  timeline.observe(null,1395);
  timeline.observe({joints:{knee_ext_L:0}},1488);
  const take = timeline.finish(1522);
  assert.deepEqual(take.counts,[2,2,3,2]);
  assert.equal(take.count,4);
  assert.deepEqual(take.frames.map(({time,pose}) => [time,pose]), [
    [3.5,all], [112,{joints:{...right,knee_ext_L:-89}}],
    [245.75,{leftArm:left,joints:{knee_ext_R:-112}}], [395,null], [488,{joints:{knee_ext_L:0}}]
  ]);
  const sparse = createTakeTimeline('armsAndKnees',0);
  sparse.observe({joints:{knee_ext_R:0}},2);
  assert.equal(sparse.finish(40), null);
  sparse.observe({joints:{knee_ext_R:-45}},130);
  assert.deepEqual(sparse.finish(150).counts, [0,0,0,2]);
});

test('the video take keeps only the recent source window and releases across missing frames', () => {
  const window = createVideoTakeWindow('rightArm', 1200);
  const pose = {joints:right};
  window.observe(pose, 0);
  window.observe(pose, 50);
  window.observe(pose, 2000, {rightArm:[.1,.2]});
  window.observe(pose, 2320, {rightArm:[.2,.3]});
  window.observe(null, 2320);
  window.observe(pose, 8010);
  const take = window.finish();
  assert.equal(window.hasSamples, true);
  assert.equal(take.duration, 7960);
  assert.deepEqual(take.frames.map(frame => [frame.time, frame.pose !== null]), [
    [0,true],[1200,false],[1950,true],[2270,true],[3470,false],[7960,true]
  ]);
  assert.deepEqual(take.frames[2].wrists, {rightArm:[.1,.2]});

  window.observe(null, 16020);
  assert.equal(window.hasSamples, false);
  assert.equal(window.finish(), null);
  assert.equal(take.frames.length, 6);
});

test('the last frame stays when the playhead is eight seconds from an older frame', () => {
  const window = createVideoTakeWindow('rightArm', 1200);
  const pose = {joints:right};
  for (const at of [1000, 1125, 9000]) window.observe(pose, at);
  window.advance(9100);
  assert.deepEqual(window.finish().frames.map(frame => frame.time), [0,1200,7875]);
  window.advance(10500);
  assert.equal(window.hasSamples, false);
  assert.equal(window.finish(), null);
});

test('a paired video take has two visible samples per limb in the current window', () => {
  const window = createVideoTakeWindow('bothArms', 1200);
  for (const at of [10, 160, 220]) window.observe({joints:right}, at);
  window.observe({leftArm:left}, 300);
  assert.equal(window.hasSamples, false);
  assert.equal(window.finish(), null);
  window.observe({leftArm:left}, 360);
  assert.equal(window.hasSamples, true);
  assert.deepEqual(window.finish().counts, [2,3]);
  window.advance(8160);
  assert.equal(window.hasSamples, false);
});
