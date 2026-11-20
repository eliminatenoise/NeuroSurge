/** A light beam is drawn only while its key on the strip is in the picture (ns-links LIGHT_BEAM.keyInView, 20 November
 * 2026: with the brain carried behind you, Space drew the hand area's beam from the corner of the picture, a quarter of
 * the screen wide). Pure checks of the rule; a display choice. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { LIGHT_BEAM, beamKeySeen } from '../scene/src/ns-links.mjs';

test('a beam needs its key in front of the eye and inside the picture, with a small margin', () => {
  const k = LIGHT_BEAM.keyInView;
  assert.ok(k >= 1 && k <= 1.5, 'just past the picture\'s edge, no further');
  assert.equal(beamKeySeen(0, 0, false), true, 'the middle of the picture');
  assert.equal(beamKeySeen(0.99, -0.99, false), true, 'a corner');
  assert.equal(beamKeySeen(k - 1e-6, 0, false), true, 'just inside the margin');
  assert.equal(beamKeySeen(k + 1e-3, 0, false), false, 'beyond the margin, sideways');
  assert.equal(beamKeySeen(0, -(k + 1e-3), false), false, 'beyond the margin, below');
  assert.equal(beamKeySeen(0, 0, true), false, 'behind the eye');
  assert.equal(beamKeySeen(NaN, 0, false), false, 'not a place');
});
