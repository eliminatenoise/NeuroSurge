// Run with Node and Playwright. Use NS_PLAYWRIGHT_MODULE and NS_CHROMIUM for an existing local installation.
// Uses an owned loopback server and the regular game URL. On Linux, NS_ANGLE=vulkan selects an installed Vulkan driver.
// NS_RAW=1 refuses the pack index, then verifies recovery through the OBJ route.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHandler, HOST } from '../serve-local.mjs';

const { chromium } = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const asset = '/inputs/FULLBODY-MESH-MANIFEST.json';
const raw = process.env.NS_RAW === '1';
const allowedHosts = new Set();
const serve = createHandler({ root, allowedHosts });
let rejectAsset = true;
let failedRequests = 0;
const server = createServer((req, res) => {
  if (rejectAsset && allowedHosts.has(req.headers.host) && req.method === 'GET' && req.url === asset) {
    failedRequests++;
    res.writeHead(404, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain' }).end('Not found');
  } else {
    void serve(req, res);
  }
});
server.listen(0, HOST);
await once(server, 'listening');
const host = `${HOST}:${server.address().port}`;
allowedHosts.add(host);
const url = `http://${host}/`;
const timeout = 60_000;
const angle = process.env.NS_ANGLE;
let browser;
try {
  const args = ['--disable-background-networking'];
  if (angle) args.push(`--use-angle=${angle}`);
  if (angle === 'swiftshader') args.push('--enable-unsafe-swiftshader');
  browser = await chromium.launch({
    executablePath: process.env.NS_CHROMIUM || undefined,
    args,
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, reducedMotion: 'no-preference' });
  page.setDefaultTimeout(timeout);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  let refusedPackIndexes = 0;
  if (raw) await page.route('**/packs/PACK-INDEX.json', route => {
    refusedPackIndexes++;
    return route.abort();
  });
  const recoveryAssets = { meshPacks: 0, rawMeshes: 0 };
  page.on('response', response => {
    if (rejectAsset || !response.ok()) return;
    const file = new URL(response.url()).pathname;
    if (file.endsWith('.nspack')) recoveryAssets.meshPacks++;
    if (file.endsWith('.obj')) recoveryAssets.rawMeshes++;
  });
  const inspect = () => page.evaluate(async () => {
    const app = window.__nsQA;
    const ready = await app.ready;
    const firstView = await app.firstView;
    const s = app.inspect();
    const gl = document.querySelector('#ns-canvas').getContext('webgl2');
    const debugRenderer = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      phase: document.querySelector('#ns-app').dataset.nsPhase,
      ready, firstView, runtime: s.phase, shell: s.shell.mode, frames: s.frames,
      bodyRig: s.features.bodyRig, placeholder: s.placeholder, qa: s.qa,
      renderer: debugRenderer ? gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL) : null,
    };
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForURL('**/scene/example/preview.html');
  const alert = page.getByRole('alert').filter({ hasText: 'Loading did not finish.' });
  const retry = alert.getByRole('button', { name: 'Try again', exact: true });
  await retry.waitFor();
  const failure = await inspect();
  console.log(JSON.stringify({ chromium: browser.version(), failure, failedRequests }));
  assert.equal(failedRequests, 1);
  assert.equal(failure.phase, 'error');
  assert.equal(failure.runtime, 'error');
  assert.equal(failure.shell, 'error');
  assert.equal(failure.ready.ok, false);
  assert.equal(failure.firstView.ok, false);
  assert.equal(failure.frames, 0);
  assert.equal(failure.bodyRig, false);
  assert.equal(failure.placeholder, false);
  assert.equal(failure.qa, false);
  assert.match(await alert.innerText(), /HTTP 404 for .*FULLBODY-MESH-MANIFEST\.json/);
  assert.equal(await page.locator('.ns-assembly, .ns-keys').count(), 0);
  assert.deepEqual(await alert.getByRole('button').allTextContents(), ['Try again']);
  assert.equal(await page.getByRole('button', { name: 'Reload page', exact: true }).isVisible(), false);
  assert.equal(await page.locator('.ns-shell .ns-kbd').isVisible(), false);
  assert.equal(await page.locator('.ns-shell .ns-shell-grid').isVisible(), false);
  assert.equal(await retry.evaluate(button => document.activeElement === button), true);
  await page.keyboard.press('Escape');
  assert.equal((await inspect()).shell, 'error');
  assert.equal(await retry.evaluate(button => document.activeElement === button), true);

  // Restore the required asset and let Enter activate the focused recovery button.
  const refusedBeforeRetry = refusedPackIndexes;
  rejectAsset = false;
  const [navigation, restored] = await Promise.all([
    page.waitForEvent('framenavigated', { predicate: frame => frame === page.mainFrame() }),
    page.waitForResponse(response => response.url() === new URL(asset, url).href && response.ok()),
    page.keyboard.press('Enter'),
  ]);
  assert.equal(new URL(navigation.url()).pathname, '/scene/example/preview.html');
  assert.equal(restored.status(), 200);
  await page.waitForFunction(() => ['playing', 'error'].includes(document.querySelector('#ns-app').dataset.nsPhase));
  const recovered = await inspect();
  console.log(JSON.stringify({ recovered, restoredStatus: restored.status(), refusedPackIndexes, recoveryAssets, errors }));
  assert.equal(recovered.phase, 'playing');
  assert.equal(recovered.runtime, 'running');
  assert.equal(recovered.shell, 'playing');
  assert.equal(recovered.ready.ok, true);
  assert.equal(recovered.firstView.ok, true);
  assert.ok(recovered.frames > 0);
  assert.equal(recovered.bodyRig, true);
  assert.equal(recovered.placeholder, false);
  assert.equal(recovered.qa, false);
  assert.equal(await alert.count(), 0);
  assert.equal(failedRequests, 1);
  if (raw) {
    assert.ok(refusedBeforeRetry > 0 && refusedPackIndexes > refusedBeforeRetry);
    assert.equal(recoveryAssets.meshPacks, 0);
    assert.ok(recoveryAssets.rawMeshes > 0);
  } else {
    assert.ok(recoveryAssets.meshPacks > 0);
    assert.equal(recoveryAssets.rawMeshes, 0);
  }
  assert.deepEqual(errors, []);
} finally {
  if (browser) await browser.close();
  server.close();
  await once(server, 'close');
}
