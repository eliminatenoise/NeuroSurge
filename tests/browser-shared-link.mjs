// 25 November 2026 (DESIGN-DECISIONS section 212): the game opened from a link that was passed on, in Chromium.
// Sites that pass a link on add their own parameters to it (fbclid, utm_source ...). The game leaves a parameter it
// does not know alone and starts, Full or Lite as the link asks. A value it does not know for one of its own two
// parameters gets a panel that says so, and the panel's button starts the game from the plain address.
// Run with Node and Playwright (NS_PLAYWRIGHT_MODULE, NS_CHROMIUM, NS_ANGLE as for the other browser tests).
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = process.env.NS_TEST_ROOT ? resolve(process.env.NS_TEST_ROOT) : fileURLToPath(new URL('../', import.meta.url));
const { createHandler, HOST } = await import(pathToFileURL(resolve(root, 'serve-local.mjs')));
const { chromium } = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const { LOAD_WORDS } = await import(pathToFileURL(resolve(root, 'scene/src/ns-load-guard.mjs')));
const allowedHosts = new Set();
const server = createServer(createHandler({ root, allowedHosts }));
server.listen(0, HOST);
await once(server, 'listening');
const host = HOST + ':' + server.address().port;
allowedHosts.add(host);
const args = ['--disable-background-networking'];
if (process.env.NS_ANGLE) args.push('--use-angle=' + process.env.NS_ANGLE);
const report = { cases: [] };
let browser;

try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  report.chromium = browser.version();
  const game = 'http://' + host + '/scene/example/preview.html';
  const state = page => page.evaluate(() => ({ phase: document.querySelector('#ns-app')?.dataset.nsPhase ?? null, edition: document.body.dataset.edition ?? null,
    panel: (p => (p ? { kind: p.dataset.kind, words: [...p.children].map(c => c.textContent) } : null))(document.querySelector('.ns-load-fail')), search: location.search }));
  const settled = async page => { await page.waitForFunction(() => document.querySelector('#ns-app')?.dataset.nsPhase === 'playing' || document.querySelector('.ns-load-fail'), null, { timeout: 60_000 }); return state(page); };

  for (const [query, edition] of [['?fbclid=IwAR0abc123', 'full'], ['?utm_source=newsletter&utm_medium=email&gclid=x1', 'full'], ['?edition=lite&utm_source=newsletter', 'lite'], ['?edition=Lite', 'lite'], ['?Edition=lite&nsukey=abc', 'lite'], ['?edition=full', 'full']]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = []; page.on('pageerror', error => errors.push(String(error)));
    await page.goto(game + query, { waitUntil: 'domcontentloaded' });
    const s = await settled(page);
    report.cases.push({ query, ...s });
    assert.equal(s.panel, null, `${query}: no failure panel`);
    assert.equal(s.phase, 'playing', `${query}: the game starts`);
    assert.equal(s.edition, edition, `${query}: the ${edition} game`);
    assert.equal(s.search, query, `${query}: the address is left as it came`);
    assert.deepEqual(errors, [], query);
    await page.close();
  }

  // a value the game does not know for one of its own parameters: said plainly, with a way on
  for (const query of ['?edition=mini', '?case=nothing', '?qa=1&nsBrainK=3']) { // (the last: the scene's test switches stay closed)
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(game + query, { waitUntil: 'domcontentloaded' });
    const s = await settled(page);
    report.cases.push({ query, ...s });
    assert.ok(s.panel, `${query}: the address is refused with a panel`);
    assert.equal(s.panel.kind, 'address');
    assert.deepEqual(s.panel.words.slice(0, 3), [LOAD_WORDS.refused, LOAD_WORDS.refusedHint, LOAD_WORDS.start]);
    await page.getByRole('button', { name: LOAD_WORDS.start }).click();
    await page.waitForFunction(() => location.search === '' && document.querySelector('#ns-app')?.dataset.nsPhase === 'playing', null, { timeout: 60_000 });
    const after = await state(page);
    assert.equal(after.panel, null);
    assert.equal(after.edition, 'full', `${query}: the button starts the game from its usual address`);
    await page.close();
  }
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure = String(error && error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : error);
  console.log(JSON.stringify(report, null, 2));
  throw error;
} finally {
  if (browser) await browser.close();
  server.close();
}
