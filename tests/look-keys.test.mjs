// 25 November 2026 (hunt of update 78, finding 3: with the keyboard alone no key turned the look). Arrow Up and Arrow
// Down turn the look a fixed step, as a drag of the view does (ns-controls LOOK_KEY). The pure parts: the step, the
// pitch range, the look's time, the key binding's repeat gate, and the words that list the keys. What the step does in
// the game (the chosen limb follows in the eye view, the tutorial's look step, the mark on the mirror body) is checked
// in the browser (tests/browser-keyboard-only.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createControls, bindDom, LOOK_CODES, LOOK_KEY, lookKeyDir, areaKeyDir, AREA_KEY_REPEAT_MS, keyStaysWithControl, keyScrollBox } from '../scene/src/ns-controls.mjs';
import { SHELL, GUIDE, TIP, HUD, otherAreaKey } from '../scene/src/ns-text.mjs';
import { KEYBOARD_PICTURE_ROWS, lostViewTurn, arrowKeysClass, buildShellMenu } from '../scene/src/ns-app.mjs';
import { fakeDoc, all } from './fake-doc.mjs';

const DEG = Math.PI / 180;
const near = (a, b, eps = 1e-12) => Math.abs(a - b) <= eps;

test('the look keys: Arrow Up looks up, Arrow Down looks down, 3 degrees a press, held at the area keys\' pace', () => {
  assert.deepEqual([...LOOK_CODES], ['ArrowUp', 'ArrowDown']);
  assert.equal(lookKeyDir('ArrowUp'), 1);
  assert.equal(lookKeyDir('ArrowDown'), -1);
  for (const other of ['ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'Space', 'PageUp', '', null, undefined]) assert.equal(lookKeyDir(other), 0, String(other));
  for (const code of LOOK_CODES) assert.equal(areaKeyDir(code), 0, 'no arrow key is both');
  assert.equal(LOOK_KEY.stepDeg, 3);
  assert.equal(LOOK_KEY.repeatMs, AREA_KEY_REPEAT_MS);
});

test('a press turns the pitch by the step as a look of the player\'s; the yaw stays; the range holds; nothing else turns it', () => {
  const c = createControls();
  const s0 = c.setLook(c.initialState(), { yaw: 0.3, pitch: -0.4 });
  const up = c.lookKey(s0, 1, 1000);
  assert.ok(near(up.pitch, -0.4 + 3 * DEG), `up ${up.pitch}`);
  assert.equal(up.yaw, 0.3);
  assert.equal(up.lookMs, 1000, 'the look\'s time is the press\'s: the chosen limb and the aim take it as the player\'s look');
  const down = c.lookKey(up, -1, 1300);
  assert.ok(near(down.pitch, -0.4), `down ${down.pitch}`);
  assert.equal(down.lookMs, 1300);
  assert.notEqual(up, s0, 'a new state');
  assert.deepEqual(s0.pitch, -0.4, 'the state given is not changed');
  // invert-Y and the look speed are the mouse's settings: a key names a direction on the screen and a fixed step
  const inverted = c.setLookOptions(s0, { invertY: true, sensitivity: 4 });
  assert.ok(near(c.lookKey(inverted, 1, 1).pitch, -0.4 + 3 * DEG));
  // the pitch range: clamped, and at its end the same state (the key is then not taken from the page)
  const lim = c.setPitchLimits(c.initialState(), { minDeg: -10, maxDeg: 10 });
  const top = c.setLook(lim, { yaw: 0, pitch: 9 * DEG });
  const atTop = c.lookKey(top, 1, 5);
  assert.ok(near(atTop.pitch, 10 * DEG));
  assert.equal(c.lookKey(atTop, 1, 6), atTop, 'at the end of the range nothing changes');
  assert.notEqual(c.lookKey(atTop, -1, 7), atTop, 'the other key still turns');
  for (const dir of [0, 2, -2, NaN, null, undefined]) assert.equal(c.lookKey(s0, dir, 1), s0, `dir ${dir}`);
  // no event is queued: the look is a state, as the mouse's is
  assert.deepEqual(up.events, []);
  assert.deepEqual(up.ui, []);
});

/** A small DOM stand-in: the canvas, its document and window, with key events emitted to their listeners. */
function bound(controls, { playing = () => true, styles = null } = {}) {
  const bucket = () => { const L = new Map(); return { addEventListener: (t, f) => { if (!L.has(t)) L.set(t, new Set()); L.get(t).add(f); }, removeEventListener: (t, f) => L.get(t)?.delete(f), emit: (t, x = {}) => { let prevented = false; for (const f of [...(L.get(t) || [])]) f({ preventDefault() { prevented = true; }, ...x }); return { prevented }; } }; };
  const view = bucket(), doc = bucket(), canvas = bucket();
  view.performance = { now: () => 50_000 }; doc.defaultView = view; canvas.ownerDocument = doc; doc.pointerLockElement = null;
  doc.body = { ownerDocument: doc, parentElement: null }; doc.documentElement = { ownerDocument: doc, parentElement: null }; doc.body.parentElement = doc.documentElement;
  canvas.parentElement = doc.body;
  if (styles) view.getComputedStyle = el => styles.get(el) || { overflowX: 'visible', overflowY: 'visible' };
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400 });
  let st = controls.initialState();
  const gated = { ...controls, lookKey: (s, d, t) => (playing() ? controls.lookKey(s, d, t) : s) };
  const unbind = bindDom(canvas, gated, () => st, n => { st = n; }, {});
  return { view, doc, canvas, state: () => st, unbind, key: (type, code, timeStamp, x = {}) => view.emit(type, { target: canvas, code, timeStamp, repeat: false, ...x }) };
}

