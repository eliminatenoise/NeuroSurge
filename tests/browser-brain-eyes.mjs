// Exercise the displayed eyes through the normal game and genuine mouse/key events.
// NS_RAW=1 refuses the pack index. NS_REDUCED=1 uses a reduced-motion browser context.
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
const args = ['--disable-background-networking'];
const angle = process.env.NS_ANGLE;
if (angle) args.push(`--use-angle=${angle}`);
if (angle === 'swiftshader') args.push('--enable-unsafe-swiftshader');
const raw = process.env.NS_RAW === '1';
const reducedMotion = process.env.NS_REDUCED === '1' ? 'reduce' : 'no-preference';
const assets = { packed: 0, raw: 0, refused: 0 };
const errors = [];
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, reducedMotion });
  page.setDefaultTimeout(60_000);
  page.on('pageerror', error => errors.push(String(error)));
  page.on('response', response => {
    if (!response.ok()) return;
    const path = new URL(response.url()).pathname;
    if (path.endsWith('.nspack')) assets.packed++;
    if (path.endsWith('.obj')) assets.raw++;
  });
  if (raw) await page.route('**/packs/PACK-INDEX.json', route => {
    assets.refused++;
    return route.abort();
  });

  await page.goto(`http://${host}/scene/example/preview.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL('**/scene/example/preview.html');
  await page.waitForFunction(() => document.querySelector('#ns-app')?.dataset.nsPhase === 'playing');

  // Observe the two real scene meshes at render time without issuing any game commands from the page.
  await page.evaluate(async () => {
    const { Mesh } = await import(new URL('../../vendor/three.module.js', location.href).href);
    const eyes = new Map();
    const beforeRender = Mesh.prototype.onBeforeRender;
    Mesh.prototype.onBeforeRender = function (...args) {
      if (this.userData.nsBrainPart === 'eyeball') {
        eyes.set(this.name, { pitch: this.rotation.x + 0, yaw: this.rotation.z + 0 });
      }
      return beforeRender.apply(this, args);
    };
    window.readRenderedEyeTurns = (clear = false) => {
      if (clear) eyes.clear();
      return [...eyes.entries()].sort(([a], [b]) => a.localeCompare(b));
    };
  });

  async function sample(label) {
    const from = await page.evaluate(() => {
      window.readRenderedEyeTurns(true);
      return window.__nsQA.inspect().frames;
    });
    await page.waitForFunction(from => window.__nsQA.inspect().frames >= from + 4, from, { polling: 60 });
    const state = await page.evaluate(() => {
      const s = window.__nsQA.inspect();
      const gl = document.querySelector('#ns-canvas').getContext('webgl2');
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        healthy: s.phase === 'running' && s.features.bodyRig && !s.placeholder && !s.qa,
        look: [s.controls.yaw, s.controls.pitch], camera: [s.camera.pose.yaw, s.camera.pose.pitch], position: s.camera.pose.position,
        eyes: window.readRenderedEyeTurns(), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
      };
    });
    console.log(JSON.stringify({ label, ...state }));
    assert.equal(state.healthy, true);
    assert.equal(state.eyes.length, 2);
    return state;
  }

  async function switchView(view) {
    await page.keyboard.press('e');
    await page.waitForFunction(view => {
      const pose = window.__nsQA.inspect().camera.pose;
      return !pose.moving && (view === 'first' ? pose.firstPerson : pose.thirdPerson);
    }, view, { polling: 60 });
  }

  // 24 November 2026 (DESIGN-DECISIONS section 204): the player-controlled camera (ns-camera createPlayerCamera and
  // playerCameraPose, from GitHub main: "From outside, moving the mouse takes the camera around the body at a steady
  // distance") looks along the player's look in both views, so E moves the camera and no longer turns it. Until then the
  // outside camera looked down more steeply than the look, and this test read "E changed the observing camera" from a
  // change of more than 0.1 rad in the camera's pitch. What it protects is kept: E changes the observing camera (now its
  // place, by more than half a metre) and nothing else (the look and both eyes stay as they were).
  const moved3 = (a, b) => Math.hypot(...a.position.map((v, i) => v - b.position[i]));
  await page.mouse.click(800, 450);
  await page.waitForFunction(() => document.pointerLockElement?.id === 'ns-canvas');
  const first = await sample('eye view');
  await switchView('third');
  const outside = await sample('outside view, same look');
  assert.deepEqual(outside.look, first.look);
  assert.ok(moved3(outside, first) > 0.5, `E changed the observing camera (it moved ${moved3(outside, first).toFixed(3)} m)`);
  assert.deepEqual(outside.camera, first.camera, 'the camera looks along the player\'s look in both views');
  assert.deepEqual(outside.eyes, first.eyes, 'changing only the camera must keep both eye poses');

  await page.mouse.move(800, 565);
  const moved = await sample('outside view, looked down');
  assert.ok(moved.look[1] < outside.look[1]);
  for (const [i, [, turn]] of moved.eyes.entries()) {
    assert.ok(turn.pitch - outside.eyes[i][1].pitch > 0.1, 'looking down still turns each eye');
  }
  await switchView('first');
  const returned = await sample('returned to eye view, same look');
  assert.deepEqual(returned.look, moved.look);
  assert.ok(moved3(returned, moved) > 0.5, 'E back to the eye view moves the camera back');
  assert.deepEqual(returned.camera, moved.camera);
  assert.deepEqual(returned.position, first.position, 'the eye view\'s camera stands where it stood');
  assert.deepEqual(returned.eyes, moved.eyes, 'returning to eye view must retain the look');

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Reset body$/i }).click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__nsQA.inspect().shell.mode === 'playing');
  // 24 November 2026 (section 204): Reset body puts the body back and leaves the view where the player set it (main's
  // camera: "The game leaves the view where you set it until you move it again"); until then it also turned the look back
  // to the start look, and this test read the start look and the start eyes straight after it. The eyes show the look,
  // so after the reset they are the eyes of the same look; the start pose comes back when the player looks back to the
  // start look (the pointer captured again, the same 115 px up).
  const reset = await sample('reset');
  assert.deepEqual(reset.look, returned.look, 'Reset body leaves the view where the player set it');
  assert.deepEqual(reset.eyes, returned.eyes, 'after Reset body the eyes look where the view looks');
  await page.mouse.click(800, 450);
  await page.waitForFunction(() => document.pointerLockElement?.id === 'ns-canvas');
  await page.mouse.move(800, 335);
  await page.waitForFunction(pitch => window.__nsQA.inspect().controls.pitch > pitch + 0.1, reset.look[1], { polling: 60 });
  const back = await sample('looked back to the start look');
  const near = (a, b, tol = 1e-9) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);
  assert.ok(near(back.look, first.look), `the same pointer move back gives the start look: ${JSON.stringify(back.look)}`);
  for (const [i, [name, turn]] of back.eyes.entries()) {
    assert.equal(name, first.eyes[i][0]);
    assert.ok(near([turn.pitch, turn.yaw], [first.eyes[i][1].pitch, first.eyes[i][1].yaw], 1e-6), 'at the start look after Reset body the eyes are in their starting pose');
  }
  if (raw) {
    assert.ok(assets.refused > 0 && assets.raw > 0);
    assert.equal(assets.packed, 0);
  } else {
    assert.ok(assets.packed > 0);
    assert.equal(assets.raw, 0);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ assets, reducedMotion, errors, chromium: browser.version() }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
