// 25 November 2026 (DESIGN-DECISIONS section 213, LIMB_CUE): the tutorial's step "Drag a visible arm or leg" (the sixth of ten),
// in Chromium. The ring that names the chosen limb stands where a press takes that limb, and a drag that starts on the
// ring moves that limb and completes the step. Before, with the left leg chosen, the ring lay on your left arm.
// Run with Node and Playwright (NS_PLAYWRIGHT_MODULE, NS_CHROMIUM, NS_ANGLE as for the other browser tests).
// NS_SIZES=1280x720,800x600 chooses the windows; NS_LIMB_KEYS=2,3 the limb keys tried.
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
const sizes = (process.env.NS_SIZES || '1280x720,800x600').split(',').map(s => s.split('x').map(Number));
const keys = (process.env.NS_LIMB_KEYS || '2,3').split(',');
const LIMB_OF = { 1: 'leftArm', 2: 'leftLeg', 3: 'rightLeg', 4: 'rightArm' };
const errors = [];
const report = { errors, cases: [] };
let browser;

try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  report.chromium = browser.version();
  for (const [width, height] of sizes) for (const key of keys) {
    const tag = `${width}x${height}, key ${key}`, limb = LIMB_OF[key];
    const page = await browser.newPage({ viewport: { width, height } });
    page.setDefaultTimeout(45_000);
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto('http://' + host + '/scene/example/preview.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#ns-app')?.dataset.nsPhase === 'playing');
    await page.waitForTimeout(800);
    const step = () => page.evaluate(() => document.querySelector('.ns-prompt-count')?.textContent ?? '');
    const until = async n => { for (let i = 0; i < 8 && (await step()) !== `${n}/10`; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(300); } assert.equal(await step(), `${n}/10`, `${tag}: at step ${n}`); };
    await until(3);
    await page.keyboard.press(key);            // step 3: the limb's key
    await page.waitForTimeout(700);
    await until(5);                            // step 4 (the look that raises and lowers the limb, section 216) skipped
    // step 5 as a player does it: S draws the limb in, A swings it (the hand or foot is then behind another limb in
    // the picture, which is where the ring used to go wrong)
    for (const k of ['s', 'a']) { await page.keyboard.down(k); await page.waitForTimeout(500); await page.keyboard.up(k); await page.waitForTimeout(500); }
    await until(6);
    await page.mouse.move(width - 20, height * 0.4);
    await page.waitForTimeout(1500);           // the ring finds its place over a few frames
    const ring = await page.evaluate(() => { const e = document.querySelector('.ns-guide-cues .ns-guide-mark-limb'); if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width]; });
    assert.ok(ring, `${tag}: the limb's ring shows`);
    const state = () => page.evaluate(() => { const s = window.__nsQA.inspect(); return { front: s.controlTargets?.front ?? null, arrow: s.controlTargets?.arrow === true, limb: s.limbs?.limb ?? null, end: s.limbs?.ends?.[s.limbs.limb]?.end ?? null, orbit: s.state.view.orbit, look: [s.controls.yaw, s.controls.pitch] }; });
    // what a press would take in the ring's middle and at four places of its edge
    const d = Math.max(4, Math.min(7, ring[2] / 2 - 1)), under = [];
    for (const [dx, dy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d]]) { await page.mouse.move(ring[0] + dx, ring[1] + dy); await page.waitForTimeout(120); const s = await state(); under.push((s.arrow ? 'arrow over ' : '') + s.front); }
    const onLimb = under.filter(f => new RegExp(`^own:[a-z]+:${limb}$`).test(f || '')).length;
    assert.match(under[0] || '', new RegExp(`^own:[a-z]+:${limb}$`), `${tag}: a press in the ring's middle takes the ${limb} (${under[0]})`);
    assert.ok(onLimb >= 4, `${tag}: the ring lies on the ${limb} (${JSON.stringify(under)})`);
    await page.mouse.move(ring[0], ring[1]);
    await page.waitForTimeout(300);
    const before = await state();
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) { await page.mouse.move(ring[0] + i * 6, ring[1] - i * 4); await page.waitForTimeout(20); }
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForTimeout(900);
    const after = await state();
    const movedCm = before.end && after.end ? Math.hypot(...after.end.map((v, i) => v - before.end[i])) * 100 : 0;
    assert.equal(after.limb, limb, `${tag}: the chosen limb is still the ${limb}`);
    assert.ok(movedCm > 5, `${tag}: the drag on the ring moved the ${limb} (${movedCm.toFixed(1)} cm)`);
    assert.deepEqual(after.orbit, before.orbit, `${tag}: the brain was not turned`);
    assert.deepEqual(after.look, before.look, `${tag}: the view was not turned`);
    assert.equal(await step(), '7/10', `${tag}: the step is done`);
    report.cases.push({ size: `${width}x${height}`, key, ring: ring.map(Math.round), under, movedCm: Math.round(movedCm * 10) / 10 });
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
