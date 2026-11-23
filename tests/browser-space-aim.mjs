// Run with Node and Playwright. NS_PLAYWRIGHT_MODULE and NS_CHROMIUM select local installations.
// NS_ANGLE=vulkan selects an installed Vulkan driver. NS_RAW=1 exercises the normal raw-mesh fallback.
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
const raw = process.env.NS_RAW === '1';
const args = ['--disable-background-networking'];
if (process.env.NS_ANGLE) args.push(`--use-angle=${process.env.NS_ANGLE}`);
const width = 1600, height = 900;
// 24 November 2026 (DESIGN-DECISIONS section 204): the player-controlled camera from GitHub main ("From outside, moving
// the mouse takes the camera around the body at a steady distance") looks from outside along the player's own look, so
// the outside view's picture is another one: the mirror body stands in the middle of it, in front of the brain, and the
// crosshair opens on the mirror body's trunk (until then the camera looked down more steeply, the crosshair opened on
// the brain, and the mirror body's torso was at 803, 357). The places are now found in the picture, not fixed: a point
// of the mirror body with the brain behind it (pointAtMirror), and for the captured pointer a look on the brain alone
// (lookAtBrain). What the test protects is unchanged: Space holds what the pointer is on, Shift + Space the brain behind
// it, and the crosshair's target once the pointer is captured.
let visibleMirrorTorso = null;
let browser;

