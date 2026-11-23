import assert from 'node:assert/strict';
import test from 'node:test';
import {setImmediate} from 'node:timers/promises';
import {observeTarget} from '../scene/src/joint/landmark.mjs';
import {captureSource} from '../scene/src/joint/media.mjs';

const openComparison = () => ({packet: {issue: 2, lead: .12, point: 0}, closed: false});
const frame = (t, point = [12, 34]) => ({t, xy: [point]});

test('source capture selects the closest point even before a model reply exists', () => {
  const job = openComparison();
  observeTarget(job, frame(2.09));
  assert.equal(job.closed, false);
  observeTarget(job, frame(2.13, [33, 28]));
  assert.equal(job.closed, true);
  assert.equal(job.match.time, 2.13);
  assert.deepEqual(job.match.coordinates, [33, 28]);
  observeTarget(job, frame(2.14, [18, 21]));
  assert.equal(job.match.time, 2.13);
});

test('equally close points use the earlier captured frame', () => {
  const job = openComparison();
  observeTarget(job, frame(2.1));
  observeTarget(job, frame(2.14));
  assert.equal(job.closed, true);
  assert.equal(job.match.time, 2.1);
});

test('invalid points cannot end a usable window early or overwrite a tracked point', () => {
  const job = openComparison();
  const point = [12, 34];
  observeTarget(job, frame(2.09, point));
  point[0] = 900;
  assert.deepEqual(job.match.coordinates, [12, 34]);
  observeTarget(job, frame(2.124, null));
  assert.equal(job.closed, false);
  observeTarget(job, frame(2.138));
  assert.equal(job.closed, true);
  assert.equal(job.match.time, 2.138);
});

test('an exact 40 ms offset is usable and an older or later frame is excluded', () => {
  const edge = openComparison();
  observeTarget(edge, frame(2.16));
  assert.equal(edge.closed, true);
  assert.equal(edge.match.time, 2.16);
  const empty = openComparison();
  observeTarget(empty, frame(2));
  observeTarget(empty, frame(2.079));
  observeTarget(empty, frame(2.17));
  assert.equal(empty.closed, true);
  assert.equal(empty.match, undefined);
});

test('timed images just off the boundary or target retain their source times', () => {
  const atStart = () => ({packet: {issue: 0, lead: .12, point: 0}, closed: false});
  const closer = atStart();
  observeTarget(closer, frame(.11));
  observeTarget(closer, frame(.1299999995));
  assert.equal(closer.match.time, .1299999995);

  const outside = atStart();
  observeTarget(outside, frame(.1600000005));
  assert.equal(outside.closed, true);
  assert.equal(outside.match, undefined);

  const approaching = atStart();
  observeTarget(approaching, frame(.1199999995));
  assert.equal(approaching.closed, false);
  observeTarget(approaching, frame(.12));
  assert.equal(approaching.match.time, .12);
});

test('the mirror waits for the final tracker result and preserves seeks and tracker errors', async t => {
  let worker;
  function stub(name, value) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {value, configurable: true, writable: true});
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else delete globalThis[name];
    });
  }
  stub('document', {
    createElement: () => ({getContext: () => ({drawImage() {}})}),
  });
  stub('createImageBitmap', async () => ({close() {}}));
  stub('Worker', class {
    constructor() { worker = this; }
    postMessage(packet) {
      if (packet.type === 'init') queueMicrotask(() => this.onmessage({data: {type: 'ready'}}));
    }
    terminate() {}
  });
  const video = Object.assign(new EventTarget(), {
    videoWidth: 64, videoHeight: 64, ended: false, paused: false, seeking: false,
    async play() {},
    pause() {},
    load() {},
    removeAttribute() {},
    requestVideoFrameCallback(callback) { this.callback = callback; return 1; },
    cancelVideoFrameCallback() { this.callback = null; },
  });
  const events = [];
  let bodyRevision = 0;
  const capture = captureSource({
    kind: 'clip', video, clip: new Blob(['test']), waitForFinalFrame: true,
    getBodyRevision: () => bodyRevision,
    onFrame: frame => events.push(['frame', frame.t, frame.bodyRevision]),
    onReset: () => events.push(['reset']),
    onStatus() {},
    onError: error => events.push(['error', error]),
    onEnd: () => events.push(['end']),
  });
  try {
    await setImmediate();
    video.callback(0, {mediaTime: .5, presentedFrames: 5});
    await setImmediate();
    bodyRevision++;
    video.ended = true;
    video.dispatchEvent(new Event('ended'));
    assert.deepEqual(events, []);
    worker.onmessage({data: {type: 'pose', xy: []}});
    await setImmediate();
    assert.deepEqual(events, [['frame', .5, 0], ['end']]);

    video.ended = false;
    video.callback(0, {mediaTime: .8, presentedFrames: 8});
    await setImmediate();
    video.ended = true;
    video.dispatchEvent(new Event('ended'));
    video.ended = false;
    video.dispatchEvent(new Event('seeking'));
    worker.onmessage({data: {type: 'pose', xy: []}});
    await setImmediate();
    assert.deepEqual(events, [['frame', .5, 0], ['end'], ['reset']]);

    video.callback(0, {mediaTime: .9, presentedFrames: 9});
    await setImmediate();
    video.ended = true;
    video.dispatchEvent(new Event('ended'));
    worker.onmessage({data: {type: 'error', message: 'test failure'}});
    await setImmediate();
    assert.deepEqual(events, [['frame', .5, 0], ['end'], ['reset'], ['error', 'Local pose tracking failed: test failure']]);
  } finally {
    capture.stop();
  }
});
