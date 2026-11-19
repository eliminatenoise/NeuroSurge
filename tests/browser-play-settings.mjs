// Tests the normal preview, including keyboard-only play between visits to the pause menu.
// Set NS_RAW=1 for raw OBJ loads, and NS_WIDTH / NS_HEIGHT for other CSS viewport sizes.
// NS_BROWSER_CDP attaches to an isolated, disposable headful Chromium for a real browser zoom test.
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
const raw = process.env.NS_RAW === '1';
const nativeBrowser = process.env.NS_BROWSER_CDP;
const viewport = { width: Number(process.env.NS_WIDTH || 320), height: Number(process.env.NS_HEIGHT || 480) };
const args = ['--disable-background-networking'];
if (process.env.NS_ANGLE) args.push(`--use-angle=${process.env.NS_ANGLE}`);
const report = { raw, errors: [], assets: { packs: 0, indexesRefused: 0, rawMeshes: 0 } };
let browser;
try {
  browser = nativeBrowser
    ? await chromium.connectOverCDP(nativeBrowser, { noDefaults: true })
    : await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  report.chromium = browser.version();
  const page = nativeBrowser ? browser.contexts()[0].pages()[0] : await browser.newPage({ viewport });
  assert.ok(page, 'the isolated Chromium instance must open a tab');
  await page.bringToFront();
  page.setDefaultTimeout(45_000);
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
  const screenshot = async name => {
    if (!process.env.NS_SCREENSHOTS) return;
    const path = join(process.env.NS_SCREENSHOTS, name + '.png');
    if (screenshotSession) {
      // Capture the browser's full surface at native zoom without a CSS-viewport clip.
      const { data } = await screenshotSession.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path, Buffer.from(data, 'base64'));
    } else await page.screenshot({ path });
  };
  const inspect = () => page.evaluate(() => {
    const data = window.__nsQA.inspect();
    const gl = document.querySelector('#ns-canvas').getContext('webgl2');
    const renderer = gl?.getExtension('WEBGL_debug_renderer_info');
    const focus = document.activeElement;
    return {
      running: data.phase === 'running' && data.features.bodyRig && !data.placeholder && !data.qa,
      frames: data.frames, shell: data.shell.mode, locked: document.pointerLockElement?.id ?? null,
      camera: data.camera.view, look: [data.controls.yaw, data.controls.pitch],
      region: data.state.gaze.regionId, step: data.areaStep?.seq ?? 0, stepTo: data.areaStep?.to ?? null,
      trigger: data.state.trigger,
      carry: data.state.objectCarry.target, pressed: data.controls.keys,
      settings: data.settings, read: document.getElementById('ns-app').dataset.nsRead,
      limb: document.querySelector('.ns-limbs [aria-current="true"]')?.textContent.trim(),
      focus: focus.id || focus.textContent.trim(), focusOutline: getComputedStyle(focus).outline,
      renderer: renderer ? gl.getParameter(renderer.UNMASKED_RENDERER_WEBGL) : null,
    };
  });
  const advance = async (frames, count = 4) => page.waitForFunction(
    ([frames, count]) => window.__nsQA.inspect().frames >= frames + count, [frames, count]);
  async function tabTo(locator, key = 'Tab') {
    for (let count = 0; count < 12; count++) {
      if (await locator.evaluate(node => document.activeElement === node)) return;
      await page.keyboard.press(key);
    }
    assert.fail(`Could not focus ${await locator.getAttribute('class')} with ${key}`);
  }

  if (nativeBrowser) {
    await page.goto('about:blank');
    report.zoomBefore = await page.evaluate(() => ({ ratio: devicePixelRatio, width: innerWidth }));
    await page.goto('chrome://settings/appearance', { waitUntil: 'domcontentloaded' });
    const zoom = page.locator('select').filter({ has: page.getByRole('option', { name: '200%', exact: true }) });
    await zoom.selectOption({ label: '200%' });
    report.zoomSetting = await zoom.evaluate(node => node.selectedOptions[0].textContent.trim());
    assert.equal(report.zoomSetting, '200%');
  }
  const start = performance.now();
  await page.goto(`http://${host}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL('**/scene/example/preview.html');
  await page.locator('.ns-ctl').waitFor();
  report.startup = await page.locator('.ns-ctl').evaluate(card => {
    const boxes = [...card.querySelectorAll('.ns-ctl-chunk, .ns-ctl-help')].map(node => {
      const { top, left, bottom, right } = node.getBoundingClientRect();
      return { text: node.innerText.replace(/\s+/g, ' ').trim(), top, left, bottom, right };
    });
    const loader = document.querySelector('.ns-load:not(.ns-load-out)');
    const progress = loader ? loader.getBoundingClientRect().toJSON() : null;
    return { boxes, progress, width: innerWidth, height: innerHeight, ratio: devicePixelRatio };
  });
  assert.equal(report.startup.boxes.length, 5);
  for (const { top, left, bottom, right, text } of report.startup.boxes) {
    assert.ok(top >= 0 && left >= 0 && bottom <= report.startup.height + 1 && right <= report.startup.width + 1,
      `Startup controls overflow the viewport: ${text}`);
  }
  assert.ok(report.startup.boxes.some(box => /Esc for controls and settings/.test(box.text)));
  if (report.startup.progress && report.startup.width <= 900) {
    const progress = report.startup.progress;
    assert.ok(report.startup.boxes.every(box => progress.bottom <= box.top),
      'loading progress must leave the narrow startup controls readable');
  }
  if (nativeBrowser) {
    assert.ok(report.startup.ratio >= report.zoomBefore.ratio * 1.99);
    assert.ok(report.startup.width <= report.zoomBefore.width * 0.51);
  }
  await screenshot('startup');
  await page.waitForFunction(() => document.getElementById('ns-app').dataset.nsPhase === 'playing');
  report.readyMs = Math.round(performance.now() - start);
  const initial = await inspect();
  assert.ok(initial.running);
  assert.equal(initial.focus, 'ns-canvas');
  if (process.env.NS_ANGLE === 'vulkan') assert.match(initial.renderer, /Vulkan/);
  assert.equal(await page.locator('#ns-canvas').getAttribute('aria-describedby'), 'ns-game-keys');
  assert.match(await page.locator('#ns-game-keys').textContent(), /Escape for controls and settings/);

  await page.keyboard.press('e');
  await page.waitForFunction(() => {
    const pose = window.__nsQA.inspect().camera.pose;
    return pose.thirdPerson && !pose.moving;
  });
  assert.match((await inspect()).focusOutline, /solid 2px/);
  await page.keyboard.press('4');
  await page.getByRole('group', { name: /Which limb the keys move/ })
    .locator('[aria-current="true"]').filter({ hasText: 'Right arm' }).waitFor();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(n => window.__nsQA.inspect().areaStep?.seq > n, initial.step);
  report.before = await inspect();
  assert.ok(report.before.region);
  assert.equal(report.before.camera, 'third');
  assert.equal(report.before.locked, null);
  await screenshot('playing-before-pause');

  await page.keyboard.press('Escape');
  const shell = page.getByRole('dialog', { name: 'NeuroSurge' });
  const card = page.locator('.ns-shell-card');
  const resume = shell.getByRole('button', { name: 'Resume (Esc)' });
  await shell.waitFor();
  assert.ok(await resume.evaluate(node => document.activeElement === node));
  assert.match((await inspect()).focusOutline, /solid 3px/);
  const starter = page.locator('.ns-ctl');
  if (await starter.count()) assert.equal(await starter.evaluate(el => getComputedStyle(el).visibility), 'hidden');
  const menu = shell.locator('.ns-menu');
  assert.match(await menu.locator('.ns-menu-look').innerText(), /← →\s+aim at the next motor area/);
  assert.match(await menu.locator('.ns-menu-hold').innerText(), /Space\s+hold to grasp, tap to toggle/);
  assert.match(await menu.locator('.ns-menu-view').innerText(), /E\s+switch eye and outside views/);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.ns-shell')).opacity === '1');
  await screenshot('pause');
  await page.keyboard.press('PageDown');
  if (await card.evaluate(node => node.scrollHeight > node.clientHeight)) {
    await page.waitForFunction(() => document.querySelector('.ns-shell-card').scrollTop > 0);
  }

  const speed = shell.getByRole('slider', { name: 'Look speed' });
  const flip = shell.getByRole('checkbox', { name: 'Flip up and down (invert Y)' });
  const quality = shell.getByRole('combobox', { name: 'Picture quality' });
  const muscles = shell.getByRole('combobox', { name: 'Lifted outer muscles (Body Worlds style)' });
  await tabTo(speed);
  await page.keyboard.press('ArrowRight');
  assert.ok((await inspect()).settings.lookSensitivity > initial.settings.lookSensitivity);
  await tabTo(flip);
  await tabTo(quality);
  await tabTo(muscles);
  report.settingsFocus = await muscles.evaluate(node => {
    const field = node.closest('label');
    const scroller = node.closest('[role="dialog"]');
    const { left, right, width, top, bottom } = node.getBoundingClientRect();
    const clip = scroller.getBoundingClientRect();
    return { width, label: field.innerText, labelWidth: field.clientWidth, labelScrollWidth: field.scrollWidth,
      focusOutline: getComputedStyle(node).outline, inView: left >= clip.left && right <= clip.right && top >= clip.top && bottom <= clip.bottom };
  });
  assert.ok(report.settingsFocus.width >= 100 && report.settingsFocus.inView);
  assert.equal(report.settingsFocus.labelScrollWidth, report.settingsFocus.labelWidth);
  assert.match(report.settingsFocus.focusOutline, /solid 3px/);
  await screenshot('settings');

  const details = shell.getByRole('button', { name: 'Show the full instructions' });
  await tabTo(details);
  await page.keyboard.press('Space');
  assert.equal(await shell.getByRole('button', { name: 'Show the short instructions' }).getAttribute('aria-expanded'), 'true');
  assert.equal((await inspect()).shell, 'paused');
  await tabTo(resume);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__nsQA.inspect().shell.mode === 'playing');
  await advance((await inspect()).frames);
  report.after = await inspect();
  assert.equal(report.after.locked, null, 'keyboard Resume must leave an already free pointer free');
  assert.equal(report.after.focus, 'ns-canvas');
  assert.equal(report.after.camera, report.before.camera);
  assert.deepEqual(report.after.look, report.before.look);
  assert.equal(report.after.step, report.before.step);
  // The transient target can be sampled again after a pause. It must not fire a new action.
  assert.deepEqual(report.after.trigger, report.before.trigger);
  assert.equal(report.after.limb, report.before.limb);
  assert.equal(report.after.pressed.Space, false);
  await screenshot('playing-after-resume');

  // A second keyboard activation also resumes without carrying the menu's Space into play.
  await page.keyboard.press('Escape');
  await resume.waitFor();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__nsQA.inspect().shell.mode === 'playing');
  await advance((await inspect()).frames);
  const spaceResume = await inspect();
  assert.equal(spaceResume.locked, null);
  assert.equal(spaceResume.carry, null);
  assert.equal(spaceResume.pressed.Space, false);

  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(n => window.__nsQA.inspect().areaStep?.seq > n, report.before.step);
  report.freshAim = await inspect();
  assert.ok(report.freshAim.stepTo);
  assert.equal(report.freshAim.region, report.freshAim.stepTo);
  assert.notEqual(report.freshAim.region, report.before.region);
  await page.keyboard.press('Escape');
  await resume.waitFor();
  await resume.click();
  await page.waitForFunction(() => document.pointerLockElement?.id === 'ns-canvas');
  report.clickResume = await inspect();
  assert.equal(report.clickResume.camera, report.before.camera);
  assert.equal(report.clickResume.step, report.freshAim.step);

  if (raw) {
    assert.ok(report.assets.indexesRefused > 0 && report.assets.rawMeshes > 0);
    assert.equal(report.assets.packs, 0);
  } else {
    assert.ok(report.assets.packs > 0);
    assert.equal(report.assets.rawMeshes, 0);
  }
  assert.deepEqual(report.errors, []);
} finally {
  console.log(JSON.stringify(report, null, 2));
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
