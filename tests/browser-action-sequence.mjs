import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHandler, HOST } from '../serve-local.mjs';

const { chromium } = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const allowedHosts = new Set();
const server = createServer(createHandler({root, allowedHosts})).listen(0, HOST);
await once(server, 'listening');
const host = HOST + ':' + server.address().port;
allowedHosts.add(host);
let browser;
try {
  const args = ['--disable-background-networking'];
  if (process.env.NS_ANGLE) args.push('--use-angle=' + process.env.NS_ANGLE);
  browser = await chromium.launch({executablePath: process.env.NS_CHROMIUM, args});
  const page = await browser.newPage({viewport: {width:1280, height:900}});
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('request', r => requests.push(r.url()));
  await page.addInitScript(() => {
    if (location.protocol === 'about:') return;
    window.probe = {voice:0, devices:0, frames:[], running:false};
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {value:async () => {
      probe.devices++;
      throw new DOMException('No device attached', 'NotFoundError');
    }});
    class LocalSpeech {
      get processLocally() { return this.local; }
      set processLocally(value) { this.local = value; }
      start() {
        if (!this.local) throw Error('Expected on-device dictation');
        probe.voice++;
        this.onresult({results:[[{transcript:'bend my right elbow and then bend my left knee'}]]});
        this.onend();
      }
      abort() {}
    }
    Object.defineProperty(window, 'SpeechRecognition', {value: location.hash ? undefined : LocalSpeech});
    Object.defineProperty(window, 'webkitSpeechRecognition', {value:undefined});
    probe.read = () => {
      const s = window.__nsQA.inspect(), a = s.state.activity;
      return {frame:s.frames, time:s.state.t, move:a.moveSeq, action:a.lastMove?.actionId || null,
        leftElbow:s.state.elbowRad * 180 / Math.PI, rightElbow:s.bodyDrawnJoints.r_elbow_flex,
        leftKnee:s.bodyDrawnJoints.knee_ext_L, rightKnee:s.bodyDrawnJoints.knee_ext_R,
        settled:!Object.keys(a.armJerk).length && !Object.keys(a.bodyJerk).length,
        status:document.querySelector('#ns-sequence-status').textContent};
    };
    probe.record = () => {
      probe.frames = [];
      probe.running = true;
      function sample() {
        if (!probe.running) return;
        const row = probe.read();
        if (probe.frames.at(-1)?.frame !== row.frame) probe.frames.push(row);
        requestAnimationFrame(sample);
      }
      sample();
    };
  });
  async function ready(query = '') {
    await page.goto('http://' + host + '/scene/example/preview.html' + query, {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
      document.querySelector('#ns-app').dataset.nsPhase === 'playing', null, {timeout:90000});
    await page.waitForLoadState('networkidle');
  }
  const field = page.getByRole('textbox', {name:'Command box'});
  const chat = page.locator('#ns-action-chat');
  const status = page.locator('#ns-sequence-status');
  const open = async () => { await page.locator('#ns-canvas').press('f'); await field.waitFor(); };
  const read = () => page.evaluate(() => probe.read());
  const noDevices = () => page.evaluate(() => [probe.voice, probe.devices]);
  async function finishAndRead(n) {
    await page.waitForFunction(n => probe.frames.some(f => f.status.startsWith('Step ' + n)) &&
      !document.querySelector('#ns-sequence-status').textContent, n, {timeout:20000});
    return page.evaluate(() => { probe.running = false; return [...probe.frames, probe.read()]; });
  }
  function checkSteps(rows, actions) {
    const starts = actions.map((action, i) => {
      const start = rows.findIndex(f => f.status.startsWith('Step ' + (i + 1) + ' of'));
      assert.ok(start > 0, action);
      assert.equal(rows[start].action, action);
      if (i) {
        assert.ok(rows[start - 1].settled, 'previous movement still in progress at ' + action);
        assert.equal(rows[start].move, rows[start - 1].move + 1);
      }
      return start;
    });
    const ranges = starts.map((start, i) => {
      const part = rows.slice(start, starts[i + 1] ?? rows.length);
      return {action: actions[i], seconds: part.at(-1).time - part[0].time,
        ranges: Object.fromEntries(['leftElbow','rightElbow','leftKnee','rightKnee'].map(joint =>
          [joint, [Math.min(...part.map(f => f[joint])), Math.max(...part.map(f => f[joint]))]]))};
    });
    for (const step of ranges) assert.ok(step.seconds > 0.3, 'step ended too soon');
    return ranges;
  }
  await ready('#no-speech');
  await open();
  assert.equal(await chat.getByRole('button', {name:'Use voice'}).isDisabled(), true);
  const initial = await read(), firstRequest = requests.length;
  for (const [phrase, reason] of [
    ['bend my left elbow, then start camera', 'Step 2'],
    ['replay my take, then bend my left knee', 'Step 1'],
    ['bend my right elbow then do not bend my left knee', 'Step 2'],
    ['bend my left elbow then', 'Step 2'],
    ['open my right hand then show recorded brain activity', 'Step 2'],
    ['generate walk then flex my wrist', 'Step 1'],
    ['flex my left wrist then bend my knee', 'Step 2'],
    ['bend my right elbow and open my left hand', 'Try one movement']
  ]) {
    await field.fill(phrase);
    await field.press('Enter');
    assert.ok((await chat.getByRole('status').textContent()).includes(reason), phrase);
    assert.equal((await read()).move, initial.move);
  }
  await field.fill('bend my left elbow, then straighten my left elbow, then bend my right knee');
  assert.match(await chat.getByRole('status').textContent(), /1\. bend left elbow → 2\. straighten left elbow → 3\. bend right knee/);
  await page.evaluate(() => probe.record());
  await field.press('Enter');
  const typed = checkSteps(await finishAndRead(3), ['elbow_flexion','elbow_extension','lh_knee_flex']);
  assert.ok(typed[0].ranges.leftElbow[1] > initial.leftElbow + 35);
  assert.ok(typed[1].ranges.leftElbow[0] < initial.leftElbow - 2);
  assert.ok(typed[2].ranges.rightKnee[0] < initial.rightKnee - 40);
  for (const step of typed) {
    assert.ok(step.ranges.leftKnee.every(x => Math.abs(x - initial.leftKnee) < 1));
    assert.ok(step.ranges.rightElbow.every(x => Math.abs(x - initial.rightElbow) < 1));
  }
  assert.deepEqual(await noDevices(), [0,0]);
  assert.deepEqual(requests.slice(firstRequest), []);
  const interrupted = [];
  for (const kind of ['manual key', 'reopen and cancel', 'body reset']) {
    await open();
    await field.fill('bend my right elbow then bend my left knee');
    await field.press('Enter');
    await status.filter({hasText:'Step 1 of 2'}).waitFor();
    const before = await read();
    if (kind === 'manual key') await page.keyboard.press('w');
    if (kind === 'reopen and cancel') { await open(); await field.press('Escape'); }
    if (kind === 'body reset') {
      await page.keyboard.press('Escape');
      await page.getByRole('button', {name:'Reset body', exact:true}).click();
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.__nsQA.inspect().shell.mode === 'playing');
    }
    await page.waitForFunction(() => !document.querySelector('#ns-sequence-status').textContent);
    await page.waitForTimeout(2200);
    const after = await read();
    assert.ok(after.move <= before.move);
    assert.ok(Math.abs(after.leftKnee - initial.leftKnee) < 1);
    interrupted.push(kind);
  }
  await page.goto('about:blank');
  await ready();
  await open();
  const voiceInitial = await read(), speechRequests = requests.length;
  await chat.getByRole('button', {name:'Use voice'}).click();
  assert.equal(await field.inputValue(), 'bend my right elbow and then bend my left knee');
  assert.match(await chat.getByRole('status').textContent(), /Check the words/);
  await page.waitForTimeout(350);
  assert.equal((await read()).move, voiceInitial.move);
  await page.evaluate(() => probe.record());
  await chat.getByRole('button', {name:'Move', exact:true}).click();
  const spoken = checkSteps(await finishAndRead(2), ['lh_r_elbow_flex','rh_knee_flex']);
  assert.ok(spoken[0].ranges.rightElbow[1] > voiceInitial.rightElbow + 40);
  assert.ok(spoken[0].ranges.leftKnee.every(x => Math.abs(x - voiceInitial.leftKnee) < 1));
  assert.ok(spoken[1].ranges.leftKnee[0] < voiceInitial.leftKnee - 40);
  assert.ok(spoken[1].ranges.rightElbow.every(x => Math.abs(x - voiceInitial.rightElbow) < 1));
  assert.deepEqual(requests.slice(speechRequests), []);
  assert.deepEqual(await noDevices(), [1,0]);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({chromium:browser.version(), typed, spoken, interrupted, errors,
    commandRequests:0, deviceRequests:0, speech:'injected on-device transcript; explicit Move'}));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