test('through the key binding: a press steps and is taken; a held key steps again only past the gate; a release ends the hold', () => {
  const c = createControls(), b = bound(c);
  try {
    const p0 = b.state().pitch;
    assert.equal(b.key('keydown', 'ArrowUp', 1000).prevented, true, 'the press is taken from the page');
    assert.ok(near(b.state().pitch, p0 + 3 * DEG));
    assert.equal(b.key('keydown', 'ArrowUp', 1100, { repeat: true }).prevented, true, 'a repeat inside the gate: taken, no step');
    assert.ok(near(b.state().pitch, p0 + 3 * DEG));
    b.key('keydown', 'ArrowUp', 1000 + LOOK_KEY.repeatMs, { repeat: true });
    assert.ok(near(b.state().pitch, p0 + 6 * DEG), 'a repeat past the gate steps again');
    b.key('keyup', 'ArrowUp', 1400);
    b.key('keydown', 'ArrowUp', 2000, { repeat: true });
    assert.ok(near(b.state().pitch, p0 + 6 * DEG), 'a repeat with no press taken first does nothing');
    b.key('keydown', 'ArrowDown', 2100);
    assert.ok(near(b.state().pitch, p0 + 3 * DEG), 'Arrow Down looks down');
    assert.equal(b.state().lookMs, 2100);
    b.key('keydown', 'ArrowDown', 2150, { altKey: true });
    assert.ok(near(b.state().pitch, p0 + 3 * DEG), 'never with Alt');
  } finally { b.unbind(); }
});

