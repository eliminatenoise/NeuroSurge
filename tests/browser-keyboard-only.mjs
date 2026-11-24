// 25 November 2026 (DESIGN-DECISIONS section 217): the game played with the keyboard alone, in Chromium.
// After a Tab, with the focus on a limb button, the game's keys still work (they were dead until the focus left the
// buttons); a button keeps Enter and Space. From the first screen each arrow key walks its half of the strip from the
// top of the n outward, one area a press, and says so at the end (each key went straight to its end of the strip and
// then did nothing).
// Run with Node and Playwright (NS_PLAYWRIGHT_MODULE, NS_CHROMIUM, NS_ANGLE as for the other browser tests).
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = process.env.NS_TEST_ROOT ? resolve(process.env.NS_TEST_ROOT) : fileURLToPath(new URL('../', import.meta.url));
const { createHandler, HOST } = await import(pathToFileURL(resolve(root, 'serve-local.mjs')));
const { chromium } = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const { TIP } = await import(pathToFileURL(resolve(root, 'scene/src/ns-text.mjs')));
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

async function open() {
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(45_000);
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto('http://' + host + '/scene/example/preview.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#ns-app')?.dataset.nsPhase === 'playing');
  await page.waitForTimeout(800);
  for (let i = 0; i < 12 && (await page.evaluate(() => document.querySelector('.ns-prompt-count')?.textContent ?? '')); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(220); }
  return page;
}
const read = page => page.evaluate(() => {
  const s = window.__nsQA.inspect(), a = document.activeElement, tip = document.querySelector('.ns-tip');
  return { focus: a ? `${a.tagName.toLowerCase()}.${String(a.className).split(' ')[0]}` : null, limb: s.limbs?.limb ?? null, end: s.limbs?.ends?.[s.limbs.limb]?.end ?? null,
    gaze: s.state.gaze.regionId, seq: s.state.trigger.seq, view: s.camera?.view ?? null, read: document.querySelector('[data-ns-read]')?.getAttribute('data-ns-read') ?? null,
    mode: s.shell.mode, tip: tip && tip.getClientRects().length ? tip.innerText : null };
});

try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  report.chromium = browser.version();

  // 1. the focus on a limb button: the game's keys go on working
  let page = await open();
  await page.keyboard.press('Tab');
  const tabbed = await read(page);
  assert.equal(tabbed.focus, 'button.ns-limbs-chip', 'Tab puts the focus on the first limb button');
  await page.keyboard.press('3'); await page.waitForTimeout(500);
  const chose = await read(page);
  assert.equal(chose.limb, 'rightLeg', 'key 3 chooses the right leg with the focus on a button');
  await page.keyboard.down('s'); await page.waitForTimeout(450); await page.keyboard.up('s'); await page.waitForTimeout(400);
  const drew = await read(page);
  const movedCm = Math.hypot(...drew.end.map((v, i) => v - chose.end[i])) * 100;
  assert.ok(movedCm > 5, `S draws the leg in (${movedCm.toFixed(1)} cm)`);
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(600);
  const aimed = await read(page);
  assert.ok(aimed.gaze && aimed.seq > drew.seq, 'an arrow key aims at an area and it moves');
  await page.keyboard.press('e'); await page.waitForFunction(() => window.__nsQA.inspect().camera?.view === 'third');
  await page.keyboard.press('e'); await page.waitForFunction(() => window.__nsQA.inspect().camera?.view === 'first');
  await page.keyboard.press('r'); await page.waitForTimeout(300);
  assert.notEqual((await read(page)).read, aimed.read, 'R changes the reading level');
  assert.equal((await read(page)).focus, 'button.ns-limbs-chip', 'the focus stayed on the button all the while');
  // the button keeps its own keys: Space and Enter work it (the first button chooses the left arm)
  await page.keyboard.press('Space'); await page.waitForTimeout(400);
  assert.equal((await read(page)).limb, 'leftArm', 'Space on the focused button presses the button');
  await page.keyboard.press('Escape'); await page.waitForFunction(() => window.__nsQA.inspect().shell.mode === 'paused');
  // in the pause page a key is the page's: S there moves no limb
  const paused = await read(page);
  await page.keyboard.press('s'); await page.waitForTimeout(300);
  assert.equal((await read(page)).mode, 'paused');
  report.focus = { movedCm: Math.round(movedCm * 10) / 10, aimed: aimed.gaze, pausedFocus: paused.focus };
  await page.close();

  // 2. each arrow key from the first screen
  for (const [key, first, last] of [['ArrowRight', 'lh_toes', 'lh_scan_inferior'], ['ArrowLeft', 'rh_toes', 'rh_scan_inferior']]) {
    page = await open();
    const seen = []; let endTip = null;
    for (let i = 0; i < 34; i++) {
      await page.keyboard.press(key); await page.waitForTimeout(430);
      const s = await read(page);
      if (s.gaze === seen[seen.length - 1]) { endTip = s.tip; break; }
      seen.push(s.gaze);
    }
    assert.equal(seen[0], first, `${key}: the first press aims at the first area on that side of the middle (${seen[0]})`);
    assert.equal(new Set(seen).size, seen.length, `${key}: every press reaches another area`);
    assert.ok(seen.length >= 25, `${key}: the key walks its half of the strip (${seen.length} areas)`);
    assert.equal(seen[seen.length - 1], last, `${key}: the walk ends at the strip's end`);
    assert.ok(endTip && endTip.includes(TIP.areaEnd), `${key}: a press at the end says there are no more areas this way (${JSON.stringify(endTip)})`);
    report[key] = { areas: seen.length, first: seen[0], last: seen[seen.length - 1] };
    await page.close();
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
