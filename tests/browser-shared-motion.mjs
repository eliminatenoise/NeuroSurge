// Run on the unmodified loopback server and against the original offline download.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHandler, HOST} from '../serve-local.mjs';

const {chromium} = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = new URL('../', import.meta.url);
const assets = new URL('scene/src/activity/shared-motion/', root);
const sha = data => createHash('sha256').update(data).digest('hex');
const original = await readFile(new URL('index.html', assets));
const spatialModel = '9a3649cb8f2119984e7f9f0b96a07bdc95e1833c7068f0e9caef2680f22e3179';
const movementModel = 'da243393b7a6f72558365a30f7361e45ef7af680538a7fb5a927e930d91b3458';
// Sealed Python checkpoint and two train-fitted controls, shared-motion-view/oracle.json.
const expected = {
  rat: {joint:5.321433981169306, recent:6.83246026675585, ridge:5.564297659343093},
  wrist: {joint:0.5241024170144033, recent:0.5926929714682094, ridge:0.8067951957026576}
};
// CPU reference from the same public invented angular history at c60c12e.
const angleReferences = {
  motion:[12.783076614924848, -3.8545529665826432],
  emg:[8.426623456138092, -1.1867418591785994],
  full:[7.4641121080537545, 0.09766020148509469]
};
// Frozen predict.py at c8dfb5e, on each public invented history using
// forecast_angles(..., mode, forearm_residual=mode) and the matching channel width.
const corrected = {
  invented: {motion:[15.55631119514808, -4.257036405152111], emg:[13.764528909470156, -4.0945854467517755]},
  forearm: {motion:[19.418809157745024, -2.1684628140631355], emg:[18.969935360733352, -2.0580431854206322]}
};

async function angleValues(view, modes, table='angle-values', references=angleReferences) {
  await view.locator('#angular-results').waitFor();
  const values = {};
  const rows = view.locator('#' + table + ' tbody tr');
  assert.equal(await rows.count(), modes.length);
  for (const [i,mode] of modes.entries()) {
    const row = rows.nth(i);
    assert.equal(await row.getAttribute('data-mode'), mode);
    const angles = await row.locator('td[data-deg]').evaluateAll(cells => cells.map(c => Number(c.dataset.deg)));
    assert.equal(angles.length, 2);
    angles.forEach((angle, axis) => assert.ok(Math.abs(angle - references[mode][axis]) < 1e-10, table + ' ' + mode));
    values[mode] = angles;
  }
  return values;
}

async function checkTableText(view) {
  const problems = await view.locator('.angle-table th,.angle-table td').evaluateAll(cells => {
    const errors = [];
    for (const cell of cells) {
      const bounds = cell.getBoundingClientRect();
      const text = cell.firstChild;
      for (const match of text.textContent.matchAll(/\S+/g)) {
        const range = cell.ownerDocument.createRange();
        range.setStart(text, match.index);
        range.setEnd(text, match.index + match[0].length);
        const rectangles = [...range.getClientRects()];
        if (rectangles.length !== 1 || rectangles[0].left < bounds.left - 0.5 || rectangles[0].right > bounds.right + 0.5)
          errors.push({table:cell.closest('table').id, word:match[0], frame:cell.ownerDocument.defaultView.innerWidth});
      }
    }
    return errors;
  });
  assert.deepEqual(problems, []);
}

