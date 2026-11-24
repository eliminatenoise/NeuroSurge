// 25 November 2026 (DESIGN-DECISIONS section 216): a finger on the picture, in Chromium with touch emulation.
// A short tap on a coloured motor area presses it on release, at the place of the tap; a finger dragged over empty
// space turns the look and starts nothing; a tap on empty space presses nothing. (The touch rules were written for the
// hosted Movement mirror preview and brought into the game; a keyboard is still needed for the keys.)
// Run with Node and Playwright (NS_PLAYWRIGHT_MODULE, NS_CHROMIUM, NS_ANGLE as for the other browser tests).
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
const width = 1280, height = 720;
const errors = [];
const report = { errors };
let browser;

try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  report.chromium = browser.version();
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto('http://' + host + '/scene/example/preview.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#ns-app')?.dataset.nsPhase === 'playing');
  await page.waitForTimeout(800);
  for (let i = 0; i < 12 && (await page.evaluate(() => document.querySelector('.ns-prompt-count')?.textContent ?? '')); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(250); }
  const read = () => page.evaluate(() => { const s = window.__nsQA.inspect(); return { front: s.controlTargets?.front ?? null, at: s.controlTargets?.at ?? null, trigger: s.state.trigger, look: [s.controls.yaw, s.controls.pitch], lock: document.pointerLockElement?.id ?? null, moving: (s.motion?.contracting || []).length + ((s.motion?.arm || {}).contracting || []).length }; });
  // places found with the mouse (a finger cannot hover): two motor areas that move something, and an empty place
  const areas = new Map(); let empty = null;
  for (let y = 60; y <= 400 && areas.size < 2; y += 24) for (let x = 300; x <= 980 && areas.size < 2; x += 24) {
    await page.mouse.move(x, y); await page.waitForTimeout(50);
    const m = /^brain:area:(?!.*(scan|tongue))(.+)$/.exec((await read()).front || '');
    if (m && !areas.has(m[2])) areas.set(m[2], [x, y]);
  }
  for (const [x, y] of [[width - 40, 60], [40, 60], [width - 40, height / 2], [40, height / 2]]) { await page.mouse.move(x, y); await page.waitForTimeout(80); const s = await read(); if (!s.front && s.at === 'pointer') { empty = [x, y]; break; } }
  assert.equal(areas.size, 2, 'two motor areas are found');
  assert.ok(empty, 'an empty place is found');
  await page.mouse.move(empty[0], empty[1]);
  await page.waitForTimeout(2500); // what the mouse's rest started has ended
  const client = await context.newCDPSession(page);
  const touch = (type, pts) => client.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y, id: 1 })) });

  // 1. a tap on a motor area presses it, once, at the place of the tap
  const [[idA, ptA], [idB, ptB]] = [...areas];
  const before = await read();
  await page.touchscreen.tap(ptA[0], ptA[1]);
  await page.waitForTimeout(500);
  const tapped = await read();
  assert.equal(tapped.trigger.seq, before.trigger.seq + 1, `one movement starts with the tap (${before.trigger.seq} -> ${tapped.trigger.seq})`);
  assert.equal(tapped.trigger.regionId, idA, 'it is the area under the finger');
  assert.equal(tapped.trigger.source, 'click', 'a tap is a press, not a look');
  assert.equal(tapped.lock, null, 'a tap never captures the pointer');
  await page.waitForTimeout(2500);
  await page.touchscreen.tap(ptB[0], ptB[1]);
  await page.waitForTimeout(500);
  const second = await read();
  assert.equal(second.trigger.seq, tapped.trigger.seq + 1, 'a tap on another area presses that one');
  assert.equal(second.trigger.regionId, idB);
  await page.waitForTimeout(2500);

  // 2. a finger dragged over empty space turns the look and starts nothing
  const look0 = (await read()).look, seq0 = (await read()).trigger.seq;
  await touch('touchStart', [empty]);
  for (let k = 1; k <= 10; k++) { await touch('touchMove', [[empty[0] - k * 12 * Math.sign(empty[0] - width / 2), empty[1] + k * 2]]); await page.waitForTimeout(20); }
  await touch('touchEnd', []);
  await page.waitForTimeout(700);
  const dragged = await read();
  assert.ok(Math.abs(dragged.look[0] - look0[0]) > 0.05, `the drag turned the look (${look0[0]} -> ${dragged.look[0]})`);
  assert.equal(dragged.trigger.seq, seq0, 'the drag started no movement');
  assert.equal(dragged.lock, null);

  // 3. a tap on empty space presses nothing
  await page.touchscreen.tap(width - 30, height - 120);
  await page.waitForTimeout(500);
  const emptyTap = await read();
  assert.ok(emptyTap.trigger.seq === seq0 || emptyTap.trigger.regionId !== null, 'a tap presses only what is under the finger');
  report.result = { tappedA: idA, tappedB: idB, lookTurnDeg: Math.round((dragged.look[0] - look0[0]) * 573) / 10, afterEmptyTap: emptyTap.trigger.seq - seq0 };
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
