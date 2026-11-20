// Run on the unmodified loopback server and against the original offline download.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHandler, HOST} from '../serve-local.mjs';

const {chromium} = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = new URL('../', import.meta.url);
const assets = new URL('scene/src/activity/shared-motion/', root);
const sha = data => createHash('sha256').update(data).digest('hex');
const original = await readFile(new URL('index.html', assets));
const model = '9a3649cb8f2119984e7f9f0b96a07bdc95e1833c7068f0e9caef2680f22e3179';
// Sealed Python checkpoint and two train-fitted controls, shared-motion-view/oracle.json.
const expected = {
  rat: {joint:5.321433981169306, recent:6.83246026675585, ridge:5.564297659343093},
  wrist: {joint:0.5241024170144033, recent:0.5926929714682094, ridge:0.8067951957026576}
};

async function compare(view) {
  const data = {};
  for (const [domain, refs] of Object.entries(expected)) {
    await view.locator('#history-select').selectOption(domain);
    const values = {};
    for (const [id, reference] of Object.entries(refs)) {
      const raw = await view.locator('#' + id).getAttribute('data-cm');
      assert.notEqual(raw, null);
      values[id] = Number(raw);
      assert.ok(Math.abs(values[id] - reference) < 1e-10);
    }
    assert.match(await view.locator('#source-line').innerText(), domain === 'rat' ? /recorded|camera/i : /invented/i);
    assert.equal(await view.locator('#outcome').isVisible(), domain === 'rat');
    if (domain === 'rat') {
      await view.locator('#outcome summary').click();
      assert.match(await view.locator('#measured').innerText(), /2\.940 cm.*0\.2403 s/);
    }
    data[domain] = values;
  }
  assert.match(await view.locator('.study').innerText(), /neither domain passed the transfer test/i);
  return data;
}

