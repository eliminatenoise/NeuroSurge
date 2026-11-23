/** The words a browser hunt of Body update 64 found untrue, too long, cut or out of sight (22 November 2026, package
 * WORDS2; DESIGN-DECISIONS section 197: hunt findings H10 to H16 and H26). Pure checks of the shipped wording, the
 * tutorial's bookkeeping, the bottom-left stack's fit, the information card's scroll and the style sheets' text; no
 * browser. The browser pictures of each fix are named in section 197. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HUD, INFO, SHELL, GUIDE, HONESTY, graspInfoCard, gazeMuscleLine } from '../scene/src/ns-text.mjs';
import { createGuide, guideStep, guideView } from '../scene/src/ns-guide.mjs';
import { quietPromptText } from '../scene/src/ns-quiet.mjs';
import { cornerStackFit, CORNER_STACK, legendFitLevel, LEGEND_FIT, caveatsToDrop, INFO_FIT } from '../scene/src/ns-scene-three.mjs';
import { infoRevealScroll, INFO_DETAIL_REVEAL, INFO_DETAIL_CONTEXT_PX, LIMB_KEYS, lockedCardScroll, GUIDE_CARD_SHORT } from '../scene/src/ns-app.mjs';

const css = name => readFileSync(new URL(`../scene/example/${name}`, import.meta.url), 'utf8');
const words = t => (String(t).match(/\S+/g) || []).length;

test('H10: with the rule in force (Space on your own limb chooses it), no line says Space holds or takes your limb', () => {
  assert.equal(LIMB_KEYS.on && LIMB_KEYS.view.hold, true, 'the game\'s rule: Space on one of your limbs chooses it');
  for (const front of ['rightArm', 'leftArm', 'rightLeg', 'leftLeg']) {
    const line = HUD.controlTargets({ front, behind: 'area', area: 'Left knee', limbsChosen: true });
    assert.match(line, /^Space chooses your (right|left) (arm|leg) · Shift: the left knee area behind it$/);
    assert.doesNotMatch(line, /Space holds/);
    // without the rule (an older build), the old words
    assert.match(HUD.controlTargets({ front, limbsChosen: false }), /^Space holds your/);
  }
  assert.equal(HUD.controlTargets({ front: 'mirror', behind: 'brain', limbsChosen: true }), 'Space holds the mirror body · Shift: the brain behind it');
  assert.equal(HUD.controlTargets({ front: 'trunk', limbsChosen: true }), 'Space: nothing to hold here');
  assert.equal(HUD.controlTargets({ front: 'brain', behind: 'rightArm', inFront: true, reach: true, limbsChosen: true }), 'Shift held: click, Space or drag goes to your right arm in front of it');
  assert.equal(HUD.controlTargets({ front: 'rightArm', behind: 'brain', reach: true, limbsChosen: true }), 'Shift held: click, Space or drag takes the brain behind it');
  assert.doesNotMatch(INFO.coveredOwnBody, /hold Space to hold|hold a limb/);
  assert.match(INFO.coveredOwnBody, /Space on an arm or a leg chooses that limb/);
  assert.doesNotMatch(gazeMuscleLine({ where: 'own', name: 'right biceps brachii', holdable: true }), /hold Space to hold/);
  assert.doesNotMatch(graspInfoCard({ phase: 'close', holding: null, chosen: null }).lead, /one of your limbs/);
});

test('H10, H15: every Space sentence of the Esc page, the start page and the keyboard picture is true for a limb', () => {
  const all = [...SHELL.instructions, ...SHELL.introInstructions, ...SHELL.controls.flat(), ...SHELL.introControls.flat(),
    SHELL.keyboard.label, SHELL.keyboard.lineSpace, SHELL.keyboard.spaceWords, ...SHELL.menu.flatMap(g => [...g.rows.flat(), g.note || ''])];
  const text = all.join('\n');
  // the fault: "aim ... at the brain, the mirror body or one of your own limbs and hold Space. While Space is held, turn
  // your view with the pointer to carry it"
  assert.doesNotMatch(text, /(own limbs?|your limbs?|a limb)[^.\n]*(and )?hold Space/i);
  assert.doesNotMatch(text, /Space (holds|carries|takes hold of) (one of )?your (own )?(limb|arm|leg)/i);
  assert.match(text, /Space on one of your (own )?limbs only chooses (that limb|it)/);
});

test('H15: the full instructions are cut hard, and each control is said once', () => {
  const steps = words(SHELL.instructions.join(' ')), controls = words(SHELL.controls.map(r => r.join(' ')).join(' '));
  // (update 64: steps 1,495 words, controls 815 (888 with the M row), limits 610)
  assert.ok(steps <= 600, `steps ${steps} words`);
  assert.ok(controls <= 520, `controls ${controls} words`);
  const keys = SHELL.controls.map(r => r[0]);
  assert.equal(new Set(keys).size, keys.length, 'one row per control');
  for (const gone of ['Look', 'Double-tap and hold']) assert.ok(!keys.includes(gone), `${gone} is merged into another row`);
  assert.deepEqual(SHELL.introControls.map(r => r[0]), keys, 'the start page has the same rows');
  for (const [k, v] of SHELL.introControls) assert.ok(typeof v === 'string' && v.length > 0, `${k} has short words`);
  // what the browser test of the Esc page reads (tests/browser-player-focus.mjs) is still said
  const li = SHELL.instructions.find(t => t.includes('Press 1, 2, 3 or 4'));
  assert.match(li, /left arm, left leg, right leg or right arm/);
  assert.match(li, /In the eye view, look a little up or down to move it at the shoulder or hip/);
  assert.match(li, /Use the pointer to keep the limb in view/);
  assert.doesNotMatch(li, /Your view turns only|camera turns automatically/);
  const full = SHELL.instructions.join('\n');
  assert.match(full, /the head and neck turn, and past their reach the eyes turn further/);
  assert.match(full, /Rest your look on a motor area to move its body part\. Click to repeat the movement\./);
  assert.doesNotMatch(full, /trunk bends|press a number (?:key|to choose)|press the numbers/i);
  const rows = SHELL.controls.map(r => r.join(' ')).join('\n');
  assert.match(rows, /past their reach your eyes turn further/);
  assert.match(rows, /in the eye view the chosen limb goes with your view/);
  // M, the electrical map, is in the Controls list and says it is made up, not a recording (package item 9)
  const m = SHELL.controls.find(r => r[0] === 'M');
  assert.ok(m && /electrical map/.test(m[1]) && /made up/.test(m[1]) && /not a recording/.test(m[1]));
});

test('H14: the short Esc page names the drag without Space, the limb drag, the arrow tips and a free pointer; no held-only drag row', () => {
  const rows = Object.fromEntries(SHELL.menu.flatMap(g => g.rows));
  // (second pass: one row for the two ways, not two rows with the same words)
  assert.equal(rows['Drag, arrow tips'], 'turn the brain or mirror body');
  const does = SHELL.menu.flatMap(g => g.rows.map(r => r[1]));
  assert.equal(new Set(does).size, does.length, 'no two rows say the same');
  assert.equal(rows['Esc twice'], 'play with a free mouse pointer');
  assert.doesNotMatch(SHELL.menu.flatMap(g => g.rows.flat()).join(' '), /held brain/);
  assert.match(SHELL.menu.find(g => g.id === 'move').note, /Press on a limb and drag to turn or bend it\./);
  assert.match(SHELL.menu.find(g => g.id === 'move').note, /In the eye view the chosen limb goes with your view: look up to raise it, down to lower it/);
  assert.equal(SHELL.menu.find(g => g.id === 'hold').rows[0][1], 'hands and feet grip; tap toggles');
});

test('H13: the reload note shows on the short Esc page too, unless it is hidden', () => {
  const q = css('quiet.css');
  assert.match(q, /\.ns-shell\[data-mode="paused"\]\[data-words="short"\] \.ns-shell-guidehelp/, 'the help texts stay hidden there');
  assert.match(q, /\.ns-shell\[data-mode="paused"\]\[data-words="short"\] \.ns-shell-qualityreload:not\(\[hidden\]\) \{ display: block; \}/);
});

test('H26: the tutorial\'s second step asks for an area that moves while the look rests on one that moves nothing', () => {
  let g = createGuide({ tutorial: true, features: { thirdPerson: true } });
  g = guideStep(g, [{ type: 'activate', regionId: 'lh_throat', isLeftArm: false, kind: 'effector', moves: true, source: 'gaze' }], 1);
  assert.equal(guideView(g, 1).goalId, 'pressArea');
  assert.equal(guideView(g, 1).text, GUIDE.goals.pressArea);
  // the look steps on to the lower in-between area (moves nothing): the line says so, in both forms
  // (20 s on: past the "Nice!" of the step just done)
  g = guideStep(g, [{ type: 'activate', regionId: 'lh_scan_inferior', isLeftArm: false, kind: 'integration', moves: false, source: 'gaze' }], 20);
  let v = guideView(g, 20);
  assert.equal(v.goalId, 'pressArea');
  assert.equal(v.text, GUIDE.partial.pressAreaStill);
  assert.equal(quietPromptText(v, GUIDE.short), 'Nothing moves there: look at a colour');
  assert.ok(GUIDE.short.byText[GUIDE.partial.pressAreaStill].length <= 48);
  // a click there moves nothing and does not count; the Tongue (an effector without a movement) the same
  g = guideStep(g, [{ type: 'activate', regionId: 'lh_scan_inferior', isLeftArm: false, kind: 'integration', moves: false, source: 'click' }], 21);
  g = guideStep(g, [{ type: 'activate', regionId: 'lh_tongue', isLeftArm: false, kind: 'effector', moves: false, source: 'gaze' }], 22);
  v = guideView(g, 22);
  assert.equal(v.goalId, 'pressArea');
  assert.equal(v.text, GUIDE.partial.pressAreaStill);
  // a look at an area that moves brings the step's own line back; a click there does the step
  g = guideStep(g, [{ type: 'activate', regionId: 'lh_neck', isLeftArm: false, kind: 'effector', moves: true, source: 'gaze' }], 23);
  assert.equal(guideView(g, 23).text, GUIDE.goals.pressArea);
  g = guideStep(g, [{ type: 'activate', regionId: 'lh_neck', isLeftArm: false, kind: 'effector', moves: true, source: 'click' }], 24);
  assert.equal(guideView(g, 24).goalId, 'chooseLimb');
});

test('H11: the status card has the whole bottom-left stack before the colour key takes anything; the key drops whole parts', () => {
  assert.equal(CORNER_STACK.statusFirst, true);
  // 800 by 600 with the "Try this" line in the card (the hunt's case: 359 px against a cap of 297)
  const f = cornerStackFit({ height: 600, topPx: 28, gapPx: 12, statusH: 359, legendH: 337 });
  assert.ok(f.statusMax >= 359, `status card cap ${f.statusMax}`);
  assert.equal(f.statusY, 600 - 12 - CORNER_STACK.footPx - 359);
  assert.equal(f.legendMax, 600 - 12 - CORNER_STACK.footPx - 28 - 12 - 359);
  // the share rule, behind its switch
  const old = cornerStackFit({ height: 600, topPx: 28, gapPx: 12, statusH: 359, legendH: 337, rules: { ...CORNER_STACK, statusFirst: false } });
  assert.equal(old.statusMax, 297, 'update 64: 55 % of the stack');
  // the key: whole where it fits; without its rights row; without its key items and note too; not shown
  const drop = [71, 52];
  assert.equal(legendFitLevel({ maxPx: 400, fullPx: 337, dropPx: drop }), 0);
  assert.equal(legendFitLevel({ maxPx: 305, fullPx: 337, dropPx: drop }), 1);
  assert.equal(legendFitLevel({ maxPx: 220, fullPx: 337, dropPx: drop }), 2);
  assert.equal(legendFitLevel({ maxPx: 169, fullPx: 337, dropPx: drop }), 3);
  assert.equal(legendFitLevel({ maxPx: 0, fullPx: 337, dropPx: drop }), 3);
  assert.equal(legendFitLevel({ maxPx: 305, fullPx: 0, dropPx: drop }), 0, 'not measured yet: whole');
  assert.equal(legendFitLevel({ maxPx: 305, fullPx: 337, dropPx: drop, rules: { ...LEGEND_FIT, on: false } }), 0);
  // the slack: a key that would fit to the pixel takes the next level
  assert.equal(legendFitLevel({ maxPx: 337, fullPx: 337, dropPx: drop }), 1);
  const q = css('quiet.css');
  assert.match(q, /\.ns-hud \.ns-panel-legend\[data-ns-fit\] \.ns-slot-rights,/, 'level 1 drops the credits line, not "Sources and rights"');
  assert.doesNotMatch(q, /data-ns-fit\] \.ns-rights/, 'the row with "Sources and rights" (the HUD\'s one control) stays');
  assert.match(q, /\.ns-hud \.ns-panel-legend\[data-ns-fit="3"\] \{ visibility: hidden; \}/);
  // a status card too tall even for the whole stack keeps its model-name line at its foot, whole, with no fade over it
  assert.match(q, /\.ns-hud \.ns-panel-info\[data-ns-capped="true"\] \.ns-slot-title \{ position: sticky; bottom: 0;/);
  assert.match(q, /\.ns-hud \.ns-panel-info\[data-ns-capped="true"\] \{ -webkit-mask-image: none; mask-image: none; \}/);
});

test('H12: R opens the information card at its top where More detail fits, else just far enough, under the kept title', () => {
  assert.equal(INFO_DETAIL_REVEAL.on, true);
  // 1920 by 1080 (the hunt: More detail ends at 537 px of a 711 px card): no scroll
  assert.equal(infoRevealScroll({ detailTop: 493 + INFO_DETAIL_CONTEXT_PX, viewH: 711, stickH: 26 }), 0);
  // 1280 by 720, Eyebrows (More detail at 502 px of a 473 px card): More detail starts right under the title
  assert.equal(infoRevealScroll({ detailTop: 502, viewH: 473, stickH: 26 }), 476);
  // the RP10 rule, behind its switch
  assert.equal(infoRevealScroll({ detailTop: 502, viewH: 473, stickH: 26, rules: { ...INFO_DETAIL_REVEAL, on: false } }), 478);
  assert.equal(infoRevealScroll({ detailTop: NaN, viewH: 473 }), 0);
  assert.match(css('neurosurge.css'), /\.ns-infopanel:has\(\.ns-infopanel-detail\[open\]\) \.ns-infopanel-title \{\s*position: sticky;\s*top: -10px;/);
});

/* ---- second pass (22 November 2026), after a check of section 197 ---- */

