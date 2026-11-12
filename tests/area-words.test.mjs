/** The words that say which motor area the look is on (user Messages 55 and 56: easier to follow; a learning tool
 * for motor neuroanatomy): the "Looking at" line names the area and then its movement (ns-text gazeLine), and the
 * card's line under the title names the part of the strip and the half of the brain the area is drawn on (ns-text
 * areaTag), in the words of the labels on the brain.
 * Pure text checks over the game's own body map. No scene, model, browser or native fixture. These cases establish
 * what the lines say for each mapped area and that only a left-arm card carries the left-arm wording (the panel tells
 * a left-arm card by it); never that the wording is easier to learn from, and nothing about biology.
 * Run: node tests/area-words.test.mjs (no arguments).
 */
import assert from 'node:assert/strict';

assert.equal(process.argv.length, 2, 'Run this test without arguments');
const target = new URL('../scene/src/ns-text.mjs', import.meta.url);
const NT = await import(target.href);
const { BODY_MOTOR_MAP } = await import(new URL('../scene/src/ns-bodymap.mjs', import.meta.url).href);
const results = [];
function check(name, fn) {
  try { fn(); results.push({ name, passed: true }); }
  catch (error) { results.push({ name, passed: false, error: String(error) }); }
}
const REGIONS = BODY_MOTOR_MAP.regions;
const byId = new Map(REGIONS.map(r => [r.id, r]));
const tagOf = r => NT.areaTag(r, r.isLeftArm === true);
const LEFT_ARM = /left[- ]arm/i;

check('every mapped area has a tag that names its part of the strip, not "another body part"', () => {
  for (const r of REGIONS) {
    const tag = tagOf(r);
    assert.equal(typeof tag, 'string', r.id);
    assert.ok(tag.length > 0, r.id);
    assert.notEqual(tag, NT.INFO.otherTag, r.id);
    assert.equal(NT.plainInfoCard({ region: r, leftArm: r.isLeftArm === true }).tag, tag, `${r.id}: the card carries the same tag`);
  }
});

check('only a left-arm card carries the left-arm wording', () => {
  for (const r of REGIONS) {
    const tag = tagOf(r);
    assert.equal(LEFT_ARM.test(tag), r.isLeftArm === true, `${r.id}: ${tag}`);
    assert.equal(tag === NT.INFO.leftArmTag, r.isLeftArm === true, r.id);
    // Asked without the left-arm flag, a left-arm area never gets the left-arm wording by another route.
    assert.ok(!LEFT_ARM.test(NT.areaTag(r, false)), `${r.id}: ${NT.areaTag(r, false)}`);
  }
});

check('the tag names the half of the brain the area is drawn on, and the limb of the other side', () => {
  for (const r of REGIONS) {
    if (r.kind === 'integration') { assert.equal(tagOf(r), NT.INFO.integrationTag, r.id); continue; }
    const tag = tagOf(r);
    assert.ok(tag.includes(`brain’s ${r.hemisphere} half`), `${r.id}: ${tag}`);
    const limb = /^(left|right)_(arm|leg)$/.exec(r.displayGroup || '');
    if (limb) {
      assert.ok(tag.toLowerCase().startsWith(`${limb[1]}-${limb[2]} motor area`), `${r.id}: ${tag}`);
      assert.notEqual(limb[1], r.hemisphere, `${r.id}: a limb area is drawn on the other half`);
    }
  }
  assert.equal(tagOf(byId.get('rh_knee')), 'Left-leg motor area (brain’s right half)');
  assert.equal(tagOf(byId.get('lh_hip')), 'Right-leg motor area (brain’s left half)');
  assert.equal(tagOf(byId.get('lh_elbow')), 'Right-arm motor area (brain’s left half)');
  assert.equal(tagOf(byId.get('rh_trunk')), 'Belly-and-back motor area (brain’s right half)');
  assert.equal(tagOf(byId.get('rh_neck')), 'Face-and-neck motor area (brain’s right half)');
  assert.equal(tagOf(byId.get('lh_lips')), 'Face-and-neck motor area (brain’s left half)');
});