const allowedHosts = new Set();
const server = createServer(createHandler({root:fileURLToPath(root), allowedHosts})).listen(0, HOST);
await once(server, 'listening');
const host = HOST + ':' + server.address().port;
const origin = 'http://' + host;
allowedHosts.add(host);
let browser;
try {
  const args = ['--disable-background-networking'];
  if (process.env.NS_ANGLE) args.push('--use-angle=' + process.env.NS_ANGLE);
  browser = await chromium.launch({executablePath:process.env.NS_CHROMIUM, args});
  const context = await browser.newContext({viewport:{width:1280, height:900}});
  const policyViolations = [], mediaCalls = [], errors = [], requests = [];
  await context.exposeBinding('reportCsp', (_source, value) => policyViolations.push(value));
  await context.exposeBinding('reportMedia', (_source, value) => mediaCalls.push(value));
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', e => window.reportCsp([e.effectiveDirective, e.blockedURI]));
    for (const method of ['getUserMedia', 'getDisplayMedia', 'enumerateDevices']) {
      if (navigator.mediaDevices?.[method]) Object.defineProperty(navigator.mediaDevices, method, {value() {
        window.reportMedia(method);
        return Promise.reject(Error('Device call in model viewer'));
      }});
    }
  });
  const game = await context.newPage();
  game.on('request', r => requests.push({url:r.url(), type:r.resourceType()}));
  game.on('pageerror', e => errors.push(String(e)));
  await game.goto(origin + '/');
  await game.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
    document.querySelector('#ns-app')?.dataset.nsPhase === 'playing', null, {timeout:120000});
  const gameUrl = game.url();
  const headers = (await game.request.head(gameUrl)).headers();
  assert.match(headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(headers['x-frame-options'], 'DENY');
  assert.match(await game.locator('meta[http-equiv=Content-Security-Policy]').getAttribute('content'), /script-src 'self';/);
  await game.locator('#ns-canvas').focus();
  await game.keyboard.press('m');
  const dialog = game.getByRole('dialog', {name:'Activity map'});
  const tab = dialog.getByRole('button', {name:'Shared model', exact:true});
  await dialog.locator('[data-replay]').waitFor();
  assert.equal(requests.some(r => r.url.includes('/shared-motion')), false);
  const before = requests.length;
  // Alter the local script body once. Browser subresource integrity must refuse it,
  // then the on-screen retry must read the intact game asset and recover in place.
  await game.route('**/shared-motion/shared-motion.js', route => route.fulfill({
    contentType:'text/javascript', body:'globalThis.unexpectedModelScriptRan = true;'
  }), {times:1});
  await tab.click();
  const frame = game.frameLocator('#ns-act-shared iframe');
  await frame.locator('#retry').waitFor();
  assert.equal(await frame.locator('#results').isVisible(), false);
  assert.equal(await frame.locator('#history-select').isDisabled(), true);
  assert.equal(await frame.locator('html').evaluate(el => el.ownerDocument.defaultView.unexpectedModelScriptRan), undefined);
  await frame.locator('#retry').click();
  await frame.locator('#results').waitFor();
  await frame.locator('.skip').focus();
  await game.keyboard.press('Enter');
  assert.ok(await frame.locator('#history-select').evaluate(el => el.ownerDocument.activeElement === el));
  const compareGame = await compare(frame);
  const frameWindow = game.frames().find(f => f.url() === 'about:srcdoc');
  assert.equal(await frameWindow.evaluate(async () => (await window.SharedMotion.loadSharedMotion()).checkpointSha256), model);
  const state = () => game.evaluate(() => {
    const s = window.__nsQA.inspect();
    return {mode:s.shell.mode, joints:s.bodyDrawnJoints, camera:s.camera.pose};
  });
  const paused = await state();
  assert.equal(paused.mode, 'paused');
  await frame.locator('#history-select').selectOption('custom-wrist');
  await frame.locator('#rows').fill('wascf1234');
  await frame.locator('#rows').focus();
  await game.keyboard.type('wasdcmf');
  await frame.locator('#run').click();
  assert.match(await frame.locator('#status').innerText(), /full second|columns/);
  assert.equal(await frame.locator('#results').isVisible(), false);
  assert.equal(await frame.locator('#joint').getAttribute('data-cm'), null);
  assert.deepEqual(await state(), paused);

  for (const width of [1280, 390, 320]) {
    await game.setViewportSize({width, height:820});
    assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), 'Outer width ' + width);
    assert.ok(await frameWindow.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Viewer width ' + width);
  }
  const downloadStarted = game.waitForEvent('download');
  await frame.getByRole('link', {name:'Save offline copy'}).click();
  const download = await downloadStarted;
  assert.equal(sha(await readFile(await download.path())), sha(original));
  await frame.locator('#rows').focus();
  await game.keyboard.press('Escape');
  await dialog.waitFor({state:'hidden'});
  assert.equal((await state()).mode, 'playing');
  assert.equal(await game.evaluate(() => document.activeElement.id), 'ns-canvas');
  await game.keyboard.press('m');
  await tab.click();
  assert.match(await frame.locator('#rows').inputValue(), /wasdcmf/);
  await frame.locator('#rows').focus();
  await game.keyboard.press('Alt+ArrowLeft');
  await dialog.waitFor({state:'hidden'});
  assert.equal(game.url(), gameUrl);
  assert.equal(await game.evaluate(() => document.activeElement.id), 'ns-canvas');
  await game.keyboard.press('m');
  await tab.click();
  await frame.locator('#rows').focus();
  await dialog.getByRole('button', {name:'Back to game'}).click();
  assert.equal((await state()).mode, 'playing');
  assert.equal(await game.evaluate(() => document.activeElement.id), 'ns-canvas');
  const panelRequests = requests.slice(before).filter(r => r.url.includes('/shared-motion'));
  assert.ok(panelRequests.every(r => ['script', 'document'].includes(r.type)), JSON.stringify(panelRequests));
  assert.ok(requests.every(r => r.url.startsWith(origin + '/') || r.url.startsWith('data:')));

  const offline = await context.newPage();
  const fileRequests = [];
  offline.on('pageerror', e => errors.push(String(e)));
  offline.on('request', r => fileRequests.push(r.url()));
  await context.setOffline(true);
  await offline.goto(new URL('index.html', assets).href);
  await offline.locator('#results').waitFor();
  const compareFile = await compare(offline);
  assert.deepEqual(compareFile, compareGame);
  assert.ok(fileRequests.every(url => url.startsWith('file:') || url.startsWith('data:')));
  assert.deepEqual(policyViolations, []);
  assert.deepEqual(mediaCalls, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({gameUrl, browser:browser.version(), viewerSha256:sha(original),
    checkpointSha256:model, game:compareGame, offline:compareFile, widths:[1280,390,320],
    preTabLoads:0, modelAssetRequests:panelRequests.map(r => r.url.split('/').pop()),
    cspViolations:policyViolations, deviceCalls:mediaCalls, externalRequests:0,
    rejectedMalformedInput:true, rejectedCorruptScriptAndRecovered:true, focusAndPauseRestored:true}));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
