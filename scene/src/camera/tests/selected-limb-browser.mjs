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
for (const name of ['arm-up','arm-down']) images[name] = await readFile(fileURLToPath(new URL(name + '.jpg', import.meta.url)));
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
  const external = [], writes = [], errors = [], requests = [];
  page.on('request', request => {
    requests.push(request.url());
    if (new URL(request.url()).origin !== origin) external.push(request.url());
    if (request.method() !== 'GET') writes.push(request.method());
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/__camera_test__/*', route => route.fulfill({
    contentType: 'image/jpeg', body: images[new URL(route.request().url()).pathname.split('/').at(-1)]
  }));
  await page.addInitScript(() => {
    window.captureCalls = [];
    window.workerCounts = {starts: 0, active: 0, maxActive: 0, inFlight: 0, maximum: 0, cancelledFrames: 0};
    window.referenceFrames = [];
    window.sideTracking = function () {
      const status = document.querySelector('#ns-motion-camera [role=status]')?.textContent.toLowerCase().split('.')[0] || '';
      const group = status.startsWith('following ');
      return {
        leftArm: status.startsWith('left arm') || status.startsWith('both arms') || (group && status.includes('left arm')),
        rightArm: status.startsWith('right arm') || status.startsWith('right shoulder') || status.startsWith('both arms') || (group && status.includes('right arm')),
        leftLeg: status.startsWith('left knee tracking') || ['both knees tracking','both arms and knees tracking'].includes(status) || (group && status.includes('left knee')),
        rightLeg: status.startsWith('right knee tracking') || ['both knees tracking','both arms and knees tracking'].includes(status) || (group && status.includes('right knee'))
      };
    };
    const Native = window.Worker;
    window.Worker = class extends Native {
      constructor(url, ...args) {
        super(url, ...args);
        this.isPose = String(url).endsWith('/camera/pose-worker.js');
        if (this.isPose) {
          this.pendingFrames = new Map();
          const w = window.workerCounts;
          w.starts++;
          w.maxActive = Math.max(w.maxActive, ++w.active);
          this.addEventListener('message', ({data}) => {
            if (data.type !== 'pose' || !this.pendingFrames.has(data.timestamp)) return;
            const joints = data.result?.joints;
            const frame = {at:data.timestamp, limb:this.pendingFrames.get(data.timestamp), age:performance.now()-data.timestamp,
              raw:{rightShoulder:joints?.r_shoulder_abd,rightElbow:joints?.r_elbow_flex,leftElbow:data.result?.leftArm?.elbowDeg,
                leftKnee:joints?.knee_ext_L,rightKnee:joints?.knee_ext_R},
              sides:{leftArm:!!data.result?.leftArm,rightArm:Number.isFinite(joints?.r_elbow_flex),
                leftLeg:Number.isFinite(joints?.knee_ext_L),rightLeg:Number.isFinite(joints?.knee_ext_R)}};
            window.lastCameraFrame = frame;
            // This listener was registered before the controller. Read its
            // actual acceptance after it has applied age and calibration.
            setTimeout(() => {
              const selection = document.querySelector('#ns-motion-camera select')?.value;
              if (window.lastCameraFrame !== frame || frame.at < window.stillChangedAt || frame.limb !== selection) return;
              frame.tracked = window.sideTracking();
              window.referenceFrames.push(frame);
            },0);
            this.pendingFrames.delete(data.timestamp);
            w.inFlight--;
          });
        }
      }
      postMessage(packet, ...args) {
        if (this.isPose && packet.type === 'frame') {
          const w = window.workerCounts;
          if (this.pendingFrames.has(packet.timestamp)) throw Error('Duplicate frame timestamp');
          this.pendingFrames.set(packet.timestamp, packet.limb);
          w.maximum = Math.max(w.maximum, ++w.inFlight);
        }
        super.postMessage(packet, ...args);
      }
      terminate() {
        super.terminate();
        if (this.isPose && !this.closed) {
          this.closed = true;
          const w = window.workerCounts;
          // Cancelling C destroys this worker. Its pending frame cannot reply
          // and must not count against the next worker's single-frame budget.
          w.cancelledFrames += this.pendingFrames.size;
          w.inFlight -= this.pendingFrames.size;
          this.pendingFrames.clear();
          w.active--;
        }
      }
    };
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
        if (masked === true) ctx.fillRect(0, 240, 480, 240);
        // The unilateral covers leave both shoulders visible on their reference stills.
        if (masked === 'left') ctx.fillRect(263, 227, 170, 103);
        if (masked === 'right') ctx.fillRect(310, 42, 83, 122);
        if (masked === 'right-foot') ctx.fillRect(142, 321, 91, 82);
        if (masked === 'left-foot') ctx.fillRect(145, 316, 94, 93);
      }
      window.useFrame = async (name, mask = false) => {
        let img = null;
        if (name) {
          img = new Image();
          img.src = '/__camera_test__/' + name;
          await img.decode();
        }
        window.stillChangedAt = performance.now();
        window.referenceFrames = [];
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
  await page.goto(origin + '/START.html');
  await page.getByRole('link', {name:'Play the experimental preview'}).press('Enter');
  const wait = {timeout: 45000, polling: 150};
  await page.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
    window.__nsQA.inspect().limbs?.ends?.leftArm, null, {timeout: 120000});
  assert.equal(await page.evaluate(() => window.captureCalls.length), 0);
  await page.getByRole('button', {name: /Use camera/}).click();
  await page.waitForFunction(() => window.virtualTrack && document.querySelector('#ns-motion-camera video').srcObject);
  const panel = page.locator('#ns-motion-camera'), select = panel.getByRole('combobox', {name: 'Follow'});
  async function choose(limb) {
    await select.selectOption(limb);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'ns-canvas');
  }
  async function frame(name) { await page.evaluate(n => window.useFrame(n), name); }
  const snapshots = {};
  async function checkReleasedKnee(key, message) {
    const previous = await page.evaluate(key => window.readPose()[key], key);
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(125);
      assert.match(await panel.innerText(), message);
      assert.ok(Math.abs(await page.evaluate(key => window.readPose()[key], key) - previous) < 1);
    }
  }
  async function checkFootSwap(name, mask, hiddenKnee) {
    const samples = await page.evaluate(async ([name, mask, key]) => {
      const values = [window.readPose()[key]];
      await window.useFrame(name, mask);
      const start = performance.now();
      while (performance.now() - start < 1100) {
        await new Promise(requestAnimationFrame);
        values.push(window.readPose()[key]);
      }
      return values;
    }, [name, mask, hiddenKnee]);
    assert.ok(samples.length >= 3);
    assert.ok(samples.every(v => Math.abs(v - samples[0]) < 5), JSON.stringify({name, mask, hiddenKnee, samples}));
  }
  // The far elbow in the oblique lunge is often occluded. A brief accepted
  // observation can move the game, then the drawing holds. Keep its actual
  // acquisition time and separate that event from the 600 ms display dwell.
  // Every measured side needs a fresh observation from this exact stimulus.
  const evidence = snapshots.referenceEvidence = {};
  async function seen(id, key, lower, upper, other = {}, held = {}, together = false) {
    const visible = {[key]:[lower,upper], ...other};
    try {
      const settled = await page.waitForFunction(([label, visible, held, together]) => {
        const pose = window.readPose();
        const mode = document.querySelector('#ns-motion-camera select').value;
        const map = {rightShoulder:'rightArm',rightElbow:'rightArm',leftElbow:'leftArm',leftHandY:'leftArm',leftKnee:'leftLeg',rightKnee:'rightLeg'};
        const inRange = ([key,[lo,hi]]) => Number.isFinite(pose[key]) &&
          (lo === null || pose[key] > lo) && (hi === null || pose[key] < hi);
        const ranged = Object.entries(visible);
        const frames = window.referenceFrames.filter(f => f.limb === mode && f.age < 1200 && f.at >= window.stillChangedAt);
        function measures(f, key) {return f.sides[map[key]] && f.tracked[map[key]];}
        function fits(f, [key,[lo,hi]]) {
          if(!f || !measures(f,key))return false;
          // Left-hand height is a drawn position in metres. The worker
          // reports its bearing and elbow bend, so no raw metre test applies.
          if(key === 'leftHandY')return true;
          const raw=f.raw[key];
          return Number.isFinite(raw) && (lo===null || raw>=lo) && (hi===null || raw<=hi);
        }
        const sources={};
        for(const entry of ranged) {
          const [key]=entry, latest=frames.findLast(f=>measures(f,key));
          if(fits(latest,entry))sources[key]=latest.at;
        }
        const jointFrame=frames.findLast(f=>ranged.every(entry=>fits(f,entry)));
        const ready = Object.keys(sources).length===ranged.length && (!together || jointFrame) &&
          ranged.every(inRange) && Object.entries(held).every(inRange);
        if (!window.settled || window.settled.label !== label) window.settled = {label};
        if (!ready) {window.settled.since = null;return false;}
        window.settled.since ??= performance.now();
        const dwell=performance.now()-window.settled.since;
        if(dwell<600)return false;
        return {pose, evidence:{sources,jointFrame:jointFrame?.at??null,displayDwellMs:dwell,
          currentTracking:window.sideTracking(),stillChangedAt:window.stillChangedAt}};
      }, [id, visible, held, together], wait);
      const readback=await settled.jsonValue();
      snapshots[id]=readback.pose;
      evidence[id]=readback.evidence;
      await settled.dispose();
    } catch (error) {
      const diagnostic = await page.evaluate(() => ({pose:window.readPose(),frame:window.lastCameraFrame,
        sourceFrames:window.referenceFrames.length,changedAt:window.stillChangedAt,now:performance.now()}));
      throw new Error(id + ' ' + await panel.innerText() + ' ' + JSON.stringify(diagnostic), {cause: error});
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
  await choose('bothArms');
  const record = panel.getByRole('button', {name: 'Record take', exact: true});
  await frame('lunge-right-arm');
  await panel.getByText('Both arms tracking.', {exact: true}).waitFor();
  await seen('pair right raised', 'rightShoulder', 105, 181, {leftHandY:[null,-0.15]});
  assert.ok(snapshots['pair right raised'].leftHandY < -0.15);
  assert.ok(await record.isEnabled());
  await frame('lunge-left-arm');
  await seen('pair left raised', 'leftHandY', 0.18, 1, {rightShoulder:[null,65]});
  assert.ok(snapshots['pair left raised'].rightShoulder < 65);
  assert.ok(Math.abs(snapshots['pair left raised'].leftHandY - snapshots['left raised'].leftHandY) < 0.08);
  assert.ok(Math.abs(snapshots['pair right raised'].rightShoulder - snapshots['right raised'].rightShoulder) < 12);
  assert.equal(await panel.locator('video').evaluate(v => getComputedStyle(v).transform), 'matrix(-1, 0, 0, 1, 0, 0)');
  await page.evaluate(() => window.useFrame('lunge-right-arm', 'right'));
  await panel.getByText(/Left arm tracking. Bring your right/).waitFor();
  await seen('only left lowers', 'leftHandY', -1, -0.15, {}, {rightShoulder:[null,65]});
  assert.ok(snapshots['only left lowers'].rightShoulder < 65);
  await frame('lunge-right-arm');
  await seen('right reacquired', 'rightShoulder', 105, 181);
  await frame('arm-up');
  await seen('both arms overhead', 'leftHandY', 0.25, 1, {rightShoulder:[115,null]}, {}, true);
  assert.ok(snapshots['both arms overhead'].rightShoulder > 115);
  await page.evaluate(() => window.useFrame('arm-down', 'left'));
  await panel.getByText(/Right arm tracking. Bring your left/).waitFor();
  await seen('only right lowers', 'rightShoulder', 0, 65, {}, {leftHandY:[0.15,null]});
  assert.ok(snapshots['only right lowers'].leftHandY > 0.15);
  await frame(null);
  await panel.getByText(/Face the lens with both shoulders/).waitFor();
  // Two unbent frontal frames alone must never acquire one of the knee controls.
  await choose('leftLeg');
  await frame('standing');
  await page.waitForTimeout(900);
  assert.match(await panel.innerText(), /First show a clear bend/);
  await frame('kick-1580');
  await panel.getByText('Left knee tracking.', {exact:true}).waitFor();
  await seen('left bent knee', 'leftKnee', -135.5, -75);
  await frame('kick-1600');
  await seen('left extended knee', 'leftKnee', -40, 1);
  await page.keyboard.press('3');
  await page.waitForFunction(() => document.querySelector('#ns-motion-camera select').value === 'rightLeg', null, wait);
  await panel.getByText('Right knee tracking.', {exact:true}).waitFor();
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
    assert.match(await panel.innerText(), /Show shoulders, hips, your right knee and ankle/);
    assert.ok(Math.abs((await page.evaluate(() => window.readPose())).rightKnee - beforeMask) < 3);
  }
  await frame(null);
  await page.getByText(/Show shoulders, hips, your right knee and ankle/).waitFor();
  await frame('standing');
  await page.waitForTimeout(900);
  assert.match(await panel.innerText(), /First show a clear bend/);
  await choose('bothKnees');
  await frame('kick-1580');
  await panel.getByText(/^Left knee tracking\. Show a clear bend with your right|^Both knees tracking\.$/).waitFor();
  await seen('pair first left bend', 'leftKnee', -135.5, -75);
  await frame('kick-1600');
  await panel.getByText('Both knees tracking.', {exact:true}).waitFor();
  await seen('pair right bent', 'rightKnee', -135.5, -80, {leftKnee:[-40,null]});
  assert.ok(snapshots['pair right bent'].leftKnee > -40);
  assert.ok(await record.isEnabled());
  await frame('kick-1580');
  await seen('pair left bent', 'leftKnee', -135.5, -75, {rightKnee:[-55,null]});
  assert.ok(snapshots['pair left bent'].rightKnee > -55);
  // Each mask hides the foot of the straightening leg. Only the other,
  // bending leg should change on screen.
  await page.evaluate(() => window.useFrame('kick-1600', 'left-foot'));
  await panel.getByText(/Right knee tracking. Show a clear bend with your left/).waitFor();
  await seen('covered left foot', 'rightKnee', -135.5, -80);
  assert.ok(Math.abs(snapshots['covered left foot'].leftKnee - snapshots['pair left bent'].leftKnee) < 5);
  await checkReleasedKnee('leftKnee', /Right knee tracking. Show a clear bend with your left/);
  await frame('kick-1600');
  await page.waitForTimeout(750);
  // The straight left knee cannot reacquire itself after a long gap.
  assert.match(await panel.innerText(), /Right knee tracking. Show a clear bend with your left/);
  await frame('kick-1580');
  await panel.getByText('Both knees tracking.', {exact:true}).waitFor();
  await frame('kick-1600');
  await seen('left reacquired and extended', 'leftKnee', -40, 1);
  await page.evaluate(() => window.useFrame('kick-1580', 'right-foot'));
  await panel.getByText(/Left knee tracking. Show a clear bend with your right/).waitFor();
  await seen('covered right foot', 'leftKnee', -135.5, -75);
  assert.ok(Math.abs(snapshots['covered right foot'].rightKnee - snapshots['left reacquired and extended'].rightKnee) < 5);
  await checkReleasedKnee('rightKnee', /Left knee tracking. Show a clear bend with your right/);
  await frame('kick-1600');
  await panel.getByText('Both knees tracking.', {exact:true}).waitFor();
  await frame('kick-1580');
  await seen('right reacquired and extended', 'rightKnee', -55, 1);
  await checkFootSwap('kick-1600', 'left-foot', 'leftKnee');
  await seen('right bends with left covered', 'rightKnee', -135.5, -80);
  await checkFootSwap('kick-1580', 'right-foot', 'rightKnee');
  await seen('left bends with right covered', 'leftKnee', -135.5, -75);
  await checkFootSwap('kick-1600', 'left-foot', 'leftKnee');
  await panel.getByText(/Right knee tracking. Show a clear bend with your left/).waitFor();
  await page.evaluate(() => window.useFrame('kick-1580', true));
  await panel.getByText(/Keep your shoulders, hips, knees and feet in view/).waitFor();
  const beforeBlank = await page.evaluate(() => window.readPose());
  await frame(null);
  await page.waitForTimeout(900);
  const afterBlank = await page.evaluate(() => window.readPose());
  assert.ok(Math.abs(beforeBlank.leftKnee - afterBlank.leftKnee) < 3);
  assert.ok(Math.abs(beforeBlank.rightKnee - afterBlank.rightKnee) < 3);
  assert.ok(await record.isDisabled());
  await choose('leftLeg');
  await frame('kick-1580');
  await panel.getByText('Left knee tracking.', {exact:true}).waitFor();
  await frame('kick-1600');
  await seen('single knee after pair', 'leftKnee', -40, 1);
  assert.ok(!await record.isDisabled());
  // A real detector follows the exercise stills into the same private take
  // that the normal F field replays. Start the replay from the opposite pose.
  await choose('bothArms');
  await frame('arm-up');
  await panel.getByText('Both arms tracking.', {exact:true}).waitFor();
  await seen('record left high', 'leftHandY', 0.18, 1);
  await seen('record right high', 'rightShoulder', 105, 181);
  await record.evaluate(button => button.addEventListener('click', () => { window.testTakeStart = performance.now(); }, {once:true, capture:true}));
  await record.click();
  await page.waitForTimeout(750);
  await page.evaluate(() => window.useFrame('arm-down', 'left'));
  await panel.getByText(/Right arm tracking. Bring your left/).waitFor();
  await seen('record only right low', 'rightShoulder', 0, 65);
  const gapStart = await page.evaluate(() => Math.ceil(performance.now() - window.testTakeStart));
  await page.waitForTimeout(850);
  await frame('arm-down');
  await panel.getByText('Both arms tracking.', {exact:true}).waitFor();
  await seen('record left low', 'leftHandY', -1, -0.15);
  await panel.getByRole('button', {name: 'Finish take'}).click();
  const summary = await panel.getByText(/Both arms · .* pose samples .*left, .*right/).innerText();
  const field = page.getByRole('textbox', {name:'Command box'});
  await page.locator('#ns-canvas').press('f');
  await page.locator('[data-named-takes] summary').click();
  await page.getByRole('textbox', {name:'Take name'}).fill('Overhead reach');
  await page.getByRole('button', {name:'Save last take'}).click();
  await page.getByText('Saved “Overhead reach” in this tab.').waitFor();
  await field.fill('replay my left arm take');
  await field.press('Enter');
  await page.getByText(/finished take in this tab is “Both arms”/).waitFor();
  await field.fill('replay my take of both arms');
  await field.press('Enter');
  async function verifyTrace(key) {
    const trace = await page.evaluate(async () => {
      const frames = [];
      while (document.querySelector('#ns-motion-camera').textContent.includes('Stop replay')) {
        const {leftHandY: left, rightShoulder: right} = window.readPose();
        frames.push([performance.now(), left, right]);
        await new Promise(requestAnimationFrame);
      }
      return frames;
    });
    const raised = trace.findIndex(([, l, r]) => l > 0.15 && r > 105);
    const loweredRight = trace.findIndex(([, l, r], i) => i > raised && l > 0.15 && r < 65);
    const lowered = trace.findIndex(([, l, r], i) => i > loweredRight && l < -0.15 && r < 65);
    assert.ok(raised >= 0 && loweredRight > raised && lowered > loweredRight, JSON.stringify({snapshots, summary, trace}));
    snapshots[key] = {summary, raised:trace[raised], rightLow:trace[loweredRight], lowered:trace[lowered]};
  }
  await verifyTrace('replayed real pair');
  await panel.getByText(summary, {exact:true}).waitFor();
  await page.waitForFunction(() => window.virtualTrack.readyState === 'ended', null, wait);
  await panel.getByRole('button', {name: 'Dismiss'}).click();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ns-canvas');
  const before = requests.length;
  await page.locator('#ns-canvas').press('f');
  await field.fill('replay my take');
  await field.press('Enter');
  await page.getByText(/No finished take in this tab/).waitFor();
  await field.fill('Replay take named overhead reach.');
  await field.press('Enter');
  await verifyTrace('named real pair after dismiss');
  await panel.getByText('Replay ended · “Overhead reach”.', {exact:true}).waitFor();
  // Starting in the right-only passage must not re-apply an older left-arm
  // frame. Set both arms high first, then compare the three source passages.
  async function part(range, leftHigh, rightHigh, leftMissing = false) {
    await page.locator('#ns-canvas').press('f');
    await field.fill('replay ' + range + ' of take named overhead reach');
    await field.press('Enter');
    const trace = await page.evaluate(async () => {
      const points = [];
      while (document.querySelector('#ns-motion-camera').textContent.includes('Stop replay')) {
        const {leftHandY, rightShoulder} = window.readPose();
        points.push([performance.now(), leftHandY, rightShoulder]);
        await new Promise(requestAnimationFrame);
      }
      return points;
    });
    const leftMatches = y => leftHigh ? y > 0.15 : y < -0.15;
    const matched = trace.find(([,y,r]) => leftMatches(y) && (rightHigh ? r > 105 : r < 65));
    assert.ok(matched, JSON.stringify({range,leftHigh,rightHigh,trace}));
    if (leftMissing) assert.ok(trace.every(([,y]) => leftMatches(y)), JSON.stringify(trace));
    snapshots[range + (leftHigh ? ' left high' : ' left low')] = {frames:trace.length, matched};
    await panel.getByText('Replay ended · “Overhead reach”.', {exact:true}).waitFor();
  }
  const rightOnly = gapStart / 1000 + ' to ' + (gapStart + 650) / 1000 + ' seconds';
  await part('first 0.7 seconds', true, true);
  await part(rightOnly, true, false, true);
  await part('last 0.6 seconds', false, false);
  // Begin in the identical gap with the left arm down. It must stay down.
  await part(rightOnly, false, false, true);
  assert.deepEqual(requests.slice(before), []);
  // Drive the same drawn body with both arm solvers and both knee joints.
  await page.evaluate(() => clearInterval(window.drawTimer));
  await page.locator('#ns-canvas').press('c');
  await choose('armsAndKnees');
  // The drawn rig keeps the last position of a hidden limb. Wait for the
  // camera to confirm that both knees have acquired their new bends before
  // switching to a straight-leg image, which cannot start knee calibration.
  const bothKneesTracking = panel.getByText(/^Following .*left knee, right knee\.|^Both arms and knees tracking\.$/);
  await frame('lunge-left-arm');
  await bothKneesTracking.waitFor();
  await seen('four left reach', 'leftHandY', .18, 1);
  await seen('four bent knees', 'leftKnee', -135.5, -75, {rightKnee:[null,-75],leftHandY:[.18,1]});
  assert.ok(snapshots['four bent knees'].rightKnee < -75);
  await frame('arm-up');
  await panel.getByText('Both arms and knees tracking.', {exact:true}).waitFor();
  await seen('four overhead', 'leftHandY', .25, 1, {rightShoulder:[115,null],leftKnee:[-40,null],rightKnee:[-40,null]}, {}, true);
  assert.ok(snapshots['four overhead'].rightShoulder > 115);
  assert.ok(snapshots['four overhead'].leftKnee > -40 && snapshots['four overhead'].rightKnee > -40);

  // A covered limb must stay put when the other limbs change.
  await page.evaluate(() => window.useFrame('arm-down', 'left'));
  await panel.getByText(/^Following right arm, left knee, right knee\./).waitFor();
  await seen('four left wrist hidden', 'rightShoulder', 0, 65, {}, {leftHandY:[.25,null]});
  assert.ok(snapshots['four left wrist hidden'].leftHandY > .25);
  await page.evaluate(() => window.useFrame('lunge-right-arm', 'right'));
  await panel.getByText(/^Following left arm, left knee, right knee\./).waitFor();
  await seen('four right wrist hidden', 'leftHandY', -1, -.15, {}, {rightShoulder:[null,65]});
  assert.ok(snapshots['four right wrist hidden'].rightShoulder < 65);

  await frame('arm-up');
  await panel.getByText('Both arms and knees tracking.', {exact:true}).waitFor();
  await seen('four before take', 'rightShoulder', 115, 181);
  await record.click();
  await page.waitForTimeout(550);
  await page.evaluate(() => window.useFrame('kick-1580', 'right-foot'));
  await panel.getByText(/^Following left arm, right arm, left knee\./).waitFor();
  await seen('four right foot hidden', 'leftKnee', -135.5, -75, {leftHandY:[null,-.15],rightShoulder:[null,65]}, {rightKnee:[-40,null]});
  const firstKick = snapshots['four right foot hidden'];
  assert.ok(firstKick.rightKnee > -40 && firstKick.leftHandY < -.15 && firstKick.rightShoulder < 65);
  await page.evaluate(() => window.useFrame('kick-1600', 'left-foot'));
  await panel.getByText(/^Following right knee\./).waitFor();
  await seen('four left foot hidden', 'rightKnee', -135.5, -80);
  assert.ok(Math.abs(snapshots['four left foot hidden'].leftKnee - firstKick.leftKnee) < 5);
  await frame(null);
  await panel.getByText(/^Keep shoulders, elbows, wrists/).waitFor();
  await page.waitForTimeout(700);
  await frame('lunge-left-arm');
  await bothKneesTracking.waitFor();
  await seen('four second clear bend', 'leftHandY', .18, 1);
  await frame('arm-down');
  await panel.getByText('Both arms and knees tracking.', {exact:true}).waitFor();
  await seen('four finish', 'leftHandY', -1, -.15, {rightShoulder:[null,65],leftKnee:[-40,null],rightKnee:[-40,null]}, {}, true);
  const finishedFour = panel.getByText(/Both arms and knees · .* pose samples \(\d+ left arm, \d+ right arm, \d+ left knee, \d+ right knee\)/);
  // A long test frame can put the built-in eight-second finish between the
  // last measured posture and this click. Accept only its exact saved summary.
  try {
    await panel.getByRole('button', {name:'Finish take'}).click({timeout:2000});
  } catch (error) {
    if (error.name !== 'TimeoutError' || !await finishedFour.isVisible()) throw error;
    assert.match(await finishedFour.innerText(), /Both arms and knees · 8\.0 s ·/);
  }
  const fourSummary = await finishedFour.innerText();
  const counts = [...fourSummary.matchAll(/(\d+) (?:left|right) (?:arm|knee)/g)].map(match => Number(match[1]));
  assert.equal(counts.length,4);
  assert.ok(counts.every(count => count >= 2));
  assert.equal(await page.evaluate(() => window.virtualTrack.readyState), 'ended');
  await page.locator('#ns-canvas').press('f');
  await field.fill('Replay my whole-body take.');
  await field.press('Enter');
  const trace = await page.evaluate(async () => {
    const frames = [];
    while (document.querySelector('#ns-motion-camera').textContent.includes('Stop replay')) {
      frames.push(window.readPose());
      await new Promise(requestAnimationFrame);
    }
    return frames;
  });
  const high = trace.findIndex(p => p.leftHandY > .25 && p.rightShoulder > 115 && p.leftKnee > -40 && p.rightKnee > -40);
  const kickLeft = trace.findIndex((p,i) => i > high && p.leftHandY < -.15 && p.rightShoulder < 65 && p.leftKnee < -75 && p.rightKnee > -40);
  const kickRight = trace.findIndex((p,i) => i > kickLeft && p.leftKnee < -75 && p.rightKnee < -80);
  const low = trace.findIndex((p,i) => i > kickRight && p.leftHandY < -.15 && p.rightShoulder < 65 && p.leftKnee > -40 && p.rightKnee > -40);
  assert.ok(high >= 0 && kickLeft > high && kickRight > kickLeft && low > kickRight, JSON.stringify(trace));
  snapshots['four replay'] = {fourSummary, frames:trace.length, high:trace[high], first:trace[kickLeft], second:trace[kickRight], low:trace[low]};
  await panel.getByText(fourSummary, {exact:true}).waitFor();
  await page.evaluate(() => clearInterval(window.drawTimer));
  assert.deepEqual(await page.evaluate(() => window.captureCalls.map(call => call.audio)), [false,false]);
  snapshots.workerCounts = await page.evaluate(() => window.workerCounts);
  const {starts, maximum, active, maxActive, inFlight} = snapshots.workerCounts;
  assert.deepEqual([starts, maximum, active, maxActive, inFlight], [2, 1, 0, 1, 0]);
  assert.deepEqual(external, []);
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(snapshots, null, 2));
} finally {
  await browser?.close();
  server.close();
}
