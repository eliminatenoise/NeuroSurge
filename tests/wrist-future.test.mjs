import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {forecastWrist,inventedHistory} from '../scene/src/hand-search/wrist-future.mjs';

const file=new URL('../assets/hand-search/wrist-forecast-fit.json',import.meta.url);
const {spec,weights}=JSON.parse(await readFile(file,'utf8'));
const example={positions:inventedHistory,task:'gopro',cutoff:60,duration:3,words:['turn']};
test('the invented path reproduces the fitted one-second displacement without reading a future position',()=>{
  const guarded=new Proxy(example,{get(target,name){
    assert.ok(['positions','task','cutoff','duration','words'].includes(name),'unexpected input '+String(name));
    return target[name];
  }});
  const answer=forecastWrist(guarded,spec,weights);
  assert.ok(Math.abs(answer.recent-Math.sqrt(13))<1e-12);
  assert.ok(Math.abs(answer.withWords-6.9497159150431145)<1e-12);
  assert.ok(Math.abs(answer.removed-7.3105495561894696)<1e-12);
});
test('translation of all four positions keeps the scalar forecast unchanged',()=>{
  const moved=example.positions.map(p=>p.map((v,i)=>v+[100,13,-7][i]));
  const a=forecastWrist(example,spec,weights),b=forecastWrist({...example,positions:moved},spec,weights);
  assert.deepEqual(a,b);
});
test('word removal in the full model preserves other inputs; malformed or later speech is rejected',()=>{
  const a=forecastWrist({...example,words:[]},spec,weights);assert.equal(a.withWords,a.removed);
  for(const bad of [{duration:60},{words:['turn','turn']},{words:['friend']},{positions:[[1],[2],[3],[4]]}])
    assert.throws(()=>forecastWrist({...example,...bad},spec,weights));
});
