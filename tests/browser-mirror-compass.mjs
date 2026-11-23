// Exercises the separate green and grey 3D compass controls in normal play. NS_BROWSER_CDP can attach to an
// isolated headful Chromium to repeat the landscape test at native 200% page zoom.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.NS_TEST_ROOT ? resolve(process.env.NS_TEST_ROOT) : fileURLToPath(new URL('../', import.meta.url));
const { createHandler, HOST } = await import(pathToFileURL(join(root, 'serve-local.mjs')));
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
    const dir = (set, name) => {
      const tip = set.dirs[name], click = tip.clickPx;
      const top = click ? document.elementFromPoint(...click) : null;
      return { click, box: tip.boxPx, centre: tip.nominal?.originWorldM, matrix: tip.nominal?.matrix,
        draws: set.groupVisible && tip.retainedDraw.rootVisible && tip.retainedDraw.meshVisible,
        overMotor: tip.retainedDraw.boxOverlapsMotorArea, clear: top === canvas };
    };
    const compass = (set, pose) => ({ pose, hover: set.hovered, blocked: set.hoverBlocked, planRevision: set.planRevision,
      recovery: set.frame.openingUp ?? null, dirs: Object.fromEntries(Object.keys(set.dirs).map(name => [name, dir(set, name)])) });
    return {
      frames: state.frames,
      healthy: state.phase === 'running' && state.features.bodyRig && !state.placeholder && !state.qa,
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
      viewport: [innerWidth, innerHeight], ratio: devicePixelRatio,
      camera: state.camera.pose, lens: trace.activeCamera.fovYDeg,
      targets: state.controlTargets, trigger: state.state.trigger, renderedMirror: state.scene.mirror.orbit,
      locked: document.pointerLockElement?.id ?? null,
      brain: compass(trace.brain, state.state.view.orbit), mirror: compass(trace.mirror, state.features.round5.mirrorOrbit),
    };
  });
  if (nativeBrowser) {
    await page.goto('about:blank');
    report.beforeZoom = await page.evaluate(() => ({ width: innerWidth, ratio: devicePixelRatio }));
    await page.goto('chrome://settings/appearance', { waitUntil: 'domcontentloaded' });
    const zoom = page.locator('select').filter({ has: page.getByRole('option', { name: '200%', exact: true }) });
    await zoom.selectOption({ label: '200%' });
    assert.equal(await zoom.evaluate(select => select.selectedOptions[0].textContent.trim()), '200%');
  }
  const start = performance.now();
  await page.goto(`http://${host}/scene/example/preview.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => ['playing', 'error'].includes(document.querySelector('#ns-app')?.dataset.nsPhase));
  report.readyMs = Math.round(performance.now() - start);
  await page.locator('.ns-keys.ns-ctl').waitFor({ state: 'detached' });
  const advance = (frames, count = 4) => page.waitForFunction(
    ([frames, count]) => window.__nsQA.inspect().frames >= frames + count, [frames, count]);
  await advance((await read()).frames);
  report.initial = await read();
  await screenshot('opening');
  assert.ok(report.initial.healthy && report.initial.camera.firstPerson);
  // 24 November 2026 (DESIGN-DECISIONS section 204, CAM70 pass 2): no turn arrow starts on the crosshair (the box of
  // ns-scene-three R5_BIGBRAIN.crosshairKeepPx, 8 px, round the middle). With the player camera's plan views looking
  // along the brain's placement direction, the mirror body's lower tip was drawn there and the first click at the middle
  // of the window tilted the mirror body.
  for (const [target, compass] of [['brain', report.initial.brain], ['mirror', report.initial.mirror]]) {
    for (const [name, tip] of Object.entries(compass.dirs)) {
      if (!tip.box || !tip.draws) continue;
      const [w, h] = report.initial.viewport, k = 8, b = tip.box;
      assert.ok(b.x1 <= w / 2 - k || b.x0 >= w / 2 + k || b.y1 <= h / 2 - k || b.y0 >= h / 2 + k, `${target} ${name} does not start on the crosshair: ${JSON.stringify(b)}`);
    }
  }
  assert.notEqual(report.initial.targets?.arrow, true, 'the crosshair does not start on a turn arrow');
  if (process.env.NS_ANGLE === 'vulkan') assert.match(report.initial.renderer, /Vulkan/);
  if (nativeBrowser) {
    assert.ok(report.initial.ratio >= report.beforeZoom.ratio * 1.99);
    assert.ok(report.initial.viewport[0] <= report.beforeZoom.width * 0.51);
  }
  if (raw) assert.ok(report.assets.indexesRefused > 0 && report.assets.rawMeshes > 0 && !report.assets.packs);
  else assert.ok(report.assets.packs > 0 && !report.assets.rawMeshes);

  async function releasePointer() {
    if (!(await read()).locked) return;
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.pointerLockElement && window.__nsQA.inspect().shell.mode === 'paused');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__nsQA.inspect().shell.mode === 'playing');
    await advance((await read()).frames);
  }
  function assertAvailable(state, target, name) {
    const tip = state[target].dirs[name];
    assert.ok(tip.draws && tip.click && tip.clear, `${target} ${name} has a visible and reachable stroke`);
    const { x0, y0, x1, y1 } = tip.box;
    const [width, height] = state.viewport;
    assert.ok(x0 >= 0 && y0 >= 0 && x1 <= width && y1 <= height, `${target} ${name} fits in the picture`);
    if (target === 'mirror' && name === 'forward') {
      assert.equal(tip.overMotor, false, 'the green up arrow leaves motor colours clear');
      for (const [otherTarget, compass] of [['brain', state.brain], ['mirror', state.mirror]]) {
        for (const [otherName, other] of Object.entries(compass.dirs)) {
          if (!other.box || target === otherTarget && name === otherName) continue;
          const b = other.box;
          assert.ok(x0 >= b.x1 || x1 <= b.x0 || y0 >= b.y1 || y1 <= b.y0, `green up arrow leaves ${otherTarget} ${otherName} clear`);
        }
      }
    }
    return tip;
  }
  async function turn(target, name, axis, by) {
    const before = await read();
    const tip = assertAvailable(before, target, name);
    if (portraitTouch) await page.touchscreen.tap(...tip.click);
    else {
      await page.mouse.move(...tip.click);
      await page.waitForFunction(([target, name]) => {
        const set = window.__nsQA.inspect({ arrowTrace: true }).arrowTrace.value[target];
        return set.hovered === name && !set.hoverBlocked;
      }, [target, name], { timeout: 5_000 });
      const hovered = await read();
      assert.deepEqual(hovered[target].pose, before[target].pose);
      assert.equal(hovered.trigger.seq, before.trigger.seq);
      if (name === 'forward') await screenshot(`${target}-up-hover`);
      await page.mouse.click(...tip.click);
    }
    await page.waitForFunction(({ target, axis, before, by }) => {
      const s = window.__nsQA.inspect();
      const pose = target === 'mirror' ? s.features.round5.mirrorOrbit : s.state.view.orbit;
      return Math.sign(by) * (pose[axis] - before) > 0;
    }, { target, axis, before: before[target].pose[axis], by });
    await advance((await read()).frames);
    const after = await read();
    assert.deepEqual(after[target].pose, { ...before[target].pose, [axis]: before[target].pose[axis] + by });
    const other = target === 'mirror' ? 'brain' : 'mirror';
    assert.deepEqual(after[other].pose, before[other].pose, `turning ${target} leaves ${other} in place`);
    if (target === 'mirror') assert.equal(after.renderedMirror[`${axis}Deg`], after.mirror.pose[axis]);
    const restoredPortraitMirror = portraitTouch && target === 'mirror' && after.mirror.pose.pitch === 0;
    if (restoredPortraitMirror) {
      // The existing portrait layout refits when the reflection returns upright.
      assertAvailable(after, 'mirror', 'forward');
      assertAvailable(after, 'mirror', 'back');
    } else {
      for (const name of Object.keys(before[target].dirs)) {
        const a = after[target].dirs[name].centre, b = before[target].dirs[name].centre;
        assert.ok(Math.hypot(...a.map((value, i) => value - b[i])) < 0.001, `${target} ${name} keeps its anchor`);
      }
    }
    assert.equal(after.trigger.seq, before.trigger.seq, 'orbit does not activate a motor area');
    assert.equal(after.lens, before.lens, 'orbit does not tighten the lens');
    assert.deepEqual(after.camera.position, before.camera.position, 'orbit leaves the camera in place');
    await releasePointer();
    return after;
  }

  report.mirrorUp = await turn('mirror', 'forward', 'pitch', 15);
  report.mirrorDown = await turn('mirror', 'back', 'pitch', -15);
  if (!portraitTouch) {
    report.mirrorRight = await turn('mirror', 'right', 'yaw', 15);
    report.mirrorLeft = await turn('mirror', 'left', 'yaw', -15);
  }
  report.brainUp = await turn('brain', 'forward', 'pitch', 15);
  report.brainDown = await turn('brain', 'back', 'pitch', -15);
  assert.deepEqual(report.brainDown.mirror.pose, report.initial.mirror.pose);
  assert.deepEqual(report.brainDown.brain.pose, report.initial.brain.pose);
  await screenshot('back-to-start');
  if (process.env.NS_CHECK_HOLD === '1' && !portraitTouch) {
    const before = await read();
    const tip = assertAvailable(before, 'mirror', 'forward');
    await page.mouse.move(...tip.click);
    await page.mouse.down();
    await page.waitForFunction(() => window.__nsQA.inspect().features.round5.mirrorOrbit.pitch > 15);
    await page.mouse.up();
    const released = await read();
    await advance(released.frames, 20);
    report.heldThenReleased = await read();
    assert.ok(report.heldThenReleased.mirror.pose.pitch >= released.mirror.pose.pitch);
    await advance(report.heldThenReleased.frames, 20);
    assert.deepEqual((await read()).mirror.pose, report.heldThenReleased.mirror.pose, 'release stops the turn');
    assert.deepEqual(report.heldThenReleased.brain.pose, before.brain.pose);
    assert.equal(report.heldThenReleased.trigger.seq, before.trigger.seq);
    assert.equal(report.heldThenReleased.lens, before.lens);
  }
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = String(error);
  throw error;
} finally {
  console.log(JSON.stringify(report, null, 2));
  await browser?.close();
  server.closeAllConnections();
  server.close();
}
