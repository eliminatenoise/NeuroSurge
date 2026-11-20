import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { FOREARM, SCALP, FOREARM_TRACES, SCALP_TRACES, TRACES, EEG_LIMIT_UV,
  cueSeconds, loadClip, loadForecast, scalpColour, tracePath, wristPoint } from '../scene/src/activity/replay.mjs';

test('source clip, biological measures and benchmark forecast targets share the recorded clock', async () => {
  const bytes = await readFile(new URL('../inputs/activity/wrist-pointing.json',import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '578184a108d7682c37a4f409ce4cd7535b33d203007f39ca0f5d28831ffde41f');
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
    // Display-only voltage data (including the entire future interval) cannot
    // alter model outputs. It receives the frozen historical packet alone.
    const view = structuredClone(clip);
    for (const t of [...FOREARM_TRACES, ...SCALP_TRACES]) view.series[t.key].fill(1234);
    assert.deepEqual(await loadForecast(view), rows);
    view.forecastInput.rows[0].bins[0][2] += 1;
    await assert.rejects(loadForecast(view));
  } finally {
    delete globalThis.WristRecorded;
    delete globalThis.window;
  }
});

test('source identities, signed pairs and both wrist axes survive the sensor display', async () => {
  const clip = JSON.parse(await readFile(new URL('../inputs/activity/wrist-pointing.json',import.meta.url)));
  assert.deepEqual([clip.subject,clip.run,clip.trial,clip.firstSourceRow,clip.lastSourceRow], ['sub-41','03',1,2331,3867]);
  assert.equal(clip.montage.participantCoordinates, null);
  assert.deepEqual(clip.montage.scalp, ['C3','C1','Cz','C2','C4','CP3','CPz','CP4']);
  assert.deepEqual(SCALP.map(([id]) => id), clip.montage.scalp);
  assert.deepEqual(clip.montage.rightForearm, ['M1L','M1R','M2L','M2R','M3L','M3R','M4L','M4R']);
  assert.deepEqual(Object.keys(clip.series).sort(),
    [...SCALP_TRACES, ...FOREARM_TRACES, ...TRACES.slice(2)].map(t => t.key).sort());
  // EDF row 3099 read independently by byte offsets in its 8-sample records.
  assert.deepEqual(SCALP_TRACES.map(t => clip.series[t.key][768]), [10,9,3,3,1,19,7,1]);
  assert.deepEqual(clip.montage.rightForearm.map(id => clip.series['forearm'+id+'_uV'][768]), [7,40,33,31,43,31,15,34]);
  // Direct EDF byte offsets, independent of the converter. Include every
  // stored bioelectric word of this trial excerpt in label and time order.
  const channels = [...SCALP_TRACES.map(t => t.key), ...clip.montage.rightForearm.map(id => 'forearm'+id+'_uV')];
  const words = Buffer.alloc(1537 * 16 * 2);
  for (let i=0; i<1537; i++) channels.forEach((k,c) => words.writeInt16LE(clip.series[k][i], 2*(16*i+c)));
  assert.equal(createHash('sha256').update(words).digest('hex'),'dd0443a7446a6fa71d3764c515d19a40c44943b01dba80b11166c3a2215688d1');
  for (const t of [...SCALP_TRACES,...FOREARM_TRACES]) {
    assert.equal(clip.series[t.key].length, 1537);
    assert.ok(clip.series[t.key].every(Number.isInteger));
  }
  for (const [pair] of FOREARM) {
    const l = clip.series['forearm'+pair+'L_uV'], r = clip.series['forearm'+pair+'R_uV'];
    assert.deepEqual(clip.series['forearm'+pair+'Lminus'+pair+'R_uV'], l.map((v,i) => v-r[i]));
  }
  for (const t of SCALP_TRACES) assert.ok(clip.series[t.key].every(v => Math.abs(v) <= EEG_LIMIT_UV));
  assert.equal(scalpColour(0),'rgb(238,240,239)');
  assert.notEqual(scalpColour(-20),scalpColour(20));
  assert.deepEqual(wristPoint(0, 0), [126, 110]);
  assert.deepEqual(wristPoint(-60, 60), [39, 23]);
  assert.deepEqual(wristPoint(60, -60), [213, 197]);
});

test('an altered trial identity or relabelled montage cannot open under the original source pin', async t => {
  const bytes = await readFile(new URL('../inputs/activity/wrist-pointing.json',import.meta.url));
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(bytes));
  assert.equal((await loadClip()).trial,1);
  for (const alter of [clip => {clip.trial=2;}, clip => {clip.montage.scalp.reverse();}]) {
    const clip = JSON.parse(bytes);
    alter(clip);
    fetch.mock.mockImplementation(async () => new Response(JSON.stringify(clip)));
    await assert.rejects(loadClip(), /checksum/);
  }
});
