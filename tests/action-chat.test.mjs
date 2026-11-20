import assert from 'node:assert/strict';
import test from 'node:test';
import { BODY_MOTOR_MAP, actionById } from '../scene/src/ns-bodymap.mjs';
import { resolveAction } from '../scene/src/ns-action-chat.mjs';

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
