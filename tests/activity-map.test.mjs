import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { TRACES, cueSeconds, loadForecast, tracePath } from '../scene/src/activity/replay.mjs';

test('source clip, biological measures and benchmark forecast targets share the recorded clock', async () => {
  const bytes = await readFile(new URL('../inputs/activity/wrist-pointing.json',import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'e50331490f2f2f33208e89c9a5f2679f08349c1030b9e5d2424e6bce955db59d');
  const clip = JSON.parse(bytes);
  assert.equal(clip.forecastInput.role,'development');
  assert.equal(clip.cueSourceRow,2587);
  assert.equal(clip.targetCodeAtCue,1);
  for (const trace of TRACES) {
    assert.equal(clip.series[trace.key].length,1537);
    assert.ok(clip.series[trace.key].every(Number.isFinite));
  }
  assert.deepEqual([cueSeconds(clip,0),cueSeconds(clip,256),cueSeconds(clip,1536)],[-0.5,0,2.5]);
  assert.equal(tracePath([-10,0,10],10),'M0.00,46.00 L300.00,23.00 L600.00,0.00');
  globalThis.window = globalThis;
  try {
    const rows = await loadForecast(clip);
    assert.deepEqual(rows.map(r => r.timeSeconds),[.75,1,1.25,1.5,1.75,2]);
    assert.ok(Math.abs(rows[1].forecasts.combined.meanDegrees[0] - (-26.0770713)) < .00001);
    assert.ok(Math.abs(rows[1].measuredDegrees[0] - (-16.1413493)) < .00001);
    const altered = structuredClone(clip);
    altered.series.wristExtension_deg[768] += 0.1;
    await assert.rejects(loadForecast(altered),/target and recording disagree/);
  } finally {
    delete globalThis.WristRecorded;
    delete globalThis.window;
  }
});
