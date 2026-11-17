/** The quiet screen (ns-quiet): what the tip by the crosshair says and the prompt's short words. Pure software
 * checks on supplied values; no browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { quietTipModel, quietPromptText, tipMoveWords, TIP_MOVES_MAX } from '../scene/src/ns-quiet.mjs';
import { GUIDE } from '../scene/src/ns-text.mjs';
import { BODY_MOTOR_MAP } from '../scene/src/ns-bodymap.mjs';

test('a movement drops the part its area already names', () => {
  assert.equal(tipMoveWords('Bend left elbow', 'Left elbow'), 'Bend');
  assert.equal(tipMoveWords('Bend left thumb at the knuckle', 'Left thumb'), 'Bend at the knuckle');
  assert.equal(tipMoveWords('Turn left palm down', 'Left forearm turn'), 'Turn left palm down');
  assert.equal(tipMoveWords('Left elbow', 'Left elbow'), 'Left elbow');
  assert.equal(tipMoveWords('', 'Left elbow'), '');
});

test('the tip names the motor area and numbers its movements; a body part gets its name only', () => {
  const area = BODY_MOTOR_MAP.regions.find(r => r.id === 'rh_elbow');
  const moves = area.actions.map((a, i) => ({ n: i + 1, id: a.id, label: a.plainLabel || a.label, atEnd: i === 1 }));
  const t = quietTipModel({ area, moves, actionId: area.actions[0].id });
  assert.equal(t.kind, 'area');
  assert.equal(t.title, 'Left elbow');
  assert.deepEqual(t.rows, [{ n: 1, words: 'Bend', now: true, dim: false }, { n: 2, words: 'Straighten', now: false, dim: true }]);
  assert.notEqual(t.key, quietTipModel({ area, moves, actionId: null }).key, 'the marked movement is part of what is shown');
  const many = Array.from({ length: 12 }, (_, i) => ({ n: i + 1, id: `m${i}`, label: `Move ${i}` }));
  assert.equal(quietTipModel({ area, moves: many }).rows.length, TIP_MOVES_MAX);
  assert.deepEqual(quietTipModel({ pick: { name: 'left biceps brachii', kind: 'muscle' } }), { kind: 'muscle', title: 'Left biceps brachii', rows: [], key: 'p|left biceps brachii|muscle' });
  assert.equal(quietTipModel({ arrow: 'Turn the brain left' }).kind, 'arrow');
  assert.equal(quietTipModel({}), null);
  assert.equal(quietTipModel({ pick: { name: '' } }), null);
});

test('every guide goal and every alternative sentence has a short line', () => {
  for (const id of Object.keys(GUIDE.goals)) assert.ok(typeof GUIDE.short[id] === 'string' && GUIDE.short[id].length > 0 && GUIDE.short[id].length <= 48, `short line for ${id}`);
  for (const text of Object.values(GUIDE.partial)) assert.ok(typeof GUIDE.short.byText[text] === 'string' && GUIDE.short.byText[text].length <= 48, `short line for: ${text}`);
  assert.equal(quietPromptText({ visible: true, goalId: 'moveHand', text: GUIDE.goals.moveHand, nice: false }, GUIDE.short), 'Press W, A, S or D');
  assert.equal(quietPromptText({ visible: true, goalId: 'moveHand', text: GUIDE.partial.moveHandNeedX, nice: true }, GUIDE.short), 'Nice! Now A or D');
  assert.equal(quietPromptText({ visible: true, finished: true }, GUIDE.short), GUIDE.short.finished);
  assert.equal(quietPromptText({ visible: false, goalId: 'moveHand' }, GUIDE.short), '');
  assert.equal(quietPromptText(null, GUIDE.short), '');
});
