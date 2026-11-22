/** Visual chunking (19 November 2026: "Things should be chunked together and those chunks should be spaced away from
 * each other"): the groups every overlay is built from. Pure software checks on supplied values; no browser. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTROLS_CARD_CHUNKS, controlsCardLabel, showControlsCard } from '../scene/src/ns-controls-card.mjs';
import { fakeDoc, all, hasClass } from './fake-doc.mjs';

test('the five-second controls card is four chunks: the W A S D pyramid, the E R pair, Space, the trackpad', () => {
  assert.deepEqual(CONTROLS_CARD_CHUNKS.map(c => c.id), ['wasd', 'er', 'space', 'pad']);
  assert.deepEqual(CONTROLS_CARD_CHUNKS[0].keys, [['W'], ['A', 'S', 'D']], 'W over A S D');
  assert.deepEqual(CONTROLS_CARD_CHUNKS[1].keys, [['E', 'R']], 'E and R together, apart from the pyramid');
  assert.deepEqual(CONTROLS_CARD_CHUNKS[3].acts.map(a => a[0]), ['Move', 'Click', 'Drag'], 'the trackpad and its three actions');
  const doc = fakeDoc(), host = doc.createElement('div');
  const card = showControlsCard({ host, doc, ms: 1234 });
  assert.ok(card && hasClass(card, 'ns-keys'), 'the card keeps the class its fade and the startup check use');
  assert.equal(card.style.props['--ns-keys-ms'], '1234ms');
  const chunks = all(card, e => hasClass(e, 'ns-ctl-chunk'));
  assert.equal(chunks.length, 4, 'four framed chunks and nothing loose');
  const keys = all(card, e => e.tagName === 'KBD').map(e => e.textContent);
  assert.deepEqual(keys, ['W', 'A', 'S', 'D', 'E', 'R', 'Space']);
  for (const k of all(card, e => e.tagName === 'KBD')) { let p = k.parentNode; while (p && !hasClass(p, 'ns-ctl-chunk')) p = p.parentNode; assert.ok(p, `${k.textContent} sits inside a chunk`); }
  const words = all(card, e => hasClass(e, 'ns-ctl-word')).map(e => e.textContent);
  // 20 November 2026 (the owner: "Let's just make spacebar grasping for all of the limbs at once"): Space's word is
  // 'grip' (it was 'hold'); a click presses.
  assert.deepEqual(words, ['move', 'view', 'info', 'grip'], 'one short word with each chunk (one per key for the pair)');
  assert.match(controlsCardLabel(), /W A S D move; E view; R info; Space grip; trackpad: move to look, click to press, drag to turn\./);
  assert.equal(showControlsCard({ host: null, doc: null }), null, 'no document: no card, no throw');
});

import { quietTipModel, tipTeachNow, TIP_TEACH_PRESSES, createQuietUi } from '../scene/src/ns-quiet.mjs';
import { TIP } from '../scene/src/ns-text.mjs';
import { BODY_MOTOR_MAP } from '../scene/src/ns-bodymap.mjs';

test('the tip is chunks: the name, then the choices as key caps in groups, the clicked row marked, one line for a newcomer', () => {
  const neck = BODY_MOTOR_MAP.regions.find(r => r.id === 'lh_neck');
  const moves = neck.actions.map((a, i) => ({ n: i + 1, id: a.id, label: a.plainLabel || a.label }));
  const model = quietTipModel({ area: neck, moves, actionId: neck.actions[1].id, teach: TIP.teach });
  assert.equal(model.teach, 'Click, or press a number');
  assert.notEqual(model.key, quietTipModel({ area: neck, moves, actionId: neck.actions[1].id }).key, 'the line is part of what is shown');
  assert.equal(quietTipModel({ area: neck, moves: [], teach: TIP.teach }).teach, undefined, 'nothing to choose: no line');
  assert.equal(quietTipModel({ pick: { name: 'left deltoid', kind: 'muscle' }, teach: TIP.teach }).teach, undefined, 'a muscle has no choices');
  const doc = fakeDoc(), root = doc.createElement('div');
  const ui = createQuietUi({ doc, root });
  ui.update({ tip: model, x: 100, y: 100, width: 1600, height: 900 });
  const groups = all(root, e => hasClass(e, 'ns-tip-row'));
  assert.deepEqual(groups.map(g => g.children.length), [2, 1, 1], 'bend forward / tilt back together; turn and tilt each alone');
  assert.ok(hasClass(groups[0], 'ns-tip-pair'));
  const rows = all(root, e => hasClass(e, 'ns-tip-move'));
  assert.equal(rows.length, 4);
  for (const r of rows) { assert.equal(r.children[0].tagName, 'KBD', 'each choice starts with its key cap'); assert.ok(hasClass(r.children[1], 'ns-tip-words')); }
  assert.deepEqual(rows.map(r => r.children[0].textContent), ['1', '2', '3', '4']);
  const marked = rows.filter(r => hasClass(r, 'ns-tip-now'));
  assert.equal(marked.length, 1);
  assert.equal(marked[0].children[1].textContent, 'Tilt head back');
  assert.equal(all(root, e => hasClass(e, 'ns-tip-click')).length, 1, 'only the row a click does carries the pointer mark');
  assert.ok(hasClass(marked[0].children[2], 'ns-tip-click'));
  const teach = all(root, e => hasClass(e, 'ns-tip-teach'))[0];
  assert.equal(teach.hidden, false);
  assert.equal(teach.textContent, TIP.teach);
  ui.update({ tip: quietTipModel({ area: neck, moves, actionId: neck.actions[1].id }), x: 100, y: 100, width: 1600, height: 900 });
  assert.equal(teach.hidden, true, 'the line goes when the caller stops passing it');
});

test('the newcomer line lasts for the first few presses of a motor area', () => {
  assert.equal(tipTeachNow(0), true);
  assert.equal(tipTeachNow(undefined), true);
  assert.equal(tipTeachNow(TIP_TEACH_PRESSES - 1), true);
  assert.equal(tipTeachNow(TIP_TEACH_PRESSES), false);
  assert.equal(tipTeachNow(40), false);
});

import { buildShellMenu, SETTINGS_DEFAULTS, sanitizeSettings } from '../scene/src/ns-app.mjs';
import { SHELL } from '../scene/src/ns-text.mjs';

test('the Esc page is a few titled groups: look and press, move, hold and carry, views and reading', () => {
  assert.deepEqual(SHELL.menu.map(g => g.title), ['Look and press', 'Move', 'Hold and carry', 'Views and reading']);
  for (const g of SHELL.menu) {
    assert.ok(g.rows.length >= 2 && g.rows.length <= 5, `${g.title}: a few rows, not a list`);
    // (22 November 2026, WORDS2, second pass: "Drag, arrow tips" is one row for two ways of the same thing: 16 characters)
    for (const [what, does] of g.rows) { assert.ok(what.length <= 16, `${g.title}: "${what}" is a key or one gesture`); assert.ok(does.length <= 32, `${g.title}: "${does}" is a few words`); }
  }
  const doc = fakeDoc(), card = doc.createElement('div');
  const menu = buildShellMenu(doc, card, SHELL.menu);
  assert.ok(hasClass(menu, 'ns-menu'));
  const groups = all(menu, e => hasClass(e, 'ns-menu-group'));
  assert.equal(groups.length, 4);
  for (const g of groups) {
    assert.equal(g.children[0].tagName, 'H3', 'each group has its title');
    assert.ok(hasClass(g.children[1], 'ns-menu-pic'), 'then one picture of its keys');
    assert.equal(g.children[2].tagName, 'DL', 'then its rows');
  }
  const keysOf = g => all(g, e => e.tagName === 'KBD').map(e => e.textContent);
  assert.deepEqual(keysOf(groups[1]), ['W', 'A', 'S', 'D'], 'the pyramid is its own group');
  assert.deepEqual(keysOf(groups[2]), ['Space']);
  assert.deepEqual(keysOf(groups[3]), ['E', 'R', 'M', 'Esc']); // (21 November 2026: M, the electrical map, on the Esc page; not on the five-second card)
  const words = all(menu, e => e.tagName === 'DD' || e.tagName === 'DT' || e.tagName === 'P').map(e => e.textContent).join(' ');
  assert.doesNotMatch(words, /1 to 9|row below/i, 'no sentence about a row of nine number keys');
  assert.equal(buildShellMenu(doc, card, null), null);
  assert.equal(SHELL.headings.paused, 'Paused');
  assert.equal(sanitizeSettings({ crosshairCaption: true }).crosshairCaption, true, 'a stored choice is still read');
  assert.equal(SETTINGS_DEFAULTS.crosshairCaption, false);
});
