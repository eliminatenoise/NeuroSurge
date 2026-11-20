import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHandler, HOST } from '../serve-local.mjs';

const { chromium } = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const allowedHosts = new Set();
const server = createServer(createHandler({ root, allowedHosts })).listen(0, HOST);
await once(server, 'listening');
const host = HOST + ':' + server.address().port;
allowedHosts.add(host);
let browser;
try {
  const args = ['--disable-background-networking'];
  if (process.env.NS_ANGLE) args.push('--use-angle=' + process.env.NS_ANGLE);
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM, args });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // No live microphones or cameras in this test. The actual DOM event path must
  // require a gesture for either device and a second gesture to move from speech.
  await page.addInitScript(() => {
    window.testSpeech = { starts: 0, local: false, stops: 0 };
    class LocalRecognition {
      get processLocally() { return this.local === true; }
      set processLocally(v) { this.local = v; }
      start() {
        window.testSpeech.starts++;
        window.testSpeech.local = this.local;
        this.onresult?.({ results: [[{transcript: 'Bend my right elbow'}]] });
        this.onend?.();
      }
      abort() { window.testSpeech.stops++; }
    }
    Object.defineProperty(window, 'SpeechRecognition', {value: LocalRecognition});
    window.testVideo = { requests: 0 };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {value: async () => {
      window.testVideo.requests++;
      throw new DOMException('Camera denied in fixture', 'NotAllowedError');
    }});
  });
  const errors = [];
  page.on('pageerror', err => errors.push(String(err)));
  await page.goto('http://' + host + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
    document.querySelector('#ns-app').dataset.nsPhase === 'playing', null, {timeout: 90_000});
  const state = () => page.evaluate(() => {
    const game = window.__nsQA.inspect();
    return { mode: game.shell.mode, view: game.camera.pose.firstPerson, healthy: !game.placeholder && !game.qa,
      elbow: game.bodyDrawnJoints.r_elbow_flex, kneeLeft: game.bodyDrawnJoints.knee_ext_L,
      kneeRight: game.bodyDrawnJoints.knee_ext_R,
      active: document.activeElement.id, locked: !!document.pointerLockElement };
  });
  const headers = await page.request.get('http://' + host + '/scene/example/preview.html');
  assert.match(headers.headers()['permissions-policy'], /camera=\(self\), microphone=\(self\)/);
  const workerHeaders = await page.request.head('http://' + host + '/scene/src/camera/pose-worker.js');
  assert.match(workerHeaders.headers()['content-security-policy'], /'wasm-unsafe-eval'/);
  assert.doesNotMatch(headers.headers()['content-security-policy'], /'wasm-unsafe-eval'/);
  const initial = await state();
  assert.ok(initial.healthy);
  await page.locator('#ns-canvas').click({position: {x:600, y:500}});
  await page.waitForFunction(() => !!document.pointerLockElement);
  const input = page.getByRole('textbox', {name:'Move the body'});
  await page.keyboard.press('f');
  await input.waitFor();
  await page.waitForFunction(() => !document.pointerLockElement);
  assert.equal((await state()).mode, 'paused');
  await page.keyboard.type('rew asdf c2');
  assert.equal(await input.inputValue(), 'rew asdf c2');
  assert.equal(await page.evaluate(() => window.testVideo.requests), 0);
  assert.equal(await page.evaluate(() => window.testSpeech.starts), 0);
  await page.keyboard.press('Enter');
  assert.match(await page.getByRole('dialog').innerText(), /Try one movement with a side/);
  assert.equal((await state()).elbow, initial.elbow);
  await page.getByRole('button', {name:'Use voice'}).click();
  assert.equal(await input.inputValue(), 'Bend my right elbow');
  assert.equal((await state()).mode, 'paused');
  assert.deepEqual(await page.evaluate(() => window.testSpeech), {starts:1, local:true, stops:0});

  await page.keyboard.press('Enter');
  await page.waitForFunction(before => {
    const g = window.__nsQA.inspect();
    return g.shell.mode === 'playing' && Math.abs(g.bodyDrawnJoints.r_elbow_flex - before) > 15;
  }, initial.elbow);
  const moved = await state();
  assert.equal(moved.active, 'ns-canvas');
  assert.equal(moved.view, initial.view);
  await page.keyboard.press('f');
  await input.fill('bend left knee');
  await page.keyboard.press('Escape');
  assert.equal((await state()).mode, 'playing');
  assert.equal(await page.getByRole('dialog').count(), 0);
  const beforeKnee = await state();
  await page.getByRole('button', {name:'F · Move by words'}).click();
  await input.fill('bend left knee');
  await page.getByRole('button', { name:'Move', exact:true }).click();
  await page.waitForFunction(before => Math.abs(window.__nsQA.inspect().bodyDrawnJoints.knee_ext_L - before) > 15, beforeKnee.kneeLeft);
  const final = await state();
  assert.ok(Math.abs(final.kneeRight - beforeKnee.kneeRight) < 5, 'left command moved the right knee');
  await page.keyboard.press('c');
  await page.getByText('Camera off. The camera permission was denied or blocked by the browser.').waitFor();
  assert.equal(await page.evaluate(() => window.testVideo.requests), 1);
  assert.equal((await state()).mode, 'playing');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({initial, moved, final, errors}));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
