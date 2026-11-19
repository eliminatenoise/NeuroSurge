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

  await page.goto(`http://${host}/`, { waitUntil: 'domcontentloaded' });
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
        look: [s.controls.yaw, s.controls.pitch], camera: [s.camera.pose.yaw, s.camera.pose.pitch],
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

  await page.mouse.click(800, 450);
  await page.waitForFunction(() => document.pointerLockElement?.id === 'ns-canvas');
  const first = await sample('eye view');
  await switchView('third');
  const outside = await sample('outside view, same look');
  assert.deepEqual(outside.look, first.look);
  assert.ok(Math.abs(outside.camera[1] - first.camera[1]) > 0.1, 'E changed the observing camera');
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
  assert.ok(Math.abs(returned.camera[1] - moved.camera[1]) > 0.1);
  assert.deepEqual(returned.eyes, moved.eyes, 'returning to eye view must retain the look');

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Reset body$/i }).click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__nsQA.inspect().shell.mode === 'playing');
  const reset = await sample('reset');
  assert.deepEqual(reset.look, first.look);
  assert.deepEqual(reset.eyes, first.eyes, 'Reset body returns the eyes to their starting pose');
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
