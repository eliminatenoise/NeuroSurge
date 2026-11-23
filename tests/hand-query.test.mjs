import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createHandQuery } from '../scene/src/hand-search/hand-query.mjs';

const base = new URL('../assets/hand-search/',import.meta.url);
const json = async name => JSON.parse(await readFile(new URL(name,base),'utf8'));

test('three rankings match the original Python models and the recorded intervals', async () => {
  const manifest=await json('hand-query.json'), bytes=await readFile(new URL('hand-query.bin',base));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.sha256);
  const engine=createHandQuery(manifest,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const catalogue=await json('catalogue.json'), recording=await json('hand-recording.json');
  assert.equal(engine.recordingId,recording.recording);
  for (const [i,segment] of catalogue.segments.entries()) {
    const visual=recording.segments.find(s=>s.segmentId===segment.id);
    assert.equal(engine.segmentIds[i],segment.id);
    assert.deepEqual([segment.startSeconds,segment.endSeconds],[visual.start,visual.end]);
  }
  const pythonScores = {
  "ridge": [
    -0.27146890857599854,
    0.9000511320055968,
    -0.05011051827393734,
    0.21248434762048915,
    0.09594177302705412
  ],
  "attention": [
    -0.4667961597442627,
    0.5276793241500854,
    -0.141027569770813,
    -0.5534918308258057,
    0.46990811824798584
  ],
  "joint": [
    -0.011085942385687901,
    -0.004201032318954402,
    -0.009064091913251275,
    -0.012713277053957413,
    -0.015967280985689652
  ]
};
  for (const [method,scores] of Object.entries(pythonScores)) {
    const answer=engine.rank('press the button',method);
    assert.equal(answer.coverage.knownTokens,2);
    for (const result of answer.rows) {
      const expected=scores[engine.segmentIds.indexOf(result.segmentId)];
      assert.ok(Math.abs(result.score-expected)<0.000002,method+' '+result.segmentId);
      assert.equal(result.rankMin,1+scores.filter(s=>s>expected).length);
      assert.equal(result.rankMax,scores.filter(s=>s>=expected).length);
    }
  }
  assert.equal(engine.rank('qzxvw','ridge').coverage.allUnknown,true);
});
