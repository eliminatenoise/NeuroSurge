// 25 November 2026 (DESIGN-DECISIONS section 211): the tutorial's seventh step, "Drag the brain to turn it", in
// Chromium at the two window sizes where its captions lay on each other. The step shows a caption by each of the
// brain's four arrows: they use the shorter words, none lies on another, and none lies on a ring or mark of the
// tutorial, with no limb, a leg and an arm chosen.
// Run with Node and Playwright (NS_PLAYWRIGHT_MODULE, NS_CHROMIUM, NS_ANGLE as for the other browser tests).
// NS_SIZES=800x600,1024x768 chooses the windows. NS_STEP7_SCREENSHOTS=<prefix> saves pictures.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = process.env.NS_TEST_ROOT ? resolve(process.env.NS_TEST_ROOT) : fileURLToPath(new URL('../', import.meta.url));
const { createHandler, HOST } = await import(pathToFileURL(resolve(root, 'serve-local.mjs')));
const { chromium } = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const { ARROWS } = await import(pathToFileURL(resolve(root, 'scene/src/ns-text.mjs')));
const allowedHosts = new Set();
const server = createServer(createHandler({ root, allowedHosts }));
server.listen(0, HOST);
await once(server, 'listening');
const host = HOST + ':' + server.address().port;
allowedHosts.add(host);
const args = ['--disable-background-networking'];
if (process.env.NS_ANGLE) args.push('--use-angle=' + process.env.NS_ANGLE);
const sizes = (process.env.NS_SIZES || '800x600,1024x768').split(',').map(s => s.split('x').map(Number));
const errors = [];
const report = { errors, sizes: [] };
let browser;

try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  report.chromium = browser.version();
  const shortWords = new Set(Object.values(ARROWS.brain.tipShort)), fullWords = new Set(Object.values(ARROWS.brain.tip));
  for (const [width, height] of sizes) {
    const tag = `${width}x${height}`;
    const page = await browser.newPage({ viewport: { width, height } });
    page.setDefaultTimeout(45_000);
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto('http://' + host + '/scene/example/preview.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#ns-app')?.dataset.nsPhase === 'playing');
    await page.waitForTimeout(800);
    const step = () => page.evaluate(() => document.querySelector('.ns-prompt-count')?.textContent ?? '');
    for (let i = 0; i < 10 && (await step()) !== '7/9'; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(300); }
    assert.equal(await step(), '7/9', `${tag}: the tutorial is at its seventh step`);
    await page.mouse.move(width / 2, height - 12); // off the picture's objects: no arrow is pointed at
    const boxes = () => page.evaluate(() => {
      const seen = e => e.getClientRects().length > 0 && !e.hidden && getComputedStyle(e).visibility !== 'hidden';
      const box = e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(v => Math.round(v * 10) / 10); };
      return { captions: [...document.querySelectorAll('.ns-arrow-tip')].filter(seen).map(e => ({ which: e.getAttribute('data-ns-arrow-tip'), words: e.textContent, box: box(e) })),
        marks: [...document.querySelectorAll('.ns-guide-cues .ns-guide-mark')].filter(seen).map(e => ({ which: String(e.className), box: box(e) })) };
    });
    const over = (a, b) => { const x = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), y = Math.min(a[3], b[3]) - Math.max(a[1], b[1]); return x > 0.5 && y > 0.5 ? [Math.round(x), Math.round(y)] : null; };
    const one = { size: tag, cases: [] };
    for (const key of [null, '2', '4']) { // no limb key yet, a leg, an arm: the joint's mark and its words change
      if (key) await page.keyboard.press(key);
      await page.waitForTimeout(1400);
      const { captions, marks } = await boxes();
      const brain = captions.filter(c => c.which.startsWith('brain:'));
      const name = key ? `limb key ${key}` : 'as the step opens';
      assert.ok(brain.length >= 3, `${tag}, ${name}: the step shows the brain arrows' captions (${brain.length})`);
      for (const c of brain) {
        assert.ok(shortWords.has(c.words) && !fullWords.has(c.words), `${tag}, ${name}: "${c.words}" is the step's shorter caption`);
        assert.ok(c.box[0] >= 0 && c.box[1] >= 0 && c.box[2] <= width && c.box[3] <= height, `${tag}, ${name}: "${c.words}" is inside the window (${c.box})`);
      }
      for (let i = 0; i < captions.length; i++) {
        for (let j = i + 1; j < captions.length; j++) assert.equal(over(captions[i].box, captions[j].box), null, `${tag}, ${name}: "${captions[i].words}" and "${captions[j].words}" do not lie on each other`);
        for (const m of marks) assert.equal(over(captions[i].box, m.box), null, `${tag}, ${name}: "${captions[i].words}" does not lie on a mark of the tutorial (${m.which})`);
      }
      one.cases.push({ name, captions: brain.map(c => `${c.words} @ ${c.box.map(Math.round)}`), marks: marks.length });
      if (process.env.NS_STEP7_SCREENSHOTS) await page.screenshot({ path: `${process.env.NS_STEP7_SCREENSHOTS}-${tag}-${key || 'start'}.png` });
    }
    report.sizes.push(one);
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