test('second pass: the limits list keeps the honesty core only, and the cards put the short map line first', () => {
  const lim = SHELL.limits.join('\n');
  assert.ok(words(lim) <= 340, `limits ${words(lim)} words (was 617)`);
  for (const core of [HONESTY.simulated.plain, HONESTY.virtualInputs.plain, HONESTY.emg.plain, HONESTY.glow.plain, HONESTY.notExact.plain,
    HONESTY.overlapVary.plain, HONESTY.bodyWorlds.short, HONESTY.mirror.plain, HONESTY.notDecoder.plain]) assert.ok(lim.includes(core), core.slice(0, 40));
  assert.doesNotMatch(lim, /BA6|BA4|9 mm|latissimus|Through your own eyes/, 'atlas detail and repeats are on the notes page');
  assert.match(readFileSync(new URL('../PREVIEW-NOTES.html', import.meta.url), 'utf8'), /premotor cortex, BA6/);
  assert.equal(INFO.caveats[0], HONESTY.notExact.plain);
  assert.equal(INFO.caveats[1], HONESTY.overlapVary.plain);
});

test('second pass: a card without More detail drops whole "Keep in mind" lines from the end', () => {
  assert.equal(INFO_FIT.on, true);
  assert.equal(caveatsToDrop([300, 420, 560, 600], 572), 1, 'the last line ends in the fade: dropped');
  assert.equal(caveatsToDrop([300, 420, 560, 600], 500), 2);
  assert.equal(caveatsToDrop([300, 420, 560, 600], 700), 0);
  assert.equal(caveatsToDrop([300, 420, 560, 600], 572, false), 0, 'a card that fits drops nothing');
  assert.equal(caveatsToDrop([300, 420], 100), 2);
});