try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const assets = { meshPacks: 0, refusedPackIndexes: 0, rawMeshes: 0 };
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
  const tip = page.locator('.ns-tip');
  const state = () => page.evaluate(() => {
    const s = window.__nsQA.inspect(); // Read-only. All selections and camera changes use browser controls.
    return {
      frames: s.frames, healthy: s.phase === 'running' && s.features.bodyRig && !s.placeholder && !s.qa,
      lock: document.pointerLockElement?.id ?? null, input: s.controlTargets, gaze: s.state.gaze.regionId,
      look: [s.controls.yaw, s.controls.pitch], carry: s.state.objectCarry.target,
      centre: s.state.objectCarry.mirror?.centreWorldM ?? null, mirrorBox: s.scene.mirror?.onScreen?.box ?? null,
    };
  });
  const settled = async () => {
    const { frames } = await state();
    await page.waitForFunction(n => window.__nsQA.inspect().frames >= n + 6, frames, { polling: 40, timeout: 5000 });
    return state();
  };
  const hasTip = async title => {
    const label = tip.getByText(title, { exact: true });
    await label.waitFor({ state: 'visible', timeout: 5000 });
    return label.innerText();
  };
  async function openOutside() {
    const before = { ...assets };
    await page.goto(`http://${host}/scene/example/preview.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/scene/example/preview.html');
    await page.waitForFunction(() => document.querySelector('#ns-app')?.dataset.nsPhase === 'playing', null, { timeout: 45000 });
    assert.ok((await state()).healthy);
    await page.keyboard.press('e');
    await page.waitForFunction(() => {
      const pose = window.__nsQA.inspect().camera.pose;
      return pose.thirdPerson && !pose.moving;
    }, null, { polling: 40, timeout: 5000 });
    const start = await settled();
    assert.equal(start.lock, null);
    // (the crosshair's place from outside: on the mirror body or the brain, whichever the look meets first)
    assert.match(start.input.front, /^(?:brain|mirror):/);
    const [x0, y0, x1, y1] = start.mirrorBox || [];
    assert.ok([x0, y0, x1, y1].every(Number.isFinite) && x1 > 0 && x0 < width && y1 > 0 && y0 < height, `the mirror body is in the outside picture: ${JSON.stringify(start.mirrorBox)}`);
    if (raw) {
      assert.ok(assets.refusedPackIndexes > before.refusedPackIndexes && assets.rawMeshes > before.rawMeshes);
      assert.equal(assets.meshPacks, before.meshPacks);
    } else {
      assert.ok(assets.meshPacks > before.meshPacks);
      assert.equal(assets.rawMeshes, before.rawMeshes);
    }
    return start;
  }
  async function hold(name, target) {
    await page.keyboard.down('Space');
    const visible = await hasTip(`Holding the ${name}`);
    assert.equal(await hasTip('Let go of Space.'), 'Let go of Space.');
    const held = await settled();
    assert.equal(held.lock, 'ns-canvas');
    assert.equal(held.carry, target);
    return { ...held, visible };
  }
  async function release() {
    await page.keyboard.up('Space');
    await page.waitForFunction(() => !window.__nsQA.inspect().state.objectCarry.held, null, { timeout: 5000 });
    const after = await settled();
    assert.equal(after.lock, 'ns-canvas');
    assert.equal(after.carry, null);
    return after;
  }
  /** A pointer place on the mirror body's surface with the brain behind it, inside its projected box (pointer free). */
  async function pointAtMirror(box) {
    const [x0, y0, x1, y1] = box;
    for (const row of [0.3, 0.2, 0.4, 0.5, 0.65]) for (const col of [0.5, 0.42, 0.58]) {
      const x = Math.round(x0 + col * (x1 - x0)), y = Math.round(y0 + row * (y1 - y0));
      if (x <= 0 || x >= width || y <= 0 || y >= height) continue;
      await page.mouse.move(x, y);
      const s = await settled();
      if (s.input.at === 'pointer' && /^mirror:/.test(s.input.front || '') && /^brain:/.test(s.input.behind || '') && !s.input.arrow) return [x, y];
    }
    assert.fail('no point of the mirror body with the brain behind it inside its projected box');
  }
  /** With the pointer captured: turns the look up in steps until the crosshair is on the brain (no other thing in front). */
  async function lookAtBrain(from) {
    let [x, y] = from;
    for (let i = 0; i < 24; i++) {
      const s = await settled();
      if (/^brain:/.test(s.input.front || '') && !s.input.arrow) return s;
      y -= 12;
      await page.mouse.move(x, y);
    }
    assert.fail('the captured look finds the brain above the mirror body');
  }

  const initial = await openOutside();
  visibleMirrorTorso = await pointAtMirror(initial.mirrorBox);
  await page.mouse.move(...visibleMirrorTorso);
  const pointed = await settled();
  assert.equal(pointed.input.at, 'pointer');
  assert.match(pointed.input.front, /^mirror:/);
  assert.match(pointed.input.behind, /^brain:/);
  assert.equal(pointed.input.arrow, false);
  const mirrorPrompt = await hasTip('Space holds the mirror body');
  if (process.env.NS_SPACE_SCREENSHOTS) await page.screenshot({ path: `${process.env.NS_SPACE_SCREENSHOTS}-aim.png` });

  const mirror = await hold('mirror body', 'mirror');
  assert.equal(mirror.input.at, 'crosshair');
  // (24 November 2026: the crosshair stays on what the look was on when the outside view opened; with main's camera that
  // is the mirror body's trunk, until then it was the brain)
  assert.equal(mirror.input.front, initial.input.front, 'auto-capture leaves the crosshair where the look was');
  assert.deepEqual(mirror.look, initial.look, 'auto-capture must keep the camera direction');
  if (process.env.NS_SPACE_SCREENSHOTS) await page.screenshot({ path: `${process.env.NS_SPACE_SCREENSHOTS}-hold.png` });
  await page.keyboard.down('w');
  await page.waitForFunction(z => window.__nsQA.inspect().state.objectCarry.mirror.centreWorldM[2] < z - 0.02,
    mirror.centre[2], { timeout: 5000 });
  await page.keyboard.up('w');
  const dropped = await release();
  assert.ok(dropped.centre[2] < mirror.centre[2] - 0.02);
  await page.mouse.move(visibleMirrorTorso[0] + 42, visibleMirrorTorso[1] - 25);
  const moved = await settled();
  assert.notDeepEqual(moved.look, dropped.look, 'the camera must still follow the mouse after dropping');
  assert.deepEqual(moved.centre, dropped.centre, 'the dropped mirror stays where it was left');

  await openOutside();
  await page.mouse.move(...visibleMirrorTorso);
  await page.keyboard.down('Shift');
  const reached = await settled();
  assert.equal(reached.input.at, 'pointer');
  assert.equal(reached.input.reach, true);
  assert.match(reached.input.front, /^mirror:/);
  assert.match(reached.input.behind, /^brain:/);
  const shiftPrompt = await hasTip('Shift + Space holds the brain');
  const throughMirror = await hold('brain', 'brain');
  await page.keyboard.up('Shift');
  await release();

  const lockedStart = await openOutside();
  // First click captures the pointer without activating the object at the click position.
  await page.mouse.click(...visibleMirrorTorso);
  await page.waitForFunction(() => document.pointerLockElement?.id === 'ns-canvas', null, { timeout: 5000 });
  const locked = await settled();
  assert.equal(locked.input.at, 'crosshair');
  assert.equal(locked.input.front, lockedStart.input.front, 'the capture leaves the crosshair where the look was');
  assert.deepEqual(locked.look, lockedStart.look);
  assert.equal(locked.carry, null, 'the capturing click activates nothing');
  const onBrain = await lookAtBrain(visibleMirrorTorso);
  assert.ok(onBrain.look[1] >= locked.look[1], 'the look went up to the brain, or was on it');
  const crosshairBrain = await hold('brain', 'brain');
  await release();

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({
    chromium: browser.version(), raw, assets, pointed, mirrorPrompt, mirror, dropped, moved, reached,
    shiftPrompt, throughMirror, locked, onBrain, crosshairBrain, visibleMirrorTorso
  }));
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
