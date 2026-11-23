// Runs the normal preview in Chromium. The Node, Playwright and Chromium settings
// match browser-keyboard-aim.mjs. NS_RAW=1 exercises the normal raw mesh fallback.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHandler, HOST } from '../serve-local.mjs';
import { LIMB_KEYS } from '../scene/src/ns-app.mjs';

// 20 November 2026: the view and a newly chosen limb, restated for the current rule (ns-app LIMB_KEYS.view and
// keepInFrameTurn; DESIGN-DECISIONS section 144). Written on 19 November for the earlier rule, under which key 4 turned
// the view to the right arm. The owner withdrew that the same evening: "Perhaps the problem with the zoom in, zoom out
// fixes we look up and down is the 3/4 height rule. Disregard that rule." Now, after a limb is chosen, its wrist or
// ankle is inside the picture's band (`band` of the half width, `bandUp` of the half height), and the view turns only
// if it was outside: at the start look the right hand is inside, so 4 there leaves the view where it is.
const { band: limbBand, bandUp: limbBandUp } = LIMB_KEYS.view;
const BAND_SLACK = 0.03; // the turn stops within doneDeg (0.4 degrees) of the band's edge: about 0.014 of the half height
const inLimbBand = (end, slack = 0) => Boolean(end) && Math.abs(end.x) <= limbBand + slack && Math.abs(2 * end.up - 1) <= limbBandUp + slack;

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
      leftEnd: s.limbs.ends.leftArm.end,
      // each wrist in the picture (x: -1 .. 1 across, up: 0 .. 1 from the bottom) and the view's turn to a limb
      leftInPicture: s.limbs.ends.leftArm.inPicture, rightInPicture: s.limbs.ends.rightArm.inPicture, turning: s.limbs.turning,
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
    // Body46 starts the hand near full reach. Make room before testing W.
    await page.keyboard.down('s');
    await page.waitForFunction(end => {
      const s = window.__nsQA.inspect();
      return s.controls.keys.KeyS && s.limbs.ends.leftArm.end[2] > end[2] + 0.03;
    }, before.leftEnd, poll);
    await page.keyboard.up('s');
    await advance((await inspect()).frames);
    const drawnNearer = await inspect();
    await page.keyboard.down('w');
    await page.waitForFunction(end => {
      const s = window.__nsQA.inspect();
      return s.controls.keys.KeyW && s.limbs.limb === 'leftArm' &&
        s.limbs.ends.leftArm.end[2] < end[2] - 0.01;
    }, drawnNearer.leftEnd, poll);
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

  await page.goto(`http://${host}/scene/example/preview.html`, { waitUntil: 'domcontentloaded' });
  await waitMode('playing');
  assert.equal(await choice.count(), 1);
  assert.match(await choice.innerText(), /^1\s*Left arm$/);
  const start = await inspect();
  assert.equal(start.healthy && start.camera.firstPerson, true);
  assert.equal(start.reduced, reducedMotion === 'reduce');
  if (process.env.NS_ANGLE === 'vulkan') assert.match(start.renderer, /Vulkan/);
  const leftAtStart = await moveLeftArm(start);
  await resetBody();

  const beforeRight = await inspect();
  const rightWasInBand = inLimbBand(beforeRight.rightInPicture);
  await page.keyboard.press('4');
  await page.waitForFunction(() => window.__nsQA.inspect().limbs.limb === 'rightArm', null, poll);
  if (!rightWasInBand) {
    await page.waitForFunction(pose => {
      const camera = window.__nsQA.inspect().camera.pose;
      return Math.hypot(camera.yaw - pose.yaw, camera.pitch - pose.pitch) > 0.03;
    }, beforeRight.camera, poll);
  }
  await page.waitForTimeout(950); // one framing turn takes at most 900 ms
  await page.waitForFunction(() => !window.__nsQA.inspect().limbs.turning, null, poll);
  assert.match(await choice.innerText(), /^4\s*Right arm$/);
  const right = await inspect();
  if (rightWasInBand) {
    assert.deepEqual([right.camera.yaw, right.camera.pitch], [beforeRight.camera.yaw, beforeRight.camera.pitch],
      'the right hand was inside the picture\'s band, so 4 leaves the view where it was');
  }
  assert.ok(inLimbBand(right.rightInPicture, BAND_SLACK), `the right hand is inside the picture's band: ${JSON.stringify(right.rightInPicture)}`);
  const rightMoved = await moveRightArm(right);

  // Choose the right arm again after a manual look away, then reset during the turn. (20 November 2026: the look carries
  // the chosen limb, its hand keeping its place in the picture, so with the right arm chosen during the look away its
  // hand stays in the band and choosing it again turns nothing. The left arm is chosen for the look away instead, and
  // the look goes higher than the 70 px of 19 November, which left the right hand only just under the band; the right
  // hand is now well out of it, and 4 starts a real turn.)
  await page.keyboard.press('1');
  await page.waitForFunction(() => window.__nsQA.inspect().limbs.limb === 'leftArm', null, poll);
  await page.mouse.click(viewport.width / 2, viewport.height / 2);
  await page.waitForFunction(() => document.pointerLockElement?.id === 'ns-canvas', null, poll);
  await page.mouse.move(viewport.width / 2 + 90, viewport.height / 2 - 130);
  await page.waitForFunction(yaw => Math.abs(window.__nsQA.inspect().camera.pose.yaw - yaw) > 0.15, right.camera.yaw, poll);
  await advance((await inspect()).frames);
  const lookedAway = await inspect();
  assert.ok(!inLimbBand(lookedAway.rightInPicture), `the look away leaves the right hand outside the band: ${JSON.stringify(lookedAway.rightInPicture)}`);
  // 24 November 2026 (DESIGN-DECISIONS section 204): the player-controlled camera from GitHub main ("The game leaves the
  // view where you set it until you move it again"; ns-app limbView is never started with it). Until then 4 here turned
  // the view toward the right hand, and this test read that turn ("the view is turning to the right hand") and then
  // Reset body during it, which put the look back to the start look. Now choosing the right arm leaves the view where the
  // player put it, and so does Reset body; it still puts the body and the limb choice back.
  await page.keyboard.press('4');
  await page.waitForFunction(() => window.__nsQA.inspect().limbs.limb === 'rightArm', null, poll);
  await page.waitForTimeout(950); // (one framing turn of the earlier camera took at most 900 ms)
  const turning = await inspect();
  assert.equal(turning.turning, false, 'choosing a limb never turns the player\'s view');
  assert.deepEqual([turning.camera.yaw, turning.camera.pitch], [lookedAway.camera.yaw, lookedAway.camera.pitch], 'choosing the right arm leaves the view where the player put it');
  await resetBody();
  const resetAway = await inspect();
  assert.equal(resetAway.healthy && resetAway.camera.firstPerson, true);
  assert.equal(await choice.count(), 1);
  assert.match(await choice.innerText(), /^1\s*Left arm$/, 'Reset body restores the visible and accessible limb choice');
  assert.deepEqual([resetAway.camera.yaw, resetAway.camera.pitch], [lookedAway.camera.yaw, lookedAway.camera.pitch], 'Reset body leaves the view where the player put it');
  assert.deepEqual(resetAway.right, start.right, 'Reset body puts the right arm back');
  assert.equal(resetAway.reach, start.reach);
  // The player looks back to the start look (the pointer captured again, the same move back), and Reset body there puts
  // everything where it was at the start, the left hand too (with the left arm chosen the look up and down also moves
  // it: main's joint aim, ns-app updateJointAim).
  await page.mouse.click(viewport.width / 2 + 90, viewport.height / 2 - 130);
  await page.waitForFunction(() => document.pointerLockElement?.id === 'ns-canvas', null, poll);
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.waitForFunction(yaw => Math.abs(window.__nsQA.inspect().camera.pose.yaw - yaw) < 1e-6, start.camera.yaw, poll);
  await resetBody();
  const reset = await inspect();
  assert.equal(reset.healthy && reset.camera.firstPerson, true);
  assert.deepEqual([reset.camera.yaw, reset.camera.pitch], [start.camera.yaw, start.camera.pitch], 'the same pointer move back gives the start look');
  assert.deepEqual(reset.right, start.right);
  assert.equal(reset.reach, start.reach);
  assert.deepEqual(reset.leftEnd, start.leftEnd, 'Reset body at the start look puts the left hand where it started');
  const leftAfterReset = await moveLeftArm(reset);
  assert.equal(leftAfterReset.camera.firstPerson, true);
  // 20 November 2026: restated for the current rule (above). Under the rule of 19 November afternoon the view followed
  // the wrist to hold it three quarters of the way up the picture, so S and W turned it. Now the view follows a keyed
  // hand only when it would leave the picture's band; the short S and W here keep the left wrist inside it, so the view
  // stays where Reset body put it.
  assert.ok(inLimbBand(leftAfterReset.leftInPicture, BAND_SLACK), `the left wrist is inside the picture's band: ${JSON.stringify(leftAfterReset.leftInPicture)}`);
  assert.deepEqual([leftAfterReset.camera.yaw, leftAfterReset.camera.pitch], [reset.camera.yaw, reset.camera.pitch]);

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
    start, leftAtStart, right, rightMoved, lookedAway, turning, resetAway, reset, leftAfterReset
  }));
} finally {
  if (browser) await browser.close();
  server.close();
  await once(server, 'close');
}
