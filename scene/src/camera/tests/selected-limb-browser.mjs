// Run against local licensed stills (camera/README.md). No physical device is used.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHandler, HOST} from '../../../../serve-local.mjs';

const {chromium} = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const fixtureDir = process.env.NS_CAMERA_REFERENCE_DIR;
assert.ok(fixtureDir, 'Set NS_CAMERA_REFERENCE_DIR to the directory of local reference frames.');
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const names = ['standing', 'lunge-left-arm', 'lunge-right-arm', 'kick-1580', 'kick-1600'];
const images = {};
for (const name of names) images[name] = await readFile(join(fixtureDir, name + '.jpg'));
images.bent = await readFile(fileURLToPath(new URL('elbow-bent.jpg', import.meta.url)));
const allowedHosts = new Set(), server = createServer(createHandler({root, allowedHosts}));
let browser;
try {
  server.listen(0, HOST);
  await once(server, 'listening');
  const host = HOST + ':' + server.address().port, origin = 'http://' + host;
  allowedHosts.add(host);
  browser = await chromium.launch({executablePath: process.env.NS_CHROMIUM || undefined,
    args: ['--disable-background-networking', '--use-fake-device-for-media-stream',
      '--use-angle=' + (process.env.NS_ANGLE || 'swiftshader'), '--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport: {width: 1000, height: 700}});
  const external = [], writes = [], errors = [];
  page.on('request', request => {
    if (new URL(request.url()).origin !== origin) external.push(request.url());
    if (request.method() !== 'GET') writes.push(request.method());
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__camera_test__/*', route => route.fulfill({
    contentType: 'image/jpeg', body: images[new URL(route.request().url()).pathname.split('/').at(-1)]
  }));
  await page.addInitScript(() => {
    window.captureCalls = [];
    navigator.mediaDevices.getUserMedia = async constraints => {
      window.captureCalls.push(constraints);
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      let shown = null, masked = false;
      function draw() {
        if (shown) ctx.drawImage(shown, 0, 0);
        else ctx.fillRect(0, 0, 480, 480);
        if (masked) ctx.fillRect(0, 240, 480, 240);
      }
      window.useFrame = async (name, mask = false) => {
        let img = null;
        if (name) {
          img = new Image();
          img.src = '/__camera_test__/' + name;
          await img.decode();
        }
        shown = img;
        masked = mask;
        draw();
      };
      draw();
      window.drawTimer = setInterval(draw, 80);
      const stream = canvas.captureStream(12);
      window.virtualTrack = stream.getVideoTracks()[0];
      return stream;
    };
    window.readPose = () => {
      const q = window.__nsQA.inspect(), left = q.limbs.ends.leftArm;
      const upper = left.bend.map((v, i) => v - left.root[i]);
      const lower = left.frame.map((v, i) => v - left.bend[i]);
      const cos = upper.reduce((sum, v, i) => sum + v * lower[i], 0) / (Math.hypot(...upper) * Math.hypot(...lower));
      return {rightShoulder: q.bodyDrawnJoints.r_shoulder_abd, rightElbow: q.bodyDrawnJoints.r_elbow_flex,
        leftKnee: q.bodyDrawnJoints.knee_ext_L, rightKnee: q.bodyDrawnJoints.knee_ext_R,
        leftElbow: Math.acos(Math.min(1, Math.max(-1, cos))) * 180 / Math.PI, leftHandY: left.end[1] - left.root[1]};
    };
  });
  await page.goto(origin + '/');
  const wait = {timeout: 45000, polling: 150};
  await page.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
    window.__nsQA.inspect().limbs?.ends?.leftArm, null, {timeout: 120000});
  assert.equal(await page.evaluate(() => window.captureCalls.length), 0);
  await page.getByRole('button', {name: /Use camera/}).click();
  await page.waitForFunction(() => window.virtualTrack && document.querySelector('#ns-motion-camera video').srcObject);
  const panel = page.locator('#ns-motion-camera'), select = panel.getByRole('combobox');
  async function choose(limb) {
    await select.selectOption(limb);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'ns-canvas');
  }
  async function frame(name) { await page.evaluate(n => window.useFrame(n), name); }
  const snapshots = {};
  async function seen(id, key, lower, upper) {
    try {
      const settled = await page.waitForFunction(([label, k, lo, hi]) => {
        const pose = window.readPose();
        if (!window.settled || window.settled.label !== label) window.settled = {label};
        if (pose[k] <= lo || pose[k] >= hi || !Number.isFinite(pose[k])) {
          window.settled.since = null;
          return false;
        }
        window.settled.since ??= performance.now();
        return performance.now() - window.settled.since >= 600 && pose;
      }, [id, key, lower, upper], wait);
      snapshots[id] = await settled.jsonValue();
      await settled.dispose();
    } catch (error) {
      throw new Error(id + ' ' + await panel.innerText() + ' ' + JSON.stringify(await page.evaluate(() => window.readPose())), {cause: error});
    }
  }

  await frame('lunge-right-arm');
  await seen('right raised', 'rightShoulder', 105, 181);
  await frame('lunge-left-arm');
  await seen('right lowered', 'rightShoulder', 0, 65);
  await choose('leftArm');
  await seen('left raised', 'leftHandY', 0.18, 1.0);
  await frame('lunge-right-arm');
  await seen('left lowered', 'leftHandY', -1.0, -0.15);
  await frame('bent');
  await seen('left bent', 'leftElbow', 65, 110);
  assert.ok(Math.abs(snapshots['left bent'].rightShoulder - snapshots['left raised'].rightShoulder) < 3);
  await frame(null);
  await page.getByText('Face the lens. Show both shoulders, your left elbow and wrist.').waitFor();
  // Two unbent frontal frames alone must never acquire one of the knee controls.
  await choose('leftLeg');
  await frame('standing');
  await page.waitForTimeout(900);
  assert.match(await panel.innerText(), /First show a clear bend/);
  await frame('kick-1580');
  await seen('left bent knee', 'leftKnee', -135.5, -75);
  await frame('kick-1600');
  await seen('left extended knee', 'leftKnee', -40, 1);
  await page.keyboard.press('3');
  await page.waitForFunction(() => document.querySelector('#ns-motion-camera select').value === 'rightLeg', null, wait);
  await seen('right bent knee', 'rightKnee', -135.5, -80);
  await frame('kick-1580');
  await seen('right extended knee', 'rightKnee', -55, 1);
  assert.ok(Math.abs(snapshots['left bent knee'].rightKnee - snapshots['left extended knee'].rightKnee) < 3);
  assert.ok(Math.abs(snapshots['right bent knee'].leftKnee - snapshots['right extended knee'].leftKnee) < 3);

  await page.evaluate(() => window.useFrame('kick-1580', true));
  await page.getByText(/Show shoulders, hips, your right knee and ankle/).waitFor();
  const beforeMask = await page.evaluate(() => window.readPose().rightKnee);
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(200);
    assert.match(await panel.innerText(), /First show a clear bend/);
    assert.ok(Math.abs((await page.evaluate(() => window.readPose())).rightKnee - beforeMask) < 3);
  }
  await frame(null);
  await page.getByText(/Show shoulders, hips, your right knee and ankle/).waitFor();
  await frame('standing');
  await page.waitForTimeout(900);
  assert.match(await panel.innerText(), /First show a clear bend/);
  await page.keyboard.press('c');
  await page.waitForFunction(() => window.virtualTrack.readyState === 'ended', null, wait);
  await panel.getByRole('button', {name: 'Dismiss'}).click();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ns-canvas');
  await page.evaluate(() => clearInterval(window.drawTimer));
  assert.deepEqual(await page.evaluate(() => window.captureCalls.map(call => call.audio)), [false]);
  assert.deepEqual(external, []);
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(snapshots, null, 2));
} finally {
  await browser?.close();
  server.close();
}
