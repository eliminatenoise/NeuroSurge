import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {categoriesFor, fictionalHistory, fingers, predictGrip} from '../scene/src/grip-preview/forecast.mjs';
import {gripCommand} from '../scene/src/grip-preview/panel.mjs';

const model = JSON.parse(readFileSync(new URL('../scene/src/grip-preview/weights.json', import.meta.url)));
const forecast = (instruction, preset='printer') => predictGrip(model, {...fictionalHistory(preset), instruction});

test('only the explicit grip command handles free wording; dictation can omit the colon', () => {
  assert.equal(gripCommand('Please preview grip: open the cover'), 'open the cover');
  assert.equal(gripCommand('PREVIEW grip don’t open the case'), 'don’t open the case');
  assert.equal(gripCommand('preview grip'), '');
  for (const text of ['open the cover','do not preview grip: open','preview grips','forecast my wrists'])
    assert.equal(gripCommand(text), null);
});

test('the generic lexicon keeps negation and order, skipping unrecognised and address-like tokens', () => {
  const got = categoriesFor("OPEN_2 reopen x9open open2 open@foo.test https://x/open àopen don’t open then close", model);
  assert.deepEqual(got.map(i => model.categories[i]), ['NEG','OPEN','THEN','CLOSE']);
  const a = forecast('close then open'), b = forecast('open then close');
  assert.notDeepEqual(a.ordered, b.ordered);
  assert.deepEqual(a.context, b.context);
  assert.deepEqual(forecast('zzzzz').ordered, forecast('xq 934').ordered);
  assert.deepEqual(forecast('zzzzz').categories, []);
  assert.notDeepEqual(forecast('open', 'camera').ordered, forecast('open').ordered);
});

test('portable example reproduces the reference for every finger and horizon', () => {
  const {ordered} = forecast('Open the lid then move left.');
  const expected = [[-2.0194085387727405,1.435775201930558],[-.3610531725119097,10.438262849273343],
    [1.4825020504968371,7.077287140590795],[1.170340709472816,7.427596760712852]];
  fingers.forEach((f, i) => ordered[f].forEach((v,h) => assert.ok(Math.abs(v - expected[i][h]) < 1e-10)));
});

test('missing finger stays missing and invalid clocks cannot produce a forecast', () => {
  const example = {...fictionalHistory('printer'), instruction:'close'};
  delete example.right_hand_history.ring;
  assert.deepEqual(predictGrip(model, example).ordered.ring, [null,null]);
  example.right_hand_history.middle.ticks_100ns[2] = 2;
  assert.throws(() => predictGrip(model, example), /advance/);
});
