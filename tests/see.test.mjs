/** A limb hidden behind another limb stays visible and can be aimed at (ns-see; ns-app controlTargets). Pure checks on
 * supplied ray layers; nothing is drawn, so these cannot show what the graphics card draws — only that the picking uses
 * the same rule as the ghost pass and takes what the player aims at. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SEE, SEE_LIMBS, seeLimbOfGroup, seeLimbKey, seeGhostEligible, seeHiddenEntry, seeTakesGhost, seeLockedAway, seeLimbColours } from '../scene/src/ns-see.mjs';
import { OUTLINE_GROUPS as G, OUTLINE_MIRROR_OFFSET as M } from '../scene/src/ns-outline.mjs';
import { controlTargets } from '../scene/src/ns-app.mjs';

const own = (group, distance, name = 'x') => ({ item: 'own', kind: 'muscle', distance, point: [0, 0, 0], rec: { source: 'own', part: 'body', name, group } });
const mir = (group, distance) => ({ item: 'mirror', kind: 'muscle', distance, point: [0, 0, 0], rec: { source: 'mirror', part: 'body', name: 'm', group } });
const glass = distance => ({ item: 'brain', kind: 'glass', distance, point: [0, 0, 0], regionId: null });
const area = distance => ({ item: 'brain', kind: 'area', distance, point: [0, 0, 0], regionId: 'rh_knee' });

test('each outline group belongs to one limb (or none), on either body', () => {
  assert.equal(seeLimbOfGroup(G.lHand), 1);
  assert.equal(seeLimbOfGroup(G.rUpper), 2);
  assert.equal(seeLimbOfGroup(G.lShank), 3);
  assert.equal(seeLimbOfGroup(G.rFoot), 4);
  assert.equal(seeLimbOfGroup(G.trunk), 0);
  assert.equal(seeLimbOfGroup(G.head), 0);
  assert.equal(seeLimbOfGroup(G.lFore + M), 5);
  assert.equal(seeLimbOfGroup(G.rThigh + M), 8);
  assert.equal(seeLimbOfGroup(0), 0);
  assert.equal(seeLimbOfGroup(99), 0);
  assert.deepEqual(seeLimbKey(3), { limb: 'leftLeg', source: 'own' });
  assert.deepEqual(seeLimbKey(6), { limb: 'rightArm', source: 'mirror' });
  assert.equal(seeLimbKey(0), null);
  assert.deepEqual(SEE_LIMBS, ['leftArm', 'rightArm', 'leftLeg', 'rightLeg']);
});

test('a ghost is another limb of the same body, not joined to the part in front', () => {
  assert.equal(seeGhostEligible(G.rFore, G.lHand), true, 'a hand under the other forearm');
  assert.equal(seeGhostEligible(G.rThigh, G.lFoot), true, 'a foot behind the other thigh');
  assert.equal(seeGhostEligible(G.trunk, G.lHand), true, 'a hand behind the trunk');
  assert.equal(seeGhostEligible(G.lThigh, G.lHand), true, 'a hand under its own side thigh (another limb)');
  assert.equal(seeGhostEligible(G.lHand, G.lFore), false, 'a limb never ghosts through itself');
  assert.equal(seeGhostEligible(G.rFore, G.rUpper), false, 'a forearm folded on its own upper arm');
  assert.equal(seeGhostEligible(G.trunk, G.lThigh), false, 'a thigh going into the trunk at the hip');
  assert.equal(seeGhostEligible(G.trunk, G.rUpper), false, 'an upper arm going into the trunk at the shoulder');
  assert.equal(seeGhostEligible(G.lHand, G.trunk), false, 'the trunk is never a ghost');
  assert.equal(seeGhostEligible(G.rThigh, G.lThigh + M), false, 'not across the two bodies');
  assert.equal(seeGhostEligible(G.rThigh + M, G.lFoot + M), true, 'the mirror body has its own ghosts');
});

test('the hidden entry on a ray: the first ghost behind the front part, past the gap; the trunk and joined roots are passed through', () => {
  // the right forearm in front, the left hand 5 cm behind it
  const hand = own(G.lHand, 0.85, 'left hand');
  assert.equal(seeHiddenEntry([own(G.rFore, 0.8), own(G.rFore, 0.82), hand]), hand);
  // within the gap (touching): no ghost
  assert.equal(seeHiddenEntry([own(G.rFore, 0.8), own(G.lHand, 0.805)]), null);
  // the arm under the body: the thigh in front, then the pelvis (trunk), then the forearm
  const fore = own(G.lFore, 0.9);
  assert.equal(seeHiddenEntry([own(G.rThigh, 0.7), own(G.trunk, 0.8), fore]), fore);
  // the trunk in front of a thigh root: nothing (joined); the other leg's shank further back is a ghost
  const shank = own(G.rShank, 1.2);
  assert.equal(seeHiddenEntry([own(G.trunk, 0.6), own(G.lThigh, 0.7)]), null);
  assert.equal(seeHiddenEntry([own(G.trunk, 0.6), own(G.lThigh, 0.7), shank]), shank);
  // brain entries in front are passed over; the mirror body behind your leg is no ghost of yours
  assert.equal(seeHiddenEntry([glass(0.5), own(G.rThigh, 0.8), mir(G.lThigh + M, 3)]), null);
  assert.equal(seeHiddenEntry([]), null);
  assert.equal(seeHiddenEntry(null), null);
});

const lockedOf = (...codes) => { const a = new Array(9).fill(false); for (const c of codes) a[c] = true; return a; };
test('the crosshair takes a ghost only when its limb is locked away (drawn filled), and only the limb found on the ray', () => {
  const hand = own(G.lHand, 0.85);
  assert.equal(seeTakesGhost(lockedOf(1), hand), true);
  assert.equal(seeTakesGhost(lockedOf(), hand), false, 'the left arm shows elsewhere: the part in front is taken');
  assert.equal(seeTakesGhost(lockedOf(3), hand), false, 'another limb locked away');
  assert.equal(seeTakesGhost(lockedOf(5), hand), false, 'the mirror body\'s left arm is another code');
  assert.equal(seeTakesGhost(null, hand), false);
  assert.equal(seeTakesGhost(lockedOf(1), null), false);
});

test('a limb is locked away while it is hidden and hardly seen anywhere, with no flicker near the threshold', () => {
  const census = (seen, hidden) => { const s = new Array(9).fill(0), h = new Array(9).fill(0); s[3] = seen; h[3] = hidden; return { seen: s, hidden: h }; };
  assert.equal(seeLockedAway(census(2, 30))[3], true, 'a leg behind the other thigh, a knee showing');
  assert.equal(seeLockedAway(census(40, 6))[3], false, 'a thigh behind a forearm lying across it');
  assert.equal(seeLockedAway(census(0, 1))[3], false, 'one cell is not enough (a speck)');
  assert.equal(seeLockedAway(census(0, 0))[3], false, 'not hidden');
  // hysteresis: a share between lockOn and lockOff keeps the last answer
  const mid = census(38, 62); // seen share 0.38
  assert.ok(mid.seen[3] / (mid.seen[3] + mid.hidden[3]) > SEE.lockOn && mid.seen[3] / (mid.seen[3] + mid.hidden[3]) < SEE.lockOff);
  assert.equal(seeLockedAway(mid, lockedOf())[3], false);
  assert.equal(seeLockedAway(mid, lockedOf(3))[3], true);
  assert.equal(seeLockedAway(census(60, 40), lockedOf(3))[3], false, 'shows enough again: let go');
  assert.equal(seeLockedAway(null).length, 9);
});

test('controlTargets: a filled ghost is the default target and Shift reaches the part in front', () => {
  const fore = own(G.rFore, 0.8, 'right forearm'), hand = own(G.lHand, 0.86, 'left hand'), behindGlass = glass(6);
  const L = [fore, hand, behindGlass];
  const t = controlTargets(L, { ghost: lockedOf(1) });
  assert.equal(t.front, hand);
  assert.equal(t.behind, fore);
  assert.equal(t.seen, fore, 'what is SEEN stays the solid part in front');
  assert.equal(t.ghost, hand);
  // the left arm shows elsewhere: the forearm is the target, Shift reaches the hidden hand first (before the brain)
  const u = controlTargets(L, { ghost: lockedOf() });
  assert.equal(u.front, fore);
  assert.equal(u.behind, hand);
  assert.equal(u.ghost, null);
  // no census answer yet: as before, but Shift still reaches the hidden hand
  const v = controlTargets(L, {});
  assert.equal(v.front, fore);
  assert.equal(v.behind, hand);
  // nothing hidden: the item behind is the brain, as before
  const w = controlTargets([fore, behindGlass], {});
  assert.equal(w.front, fore);
  assert.equal(w.behind, behindGlass);
});

test('controlTargets: behind a motor area the area stays the default; Shift takes a locked-away ghost, else the part seen', () => {
  const leg = own(G.rThigh, 0.9, 'right thigh'), foot = own(G.lFoot, 1.0, 'left foot'), a = area(7);
  const t = controlTargets([leg, foot, a], { lookArea: true, ghost: lockedOf(3) });
  assert.equal(t.front.item, 'brain');
  assert.equal(t.front.kind, 'area');
  assert.equal(t.behind, foot);
  const u = controlTargets([leg, foot, a], { lookArea: true });
  assert.equal(u.front.kind, 'area');
  assert.equal(u.behind, leg, 'the leg in front of the strip: Shift takes the leg');
});

test('the ghost colours are the strip families, light enough to read, below the bloom', () => {
  const c = seeLimbColours();
  assert.equal(c.length, 9);
  for (let i = 1; i <= 8; i++) {
    assert.ok(Math.max(...c[i]) <= SEE.colourLift + 1e-9, 'no channel above the lift');
    assert.ok(Math.max(...c[i]) > 0.5, 'not dark');
  }
  assert.deepEqual(c[1], c[5], 'the mirror body uses your colours');
  const [, lArm, rArm, lLeg, rLeg] = c;
  assert.ok(lArm[2] > lArm[0], 'left arm: blue');
  assert.ok(rArm[0] > rArm[2], 'right arm: orange');
  assert.ok(lLeg[2] > lLeg[1], 'left leg: purple');
  assert.ok(rLeg[0] > rLeg[2] && rLeg[1] > rLeg[2], 'right leg: yellow');
});