test('the binding: on a focused game button the arrows are the game\'s; in a text field or the pause page they are not; not playing, not taken', () => {
  const button = { closest: sel => (/button/.test(sel) ? button : null) };
  assert.equal(keyStaysWithControl(button, 'ArrowUp'), false, 'a limb button with the focus leaves the look keys to the game');
  const c = createControls();
  let playing = false;
  const b = bound(c, { playing: () => playing });
  try {
    const p0 = b.state().pitch;
    assert.equal(b.key('keydown', 'ArrowUp', 1000).prevented, false, 'not playing: the page keeps its arrow key (it may scroll)');
    assert.equal(b.state().pitch, p0);
    playing = true;
    b.key('keydown', 'ArrowDown', 1100, { target: button });
    assert.ok(near(b.state().pitch, p0 - 3 * DEG), 'with the focus on a limb button');
    const field = { closest: sel => (/input/.test(sel) ? field : null) };
    assert.equal(b.key('keydown', 'ArrowDown', 1500, { target: field }).prevented, false);
    assert.ok(near(b.state().pitch, p0 - 3 * DEG), 'a text field keeps the key');
    // a safety release (focus lost) ends the hold: the next repeat waits for a fresh press
    b.key('keydown', 'ArrowDown', 2000);
    b.view.emit('blur', { timeStamp: 2050 });
    const before = b.state().pitch;
    b.key('keydown', 'ArrowDown', 2000 + 2 * LOOK_KEY.repeatMs, { repeat: true });
    assert.equal(b.state().pitch, before);
  } finally { b.unbind(); }
});

