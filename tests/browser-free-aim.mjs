// 24 November 2026 (FREE_AIM, DESIGN-DECISIONS section 206): the game as it starts, with the pointer free, in Chromium.
// The pointer is the aim: a motor area it comes to rest on is named and switched on, a click on it presses it, a quick
// sweep across the strip switches nothing on, an arrow key puts the aim at the crosshair until the pointer moves again,
// a drag on empty space turns the look, and no step of this captures the pointer.
// Run with Node and Playwright (NS_PLAYWRIGHT_MODULE, NS_CHROMIUM, NS_ANGLE as for the other browser tests).
// NS_RAW=1 refuses the mesh-pack index. NS_FREE_SCREENSHOTS=<prefix> saves pictures.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = process.env.NS_TEST_ROOT ? resolve(process.env.NS_TEST_ROOT) : fileURLToPath(new URL('../', import.meta.url));
const { createHandler, HOST } = await import(pathToFileURL(resolve(root, 'serve-local.mjs')));
const { chromium } = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const allowedHosts = new Set();
const server = createServer(createHandler({ root, allowedHosts }));
server.listen(0, HOST);
await once(server, 'listening');
const host = HOST + ':' + server.address().port;
allowedHosts.add(host);
const args = ['--disable-background-networking'];
if (process.env.NS_ANGLE) args.push('--use-angle=' + process.env.NS_ANGLE);
const raw = process.env.NS_RAW === '1';
const width = 1600, height = 900;
const errors = [];
const report = { raw, errors };
let browser;

