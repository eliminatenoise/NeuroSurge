// Hunt of update 74, finding 8 (package HUD3, fault 4): a click on a motor area is never lost while Space grips, and
// with Shift held where nothing is behind. In Chromium at 1600x900, the pointer free, the tutorial skipped:
//  1. Space grips with the pointer on nothing; the pointer then rests on a motor area: it is named beside the pointer
//     and a click presses it (update 80: the click pressed nothing, the mark in the middle being on the brain's outline);
//  2. Shift held on a motor area with nothing behind it: the status line says click, Space and drag work as usual; a
//     click presses the area (update 80: nothing, while the tip named the area's movement); Shift + Space holds the brain;
//  3. the brain carried with Space: the pointer moves onto one of its areas and rests, the tip beside the pointer names
//     the area and what a click starts, also within the hold's first 1.2 s (a second review: then the hold's tip showed
//     by the mark while a click pressed the area; at a pointer that has not moved since Space went down the hold's tip
//     shows then, beside the pointer with a line naming the click: case 2 checks that), and a click presses that area; on the glass the hold's tip is by the mark; at the full
//     reading level the "Looking at" card names the area and the click's movement (it said "brain glass ... (nothing
//     switches on)" while the click switched the area on), and on the glass that nothing switches on;
//  4. the mark on a motor area (an arrow key's step), Space gripping nothing at the pointer: a click on another area
//     presses the pointer's area (update 80: the mark's);
//  5. a limb turn (Space tapped, then held): the pointer rests on a motor area, which is named beside it, and a click
//     presses it (the first fix: the click pressed it with no tip there; update 80: nothing);
//  6. a press-and-drag from a motor area during a grip on nothing, and with Shift held and nothing behind: each turns
//     the brain and presses nothing (a review of the first fix: each press clicked at once and its drag turned the look,
//     so it pressed the area at the drag's start; update 80 pressed nothing, or the mark's area during the grip);
//  7. the brain carried and pulled in with S until its clear glass is in front of the mirror body: a click on the
//     mirror body seen through the glass taps its muscle, as in update 80 (the first fix pressed nothing);
//  8. the pointer captured, the mirror body carried and the look on a motor area behind it: a click does not press that
//     area (update 80: it did); it taps the carried mirror body's muscle.
//  9. a left-hand finger or thumb area while Space grips (the grip refuses its movement): during a grip on nothing and
//     while the brain is carried, the tip and the full card say the hand grips, the hold's own tip names no click, and a
//     click presses nothing; let go, a click there presses the area (a third review: the tip named the movement);
// 10. the brain carried at the full level: while the pointer moves the card follows it (it kept the last rest's line);
// 11. Space on a mirror-body muscle: the hold's tip says "Click: switch on the brain area for ..." (it had no verb).
// Run with Node and Playwright (NS_PLAYWRIGHT_MODULE, NS_CHROMIUM, NS_ANGLE as for the other browser tests).
// NS_SPACE_CLICK_SCREENSHOTS=<prefix> saves pictures.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { captureMouse } from './capture-mouse.mjs';

const root = process.env.NS_TEST_ROOT ? resolve(process.env.NS_TEST_ROOT) : fileURLToPath(new URL('../', import.meta.url));
const { createHandler, HOST } = await import(pathToFileURL(resolve(root, 'serve-local.mjs')));
const { CARRY_TIP } = await import(pathToFileURL(resolve(root, 'scene/src/ns-app.mjs')));
const CARRY_TIP_MS = CARRY_TIP.afterMs; // the hold's own tip shows this long at a pointer not moved since Space went down
const { chromium } = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const allowedHosts = new Set();
const server = createServer(createHandler({ root, allowedHosts }));
server.listen(0, HOST);
await once(server, 'listening');
const host = HOST + ':' + server.address().port;
allowedHosts.add(host);
const args = ['--disable-background-networking'];
if (process.env.NS_ANGLE) args.push('--use-angle=' + process.env.NS_ANGLE);
const width = 1600, height = 900;
const errors = [];
const report = { errors };
let browser;

