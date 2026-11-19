// Runs the normal preview in Chromium. The Node, Playwright and Chromium settings
// match browser-keyboard-aim.mjs. NS_RAW=1 exercises the normal raw mesh fallback.
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
const raw = process.env.NS_RAW === '1';
const reducedMotion = process.env.NS_REDUCED === '1' ? 'reduce' : 'no-preference';
const args = ['--disable-background-networking'];
if (process.env.NS_ANGLE) args.push(`--use-angle=${process.env.NS_ANGLE}`);

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  const page = await browser.newPage({ viewport, reducedMotion });
  page.setDefaultTimeout(30_000);
  const choice = page.getByRole('group', { name: /Which limb the keys move/ }).locator('[aria-current="true"]');
  const errors = [];
  const assets = { meshPacks: 0, refusedPackIndexes: 0, rawMeshes: 0 };
  page.on('pageerror', error => errors.push(String(error)));
  page.on('response', response => {
    if (!response.ok()) return;
    const file = new URL(response.url()).pathname;
    if (file.endsWith('.nspack')) assets.meshPacks++;
    if (file.endsWith('.obj')) assets.rawMeshes++;
  });
  if (raw) await page.route('**/packs/PACK-INDEX.json', route => {
    assets.refusedPackIndexes++;
    return route.abort();
  });

  const rightJoints = ['r_elbow_flex', 'r_shoulder_flex', 'r_shoulder_abd'];
  const poll = { polling: 80 };
  const inspect = () => page.evaluate(joints => {
    const s = window.__nsQA.inspect();
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const gl = document.querySelector('#ns-canvas').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      frames: s.frames, healthy: s.phase === 'running' && s.features.bodyRig && !s.placeholder && !s.qa,
      reduced: motion, camera: s.camera.pose, reach: s.state.reach.depth,
      right: joints.map(joint => s.bodyJointTargets[joint]), key: s.controls.keys.KeyW,
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null
    };
  }, rightJoints);

  async function waitMode(mode) {
    await page.waitForFunction(mode => window.__nsQA?.inspect()?.shell.mode === mode, mode, poll);
  }

  async function advance(from, count = 4) {
    await page.waitForFunction(frames => window.__nsQA.inspect().frames >= frames, from + count, poll);
  }

  async function resetBody() {
    await page.keyboard.press('Escape');
    await waitMode('paused');
    await page.getByRole('button', { name: /^Reset body$/i }).click();
    await page.keyboard.press('Escape');
    await waitMode('playing');
    const resumed = await inspect();
    await advance(resumed.frames);
  }

  async function moveLeftArm(before) {
    await page.keyboard.down('w');
    await page.waitForFunction(depth => {
      const s = window.__nsQA.inspect();
      return s.controls.keys.KeyW && s.state.reach.depth > depth + 0.01;
    }, before.reach, poll);
    const moved = await inspect();
    await page.keyboard.up('w');
    assert.deepEqual(moved.right, before.right);
    return moved;
  }

  async function moveRightArm(before) {
    await page.keyboard.down('w');
    await page.waitForFunction(({ joints, right }) => {
      const s = window.__nsQA.inspect();
      return s.controls.keys.KeyW && joints.some((joint, i) => Math.abs(s.bodyJointTargets[joint] - right[i]) > 0.5);
    }, { joints: rightJoints, right: before.right }, poll);
    const moved = await inspect();
    await page.keyboard.up('w');
    assert.equal(moved.reach, before.reach);
    return moved;
  }

  await page.goto(`http://${host}/`, { waitUntil: 'domcontentloaded' });
  await waitMode('playing');
  assert.equal(await choice.count(), 1);
  assert.match(await choice.innerText(), /^1\s*Left arm$/);
  const start = await inspect();
  assert.equal(start.healthy && start.camera.firstPerson, true);
  assert.equal(start.reduced, reducedMotion === 'reduce');
  if (process.env.NS_ANGLE === 'vulkan') assert.match(start.renderer, /Vulkan/);
  const leftAtStart = await moveLeftArm(start);
  await resetBody();

  await page.keyboard.press('4');
  await page.waitForFunction(pose => {
    const camera = window.__nsQA.inspect().camera.pose;
    return camera.yaw < pose.yaw - 0.25 && camera.pitch < pose.pitch - 0.14;
  }, start.camera, poll);
  assert.match(await choice.innerText(), /^4\s*Right arm$/);
  const right = await inspect();
  const rightMoved = await moveRightArm(right);

  // Rechoose the right arm after a manual look away, then reset during the turn.
  await page.mouse.click(viewport.width / 2, viewport.height / 2);
  await page.waitForFunction(() => document.pointerLockElement?.id === 'ns-canvas', null, poll);
  await page.mouse.move(viewport.width / 2 + 90, viewport.height / 2 - 70);
  await page.waitForFunction(yaw => Math.abs(window.__nsQA.inspect().camera.pose.yaw - yaw) > 0.15, right.camera.yaw, poll);
  await page.keyboard.press('4');
  await advance((await inspect()).frames, 1);
  await resetBody();
  const reset = await inspect();
  assert.equal(reset.healthy && reset.camera.firstPerson, true);
  assert.equal(await choice.count(), 1);
  assert.match(await choice.innerText(), /^1\s*Left arm$/, 'Reset body restores the visible and accessible limb choice');
  assert.deepEqual([reset.camera.yaw, reset.camera.pitch], [start.camera.yaw, start.camera.pitch]);
  assert.deepEqual(reset.right, start.right);
  assert.equal(reset.reach, start.reach);
  const leftAfterReset = await moveLeftArm(reset);
  assert.deepEqual([leftAfterReset.camera.yaw, leftAfterReset.camera.pitch], [start.camera.yaw, start.camera.pitch]);

  if (raw) {
    assert.ok(assets.refusedPackIndexes > 0 && assets.rawMeshes > 0);
    assert.equal(assets.meshPacks, 0);
  } else {
    assert.ok(assets.meshPacks > 0);
    assert.equal(assets.rawMeshes, 0);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({
    chromium: browser.version(), raw, reducedMotion, assets, errors,
    start, leftAtStart, right, rightMoved, reset, leftAfterReset
  }));
} finally {
  if (browser) await browser.close();
  server.close();
  await once(server, 'close');
}
