import assert from 'node:assert/strict';
import test from 'node:test';
import { BODY_MOTOR_MAP, actionById } from '../scene/src/ns-bodymap.mjs';
import { resolveAction, resolveReplay } from '../scene/src/ns-action-chat.mjs';

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
