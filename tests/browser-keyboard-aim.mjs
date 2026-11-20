// Run with Node and Playwright. NS_PLAYWRIGHT_MODULE and NS_CHROMIUM can point to a local installation.
// NS_ANGLE=vulkan selects an installed Vulkan driver on Linux. The test uses the normal game and its assets.
// NS_RAW=1 refuses the pack index and requires real OBJ responses for every normal game load.
// NS_REDUCED=1 runs the first-person framing check with reduced motion enabled.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHandler, HOST } from '../serve-local.mjs';
import { LIMB_KEYS } from '../scene/src/ns-app.mjs';

// 20 November 2026: the view and a newly chosen limb, restated for the current rule (ns-app LIMB_KEYS.view and
// keepInFrameTurn; DESIGN-DECISIONS section 144). This test was written on 19 November for the earlier rule, under which
// choosing a limb turned the view to it and brought its wrist or ankle to the middle of the picture. The owner withdrew
// that the same evening: "Perhaps the problem with the zoom in, zoom out fixes we look up and down is the 3/4 height
// rule. Disregard that rule." Now, after a limb is chosen, its wrist or ankle (its frame point) is inside the picture's
// band, `band` of the half width and `bandUp` of the half height, and the view turns only if it was outside: at the
// start look all four are inside, so choosing a limb there turns nothing.
const { band: limbBand, bandUp: limbBandUp } = LIMB_KEYS.view;
const BAND_SLACK = 0.03; // the turn stops within doneDeg (0.4 degrees) of the band's edge: about 0.014 of the half height
const inLimbBand = (end, slack = 0) => Boolean(end) && Math.abs(end.x) <= limbBand + slack && Math.abs(2 * end.up - 1) <= limbBandUp + slack;

