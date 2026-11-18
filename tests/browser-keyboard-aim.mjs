// Run with Node and Playwright. NS_PLAYWRIGHT_MODULE and NS_CHROMIUM can point to a local installation.
// NS_ANGLE=vulkan selects an installed Vulkan driver on Linux. The test uses the normal game and its assets.
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
const width = Number(process.env.NS_WIDTH || 1600);
const height = Number(process.env.NS_HEIGHT || 900);
const args = ['--disable-background-networking'];
if (process.env.NS_ANGLE) args.push(`--use-angle=${process.env.NS_ANGLE}`);
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(60_000);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const inspect = () => page.evaluate(() => {
    const s = window.__nsQA.inspect({ arrowTrace: true });
    const compasses = s.arrowTrace.value;
    const mirrorBack = compasses.mirror.dirs.back;
    const brainForward = compasses.brain.dirs.forward.retainedDraw;
    const tip = document.querySelector('.ns-tip');
    const gl = document.querySelector('#ns-canvas').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      frames: s.frames, healthy: s.phase === 'running' && s.features.bodyRig && !s.placeholder && !s.qa,
      input: s.controlTargets, step: s.areaStep, area: s.state.gaze.regionId, camera: s.camera.pose,
      tip: tip.getClientRects().length ? { kind: tip.dataset.kind, text: tip.innerText } : null, quietArea: s.quietKeys.regionId,
      status: document.querySelector('#ns-app').innerText.split('\n').find(line => line.startsWith('Looking at')),
      joints: s.latch.joints, trigger: s.state.trigger, orbit: s.scene.mirror?.orbit,
      overlapTip: mirrorBack.retainedDraw, overlapClick: mirrorBack.clickPx, overlapAnchor: mirrorBack.nominal?.originWorldM,
      clearTip: brainForward,
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
    };
  });
  async function nextFrames(from, count = 4) {
    await page.waitForFunction(({ from, count }) => window.__nsQA.inspect().frames >= from + count, { from, count }, { polling: 80 });
    return inspect();
  }
  async function step(key) {
    const before = await inspect();
    await page.keyboard.press(key);
    const after = await nextFrames(before.frames);
    assert.ok(after.step?.to, `${key} should select a strip area`);
    assert.equal(after.area, after.step.to);
    assert.equal(after.tip.kind, 'area');
    assert.equal(after.quietArea, after.area);
    return after;
  }
  async function aim() {
    await page.goto(`http://${host}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#ns-app')?.dataset.nsPhase === 'playing');
    const initial = await inspect();
    assert.ok(initial.healthy);
    assert.ok(initial.camera.firstPerson);
    if (process.env.NS_ANGLE === 'vulkan') assert.match(initial.renderer, /Vulkan/);
    await page.mouse.click(width / 2, height / 2);
    await page.waitForFunction(() => document.pointerLockElement?.id === 'ns-canvas');
    const firstRight = await step('ArrowRight');
    const firstLeft = await step('ArrowLeft');
    assert.equal(firstLeft.step.from, firstRight.area);
    assert.notEqual(firstLeft.area, firstRight.area);
    await page.keyboard.press('e');
    await page.waitForFunction(() => {
      const pose = window.__nsQA.inspect().camera.pose;
      return pose.thirdPerson && !pose.moving;
    }, null, { polling: 80 });
    const third = await inspect();
    const covered = await step('ArrowRight');
    assert.equal(covered.step.from, firstLeft.area);
    assert.equal(covered.input.arrow, true, 'the regression path must include an actual orbit tip');
    assert.equal(covered.overlapTip.rootVisible, true);
    assert.equal(covered.overlapTip.boxOverlapsMotorArea, true);
    assert.ok(covered.overlapTip.opacityScale > 0 && covered.overlapTip.opacityScale < 0.5);
    assert.equal(covered.clearTip.rootVisible, true);
    assert.equal(covered.clearTip.opacityScale, 1);
    assert.match(covered.tip.text, /Click follows the arrow\. Shift-click presses this area\./);
    assert.match(covered.status, /Looking at \(motor area\)/);
    assert.equal(covered.joints.length, 0, 'looking with a key leaves the joints at rest');
    return { initial, third, covered };
  }

  const numbered = await aim();
  if (process.env.NS_SCREENSHOT) await page.screenshot({ path: process.env.NS_SCREENSHOT });
  await page.keyboard.press('1');
  await page.waitForFunction(area => window.__nsQA.inspect().state.trigger.regionId === area, numbered.covered.area, { polling: 80 });
  const withNumber = await inspect();
  assert.equal(withNumber.trigger.regionId, numbered.covered.area);
  assert.ok(withNumber.joints.length > 0);
  await step('ArrowLeft');
  console.log(JSON.stringify({ chromium: browser.version(), width, height, case: 'number and left step', ...numbered, after: withNumber }));

  const shifted = await aim();
  await page.keyboard.down('Shift');
  await page.mouse.click(width / 2, height / 2);
  await page.keyboard.up('Shift');
  await page.waitForFunction(area => window.__nsQA.inspect().state.trigger.regionId === area, shifted.covered.area, { polling: 80 });
  const withShift = await inspect();
  assert.deepEqual(withShift.orbit, shifted.covered.orbit);
  console.log(JSON.stringify({ case: 'Shift-click area', ...shifted, after: withShift }));

  const arrow = await aim();
  await page.keyboard.press('r');
  await page.waitForFunction(() => document.querySelector('#ns-app[data-ns-read="read"]') !== null, null, { polling: 80, timeout: 5_000 });
  const withCards = await nextFrames(arrow.covered.frames);
  assert.equal(withCards.area, arrow.covered.area);
  assert.ok(withCards.status.includes(arrow.covered.tip.text.split('\n')[0]));
  assert.equal(withCards.tip, null);
  await page.mouse.click(width / 2, height / 2);
  await page.waitForFunction(pitch => window.__nsQA.inspect().scene.mirror?.orbit?.pitchDeg !== pitch, arrow.covered.orbit.pitchDeg, { polling: 80 });
  const withClick = await inspect();
  assert.notEqual(withClick.orbit.pitchDeg, arrow.covered.orbit.pitchDeg);
  assert.equal(withClick.trigger.seq, arrow.covered.trigger.seq, 'clicking the arrow does not press the covered area');
  assert.doesNotMatch(withClick.tip?.text || '', /Shift-click presses this area/);
  await page.keyboard.press('e');
  await page.waitForFunction(() => window.__nsQA.inspect().camera.pose.firstPerson, null, { polling: 80 });
  const returned = await inspect();
  assert.equal(returned.healthy, true);
  assert.doesNotMatch(returned.tip?.text || '', /Shift-click presses this area/);
  console.log(JSON.stringify({ case: 'cards show selected area, plain click turns mirror and E returns', ...arrow, withCards, after: withClick, returned }));

  await aim();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.pointerLockElement && window.__nsQA.inspect().shell.mode === 'paused', null, { polling: 80 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.pointerLockElement && window.__nsQA.inspect().shell.mode === 'playing', null, { polling: 80 });
  const freePointer = await inspect();
  await page.mouse.move(...freePointer.overlapClick);
  const hovered = await nextFrames(freePointer.frames);
  assert.equal(hovered.input.arrow, true);
  assert.equal(hovered.overlapTip.opacityScale, freePointer.overlapTip.opacityScale);
  assert.deepEqual(hovered.orbit, freePointer.orbit, 'hovering leaves the mirror still');
  await page.mouse.click(...freePointer.overlapClick);
  await page.waitForFunction(pitch => window.__nsQA.inspect().scene.mirror?.orbit?.pitchDeg !== pitch, hovered.orbit.pitchDeg, { polling: 80 });
  const withPointer = await inspect();
  assert.equal(withPointer.trigger.seq, hovered.trigger.seq);
  console.log(JSON.stringify({ case: 'free pointer clicks a faded tip at its drawn position', freePointer, hovered, after: withPointer }));
  assert.deepEqual(errors, []);
} finally {
  if (browser) await browser.close();
  server.close();
  await once(server, 'close');
}
