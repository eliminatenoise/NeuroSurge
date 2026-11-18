// Run with Node and Playwright. NS_PLAYWRIGHT_MODULE and NS_CHROMIUM can select a local installation.
// NS_ANGLE=vulkan selects an installed Vulkan driver on Linux. The game runs normally on loopback.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHandler, HOST } from '../serve-local.mjs';

const { chromium } = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const allowedHosts = new Set();
const server = createServer(createHandler({ root, allowedHosts }));
server.listen(0, HOST);
await once(server, 'listening');
const host = `${HOST}:${server.address().port}`;
allowedHosts.add(host);
const viewport = { width: 1600, height: 900 };
const args = ['--disable-background-networking'];
if (process.env.NS_ANGLE) args.push(`--use-angle=${process.env.NS_ANGLE}`);

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const canvas = page.locator('#ns-canvas');
  const quality = page.locator('select[name="quality"]');

  const camera = () => page.evaluate(() => {
    const state = window.__nsQA.inspect({ arrowTrace: true });
    const trace = state.arrowTrace.value;
    return {
      fov: trace.activeCamera.fovYDeg, position: trace.activeCamera.position,
      width: trace.activeCamera.width, height: trace.activeCamera.height,
      pickPoint: trace.mirror.dirs.forward.clickPx, arrow: trace.mirror.hovered,
      bufferWidth: document.querySelector('#ns-canvas').width, quality: state.scene.quality.mode,
      pitch: state.scene.mirror.orbit.pitchDeg, muscleAction: state.state.trigger.seq
    };
  });

  async function advance(count) {
    const from = await page.evaluate(() => window.__nsQA.inspect().frames);
    await page.waitForFunction(({ from, count }) => window.__nsQA.inspect().frames >= from + count,
      { from, count }, { polling: 80 });
  }

  async function pause() {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.pointerLockElement && window.__nsQA.inspect().shell.mode === 'paused');
  }

  async function resume() {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.pointerLockElement && window.__nsQA.inspect().shell.mode === 'playing');
    await advance(3);
  }

  async function switchView(firstPerson) {
    await page.keyboard.press('e');
    await page.waitForFunction(first => {
      const pose = window.__nsQA.inspect().camera.pose;
      return pose.firstPerson === first && !pose.moving;
    }, firstPerson, { polling: 80 });
    return camera();
  }

  await page.goto(`http://${host}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#ns-app')?.dataset.nsPhase === 'playing');
  assert.ok(await page.evaluate(() => {
    const state = window.__nsQA.inspect();
    return state.phase === 'running' && state.features.bodyRig && !state.placeholder && !state.qa;
  }));
  await pause();
  await quality.selectOption('low');
  await resume();
  await canvas.click({ position: { x: viewport.width / 2, y: viewport.height / 2 } });
  await page.waitForFunction(() => document.pointerLockElement?.id === 'ns-canvas');
  await page.keyboard.press('ArrowRight');
  await advance(4);
  await page.keyboard.press('ArrowLeft');
  await advance(4);
  await switchView(false);
  await page.keyboard.press('ArrowRight');
  await advance(4);
  await pause();
  await resume();
  const outside = await camera();
  assert.equal(outside.quality, 'low');
  assert.equal(outside.fov, 66);
  assert.ok(outside.pickPoint, 'the outside view shows the mirror tilt arrow');

  // A display-scale change grows the drawing buffer without changing CSS dimensions or the camera pose.
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setDeviceMetricsOverride', {
    ...viewport, deviceScaleFactor: 1.5, mobile: false
  });
  await page.waitForFunction(width => document.querySelector('#ns-canvas').width > width, outside.bufferWidth,
    { polling: 80 });
  await advance(4);
  const scaled = await camera();
  assert.deepEqual([scaled.width, scaled.height], [outside.width, outside.height]);
  assert.deepEqual(scaled.position, outside.position);
  assert.equal(scaled.fov, outside.fov, 'buffer-only resize keeps the outside lens');
  assert.deepEqual(scaled.pickPoint, outside.pickPoint, 'buffer-only resize keeps the visible arrow at the same CSS point');
  await page.mouse.move(...outside.pickPoint);
  await advance(3);
  assert.equal((await camera()).arrow, 'forward');
  await page.mouse.click(...outside.pickPoint);
  await page.waitForFunction(pitch => window.__nsQA.inspect().scene.mirror.orbit.pitchDeg > pitch, scaled.pitch);
  const clicked = await camera();
  assert.equal(clicked.pitch, scaled.pitch + 15);
  assert.equal(clicked.muscleAction, scaled.muscleAction);

  // A normal window resize recomputes aspect and arrow projection while retaining the outside lens.
  await page.setViewportSize({ width: 1440, height: 810 });
  await page.waitForFunction(() => {
    const c = window.__nsQA.inspect({ arrowTrace: true }).arrowTrace.value.activeCamera;
    return c.width === 1440 && c.height === 810;
  }, null, { polling: 80 });
  const resized = await camera();
  assert.equal(resized.fov, 66, 'window resize keeps the outside lens');

  await pause();
  await quality.selectOption('high');
  await resume();
  const high = await camera();
  assert.equal(high.quality, 'high');
  assert.ok(high.bufferWidth > resized.bufferWidth, 'the setting actually grows the drawing buffer');
  assert.equal(high.fov, 66, 'picture quality keeps the outside lens');

  const eye = await switchView(true);
  assert.equal(eye.fov, 54, 'E restores the eye lens');
  await page.setViewportSize({ width: 810, height: 810 });
  await page.waitForFunction(() => window.__nsQA.inspect({ arrowTrace: true }).arrowTrace.value.activeCamera.width === 810,
    null, { polling: 80 });
  const narrow = await camera();
  assert.ok(Math.abs(narrow.fov - 55) < 1e-6, 'square viewport fits the eye lens');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ chromium: browser.version(), outside, scaled, clicked, resized, high, eye, narrow }));
} finally {
  if (browser) await browser.close();
  server.close();
  await once(server, 'close');
}
