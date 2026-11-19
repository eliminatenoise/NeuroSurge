/** The wheel never leaves the game (ns-app wheelStays, 19 November 2026): a wheel turn the page does not use goes to
 * the browser, and in Chromium on Linux a turn with Shift held goes back in the browser's history. The page takes
 * every wheel event except one that scrolls a panel of its own that can still scroll that way, without Shift.
 * The elements here are plain objects standing in for the page's. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { wheelStays } from '../scene/src/ns-app.mjs';

const el = (o = {}, parent = null) => ({ nodeType: 1, scrollHeight: 100, clientHeight: 100, scrollTop: 0, overflowY: 'visible', parentElement: parent, ...o });
const win = { getComputedStyle: n => ({ overflowY: n.overflowY }) };
const html = el();
const canvas = el({}, html);
const card = el({ scrollHeight: 500, clientHeight: 200, overflowY: 'auto' }, html), line = el({}, card);

test('a wheel turn over the game itself is kept from the browser', () => {
  assert.equal(wheelStays({ target: canvas, deltaY: 120, deltaX: 0 }, win), true);
  assert.equal(wheelStays({ target: canvas, deltaY: -120, deltaX: 0 }, win), true);
  assert.equal(wheelStays(null, win), true);
});

test('a panel that can still scroll that way takes the wheel; at its end the page keeps it', () => {
  card.scrollTop = 0;
  assert.equal(wheelStays({ target: line, deltaY: 120, deltaX: 0 }, win), false, 'down: the card scrolls');
  assert.equal(wheelStays({ target: line, deltaY: -120, deltaX: 0 }, win), true, 'up at the top: nothing to scroll, kept');
  card.scrollTop = 300;
  assert.equal(wheelStays({ target: line, deltaY: 120, deltaX: 0 }, win), true, 'down at the bottom: kept');
  assert.equal(wheelStays({ target: line, deltaY: -120, deltaX: 0 }, win), false, 'up: the card scrolls');
});

test('Shift and sideways turns are always kept: nothing in the game scrolls sideways; the browser\'s own zoom is left alone', () => {
  card.scrollTop = 100;
  assert.equal(wheelStays({ target: line, deltaY: 120, deltaX: 0, shiftKey: true }, win), true, 'Shift + wheel is the browser\'s "back" on Linux');
  assert.equal(wheelStays({ target: canvas, deltaY: 120, deltaX: 0, ctrlKey: true }, win), false, 'Ctrl + wheel zooms the page: the player\'s own');
  assert.equal(wheelStays({ target: canvas, deltaY: 120, deltaX: 0, metaKey: true }, win), false);
  assert.equal(wheelStays({ target: line, deltaY: 10, deltaX: 200 }, win), true, 'a sideways swipe');
  assert.equal(wheelStays({ target: line, deltaY: 0, deltaX: 0 }, win), true);
});

test('an element that is taller than its box but does not scroll (overflow hidden) does not take the wheel', () => {
  const clipped = el({ scrollHeight: 500, clientHeight: 200, overflowY: 'hidden' }, html), inner = el({}, clipped);
  assert.equal(wheelStays({ target: inner, deltaY: 120, deltaX: 0 }, win), true);
});
