// Exercises both vertical brain arrows during ordinary play. NS_BROWSER_CDP can attach to an
// isolated headful Chromium to repeat the landscape test at native 200% page zoom.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
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
const nativeBrowser = process.env.NS_BROWSER_CDP;
const portraitTouch = process.env.NS_TOUCH === '1';
const raw = process.env.NS_RAW === '1';
const viewport = { width: Number(process.env.NS_WIDTH || 1600), height: Number(process.env.NS_HEIGHT || 900) };
const args = ['--disable-background-networking'];
if (process.env.NS_ANGLE) args.push(`--use-angle=${process.env.NS_ANGLE}`);
const report = { raw, errors: [], assets: { packs: 0, indexesRefused: 0, rawMeshes: 0 } };
let browser;

try {
  browser = nativeBrowser
    ? await chromium.connectOverCDP(nativeBrowser, { noDefaults: true })
    : await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  report.browser = browser.version();
  const page = nativeBrowser ? browser.contexts()[0].pages()[0]
    : await browser.newPage({ viewport, isMobile: portraitTouch, hasTouch: portraitTouch });
  page.setDefaultTimeout(30_000);
  await page.bringToFront();
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('response', response => {
    if (!response.ok()) return;
    const path = new URL(response.url()).pathname;
    if (path.endsWith('.nspack')) report.assets.packs++;
    if (path.endsWith('.obj')) report.assets.rawMeshes++;
  });
  if (raw) await page.route('**/packs/PACK-INDEX.json', route => {
    report.assets.indexesRefused++;
    return route.abort();
  });
  const screenshotSession = nativeBrowser && process.env.NS_SCREENSHOTS ? await page.context().newCDPSession(page) : null;
  async function screenshot(name) {
    if (!process.env.NS_SCREENSHOTS) return;
    const path = join(process.env.NS_SCREENSHOTS, name + '.png');
    if (!screenshotSession) return page.screenshot({ path });
    const { data } = await screenshotSession.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(path, Buffer.from(data, 'base64'));
  }
  const read = () => page.evaluate(() => {
    const state = window.__nsQA.inspect({ arrowTrace: true });
    const trace = state.arrowTrace.value;
    const canvas = document.querySelector('#ns-canvas');
    const gl = canvas.getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const describe = dir => {
      const tip = trace.brain.dirs[dir];
      const click = tip.clickPx;
      return { click, box: tip.boxPx, draws: trace.brain.groupVisible && tip.retainedDraw.rootVisible && tip.retainedDraw.meshVisible,
        overlap: tip.retainedDraw.boxOverlapsMotorArea,
        clear: click ? document.elementFromPoint(...click) === canvas : false };
    };
    return {
      frames: state.frames,
      healthy: state.phase === 'running' && state.features.bodyRig && !state.placeholder && !state.qa,
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
      viewport: [innerWidth, innerHeight],
      ratio: devicePixelRatio,
      camera: state.camera.pose,
      strip: trace.brain.frame?.targetBoxPx,
      up: describe('forward'),
      down: describe('back'),
      hovered: trace.brain.hovered,
      locked: document.pointerLockElement?.id ?? null,
      targets: state.controlTargets,
      mirrorHover: trace.mirror.hovered,
      orbit: state.state.view.orbit,
      trigger: state.state.trigger,
      guideCount: document.querySelector('.ns-prompt-count')?.textContent,
      guideText: document.querySelector('.ns-prompt-words')?.textContent,
    };
  });
  const advance = (frames, count = 4) => page.waitForFunction(
    ([frames, count]) => window.__nsQA.inspect().frames >= frames + count, [frames, count]);
  if (nativeBrowser) {
    await page.goto('about:blank');
    report.beforeZoom = await page.evaluate(() => ({ width: innerWidth, ratio: devicePixelRatio }));
    await page.goto('chrome://settings/appearance', { waitUntil: 'domcontentloaded' });
    const zoom = page.locator('select').filter({ has: page.getByRole('option', { name: '200%', exact: true }) });
    await zoom.selectOption({ label: '200%' });
    assert.equal(await zoom.evaluate(select => select.selectedOptions[0].textContent.trim()), '200%');
  }
  const start = performance.now();
  await page.goto(`http://${host}/`, {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => ['playing', 'error'].includes(document.querySelector('#ns-app')?.dataset.nsPhase));
  report.readyMs = Math.round(performance.now() - start);
  await advance((await read()).frames);
  report.initial = await read();
  await screenshot('opening');
  assert.ok(report.initial.healthy && report.initial.camera.firstPerson);
  if (process.env.NS_ANGLE === 'vulkan') assert.match(report.initial.renderer, /Vulkan/);
  if (nativeBrowser) {
    assert.ok(report.initial.ratio >= report.beforeZoom.ratio * 1.99);
    assert.ok(report.initial.viewport[0] <= report.beforeZoom.width * 0.51);
  }
  if (raw) assert.ok(report.assets.indexesRefused > 0 && report.assets.rawMeshes > 0 && !report.assets.packs);
  else assert.ok(report.assets.packs > 0 && !report.assets.rawMeshes);

  async function orbit(name, direction, sign) {
    const before = await read();
    const tip = before[name];
    const [width, height] = before.viewport;
    assert.ok(tip.draws && tip.click && tip.clear, `the ${name} arrow has a visible stroke on the canvas`);
    assert.ok(tip.box.x0 >= 0 && tip.box.y0 >= 0 && tip.box.x1 <= width && tip.box.y1 <= height);
    // The portrait plan predates this repair. Its up arrow can overlap a coloured region.
    if (!portraitTouch) assert.equal(tip.overlap, false, `the ${name} arrow leaves the motor colours clear`);
    if (portraitTouch) await page.touchscreen.tap(...tip.click);
    else {
      await page.mouse.move(...tip.click);
      try {
        await page.waitForFunction(direction => window.__nsQA.inspect({ arrowTrace: true }).arrowTrace.value.brain.hovered === direction,
          direction, { timeout: 5_000 });
      } catch (error) {
        report.failedHover = await read();
        throw error;
      }
      await screenshot(`hover-${name}`);
      await page.mouse.click(...tip.click);
    }
    await page.waitForFunction(({ pitch, sign }) => sign * (window.__nsQA.inspect().state.view.orbit.pitch - pitch) > 0,
      { pitch: before.orbit.pitch, sign });
    await advance((await read()).frames);
    const after = await read();
    assert.equal(after.orbit.pitch, before.orbit.pitch + sign * 15);
    assert.equal(after.orbit.yaw, before.orbit.yaw);
    assert.equal(after.trigger.seq, before.trigger.seq, 'an orbit press does not trigger a motor movement');
    assert.deepEqual(after.camera.position, before.camera.position, 'the brain turns without moving the camera');
    return after;
  }
  async function releasePointer() {
    if (!(await read()).locked) return;
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.pointerLockElement && window.__nsQA.inspect().shell.mode === 'paused');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__nsQA.inspect().shell.mode === 'playing');
    await advance((await read()).frames);
  }

  report.up = await orbit('up', 'forward', 1);
  await releasePointer();
  report.down = await orbit('down', 'back', -1);
  assert.deepEqual(report.down.orbit, report.initial.orbit);
  await screenshot('after-turns');

  if (!portraitTouch) {
    // Turn the brain and then take a genuine gameplay step with the ordinary keyboard.
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => window.__nsQA.inspect().areaStep?.to);
    await page.waitForFunction(count => parseInt(document.querySelector('.ns-prompt-count')?.textContent, 10) > count,
      parseInt(report.initial.guideCount, 10), { timeout: 5_000 });
    const aimed = await page.evaluate(() => {
      const state = window.__nsQA.inspect();
      return { step: state.areaStep, front: state.controlTargets.front,
        guideCount: document.querySelector('.ns-prompt-count')?.textContent };
    });
    assert.equal(aimed.front, `brain:area:${aimed.step.to}`);
    assert.ok(parseInt(aimed.guideCount, 10) > parseInt(report.initial.guideCount, 10), 'the guide advances after real motor-area progression');
    report.aimed = aimed;
    await screenshot('motor-area');
  }
  assert.deepEqual(report.errors, []);
} finally {
  console.log(JSON.stringify(report, null, 2));
  await browser?.close();
  server.closeAllConnections();
  server.close();
}
