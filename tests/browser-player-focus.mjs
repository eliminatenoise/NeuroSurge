// Uses the normal preview and trusted Chromium input. NS_PREVIEW_URL selects the published root instead of loopback.
// NS_RAW=1 refuses mesh packs to exercise the raw mesh route. See browser-keyboard-aim.mjs for driver settings.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler, HOST } from '../serve-local.mjs';

const { chromium } = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const raw = process.env.NS_RAW === '1';
const allowedHosts = new Set();
const root = fileURLToPath(new URL('../', import.meta.url));
const server = createServer(createHandler({ root, allowedHosts }));
server.listen(0, HOST);
await once(server, 'listening');
const host = `${HOST}:${server.address().port}`;
allowedHosts.add(host);
const url = process.env.NS_PREVIEW_URL || `http://${host}/`;
const angle = process.env.NS_ANGLE;
const args = ['--disable-background-networking'];
if (angle) args.push(`--use-angle=${angle}`);
const report = { url, raw, checks: {}, errors: [], assets: { packs: 0, packsRefused: 0, obj: 0 } };
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.setDefaultTimeout(60_000);
  page.on('pageerror', error => report.errors.push(String(error)));
  const screenshot = async name => {
    if (process.env.NS_SCREENSHOTS) await page.screenshot({ path: join(process.env.NS_SCREENSHOTS, name + '.png') });
  };
  page.on('response', response => {
    if (!response.ok()) return;
    if (new URL(response.url()).pathname.includes('/packs/')) report.assets.packs++;
    if (new URL(response.url()).pathname.endsWith('.obj')) report.assets.obj++;
  });
  if (raw) await page.route('**/packs/**', route => { report.assets.packsRefused++; return route.abort(); });
  const startMs = performance.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForURL('**/scene/example/preview.html');
  const shell = page.locator('.ns-shell');
  async function waitShell(mode) {
    await page.waitForFunction(mode => window.__nsQA?.inspect().shell.mode === mode, mode);
  }
  await waitShell('playing');
  report.startToPlayingMs = Math.round(performance.now() - startMs);
  const read = () => page.evaluate(() => {
    const state = window.__nsQA.inspect();
    const focus = document.activeElement;
    const canvas = document.querySelector('#ns-canvas');
    const gl = canvas.getContext('webgl2');
    const renderer = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      focus: focus.tagName === 'BODY' ? 'BODY' : focus.id || focus.textContent.trim(),
      inside: !!focus.closest('.ns-shell-card'),
      sourcesOpen: document.querySelector('.ns-details').open,
      read: document.getElementById('ns-app').dataset.nsRead,
      camera: state.camera.view,
      shell: state.shell.mode,
      carrying: state.state.objectCarry?.held,
      carryTarget: state.state.objectCarry?.target,
      keys: state.controls.keys,
      body: state.features.bodyRig,
      qa: state.qa,
      locked: document.pointerLockElement === canvas,
      frames: state.frames,
      renderer: renderer ? gl.getParameter(renderer.UNMASKED_RENDERER_WEBGL) : null,
    };
  });
  const checks = report.checks;
  checks.start = await read();
  await page.keyboard.press('r');
  await page.waitForFunction(() => document.getElementById('ns-app').dataset.nsRead === 'more');
  await page.keyboard.press('Tab');
  checks.summaryFocused = await read();
  await page.keyboard.press('Space');
  await page.waitForFunction(frame => window.__nsQA.inspect().frames > frame + 1, checks.summaryFocused.frames);
  checks.afterSpace = await read();
  await screenshot('space-on-sources');
  // Keep the disclosure open for the modal test even when Space fails on the parent. Enter is the native control.
  if (!checks.afterSpace.sourcesOpen) await page.keyboard.press('Enter');
  checks.sourcesOpenBeforePause = await read();
  await page.keyboard.press('Escape');
  await waitShell('paused');
  checks.pauseFocus = await read();
  await shell.locator('.ns-shell-heading').click();
  checks.headingClick = await read();
  await page.keyboard.press('Shift+Tab');
  checks.reverseAfterHeading = await read();
  await screenshot('reverse-tab-after-heading');
  await page.keyboard.press('Tab');
  checks.wrapToFirst = await read();
  await shell.locator('.ns-shell-heading').click();
  await page.keyboard.press('Tab');
  checks.forwardAfterHeading = await read();
  await page.keyboard.press('Escape');
  await waitShell('playing');
  checks.resumed = await read();
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__nsQA.inspect().camera.pose.firstPerson === false);
  checks.outsideView = await read();
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__nsQA.inspect().camera.pose.firstPerson === true);
  // A game key released on a page control must still reach its original held state.
  await page.keyboard.down('w');
  await page.waitForFunction(() => window.__nsQA.inspect().controls.keys.KeyW);
  await page.keyboard.press('Tab');
  checks.wOnSummary = await read();
  await page.keyboard.up('w');
  await page.waitForFunction(frame => window.__nsQA.inspect().frames > frame + 1, checks.wOnSummary.frames);
  checks.wReleased = await read();
  await page.keyboard.press('Space');
  await page.waitForFunction(frame => window.__nsQA.inspect().frames > frame + 1, checks.wReleased.frames);
  checks.sourcesClosed = await read();
  await page.keyboard.press('Shift+Tab');
  checks.backToCanvas = await read();
  assert.equal(checks.start.body && !checks.start.qa && checks.start.focus === 'ns-canvas', true);
  assert.equal(checks.summaryFocused.focus, 'Sources and rights');
  assert.equal(checks.sourcesOpenBeforePause.sourcesOpen, true);
  assert.equal(checks.pauseFocus.focus, 'Resume (Esc)');
  assert.equal(checks.headingClick.shell, 'paused');
  assert.equal(checks.resumed.focus, 'ns-canvas');
  assert.equal(checks.resumed.locked, false);
  assert.equal(checks.outsideView.camera, 'third');
  assert.equal(checks.wOnSummary.focus, 'Sources and rights');
  assert.equal(checks.backToCanvas.focus, 'ns-canvas');
  assert.equal(raw ? report.assets.packsRefused > 0 && report.assets.obj > 0 && report.assets.packs === 0 : report.assets.packs > 0, true);
  assert.deepEqual(report.errors, []);
  const violations = [];
  if (!checks.afterSpace.sourcesOpen) violations.push('Space did not open the focused disclosure');
  if (checks.afterSpace.carrying) violations.push('Space on the disclosure grabbed a scene object');
  if (checks.reverseAfterHeading.focus !== 'Show the full instructions' ||
      checks.wrapToFirst.focus !== 'Resume (Esc)' || checks.forwardAfterHeading.focus !== 'Resume (Esc)') {
    violations.push('Tab reached the wrong control after clicking the pause heading');
  }
  if (checks.wReleased.keys.KeyW) violations.push('W remained held after release on the focused disclosure');
  if (checks.sourcesClosed.sourcesOpen) violations.push('Space did not close the focused disclosure');
  report.violations = violations;
  assert.deepEqual(violations, []);
} finally {
  console.log(JSON.stringify(report, null, 2));
  await browser?.close();
  server.close();
  await once(server, 'close');
}