check('the tag uses the words of the labels on the brain', () => {
  const firstWords = label => /^(.*?)\s*\(/.exec(label)[1].toLowerCase();
  const sameWords = (tag, label) => tag.toLowerCase().replace(/-/g, ' ').startsWith(firstWords(label));
  assert.ok(sameWords(tagOf(byId.get('rh_knee')), NT.regionGroupLabel('leg', 'right')));
  assert.ok(sameWords(tagOf(byId.get('lh_elbow')), NT.regionGroupLabel('arm', 'left')));
  assert.ok(sameWords(tagOf(byId.get('rh_elbow')), NT.regionGroupLabel('leftArm', 'right')));
  assert.ok(sameWords(tagOf(byId.get('lh_trunk')), NT.regionGroupLabel('trunk', 'left')));
  assert.ok(sameWords(tagOf(byId.get('rh_jaw')), NT.regionGroupLabel('face', 'right')));
});

check('an unknown area falls back to the plain tag; the left-arm flag alone gives the left-arm tag', () => {
  assert.equal(NT.areaTag(null), NT.INFO.otherTag);
  assert.equal(NT.areaTag(undefined, false), NT.INFO.otherTag);
  assert.equal(NT.areaTag({ kind: 'effector', hemisphere: 'middle', displayGroup: 'left_leg' }), NT.INFO.otherTag);
  assert.equal(NT.areaTag({ kind: 'effector', hemisphere: 'right', displayGroup: 'tail' }), NT.INFO.otherTag);
  assert.equal(NT.areaTag({ kind: 'effector', hemisphere: 'right' }), NT.INFO.otherTag);
  assert.equal(NT.areaTag(null, true), NT.INFO.leftArmTag);
  assert.ok(!LEFT_ARM.test(NT.INFO.otherTag) && !LEFT_ARM.test(NT.INFO.integrationTag));
});

check('the "Looking at" line names the area, then its movement', () => {
  const p = NT.HUD.gazeAreaPrefix, j = NT.HUD.gazeAreaJoin;
  assert.equal(NT.gazeLine('other', 'Bend left knee', 'Left knee'), `${p}Left knee${j}Bend left knee`);
  assert.equal(NT.gazeLine('strip', 'Bend left elbow', 'Left elbow'), `${p}Left elbow${j}Bend left elbow`);
  assert.equal(NT.gazeLine('leftArm', 'Bend left wrist toward the palm', 'Left wrist'), `${p}Left wrist${j}Bend left wrist toward the palm`);
  // One opening for every motor area: the left arm is not a different kind of line.
  for (const kind of ['other', 'strip', 'leftArm']) assert.ok(NT.gazeLine(kind, 'x', 'y').startsWith(p), kind);
  assert.ok(/motor area/i.test(p));
});

check('an area without a movement of its own, or a line with one of the two, says it once', () => {
  const p = NT.HUD.gazeAreaPrefix;
  assert.equal(NT.gazeLine('leftArm', 'Left shoulder', 'Left shoulder'), `${p}Left shoulder`);
  assert.equal(NT.gazeLine('other', 'Tongue', ' Tongue '), `${p}Tongue`);
  assert.equal(NT.gazeLine('strip', 'Bend left elbow'), `${p}Bend left elbow`);
  assert.equal(NT.gazeLine('strip', 'Bend left elbow', ''), `${p}Bend left elbow`);
  assert.equal(NT.gazeLine('other', '', 'Left knee'), `${p}Left knee`);
  assert.equal(NT.gazeLine('other', null, undefined), p);
});

check('the other lines are as they were: in-between areas, the mirror body, glass, brain, empty space', () => {
  assert.equal(NT.gazeLine('between', 'In-between area (upper)', 'In-between area (upper)'), `${NT.HUD.gazeBetweenPrefix}In-between area (upper)`);
  assert.equal(NT.gazeLine('mirror'), NT.HUD.gazeMirror);
  assert.equal(NT.gazeLine('mirror', 'left arm', 'ignored'), `${NT.HUD.gazeMirrorPrefix}left arm`);
  assert.equal(NT.gazeLine('glass'), NT.HUD.gazeGlass);
  assert.equal(NT.gazeLine('brain'), NT.HUD.gazeBrain);
  assert.equal(NT.gazeLine('empty'), NT.HUD.gazeEmpty);
  assert.equal(NT.gazeLine('no such kind', 'x', 'y'), NT.HUD.gazeEmpty);
  assert.equal(NT.gazeBehindLine(NT.gazeLine('strip', 'Bend left elbow', 'Left elbow'), 'your right forearm'),
    `${NT.HUD.gazeAreaPrefix}Left elbow${NT.HUD.gazeAreaJoin}Bend left elbow, behind your right forearm`);
});

const failed = results.filter(r => !r.passed);
process.stdout.write(JSON.stringify({
  suite: 'area-words',
  module: target.href,
  cases: results.length,
  failed: failed.length,
  results,
  scope: 'Pure text checks of the words that name a motor area: the "Looking at" line (ns-text gazeLine: the area, then its movement) and the card tag (ns-text areaTag: the part of the strip and the half of the brain the area is drawn on; the left-arm wording for a left-arm card only), over every area of the game\'s body map. Not checked here: what the screen shows, whether the wording is easier to learn from, or any biology.'
}, null, 2) + '\n');
if (failed.length) process.exitCode = 1;
