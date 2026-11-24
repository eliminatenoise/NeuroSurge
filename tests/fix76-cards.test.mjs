// 25 November 2026 (FIX76; a second play-through of Body update 74, finding 3). The information card ends under the
// Electrical map's card: the foot that is written on the card (INFO_UNDER_MAP) and the style rules that use it. The
// game itself is tried in tests/browser-emap.mjs.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { INFO_UNDER_MAP, emapFootPx } from '../scene/src/ns-scene-three.mjs';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/* ---------------------------------------------------------------- finding 3: the two cards */

test('the map card\'s foot is written in whole px from the top of the information card\'s box, or not at all', () => {
  assert.ok(Object.isFrozen(INFO_UNDER_MAP) && INFO_UNDER_MAP.on === true);
  assert.equal(emapFootPx({ width: 230, height: 178, bottom: 241.6 }, 0), 242, 'the short card at 800 by 600');
  assert.equal(emapFootPx({ width: 300, height: 182, bottom: 310 }, 20), 290, 'counted from the box\'s own top');
  assert.equal(emapFootPx({ width: 0, height: 0, bottom: 0 }, 0), null, 'the card not drawn (the map off, or reading off)');
  assert.equal(emapFootPx(null, 0), null);
  assert.equal(emapFootPx({ width: 230, height: 178, bottom: 242 }, 0, { on: false }), null, 'the switch');
});

test('the style sheet ends the information card under the map\'s card, and the map\'s card gives way first in a small wide window', () => {
  const css = read('scene/example/quiet.css');
  const under = 'max(96px, calc(100% - var(--ns-emap-foot, 0px) - 24px))';
  assert.ok(css.includes(`.ns-app[data-ns-emap="on"] .ns-infopanel { max-height: min(calc(100% - 30px - var(--ns-gap, 12px)), var(--ns-info-col-maxvh, 66vh), ${under}) !important; }`), 'the full card and the short reading level');
  assert.ok(css.includes(`.ns-app[data-ns-emap="on"]:not([data-ns-unfold="true"]):not([data-ns-read="read"]) .ns-infopanel:not(:has(.ns-infopanel-detail[open])) { max-height: min(var(--ns-info-short-maxvh, 48vh), ${under}) !important; }`), 'the closed card of the full level keeps its own greatest height');
  assert.match(css, /@media \(max-width: 900px\) and \(min-aspect-ratio: 1\/1\) \{\n\s*\.ns-app\[data-ns-read="more"\] \.ns-emap-more \{ display: none; \}\n\}/, 'the legend leaves its More detail out where both cannot be whole');
  const scene = read('scene/src/ns-scene-three.mjs');
  assert.match(scene, /try \{ noteEmapFoot\(\); \} catch \{[^}]*\}\n\s*try \{ fitInfoCard\(\); \}/, 'the foot is measured before the card is fitted');
  assert.match(scene, /\|\$\{emapFoot === null \? '' : emapFoot\}`;/, 'and a new foot fits the card again');
});
