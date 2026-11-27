// 25 November 2026 (hunt of update 78, finding 9): in a window taller than wide the tip beside the free pointer keeps
// off the tutorial's rings and their words, the aim mark ("Hip aim", "Look up or down: the arm follows") and its words,
// the region labels and the cards, and stays inside the window. A grid of pointer places over the motor strip, the
// pointer resting 0.2 s at each, in the tutorial's first step, its look step, with a leg chosen after the tutorial and
// with the electrical map on. On update 80 at 700x900: 11 of 122 tips in the first step lay on the area's ring, 11 of
// 122 in the look step and 9 of 71 with a leg chosen on the aim mark; at 720x800 with the map on 8 of 63 on "Left arm"
// and "Right arm" (ns-quiet TIP_KEEP_OFF, tipSides, tipStays; ns-guide-cues moves()).
// Run with Node and Playwright (NS_PLAYWRIGHT_MODULE, NS_CHROMIUM, NS_ANGLE as for the other browser tests).
// NS_SIZES=700x900,720x800 chooses the windows, NS_TIP_GRID the grid's step in px (46), NS_TIPS_SCREENSHOTS=<prefix>
// saves a picture of each state.
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
const sizes = (process.env.NS_SIZES || '700x900,720x800').split(',').map(s => s.split('x').map(Number));
const STEP = Number(process.env.NS_TIP_GRID || 46);
const errors = [];
const report = { errors, sizes: [] };
let browser;

try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  report.chromium = browser.version();
  for (const [width, height] of sizes) {
    const tag = `${width}x${height}`;
    const page = await browser.newPage({ viewport: { width, height } });
    page.setDefaultTimeout(45_000);
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto('http://' + host + '/scene/example/preview.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#ns-app')?.dataset.nsPhase === 'playing');
    await page.waitForTimeout(1200);
    const count = () => page.evaluate(() => { const c = document.querySelector('.ns-prompt-count'); return c && c.getClientRects().length ? c.textContent : ''; });
    // the strip's box on the screen, from the brain's frame, and the upper half of the window
    const bx = await page.evaluate(() => window.__nsQA.inspect().state.brainFrame.ndcBounds);
    const X0 = Math.max(10, Math.round((bx.x0 * 0.5 + 0.5) * width) - 20), X1 = Math.min(width - 10, Math.round((bx.x1 * 0.5 + 0.5) * width) + 20);
    const Y0 = 20, Y1 = Math.round(height * 0.5);
    // what the tip lies on: a box shared by more than 2 px each way with a ring or the aim mark, a mark's words, a
    // region label (drawn, not faded out) or a card; or a tip past the window's edge
    const look = () => page.evaluate(([W, H]) => {
      const t = document.querySelector('.ns-tip');
      if (!t || t.hidden || !t.getClientRects().length) return null;
      const shown = e => { if (e.hidden || !e.getClientRects().length) return false; for (let x = e; x instanceof Element; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden' || x.hidden || Number(cs.opacity) < 0.15) return false; } return true; };
      const r = t.getBoundingClientRect();
      const out = [];
      if (r.left < 0 || r.top < 0 || r.right > W || r.bottom > H) out.push('the window edge');
      for (const e of document.querySelectorAll('.ns-guide-cues .ns-guide-mark, .ns-guide-cues .ns-guide-mark-name, .ns-region-label, .ns-quiet > .ns-prompt, .ns-infopanel, .ns-limbs, .ns-emap-card')) {
        if (!shown(e)) continue;
        const b = e.getBoundingClientRect();
        const ox = Math.min(r.right, b.right) - Math.max(r.left, b.left), oy = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
        if (ox > 2 && oy > 2) out.push(`${String(e.className).split(' ').slice(0, 2).join('.')} "${e.textContent.trim().slice(0, 30)}" (${Math.round(ox)}x${Math.round(oy)})`);
      }
      return { box: [r.left, r.top, r.right, r.bottom].map(Math.round), text: t.innerText.replace(/\n/g, ' | ').slice(0, 50), on: out };
    }, [width, height]);
    const one = { size: tag, states: [] };
    const grid = async name => {
      let places = 0, tips = 0; const faults = [];
      for (let y = Y0; y <= Y1; y += STEP) for (let x = X0; x <= X1; x += STEP) {
        await page.mouse.move(x, y, { steps: 2 });
        await page.waitForTimeout(200);
        places++;
        const t = await look();
        if (!t) continue;
        tips++;
        if (t.on.length) faults.push(`(${x}, ${y}) "${t.text}" at ${t.box} on ${t.on.join(', ')}`);
      }
      await page.mouse.move(width - 20, height * 0.45);
      await page.waitForTimeout(500);
      one.states.push({ name, places, tips, faults: faults.length });
      if (process.env.NS_TIPS_SCREENSHOTS) await page.screenshot({ path: `${process.env.NS_TIPS_SCREENSHOTS}-${tag}-${name}.png` });
      assert.ok(tips >= 30, `${tag}, ${name}: the grid met tips (${tips} of ${places} places)`);
      assert.deepEqual(faults, [], `${tag}, ${name}: no tip lies on a mark, its words, a label or a card, or past the window's edge`);
    };
    assert.match(await count(), /^1\//, `${tag}: the tutorial's first step`);
    await grid('step-1');
    for (let i = 0; i < 12 && !/^4\//.test(await count()); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(300); }
    assert.match(await count(), /^4\//, `${tag}: the tutorial's look step`);
    await grid('look-step');
    for (let i = 0; i < 12 && (await count()); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(260); }
    await page.waitForTimeout(600);
    await page.keyboard.press('2');
    await page.waitForTimeout(600);
    await grid('leg-chosen');
    await page.keyboard.press('1');
    await page.waitForTimeout(400);
    await page.keyboard.press('m');
    await page.waitForTimeout(2600);
    await grid('map-on');
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
