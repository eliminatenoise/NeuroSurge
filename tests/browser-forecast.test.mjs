import assert from 'node:assert/strict';
import { test } from 'node:test';
import { predictBrowserTask } from '../scene/src/joint/browser-forecast.mjs';
import { movementMirrorBackend } from '../scene/src/joint/route.mjs';

test('only the loopback game mount uses the Python model', () => {
  const routes = [
    ['http://127.0.0.1:9000/game/scene/example/preview.html', 'local-model'],
    ['http://[::1]:9000/game/movement-mirror.html', 'local-model'],
    ['http://localhost:9000/scene/example/preview.html', 'browser'],
    ['https://eliminatenoise.github.io/NeuroSurge/scene/example/preview.html', 'browser'],
    ['https://example.org/game/scene/example/preview.html', 'browser'],
    ['http://127.0.0.1.example.org/game/movement-mirror.html', null],
    ['http://example.org/game/scene/example/preview.html', null],
    ['file:///tmp/movement-mirror.html', null],
  ];
  for (const [url, backend] of routes) assert.equal(movementMirrorBackend(new URL(url)), backend);
});

test('the browser point forecast matches the published joint alpha example', () => {
  const history = [[
    [-.08, -.044, -.036, -.012, .456, .218, -.16, .12],
    [-.06, -.033, -.027, -.009, .467, .226, -.12, .12],
    [-.04, -.022, -.018, -.006, .478, .234, -.08, .12],
    [-.02, -.011, -.009, -.003, .489, .242, -.04, .12],
    [0, 0, 0, 0, .5, .25, 0, .12],
  ]];
  const result = predictBrowserTask('landmark_motion', history);
  assert.equal(result.checkpoint_sha256, 'f58dec8857015d84962aeb00259badf71b42d9bf7105cec35851a87826ed57d6');
  const expected = [.0009840498678386211, .0019239508546888828];
  for (const [i, value] of result.prediction[0].entries()) assert.ok(Math.abs(value - expected[i]) <= 2e-5);
  const missing = history[0].map(row => row.map(() => null));
  assert.throws(() => predictBrowserTask('landmark_motion', [missing]), /observed reading/);
  assert.throws(() => predictBrowserTask('human_touch_afferent', history), /supported browser forecast/);
});

test('the browser normalizes next-unit probabilities over the input candidates', () => {
  const candidates = [[[0, 0, 0, 0, 0]], [[0, 0, 0, 0, 0]], [[0, 0, 0, 0, 0]]];
  const [probabilities] = predictBrowserTask('rat_next_unit', [candidates]).prediction;
  assert.deepEqual(probabilities, [1 / 3, 1 / 3, 1 / 3]);
});
