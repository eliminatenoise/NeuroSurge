// Exercise the regular game and drawn rig. A synthetic video track and a
// scripted replacement for the worker isolate capture/playback from inference.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHandler, HOST} from '../../../../serve-local.mjs';

const {chromium} = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const allowedHosts = new Set();
const server = createServer(createHandler({root, allowedHosts})).listen(0, HOST);
await once(server, 'listening');
const host = HOST + ':' + server.address().port, origin = 'http://' + host;
allowedHosts.add(host);
let browser;
try {
  const args = ['--disable-background-networking', '--use-fake-device-for-media-stream'];
  if (process.env.NS_ANGLE) args.push('--use-angle=' + process.env.NS_ANGLE);
  browser = await chromium.launch({executablePath: process.env.NS_CHROMIUM, args});
  const context = await browser.newContext({viewport: {width: 320, height: 640}, reducedMotion: 'reduce'});
  const page = await context.newPage();
  const errors = [], unexpected = [], requests = [];
  page.on('request', r => requests.push(r.url()));
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const r = route.request();
    if (new URL(r.url()).origin !== origin || r.method() !== 'GET') {
      unexpected.push([r.method(), r.url()]);
      return route.abort();
    }
    return route.continue();
  });
  await page.addInitScript(() => {
    const test = window.testTake = {requests: [], workers: 0, angle: null, tracks: [], failure: false};
    test.voice = {starts:0, stops:0};
    class FixtureDictation {
      get processLocally() { return this.local; }
      set processLocally(value) { this.local = value; }
      start() {
        test.voice.starts++;
        test.voice.local = this.local;
        test.voice.result = this.onresult;
        this.onresult({results:[[{transcript:test.transcript || 'Replay my take.'}]]});
      }
      abort() { test.voice.stops++; }
    }
    Object.defineProperty(window, 'SpeechRecognition', {value:FixtureDictation});
    const makeBitmap = window.createImageBitmap.bind(window);
    window.createImageBitmap = async (...args) => {
      const bitmap = await makeBitmap(...args);
      if (test.holdNextBitmap) {
        test.holdNextBitmap = false;
        await new Promise(resolve => { test.releaseBitmap = resolve; });
      }
      return bitmap;
    };
    navigator.mediaDevices.getUserMedia = async constraints => {
      test.requests.push(constraints);
      if (test.denied) throw new DOMException('Test denied', 'NotAllowedError');
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const paint = canvas.getContext('2d');
      const stream = canvas.captureStream(0);
      const track = stream.getVideoTracks()[0];
      test.tracks.push(track);
      if (test.delayGrant) await new Promise(resolve => { test.grant = resolve; });
      const timer = setInterval(() => {
        if (track.readyState === 'ended') { clearInterval(timer); return; }
        paint.fillRect(0, 0, 64, 64);
        track.requestFrame();
      }, 50);
      return stream;
    };
    const Native = window.Worker;
    window.Worker = class {
      constructor(url, ...args) {
        if (!String(url).endsWith('/camera/pose-worker.js')) return new Native(url, ...args);
        test.workers++;
      }
      postMessage(data) {
        if (data.type === 'init') { queueMicrotask(() => this.onmessage({data: {type: 'ready'}})); return; }
        data.frame.close();
        const key = data.limb === 'leftLeg' ? 'knee_ext_L' : 'knee_ext_R';
        const angle = test.angles?.length ? test.angles.shift() : test.angle;
        const result = angle === null ? null : {joints: {[key]: angle}};
        const message = test.failure ? {type: 'error'} : {type: 'pose', selection: data.selection, timestamp: data.timestamp, result};
        setTimeout(() => { if (!this.ended) this.onmessage({data: message}); }, 1);
      }
      terminate() { this.ended = true; }
    };
  });
  await page.goto(origin + '/START.html');
  await page.getByRole('link', {name: 'Play the experimental preview'}).press('Enter');
  await page.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
    document.querySelector('#ns-app').dataset.nsPhase === 'playing', null, {timeout: 120000});
  const panel = page.locator('#ns-motion-camera');
  const button = name => panel.getByRole('button', {name, exact: true});
  const record = button('Record take'), replay = button('Replay take');
  const select = panel.getByRole('combobox', {name: 'Follow'});
  const angle = n => page.evaluate(n => { window.testTake.angle = n; }, n);
  const phase = side => page.evaluate(s => window.__nsQA.inspect().bodyDrawnJoints['knee_ext_' + s], side);
  async function waitAngle(target, side = 'L') {
    await page.waitForFunction(([s, value]) =>
      Math.abs(window.__nsQA.inspect().bodyDrawnJoints['knee_ext_' + s] - value) < 4, [side, target]);
  }
  const focus = () => page.evaluate(() => document.activeElement.id);
  const field = page.getByRole('textbox', {name:'Command box'});
  const dialog = page.getByRole('dialog', {name:'Command box'});
  async function openF() { await page.locator('#ns-canvas').press('f'); await field.waitFor(); }
  const names = dialog.locator('[data-named-takes]');
  const nameField = names.getByRole('textbox', {name:'Take name'});
  const namedButton = name => names.getByRole('button', {name, exact:true});
  async function openNames() { await names.locator('summary').click(); }
  async function saveAs(name) {
    await nameField.fill(name);
    await namedButton('Save last take').click();
  }
  async function command(text) { await field.fill(text); await field.press('Enter'); }
  async function requestReplay() { await field.fill('replay my take'); await field.press('Enter'); }
  assert.equal(await page.evaluate(() => window.testTake.requests.length), 0);
  assert.equal(await panel.count(), 0);
  await openF();
  await requestReplay();
  await dialog.getByText(/No finished take in this tab/).waitFor();
  assert.equal(await panel.count(), 0);
  assert.equal(await page.evaluate(() => window.testTake.requests.length), 0);
  await field.press('Escape');
  await page.locator('#ns-canvas').focus();
  await page.keyboard.press('c');
  await panel.waitFor();
  assert.equal(await record.isDisabled(), true);
  assert.equal(await replay.isDisabled(), true);
  await select.selectOption('leftLeg');
  assert.equal(await focus(), 'ns-canvas');
  const opposite = await phase('R');
  await angle(-100);
  await waitAngle(-100);
  // The camera grabbed this bitmap before Record. Delay its resolution until
  // afterwards and offer exactly one more valid sample acquired during the take.
  await page.evaluate(() => { window.testTake.holdNextBitmap = true; });
  await page.waitForFunction(() => !!window.testTake.releaseBitmap);
  await record.click();
  await page.evaluate(() => {
    const test = window.testTake;
    test.angle = null;
    test.angles = [-80, -77, null];
    test.releaseBitmap();
  });
  await page.waitForFunction(() => !window.testTake.angles.length);
  await button('Finish take').click();
  assert.match(await panel.innerText(), /Too few visible samples/);
  assert.ok(await replay.isDisabled());
  await page.keyboard.press('c');
  await angle(-100);
  await waitAngle(-100);
  await record.focus();
  await record.evaluate(button => button.addEventListener('click', () => { window.testTake.start = performance.now(); }, {capture:true, once:true}));
  await record.press('Enter');
  await button('Finish take').waitFor();
  assert.equal(await focus(), 'ns-canvas');
  const layout = await panel.boundingBox();
  assert.ok(layout.x >= 0 && layout.x + layout.width <= 320 && layout.y + layout.height <= 640);
  await page.waitForTimeout(500);
  await angle(null);
  await panel.getByText(/Show shoulders, hips, your left knee and ankle/).waitFor();
  const gapStart = await page.evaluate(() => Math.ceil(performance.now() - window.testTake.start));
  await page.waitForTimeout(300);
  await angle(-20);
  await waitAngle(-20);
  await page.waitForTimeout(450);
  await button('Finish take').click();
  assert.equal(await page.evaluate(() => window.testTake.tracks.at(-1).readyState), 'ended');
  const summary = await panel.getByText(/Left knee · [\d.]+ s · \d+ pose samples/).innerText();
  assert.ok(await record.isDisabled());
  assert.ok(await replay.isEnabled());
  const replayStart = performance.now();
  await replay.click();
  await waitAngle(-100);
  await waitAngle(-20);
  assert.ok(Math.abs(await phase('R') - opposite) < 3);
  await panel.getByText(summary, {exact: true}).waitFor();
  const replayMs = performance.now() - replayStart;
  assert.ok(Math.abs(replayMs - 1000 * Number(summary.match(/· ([\d.]+) s/)[1])) < 750);
  assert.ok(await replay.isEnabled());
  assert.equal(await page.evaluate(() => window.testTake.requests.length), 2);

  await openF();
  await openNames();
  await saveAs('My left bend');
  await names.getByText('Saved “My left bend” in this tab.').waitFor();
  await saveAs('My left bend slow');
  assert.equal(await names.locator('li').count(), 2);
  await field.press('Escape');

  // Opening F stops C playback. Dictation fills the field; the second gesture
  // releases the microphone before the saved limb moves on the same clock.
  await replay.click();
  await openF();
  assert.ok(await replay.isDisabled());
  await dialog.getByRole('button', {name:'Use voice'}).click();
  assert.equal(await field.inputValue(), 'Replay my take.');
  assert.ok(await replay.isDisabled());
  assert.equal(await page.evaluate(() => window.testTake.voice.local), true);
  await dialog.getByRole('button', {name:'Move', exact:true}).click();
  await waitAngle(-100);
  await waitAngle(-20);
  await panel.getByText(summary, {exact:true}).waitFor();
  assert.ok(Math.abs(await phase('R') - opposite) < 3);
  assert.equal(await page.evaluate(() => window.testTake.voice.stops), 1);
  assert.equal(await page.evaluate(() => window.testTake.requests.length), 2);

  // A stale callback from that recognizer cannot fill a later F dialog.
  await openF();
  await page.evaluate(() => window.testTake.voice.result({results:[[{transcript:'stale words'}]]}));
  assert.equal(await field.inputValue(), '');
  await requestReplay();
  await button('Stop replay').waitFor();
  await button('Stop replay').click();
  assert.equal(await page.evaluate(() => window.testTake.voice.starts), 1);

  await replay.click();
  await button('Stop replay').click();
  assert.equal(await focus(), 'ns-canvas');
  await replay.click();
  await page.keyboard.press('c');
  await panel.getByText(summary, {exact: true}).waitFor();
  assert.equal(await page.evaluate(() => window.testTake.requests.length), 2);
  await replay.click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {value: true, configurable: true});
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden;
  });
  await panel.getByText(summary, {exact: true}).waitFor();

  // F interrupts an unfinished capture. An in-flight bitmap cannot replace
  // the previous, explicitly finished take after permission is released.
  await page.keyboard.press('c');
  await select.selectOption('rightLeg');
  await angle(-100);
  await waitAngle(-100, 'R');
  await record.click();
  await page.evaluate(() => { window.testTake.releaseBitmap = null; window.testTake.holdNextBitmap = true; });
  await page.waitForFunction(() => !!window.testTake.releaseBitmap);
  await openF();
  assert.equal(await page.evaluate(() => window.testTake.tracks.at(-1).readyState), 'ended');
  await page.evaluate(() => window.testTake.releaseBitmap());
  await requestReplay();
  await waitAngle(-100);
  await waitAngle(-20);
  await panel.getByText(summary, {exact:true}).waitFor();
  assert.equal(await select.inputValue(), 'leftLeg');

  await page.keyboard.press('c');
  await angle(-100);
  await waitAngle(-100);
  await record.click();
  await select.selectOption('rightLeg');
  await panel.getByText(/Take cancelled on limb change/).waitFor();
  await waitAngle(-100, 'R');
  await record.click();
  await page.waitForTimeout(350);
  await page.evaluate(() => { window.testTake.failure = true; });
  await panel.getByText(/tracker could not run/).waitFor();
  await replay.click();
  assert.equal(await select.inputValue(), 'leftLeg');
  await button('Stop replay').click();
  await page.evaluate(() => { window.testTake.failure = false; });
  await page.keyboard.press('c');
  await select.selectOption('rightLeg');
  await record.click();
  await panel.getByText(/Right knee · 8.0 s · \d+ pose samples/).waitFor({timeout: 11000});
  assert.equal(await page.evaluate(() => window.testTake.tracks.at(-1).readyState), 'ended');
  await replay.click();
  await page.keyboard.press('Escape');
  await panel.getByText(/Right knee · 8.0 s/).waitFor();
  assert.ok(await replay.isDisabled());
  await page.keyboard.press('Escape');
  assert.ok(await replay.isEnabled());
  await openF();
  await openNames();
  await saveAs('Right hold');
  await saveAs('  MY   LEFT BEND  ');
  await namedButton('Replace take').waitFor();
  await namedButton('Keep existing take').click();
  assert.equal(await names.locator('li').count(), 3);
  // Editing the target invalidates confirmation. The old numeric take still wins.
  await saveAs('my left bend');
  await nameField.fill('Right hold');
  assert.ok(await namedButton('Replace take').isHidden());
  const requestCount = requests.length;
  const deviceCount = await page.evaluate(() => testTake.requests.length);
  for (const bad of ['my left', 'left bend', 'my left bend or right hold', 'unknown', 'my left bend then bend my right knee']) {
    await command('replay take named ' + bad);
    await dialog.getByText('No saved take has that exact name. Check the list under Named takes.').waitFor();
    assert.ok(await button('Stop replay').isHidden());
  }
  for (const range of ['first 0 seconds', 'last 9 seconds', '0.8 to 0.2 seconds', '-1 to 1 seconds', '0 to NaN seconds']) {
    await command('replay ' + range + ' of take named My left bend');
    await dialog.getByText(/Choose increasing times/).waitFor();
    assert.ok(await button('Stop replay').isHidden());
  }
  await command('replay ' + (gapStart + 30) / 1000 + ' to ' + (gapStart + 200) / 1000 + ' seconds of take named My left bend');
  await dialog.getByText(/No visible pose samples in that interval/).waitFor();
  assert.ok(await button('Stop replay').isHidden());
  await command('replay first 0.45 seconds of take named My left bend');
  await waitAngle(-100);
  await panel.getByText(/Replay ended · “My left bend”. Last take · Right knee/).waitFor();
  assert.ok(Math.abs(await phase('L') + 100) < 4);
  await openF();
  await command('replay last 0.4 seconds of take named My left bend');
  await waitAngle(-20);
  await panel.getByText(/Replay ended · “My left bend”. Last take · Right knee/).waitFor();
  await openF();
  await command('Please replay my take named  MY   LEFT BEND.');
  await waitAngle(-100);
  await waitAngle(-20);
  await panel.getByText(/Replay ended · “My left bend”. Last take · Right knee/).waitFor();
  assert.equal(await select.inputValue(), 'leftLeg');
  // The generic command must still play the last finished right knee.
  await openF();
  await requestReplay();
  await button('Stop replay').waitFor();
  assert.equal(await select.inputValue(), 'rightLeg');
  await button('Stop replay').click();
  // On-device dictation only fills the field. The reviewed name selects the old recording.
  await openF();
  await page.evaluate(() => { testTake.transcript = 'Replay take named my left bend slow.'; });
  await dialog.getByRole('button', {name:'Use voice'}).click();
  assert.equal(await field.inputValue(), 'Replay take named my left bend slow.');
  assert.ok(await button('Stop replay').isHidden());
  await dialog.getByRole('button', {name:'Move', exact:true}).click();
  await waitAngle(-100);
  await waitAngle(-20);
  await panel.getByText(/Replay ended · “My left bend slow”/).waitFor();
  assert.equal(await page.evaluate(() => testTake.voice.stops), 2);
  await openF();
  await openNames();
  await saveAs('my left bend');
  await namedButton('Replace take').click();
  await names.getByText('Replaced “My left bend”.').waitFor();
  await command('replay take named my left bend');
  await button('Stop replay').waitFor();
  assert.equal(await select.inputValue(), 'rightLeg');
  await button('Stop replay').click();
  const extraDeviceStarts = await page.evaluate(() => testTake.requests.length) - deviceCount;
  const replayRequests = requests.slice(requestCount);
  assert.equal(extraDeviceStarts, 0);
  assert.deepEqual(replayRequests, []);
  await button('Dismiss').click();
  assert.ok(await panel.isHidden());
  assert.equal(await focus(), 'ns-canvas');
  await openF();
  await requestReplay();
  await dialog.getByText(/No finished take in this tab/).waitFor();
  await field.press('Escape');
  await openF();
  await openNames();
  assert.ok(await namedButton('Save last take').isDisabled());
  await nameField.fill('my left bend slow');
  await namedButton('Forget by name').click();
  await namedButton('Keep existing take').click();
  assert.equal(await names.locator('li').count(), 3);
  await namedButton('Forget by name').click();
  await namedButton('Forget take').click();
  assert.equal(await names.locator('li').count(), 2);
  await command('replay take named my left bend slow');
  await dialog.getByText(/No saved take has that exact name/).waitFor();
  await command('replay take named right hold');
  await button('Stop replay').waitFor();
  assert.equal(await select.inputValue(), 'rightLeg');
  await button('Stop replay').click();
  // Cancel a pending camera permission while changing to F. Its late stream
  // must close and a typed replay must keep both devices off.
  await page.evaluate(() => { window.testTake.delayGrant = true; });
  await page.keyboard.press('c');
  await page.waitForFunction(() => !!window.testTake.grant);
  await openF();
  await requestReplay();
  await dialog.getByText(/No finished take in this tab/).waitFor();
  await page.evaluate(() => { window.testTake.delayGrant = false; window.testTake.grant(); });
  await page.waitForFunction(() => window.testTake.tracks.at(-1).readyState === 'ended');
  assert.equal(await page.evaluate(() => window.testTake.workers), 5);
  await command('replay last 0.5 seconds of take named right hold');
  await panel.getByText('Replay ended · “Right hold”.', {exact:true}).waitFor();
  await page.evaluate(() => { window.testTake.denied = true; });
  await page.keyboard.press('c');
  await panel.getByText(/permission was denied/).waitFor();
  assert.ok(await record.isDisabled());
  assert.ok(await replay.isDisabled());
  const state = await page.evaluate(() => ({
    requests: window.testTake.requests, workers: window.testTake.workers,
    tracks: window.testTake.tracks.map(t => t.readyState)
  }));
  assert.deepEqual(state.requests.map(r => r.audio), [false, false, false, false, false, false, false]);
  assert.equal(state.workers, 5);
  assert.deepEqual(state.tracks, ['ended', 'ended', 'ended', 'ended', 'ended', 'ended']);
  // A second tab under the same origin and browser profile cannot see these names.
  const second = await page.context().newPage();
  await second.addInitScript(() => {
    window.unexpectedCapture = 0;
    navigator.mediaDevices.getUserMedia = async () => { window.unexpectedCapture++; throw Error('Unexpected camera request'); };
  });
  await second.goto(origin + '/START.html');
  await second.getByRole('link', {name:'Play the experimental preview'}).press('Enter');
  await second.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
    document.querySelector('#ns-app').dataset.nsPhase === 'playing', null, {timeout:120000});
  await second.locator('#ns-canvas').press('f');
  const secondField = second.getByRole('textbox', {name:'Command box'});
  await secondField.fill('replay take named right hold');
  await secondField.press('Enter');
  await second.getByText(/No saved take has that exact name/).waitFor();
  await secondField.fill('replay last 1 second of take named right hold');
  await secondField.press('Enter');
  await second.getByText(/No saved take has that exact name/).waitFor();
  assert.ok(await second.locator('[data-named-takes]').isHidden());
  assert.equal(await second.evaluate(() => window.unexpectedCapture), 0);
  await second.close();
  await page.bringToFront();
  // Page exit disposes the entire game, including the finished take and F
  // controls. A fresh entry has no saved take or automatic device request.
  await page.evaluate(() => { window.testTake.denied = false; });
  await page.keyboard.press('c');
  await angle(-95);
  await record.click();
  await page.waitForTimeout(550);
  await button('Finish take').click();
  assert.ok(await replay.isEnabled());
  await openF();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted:true})));
  assert.equal(await panel.count(), 0);
  assert.equal(await dialog.count(), 0);
  await page.reload();
  await page.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
    document.querySelector('#ns-app').dataset.nsPhase === 'playing', null, {timeout:120000});
  await openF();
  await requestReplay();
  await dialog.getByText(/No finished take in this tab/).waitFor();
  await command('replay take named right hold');
  await dialog.getByText(/No saved take has that exact name/).waitFor();
  assert.ok(await names.isHidden());
  assert.equal(await page.evaluate(() => window.testTake.requests.length), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({browser: browser.version(), summary, replayMs, layout, namedReplay:{old:"Left knee", latest:"Right knee", replayRequests:replayRequests.length, deviceStarts:extraDeviceStarts, reviewedVoice:true, replaced:true, forgotten:true}, ...state, errors, unexpected}));
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
