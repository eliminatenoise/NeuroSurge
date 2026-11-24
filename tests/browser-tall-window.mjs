// 25 November 2026 (DESIGN-DECISIONS section 215): the game in a window taller than it is wide (half a laptop screen),
// in Chromium. The hint row stands clear of the cards of the picture's lower part at every reading level and while
// Space holds the brain; at the full level the electrical map's card starts under the panel at the top; and the pause
// page has two settings columns and its full instructions one under the other.
// Run with Node and Playwright (NS_PLAYWRIGHT_MODULE, NS_CHROMIUM, NS_ANGLE as for the other browser tests).
// NS_SIZES=700x900,720x800 chooses the windows. NS_TALL_SCREENSHOTS=<prefix> saves pictures.
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
    await page.waitForTimeout(800);
    for (let i = 0; i < 12 && (await page.evaluate(() => document.querySelector('.ns-prompt-count')?.textContent ?? '')); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(250); }
    const boxes = () => page.evaluate(() => {
      const seen = e => e.getClientRects().length > 0 && !e.hidden && getComputedStyle(e).visibility !== 'hidden' && Number(getComputedStyle(e).opacity) > 0.1;
      const box = e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(Math.round); };
      const hint = document.querySelector('.ns-shell-toast');
      return { hint: hint && seen(hint) ? box(hint) : null,
        cards: [...document.querySelectorAll('.ns-infopanel, .ns-hud .ns-panel, .ns-limbs, .ns-emap-card')].filter(seen).map(e => ({ which: String(e.className).split(' ').slice(0, 2).join('.'), box: box(e) })) };
    });
    const over = (a, b) => { const x = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), y = Math.min(a[3], b[3]) - Math.max(a[1], b[1]); return x > 1 && y > 1 ? [x, y] : null; };
    const one = { size: tag, states: [] };
    const check = async name => {
      await page.waitForTimeout(700); // past the hint's own reading of the cards (PORTRAIT_HINT.everyMs) and a frame
      const { hint, cards } = await boxes();
      assert.ok(hint, `${tag}, ${name}: the hint shows`);
      assert.ok(hint[0] >= 0 && hint[2] <= width && hint[1] >= 0 && hint[3] <= height, `${tag}, ${name}: the hint is inside the window (${hint})`);
      for (const c of cards) assert.equal(over(hint, c.box), null, `${tag}, ${name}: the hint does not lie on ${c.which} (${hint} / ${c.box})`);
      const map = cards.find(c => c.which.startsWith('ns-emap-card'));
      if (map) for (const c of cards) if (c !== map && /ns-panel|ns-infopanel/.test(c.which)) assert.equal(over(map.box, c.box), null, `${tag}, ${name}: the map's card does not lie on ${c.which} (${map.box} / ${c.box})`);
      one.states.push({ name, hint, cards: cards.map(c => `${c.which}@${c.box}`) });
      if (process.env.NS_TALL_SCREENSHOTS) await page.screenshot({ path: `${process.env.NS_TALL_SCREENSHOTS}-${tag}-${name}.png` });
    };
    await page.mouse.move(width / 2, height * 0.3);
    await check('short');
    // Space on the brain's glass: the grip's card opens in the lower band
    let glass = null;
    for (let y = 80; y < height * 0.5 && !glass; y += 30) for (let x = 60; x < width - 60 && !glass; x += 40) {
      await page.mouse.move(x, y); await page.waitForTimeout(60);
      const f = await page.evaluate(() => window.__nsQA.inspect().controlTargets?.front ?? '');
      if (/^brain:(glass|outline)/.test(f)) glass = [x, y];
    }
    assert.ok(glass, `${tag}: a place of the brain's glass is found`);
    await page.keyboard.down('Space');
    await check('space-holds-the-brain');
    await page.keyboard.up('Space');
    await page.waitForTimeout(900);
    await page.keyboard.press('r');
    await check('full');
    await page.keyboard.press('m');
    await page.waitForTimeout(1200);
    await check('full-with-map');
    await page.keyboard.press('m');
    // the pause page
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__nsQA.inspect().shell.mode === 'paused');
    const fullBtn = page.getByRole('button', { name: /full instructions/i });
    if (await fullBtn.isVisible().catch(() => false)) { await fullBtn.scrollIntoViewIfNeeded(); await fullBtn.click(); await page.waitForTimeout(400); }
    const pause = await page.evaluate(() => {
      const set = document.querySelector('.ns-shell[data-mode="paused"] .ns-shell-settings');
      const groups = set ? [...set.querySelectorAll(':scope > .ns-shell-setgroup')].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; }) : [];
      const grid = document.querySelector('.ns-shell[data-mode="paused"] .ns-shell-grid');
      // (columns counted from the boxes as laid out: the computed template can read "repeat(2, ...)")
      const lefts = l => new Set(l.map(g => g[0])).size;
      const parts = grid && getComputedStyle(grid).display !== 'none' ? [...grid.children].filter(e => getComputedStyle(e).display !== 'none').map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)]; }) : null;
      return { columns: lefts(groups), groups, gridColumns: parts ? lefts(parts) : null,
        limbs: (e => (e ? getComputedStyle(e).visibility : null))(document.querySelector('.ns-limbs')) };
    });
    assert.equal(pause.columns, width <= 760 ? 2 : 3, `${tag}: the settings stand in ${width <= 760 ? 'two' : 'three'} columns`);
    for (const g of pause.groups) assert.ok(g[1] - g[0] >= 240 || width > 760, `${tag}: a settings column is at least 240 px wide (${g})`);
    assert.equal(pause.gridColumns, 1, `${tag}: the full instructions are open and stand one under the other`);
    assert.equal(pause.limbs, 'hidden', `${tag}: the limb buttons are hidden under the pause page`);
    one.pause = pause;
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
