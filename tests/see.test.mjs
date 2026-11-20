/** Whatever is hidden behind something shows through it as light-blue glass, and a limb hidden behind another limb can be
 * aimed at (ns-see; ns-app controlTargets). Pure checks on supplied codes and ray layers; nothing is drawn, so these
 * cannot show what the graphics card draws: only that the drawing rule says what the owner asked for, that the picking
 * still takes what the player aims at, and that the new ghosts take nothing from it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SEE, SEE_LIMBS, SEE_THINGS, seeLimbOfGroup, seeLimbKey, seeThingOfGroup, seeBodyOfThing, seeAreaCode, seeShows, seeGhostEligible, seeHiddenEntry, seeTakesGhost, seeDrawnEntry, seeLockedAway, seeFillTargets, seeGlassColours, SEE_JOIN_MASKS } from '../scene/src/ns-see.mjs';
import { OUTLINE_GROUPS as G, OUTLINE_MIRROR_OFFSET as M, OUTLINE_ADJACENT } from '../scene/src/ns-outline.mjs';
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

// 19 November 2026 (the owner: "Whenever anything is occluded behind something, we want to see it through as well with a
// highlighted outline, light bluish glass thing"): the DRAWING rule is wider than limbs now. The next test (the picking
// rule) used to be the drawing rule as well ("only the limbs get ghosts", "only within one body", "nothing through the
// brain"); it still pins the picking, on purpose, and the tests after it pin the new drawing rule.
test('every part of a body is a thing: its limb, or its trunk with the neck and head', () => {
  assert.equal(seeThingOfGroup(G.lHand), 1);
  assert.equal(seeThingOfGroup(G.rShank), 4);
  assert.equal(seeThingOfGroup(G.trunk), SEE_THINGS.ownTrunk);
  assert.equal(seeThingOfGroup(G.head), SEE_THINGS.ownTrunk, 'the head is one piece with the trunk');
  assert.equal(seeThingOfGroup(G.trunk + M), SEE_THINGS.mirrorTrunk);
  assert.equal(seeThingOfGroup(G.lFoot + M), 7);
  assert.equal(seeThingOfGroup(0), 0);
  assert.equal(seeThingOfGroup(15), 0, 'no such group');
  assert.equal(seeThingOfGroup(99), 0);
  assert.equal(seeBodyOfThing(3), 1);
  assert.equal(seeBodyOfThing(SEE_THINGS.ownTrunk), 1);
  assert.equal(seeBodyOfThing(6), 2);
  assert.equal(seeBodyOfThing(SEE_THINGS.mirrorTrunk), 2);
  assert.equal(seeBodyOfThing(SEE_THINGS.brain), 0);
  assert.equal(seeAreaCode(0), SEE_THINGS.area);
  assert.equal(seeAreaCode(500), SEE_THINGS.maxCode, 'never past the last code');
  assert.ok(SEE_THINGS.maxCode < 128, 'a code fits the byte the pass writes it in');
});

const g = group => ({ group }), th = thing => ({ thing });
test('the drawing rule within a body: limbs as before, and the trunk behind a forearm, hand, shank or foot', () => {
  assert.equal(seeShows(g(G.rFore), g(G.lHand)), true, 'a hand under the other forearm');
  assert.equal(seeShows(g(G.trunk), g(G.lHand)), true, 'a hand under the body');
  assert.equal(seeShows(g(G.rThigh), g(G.lFoot)), true, 'a foot behind a thigh');
  assert.equal(seeShows(g(G.lShank), g(G.trunk)), true, 'the trunk behind a raised knee (the shank)');
  assert.equal(seeShows(g(G.rHand), g(G.head)), true, 'the head behind a hand');
  assert.equal(seeShows(g(G.lHand), g(G.lFore)), false, 'a thing never shows through itself');
  assert.equal(seeShows(g(G.trunk), g(G.head)), false, 'the trunk and head are one piece');
  assert.equal(seeShows(g(G.trunk), g(G.lThigh)), false, 'a thigh going into the hip is not hidden');
  assert.equal(seeShows(g(G.lThigh), g(G.trunk)), false, 'nor the trunk behind the root of its own limb');
  assert.equal(seeShows(g(G.rUpper), g(G.trunk)), false);
  assert.equal(seeShows(g(G.lShank + M), g(G.trunk + M)), true, 'the same on the mirror body');
  assert.equal(seeShows(g(G.lShank), g(G.trunk), { trunk: false, across: true, brain: true }), false, 'the rule can be switched off by itself');
  assert.equal(seeShows(g(G.trunk), g(G.lHand), { trunk: false, across: false, brain: false }), true, 'the limbs do not depend on it');
  assert.equal(seeShows(g(0), g(G.lHand)), false);
  assert.equal(seeShows(null, null), false);
});

test('the table the graphics card reads for "joined at a joint" says what the drawing rule says', () => {
  assert.equal(SEE_JOIN_MASKS.length, M);
  const joined = (a, b) => ((SEE_JOIN_MASKS[a] >> b) & 1) === 1;
  const groups = Object.values(G);
  for (const a of groups) for (const b of groups) {
    const adjacent = a === b || OUTLINE_ADJACENT.some(([x, y]) => (G[x] === a && G[y] === b) || (G[x] === b && G[y] === a));
    assert.equal(joined(a, b), adjacent, `groups ${a} and ${b}`);
    // two different things of one body show through each other exactly when they are not joined (limbs; and a trunk behind a limb)
    if (seeThingOfGroup(a) !== seeThingOfGroup(b)) assert.equal(seeShows(g(a), g(b)), !adjacent, `front ${a}, behind ${b}`);
  }
  assert.equal(SEE_JOIN_MASKS[0], 0);
  assert.ok(Math.max(...groups) < M && M <= 31, 'a bit per group fits an int');
});

test('the drawing rule across the two bodies: either shows through the other', () => {
  assert.equal(seeShows(g(G.trunk + M), g(G.lHand)), true, 'your hand behind the mirror body');
  assert.equal(seeShows(g(G.rShank), g(G.lFoot + M)), true, 'the mirror body behind your leg');
  assert.equal(seeShows(g(G.rThigh), g(G.trunk + M)), true, 'its trunk too');
  assert.equal(seeShows(g(G.trunk), g(G.lThigh + M)), true, 'a joint joins nothing across two bodies');
  assert.equal(seeShows(g(G.rShank), g(G.lFoot + M), { trunk: true, across: false, brain: true }), false, 'switched off by itself');
});

test('the drawing rule and the brain: bodies through the brain, the brain through bodies, the eyeballs through the brain', () => {
  const B = SEE_THINGS;
  assert.equal(seeShows(th(B.brain), g(G.lHand)), true, 'your hand behind the brain');
  assert.equal(seeShows(th(B.brain), g(G.trunk + M)), true, 'the mirror body behind the brain');
  assert.equal(seeShows(th(seeAreaCode(3)), g(G.rFoot)), true, 'a foot behind the motor strip');
  assert.equal(seeShows(g(G.rThigh), th(B.brain)), true, 'the brain behind your leg');
  assert.equal(seeShows(g(G.rThigh), th(seeAreaCode(0))), true, 'a group of motor areas behind your knee');
  assert.equal(seeShows(g(G.trunk + M), th(B.eyes)), true, 'an eyeball behind the mirror body');
  assert.equal(seeShows(th(B.brain), th(B.eyes)), true, 'the eyeballs and nerves behind the brain\'s own surface');
  assert.equal(seeShows(th(seeAreaCode(1)), th(B.eyes)), true);
  assert.equal(seeShows(th(B.eyes), th(B.brain)), false, 'not the brain behind its own eyeball');
  assert.equal(seeShows(th(B.brain), th(seeAreaCode(0))), false, 'not an area behind the brain\'s own surface');
  assert.equal(seeShows(th(B.brain), th(B.brain)), false, 'one fold of the brain behind another');
  assert.equal(seeShows(th(B.eyes), th(B.eyes)), false);
  assert.equal(seeShows(th(B.brain), g(G.lHand), { trunk: true, across: true, brain: false }), false, 'switched off by itself');
  assert.equal(seeShows(g(G.rThigh), th(B.brain), { trunk: true, across: true, brain: false }), false);
});

test('the picking rule: a hidden limb of the same body, not joined to the part in front (unchanged)', () => {
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

// 20 November 2026 (code review): the crosshair took a locked-away limb at a pixel where the graphics card draws another
// thing's ghost (only the nearest hidden thing is drawn per pixel). seeDrawnEntry is that rule on the ray.
test('the ghost drawn on a ray: the nearest thing behind the front that the drawing rule shows (as the graphics card)', () => {
  const B = SEE_THINGS;
  // legs crossed: the left shank in front of the pelvis, the right thigh behind both: the pelvis is drawn there
  const shank = own(G.lShank, 0.60, 'left shank'), pelvis = own(G.trunk, 0.66, 'pelvis'), thigh = own(G.rThigh, 0.75, 'right thigh');
  assert.equal(seeDrawnEntry([shank, pelvis, thigh]), pelvis);
  assert.equal(seeDrawnEntry([shank, pelvis, thigh], SEE, { trunk: false, across: true, brain: true }), thigh, 'with the trunk rule off the pelvis is passed and the thigh drawn');
  // a joined root is passed (the arm under the body: thigh, pelvis joined to it, forearm)
  const fore = own(G.lFore, 0.9);
  assert.equal(seeDrawnEntry([own(G.rThigh, 0.7), own(G.trunk, 0.8), fore]), fore);
  // the same thing again is passed, a touching part (within the gap) too
  const hand = own(G.lHand, 0.85);
  assert.equal(seeDrawnEntry([own(G.rFore, 0.8), own(G.rFore, 0.82), hand]), hand);
  assert.equal(seeDrawnEntry([own(G.rFore, 0.8), own(G.lHand, 0.805)]), null);
  // across the bodies: the mirror body between your forearm and your hidden hand is what is drawn
  const mtrunk = mir(G.trunk + M, 0.83);
  assert.equal(seeDrawnEntry([own(G.rFore, 0.8), mtrunk, hand]), mtrunk);
  // the brain behind a body part, before a hidden limb further back: the brain is drawn
  const g6 = glass(0.83);
  assert.equal(seeDrawnEntry([own(G.rFore, 0.8), g6, hand]), g6);
  assert.equal(seeDrawnEntry([own(G.rFore, 0.8), g6, hand], SEE, { trunk: true, across: true, brain: false }), hand, 'with the brain rule off the brain is not in the pass');
  // the brain in front: the ghost is the body part nearest behind it (past the gap)
  const mt = mir(G.trunk + M, 1.6), mf = mir(G.lFore + M, 1.75);
  assert.equal(seeDrawnEntry([glass(1.0), mt, mf]), mt);
  assert.equal(seeDrawnEntry([glass(1.0), mir(G.trunk + M, 1.005), mf]), mf, 'a part touching the glass is within the gap');
  // an eyeball behind the brain's surface; nothing for the brain's 'outline' entry (no surface)
  const eye = { item: 'brain', kind: 'glass', distance: 1.3, point: [0, 0, 0], regionId: null, part: 'eyeball' };
  assert.equal(seeDrawnEntry([glass(1.0), eye]), eye);
  assert.equal(seeDrawnEntry([{ item: 'brain', kind: 'outline', distance: 0.5, point: [0, 0, 0], regionId: null }, shank, pelvis]), pelvis);
  assert.equal(seeShows({ thing: B.brain }, { thing: B.eyes }), true);
  assert.equal(seeDrawnEntry([]), null);
  assert.equal(seeDrawnEntry(null), null);
});

test('the crosshair takes a locked-away ghost only where it is the ghost drawn there', () => {
  const legs = lockedOf(4);
  const shank = own(G.lShank, 0.60, 'left shank'), pelvis = own(G.trunk, 0.66, 'pelvis'), thigh = own(G.rThigh, 0.75, 'right thigh');
  const L = [shank, pelvis, thigh];
  assert.equal(seeHiddenEntry(L), thigh, 'the right thigh is still the hidden limb on the ray (Shift reaches it)');
  assert.equal(seeTakesGhost(legs, thigh, L), false, 'the pelvis is drawn there, not the thigh');
  assert.equal(seeTakesGhost(legs, thigh), true, 'without the ray: as before');
  const t = controlTargets(L, { ghost: legs });
  assert.equal(t.front, shank, 'the crosshair takes the shank seen there');
  assert.equal(t.ghost, null);
  assert.equal(t.behind, thigh, 'Shift reaches the locked-away thigh');
  // the right forearm over the belly, the left arm under the body and locked away
  const u = controlTargets([own(G.rFore, 0.5, 'right forearm'), own(G.trunk, 0.58, 'belly'), own(G.lFore, 0.7, 'left forearm')], { ghost: lockedOf(1) });
  assert.equal(u.front.rec.name, 'right forearm');
  assert.equal(u.ghost, null);
  // the mirror body behind the brain (every mirror limb locked away): where its forearm hangs behind its trunk, the
  // trunk's ghost is drawn, and the crosshair takes the trunk; Shift reaches the forearm
  const mt = mir(G.trunk + M, 1.6), mf = mir(G.lFore + M, 1.75);
  const v = controlTargets([glass(1.0), mt, mf], { ghost: lockedOf(5, 6, 7, 8) });
  assert.equal(v.front, mt);
  assert.equal(v.ghost, null);
  assert.equal(v.behind, mf);
  // where the hidden limb's ghost IS drawn, the crosshair still takes it
  const fore = own(G.rFore, 0.8, 'right forearm'), hand = own(G.lHand, 0.86, 'left hand');
  const w = controlTargets([fore, hand, glass(6)], { ghost: lockedOf(1) });
  assert.equal(w.front, hand);
  assert.equal(w.ghost, hand);
  const x = controlTargets([own(G.rThigh, 0.7), own(G.trunk, 0.8), own(G.lFore, 0.9, 'left forearm')], { ghost: lockedOf(1) });
  assert.equal(x.ghost && x.ghost.rec.name, 'left forearm', 'through a joined root, as before');
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

test('the trunks can be asked the same question as the limbs (hidden and hardly seen), without changing the limbs\' answer', () => {
  const s = new Array(SEE_THINGS.count).fill(0), h = new Array(SEE_THINGS.count).fill(0);
  s[3] = 2; h[3] = 30; s[SEE_THINGS.mirrorTrunk] = 1; h[SEE_THINGS.mirrorTrunk] = 25; s[SEE_THINGS.ownTrunk] = 90; h[SEE_THINGS.ownTrunk] = 20;
  const limbs = seeLockedAway({ seen: s, hidden: h });
  assert.equal(limbs.length, 9, 'the picking asks about the limbs only');
  assert.equal(limbs[3], true);
  const all = seeLockedAway({ seen: s, hidden: h }, null, SEE, SEE_THINGS.mirrorTrunk);
  assert.equal(all.length, SEE_THINGS.mirrorTrunk + 1);
  assert.equal(all[3], true);
  assert.equal(all[SEE_THINGS.mirrorTrunk], true, 'the mirror body\'s trunk behind the brain');
  assert.equal(all[SEE_THINGS.ownTrunk], false, 'your trunk mostly shows');
});

test('the fill of each thing: a limb light or strong, a trunk only as far as it is hidden, the brain\'s surface never', () => {
  const B = SEE_THINGS, census = (seen, hidden) => { const s = new Array(B.count).fill(0), h = new Array(B.count).fill(0); s[B.ownTrunk] = seen; h[B.ownTrunk] = hidden; s[B.brain] = 300; h[B.brain] = 200; return { seen: s, hidden: h }; };
  const none = seeFillTargets(null, null);
  assert.equal(none.length, B.count);
  for (let c = 1; c <= 8; c++) assert.equal(none[c], SEE.fillLow, 'a limb always has its light fill');
  assert.equal(none[B.ownTrunk], 0, 'no census yet: a trunk has none');
  assert.equal(none[B.brain], 0);
  assert.equal(none[B.eyes], SEE.fillEyes);
  assert.equal(none[B.area], SEE.fillArea);
  const locked = new Array(B.mirrorTrunk + 1).fill(false); locked[2] = true;
  assert.equal(seeFillTargets(null, locked)[2], SEE.fillAlpha, 'hidden and hardly seen: strong');
  assert.equal(seeFillTargets(null, locked)[1], SEE.fillLow);
  assert.equal(seeFillTargets(census(95, 5))[B.ownTrunk], 0, 'a trunk that mostly shows: lines only');
  const part = seeFillTargets(census(70, 30))[B.ownTrunk], more = seeFillTargets(census(60, 40))[B.ownTrunk];
  assert.ok(part > 0 && part < SEE.fillTrunk, 'partly hidden: part of the fill');
  assert.ok(more > part, 'more hidden, more fill (smoothly: a share that wanders does not switch it on and off)');
  assert.equal(seeFillTargets(census(40, 60))[B.ownTrunk], SEE.fillTrunk);
  const trunkLocked = new Array(B.mirrorTrunk + 1).fill(false); trunkLocked[B.ownTrunk] = true;
  assert.equal(seeFillTargets(census(5, 95), trunkLocked)[B.ownTrunk], SEE.fillAlpha, 'hidden and hardly seen: like such a limb');
  assert.equal(seeFillTargets(census(5, 95), trunkLocked)[B.brain], 0, 'the brain\'s surface is behind almost everything: never a fill');
  for (const v of seeFillTargets(census(5, 95), trunkLocked)) assert.ok(v >= 0 && v <= SEE.fillAlpha);
});

test('controlTargets: the new ghosts take nothing: a trunk, the other body or the brain behind what is seen is never the default', () => {
  const every = new Array(9).fill(true); // (even if every limb counted as locked away)
  // the trunk behind your raised shank: drawn as a ghost, but the shank stays the target and Shift goes on to the brain
  const shank = own(G.lShank, 0.6, 'left shank'), trunk = own(G.trunk, 0.9, 'chest'), far = glass(6);
  const t = controlTargets([shank, trunk, far], { ghost: every });
  assert.equal(t.front, shank);
  assert.equal(t.ghost, null);
  assert.equal(t.hidden, null, 'a trunk is not a hidden limb');
  assert.equal(t.behind, far);
  // the mirror body's leg behind your leg: your leg is the target; Shift reaches the other item (the mirror body)
  const leg = own(G.rShank, 0.7, 'right shank'), mleg = mir(G.lShank + M, 2.4);
  const u = controlTargets([leg, mleg, far], { ghost: every });
  assert.equal(u.front, leg);
  assert.equal(u.ghost, null);
  assert.equal(u.behind, mleg);
  // your hand behind the brain's surface: the brain is what is seen and taken; the ghost through it is not
  const hand = own(G.lHand, 1.2, 'left hand'), near = glass(0.8);
  const v = controlTargets([near, hand], { ghost: every });
  assert.equal(v.front, hand, 'clear glass in front of a body part was always see-through for the controls (unchanged)');
  assert.equal(v.ghost, null);
  // a motor area the look names behind your knee, with the trunk and another limb behind the knee too: the area stays
  const knee = own(G.rThigh, 0.9, 'right thigh'), foot = own(G.lFoot, 1.0, 'left foot'), a = area(7);
  const w = controlTargets([knee, trunk, foot, a], { lookArea: true, ghost: new Array(9).fill(false) });
  assert.equal(w.front.kind, 'area');
  assert.equal(w.front.item, 'brain');
  assert.equal(w.behind, knee, 'Shift takes the knee in front of the area');
  const x = controlTargets([knee, trunk, foot, a], { lookArea: true, ghost: every });
  assert.equal(x.front.kind, 'area', 'even a locked-away limb behind the knee does not take the area\'s place');
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

// 19 November 2026: this test used to pin one colour per limb (the strip families: blue left arm, orange right arm,
// purple left leg, yellow right leg). The owner has since asked for ONE look ("That sort of bluish transparent outline is
// great. We actually want that for everything now ... light bluish glass thing"), so it now pins that look instead.
test('every ghost has the one light-blue glass look, light enough to read, below the bloom', () => {
  const { line, fill } = seeGlassColours();
  for (const c of [line, fill]) {
    assert.equal(c.length, 3);
    assert.ok(Math.max(...c) <= 0.8 + 1e-9, 'no channel above 0.8 (the bloom starts above it)');
    assert.ok(Math.max(...c) > 0.5, 'not dark');
    assert.ok(c[2] > c[1] && c[1] > c[0], 'blue over green over red: a light blue');
  }
  assert.ok(fill[0] > line[0], 'the fill is paler than the line');
  assert.deepEqual(seeGlassColours().line, [...SEE.glass.line], 'a copy of SEE.glass each time');
});
