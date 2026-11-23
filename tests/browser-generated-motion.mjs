import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { generateMotion } from '../scene/src/word-motion/inference.mjs';
import { createHandler, HOST } from '../serve-local.mjs';

const { chromium } = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const weights = JSON.parse(await readFile(new URL('../scene/src/word-motion/weights.json', import.meta.url)));
const allowedHosts = new Set();
const server = createServer(createHandler({root, allowedHosts})).listen(0, HOST);
await once(server, 'listening');
const host = HOST + ':' + server.address().port;
allowedHosts.add(host);
let browser;
try {
  const args = ['--disable-background-networking'];
  if (process.env.NS_ANGLE) args.push('--use-angle=' + process.env.NS_ANGLE);
  browser = await chromium.launch({executablePath:process.env.NS_CHROMIUM, args});
  const page = await browser.newPage({viewport:{width:320,height:640}, reducedMotion:'reduce'});
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (/^https?:$/.test(url.protocol) && url.host !== host) {
      external.push(url.host);
      return route.abort();
    }
    return route.continue();
  });
  await page.addInitScript(() => {
    window.devicesUsed = {speech:0, camera:0, local:false};
    class Recognition {
      get processLocally() { return this.local === true; }
      set processLocally(value) { this.local = value; }
      start() {
        window.devicesUsed.speech++;
        window.devicesUsed.local = this.processLocally;
        this.onresult({results:[[{transcript:'Please generate a jog.'}]]});
        this.onend();
      }
      abort() {}
    }
    Object.defineProperty(window, 'SpeechRecognition', {value:Recognition});
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {value:async () => {
      window.devicesUsed.camera++;
      throw new DOMException('Test camera denied', 'NotAllowedError');
    }});
  });
  await page.goto('http://' + host + '/START.html');
  await page.getByRole('link', {name:'Play the experimental preview'}).press('Enter');
  await page.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
    document.querySelector('#ns-app').dataset.nsPhase === 'playing', null, {timeout:120000});
  const shell = () => page.evaluate(() => window.__nsQA.inspect().shell.mode);
  const field = page.getByRole('textbox', {name:'Command box'});
  const player = page.locator('[data-word-motion]');
  const stage = player.locator('canvas');
  const timeline = player.getByRole('slider', {name:'Time', exact:true});
  const bitmap = () => stage.evaluate(canvas => canvas.toDataURL());
  const dialogs = page.getByRole('dialog');
  let checked = 0;

  // A compositor frame's timestamp can precede a control event in that frame.
  // Deliver one such timestamp directly to the callback scheduled by the event.
  async function useEarlierFirstFrame(element, eventName) {
    await element.evaluate((target, name) => {
      target.addEventListener(name, () => {
        const schedule = window.requestAnimationFrame;
        const timestamp = performance.now() - 75;
        window.requestAnimationFrame = callback => {
          window.requestAnimationFrame = schedule;
          return schedule.call(window, () => {
            try { callback(timestamp); }
            finally { (window.testFirstFrames ??= []).push(Number(document.querySelector('#ns-word-time').value)); }
          });
        };
      }, {capture:true, once:true});
    }, eventName);
  }

  async function checkTrajectory(action) {
    await player.getByRole('status').filter({hasText:'Model output'}).waitFor();
    assert.equal(await shell(), 'paused');
    assert.equal(await dialogs.evaluate(el => el.scrollWidth <= el.clientWidth), true);
    await player.getByText('Inspect a body point', {exact:true}).press('Enter');
    const rows = await player.evaluate(panel => {
      const point = panel.querySelector('select');
      const time = panel.querySelector('#ns-word-time');
      const rows = [];
      for (let frame = 0; frame <= Number(time.max); frame++) {
        time.value = frame;
        time.dispatchEvent(new Event('input'));
        const points = [];
        for (let i = 0; i < point.options.length; i++) {
          point.selectedIndex = i;
          point.dispatchEvent(new Event('change'));
          points.push(panel.querySelector('[data-position]').textContent);
        }
        rows.push(points);
      }
      return rows;
    });
    const clip = generateMotion(action, weights);
    for (const [frame,points] of clip.positionsMm.entries()) {
      for (const [i,p] of points.entries()) {
        const xyz = p.map((v,axis) => 'XYZ'[axis] + ' ' + (v + clip.rootMm[frame][axis]).toFixed(1));
        assert.equal(rows[frame][i], xyz.join(' / ') + ' mm');
        checked += 3;
      }
    }
    await timeline.press('Home');
    const first = await bitmap();
    await timeline.press('End');
    assert.notEqual(await bitmap(), first, action + ' must visibly change shape');
    const previous = await bitmap();
    await player.getByRole('slider',{name:'Rotate view'}).press('Home');
    assert.notEqual(await bitmap(), previous, 'camera rotation must change the projection');
    assert.ok(await stage.evaluate(canvas => {
      const p = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let green = 0;
      for (let i = 0; i < p.length; i += 4)
        if (p[i] === 224 && p[i+1] === 237 && p[i+2] === 141) green++;
      return green > 100;
    }), 'landmarks and lines should be visible');
  }

  await page.keyboard.press('f');
  for (const invalid of ['generate', 'generate jump', 'generate walk backwards', 'generate run and walk']) {
    await field.fill(invalid); await field.press('Enter');
    await dialogs.getByRole('status').filter({hasText:'two actions'}).waitFor();
    assert.equal(await player.isVisible(), false);
    assert.equal(await field.evaluate(el => el === document.activeElement), true);
  }
  const weightPath = '**/word-motion/weights.json';
  await page.route(weightPath, route => route.fulfill({contentType:'application/json',body:'{}'}), {times:1});
  await field.fill('generate walk'); await field.press('Enter');
  await dialogs.getByRole('status').filter({hasText:'Could not open the verified model'}).waitFor();
  assert.equal(await stage.isVisible(), false);
  await page.keyboard.press('Escape');
  let received;
  const pending = new Promise(resolve => { received = resolve; });
  await page.route(weightPath, route => received(route), {times:1});
  await page.keyboard.press('f'); await field.fill('generate run'); await field.press('Enter');
  const request = await pending;
  await page.keyboard.press('Escape');
  await request.continue();
  assert.equal(await shell(), 'playing');
  await page.keyboard.press('f');
  await field.fill('generate walk'); await field.press('Enter');
  await checkTrajectory('walk');
  assert.deepEqual(await page.evaluate(() => window.devicesUsed), {speech:0,camera:0,local:false});
  await page.keyboard.press('c'); await page.keyboard.press('p');
  assert.equal(await shell(), 'paused');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ns-canvas');
  assert.equal(await shell(), 'playing');

  await page.setViewportSize({width:1280,height:840});
  await page.keyboard.press('f');
  await dialogs.getByRole('button',{name:'Use voice'}).press('Enter');
  assert.equal(await field.inputValue(), 'Please generate a jog.');
  assert.equal(await player.isVisible(), false);
  await field.press('Enter'); await checkTrajectory('run');
  await timeline.press('Home');
  for (let step = 0; step < 6; step++) await timeline.press('ArrowRight');
  const play = player.getByRole('button', {name:'Play',exact:true});
  await useEarlierFirstFrame(play, 'click');
  await play.press('Enter');
  await page.waitForFunction(() => window.testFirstFrames?.length === 1);
  assert.deepEqual(await page.evaluate(() => window.testFirstFrames), [6], 'resuming must not rewind');
  await page.waitForFunction(() => Number(document.querySelector('#ns-word-time').value) > 6);
  await player.getByRole('button', {name:'Pause',exact:true}).press('Enter');
  const paused = await timeline.inputValue();
  await page.waitForTimeout(90);
  assert.equal(await timeline.inputValue(), paused);
  await player.getByRole('button',{name:'Back to game'}).press('Enter');
  assert.equal(await shell(), 'playing');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ns-canvas');

  for (let round = 0; round < 3; round++) {
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.keyboard.press('f'); await field.fill('generate walk'); await field.press('Enter');
    await play.waitFor();
    assert.equal(await timeline.inputValue(), '0');
    await player.getByRole('button',{name:'Back to game'}).press('Enter');
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.keyboard.press('f'); await field.fill('generate a run');
    await useEarlierFirstFrame(dialogs.locator('form'), 'submit');
    await field.press('Enter');
    await player.getByRole('button', {name:'Replay',exact:true}).waitFor({timeout:5000});
    assert.equal(await timeline.inputValue(), '24', 'default playback must traverse the entire clip');
    await page.keyboard.press('Escape');
  }
  const earlyFrames = await page.evaluate(() => window.testFirstFrames);
  assert.deepEqual(earlyFrames, [6,0,0,0]);
  const elbow = await page.evaluate(() => window.__nsQA.inspect().bodyDrawnJoints.r_elbow_flex);
  await page.keyboard.press('f'); await field.fill('bend my right elbow'); await field.press('Enter');
  await page.waitForFunction(before => Math.abs(window.__nsQA.inspect().bodyDrawnJoints.r_elbow_flex - before)>15, elbow);
  await page.keyboard.press('f'); await field.fill('replay a forward jump'); await field.press('Enter');
  await page.getByRole('region',{name:'Recorded whole-body movement'}).getByText(/CMU trial 13_11/).waitFor();
  await page.keyboard.press('Escape');
  await page.keyboard.press('p');
  assert.deepEqual(await page.evaluate(() => window.devicesUsed), {speech:1,camera:0,local:true});
  await page.keyboard.press('c');
  await page.getByText('Camera off. The camera permission was denied or blocked by the browser.').waitFor();
  assert.deepEqual(await page.evaluate(() => window.devicesUsed), {speech:1,camera:1,local:true});
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({widths:[320,1280],actions:['walk','run'],coordinatesChecked:checked,
    rejectsCorruptModel:true, closesWhileLoading:true, automaticPlayback:true, reducedMotion:true, earlyFrames,
    avatarAndRecordedCommands:true, keyboard:true, speechConfirmed:true, cameraRequestsBeforeC:0,
    cameraDeniedAfterC:1, realDevicesUsed:0, external, errors}));
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
