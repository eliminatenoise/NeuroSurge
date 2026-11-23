import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {forecastReach} from '../scene/src/activity/reach-feedback/predict.mjs';
import {integrity} from '../scene/src/activity/reach-feedback/assets.mjs';

function asset(name) {
  const file = readFileSync(new URL('../scene/src/activity/reach-feedback/' + name + '.json', import.meta.url));
  assert.equal('sha256-' + createHash('sha256').update(file).digest('base64'), integrity[name]);
  return JSON.parse(file);
}
const models = asset('models'), recordings = asset('recordings');
const reference = JSON.parse(readFileSync(new URL('reach-feedback-reference.json', import.meta.url)));
for (const split of ['within','transfer']) {
  test(split + ' held reach matches the fitted primary models on every movement coordinate and later count', () => {
    const output = forecastReach(recordings[split].history, models);
    for (const [field, matrix] of Object.entries(output)) {
      const oracle = reference[split][field];
      assert.equal(matrix.length, 10);
      for (const [i, row] of matrix.entries()) {
        assert.equal(row.length, field === 'movement' ? 8 : 23);
        for (const [j, v] of row.entries()) assert.ok(Math.abs(v - oracle[i][j]) < 2e-5, field + ' at ' + [i,j]);
      }
    }
  });
}
test('a mismatched recorded unit order or fractional observed count is rejected', () => {
  const h = structuredClone(recordings.within.history);
  h.spikes[0][0] += .5;
  assert.throws(() => forecastReach(h, models), /recorded count/);
  h.spikes[0][0] -= .5;
  h.unit_guide.reverse();
  assert.throws(() => forecastReach(h, models), /unit order/);
});
