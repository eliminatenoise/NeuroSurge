import assert from 'node:assert/strict';
import test from 'node:test';
import {namedReplayRequest, namedIntervalRequest, resolveTakeInterval, takeSeconds} from '../scene/src/camera/named-takes.mjs';
import { readFileSync } from 'node:fs';
import { BODY_MOTOR_MAP, actionById } from '../scene/src/ns-bodymap.mjs';
import { findBodyRecordings, resolveAction, resolveActionSequence, resolveReplay } from '../scene/src/ns-action-chat.mjs';

test('a named interval starts and ends on the source clock', () => {
  const request = namedIntervalRequest('Please replay the last .5 seconds of my take named First 2 trials.');
  assert.deepEqual(request, {range: 'the last .5 seconds', name: 'First 2 trials'});
  assert.deepEqual(resolveTakeInterval(request.range, 1500.25), {start: 1000.25, end: 1500.25});
  assert.deepEqual(resolveTakeInterval('from 0 to 1.001 seconds', 1001), {start: 0, end: 1001});
  assert.deepEqual(resolveTakeInterval('first 1 second', 1000), {start: 0, end: 1000});
  assert.equal(takeSeconds(1451.9), '1.451');
  for (const range of ['0 to 0 s', 'first 0 s', 'last 0 seconds', '1 to .9 s', '-1 to 1 s',
    'last 1.501 s', '1 to NaN s', '1e-3 to 1 s', '0 to 2 s', 'all', '.0001 to .5 s',
    'first 1 s then bend my knee', '0.2 0.4 seconds']) {
    assert.equal(resolveTakeInterval(range, 1500), null, range);
  }
});

test('commands target an actual movement on the named side', () => {
  for (const side of ['left', 'right']) {
    for (const [verb, part] of [['bend', 'knee'], ['straighten', 'knee'], ['bend', 'elbow'], ['extend', 'elbow'],
      ['flex', 'wrist'], ['extend', 'wrist'], ['open', 'hand'], ['close', 'hand'], ['spread', 'fingers']]) {
      const result = resolveAction('Please ' + verb + ' my ' + side + ' ' + part + '.', BODY_MOTOR_MAP);
      assert.equal(result.type, 'muscle');
      assert.equal(actionById(result.actionId).region.bodySide, side);
      assert.equal(actionById(result.actionId).region.id, result.regionId);
    }
  }
});
test('unsupported, compound, side-free or negated phrases do not move the body', () => {
  for (const words of ['do not bend left knee', 'bend knee', 'bend both elbows', 'bend left knee and open right hand',
    'bend my left right knee', 'walk', 'stop', 'w'.repeat(161), null]) assert.equal(resolveAction(words, BODY_MOTOR_MAP), null);
  assert.equal(resolveAction('bend right knee', null), null);
});

test('explicit replay requests open only one named recording', () => {
  assert.equal(resolveReplay('Please replay a forward jump.'), '13_11');
  assert.equal(resolveReplay('Replay the hop on my left foot'), '132_23');
  assert.equal(resolveReplay('Replay scoop and lift'), '02_06');
  for (const input of ['jump', 'do not replay a forward jump', 'replay the hop on my right foot',
    'replay a forward jump and bend my elbow', 'replay', null]) assert.equal(resolveReplay(input), null);
});

test('catalogue search retains movement order and every requested side or direction', () => {
  const {clips} = JSON.parse(readFileSync(new URL('../assets/spatial-motion/manifest.json', import.meta.url)));
  const ids = text => findBodyRecordings(text, clips).map(c => c.id);
  for (const clip of clips) {
    assert.deepEqual(ids(clip.label), [clip.id]);
    assert.deepEqual(ids(clip.description), [clip.id]);
  }
  assert.deepEqual(ids('Please show me hopping on my left foot.'), ['132_23']);
  assert.deepEqual(ids('left-foot hop'), ['132_23']);
  assert.deepEqual(ids('left foot'), ['132_23']);
  assert.deepEqual(ids('jumping forwards'), ['13_11']);
  assert.deepEqual(ids('scooping then lifting'), ['02_06']);
  for (const words of ['hop on my right foot', 'hop without the left foot', 'jump backwards', 'do not jump',
    'jump and bend my elbow', 'lift then scoop', 'jump twice', '-jump', 'right foot', 'the', '123', null]) {
    assert.deepEqual(ids(words), [], words);
  }
  assert.deepEqual(ids('   '), clips.map(c => c.id));
});

