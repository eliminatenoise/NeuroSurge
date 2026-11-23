import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { makeCamera, prepareClip, readManifest, readMotion, sourceFrame } from '../scene/src/activity/spatial-recording.mjs';

const dir = new URL('../assets/spatial-motion/',import.meta.url);
const fromFile = name => readFile(new URL(name,dir));
const load = async id => JSON.parse(await fromFile(id+'.json'));

// Values at three different times independently decoded from C3D byte offsets.
// 13_11 uses DEC header floats and scaled 16-bit points; the other two use IEEE float points.
const originals = {
  '02_06': {first:20,frames:559, marker:'RBWT', samples:[[-93.3,529.5,992.6],[-140.9,447.4,964.4],[48.1,387.6,1025.7]]},
  '13_11': {first:21,frames:104, marker:'LFHD', samples:[[-608,80.2,1717.9],[-590.3,91.9,1717.5],[529.6,57.9,1529.7]]},
  '132_23': {first:1,frames:187, marker:'NOSE', samples:[[-1417,-67.9,1676.7],[-1401.5,10.1,1665],[-926.9,92.3,1634.9]]}
};

test('all three real clips pass checksum, retain the original sample clock and reproduce C3D points',async t => {
  const fetch = t.mock.method(globalThis,'fetch',async url => new Response(await readFile(url)));
  const {clips} = await readManifest();
  assert.deepEqual(clips.map(row => row.id),Object.keys(originals));
  for (const entry of clips) {
    const clip = await readMotion(entry), check = originals[clip.id];
    assert.equal(clip.frames.length, check.frames);
    assert.equal(clip.markers.length,41);
    assert.equal(clip.markers[0],check.marker);
    assert.equal(sourceFrame(clip,0),check.first);
    assert.equal(sourceFrame(clip,80),check.first + 320);
    assert.equal(sourceFrame(clip,check.frames-1),clip.lastDisplayedSourceFrame);
    assert.deepEqual([0,20,80].map(i => clip.frames[i][0]),check.samples);
    const model = prepareClip(clip);
    assert.ok(model.edges.length >= 35);
    if (clip.id === '132_23') assert.ok(model.edges.every(pair => !pair.includes(clip.markers.indexOf('ANT'))));
  }
  fetch.mock.mockImplementation(async () => new Response(await fromFile('132_23.json')));
  await assert.rejects(readMotion(clips[0]),/checksum/);
});

test('orbit resolves the third dimension; following the waist preserves jump height and lab coordinates',async () => {
  const model = prepareClip(await load('13_11')), {clip} = model;
  const original = JSON.stringify(clip.frames);
  const lab = i => makeCamera(model,i,false,400,320,0,0);
  const follow = i => makeCamera(model,i,true,400,320,0,0);
  const waist = i => clip.frames[i][model.waist];
  assert.deepEqual(lab(0).project(waist(0)),lab(80).project(waist(0)));
  assert.notEqual(lab(0).project(waist(0))[0],lab(80).project(waist(80))[0]);
  assert.equal(follow(0).project(waist(0))[0],follow(80).project(waist(80))[0]);
  assert.notEqual(follow(0).project(waist(0))[1],follow(80).project(waist(80))[1]);
  const yTurn = makeCamera(model,0,false,400,320,90,0);
  const p1 = [0,100,100], p2 = [0,300,100];
  assert.deepEqual(lab(0).project(p1).slice(0,2),lab(0).project(p2).slice(0,2));
  assert.ok(Math.abs(yTurn.project(p1)[0]-yTurn.project(p2)[0]) > 10);
  assert.equal(JSON.stringify(clip.frames),original);
});

test('a missing sample breaks its guides and leaves the camera in place without filling in the marker',async () => {
  const clip = await load('13_11');
  for (const m of ['LFWT','RFWT','LBWT','RBWT']) clip.frames[5][clip.markers.indexOf(m)] = null;
  const model = prepareClip(clip);
  assert.ok(model.anchors.length);
  assert.deepEqual(model.anchors[4],model.anchors[5]);
  assert.equal(clip.frames[5][model.waist],null);
  const connected = model.edges.filter(([a,b]) => clip.frames[5][a] && clip.frames[5][b]);
  assert.ok(connected.length < model.edges.length);
  clip.frames[3][0] = [null,1,2];
  assert.throws(() => prepareClip(clip),/Invalid position/);
});
