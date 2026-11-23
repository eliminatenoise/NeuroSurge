import assert from 'node:assert/strict';
import test from 'node:test';
import {createShellState, shellReduce, shellToastText} from '../scene/src/ns-app.mjs';

test('starting and resuming show drag-to-look instructions with a free pointer', () => {
  const ready = shellReduce(createShellState(), {type:'ready'});
  assert.equal(ready.mode, 'playing');
  assert.equal(ready.unlockedPlay, true);
  assert.match(shellToastText(ready), /Drag empty space/);
  const paused = shellReduce(ready, {type:'esc', atMs:0});
  const resumed = shellReduce(paused, {type:'playUnlocked'});
  assert.equal(resumed.mode, 'playing');
  assert.equal(resumed.unlockedPlay, true);
  assert.equal(resumed.locked, false);
});

test('an explicit capture can fail or release back to free play', () => {
  const ready = shellReduce(createShellState(), {type:'ready'});
  const paused = shellReduce(ready, {type:'pause'});
  const requested = shellReduce(paused, {type:'play'});
  assert.equal(requested.unlockedPlay, false);
  const refused = shellReduce(requested, {type:'lockError'});
  assert.equal(refused.mode, 'playing');
  assert.equal(refused.unlockedPlay, true);
  assert.match(shellToastText(refused), /Mouse capture unavailable/);

  const captured = shellReduce(requested, {type:'locked'});
  assert.equal(captured.locked, true);
  assert.equal(shellToastText(captured), '');
  const released = shellReduce(captured, {type:'unlocked', atMs:1000});
  assert.equal(released.mode, 'paused');
  const resumed = shellReduce(released, {type:'esc', atMs:2000});
  assert.equal(resumed.mode, 'playing');
  assert.equal(resumed.unlockedPlay, true);
  assert.match(shellToastText(resumed), /Drag empty space/);
});