const { chromium } = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const allowedHosts = new Set();
const server = createServer(createHandler({ root, allowedHosts }));
server.listen(0, HOST);
await once(server, 'listening');
const host = `${HOST}:${server.address().port}`;
allowedHosts.add(host);
const width = Number(process.env.NS_WIDTH || 1600);
const height = Number(process.env.NS_HEIGHT || 900);
const raw = process.env.NS_RAW === '1';
const reduced = process.env.NS_REDUCED === '1';
const args = ['--disable-background-networking'];
if (process.env.NS_ANGLE) args.push(`--use-angle=${process.env.NS_ANGLE}`);
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  page.setDefaultTimeout(60_000);
  const limbChoices = page.getByRole('group', { name: /Which limb the keys move/ });
  const chosenLimb = limbChoices.locator('[aria-current="true"]');
  const selected = (key, name) => chosenLimb
    .filter({ has: page.getByText(key, { exact: true }) })
    .filter({ hasText: name });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  const assets = { meshPacks: 0, refusedPackIndexes: 0, rawMeshes: 0 };
  page.on('response', response => {
    if (!response.ok()) return;
    const file = new URL(response.url()).pathname;
    if (file.endsWith('.nspack')) assets.meshPacks++;
    if (file.endsWith('.obj')) assets.rawMeshes++;
  });
  if (raw) await page.route('**/packs/PACK-INDEX.json', route => {
    assets.refusedPackIndexes++;
    return route.abort();
  });
  const inspect = () => page.evaluate(() => {
    const s = window.__nsQA.inspect({ arrowTrace: true });
    const compasses = s.arrowTrace.value;
    const mirrorForward = compasses.mirror.dirs.forward;
    const brainForward = compasses.brain.dirs.forward.retainedDraw;
    const tip = document.querySelector('.ns-tip');
    const gl = document.querySelector('#ns-canvas').getContext('webgl2');
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      frames: s.frames, healthy: s.phase === 'running' && s.features.bodyRig && !s.placeholder && !s.qa,
      input: s.controlTargets, step: s.areaStep, area: s.state.gaze.regionId, camera: s.camera.pose,
      look: { yaw: s.controls.yaw, pitch: s.controls.pitch, time: s.controls.lookMs },
      tip: tip.getClientRects().length ? { kind: tip.dataset.kind, text: tip.innerText } : null, quietArea: s.quietKeys.regionId,
      status: document.querySelector('#ns-hud .ns-slot-gaze').innerText,
      trigger: s.state.trigger, orbit: s.scene.mirror?.orbit, mirrorCentre: s.scene.mirror?.centre,
      mirrorBox: s.scene.mirror?.onScreen?.box,
      thumbOpposition: s.state.activity.drive.thumb_opposition,
      rightArm: ['r_elbow_flex', 'r_shoulder_flex', 'r_shoulder_abd'].map(joint => s.bodyJointTargets[joint]),
      mirrorHover: compasses.mirror.hovered,
      overlapTip: mirrorForward.retainedDraw, overlapClick: mirrorForward.clickPx,
      clearTip: brainForward,
      // each limb's wrist or ankle in the picture (x: -1 .. 1 across, up: 0 .. 1 from the bottom) and the view's turn
      limbs: { turning: s.limbs.turning, ends: Object.fromEntries(Object.entries(s.limbs.ends).map(([limb, e]) => [limb, e && e.inPicture])) },
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
    };
  });
  async function nextFrames(from, count = 4) {
    await page.waitForFunction(({ from, count }) => window.__nsQA.inspect().frames >= from + count, { from, count }, { polling: 80 });
    return inspect();
  }
  async function step(key) {
    const before = await inspect();
    await page.keyboard.press(key);
    await page.waitForFunction(seq => window.__nsQA.inspect().areaStep?.seq > seq,
      before.step?.seq || 0, { polling: 20, timeout: 5_000 });
    const after = await inspect();
    assert.ok(after.step?.to, `${key} did not select an area: ${JSON.stringify(after.step)}`);
    assert.equal(after.area, after.step.to);
    assert.equal(after.tip.kind, 'area');
    assert.equal(after.quietArea, after.area);
    assert.equal(after.input.front, `brain:area:${after.area}`);
    return after;
  }
  async function openPreview() {
    const unloaded = { ...assets };
    await page.goto(`http://${host}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL('**/scene/example/preview.html');
    await page.waitForFunction(() => ['playing', 'error'].includes(document.querySelector('#ns-app')?.dataset.nsPhase));
    if (raw) {
      assert.ok(assets.refusedPackIndexes > unloaded.refusedPackIndexes);
      assert.equal(assets.meshPacks, unloaded.meshPacks);
      assert.ok(assets.rawMeshes > unloaded.rawMeshes);
    } else {
      assert.ok(assets.meshPacks > unloaded.meshPacks);
      assert.equal(assets.rawMeshes, unloaded.rawMeshes);
    }
    const initial = await inspect();
    assert.ok(initial.healthy);
    assert.ok(initial.camera.firstPerson);
    if (process.env.NS_ANGLE === 'vulkan') assert.match(initial.renderer, /Vulkan/);
    return initial;
  }

  async function releasePointer() {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.pointerLockElement && window.__nsQA.inspect().shell.mode === 'paused');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.pointerLockElement && window.__nsQA.inspect().shell.mode === 'playing');
  }

  async function pointAtMirror() {
    const box = (await inspect()).mirrorBox;
    assert.ok(box?.every(Number.isFinite), 'the current mirror body projects into the view');
    const [x0, y0, x1, y1] = box;
    for (const row of [0.35, 0.2, 0.5, 0.65]) for (const col of [0.5, 0.38, 0.62]) {
      const x = x0 + col * (x1 - x0);
      const y = y0 + row * (y1 - y0);
      if (x <= 0 || x >= width || y <= 0 || y >= height) continue;
      const before = (await inspect()).frames;
      await page.mouse.move(x, y);
      const pointed = await nextFrames(before, 3);
      if (pointed.input.at !== 'pointer' || !pointed.input.front?.startsWith('mirror:') || pointed.input.arrow) continue;
      const stable = await nextFrames(pointed.frames, 4);
      if (stable.input.at === 'pointer' && stable.input.front?.startsWith('mirror:') && !stable.input.arrow) return [x, y];
    }
    assert.fail('no visible mirror-body surface inside its current projected bounds');
  }

  async function waitForMirror() {
    try {
      await page.waitForFunction(() => {
        const carry = window.__nsQA.inspect().state.objectCarry;
        return carry?.held && carry.target === 'mirror';
      }, null, { timeout: 5_000 });
    } catch (error) {
      const info = await page.evaluate(() => {
        const state = window.__nsQA.inspect();
        return { focus: document.activeElement.outerHTML.slice(0, 200), controls: state.controls, carry: state.state.objectCarry, picked: state.controlTargets };
      });
      console.log(JSON.stringify({ case: 'visible mirror hold failed', info }));
      throw error;
    }
  }

  async function moveMirror(dx, dy, returnPoint = null) {
    await releasePointer();
    const [x, y] = await pointAtMirror();
    const before = await inspect();
    await page.keyboard.down('Space');
    await waitForMirror();
    await page.waitForFunction(() => document.pointerLockElement?.id === 'ns-canvas', null, { timeout: 5_000 });
    await page.mouse.move(x + dx, y + dy);
    await nextFrames(before.frames, 8);
    await page.waitForTimeout(300); // Past the tap-to-keep threshold.
    await page.keyboard.up('Space');
    await page.waitForFunction(() => !window.__nsQA.inspect().state.objectCarry.held);
    const displaced = await inspect();
    assert.notDeepEqual(displaced.mirrorCentre, before.mirrorCentre);
    await page.mouse.move(...(returnPoint || [x, y]));
    return nextFrames(displaced.frames, 8);
  }

  async function aim() {
    const initial = await openPreview();
    await page.mouse.click(width / 2, height / 2);
    await page.waitForFunction(() => document.pointerLockElement?.id === 'ns-canvas');

    const firstRight = await step('ArrowRight');
    const firstLeft = await step('ArrowLeft');
    assert.equal(firstLeft.step.from, firstRight.area);
    assert.notEqual(firstLeft.area, firstRight.area);
    await page.keyboard.press('e');
    await page.waitForFunction(() => {
      const pose = window.__nsQA.inspect().camera.pose;
      return pose.thirdPerson && !pose.moving;
    }, null, { polling: 80 });
    const third = await inspect();
    assert.equal(third.step.to, firstLeft.area);

    // Lift the visible mirror body, then find a motor area whose movement leaves the camera steady.
    await moveMirror(50, -50, [width / 2, height / 2]);

    // 20 November 2026 (ns-app areaWalkCardId): the look is now off the brain, so the walk goes on from the card's area,
    // the area stepped to before the carry (the left end of the walk on the screen). This walk used to go LEFT: it
    // pressed its key 8 frames after the carry, while the Space grip's card (the left hand's area) was still shown
    // for 0.6 s after Space let go, and walked on from the hand's area. On a busy machine 8 frames outlast that window,
    // the walk started at its own end and the key found nothing ("tests 0"). The grip card no longer counts as a place
    // looked at, so the walk starts where it was on any machine, and goes RIGHT to the thumb area (as before the carry
    // was added here). On the way it lands on the neck area, whose movement moves the head for about 1.6 s: the next
    // key waits until the head is still (ns-app AREA_REQUEST_KEEP_MS; it used to be dropped after 1 s).
    let covered = await step('ArrowRight');
    assert.equal(covered.step.from, firstLeft.area, 'after the carry the walk goes on from the area stepped to before it');
    for (let i = 0; i < 20 && covered.area !== 'rh_thumb'; i++) {
      const previous = covered.area;
      covered = await step('ArrowRight');
      assert.equal(covered.step.from, previous);
    }
    assert.equal(covered.area, 'rh_thumb', 'the real outside-view strip walk reaches the left thumb area');
    const gazeLine = page.locator('#ns-hud .ns-slot-gaze').filter({ hasText: /^Looking at \(motor area\): Left thumb\b/ });
    await gazeLine.waitFor({ state: 'attached', timeout: 5_000 });
    await page.waitForFunction(
      rest => window.__nsQA.inspect().state.activity.drive.thumb_opposition > rest,
      initial.thumbOpposition, { polling: 80, timeout: 5_000 });
    covered = await inspect();
    // Move the drawn forward tip toward the same crosshair. A pointer carry restores the previous look on release.
    // Each correction uses part of the measured screen error because the camera moves with the look during a carry.
    for (let n = 0; n < 4 && (!covered.input.arrow || covered.mirrorHover !== 'forward'); n++) {
      assert.ok(covered.overlapClick?.every(Number.isFinite));
      const dx = Math.round((width / 2 - covered.overlapClick[0]) * 0.42);
      const dy = Math.round((height / 2 - covered.overlapClick[1]) * 0.42);
      covered = await moveMirror(dx, dy);
    }
    assert.equal(covered.mirrorHover, 'forward', 'the carried mirror tip reaches the actual thumb ray');
    // Pointer movement releases keyboard aim. Step away from the area now under the compass tip and then back to it.
    if (covered.area !== 'rh_thumb') {
      const adjacent = await step('ArrowRight');
      assert.equal(adjacent.step.from, 'rh_thumb');
      assert.equal(adjacent.area, 'rh_index');
      covered = await step('ArrowLeft');
      assert.equal(covered.step.from, adjacent.area);
      // 20 November 2026: read the tip's hover from the next frames, not from the step's own frame. A frame finds the
      // tip under the crosshair (arrowHitAt, for the hover) before it applies the camera of that frame's look, and the
      // outside view's camera turns with the look, so the hover follows a step one frame later; controlTargets is picked
      // again after the camera. Recorded frame by frame on a busy machine: the step back to the thumb area at frame 337
      // with input.arrow true and the hover still null, the hover 'forward' from frame 338 on (and on the step away,
      // frame 333, the hover still 'forward'). This test read the step's own frame when the machine was busy.
      covered = await nextFrames(covered.frames, 2);
    }
    assert.equal(covered.area, 'rh_thumb');
    assert.equal(covered.input.arrow, true, 'the regression path must include an actual orbit tip');
    assert.equal(covered.mirrorHover, 'forward');
    assert.equal(covered.input.front, 'brain:area:rh_thumb');
    assert.equal(covered.overlapTip.rootVisible, true);
    assert.equal(covered.overlapTip.meshVisible, true);
    assert.equal(covered.overlapTip.boxOverlapsMotorArea, true);
    assert.ok(covered.overlapTip.opacityScale > 0 && covered.overlapTip.opacityScale < 0.5);
    assert.equal(covered.clearTip.rootVisible, true);
    assert.equal(covered.clearTip.opacityScale, 1);
    assert.match(covered.tip.text, /Click follows the arrow\. Shift-click presses this area\./);
    assert.match(covered.status, /Looking at \(motor area\)/);
    assert.equal(covered.trigger.source, 'gaze', 'A motor-area look makes a keyboard look activate its area');
    assert.equal(covered.trigger.regionId, covered.area);
    assert.ok(covered.trigger.seq > third.trigger.seq);
    assert.ok(covered.thumbOpposition > initial.thumbOpposition, 'the keyboard look drives the simulated thumb turn');
    return { initial, third, covered };
  }

  async function checkLimbFraming() {
    const initial = await openPreview();
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), reduced);
    await selected('1', 'Left arm').waitFor();
    const framed = [];
    // One choice; `before` was read just before the key. With the pointer free, the pointer is then put on the limb's
    // own wrist or ankle and must find that limb (20 November 2026: it was put at the middle of the picture, 0.6 of the
    // way up, where the earlier rule's turn brought the end).
    async function chooseAndFrame(key, name, limb, before, pointerFree) {
      const wasInBand = inLimbBand(before.limbs.ends[limb]);
      await page.keyboard.press(key);
      await selected(key, name).waitFor({ timeout: 5_000 });
      let early = null;
      if (!wasInBand) {
        await page.waitForFunction(look => {
          const c = window.__nsQA.inspect().controls;
          return Math.hypot(c.yaw - look.yaw, c.pitch - look.pitch) > 0.03;
        }, before.look, { polling: 20 });
        early = await inspect();
      }
      await page.waitForTimeout(950); // One framing turn takes at most 900 ms.
      // (20 November 2026: the turn now ends when the end is within doneDeg of the band, or after LIMB_KEYS.view.maxS)
      await page.waitForFunction(() => !window.__nsQA.inspect().limbs.turning, null, { polling: 20, timeout: 5_000 });
      let settled = await nextFrames((await inspect()).frames);
      const end = settled.limbs.ends[limb];
      if (wasInBand) {
        assert.deepEqual([settled.look.yaw, settled.look.pitch], [before.look.yaw, before.look.pitch],
          `${name}: its wrist or ankle was inside the picture's band, so choosing it leaves the view where it was`);
      }
      assert.ok(inLimbBand(end, BAND_SLACK), `${name}: its wrist or ankle is inside the picture's band: ${JSON.stringify(end)}`);
      if (pointerFree) {
        await page.mouse.move((1 + end.x) / 2 * width, (1 - end.up) * height);
        settled = await nextFrames(settled.frames);
        assert.equal(settled.input.at, 'pointer');
        assert.match(settled.input.front, new RegExp(`^own:(?:bone|muscle):${limb}$`));
      }
      assert.equal(settled.camera.firstPerson, true);
      assert.equal(settled.trigger.seq, before.trigger.seq);
      if (early) {
        const correction = Math.hypot(settled.look.yaw - early.look.yaw, settled.look.pitch - early.look.pitch);
        if (reduced) assert.ok(correction < 0.05, 'reduced motion must make the main turn immediately');
      }
      framed.push({ key, turned: !wasInBand, before: before.look, early: early?.look ?? null, settled: settled.look, end, hit: settled.input.front });
      return settled;
    }
    for (const [key, name, limb] of [
      ['2', 'Left leg', 'leftLeg'], ['3', 'Right leg', 'rightLeg'], ['4', 'Right arm', 'rightArm'], ['1', 'Left arm', 'leftArm']
    ]) {
      const before = await inspect();
      assert.equal(before.trigger.seq, initial.trigger.seq);
      await chooseAndFrame(key, name, limb, before, true);
    }
    // A choice whose wrist or ankle is outside the band turns the view, just far enough. Look up (the pointer captured)
    // until both ankles have left the picture's band, then choose the right leg.
    await page.mouse.click(width / 2, height / 2);
    await page.waitForFunction(() => document.pointerLockElement?.id === 'ns-canvas');
    const pointer = { x: width / 2, y: height / 2 };
    async function lookBy(dx, dy, steps = 10) {
      const from = await inspect();
      for (let i = 0; i < steps; i++) {
        pointer.x += dx / steps; pointer.y += dy / steps;
        await page.mouse.move(pointer.x, pointer.y);
      }
      await page.waitForFunction(time => window.__nsQA.inspect().controls.lookMs !== time, from.look.time, { polling: 20 });
      return nextFrames((await inspect()).frames, 8);
    }
    const away = await lookBy(0, -250);
    assert.ok(!inLimbBand(away.limbs.ends.rightLeg), `looking up takes the right ankle out of the band: ${JSON.stringify(away.limbs.ends.rightLeg)}`);
    const reframed = await chooseAndFrame('3', 'Right leg', 'rightLeg', away, false);
    assert.ok(reframed.look.pitch < away.look.pitch, 'the view turned down toward the right ankle');
    // The pointer takes the look back at any moment: look up again so that the left ankle (the right leg, now chosen,
    // goes with the look) is outside the band, choose the left leg, and move the pointer while the view turns to it.
    const awayAgain = await lookBy(0, -250);
    assert.ok(!inLimbBand(awayAgain.limbs.ends.leftLeg), `looking up takes the left ankle out of the band: ${JSON.stringify(awayAgain.limbs.ends.leftLeg)}`);
    await page.keyboard.press('2');
    await selected('2', 'Left leg').waitFor({ timeout: 5_000 });
    const automatic = await inspect();
    if (!reduced) assert.equal(automatic.limbs.turning, true, 'the view is turning toward the left ankle when the pointer moves');
    pointer.x += 100; pointer.y -= 45;
    await page.mouse.move(pointer.x, pointer.y);
    await page.waitForFunction(time => window.__nsQA.inspect().controls.lookMs !== time, automatic.look.time, { polling: 20 });
    const manual = await inspect();
    assert.notEqual(manual.look.yaw, automatic.look.yaw);
    await page.waitForTimeout(950);
    assert.deepEqual((await inspect()).look, manual.look, 'the selected limb never retakes the look after pointer movement');
    assert.ok(await selected('2', 'Left leg').isVisible());
    console.log(JSON.stringify({ chromium: browser.version(), raw, reduced, case: 'first-person limb framing', framed, automatic: automatic.look, manual: manual.look }));
  }

  async function waitForPress(before, actionId) {
    await page.waitForFunction(({ area, seq, actionId }) => {
      const trigger = window.__nsQA.inspect().state.trigger;
      return trigger.seq > seq && trigger.regionId === area && trigger.source === 'click' && trigger.actionId === actionId;
    }, { area: before.area, seq: before.trigger.seq, actionId }, { polling: 80, timeout: 5_000 });
    return inspect();
  }

  async function orbitForward(before) {
    await page.waitForFunction(pitch => window.__nsQA.inspect().scene.mirror?.orbit?.pitchDeg > pitch, before.orbit.pitchDeg, { polling: 80, timeout: 5_000 });
    const after = await inspect();
    assert.equal(after.orbit.pitchDeg, before.orbit.pitchDeg + 15);
    assert.equal(after.orbit.yawDeg, before.orbit.yawDeg);
    assert.equal(after.trigger.seq, before.trigger.seq, 'clicking the arrow does not press the covered area');
    return after;
  }

  async function checkStrip() {
    // Keep limb selection in the outside view so the eye-view framing turn
    // does not move the camera away from the overlap on the motor strip.
    const selection = await aim();
    if (process.env.NS_SCREENSHOT) await page.screenshot({ path: process.env.NS_SCREENSHOT });
    await selected('1', 'Left arm').waitFor();
    for (const [key, name] of [['2', 'Left leg'], ['3', 'Right leg'], ['1', 'Left arm'], ['4', 'Right arm']]) {
      await page.keyboard.press(key);
      await selected(key, name).waitFor({ timeout: 5_000 });
      const after = await inspect();
      assert.equal(after.camera.thirdPerson, true);
      assert.equal(after.area, selection.covered.area);
      assert.equal(after.trigger.seq, selection.covered.trigger.seq, `Number ${key} selects a limb without pressing a motor area`);
      assert.deepEqual(after.orbit, selection.covered.orbit);
    }

    const left = await step('ArrowLeft');
    assert.equal(left.step.from, selection.covered.area);
    await page.keyboard.down('w');
    await page.waitForFunction(before => {
      const pose = window.__nsQA.inspect().bodyJointTargets;
      return ['r_elbow_flex', 'r_shoulder_flex', 'r_shoulder_abd']
        .some((joint, i) => Math.abs(pose[joint] - before[i]) > 0.5);
    }, left.rightArm, { polling: 80, timeout: 5_000 });
    await page.keyboard.up('w');
    const moved = await inspect();
    assert.ok(await selected('4', 'Right arm').isVisible());
    console.log(JSON.stringify({ chromium: browser.version(), width, height, case: 'limb selection, left step and W', ...selection, left, moved }));

    const shifted = await aim();
    await page.keyboard.down('Shift');
    await page.waitForFunction(() => window.__nsQA.inspect().controlTargets.reach);
    // While captured, mouse.click(x, y) first moves the pointer and therefore the player's look.
    await page.mouse.down();
    await page.mouse.up();
    await page.keyboard.up('Shift');
    const withShift = await waitForPress(shifted.covered, shifted.covered.trigger.actionId);
    assert.deepEqual(withShift.orbit, shifted.covered.orbit);
    console.log(JSON.stringify({ case: 'Shift-click area', ...shifted, after: withShift }));

    const arrow = await aim();
    await page.keyboard.press('r');
    // 19 November 2026: reading starts ON at its short level (the tip stays with it), so R now goes to the full cards.
    await page.waitForFunction(() => document.querySelector('#ns-app[data-ns-read="more"]') !== null, null, { polling: 80, timeout: 5_000 });
    const withCards = await nextFrames(arrow.covered.frames);
    assert.equal(withCards.area, arrow.covered.area);
    assert.ok(withCards.status.includes(arrow.covered.tip.text.split('\n')[0]));
    assert.ok(await page.locator('#ns-hud .ns-slot-gaze').isVisible(), 'the expanded HUD shows the selected area');
    assert.equal(withCards.tip, null);
    await page.mouse.down();
    await page.mouse.up();
    const withClick = await orbitForward(arrow.covered);
    assert.doesNotMatch(withClick.tip?.text || '', /Shift-click presses this area/);
    await page.keyboard.press('e');
    await page.waitForFunction(() => window.__nsQA.inspect().camera.pose.firstPerson, null, { polling: 80 });
    const returned = await inspect();
    assert.equal(returned.healthy, true);
    assert.doesNotMatch(returned.tip?.text || '', /Shift-click presses this area/);
    console.log(JSON.stringify({ case: 'cards show selected area, plain click turns mirror and E returns', ...arrow, withCards, after: withClick, returned }));

    await aim();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.pointerLockElement && window.__nsQA.inspect().shell.mode === 'paused', null, { polling: 80 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.pointerLockElement && window.__nsQA.inspect().shell.mode === 'playing', null, { polling: 80 });
    const freePointer = await inspect();
    assert.ok(freePointer.overlapClick?.every(Number.isFinite), 'the visible mirror tip has a real pointer position');
    await page.mouse.move(...freePointer.overlapClick);
    const hovered = await nextFrames(freePointer.frames);
    assert.equal(hovered.input.arrow, true);
    assert.equal(hovered.mirrorHover, 'forward');
    assert.equal(hovered.overlapTip.opacityScale, freePointer.overlapTip.opacityScale);
    assert.deepEqual(hovered.orbit, freePointer.orbit, 'hovering leaves the mirror still');
    await page.mouse.click(...freePointer.overlapClick);
    const withPointer = await orbitForward(hovered);
    console.log(JSON.stringify({ case: 'free pointer clicks a faded tip at its drawn position', freePointer, hovered, after: withPointer }));
  }

  await checkLimbFraming();
  if (!reduced) await checkStrip();
  console.log(JSON.stringify({ raw, reduced, assets, errors }));
  assert.deepEqual(errors, []);
} finally {
  if (browser) await browser.close();
  server.close();
  await once(server, 'close');
}
