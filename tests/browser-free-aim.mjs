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
  assert.equal(start.guide, '1/9');
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
  await page.mouse.move(1350, 700); await rested();
  const beforeSweep = (await read()).trigger.seq;
  for (let x = 400; x <= 780; x += 20) { await page.mouse.move(x, 150); await page.waitForTimeout(16); }
  await page.mouse.move(1350, 700);
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
  // ... and the pointer takes the aim back as soon as it moves
  await page.mouse.move(1350, 700, { steps: 4 });
  const back = await rested();
  assert.equal(back.input.at, 'pointer');
  assert.match(back.cross, /ns-crosshair-away/);

  // 6. A drag on empty space turns the look; the pointer is still free afterwards.
  await page.mouse.move(1450, 780); await rested();
  const beforeDrag = await read();
  assert.equal(beforeDrag.input.front, null, 'empty space under the pointer');
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(1450 - i * 12, 780 - i * 4); await page.waitForTimeout(16); }
  const during = await frames(2);
  assert.equal(during.input.at, 'crosshair', 'while the look is dragged the crosshair is the aim');
  await page.mouse.up();
  const afterDrag = await rested();
  assert.ok(Math.hypot(afterDrag.look[0] - beforeDrag.look[0], afterDrag.look[1] - beforeDrag.look[1]) > 0.1, 'the drag turned the look');
  assert.equal(afterDrag.lock, null);
  assert.equal(afterDrag.carry, null);

  report.final = { trigger: afterDrag.trigger.seq, guide: afterDrag.guide };
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
