// Run with Node and Playwright. NS_RAW=1 refuses the mesh-pack index.
// NS_REDUCED=1 runs both views with the system reduced-motion preference.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = process.env.NS_TEST_ROOT
  ? resolve(process.env.NS_TEST_ROOT)
  : fileURLToPath(new URL('../', import.meta.url));
const { createHandler, HOST } = await import(pathToFileURL(resolve(root, 'serve-local.mjs')));
const { chromium } = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const allowedHosts = new Set();
const server = createServer(createHandler({ root, allowedHosts }));
server.listen(0, HOST);
await once(server, 'listening');
const host = HOST + ':' + server.address().port;
allowedHosts.add(host);
const args = ['--disable-background-networking'];
if (process.env.NS_ANGLE) args.push('--use-angle=' + process.env.NS_ANGLE);
const raw = process.env.NS_RAW === '1';
const reduced = process.env.NS_REDUCED === '1';
const assets = { packed: 0, raw: 0, refused: 0 };
const errors = [];
const report = { raw, reduced, assets, errors, views: [] };
let browser;

try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  report.chromium = browser.version();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 },
    reducedMotion: reduced ? 'reduce' : 'no-preference' });
  page.setDefaultTimeout(45_000);
  page.on('pageerror', error => errors.push(String(error)));
  page.on('response', response => {
    if (!response.ok()) return;
    const path = new URL(response.url()).pathname;
    if (path.endsWith('.nspack')) assets.packed++;
    if (path.endsWith('.obj')) assets.raw++;
  });
  if (raw) await page.route('**/packs/PACK-INDEX.json', route => {
    assets.refused++;
    return route.abort();
  });
  await page.goto('http://' + host + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForURL('**/scene/example/preview.html');
  await page.waitForFunction(() => document.querySelector('#ns-app')?.dataset.nsPhase === 'playing');
  report.graphics = await page.evaluate(async () => {
    // Read the actual perspective projection passed to a WebGL pass. Leave game input and draw state to the game.
    const { Scene } = await import(new URL('../../vendor/three.module.js', location.href).href);
    const original = Scene.prototype.onAfterRender;
    let last = null, low = null, high = null, drawn = 0;
    let tongue = null, peakTongueGlow = 0;
    Scene.prototype.onAfterRender = function (renderer, scene, camera) {
      if (camera.isPerspectiveCamera && renderer.domElement.id === 'ns-canvas') {
        if (!tongue) scene.traverse(object => {
          if (object.name.startsWith('motor region: rh_tongue (')) tongue = object;
        });
        const p = camera.projectionMatrix.elements;
        const emission = tongue?.material?.emissive;
        last = { fov: camera.fov, focalY: p[5], principal: [p[8], p[9]],
          position: camera.position.toArray(), orientation: camera.quaternion.toArray(),
          tongueGlow: emission ? emission.r + emission.g + emission.b : null,
          triangles: renderer.info.render.triangles };
        if (!low || last.fov < low.fov) low = last;
        if (!high || last.fov > high.fov) high = last;
        peakTongueGlow = Math.max(peakTongueGlow, last.tongueGlow ?? 0);
        drawn++;
      }
      return original.apply(this, arguments);
    };
    window.readPunchFrames = (reset = false) => {
      if (reset) { low = last; high = last; peakTongueGlow = last?.tongueGlow ?? 0; drawn = 0; }
      return { last, low, high, peakTongueGlow, drawn };
    };
    const state = window.__nsQA.inspect();
    const gl = document.querySelector('#ns-canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return { healthy: state.phase === 'running' && state.features.bodyRig && !state.placeholder && !state.qa,
      webgl: !!gl && !gl.isContextLost(),
      renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null };
  });
  assert.ok(report.graphics.healthy && report.graphics.webgl);
  if (process.env.NS_ANGLE === 'vulkan') assert.match(report.graphics.renderer, /Vulkan/);
  const waitForPulseEnd = () => page.waitForFunction(() => {
    const a = window.__nsQA.inspect().state.activity;
    return a.t > (a.lastTriggerAt ?? 0) + 1.25;
  }, null, { polling: 60, timeout: 9000 });
  const repeatSelectedRegion = () => page.mouse.click(800, 450, { modifiers: ['Shift'] });

  async function sampleView(name, key) {
    const before = await page.evaluate(() => {
      const s = window.__nsQA.inspect({ arrowTrace: true });
      return { trigger: s.state.trigger.seq, render: window.readPunchFrames(true).last,
        pickingFov: s.arrowTrace.value.activeCamera.fovYDeg, settings: s.settings };
    });
    assert.ok(before.render?.triangles > 10000, 'actual anatomy draw observed');
    await page.keyboard.press(key);
    await page.waitForFunction(seq => window.__nsQA.inspect().state.trigger.seq > seq, before.trigger,
      { polling: 40, timeout: 5000 });
    const during = await page.evaluate(() => {
      const s = window.__nsQA.inspect({ arrowTrace: true });
      const a = s.state.activity;
      return { trigger: s.state.trigger, area: s.areaStep.to, projection: s.arrowTrace.value.activeCamera.fovYDeg,
        activityClock: a.t, triggerAt: a.lastTriggerAt,
        motion: { arm: a.pulseAction, body: a.pulseBody, rotation: a.pulseRotation },
        render: window.readPunchFrames().last };
    });
    await page.waitForFunction(t => window.__nsQA.inspect().state.activity.t >= t + 1.25, during.triggerAt,
      { polling: 60, timeout: 8000 });
    const after = await page.evaluate(() => {
      const s = window.__nsQA.inspect({ arrowTrace: true });
      return { recording: window.readPunchFrames(), pickingFov: s.arrowTrace.value.activeCamera.fovYDeg,
        view: s.camera.pose.firstPerson ? 'eye' : 'outside', setting: s.settings, look: s.state.gaze.regionId };
    });
    assert.equal(after.view, name);
    assert.equal(during.trigger.regionId, during.area);
    assert.ok(during.trigger.actionId, 'the sampled area supplies a movement');
    assert.deepEqual(during.motion, { arm: null, body: 'rh_throat/rh_swallow', rotation: null });
    assert.equal(during.projection, during.render.fov, 'picking and the displayed image use the same lens');
    assert.equal(after.pickingFov, after.recording.last.fov);
    assert.deepEqual(after.recording.low.principal, before.render.principal, 'the punch leaves the crosshair centre fixed');
    assert.ok(after.recording.drawn > 5);
    assert.deepEqual(after.setting, before.settings);
    assert.ok(Math.abs(after.recording.last.fov - before.render.fov) < 0.01, 'returns to the original lens');
    const scaleAtPeak = before.render.focalY / after.recording.low.focalY;
    report.views.push({ name, before, during, after, scaleAtPeak });
  }

  await page.waitForFunction(() => window.readPunchFrames().last?.triangles > 10000);
  await page.mouse.click(800, 450);
  await page.waitForFunction(() => document.pointerLockElement?.id === 'ns-canvas');
  await waitForPulseEnd();
  await sampleView('eye', 'ArrowRight');
  await page.keyboard.press('e');
  await page.waitForFunction(() => {
    const pose = window.__nsQA.inspect().camera.pose;
    return pose.thirdPerson && !pose.moving;
  }, null, { polling: 60 });
  // Step beyond the first sampled area so both views can activate the same movement.
  const seq = await page.evaluate(() => window.__nsQA.inspect().state.trigger.seq);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(seq => window.__nsQA.inspect().state.trigger.seq > seq, seq,
    { polling: 60, timeout: 5000 });
  await waitForPulseEnd();
  const displayBefore = await page.evaluate(() => {
    const s = window.__nsQA.inspect();
    return { area: s.state.gaze.regionId, seq: s.state.trigger.seq, joints: s.bodyJointTargets,
      render: window.readPunchFrames(true).last };
  });
  assert.equal(displayBefore.area, 'rh_tongue');
  await repeatSelectedRegion();
  await page.waitForFunction(seq => {
    const s = window.__nsQA.inspect();
    return s.state.trigger.seq > seq && s.state.activity.regionDisplay.rh_tongue > 0;
  }, displayBefore.seq, { polling: 40, timeout: 5000 });
  const displayActive = await page.evaluate(() => {
    const s = window.__nsQA.inspect({ arrowTrace: true });
    const a = s.state.activity;
    return { trigger: s.state.trigger, frontPick: s.controlTargets.front, remaining: a.pulseRemaining,
      motion: { arm: a.pulseAction, body: a.pulseBody, rotation: a.pulseRotation },
      shine: a.regionDisplay.rh_tongue, joints: s.bodyJointTargets,
      pickingFov: s.arrowTrace.value.activeCamera.fovYDeg };
  });
  await waitForPulseEnd();
  const displayAfter = await page.evaluate(() => ({
    joints: window.__nsQA.inspect().bodyJointTargets, recording: window.readPunchFrames()
  }));
  report.displayOnly = { before: displayBefore, active: displayActive, after: displayAfter };
  assert.equal(displayActive.trigger.regionId, 'rh_tongue');
  assert.equal(displayActive.trigger.source, 'click');
  assert.equal(displayActive.frontPick, 'brain:area:rh_tongue');
  assert.equal(displayActive.trigger.actionId, null);
  assert.ok(displayActive.remaining > 0 && displayActive.shine > 0);
  assert.deepEqual(displayActive.motion, { arm: null, body: null, rotation: null });
  assert.deepEqual(displayActive.joints, displayBefore.joints);
  assert.deepEqual(displayAfter.joints, displayBefore.joints);
  assert.ok(displayAfter.recording.drawn > 5);
  assert.ok(displayBefore.render.tongueGlow !== null);
  assert.ok(displayAfter.recording.peakTongueGlow > displayBefore.render.tongueGlow, 'the drawn marker lights up');
  assert.equal(displayAfter.recording.low.fov, displayBefore.render.fov, 'a highlight alone keeps the lens steady');
  assert.equal(displayAfter.recording.high.fov, displayBefore.render.fov);
  assert.equal(displayActive.pickingFov, displayBefore.render.fov);

  await sampleView('outside', 'ArrowLeft');
  assert.equal(report.views[1].during.trigger.actionId, report.views[0].during.trigger.actionId);

  if (raw) {
    assert.ok(assets.refused && assets.raw);
    assert.equal(assets.packed, 0);
  } else {
    assert.ok(assets.packed);
    assert.equal(assets.raw, 0);
  }
  for (const { name, scaleAtPeak } of report.views) {
    if (reduced) assert.ok(Math.abs(scaleAtPeak - 1) < 0.001, name + ' respects reduced motion');
    else assert.ok(scaleAtPeak >= 0.958 && scaleAtPeak <= 0.975, name + ' receives the brief lens punch');
  }

  if (!reduced) {
    const rest = report.views[1].before.render.fov;
    await repeatSelectedRegion();
    await page.waitForFunction(fov => window.readPunchFrames().last.fov < fov - 0.1, rest,
      { polling: 20, timeout: 5000 });
    const active = await page.evaluate(() => window.__nsQA.inspect().state.activity.pulseSeq);
    await page.keyboard.press('Escape');
    await page.waitForFunction(fov => window.__nsQA.inspect().shell.mode === 'paused'
      && window.readPunchFrames().last.fov === fov, rest, { polling: 40, timeout: 5000 });
    await page.evaluate(() => window.readPunchFrames(true));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__nsQA.inspect().shell.mode === 'playing'
      && window.readPunchFrames().drawn >= 10, null, { polling: 40, timeout: 5000 });
    report.pause = await page.evaluate(() => ({
      pulse: window.__nsQA.inspect().state.activity.pulseSeq,
      restartedFov: window.readPunchFrames().low.fov
    }));
    assert.equal(report.pause.pulse, active, 'resuming preserves the original simulated pulse');
    assert.equal(report.pause.restartedFov, rest, 'resuming does not repeat the old lens punch');
  }
  assert.deepEqual(errors, []);
} finally {
  console.log(JSON.stringify(report, null, 2));
  if (browser) await browser.close();
  server.close();
  await once(server, 'close');
}
