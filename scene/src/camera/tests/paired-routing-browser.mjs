// Exercise delayed and out-of-order worker deliveries against the ordinary game.
// The file-camera and selected-limb checks exercise the real local detector.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHandler, HOST} from '../../../../serve-local.mjs';

const {chromium} = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const allowedHosts = new Set(), server = createServer(createHandler({root, allowedHosts}));
let browser;
try {
  server.listen(0, HOST);
  await once(server, 'listening');
  const host = HOST + ':' + server.address().port;
  allowedHosts.add(host);
  const origin = 'http://' + host;
  browser = await chromium.launch({executablePath: process.env.NS_CHROMIUM, args: [
    '--use-angle=' + (process.env.NS_ANGLE || 'swiftshader'), '--disable-background-networking',
    '--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader'
  ]});
  const context = await browser.newContext({permissions: ['camera']});
  const errors = [], unexpected = [];
  context.on('request', r => { if (r.method() !== 'GET' || new URL(r.url()).origin !== origin) unexpected.push(r.url()); });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    const state = window.paired = {requests: [], workers: [], tracks: [], count: 0};
    class LocalDictation {
      get processLocally() { return this.local; }
      set processLocally(value) { this.local = value; }
      start() {
        state.voiceLocal = this.local;
        this.onresult({results:[[{transcript:state.transcript || 'Replay my take of both knees.'}]]});
      }
      abort() { state.voiceEnded = true; }
    }
    Object.defineProperty(window, 'SpeechRecognition', {value:LocalDictation});
    const media = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      state.requests.push(constraints);
      const stream = await media(constraints);
      state.tracks.push(stream.getVideoTracks()[0]);
      return stream;
    };
    const Native = window.Worker;
    window.Worker = class {
      constructor(url, ...args) {
        if (!String(url).endsWith('/camera/pose-worker.js')) return new Native(url, ...args);
        state.workers.push(this);
      }
      postMessage(data) {
        if (data.type === 'init') { queueMicrotask(() => this.onmessage({data: {type:'ready'}})); return; }
        data.frame.close();
        const {selection, timestamp, limb} = data;
        const reply = (result, stamp = timestamp) => this.onmessage({data: {type: 'pose', selection, timestamp: stamp, result}});
        state.pending = {reply, timestamp, limb};
        state.count++;
        if (!state.hold) queueMicrotask(() => reply(state.pose));
      }
      terminate() { this.stopped = true; }
    };
  });
  await page.goto(origin + '/');
  await page.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
    document.querySelector('#ns-app').dataset.nsPhase === 'playing', null, {timeout:120000});
  const panel = page.locator('#ns-motion-camera'), select = panel.getByRole('combobox', {name: 'Follow'});
  const canvas = page.locator('#ns-canvas');
  const up = {leftArm: {bearing:[0,1,0], upper:[0,1,0], elbowDeg: 15}, joints:{r_shoulder_abd:155,r_shoulder_flex:0,r_elbow_flex:35}};
  const down = {leftArm: {bearing:[0,-1,0], upper:[0,-1,0], elbowDeg: 30}, joints:{r_shoulder_abd:20,r_shoulder_flex:0,r_elbow_flex:60}};
  const setPose = p => page.evaluate(p => { paired.pose = p; }, p);
  const read = () => page.evaluate(() => {
    const s = window.__nsQA.inspect(), left = s.limbs.ends.leftArm;
    return {leftY: left.end[1] - left.root[1], leftZ:left.end[2] - left.root[2], right: s.bodyDrawnJoints.r_shoulder_abd,
      selected: s.limbs.limb, hold: s.limbs.hold, count: paired.count};
  });
  const waitRight = right => page.waitForFunction(t => Math.abs(window.__nsQA.inspect().bodyDrawnJoints.r_shoulder_abd - t) < 1, right);
  async function waitNewFrames(n) {
    const start = await page.evaluate(() => paired.count);
    await page.waitForFunction(([a,b]) => paired.count >= a + b, [start,n]);
  }
  async function holdFrame() {
    const start = await page.evaluate(() => { paired.hold = true; return paired.count; });
    await page.waitForFunction(a => paired.count > a, start);
  }
  await canvas.press('f');
  const field = page.getByRole('textbox', {name:'Command box'});
  await field.fill('choose camera mode');
  await field.press('Enter');
  assert.equal(await page.evaluate(() => paired.requests.length), 0);
  await field.press('Escape');
  await canvas.press('c');
  await select.selectOption('bothArms');
  await setPose(up);
  await waitRight(155);
  assert.ok((await read()).leftY > 0.25);
  // Hold the left arm under manual control while the right alone takes a new angle.
  assert.equal((await read()).selected, 'leftArm');
  await canvas.focus();
  await page.keyboard.down('a');
  let held;
  try {
    await setPose(down);
    await waitRight(20);
    await waitNewFrames(3);
    held = await read();
    assert.ok(held.leftY > -0.2, JSON.stringify(held));
  } finally { await page.keyboard.up('a'); }
  await page.waitForFunction(() => {const l = __nsQA.inspect().limbs.ends.leftArm; return l.end[1] - l.root[1] < -0.3;});
  await holdFrame();
  // Switch away and back while the old pair is still in flight.
  await select.selectOption('leftArm');
  await select.selectOption('bothArms');
  await page.evaluate(p => { paired.old = paired.pending; paired.pending.reply(p); }, up);
  await waitNewFrames(1);
  assert.equal(Math.round((await read()).right), 20);
  // A late duplicate from the same worker must not consume the new frame.
  await page.evaluate(p => paired.pending.reply(p, paired.old.timestamp), up);
  assert.equal(Math.round((await read()).right), 20);
  await page.waitForTimeout(1250);
  await page.evaluate(p => { paired.pending.reply(p); }, up);
  await waitNewFrames(1);
  assert.equal(Math.round((await read()).right), 20);
  await page.evaluate(p => { paired.pose = p; paired.hold = false; paired.pending.reply(p); }, up);
  await waitRight(155);
  await holdFrame();
  // Opening F discards the in-flight pair and both camera controls.
  await canvas.press('f');
  await field.waitFor();
  await page.evaluate(p => paired.pending.reply(p), down);
  assert.deepEqual(await page.evaluate(() => paired.tracks.map(t => t.readyState)), ['ended']);
  await field.fill('bend my right elbow, then straighten my right elbow');
  await field.press('Enter');
  await page.waitForFunction(() => document.querySelector('#ns-sequence-status').textContent.startsWith('Step 2'));
  await page.waitForFunction(() => !document.querySelector('#ns-sequence-status').textContent);
  assert.equal(await page.evaluate(() => paired.requests.length), 1);
  // Both knee bends use the same joint controller, including when manual input
  // takes just one knee or the other side loses its usable camera view.
  await page.evaluate(() => { paired.hold = false; paired.pose = null; });
  await canvas.press('c');
  const waitKnees = (left, right) => page.waitForFunction(([l,r]) => {
    const joints = __nsQA.inspect().bodyJointTargets;
    return (l === null || Math.abs(joints.knee_ext_L - l) < 1) &&
      (r === null || Math.abs(joints.knee_ext_R - r) < 1);
  }, [left,right]);
  for (const [number,side] of [['2','leftLeg'],['3','rightLeg']]) {
    await canvas.press(number);
    await page.waitForFunction(side => __nsQA.inspect().limbs.limb === side, side);
    await select.selectOption('bothKnees');
    await setPose({joints:{knee_ext_L:-78, knee_ext_R:-83}});
    await waitKnees(-78,-83);
    assert.ok(await panel.getByRole('button',{name:'Record take'}).isEnabled());
    await canvas.focus();
    await page.keyboard.down('w');
    try {
      await setPose({joints:{knee_ext_L:-112,knee_ext_R:-116}});
      await waitKnees(side === 'leftLeg' ? null : -112, side === 'rightLeg' ? null : -116);
      await waitNewFrames(2);
      const targets = await page.evaluate(() => __nsQA.inspect().bodyJointTargets);
      assert.ok(side === 'leftLeg' ? Math.abs(targets.knee_ext_L + 112) > 12 : Math.abs(targets.knee_ext_R + 116) > 12,
        JSON.stringify({side, left:targets.knee_ext_L,right:targets.knee_ext_R, details:await page.evaluate(()=>({limb:__nsQA.inspect().limbs.limb, hold:__nsQA.inspect().limbs.hold, active:document.activeElement.id}))}));
    } finally { await page.keyboard.up('w'); }
    await waitKnees(-112,-116);
  }
  await setPose({joints:{knee_ext_L:-72}});
  await waitKnees(-72,-116);
  await panel.getByText(/Left knee tracking/).waitFor();
  await page.waitForTimeout(750);
  await setPose({joints:{knee_ext_L:-33,knee_ext_R:-10}});
  await waitKnees(-33,-116);
  await waitNewFrames(3);
  assert.match(await panel.innerText(), /Left knee tracking/);
  await setPose({joints:{knee_ext_L:-19,knee_ext_R:-95}});
  await waitKnees(-19,-95);
  await holdFrame();
  await select.selectOption('leftLeg');
  await select.selectOption('bothKnees');
  await page.evaluate(() => paired.pending.reply({joints:{knee_ext_L:-102,knee_ext_R:-102}}));
  await waitNewFrames(1);
  await waitKnees(-19,-95);
  await canvas.press('f');
  await field.waitFor();
  await page.evaluate(() => paired.pending.reply({joints:{knee_ext_L:-105,knee_ext_R:-105}}));
  await waitKnees(-19,-95);
  assert.equal(await panel.locator('video').evaluate(v => v.srcObject), null);
  await field.press('Escape');
  await page.evaluate(() => { paired.hold = false; paired.pose = null; });
  await canvas.press('2');
  await page.waitForFunction(() => __nsQA.inspect().limbs.limb === 'leftLeg');
  await canvas.press('c');
  await select.selectOption('bothKnees');
  await setPose({joints:{knee_ext_L:-84, knee_ext_R:-52}});
  await waitKnees(-84,-52);
  const record = panel.getByRole('button',{name:'Record take'});
  await record.click();
  await waitNewFrames(6);
  await setPose({joints:{knee_ext_L:0}});
  await waitKnees(0,-52);
  await waitNewFrames(5);
  await setPose(null);
  await panel.getByText(/Keep your shoulders, hips, knees and feet in view/).waitFor();
  await waitNewFrames(3);
  await setPose({joints:{knee_ext_R:-119}});
  await waitKnees(0,-119);
  await waitNewFrames(6);
  await setPose({joints:{knee_ext_L:-105, knee_ext_R:-65}});
  await waitKnees(-105,-65);
  await waitNewFrames(4);
  await panel.getByRole('button',{name:'Finish take'}).click();
  const summary = await panel.getByText(/Both knees · .*pose samples .*left, .*right/).innerText();
  assert.equal(await page.evaluate(() => paired.tracks.at(-1).readyState), 'ended');
  await canvas.press('f');
  await page.getByRole('button',{name:'Use voice'}).click();
  assert.equal(await field.inputValue(), 'Replay my take of both knees.');
  assert.equal(await page.evaluate(() => paired.voiceLocal), true);
  assert.ok(await panel.getByRole('button',{name:'Replay take'}).isDisabled());
  await page.getByRole('button',{name:'Move',exact:true}).click();
  await waitKnees(-84,-52);
  await waitKnees(0,-52);
  await waitKnees(0,-119);
  await waitKnees(-105,-65);
  await panel.getByText(summary,{exact:true}).waitFor();
  assert.equal(await page.evaluate(() => paired.voiceEnded), true);
  assert.equal(await select.inputValue(), 'bothKnees');
  // Keep the selected left knee in hand through its recorded bend. The right
  // knee must still follow its own saved series with video and microphone off.
  await panel.getByRole('button',{name:'Replay take'}).click();
  await waitKnees(-84,-52);
  await canvas.focus();
  await page.keyboard.down('w');
  try {
    await waitKnees(null,-119);
    const targets = await page.evaluate(() => __nsQA.inspect().bodyJointTargets);
    assert.ok(Math.abs(targets.knee_ext_L) > 12, JSON.stringify(targets));
    await waitKnees(null,-65);
  } finally { await page.keyboard.up('w'); }
  await panel.getByText(summary,{exact:true}).waitFor();
  assert.equal(await page.evaluate(() => paired.requests.length), 3);
  // A one-sided attempt, even with many left samples, preserves the pair.
  await setPose({joints:{knee_ext_L:-98}});
  await canvas.press('c');
  await record.click();
  await waitNewFrames(5);
  await panel.getByRole('button',{name:'Finish take'}).click();
  await panel.getByText(/two visible samples from each side.*Previous take available/).waitFor();
  await panel.getByRole('button',{name:'Replay take'}).click();
  await waitKnees(-84,-52);
  await panel.getByRole('button',{name:'Stop replay'}).click();
  await panel.getByText(summary,{exact:true}).waitFor();
  // One operator in hand, three camera channels. Change the selection twice
  // while a four-limb result is pending: no old or duplicate packet may win.
  await canvas.press('c');
  await select.selectOption('armsAndKnees');
  const fourUp = {...up, joints:{...up.joints,knee_ext_L:-75,knee_ext_R:-100}};
  const fourDown = {...down, joints:{...down.joints,knee_ext_L:-106,knee_ext_R:-64}};
  await setPose(fourUp);
  await waitRight(155);
  await waitKnees(-75,-100);
  assert.ok((await read()).leftY > .25);
  assert.equal((await read()).selected,'leftLeg');
  await canvas.focus();
  await page.keyboard.down('w');
  try {
    await setPose(fourDown);
    await waitKnees(null,-64);
    await waitRight(20);
    await waitNewFrames(3);
    const drawn = await read();
    assert.ok(drawn.leftY < -.3);
    assert.ok(Math.abs(await page.evaluate(() => __nsQA.inspect().bodyJointTargets.knee_ext_L) + 106) > 12);
  } finally { await page.keyboard.up('w'); }
  await waitKnees(-106,-64);
  await holdFrame();
  await select.selectOption('bothArms');
  await select.selectOption('armsAndKnees');
  await page.evaluate(p => { paired.old = paired.pending; paired.pending.reply(p); },fourUp);
  await waitNewFrames(1);
  await page.evaluate(p => paired.pending.reply(p,paired.old.timestamp),fourUp);
  await waitKnees(-106,-64);
  assert.equal(Math.round((await read()).right),20);

  // Only one arm ever appears in this four-limb take. Empty channels stay
  // empty after F dictation, even when the avatar already holds a knee bend.
  await page.evaluate(p => { paired.pose=p; paired.hold=false; paired.pending.reply(p); },{joints:up.joints});
  await waitRight(155);
  await record.click();
  await waitNewFrames(4);
  await setPose({joints:down.joints});
  await waitRight(20);
  await waitNewFrames(4);
  await panel.getByRole('button',{name:'Finish take'}).click();
  const partial = await panel.getByText(/0 left arm, [1-9]\d* right arm, 0 left knee, 0 right knee/).innerText();
  await canvas.press('f');
  await page.evaluate(() => {paired.transcript='Replay my whole body take.';});
  await page.getByRole('button',{name:'Use voice'}).click();
  assert.equal(await field.inputValue(),'Replay my whole body take.');
  assert.equal(Math.round((await read()).right),20);
  assert.ok(await panel.getByRole('button',{name:'Replay take'}).isDisabled());
  await page.getByRole('button',{name:'Move',exact:true}).click();
  await waitRight(155);
  await waitKnees(-106,-64);
  await waitRight(20);
  await panel.getByText(partial,{exact:true}).waitFor();
  assert.equal(await select.inputValue(),'armsAndKnees');
  for (const stop of ['button','Escape','lost','pagehide']) {
    await page.evaluate(() => { paired.hold = false; paired.pose = null; });
    await canvas.press('c');
    await select.selectOption('bothArms');
    await setPose(down);
    await waitRight(20);
    await holdFrame();
    if (stop === 'button') await panel.getByRole('button',{name:'Stop camera'}).click();
    else if (stop === 'Escape') await canvas.press('Escape');
    else if (stop === 'lost') await page.evaluate(() => paired.tracks.at(-1).dispatchEvent(new Event('ended')));
    else await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted:true})));
    await page.waitForFunction(() => paired.workers.at(-1).stopped && paired.tracks.at(-1).readyState === 'ended');
    await page.evaluate(p => paired.pending.reply(p), up);
    if (stop === 'pagehide') break;
    assert.equal(Math.round((await read()).right), 20);
    assert.equal(await panel.locator('video').evaluate(v => v.srcObject), null);
    if (stop === 'Escape') await page.keyboard.press('Escape');
  }
  const devices = await page.evaluate(() => ({requests:paired.requests, workers:paired.workers.length, tracks:paired.tracks.map(t=>t.readyState)}));
  assert.equal(devices.workers, 9);
  assert.ok(devices.requests.every(c => c.audio === false));
  assert.deepEqual(devices.tracks, Array(9).fill('ended'));
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({manual:held, pairedReplay:summary, partialFour:partial, devices, staleAndDuplicate:'discarded', sequence:'finished after camera closed'}));
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