test('ordered commands resolve each clause to its own side and action', () => {
  const text = 'Please bend my left elbow, THEN extend my left elbow and then open your right hand.';
  const {steps} = resolveActionSequence(text, BODY_MOTOR_MAP);
  assert.deepEqual(steps.map(s => [s.action.regionId, s.action.actionId]), [
    ['rh_elbow', 'elbow_flexion'], ['rh_elbow', 'elbow_extension'], ['lh_hand', 'lh_r_open']
  ]);
  assert.equal(resolveActionSequence('bend my left elbow', BODY_MOTOR_MAP), null);
  const repeated = resolveActionSequence('flex right wrist then flex right wrist', BODY_MOTOR_MAP);
  assert.equal(repeated.steps.length, 2);
  for (const text of ['then bend left knee', 'bend left knee then', 'bend left knee then then straighten left knee',
    'flex left wrist then close hand', 'bend left knee then bend both knees', 'bend left knee then start camera',
    'record my take then bend left knee', 'open left hand then generate run', 'do not open left hand then bend right knee',
    'bend left knee then spin right elbow', Array(5).fill('bend left knee').join(' then ')]) {
    const result = resolveActionSequence(text, BODY_MOTOR_MAP);
    assert.ok(result.error && !result.steps, text);
  }
  assert.ok(resolveActionSequence('bend left knee then straighten left knee', null).error);
});

test('study cue names and palm directions select distinct movements on each named side', () => {
  for (const [side, elbowFlex, elbowExt, supination, pronation, open, close] of [
    ['right', 'lh_r_elbow_flex', 'lh_r_elbow_extend', 'lh_r_supinate', 'lh_r_pronate', 'lh_r_open', 'lh_r_grasp'],
    ['left', 'elbow_flexion', 'elbow_extension', 'supination', 'pronation', 'open_hand', 'grasp_close']
  ]) {
    for (const [cue, id] of [
      [side + ' elbow flexion', elbowFlex], [side + ' elbow extension', elbowExt],
      [side + ' forearm supination', supination], ['supinate my ' + side + ' forearm', supination],
      [side + ' forearm pronation', pronation], ['pronate my ' + side + ' forearm', pronation],
      ['turn my ' + side + ' palm up', supination], ['turn my ' + side + ' palm down', pronation],
      [side + ' hand open', open], [side + ' hand close', close]
    ]) {
      const action = resolveAction(cue, BODY_MOTOR_MAP);
      assert.equal(action.actionId, id, cue);
      assert.equal(actionById(id).region.bodySide, side);
      assert.equal(Boolean(action.isolateForearm), id === supination || id === pronation);
    }
  }
  for (const phrase of ['pronate forearm', 'right wrist pronation', 'roll right wrist', 'do not turn my right palm up',
    'turn both palms down', 'turn right palm sideways', 'imagine left forearm supination', 'left hand open and right hand close']) {
    assert.equal(resolveAction(phrase, BODY_MOTOR_MAP), null, phrase);
  }
});

test('a named replay has its own grammar and retains every word of the take name', () => {
  assert.equal(namedReplayRequest('Please replay MY take named My left bend.'), 'My left bend');
  assert.equal(namedReplayRequest('replay take named  Warm   Up!'), 'Warm Up');
  assert.equal(namedReplayRequest('replay the take named Café'), 'Café');
  assert.equal(namedReplayRequest('replay take named'), '');
  assert.equal(namedReplayRequest('replay take named up or down'), 'up or down');
  for (const other of [null, 'replay my take of both knees', 'replay my left arm take', 'do not replay take named bend',
    'bend my right elbow', 'generate run', 'replay forward jump']) assert.equal(namedReplayRequest(other), null);
});