test('every list of the keys names the up and down arrow keys, and the tutorial\'s look step names them', () => {
  const full = Object.fromEntries(SHELL.controls), short = Object.fromEntries(SHELL.introControls);
  assert.match(full['↑ / ↓'], /look a little up or down/);
  assert.match(full['↑ / ↓'], /chosen limb follows/);
  assert.match(short['↑ / ↓'], /look up or down/);
  const rows = Object.fromEntries(SHELL.menu.flatMap(g => g.rows));
  assert.equal(rows['← → / ↑ ↓'], 'next area / look up or down');
  assert.equal(SHELL.menu.find(g => g.id === 'look').rows.length, 5, 'the group keeps five rows');
  assert.equal(SHELL.keyboard.keys.ArrowUp, 'look');
  assert.equal(SHELL.keyboard.keys.ArrowDown, 'look');
  assert.match(SHELL.keyboard.label, /up and down arrow keys turn your look/);
  assert.deepEqual([...KEYBOARD_PICTURE_ROWS.find(r => r.row === 'space').keys], ['Space', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight']);
  // (the short card shows the two signs as key caps, kept on one line by a no-break space; the long line of the full
  // reading level has no caps, so it names the keys in words)
  assert.match(GUIDE.short.aimJoint, /\(↑\u00a0↓\)/);
  assert.match(GUIDE.tutorialGoals.aimJoint, /the up or down arrow key/);
  assert.doesNotMatch(GUIDE.tutorialGoals.aimJoint, /[↑↓]/);
  // (and the start page's short words name only the two keys that step to an area)
  assert.match(SHELL.introInstructions.join(' '), /The left and right arrow keys step to the next area\./);
  assert.doesNotMatch(SHELL.introInstructions.join(' '), /The arrow keys step/);
});

/** A small element tree for keyScrollBox: { el, styles } with el.parentElement links up to the page's body. */
function tree() {
  const doc = { body: null, documentElement: null };
  const node = (parentElement, o = {}) => ({ ownerDocument: doc, parentElement, scrollHeight: 100, clientHeight: 100, scrollWidth: 100, clientWidth: 100, getClientRects: () => [{}], ...o });
  doc.documentElement = node(null); doc.body = node(doc.documentElement);
  const styles = new Map();
  doc.defaultView = { getComputedStyle: el => styles.get(el) || { overflowX: 'visible', overflowY: 'visible' } };
  return { doc, node, styles };
}

test('keyScrollBox: the box the browser scrolls with the up and down arrows from an element: a box that scrolls and holds more than it shows', () => {
  const { doc, node, styles } = tree();
  const card = node(doc.body, { scrollHeight: 1105, clientHeight: 592 }), fold = node(card), words = node(fold);
  styles.set(card, { overflowX: 'hidden', overflowY: 'auto' });
  assert.equal(keyScrollBox(words, 'y'), card, 'from deep inside the card');
  assert.equal(keyScrollBox(card, 'y'), card, 'from the card itself');
  assert.equal(keyScrollBox(words, 'x'), null, 'it does not scroll sideways');
  // a card that holds all it has (the short card), one hidden, or one that clips without scrolling: none
  card.scrollHeight = 593; assert.equal(keyScrollBox(words), null, '1 px more is not a scroll');
  card.scrollHeight = 1105; card.getClientRects = () => []; assert.equal(keyScrollBox(words), null, 'a card not drawn');
  card.getClientRects = () => [{}]; styles.set(card, { overflowX: 'hidden', overflowY: 'hidden' }); assert.equal(keyScrollBox(words), null, 'overflow hidden');
  styles.set(card, { overflowX: 'hidden', overflowY: 'scroll' }); assert.equal(keyScrollBox(words), card, 'overflow scroll');
  // the page itself never counts, and nothing at all is no box
  styles.set(doc.body, { overflowX: 'auto', overflowY: 'auto' }); doc.body.scrollHeight = 5000;
  const loose = node(doc.body);
  assert.equal(keyScrollBox(loose), null);
  for (const v of [null, undefined, {}, { parentElement: null }]) assert.equal(keyScrollBox(v), null);
});

test('the binding: a long card with the focus in it, or pressed last, keeps the up and down arrows; a press on the picture gives them back', () => {
  const c = createControls();
  const styles = new Map();
  const b = bound(c, { styles });
  try {
    const card = { ownerDocument: b.doc, parentElement: b.doc.body, scrollHeight: 1105, clientHeight: 592, getClientRects: () => [{}] };
    const fold = { ownerDocument: b.doc, parentElement: card, closest: sel => (/summary/.test(sel) ? fold : null) };
    const text = { ownerDocument: b.doc, parentElement: card };
    styles.set(card, { overflowX: 'hidden', overflowY: 'auto' });
    const p0 = b.state().pitch;
    // the focus on the card's fold (a keyboard player's Tab): the browser scrolls the card
    assert.equal(b.key('keydown', 'ArrowDown', 1000, { target: fold }).prevented, false, 'the page keeps the key');
    assert.equal(b.state().pitch, p0, 'and the look does not turn');
    assert.equal(b.key('keydown', 'ArrowDown', 1000 + LOOK_KEY.repeatMs, { target: fold, repeat: true }).prevented, false, 'a held key too');
    assert.equal(b.state().pitch, p0);
    // the left and right arrows still walk the strip from there (section 217): this rule is the up and down arrows'
    assert.equal(b.key('keydown', 'ArrowRight', 1500, { target: fold }).prevented, true, 'Arrow Right with the focus on the fold');
    // a click on the card's words, then the key with the focus on the page's body: the card keeps it
    b.doc.emit('pointerdown', { target: text });
    assert.equal(b.key('keydown', 'ArrowUp', 2000, { target: b.doc.body }).prevented, false);
    assert.equal(b.state().pitch, p0, 'after a click on the card');
    // a press on the picture gives the keys back to the look
    b.doc.emit('pointerdown', { target: b.canvas });
    assert.equal(b.key('keydown', 'ArrowUp', 3000, { target: b.doc.body }).prevented, true);
    assert.ok(near(b.state().pitch, p0 + 3 * DEG), 'the look turns again');
    // a card that holds all it has (the short card) keeps nothing, with the focus in it or pressed last
    card.scrollHeight = 592;
    b.doc.emit('mousedown', { target: text });
    b.key('keydown', 'ArrowDown', 4000, { target: b.doc.body });
    assert.ok(near(b.state().pitch, p0), 'a card that does not scroll leaves the key to the look');
    b.key('keydown', 'ArrowDown', 5000, { target: fold });
    assert.ok(near(b.state().pitch, p0 - 3 * DEG));
    // a card pressed last that has gone from the page keeps nothing either
    card.scrollHeight = 1105; text.isConnected = false;
    b.doc.emit('pointerdown', { target: text });
    b.key('keydown', 'ArrowUp', 6000, { target: b.doc.body });
    assert.ok(near(b.state().pitch, p0), 'a pressed element no longer on the page');
  } finally { b.unbind(); }
});

test('the lost view names the arrow key that turns back the way the look went', () => {
  const home = { yaw: 0, pitch: -0.4451 };
  assert.equal(lostViewTurn({ yaw: 0, pitch: 1.5533 }, home), 'up', 'held up to the top of the range');
  assert.equal(lostViewTurn({ yaw: 0.2, pitch: -1.5 }, home), 'down');
  assert.equal(lostViewTurn({ yaw: 1.4, pitch: -0.2 }, home), 'side');
  assert.equal(lostViewTurn({ yaw: 2 * Math.PI + 0.1, pitch: 0.6 }, home), 'up', 'a whole turn round counts as none');
  assert.equal(lostViewTurn({ yaw: 0.9, pitch: 0.6 }, home), 'up', 'more up than to the side');
  for (const [look, h] of [[null, home], [{ yaw: 0, pitch: 1 }, null], [{ yaw: NaN, pitch: 1 }, home]]) assert.equal(lostViewTurn(look, h), 'side');
  assert.match(TIP.viewLostUp.hint, /press ↓, ← or →/);
  assert.match(TIP.viewLostDown.hint, /press ↑, ← or →/);
  assert.match(TIP.viewLost.hint, /press ← or →/);
  for (const t of [TIP.viewLostUp, TIP.viewLostDown]) { assert.equal(t.title, TIP.viewLost.title); assert.match(t.hint, /Esc, then Reset brain view, also turns you back\./); }
});

test('a key cell of arrow signs only is drawn larger on the Esc page (arrowKeysClass)', () => {
  for (const k of ['← → / ↑ ↓', '← / →', '↑ / ↓', '↑']) assert.equal(arrowKeysClass(k), 'ns-keys-arrows', k);
  for (const k of ['W S', 'Drag, arrow tips', 'Shift + press', '', '/', 'Orbit arrows', '1 / 2', null]) assert.equal(arrowKeysClass(k), '', String(k));
  const doc = fakeDoc(), card = doc.createElement('div');
  const menu = buildShellMenu(doc, card, SHELL.menu);
  const dts = all(menu, e => e.tagName === 'DT');
  assert.deepEqual(dts.filter(e => e.className === 'ns-keys-arrows').map(e => e.textContent), ['← → / ↑ ↓']);
  assert.ok(dts.filter(e => e.textContent !== '← → / ↑ ↓').every(e => e.className === ''), 'no other row');
});

// A review: with Arrow Up and Arrow Down turning the look, "Press the other arrow key" (the walk's end, in the tip and the
// full card) could be read as one of them, and "then press the arrow key" (while something is held) named none.
test('the words at the end of an area walk name the key that walks back; the words while holding name ← and →', () => {
  assert.equal(otherAreaKey(areaKeyDir('ArrowRight')), '←');
  assert.equal(otherAreaKey(areaKeyDir('ArrowLeft')), '→');
  assert.equal(otherAreaKey(0), '← or\u00a0→', 'the direction not known');
  assert.equal(TIP.areaEnd(1), 'No more areas this way. Press\u00a0← to go back.', 'no line ends between the word and its key');
  assert.equal(TIP.areaEnd(-1), 'No more areas this way. Press\u00a0→ to go back.');
  assert.match(HUD.areaEnd(1), /^No more motor areas that way from here\. Press\u00a0← to go back, or turn the brain/);
  assert.match(HUD.areaEnd(-1), /Press\u00a0→ to go back/);
  assert.match(HUD.areaUnreachable(1), /press\u00a0← to go the other way/);
  assert.match(HUD.areaUnreachable(-1), /press\u00a0→ to go the other way/);
  assert.equal(HUD.areaWhileHolding, 'Let go of what you hold first, then press\u00a0← or\u00a0→.');
  for (const t of [TIP.areaEnd(1), TIP.areaEnd(-1), TIP.areaEnd(0), HUD.areaEnd(1), HUD.areaEnd(0), HUD.areaUnreachable(-1), HUD.areaWhileHolding]) {
    assert.doesNotMatch(t, /arrow key/, `names the key itself: ${t}`);
    assert.doesNotMatch(t, /[↑↓]/, 'never the look keys');
  }
});
