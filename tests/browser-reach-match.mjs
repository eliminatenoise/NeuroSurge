// Exercise F and C in ordinary game play without a real microphone or camera.
// A local video track displays bundled reference photographs to the real pose worker.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';

import {createHandler, HOST} from '../serve-local.mjs';

const {chromium} = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const recordings = JSON.parse(
    readFileSync(new URL('../scene/src/camera/reach-study/recordings.json', import.meta.url)));
const hosts = new Set(), root = fileURLToPath(new URL('../', import.meta.url));
const server = createServer(createHandler({root, allowedHosts: hosts})).listen(0, HOST);
await once(server, 'listening');
const host = HOST + ':' + server.address().port, origin = 'http://' + host;
hosts.add(host);
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.NS_CHROMIUM,
    args: [
      '--disable-background-networking', '--use-fake-device-for-media-stream',
      '--use-angle=' + (process.env.NS_ANGLE || 'swiftshader'), '--enable-unsafe-swiftshader'
    ]
  });
  for (const width of [1280, 320]) {
    const page = await browser.newPage(
        {viewport: {width, height: 800}, hasTouch: width === 320, reducedMotion: 'reduce'});
    const outside = [], errors = [], writes = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      if (route.request().method() !== 'GET') {
        writes.push(route.request().method());
        return route.abort();
      }
      if (new URL(route.request().url()).origin !== origin) {
        outside.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    await page.addInitScript(() => {
      const test = window.captureAudit = {starts: 0, requests: [], poses: []};
      class LocalVoice {
        get processLocally() {
          return this.local;
        }
        set processLocally(v) {
          this.local = v;
        }
        start() {
          test.starts++;
          if (this.local !== true) throw Error('Voice is not on device');
          this.onresult?.({results: [[{transcript: 'Match my arm reach.'}]]});
          this.onend?.();
        }
        abort() {}
      }
      Object.defineProperty(window, 'SpeechRecognition', {value: LocalVoice});
      for (const api of ['getDisplayMedia', 'enumerateDevices'])
        Object.defineProperty(navigator.mediaDevices, api, {
          value() {
            throw Error('Unexpected device access');
          }
        });
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        value: async constraints => {
          test.requests.push(constraints);
          if (!constraints.video || constraints.audio !== false) throw Error('Expected video only');
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 480;
          const paint = canvas.getContext('2d');
          const stills = {};
          for (const file of ['arm-down', 'arm-up']) {
            const img = new Image();
            img.src = '/scene/src/camera/tests/' + file + '.jpg';
            await img.decode();
            stills[file] = img;
          }
          test.still = 'arm-down';
          const stream = canvas.captureStream(0), track = stream.getVideoTracks()[0];
          test.track = track;
          function paintFrame() {
            paint.drawImage(stills[test.still], 0, 0, 480, 480);
            track.requestFrame();
          }
          paintFrame();
          const timer =
              setInterval(() => track.readyState === 'ended' ? clearInterval(timer) : paintFrame(), 48);
          return stream;
        }
      });
      const WorkerImpl = Worker;
      window.Worker = class extends WorkerImpl {
        constructor(url, ...rest) {
          super(url, ...rest);
          if (String(url).endsWith('/camera/pose-worker.js'))
            this.addEventListener('message', ({data}) => {
              if (data.type === 'pose')
                test.poses.push({
                  t: data.timestamp,
                  point: data.wrists?.rightArm || null,
                  angle: data.result?.joints?.r_shoulder_abd
                });
            });
        }
      };
    });
    await page.goto(origin + '/START.html');
    await page.getByRole('link', {name: 'Play the experimental preview'}).click();
    await page.waitForFunction(
        () => window.__nsQA?.inspect()?.features?.bodyRig &&
            document.querySelector('#ns-app').dataset.nsPhase === 'playing',
        null, {timeout: 120000});
    const game = page.locator('#ns-canvas'), panel = page.locator('[data-reach-study]');
    const field = page.getByRole('textbox', {name: 'Command box'});
    const command = async () => {
      await field.fill('match my arm reach');
      await field.press('Enter');
    };
    const open = async () => {
      await game.press('f');
      await field.waitFor();
    };
    await open();
    await command();
    await panel.getByText(/Finish an arm take/).waitFor();
    await panel.getByRole('button', {name: 'Try a recorded example'}).click();
    assert.match(
        await panel.locator('[data-match-status]').innerText(), /Recorded example.*Block 1.*trial 7/);
    assert.equal(await panel.locator('[data-case] option').count(), 8);
    await panel.locator('[data-case]').selectOption('7');
    await panel.locator('[data-sample]').focus();
    await page.keyboard.press('End');
    const last = recordings.at(-1);
    assert.ok((await panel.locator('[data-coordinates]').innerText()).includes('row ' + (last.k + 9)));
    assert.ok((await panel.locator('[data-spikes]').innerText())
                  .includes(last.spikes.reduce((a, b) => a + b, 0) + ' recorded area 2'));
    const image = () => panel.locator('[data-spatial]').evaluate(c => c.toDataURL());
    const prior = await image();
    await panel.locator('[data-orbit]').focus();
    await page.keyboard.press('End');
    assert.notEqual(await image(), prior);
    await panel.locator('[data-play]').click();
    await page.waitForFunction(
        () =>
            document.querySelector('[data-reach-study] [data-play]').textContent.startsWith('Replay') &&
            document.querySelector('[data-sample]').value === '29');
    assert.equal(await page.evaluate(() => window.captureAudit.requests.length), 0);
    assert.equal(await page.evaluate(() => window.captureAudit.starts), 0);
    const layout = await panel.evaluate(
        el => ({
          width: el.clientWidth,
          scroll: el.scrollWidth,
          out: [...el.querySelectorAll('*')]
                   .filter(c => c.getBoundingClientRect().right > el.getBoundingClientRect().right + 1)
                   .map(c => [c.tagName, c.outerHTML.slice(0, 120), c.getBoundingClientRect().width])
        }));
    assert.ok(layout.scroll <= layout.width + 1, JSON.stringify(layout));
    await panel.getByRole('button', {name: 'Back to game'}).click();
    await game.press('c');
    const camera = page.locator('#ns-motion-camera');
    await page.waitForFunction(
        () => window.captureAudit.poses.at(-1)?.angle < 45, null, {timeout: 90000});
    const beforeTake = await page.evaluate(() => window.captureAudit.poses);
    assert.ok(beforeTake.length > 0 && beforeTake.every(pose => pose.point === null), 'Idle camera returned wrist offsets');
    await camera.getByRole('button', {name: 'Record take', exact: true}).click();
    const n = await page.evaluate(() => window.captureAudit.poses.length);
    await page.waitForFunction(n => window.captureAudit.poses.length >= n + 4, n, {timeout: 30000});
    await page.evaluate(() => {
      window.captureAudit.still = 'arm-up';
    });
    await page.waitForFunction(
        () => window.captureAudit.poses.slice(-5).every(p => p.angle > 115), null, {timeout: 30000});
    await camera.getByRole('button', {name: 'Finish take'}).click();
    assert.equal(await page.evaluate(() => window.captureAudit.track.readyState), 'ended');
    await open();
    if (width === 320) {
      await page.getByRole('button', {name: 'Use voice'}).tap();
      assert.equal(await field.inputValue(), 'Match my arm reach.');
      assert.equal(await panel.isHidden(), true);
      await field.press('Enter');
    } else
      await page.getByRole('button', {name: 'Match my arm reach', exact: true}).click();
    const match = panel.locator('[data-match-status]');
    await page.waitForFunction(
        () => document.querySelector('[data-match-status]').textContent !== 'Opening the recordings…');
    const message = await match.innerText();
    assert.match(
        message, /Right wrist.*Closest shape/,
        JSON.stringify(await page.evaluate(() => window.captureAudit.poses)));
    assert.equal(await panel.locator('[data-case] option').count(), 8);
    const best = await panel.locator('[data-case]').inputValue();
    await panel.locator('[data-side]').selectOption('leftArm');
    assert.match(await match.innerText(), /other arm/);
    assert.ok(await panel.locator('[data-study-result]').isHidden());
    await panel.locator('[data-side]').selectOption('rightArm');
    assert.equal(await panel.locator('[data-case]').inputValue(), best);
    if (process.env.NS_SCREENSHOT_DIR) {
      await panel.locator('h2').focus();
      await page.screenshot({path: process.env.NS_SCREENSHOT_DIR + '/match-' + width + '.png'});
    }
    await page.keyboard.press('Escape');
    await game.press('m');
    await page.getByRole('dialog', {name: 'Activity map'}).waitFor();
    const audit = await page.evaluate(() => ({
                                        starts: window.captureAudit.starts,
                                        requests: window.captureAudit.requests.length,
                                        frames: window.captureAudit.poses.filter(p => p.point).length
                                      }));
    assert.deepEqual(
        {starts: audit.starts, requests: audit.requests}, {starts: width === 320 ? 1 : 0, requests: 1});
    assert.deepEqual(outside, []);
    assert.deepEqual(writes, []);
    assert.deepEqual(errors, []);
    console.log(
        JSON.stringify({width, message, selected: Number(best), audit, errors, outside, writes}));
    await page.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
