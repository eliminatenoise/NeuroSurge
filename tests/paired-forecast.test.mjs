import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { pairedInput, pairedMeasurement, parsePairedClip } from '../scene/src/activity/paired-input.mjs';
import { createPairedPredictor } from '../scene/src/activity/paired/predictor.mjs';

test('six recorded windows reproduce the Python features and all three learned forecasts', async () => {
  const clip = await parsePairedClip(await readFile(new URL('../inputs/activity/wrist-pointing.json', import.meta.url)));
  const reference = JSON.parse(await readFile(new URL('./fixtures/paired-wrist.json', import.meta.url)));
  const modes = ['motion', 'emg', 'full'];
  const models = {};
  for (const mode of modes) {
    const raw = await readFile(new URL('../scene/src/activity/paired/weights/' + mode + '.bin', import.meta.url));
    models[mode] = await createPairedPredictor(mode, raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
  }
  for (const row of reference.rows) {
    const offset = row.target_offset_after_cue_ticks;
    const input = pairedInput(clip, offset);
    assert.deepEqual(pairedMeasurement(clip, offset), row.measured_deg);
    for (const [field, expected] of Object.entries(row.input_sha256_f64le)) {
      const values = input[field].flat(), buffer = Buffer.alloc(values.length * 8);
      values.forEach((v, i) => buffer.writeDoubleLE(v, i * 8));
      assert.equal(createHash('sha256').update(buffer).digest('hex'), expected, field);
    }
    for (const mode of modes) {
      const result = models[mode].predict(input), expected = row.predictions[mode];
      for (let axis = 0; axis < 2; axis++) {
        assert.ok(Math.abs(result.angle_deg[axis] - expected.angle_deg[axis]) < 0.00005);
        assert.ok(Math.abs(result.variance_deg2[axis] - expected.variance_deg2[axis]) <
          0.00005 + 0.000008 * expected.variance_deg2[axis]);
      }
    }
  }
});