async function compare(view) {
  const data = {};
  for (const [domain, refs] of Object.entries(expected)) {
    await view.locator('#history-select').selectOption(domain);
    await view.locator('#results').waitFor();
    assert.equal(await view.locator('#source-select').inputValue(), 'invented');
    if (domain === 'rat') {
      assert.ok(Math.abs(Number(await view.locator('#joint').getAttribute('data-cm')) - 1.0101500688820513) < 1e-10);
      assert.equal(await view.locator('#outcome').isVisible(), false);
      await view.locator('#source-select').selectOption('recorded');
      await view.locator('#outcome').waitFor();
    }
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
  assert.match(await view.locator('#distance-study').innerText(), /neither domain passed the transfer test/i);
  await view.locator('#history-select').selectOption('wrist_angle');
  data.angle = await angleValues(view, Object.keys(angleReferences));
  data.corrected = await angleValues(view, ['motion','emg'], 'correction-values', corrected.invented);
  assert.match(await view.locator('#status').innerText(), /invented/);
  assert.match(await view.locator('#angle-values thead').innerText(), /Extension \(°\).*Radial deviation \(°\)/s);
  assert.match(await view.locator('#angle-values tbody').innerText(), /Movement \+ forearm EMG \+ scalp EEG/);
  assert.match(await view.locator('#angle-bench').innerText(), /3\.549/);
  assert.equal(await view.locator('#results').isVisible(), false);
  await view.locator('#source-select').selectOption('forearm');
  data.forearmExample = await angleValues(view, ['motion','emg'], 'correction-values', corrected.forearm);
  assert.equal(await view.locator('#angle-values tbody tr').count(), 2);
  assert.match(await view.locator('#source-line').innerText(), /invented/i);
  return data;
}

async function checkCustomAngles(view, keyboard) {
  await view.locator('#source-select').selectOption('custom');
  const input = view.locator('#angle-input'), run = view.locator('#angle-run');
  await view.getByText('Input units, channels and clock', {exact:true}).click();
  assert.match(await view.locator('#angle-schema').innerText(), /µV.*M1, M2, M3 or M4.*C3, C1, Cz, C2, C4, CP3, CPz, CP4/);
  await view.locator('#angle-fill').focus();
  await keyboard.press('Space');
  const sample = JSON.parse(await input.inputValue());
  for (const [mode,width] of [['motion',2], ['emg',6], ['full',14]]) {
    await input.fill(JSON.stringify({...sample, mode, bins:sample.bins.map(b => b.slice(0,width))}));
    await run.focus();
    await keyboard.press('Enter');
    const modes = Object.keys(angleReferences);
    await angleValues(view, modes.slice(0, modes.indexOf(mode) + 1));
    const corrections = mode === 'motion' ? ['motion'] : ['motion','emg'];
    await angleValues(view, corrections, 'correction-values', corrected.invented);
  }
  for (const [label,edit] of [
    ['future bin', r => r.binEndTicks[15]++],
    ['future target', r => {r.targetDeg = [0,0];}],
    ['missing bin', r => r.bins.pop()],
    ['missing channel', r => r.bins[0].pop()],
    ['missing anchor', r => {delete r.anchorDeg;}],
    ['duplicate correction selectors', r => {r.forearmResidual = null; r.forearm_residual = null;}],
    ['correction for incompatible channels', r => {r.forearmResidual = 'emg';}],
    ['non-numeric forearm voltage', r => {r.bins[0][2] = '3';}]
  ]) {
    const bad = structuredClone(sample);
    edit(bad);
    await input.fill(JSON.stringify(bad));
    await run.click();
    assert.equal(await view.locator('#angular-results').isVisible(), false, label);
    assert.equal(await view.locator('#angle-values [data-deg]').count(), 0, label);
    assert.equal(await view.locator('#correction-values [data-deg]').count(), 0, label);
    const message = await view.locator('#status').innerText();
    assert.ok(message.length > 10, label);
    if (label === 'non-numeric forearm voltage') {
      // The form must display the same type error returned by its loaded scorer.
      const error = await input.evaluate(async el => {
        try {
          await el.ownerDocument.defaultView.SharedMotion.forecastMovement(JSON.parse(el.value));
        } catch (e) {
          return {name:e.name, message:e.message};
        }
      });
      assert.deepEqual(error, {name:'TypeError', message});
      assert.match(message, /finite channels/);
    }
  }
  await input.fill(JSON.stringify(sample));
  await run.click();
  await angleValues(view, Object.keys(angleReferences));
  await angleValues(view, ['motion','emg'], 'correction-values', corrected.invented);
}

const allowedHosts = new Set();
const server = createServer(createHandler({root:fileURLToPath(root), allowedHosts})).listen(0, HOST);
await once(server, 'listening');
const host = HOST + ':' + server.address().port;
const origin = 'http://' + host;
allowedHosts.add(host);
const downloadDir = await mkdtemp(join(tmpdir(),'neurosurge-shared-'));
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
    for (const [api, methods] of [
      [navigator.mediaDevices, ['getUserMedia','getDisplayMedia','enumerateDevices']],
      [navigator.geolocation, ['getCurrentPosition','watchPosition']],
      [navigator.bluetooth, ['getDevices','requestDevice']],
      [navigator.hid, ['getDevices','requestDevice']], [navigator.usb, ['getDevices','requestDevice']],
      [navigator.serial, ['getPorts','requestPort']]
    ]) {
      for (const method of methods) {
        if (api?.[method]) Object.defineProperty(api, method, {value() {
          window.reportMedia(method);
          throw Error('Device call in model viewer');
        }});
      }
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
  // The upstream panel cannot render its own recovery button if its script is missing.
  await game.route('**/shared-motion/panel.js', route => route.abort(), {times:1});
  await frame.locator('#retry').click();
  await frame.getByRole('status').filter({hasText:'could not load its local scripts'}).waitFor();
  await frame.locator('#retry').click();
  await frame.locator('#results').waitFor();
  assert.equal(await frame.locator('#retry').isVisible(), false);
  await frame.locator('.skip').focus();
  await game.keyboard.press('Enter');
  assert.ok(await frame.locator('#history-select').evaluate(el => el.ownerDocument.activeElement === el));
  const compareGame = await compare(frame);
  const frameWindow = game.frames().find(f => f.url() === 'about:srcdoc');
  assert.deepEqual(await frameWindow.evaluate(async () => {
    const model = await window.SharedMotion.loadSharedMotion();
    return [model.checkpointSha256, model.movementCheckpointSha256];
  }), [spatialModel,movementModel]);
  const state = () => game.evaluate(() => {
    const s = window.__nsQA.inspect();
    return {mode:s.shell.mode, joints:s.bodyDrawnJoints, camera:s.camera.pose};
  });
  const paused = await state();
  assert.equal(paused.mode, 'paused');
  await frame.locator('#source-select').selectOption('invented');
  await frame.locator('#angular-results').waitFor();
  for (const width of [1280, 390, 375, 320]) {
    await game.setViewportSize({width, height:820});
    assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), 'Outer width ' + width);
    assert.ok(await frameWindow.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Angle table width ' + width);
    await checkTableText(frame);
  }
  // This is the pane width before the outer game's compact margins were reduced.
  // Keep the actual embedded tables readable when a nested pane has only 251px.
  const iframe = game.locator('#ns-act-shared iframe');
  await iframe.evaluate(el => { el.style.boxSizing = 'content-box'; el.style.width = '251px'; });
  assert.equal(await frameWindow.evaluate(() => innerWidth), 251);
  await checkTableText(frame);
  await iframe.evaluate(el => { el.style.removeProperty('width'); el.style.removeProperty('box-sizing'); });
  await frame.locator('#source-select').focus();
  await game.keyboard.press('Home');
  await game.keyboard.press('ArrowDown');
  assert.equal(await frame.locator('#source-select').inputValue(), 'forearm');
  await angleValues(frame, ['motion','emg'], 'correction-values', corrected.forearm);
  await checkCustomAngles(frame, game.keyboard);
  assert.ok(await frameWindow.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Custom angle panel at 320px');
  await frame.locator('#history-select').selectOption('wrist');
  await frame.locator('#source-select').selectOption('custom');
  await frame.locator('#rows').fill('wascf1234');
  await frame.locator('#rows').focus();
  await game.keyboard.type('wasdcmf');
  await frame.locator('#run').click();
  assert.match(await frame.locator('#status').innerText(), /full second|columns/);
  assert.equal(await frame.locator('#results').isVisible(), false);
  assert.equal(await frame.locator('#joint').getAttribute('data-cm'), null);
  assert.deepEqual(await state(), paused);

  const downloadStarted = game.waitForEvent('download');
  await frame.getByRole('link', {name:'Save offline copy'}).click();
  const download = await downloadStarted;
  const savedViewer = join(downloadDir,'Wrist and rat forecasts.html');
  await download.saveAs(savedViewer);
  assert.equal(sha(await readFile(savedViewer)), sha(original));
  await frame.locator('#rows').focus();
  await game.keyboard.press('Escape');
  await dialog.waitFor({state:'hidden'});
  assert.equal((await state()).mode, 'playing');
  assert.equal(await game.evaluate(() => document.activeElement.id), 'ns-canvas');
  for (const thirdPerson of [true, false]) {
    await game.keyboard.press('e');
    await game.waitForFunction(wanted => {
      const pose = window.__nsQA.inspect().camera.pose;
      return pose.thirdPerson === wanted && !pose.moving;
    }, thirdPerson);
  }
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
  await offline.setViewportSize({width:320,height:820});
  const fileRequests = [];
  offline.on('pageerror', e => errors.push(String(e)));
  offline.on('request', r => fileRequests.push(r.url()));
  await context.setOffline(true);
  await offline.goto(pathToFileURL(savedViewer).href);
  await offline.locator('#results').waitFor();
  const compareFile = await compare(offline);
  assert.deepEqual(compareFile, compareGame);
  await checkTableText(offline);
  await checkCustomAngles(offline, offline.keyboard);
  assert.ok(fileRequests.every(url => url.startsWith('file:') || url.startsWith('data:')));
  assert.deepEqual(policyViolations, []);
  assert.deepEqual(mediaCalls, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({gameUrl, browser:browser.version(), viewerSha256:sha(original),
    spatialCheckpointSha256:spatialModel, movementCheckpointSha256:movementModel,
    game:compareGame, offline:compareFile, widths:[1280,390,375,320], narrowFrameWidth:251,
    preTabLoads:0, modelAssetRequests:panelRequests.map(r => r.url.split('/').pop()),
    cspViolations:policyViolations, deviceCalls:mediaCalls, externalRequests:0,
    rejectedMalformedInput:true, rejectedFutureAndMissingMeasurements:true, rejectedCorruptScriptAndRecovered:true,
    recoveredMissingPanelScript:true, savedFileReopened:true, rejectedMalformedCorrectionInputs:true,
    keyboardAt320:true, focusAndPauseRestored:true, resumedCameraControl:true}));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(downloadDir,{recursive:true,force:true});
}