test('second pass: with the pointer captured the wheel scrolls an open card that is taller than its box', () => {
  const card = { scrollHeight: 2000, clientHeight: 400, scrollTop: 500 };
  assert.equal(lockedCardScroll(card, { deltaY: 120, deltaMode: 0 }), 620);
  assert.equal(lockedCardScroll(card, { deltaY: -3, deltaMode: 1 }), 452, 'lines of 16 px');
  assert.equal(lockedCardScroll(card, { deltaY: 1, deltaMode: 2 }), 900, 'a page is the card\'s height');
  assert.equal(lockedCardScroll({ ...card, scrollTop: 1550 }, { deltaY: 200 }), 1600, 'not past the end');
  assert.equal(lockedCardScroll({ ...card, scrollTop: 20 }, { deltaY: -200 }), 0);
  assert.equal(lockedCardScroll(card, { deltaY: 100, shiftKey: true }), null, 'Shift turns the wheel sideways: not for the card');
  assert.equal(lockedCardScroll({ scrollHeight: 400, clientHeight: 400, scrollTop: 0 }, { deltaY: 100 }), null, 'a card that fits');
  assert.equal(lockedCardScroll(card, { deltaY: 0, deltaX: 50 }), null);
  const n = css('neurosurge.css');
  assert.match(n, /\.ns-infopanel:has\(\.ns-infopanel-detail\[open\]\) \{[^}]*mask-image: linear-gradient\(to bottom, #000 calc\(100% - 16px\), transparent\);[^}]*padding-bottom: 18px;/, 'the open card fades at its foot, and its last line clears the fade');
});

test('second pass: the colour key measures its credits line itself; the corner card carries the tutorial\'s short words', () => {
  assert.ok(!('summaryPx' in LEGEND_FIT), 'no estimate of the row with only "Sources and rights"');
  assert.match(css('quiet.css'), /\.ns-hud \.ns-slot-rights \{ display: block; \}/);
  assert.equal(GUIDE_CARD_SHORT.on, true);
  // a stack with less room than minPx for the key: the key's cap is never 0 (0 meant none)
  const f = cornerStackFit({ height: 480, topPx: 28, gapPx: 12, statusH: 430, legendH: 337 });
  assert.ok(f.legendMax < CORNER_STACK.minPx);
});
