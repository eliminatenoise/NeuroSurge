// Exercise the normal preview with Chromium touch emulation and trusted input.
import assert from 'node:assert/strict';
import { once } from 'node:events';
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
const args = ['--disable-background-networking'];
if (process.env.NS_ANGLE) args.push(`--use-angle=${process.env.NS_ANGLE}`);
const portrait = { width: 390, height: 844 };
const landscape = { width: 844, height: 390 };
const raw = process.env.NS_RAW === '1';
const errors = [];
const assets = { packed: 0, raw: 0, requestsRefused: 0 };

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  const page = await browser.newPage({ viewport: portrait, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  page.setDefaultTimeout(60_000);
  const limbs = page.getByRole('group', { name: 'Which limb the keys move' });
  const buttons = limbs.getByRole('button');
  const limb = name => limbs.getByRole('button', { name, exact: true });
  const names = ['Left arm', 'Left leg', 'Right leg', 'Right arm'];
  const screenshot = async name => {
    if (process.env.NS_SCREENSHOTS) await page.screenshot({ path: join(process.env.NS_SCREENSHOTS, `limbs-${name}.png`), animations: 'disabled' });
  };
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (!response.ok()) return;
    const file = new URL(response.url()).pathname;
    if (file.endsWith('.nspack')) assets.packed++;
    if (file.endsWith('.obj')) assets.raw++;
  });
  if (raw) await page.route('**/packs/PACK-INDEX.json', route => {
    assets.requestsRefused++;
    return route.abort();
  });
  const read = () => page.evaluate(() => {
    const s = window.__nsQA.inspect();
    return {
      healthy: s.phase === 'running' && s.features.bodyRig && !s.qa && !s.placeholder,
      shell: s.shell.mode,
      look: [s.camera.pose.yaw, s.camera.pose.pitch],
      focus: document.activeElement.id || document.activeElement.getAttribute('aria-label'),
      locked: document.pointerLockElement?.id ?? null,
      space: Boolean(s.controls.keys.Space),
      coarse: matchMedia('(pointer: coarse)').matches,
    };
  });
  const waitShell = mode => page.waitForFunction(mode => window.__nsQA?.inspect().shell.mode === mode, mode);
  const waitChoice = name => page.waitForFunction(name => {
    return document.querySelector('.ns-limbs [aria-current="true"]')?.getAttribute('aria-label') === name;
  }, name);
  async function layout(viewport) {
    assert.equal(await buttons.count(), 4);
    for (const name of names) {
      const control = limb(name);
      assert.ok(await control.locator('.ns-limbs-name').isVisible(), `${name} is printed on its button`);
      const b = await control.boundingBox();
      assert.ok(b && b.width >= 44 && b.height >= 44, `${name} has a touch target`);
      assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= viewport.width && b.y + b.height <= viewport.height);
      const top = await control.evaluate(el => {
        const b = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2));
      });
      assert.equal(top, true, `${name} receives its tap`);
    }
  }

  const start = performance.now();
  await page.goto(`http://${host}/`, { waitUntil: 'domcontentloaded' });
  await waitShell('playing');
  const startToPlayingMs = Math.round(performance.now() - start);
  const startupOverlap = await limbs.evaluate(el => {
    const top = el.getBoundingClientRect().top;
    return Array.from(document.querySelectorAll('.ns-keys .ns-ctl-chunk'))
      .some(chunk => chunk.getBoundingClientRect().bottom > top);
  });
  assert.equal(startupOverlap, false, 'startup instructions leave the limb buttons clear');
  await layout(portrait);
  await waitChoice('Left arm');
  const initial = await read();
  assert.equal(initial.healthy && initial.coarse, true);
  assert.equal(initial.locked, null);

  await limb('Right arm').tap();
  await waitChoice('Right arm');
  await page.waitForFunction(([yaw, pitch]) => {
    const camera = window.__nsQA.inspect().camera.pose;
    return Math.abs(camera.yaw - yaw) > 0.15 && Math.abs(camera.pitch - pitch) > 0.14;
  }, initial.look);
  const touched = await read();
  assert.equal(touched.locked, null, 'the limb tap does not go through to pointer lock');
  assert.equal(touched.focus, 'ns-canvas');
  await screenshot('portrait');

  await page.keyboard.press('Escape');
  await waitShell('paused');
  assert.equal(await page.locator('.ns-limbs').evaluate(el => el.inert), true);
  await page.setViewportSize(landscape);
  await page.getByRole('button', { name: /^Reset body$/i }).tap();
  await page.keyboard.press('Escape');
  await waitShell('playing');
  await waitChoice('Left arm');
  await layout(landscape);
  await limb('Right leg').tap();
  await waitChoice('Right leg');
  await limb('Left leg').tap();
  await waitChoice('Left leg');
  await screenshot('landscape');

  // Verify the buttons are reachable by Tab and Space activates the focused button.
  for (let tab = 0; tab < 8 && (await read()).focus !== 'Left arm'; tab++) {
    await page.keyboard.press('Tab');
  }
  assert.equal((await read()).focus, 'Left arm');
  await page.keyboard.press('Space');
  await waitChoice('Left arm');
  const afterSpace = await read();
  assert.equal(afterSpace.focus, 'Left arm');
  assert.equal(afterSpace.space, false, 'the button did not send Space to the game');
  await page.keyboard.press('Tab');
  assert.equal((await read()).focus, 'Left leg');
  await page.keyboard.press('Enter');
  await waitChoice('Left leg');
  assert.equal((await read()).healthy, true);

  if (raw) {
    assert.ok(assets.requestsRefused > 0 && assets.raw > 0);
    assert.equal(assets.packed, 0);
  } else {
    assert.ok(assets.packed > 0);
    assert.equal(assets.raw, 0);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ chromium: browser.version(), raw, assets, startToPlayingMs, portrait, initial, touched, landscape, afterSpace, errors }, null, 2));
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