try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  report.chromium = browser.version();
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(45_000);
  page.on('pageerror', error => errors.push(String(error)));
  if (raw) await page.route('**/packs/PACK-INDEX.json', route => route.abort());
  await page.goto('http://' + host + '/scene/example/preview.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#ns-app')?.dataset.nsPhase === 'playing');
  const shot = async name => { if (process.env.NS_FREE_SCREENSHOTS) await page.screenshot({ path: `${process.env.NS_FREE_SCREENSHOTS}-${name}.png` }); };
  const read = () => page.evaluate(() => {
    const s = window.__nsQA.inspect(), tip = document.querySelector('.ns-tip');
    return { frames: s.frames, healthy: s.phase === 'running' && s.features.bodyRig && !s.placeholder && !s.qa, mode: s.shell.mode, locked: s.shell.locked,
      lock: document.pointerLockElement?.id ?? null, input: s.controlTargets, gaze: s.state.gaze.regionId, trigger: s.state.trigger,
      look: [s.controls.yaw, s.controls.pitch], carry: s.state.objectCarry?.held ? s.state.objectCarry.target : null,
      tip: tip && tip.getClientRects().length ? { kind: tip.dataset.kind, text: tip.innerText, box: (r => [r.left, r.top, r.right, r.bottom])(tip.getBoundingClientRect()) } : null,
      cross: document.querySelector('.ns-crosshair').className, guide: document.querySelector('.ns-prompt-count')?.textContent ?? null,
      toast: (t => (t && !t.hidden ? t.innerText : ''))(document.querySelector('.ns-shell-toast')) };
  });
  const frames = async (n = 6) => { const from = (await read()).frames; await page.waitForFunction(({ from, n }) => window.__nsQA.inspect().frames >= from + n, { from, n }, { polling: 40 }); return read(); };
  const rested = async () => { await page.waitForTimeout(260); return frames(4); }; // well past FREE_AIM.restMs

  const start = await frames();
  assert.equal(start.healthy, true);
  assert.equal(start.mode, 'playing');
  assert.equal(start.lock, null, 'the game starts with the pointer free');
  assert.equal(start.input.at, 'crosshair', 'before the pointer has moved over the picture the crosshair is the aim');
  assert.equal(start.trigger.seq, 0);
  assert.match(start.toast, /Drag empty space to look around/);
  assert.equal(start.guide, '1/10'); // (ten steps since the look step, section 216)
  assert.doesNotMatch(start.cross, /ns-crosshair-away/);

  // Find motor areas under the pointer on a coarse grid of the upper picture (moving in big steps: nothing rests).
  const areas = new Map();
  for (let y = 100; y <= 400 && areas.size < 12; y += 30) for (let x = 380; x <= 780; x += 30) {
    await page.mouse.move(x, y);
    const s = await frames(3);
    const m = /^brain:area:(.+)$/.exec(s.input.front || '');
    if (s.input.at === 'pointer' && m && !areas.has(m[1])) areas.set(m[1], [x, y]);
  }
  report.areas = [...areas.keys()];
  assert.ok(areas.size >= 6, `the pointer finds motor areas under it (${areas.size})`);
  const scan = await read();
  report.scanStarted = scan.trigger.seq;

  // 1. A quick sweep across the strip, 20 px a frame, then off the brain: nothing switches on.
  await page.mouse.move(1350, 480); await rested();
  const beforeSweep = (await read()).trigger.seq;
  for (let x = 400; x <= 780; x += 20) { await page.mouse.move(x, 150); await page.waitForTimeout(16); }
  await page.mouse.move(1350, 480);
  const afterSweep = await rested();
  assert.equal(afterSweep.trigger.seq, beforeSweep, 'a pointer that crosses the strip without resting switches nothing on');

  // 2. The pointer comes to rest on an area: the area is named beside the pointer and its movement starts, by the look.
  const moving = [...areas.entries()].filter(([id]) => !/scan/.test(id));
  const [idA, pA] = moving[0];
  await page.mouse.move(pA[0], pA[1], { steps: 6 });
  const onA = await rested();
  assert.equal(onA.lock, null);
  assert.equal(onA.input.at, 'pointer');
  assert.match(onA.input.front, /^brain:area:/);
  const areaA = onA.gaze;
  assert.equal(`brain:area:${areaA}`, onA.input.front, 'the look names the area the pointer is on');
  assert.equal(onA.trigger.seq, afterSweep.trigger.seq + 1, 'resting the pointer on a motor area starts its movement');
  assert.equal(onA.trigger.source, 'gaze');
  assert.equal(onA.trigger.regionId, areaA);
  assert.equal(onA.tip?.kind, 'area', 'the tip names the area, not "Space holds the brain"');
  assert.doesNotMatch(onA.tip.text, /Space holds/);
  assert.ok(onA.tip.box[0] < pA[0] + 60 && onA.tip.box[2] > pA[0] - 60 && Math.abs((onA.tip.box[1] + onA.tip.box[3]) / 2 - pA[1]) < 120, `the tip is beside the pointer (${JSON.stringify(onA.tip.box.map(Math.round))} at ${pA})`);
  assert.match(onA.cross, /ns-crosshair-away/, 'the mark at the middle of the picture is faint while the pointer aims');
  assert.doesNotMatch(onA.cross, /ns-crosshair-active/);
  assert.ok(parseInt(onA.guide, 10) >= 2, `the tutorial's first step is done by pointing (${onA.guide})`);
  await shot('rest');
  report.rest = { asked: idA, area: areaA, tip: onA.tip.text };

  // 3. Staying there starts nothing more; a click presses the area again.
  const stay = await rested();
  assert.equal(stay.trigger.seq, onA.trigger.seq, 'a resting pointer starts its area once');
  await page.mouse.click(pA[0], pA[1]);
  await page.waitForFunction(seq => window.__nsQA.inspect().state.trigger.seq > seq, stay.trigger.seq, { polling: 20, timeout: 5000 });
  const clicked = await read();
  assert.equal(clicked.trigger.source, 'click');
  assert.equal(clicked.trigger.regionId, areaA, 'a click presses the area under the pointer');
  assert.equal(clicked.lock, null, 'a click does not capture the pointer');
  const afterClick = await rested();
  assert.equal(afterClick.trigger.seq, clicked.trigger.seq, 'no second start follows the click');

  // 4. A small move inside the same area starts nothing; another area starts its own movement.
  const other = moving.find(([id, p]) => id !== areaA && Math.hypot(p[0] - pA[0], p[1] - pA[1]) >= 60);
  assert.ok(other, 'a second area to point at');
  await page.mouse.move(other[1][0], other[1][1], { steps: 8 });
  const onB = await rested();
  assert.notEqual(onB.gaze, areaA);
  assert.equal(onB.trigger.seq, afterClick.trigger.seq + 1);
  assert.equal(onB.trigger.source, 'gaze');
  assert.equal(onB.trigger.regionId, onB.gaze);

  // 5. An arrow key: the look steps to an area, the crosshair is the aim (the pointer has not moved), the tip is there.
  await page.waitForTimeout(900);
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => window.__nsQA.inspect().areaStep?.to);
  const stepped = await rested();
  assert.equal(stepped.input.at, 'crosshair', 'after an arrow key the crosshair is the aim');
  const to = await page.evaluate(() => window.__nsQA.inspect().areaStep.to);
  assert.equal(stepped.input.front, `brain:area:${to}`);
  assert.equal(stepped.gaze, to);
  assert.doesNotMatch(stepped.cross, /ns-crosshair-away/);
  assert.equal(stepped.tip?.kind, 'area');
  assert.ok(Math.abs((stepped.tip.box[1] + stepped.tip.box[3]) / 2 - height / 2) < 120, 'the tip is beside the crosshair');
  await shot('arrow');
  // 5b. (section 208) A click made now, without moving the mouse, is the pointer's: the pointer is the aim again, and
  // if the click presses a motor area it is the one under the pointer, not the one the key aimed at.
  await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up();
  const stillClick = await rested();
  assert.equal(stillClick.input.at, 'pointer', 'a press with the free pointer takes the aim');
  if (stillClick.trigger.seq !== stepped.trigger.seq && stillClick.trigger.source === 'click') {
    const under = /^brain:area:(.+)$/.exec(stillClick.input.front || '');
    assert.ok(under && stillClick.trigger.regionId === under[1], `the click pressed the area under the pointer (${stillClick.input.front}), not ${to}: ${stillClick.trigger.regionId}`);
  }
  report.stillClick = { front: stillClick.input.front, trigger: `${stillClick.trigger.source}:${stillClick.trigger.regionId}`, stepped: to };
  // ... and the pointer takes the aim back as soon as it moves
  await page.mouse.move(1350, 480, { steps: 4 });
  const backAim = await rested();
  assert.equal(backAim.input.at, 'pointer');
  assert.match(backAim.cross, /ns-crosshair-away/);

  // 6. A drag on empty space turns the look; the pointer is still free afterwards.
  // (25 November 2026, section 209: the cards take the pointer now, the information card in the bottom right corner too,
  // so the drag starts on empty space beside the brain, not on that card)
  await page.mouse.move(1500, 300); await rested();
  const beforeDrag = await read();
  assert.equal(beforeDrag.input.at, 'pointer');
  assert.equal(beforeDrag.input.front, null, 'empty space under the pointer');
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(1500 - i * 12, 300 - i * 4); await page.waitForTimeout(16); }
  const during = await frames(2);
  assert.equal(during.input.at, 'crosshair', 'while the look is dragged the crosshair is the aim');
  await page.mouse.up();
  const afterDrag = await rested();
  assert.ok(Math.hypot(afterDrag.look[0] - beforeDrag.look[0], afterDrag.look[1] - beforeDrag.look[1]) > 0.1, 'the drag turned the look');
  assert.equal(afterDrag.lock, null);
  assert.equal(afterDrag.carry, null);

  // 7. (section 209, finding 8) Two quick clicks on a motor area press it twice and leave the chosen limb alone.
  const limbOf = () => page.evaluate(() => window.__nsQA.inspect().limbs.limb);
  let areaPoint = null;
  for (let y = 60; y <= height - 220 && !areaPoint; y += 30) for (let x = 60; x <= width - 340; x += 30) {
    await page.mouse.move(x, y);
    const s = await frames(3);
    if (s.input.at === 'pointer' && /^brain:area:(?!.*scan)/.test(s.input.front || '')) { areaPoint = [x, y]; break; }
  }
  assert.ok(areaPoint, 'a motor area under the pointer again');
  const onArea = await rested();
  const limbBefore = await limbOf();
  await page.mouse.click(areaPoint[0], areaPoint[1]);
  await page.waitForTimeout(140);
  await page.mouse.click(areaPoint[0], areaPoint[1]);
  const twice = await rested();
  assert.equal(await limbOf(), limbBefore, 'two quick clicks on a motor area do not step the chosen limb');
  assert.equal(twice.trigger.seq, onArea.trigger.seq + 2, 'they press the area twice');
  assert.equal(twice.trigger.source, 'click');

  // 8. (section 209, finding 1, LOOK_LOST) Drags on empty space can turn the view away from everything: a tip in the
  // middle of the empty picture says so, and Reset brain view turns the view back.
  const startLook = (await read()).look;
  for (let n = 0; n < 8; n++) {
    let from = null;
    for (const [x, y] of [[width - 60, 200], [60, 200], [width - 60, height / 2], [60, height / 2], [width / 2, 60], [width - 60, 110]]) {
      await page.mouse.move(x, y);
      const s = await frames(3);
      const top = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, [x, y]);
      if (top === 'ns-canvas' && s.input.at === 'pointer' && !s.input.front) { from = [x, y]; break; }
    }
    if (!from) break;
    await page.mouse.down();
    for (let k = 1; k <= 11; k++) { await page.mouse.move(from[0] - k * 10, from[1]); await page.waitForTimeout(16); }
    await page.mouse.up();
    await frames(4);
    if (Math.abs((await read()).look[0] - startLook[0]) > 2.2) break;
  }
  await page.waitForTimeout(900); // past LOOK_LOST.probeMs
  const lost = await frames(4);
  assert.ok(Math.abs(lost.look[0] - startLook[0]) > 1.2, `the drags turned the view far away (${lost.look[0]})`);
  assert.equal(lost.tip?.kind, 'hold', 'an empty picture says where the brain went');
  assert.match(lost.tip.text, /You have turned away from the brain/);
  assert.match(lost.tip.text, /Reset brain view/);
  assert.ok(Math.abs((lost.tip.box[0] + lost.tip.box[2]) / 2 - width / 2) < 260 && Math.abs((lost.tip.box[1] + lost.tip.box[3]) / 2 - height / 2) < 160, `the tip is in the middle of the picture (${JSON.stringify(lost.tip.box.map(Math.round))})`);
  await shot('lost');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Reset brain view$/ }).click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__nsQA.inspect().shell.mode === 'playing');
  const back = await rested();
  const nearLook = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 0.5;
  assert.ok(nearLook(back.look, [0, back.look[1]]) || Math.abs(back.look[0]) < 0.01, `Reset brain view turned the view back (${back.look})`);
  assert.ok(!back.tip || !/turned away/.test(back.tip.text), 'the words are gone when the brain is in view');
  assert.match(back.input.front || '', /^(brain|mirror|own):/, 'something is under the middle mark again');

  // 11. (25 November 2026, section 211) The information card names what moved, not what the pointer crosses; and a
  // pointer parked on a card names nothing in the middle of the picture.
  for (let i = 0; i < 12 && (await read()).guide; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(200); } // the tutorial's steps are skipped
  const cardTitle = () => page.evaluate(() => { const t = document.querySelector('.ns-infopanel-title'); return t && t.getClientRects().length ? t.textContent.trim() : null; });
  const cardSpots = new Map();
  for (let y = 100; y <= 400 && cardSpots.size < 10; y += 30) for (let x = 380; x <= 1220; x += 30) {
    await page.mouse.move(x, y);
    const s = await frames(3);
    const m = /^brain:area:(?!.*scan)(.+)$/.exec(s.input.front || '');
    if (s.input.at === 'pointer' && m && !cardSpots.has(m[1])) cardSpots.set(m[1], [x, y]);
  }
  assert.ok(cardSpots.size >= 4, `motor areas are under the pointer again (${cardSpots.size})`);
  const [[cardId, cardPt], ...crossedAreas] = [...cardSpots];
  await page.mouse.move(60, height / 2); await rested();
  await page.mouse.move(cardPt[0], cardPt[1]);
  const onCard = await rested();
  assert.equal(onCard.trigger.regionId, cardId, 'the area the pointer rests on moves');
  const cardName = await cardTitle();
  assert.ok(cardName, 'the information card shows');
  assert.equal(onCard.tip.text.split('\n')[0].trim(), cardName, 'the card and the tip name the same area');
  let at = cardPt;
  for (const [, pt] of [...crossedAreas, [null, [60, height / 2]]]) { // through every other area found, never resting, and off the brain
    const n = Math.max(2, Math.round(Math.hypot(pt[0] - at[0], pt[1] - at[1]) / 12));
    for (let k = 1; k <= n; k++) { await page.mouse.move(at[0] + (pt[0] - at[0]) * k / n, at[1] + (pt[1] - at[1]) * k / n); await page.waitForTimeout(16); }
    at = pt;
  }
  const sweptOver = await rested();
  assert.equal(sweptOver.trigger.seq, onCard.trigger.seq, 'the sweep started nothing');
  assert.equal(await cardTitle(), cardName, `the card still names the area that moved, not one the pointer crossed (${crossedAreas.length} crossed)`);
  // parked on the limb buttons: the mark in the middle has the aim, and says nothing
  const limbBar = await page.evaluate(() => { const r = document.querySelector('.ns-limbs').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.mouse.move(limbBar[0], limbBar[1], { steps: 6 });
  const parkedNow = await rested();
  assert.equal(parkedNow.input.at, 'crosshair');
  assert.equal(parkedNow.tip, null, 'no tip in the middle of the picture while the pointer lies on a card');
  assert.match(parkedNow.cross, /ns-crosshair-away/, 'the mark stays faint: it is not what the player aims with');
  assert.equal(parkedNow.trigger.seq, onCard.trigger.seq, 'and it starts nothing');
  assert.equal(await cardTitle(), cardName);
  await shot('parked');
  await page.keyboard.press('ArrowRight'); // an arrow key makes the mark the aim again, with its tip
  await page.waitForTimeout(700);
  const afterKey = await frames(4);
  assert.equal(afterKey.input.at, 'crosshair');
  assert.doesNotMatch(afterKey.cross, /ns-crosshair-away/);
  assert.ok(afterKey.tip, 'the mark\'s own tip is back after an arrow key');
  report.card = { area: cardId, title: cardName, crossed: crossedAreas.length, parkedTip: parkedNow.tip, keyTip: afterKey.tip.text.split('\n')[0] };

  report.final = { trigger: afterKey.trigger.seq, guide: afterKey.guide, lostLook: lost.look };
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