try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  report.chromium = browser.version();
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(45_000);
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto('http://' + host + '/scene/example/preview.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#ns-app')?.dataset.nsPhase === 'playing');
  const shot = async name => { if (process.env.NS_SPACE_CLICK_SCREENSHOTS) await page.screenshot({ path: `${process.env.NS_SPACE_CLICK_SCREENSHOTS}-${name}.png` }); };
  const read = () => page.evaluate(() => {
    const s = window.__nsQA.inspect(), tip = document.querySelector('.ns-tip');
    return { frames: s.frames, mode: s.shell.mode, lock: document.pointerLockElement?.id ?? null, input: s.controlTargets, gaze: s.state.gaze.regionId,
      trigger: s.state.trigger, look: [s.controls.yaw, s.controls.pitch], carry: s.state.objectCarry?.held ? s.state.objectCarry.target : null,
      grip: s.state.activity?.graspHold === true, guide: document.querySelector('.ns-prompt-count')?.textContent ?? null,
      tip: tip && tip.getClientRects().length ? { kind: tip.dataset.kind, text: tip.innerText, box: (r => [r.left, r.top, r.right, r.bottom])(tip.getBoundingClientRect()) } : null };
  });
  const frames = async (n = 6) => { const from = (await read()).frames; await page.waitForFunction(({ from, n }) => window.__nsQA.inspect().frames >= from + n, { from, n }, { polling: 40 }); return read(); };
  const rested = async () => { await page.waitForTimeout(260); return frames(4); }; // well past FREE_AIM.restMs
  const quiet = async () => { await page.waitForTimeout(1600); return frames(4); }; // a movement started before has ended
  const click = async () => { await page.mouse.down(); await page.waitForTimeout(50); await page.mouse.up(); };
  const pressedAfter = async (seq) => { await page.waitForTimeout(450); return frames(4).then(s => (s.trigger.seq > seq ? s.trigger : null)); };
  const nearPoint = (box, [x, y], dx = 180, dy = 110) => box[0] < x + dx && box[2] > x - dx && Math.abs((box[1] + box[3]) / 2 - y) < dy;

  await frames();
  for (let i = 0; i < 12 && (await read()).guide; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(220); } // the tutorial is skipped
  // motor areas under the free pointer at the top of the strip, and a place with nothing under the pointer
  const findAreas = async (n, skip = null) => {
    const found = new Map();
    for (let y = 34; y <= 450 && found.size < n; y += 22) for (let x = 448; x <= 1152 && found.size < n; x += 22) {
      await page.mouse.move(x, y);
      const s = await frames(3);
      const m = /^brain:area:(?!.*(?:scan|tongue))(.+)$/.exec(s.input.front || '');
      if (s.input.at === 'pointer' && m && m[1] !== skip && !found.has(m[1])) found.set(m[1], [x, y]);
    }
    return [...found];
  };
  const areas = await findAreas(3);
  report.areas = areas.map(a => a[0]);
  assert.ok(areas.length >= 2, `motor areas under the pointer (${areas.length})`);
  const empty = [width - 40, 70];
  await page.mouse.move(...empty);
  const emptyNow = await rested();
  assert.equal(emptyNow.input.at, 'pointer');
  assert.equal(emptyNow.input.front, null, 'nothing under the pointer at the top right');

  // 1. Space grips with the pointer on nothing, then a click on a motor area presses it.
  report.grip = [];
  for (const [id, p] of areas.slice(0, 2)) {
    await page.mouse.move(...empty, { steps: 4 }); await quiet();
    await page.keyboard.down('Space');
    const gripping = await frames(6);
    assert.equal(gripping.grip, true, 'Space down on nothing: the hands grip');
    assert.equal(gripping.carry, null, 'and nothing is carried');
    await page.mouse.move(p[0], p[1], { steps: 4 });
    const on = await rested();
    assert.equal(on.input.at, 'pointer', 'while the hands grip nothing, the pointer is the aim');
    assert.equal(on.input.front, `brain:area:${id}`);
    assert.equal(on.tip?.kind, 'area', 'the area is named beside the pointer');
    assert.ok(nearPoint(on.tip.box, p), `the tip is beside the pointer (${JSON.stringify(on.tip.box.map(Math.round))} at ${p})`);
    await shot(`grip-${id}`);
    await click();
    const pressed = await pressedAfter(on.trigger.seq);
    assert.ok(pressed, `a click on ${id} during the grip presses something`);
    assert.equal(pressed.source, 'click');
    assert.equal(pressed.regionId, id, 'the click presses the area under the pointer');
    await page.keyboard.up('Space');
    const up = await frames(6);
    assert.equal(up.grip, false);
    report.grip.push({ area: id, tip: on.tip.text.split('\n')[0], pressed: `${pressed.source}:${pressed.regionId}` });
  }

  // 2. Shift held on an area with nothing behind it: a plain click, and Shift + Space holds the brain.
  {
    const [id, p] = areas[0];
    await page.mouse.move(...empty, { steps: 4 }); await quiet();
    await page.mouse.move(p[0], p[1], { steps: 4 }); await quiet();
    await page.keyboard.down('Shift');
    const held = await frames(6);
    assert.equal(held.input.reach, true);
    assert.equal(held.input.front, `brain:area:${id}`);
    assert.equal(held.input.behind, null, 'nothing behind the area');
    assert.equal(held.input.line, 'Shift held: nothing behind, so click, Space and drag work as usual');
    await click();
    const pressed = await pressedAfter(held.trigger.seq);
    await page.keyboard.up('Shift');
    assert.ok(pressed, 'Shift + click with nothing behind presses the area');
    assert.equal(pressed.source, 'click');
    assert.equal(pressed.regionId, id);
    report.shift = { area: id, line: held.input.line, pressed: `${pressed.source}:${pressed.regionId}` };
    // Shift + Space there holds the brain, as plain Space
    await page.mouse.move(...empty, { steps: 4 }); await quiet();
    await page.mouse.move(p[0], p[1], { steps: 4 }); await quiet();
    await page.keyboard.down('Shift'); await frames(4);
    await page.keyboard.down('Space');
    await page.waitForTimeout(400); // longer than a tap (a tap keeps the hold)
    const shiftSpace = await frames(4);
    await page.keyboard.up('Space'); await page.keyboard.up('Shift');
    assert.equal(shiftSpace.carry, 'brain', 'Shift + Space with nothing behind holds the brain, as Space does');
    assert.equal(shiftSpace.tip?.kind, 'hold', 'at first the tip says what is held, the pointer not moved since');
    assert.match(shiftSpace.tip.text, /^Holding the brain\nClick: .+\nLet go of Space\.$/, `with what a click at the pointer presses (${JSON.stringify(shiftSpace.tip.text)})`);
    assert.ok(nearPoint(shiftSpace.tip.box, p), `beside the pointer, where the click acts (${JSON.stringify(shiftSpace.tip.box.map(Math.round))} at ${p})`);
    report.shift.space = shiftSpace.carry;
    await frames(6);
    await page.mouse.move(...empty, { steps: 4 }); await quiet();
  }

  // 3. The brain carried: the resting pointer on one of its areas names it and what a click starts; the click presses
  // that area; on the glass the hold's tip is by the mark.
  {
    let glass = null;
    for (let y = 450; y <= 700 && !glass; y += 30) for (let x = 420; x <= 1180; x += 30) {
      await page.mouse.move(x, y);
      const s = await frames(3);
      if (s.input.at === 'pointer' && /^brain:(glass|outline)/.test(s.input.front || '') && !s.input.arrow) { glass = [x, y]; break; }
    }
    assert.ok(glass, 'the brain\'s glass under the pointer');
    const [id, p] = areas[0];
    await quiet();
    await page.keyboard.down('Space');
    const carrying = await frames(6);
    assert.equal(carrying.carry, 'brain', 'Space on the glass takes the brain');
    const downAt = Date.now();
    for (let j = 1; j <= 6; j++) { await page.mouse.move(glass[0] + (p[0] - glass[0]) * j / 6, glass[1] + (p[1] - glass[1]) * j / 6); await page.waitForTimeout(30); }
    const moved = await rested(); // (within the hold's first 1.2 s: the pointer has moved since Space went down)
    report.carriedTipMs = Date.now() - downAt;
    assert.notDeepEqual(moved.look, carrying.look, 'the pointer turns the look while the brain is carried');
    assert.equal(moved.input.at, 'crosshair', 'while carrying, the mark is the aim');
    assert.equal(moved.tip?.kind, 'area', 'the area under the resting pointer is named');
    assert.match(moved.tip.text, /\nClick: /, 'with what a click there starts');
    assert.ok(nearPoint(moved.tip.box, p), `beside the pointer (${JSON.stringify(moved.tip.box.map(Math.round))} at ${p})`);
    await shot('carried-brain-tip');
    await click();
    const pressed = await pressedAfter(moved.trigger.seq);
    const after = await read();
    assert.ok(pressed, 'a click on an area of the carried brain presses something');
    assert.equal(pressed.source, 'click');
    assert.equal(pressed.regionId, id, 'the area under the pointer (the carried brain keeps its place in the picture)');
    assert.equal(after.carry, 'brain', 'the brain is still carried');
    for (let j = 1; j <= 6; j++) { await page.mouse.move(p[0] + (glass[0] - p[0]) * j / 6, p[1] + (glass[1] - p[1]) * j / 6); await page.waitForTimeout(30); } // the look back
    const back = await rested();
    assert.equal(back.tip?.kind, 'hold', 'on the glass, where a click takes nothing, the hold\'s tip');
    assert.match(back.tip.text, /Holding the brain/);
    assert.ok(nearPoint(back.tip.box, [width / 2, height / 2], 260, 120), `by the mark (${JSON.stringify(back.tip.box.map(Math.round))})`);
    await page.keyboard.up('Space');
    await frames(6);
    report.carriedBrain = { area: id, tip: moved.tip.text.replace(/\n/g, ' | '), pressed: `${pressed.source}:${pressed.regionId}`, onGlass: back.tip.text.split('\n')[0] };
    // the full reading level: the "Looking at" card says what the click at the resting pointer presses
    const level = () => page.evaluate(() => document.querySelector('[data-ns-read]')?.getAttribute('data-ns-read'));
    const toLevel = async lv => { for (let i = 0; i < 4 && (await level()) !== lv; i++) { await page.keyboard.press('r'); await page.waitForTimeout(350); } assert.equal(await level(), lv); };
    const card = () => page.evaluate(() => { const e = document.querySelector('.ns-slot-gaze'); return e && !e.hidden && e.getClientRects().length ? e.textContent : null; });
    await toLevel('more');
    await page.mouse.move(...glass, { steps: 4 }); await quiet();
    await page.keyboard.down('Space');
    assert.equal((await frames(6)).carry, 'brain');
    for (let j = 1; j <= 6; j++) { await page.mouse.move(glass[0] + (p[0] - glass[0]) * j / 6, glass[1] + (p[1] - glass[1]) * j / 6); await page.waitForTimeout(30); }
    const full = await rested();
    const line = await card();
    assert.match(line || '', /^Looking at \(motor area\): .+ · Click: /, `the card names the area and the click's movement (${line})`);
    assert.doesNotMatch(line, /nothing switches on/);
    await shot('carried-brain-full');
    await click();
    const fullPressed = await pressedAfter(full.trigger.seq);
    assert.ok(fullPressed && fullPressed.regionId === id, 'the click presses the area the card names');
    assert.equal(await card(), line, 'and the card still names it');
    for (let j = 1; j <= 6; j++) { await page.mouse.move(p[0] + (glass[0] - p[0]) * j / 6, p[1] + (glass[1] - p[1]) * j / 6); await page.waitForTimeout(30); }
    await rested();
    assert.match(await card() || '', /nothing switches on/, 'on the glass, where a click takes nothing, the card says so');
    await page.keyboard.up('Space');
    await frames(6);
    await toLevel('read');
    report.carriedBrain.fullCard = line;
  }

  // 4. The mark on an area, Space gripping nothing at the pointer: a click on another area presses the pointer's.
  {
    await page.mouse.move(...empty, { steps: 4 }); await quiet();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => window.__nsQA.inspect().areaStep?.to);
    const stepped = await quiet();
    const mark = stepped.gaze;
    assert.ok(mark, 'the arrow key put the mark on an area');
    const [[id, p]] = await findAreas(1, mark);
    await page.mouse.move(empty[0], empty[1] + 12, { steps: 3 }); // the pointer is the aim again, on nothing
    const parked = await quiet();
    assert.equal(parked.input.at, 'pointer');
    assert.equal(parked.input.front, null);
    await page.keyboard.down('Space');
    const gripping = await frames(6);
    assert.equal(gripping.carry, null, 'Space at the pointer took nothing: a grip');
    await page.mouse.move(p[0], p[1], { steps: 4 });
    const on = await rested();
    assert.equal(on.input.at, 'pointer');
    await click();
    const pressed = await pressedAfter(on.trigger.seq);
    await page.keyboard.up('Space');
    assert.ok(pressed, 'the click presses something');
    assert.equal(pressed.regionId, id, `the area under the pointer, not the one under the mark (${mark})`);
    report.markOnArea = { mark, area: id, pressed: `${pressed.source}:${pressed.regionId}` };
    await frames(6);
  }

  // 5. A limb turn (Space tapped, then pressed and held): the pointer is the aim, its area is named beside it, and a
  // click presses it. (The arrow key of case 4 turned the look: an area is found again.)
  {
    const [[id, p]] = await findAreas(1);
    await page.mouse.move(...empty, { steps: 4 }); await quiet();
    await page.keyboard.down('Space'); await page.waitForTimeout(60); await page.keyboard.up('Space'); await page.waitForTimeout(90);
    await page.keyboard.down('Space');
    const turning = await frames(8);
    assert.equal(turning.carry, null);
    await page.mouse.move(p[0], p[1], { steps: 4 });
    const on = await rested();
    assert.equal(on.input.at, 'pointer', 'during a limb turn the pointer is the aim');
    assert.equal(on.input.front, `brain:area:${id}`);
    assert.equal(on.tip?.kind, 'area', 'the area is named');
    assert.ok(nearPoint(on.tip.box, p), `beside the pointer (${JSON.stringify(on.tip.box.map(Math.round))} at ${p})`);
    await shot('turn');
    await click();
    const pressed = await pressedAfter(on.trigger.seq);
    await page.keyboard.up('Space');
    assert.ok(pressed, 'a click during the turn presses something');
    assert.equal(pressed.regionId, id, 'the area named beside the pointer');
    report.turn = { area: id, tip: on.tip.text.split('\n')[0], pressed: `${pressed.source}:${pressed.regionId}` };
    await quiet();
  }

  // 6. A press-and-drag from a motor area during a grip on nothing, and with Shift held and nothing behind: each turns
  // the brain, as a drag from an area at any other time, and presses nothing. (Each drag turns the brain: the pause
  // page's "Reset brain view" puts it back between them.)
  const dragFrom = async ([x, y]) => { await page.mouse.down(); await page.waitForTimeout(40); for (let j = 1; j <= 10; j++) { await page.mouse.move(x + 8 * j, y + 4 * j); await page.waitForTimeout(20); } await page.waitForTimeout(120); await page.mouse.up(); };
  const resetBrain = async () => {
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Reset brain view', exact: true }).click(); await page.waitForTimeout(250);
    if ((await read()).mode !== 'playing') { await page.keyboard.press('Escape'); await page.waitForTimeout(700); }
    await page.mouse.move(...empty, { steps: 3 }); return quiet();
  };
  {
    assert.equal((await resetBrain()).mode, 'playing');
    const [[id, p]] = await findAreas(1);
    await page.mouse.move(...empty, { steps: 4 }); await quiet();
    await page.keyboard.down('Space');
    await frames(6);
    await page.mouse.move(p[0], p[1], { steps: 4 });
    const on = await quiet();
    assert.equal(on.input.front, `brain:area:${id}`);
    await dragFrom(p);
    const after = await quiet();
    await page.keyboard.up('Space');
    assert.equal(after.trigger.seq, on.trigger.seq, `a drag from ${id} during the grip presses nothing (${after.trigger.source}:${after.trigger.actionId})`);
    assert.deepEqual(after.look, on.look, 'it turns the brain, not the look, as a drag from an area at any other time');
    report.gripDrag = { area: id, pressed: after.trigger.seq === on.trigger.seq ? 'nothing' : after.trigger.actionId };
    await frames(6);
    const home = await resetBrain();
    assert.equal(home.mode, 'playing');
    await page.mouse.move(p[0], p[1], { steps: 4 });
    const again = await quiet();
    assert.equal(again.input.front, `brain:area:${id}`, 'the brain is back in its place');
    await page.keyboard.down('Shift');
    const before = await frames(6);
    assert.equal(before.input.behind, null, 'nothing behind the area');
    await dragFrom(p);
    const dragged = await quiet();
    await page.keyboard.up('Shift');
    assert.equal(dragged.trigger.seq, before.trigger.seq, `Shift + drag from ${id} with nothing behind presses nothing (${dragged.trigger.source}:${dragged.trigger.actionId})`);
    assert.deepEqual(dragged.look, before.look, 'Shift + drag with nothing behind turns the brain, as a plain drag, not the look');
    report.shiftDrag = { area: id, pressed: dragged.trigger.seq === before.trigger.seq ? 'nothing' : dragged.trigger.actionId };
  }

  // 7. The brain carried (Shift + Space where the mirror body is in front of it) and pulled in with S until its clear
  // glass is in front of the mirror body: a click on the mirror body seen through the glass taps its muscle. (From the
  // start look: the page is opened again.)
  const reopen = async () => {
    await page.goto('http://' + host + '/scene/example/preview.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#ns-app')?.dataset.nsPhase === 'playing');
    await frames();
    for (let i = 0; i < 12 && (await read()).guide; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(220); }
  };
  {
    await reopen();
    let P = null;
    for (let y = 200; y <= 420 && !P; y += 12) for (const x of [800, 788, 812, 776, 824]) {
      await page.mouse.move(x, y);
      const s = await frames(3);
      if (s.input.at === 'pointer' && /^mirror:muscle/.test(s.input.front || '') && /^brain:/.test(s.input.behind || '') && !s.input.arrow) { P = [x, y]; break; }
    }
    assert.ok(P, 'a place where the mirror body is seen in front of the brain');
    await page.mouse.move(...empty, { steps: 3 }); await quiet();
    await page.mouse.move(P[0], P[1], { steps: 4 }); await quiet();
    await page.keyboard.down('Shift'); await page.waitForTimeout(300); await page.keyboard.down('Space'); await page.waitForTimeout(400); await page.keyboard.up('Shift');
    const carrying = await quiet();
    assert.equal(carrying.carry, 'brain', 'Shift + Space takes the brain behind the mirror body');
    await page.keyboard.down('KeyS'); await page.waitForTimeout(1800); await page.keyboard.up('KeyS');
    const pulled = await quiet();
    assert.equal(pulled.carry, 'brain');
    assert.equal(pulled.tip?.kind, 'muscle', 'the mirror body\'s muscle seen through the glass is named beside the pointer');
    assert.ok(nearPoint(pulled.tip.box, P), `beside the pointer (${JSON.stringify(pulled.tip.box.map(Math.round))} at ${P})`);
    await shot('glass-in-front');
    await click();
    const pressed = await pressedAfter(pulled.trigger.seq);
    await page.keyboard.up('Space');
    assert.ok(pressed, 'a click on the mirror body seen through the carried brain\'s glass taps its muscle');
    assert.equal(pressed.source, 'click');
    report.throughGlass = { place: P, tip: pulled.tip.text, pressed: `${pressed.source}:${pressed.regionId}:${pressed.actionId}` };
  }

  // 8. The pointer captured, the mirror body carried with the look on a motor area behind it: a click does not press
  // that area. (From the start look: the page is opened again.)
  {
    await page.goto('http://' + host + '/scene/example/preview.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#ns-app')?.dataset.nsPhase === 'playing');
    await frames();
    for (let i = 0; i < 12 && (await read()).guide; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(220); }
    await captureMouse(page, width / 2, height / 2);
    let mx = width / 2, my = height / 2;
    const look = async (dx, dy) => { mx += dx; my += dy; await page.mouse.move(mx, my, { steps: 2 }); return frames(3); };
    let s = await frames(4), n = 0;
    while (!/^mirror:/.test(s.input.front || '') && n++ < 60) s = await look(0, -6);
    assert.match(s.input.front || '', /^mirror:/, 'the look comes onto the mirror body');
    await page.keyboard.down('Space');
    s = await frames(6);
    assert.equal(s.carry, 'mirror', 'Space takes the mirror body');
    n = 0;
    while (!(/^brain:area:/.test(s.input.front || '') && /^mirror:/.test(s.input.behind || '')) && n++ < 80) s = await look(-5, 0);
    assert.match(s.input.front || '', /^brain:area:/, 'the look names a motor area behind the carried mirror body');
    assert.match(s.input.behind || '', /^mirror:/);
    const areaBehind = s.input.front.split(':').pop();
    await click();
    const pressed = await pressedAfter(s.trigger.seq);
    await shot('carried-mirror');
    await page.keyboard.up('Space');
    assert.ok(!pressed || pressed.regionId !== areaBehind, `the click did not press ${areaBehind}, behind the carried mirror body (${pressed && pressed.regionId})`);
    if (pressed) assert.equal(pressed.source, 'click', 'it tapped the carried mirror body\'s muscle');
    report.carriedMirror = { areaBehind, pressed: pressed ? `${pressed.source}:${pressed.regionId}:${pressed.actionId}` : null };
  }

  // 9. A left-hand finger or thumb area while Space grips (a third review): the grip holds the left hand closed and its
  // finger and thumb movements do not start, so a rest and a click there press nothing. The tip and the full card say
  // the hand grips (they named "Straighten left little finger"), and the hold's own tip names no click; letting go, a
  // click there presses the area.
  const level = () => page.evaluate(() => document.querySelector('[data-ns-read]')?.getAttribute('data-ns-read'));
  const toLevel = async lv => { for (let i = 0; i < 4 && (await level()) !== lv; i++) { await page.keyboard.press('r'); await page.waitForTimeout(350); } assert.equal(await level(), lv); };
  const card = () => page.evaluate(() => { const e = document.querySelector('.ns-slot-gaze'); return e && !e.hidden && e.getClientRects().length ? e.textContent : null; });
  {
    await reopen();
    let F = null;
    for (let y = 100; y <= 280 && !F; y += 15) for (let x = 470; x <= 720 && !F; x += 15) {
      await page.mouse.move(x, y);
      const s = await frames(3);
      const m = /^brain:area:(rh_(?:little|ring|middle|index|thumb))$/.exec(s.input.front || '');
      if (s.input.at === 'pointer' && m && !s.input.arrow) F = [m[1], [x, y]];
    }
    assert.ok(F, 'a left-hand finger or thumb area under the pointer');
    const [id, p] = F;
    // a grip on nothing, then the pointer on the area
    await page.mouse.move(...empty, { steps: 3 }); await quiet();
    await page.keyboard.down('Space');
    assert.equal((await frames(6)).grip, true);
    await page.mouse.move(p[0], p[1], { steps: 4 });
    const on = await rested();
    assert.equal(on.input.front, `brain:area:${id}`);
    assert.equal(on.tip?.kind, 'area', 'the area is named beside the pointer');
    assert.match(on.tip.text, /\nHand gripping: let go of Space, then click\.$/, `the tip says the hand grips (${JSON.stringify(on.tip.text)})`);
    await shot('grip-finger');
    await click();
    assert.equal(await pressedAfter(on.trigger.seq), null, 'the click presses nothing: the grip holds the hand');
    await page.keyboard.up('Space');
    const open = await rested();
    assert.equal(open.grip, false);
    assert.doesNotMatch(open.tip?.text || '', /gripping/, 'let go: the area\'s own movement');
    await click();
    const pressed = await pressedAfter(open.trigger.seq);
    assert.ok(pressed && pressed.regionId === id, `then a click presses ${id}`);
    report.gripFinger = { area: id, gripTip: on.tip.text.replace(/\n/g, ' | '), openTip: (open.tip?.text || '').replace(/\n/g, ' | '), pressed: `${pressed.source}:${pressed.regionId}:${pressed.actionId}` };
    await quiet();
    // the brain carried with Space pressed at the resting pointer on the area
    await page.mouse.move(...empty, { steps: 3 }); await quiet();
    await page.mouse.move(p[0], p[1], { steps: 3 }); await quiet();
    await page.keyboard.down('Space');
    const hold = await frames(6);
    assert.equal(hold.carry, 'brain');
    assert.equal(hold.tip?.kind, 'hold');
    assert.doesNotMatch(hold.tip.text, /Click/, `the hold's own tip names no click there (${JSON.stringify(hold.tip.text)})`);
    await page.waitForTimeout(CARRY_TIP_MS + 200);
    const later = await frames(4);
    assert.equal(later.tip?.kind, 'area');
    assert.match(later.tip.text, /\nHand gripping: let go of Space, then click\.$/, `after the hold's first 1.2 s (${JSON.stringify(later.tip.text)})`);
    await click();
    assert.equal(await pressedAfter(later.trigger.seq), null, 'the click presses nothing');
    await page.keyboard.up('Space');
    await quiet();
    await toLevel('more');
    await page.keyboard.down('Space');
    await page.waitForTimeout(400); // longer than a tap (a tap keeps the hold)
    assert.equal((await frames(6)).carry, 'brain');
    const line = await card();
    assert.match(line || '', /^Looking at \(motor area\): .+ · Hand gripping: let go of Space, then click\.$/, `the full card says so too (${line})`);
    await shot('carried-finger-full');
    await page.keyboard.up('Space');
    await frames(6);
    report.gripFinger.carried = { holdTip: hold.tip.text.replace(/\n/g, ' | '), restTip: later.tip.text.replace(/\n/g, ' | '), fullCard: line };
  }

  // 10. The brain carried at the full reading level (a third review): the card names the click at the resting pointer,
  // and while the pointer moves it follows the pointer, as the card does for a free pointer at any other time (it kept
  // the last rest's "· Click: bend left knee" all through a move, while a click made as the move ended acted at the
  // pointer's new place).
  {
    // (an area whose movement the grip does not refuse: not the left hand's, case 9)
    const [id, p] = (await findAreas(5)).find(([a]) => !/^rh_(?:little|ring|middle|index|thumb|hand)$/.test(a)) || [];
    assert.ok(id, 'a motor area outside the left hand under the pointer');
    await page.mouse.move(...empty, { steps: 3 }); await quiet();
    await page.mouse.move(p[0], p[1], { steps: 3 }); await quiet();
    await page.keyboard.down('Space');
    await frames(6);
    const atRest = await card();
    assert.match(atRest || '', / · Click: /, `at rest the card names the click at the pointer (${atRest}, ${id})`);
    // a recorder in the page: the card's line at each frame, with the count of pointer moves so far
    await page.evaluate(() => {
      window.__cardRec = { n: 0, rows: [], on: true };
      addEventListener('mousemove', () => { window.__cardRec.n += 1; }, true);
      const tick = () => { const r = window.__cardRec; if (!r.on) return; const e = document.querySelector('.ns-slot-gaze'); r.rows.push({ n: r.n, text: e ? e.textContent : '' }); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    for (let j = 1; j <= 14; j++) { await page.mouse.move(p[0] + j * 8, p[1] + j * 5); await page.waitForTimeout(16); }
    const rows = await page.evaluate(() => { window.__cardRec.on = false; return window.__cardRec.rows; });
    const moving = rows.filter(r => r.n >= 1 && r.n <= 14);
    assert.ok(moving.length >= 4, `frames while the pointer moves (${moving.length})`);
    const lines = [...new Set(moving.map(r => r.text))];
    assert.ok(lines.length >= 2, `the card follows the moving pointer (${JSON.stringify(lines)})`);
    await shot('carry-moved-full');
    const again = (await rested(), await card());
    await page.keyboard.up('Space');
    await frames(6);
    await toLevel('read');
    report.carryMoveCard = { area: id, atRest, moving: lines, rested: again };
  }

  // 11. Space on a mirror-body muscle (a third review): the hold's own tip says what a click there does, with a verb (it
  // read "Click: left temporoparietalis"); the muscle's own tip, after the hold's first 1.2 s, says so too.
  {
    await reopen();
    let P = null;
    for (let y = 90; y <= 260 && !P; y += 8) for (const x of [784, 800, 816, 770, 830]) {
      await page.mouse.move(x, y);
      const s = await frames(3);
      if (s.input.at === 'pointer' && /^mirror:muscle/.test(s.input.front || '') && !s.input.arrow) { P = [x, y]; break; }
    }
    assert.ok(P, 'a mirror-body muscle under the pointer');
    await page.mouse.move(...empty, { steps: 3 }); await quiet();
    await page.mouse.move(P[0], P[1], { steps: 3 }); await quiet();
    await page.keyboard.down('Space');
    const hold = await frames(6);
    assert.equal(hold.carry, 'mirror');
    assert.match(hold.tip?.text || '', /^Holding the mirror body\nClick: switch on the brain area for [a-z].+\nLet go of Space\.$/, `the click line has a verb (${JSON.stringify(hold.tip?.text)})`);
    await page.waitForTimeout(CARRY_TIP_MS + 200);
    const later = await frames(4);
    assert.equal(later.tip?.kind, 'muscle');
    assert.match(later.tip.text, /\nClick: switch on its brain area$/, `the muscle's own tip (${JSON.stringify(later.tip.text)})`);
    await click();
    const pressed = await pressedAfter(later.trigger.seq);
    await page.keyboard.up('Space');
    assert.ok(pressed && pressed.source === 'click' && pressed.regionId, 'the click switches its brain area on');
    report.mirrorMuscle = { place: P, holdTip: hold.tip.text.replace(/\n/g, ' | '), restTip: later.tip.text.replace(/\n/g, ' | '), pressed: `${pressed.source}:${pressed.regionId}:${pressed.actionId}` };
  }

  assert.deepEqual(errors, []);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure = String(error && error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : error);
  console.log(JSON.stringify(report, null, 2));
  throw error;
} finally {
  if (browser) await browser.close();
  server.close();
}
