// Run against the ordinary local game. Read the rendered meshes' 3-D centres
// and drawn angles. Intro and solver state are never set by the test.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHandler, HOST } from '../serve-local.mjs';

const { chromium } = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const assets = JSON.parse(readFileSync(new URL('../inputs/FULLBODY-MESH-MANIFEST.json', import.meta.url))).assets;
const allowedHosts = new Set();
const server = createServer(createHandler({ root, allowedHosts })).listen(0, HOST);
await once(server, 'listening');
const host = HOST + ':' + server.address().port;
allowedHosts.add(host);
const args = ['--disable-background-networking'];
if (process.env.NS_ANGLE) args.push('--use-angle=' + process.env.NS_ANGLE);
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM, args });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('request', request => requests.push(request.url()));
  await page.addInitScript(() => {
    window.check = { microphone: 0, device: 0 };
    class LocalSpeech {
      get processLocally() { return this.local; }
      set processLocally(value) { this.local = value; }
      start() {
        if (this.local !== true) throw Error('Local speech required');
        check.microphone++;
        this.onresult({ results: [[{ transcript: 'right forearm pronation' }]] });
        this.onend();
      }
      abort() {}
    }
    Object.defineProperty(window, 'SpeechRecognition', { value: LocalSpeech });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      check.device++;
      throw new DOMException('No camera', 'NotFoundError');
    }});
  });
  await page.goto('http://' + host, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
    document.querySelector('#ns-app').dataset.nsPhase === 'playing', null, { timeout: 90000 });
  await page.waitForLoadState('networkidle');
  const beforeRequests = requests.length;
  const field = page.locator('#ns-chat-input');
  const open = async () => { await page.locator('#ns-canvas').press('f'); await field.waitFor(); };
  const rightIds = Object.fromEntries(assets.filter(a => a.kind === 'bone' && a.laterality === 'right')
    .map(a => [a.embedded_source_name.toLowerCase(), a.element_id]));
  await page.evaluate(rightIds => {
    const first = window.__nsQA.inspect();
    if (first.qa || first.placeholder) throw Error('Expected the regular full avatar');
    const leftIds = Object.fromEntries(first.data.bones.map((b, i) => [b.name.toLowerCase(), 'arm:' + b.segment + ':' + i]));
    check.read = () => {
      const s = window.__nsQA.inspect({ bonePx: true }), a = s.state.activity, joints = s.bodyDrawnJoints;
      const arms = {};
      for (const [side, ids] of [['left', leftIds], ['right', rightIds]]) {
        const bones = {};
        for (const [part, name] of [['ulna',side + ' ulna'], ['radius',side + ' radius'], ['humerus',side + ' humerus'],
          ['palm',side + ' second metacarpal bone'], ['palmEdge',side + ' fifth metacarpal bone'], ['index','distal phalanx of ' + side + ' index finger'],
          ['little','distal phalanx of ' + side + ' little finger'], ['thumb','distal phalanx of ' + side + ' thumb']]) {
          const vertex = s.bonePx.own[ids[name]];
          if (!vertex || !vertex[4]) throw Error('Missing drawn bone ' + name);
          bones[part] = vertex.slice(0, 3);
        }
        arms[side] = {
          bones, elbow: s.limbs.ends[side + 'Arm'].bend,
          flex: side === 'left' ? s.state.elbowRad * 180 / Math.PI : joints.r_elbow_flex,
          pronation: side === 'left' ? (1 - a.rotation.value) * 160 : joints.r_pronation
        };
      }
      return { arms, mode:s.shell.mode, t: a.t, move: a.moveSeq, settled: !Object.keys(a.armJerk).length && !Object.keys(a.bodyJerk).length && !Number.isFinite(a.rotation.axialAnchor), action: a.lastMove?.actionId, index: joints.r_index_flex,
        wrist: [joints.r_wrist_flex, joints.r_wrist_ext], step: document.querySelector('#ns-sequence-status').textContent };
    };
    check.record = () => {
      const rows = check.rows = [check.before];
      function sample() {
        if (check.rows !== rows) return;
        const frame = check.read();
        if (frame.mode === 'playing' && frame.t > rows.at(-1).t) rows.push(frame);
        requestAnimationFrame(sample);
      }
      sample();
    };
  }, rightIds);
  const read = () => page.evaluate(() => check.read());
  async function move(words, { voice = false, sequence = false } = {}) {
    // The paused overlay omits the game's look-dependent finger posture.
    // Compare every advancing gameplay frame with the live pose before F.
    await page.evaluate(() => { check.before = check.read(); });
    await open();
    if (voice) {
      const n = (await read()).move;
      await page.getByRole('button', { name: 'Use voice' }).click();
      assert.equal(await field.inputValue(), words);
      assert.equal((await read()).move, n);
    } else await field.fill(words);
    await page.evaluate(() => check.record());
    await field.press('Enter');
    await page.waitForFunction(({ sequence }) => {
      const rows = check.rows;
      if (sequence) return rows.some(r => r.step.startsWith('Step 2 of 2')) && !rows.at(-1).step;
      return rows.at(-1).move > rows[0].move && rows.at(-1).settled && rows.at(-1).t - rows[0].t > 2.2;
    }, { sequence }, { timeout: 25000 });
    return page.evaluate(() => { const r = check.rows; check.rows = null; return r; });
  }
  const distanceMm = (a, b) => Math.hypot(...a.map((x, i) => x - b[i])) * 1000;
  function armTravel(rows, side) {
    const base = rows[0].arms[side];
    const max = fn => Math.max(...rows.map(r => fn(r.arms[side])));
    return Object.fromEntries([['elbow', max(b => distanceMm(b.elbow, base.elbow))],
      ['flexDegrees', max(b => Math.abs(b.flex - base.flex))],
      ...Object.keys(base.bones).map(k => [k, max(b => distanceMm(b.bones[k], base.bones[k]))])]);
  }
  // The radius and metacarpal follow circles in parallel planes. Two
  // independent displacements give their common normal, measured from the
  // meshes without reading the rig's commanded axis.
  function measurePalmTurn(start, peak) {
    const minus = (a, b) => a.map((v, i) => v - b[i]);
    const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
    const cross = (a, b) => [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
    const unit = a => a.map(v => v / Math.hypot(...a));
    const displacement = k => minus(peak.bones[k], start.bones[k]);
    const long = unit(minus(start.bones.palm, start.elbow));
    let axis = unit(cross(displacement('radius'), displacement('palm')));
    if (dot(axis, long) < 0) axis = axis.map(v => -v);
    const across = arm => {
      const v = minus(arm.bones.palm, arm.bones.palmEdge);
      return unit(minus(v, axis.map(x => x * dot(v, axis))));
    };
    const a = across(start), b = across(peak);
    return { axisAlignment: dot(axis, long), signedPalmDegrees: Math.atan2(dot(cross(a, b), axis), dot(a, b)) * 180 / Math.PI };
  }
  const turns = [];
  function checkTurn(rows, side, direction, id, atStop = false) {
    assert.ok(rows.some(r => r.action === id));
    const here = armTravel(rows, side), other = armTravel(rows, side === 'left' ? 'right' : 'left');
    const start = rows[0].arms[side].pronation;
    const range = rows.map(r => (r.arms[side].pronation - start) * direction);
    assert.ok(Math.min(...range) >= -0.2, 'wrong direction ' + id);
    assert.ok(Math.abs(rows.at(-1).arms[side].pronation - start) < 0.2, 'incomplete return ' + id);
    assert.ok(here.ulna < 0.21 && here.humerus < 0.21 && here.elbow < 1.01 && here.flexDegrees < 0.05, JSON.stringify(here));
    assert.ok(Math.max(...Object.values(other)) < 0.21, 'other arm moved: ' + JSON.stringify(other));
    assert.ok(rows.every(r => r.wrist.every((v, i) => Math.abs(v - rows[0].wrist[i]) < 0.1)));
    if (atStop) assert.ok(Math.max(...range) < 0.2 && here.palm < 0.21);
    else assert.ok(Math.max(...range) > 80 && here.radius > 10 && here.palm > 10, JSON.stringify(here));
    const degrees = Math.max(...range);
    let geometry = null;
    if (!atStop) {
      const peak = rows[range.indexOf(degrees)].arms[side];
      geometry = measurePalmTurn(rows[0].arms[side], peak);
      assert.ok(geometry.axisAlignment > 0.96, JSON.stringify(geometry));
      const expectedSign = (side === 'right' ? -1 : 1) * direction;
      assert.ok(geometry.signedPalmDegrees * expectedSign > 80, JSON.stringify(geometry));
      assert.ok(Math.abs(Math.abs(geometry.signedPalmDegrees) - degrees) < 8, JSON.stringify(geometry));
    }
    turns.push({ side, direction: direction > 0 ? 'pronate' : 'supinate', atStop, degrees, geometry, mm: here });
  }
  // Let the ordinary opening camera and limb placement settle before measuring
  // displacement while a command runs; a network-idle event only covers files.
  await page.waitForFunction(() => check.read().t > 3 && check.read().settled, null, {timeout: 25000});
  await open();
  for (const [bad, match] of [['do not turn my left palm down', /Try one movement/], ['right wrist pronation', /Try one movement/],
    ['turn my right palm down then open both hands', /Step 2/], ['turn both palms down', /Try one movement/]]) {
    const n = (await read()).move;
    await field.fill(bad); await field.press('Enter');
    assert.match(await page.locator('#ns-action-chat form [role=status]').textContent(), match);
    assert.equal((await read()).move, n);
  }
  await field.press('Escape');
  checkTurn(await move('right forearm pronation', {voice: true}), 'right', 1, 'lh_r_pronate');
  checkTurn(await move('turn my left palm down'), 'left', 1, 'pronation');
  checkTurn(await move('right forearm supination'), 'right', -1, 'lh_r_supinate', true);
  checkTurn(await move('left forearm supination'), 'left', -1, 'supination', true);
  const elbows = [];
  for (const [cue, direction, id] of [['right elbow flexion',1,'lh_r_elbow_flex'], ['right elbow extension',-1,'lh_r_elbow_extend']]) {
    const rows = await move(cue);
    const here = armTravel(rows, 'right'), other = armTravel(rows, 'left');
    const travel = rows.map(r => direction * (r.arms.right.flex - rows[0].arms.right.flex));
    assert.ok(rows.some(r => r.action === id) && Math.max(...travel) > (direction > 0 ? 50 : 1));
    assert.ok(Math.abs(travel.at(-1)) < 0.2, JSON.stringify({cue, start:rows[0], end:rows.at(-1), low:Math.min(...travel)}));
    assert.ok(Math.max(here.humerus, here.elbow, ...Object.values(other)) < 0.21, JSON.stringify({here,other}));
    assert.ok(rows.every(r => r.arms.right.pronation === rows[0].arms.right.pronation));
    elbows.push({ cue, initialDegrees:rows[0].arms.right.flex, travelDegrees:Math.max(...travel) });
  }
  const hands = [];
  for (const [cue, direction, id] of [['right hand open',-1,'lh_r_open'], ['right hand close',1,'lh_r_grasp']]) {
    const rows = await move(cue);
    const here = armTravel(rows,'right'), other = armTravel(rows,'left');
    const degrees = Math.max(...rows.map(r => direction * (r.index - rows[0].index)));
    assert.ok(rows.some(r => r.action === id) && degrees > 15);
    assert.ok(here.index > 10 && here.little > 10 && here.thumb > 5);
    assert.ok(Math.max(here.palm, here.ulna, here.radius, here.elbow, ...Object.values(other)) < 0.21);
    hands.push({cue, degrees, mm: here});
  }
  // A selected, manually bent arm has a held hand target. That separate
  // controller must let the palm orbit the radioulnar axis during a word cue.
  const selectedPostures = [];
  for (const [side, key, id] of [['left','1','pronation'], ['right','4','lh_r_pronate']]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(1000);
    await page.keyboard.down('s');
    try {
      await page.waitForFunction(side => check.read().arms[side].flex > 55, side, {timeout: 6000});
    } finally { await page.keyboard.up('s'); }
    await page.waitForTimeout(1000);
    const rows = await move('pronate my ' + side + ' forearm');
    checkTurn(rows, side, 1, id);
    selectedPostures.push({ side, initialFlexDegrees: rows[0].arms[side].flex });
  }
  await page.keyboard.press('Escape');
  await page.getByRole('button', {name:'Reset body', exact:true}).click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => check.read().mode === 'playing');
  await page.waitForTimeout(1000);
  // Use the normal limb-turn gesture to leave both palms at the opposite end.
  await page.keyboard.press('Space');
  await page.waitForTimeout(45);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => {
    const { arms } = check.read();
    return arms.left.pronation > 155 && arms.right.pronation > 155;
  }, null, {timeout: 12000});
  await page.waitForTimeout(900);
  checkTurn(await move('supinate my left forearm'), 'left', -1, 'supination');
  checkTurn(await move('turn my right palm up'), 'right', -1, 'lh_r_supinate');
  const series = await move('turn my left palm up then right hand close', {sequence: true});
  const second = series.findIndex(r => r.step.startsWith('Step 2 of 2'));
  assert.ok(second > 0 && series[second].action === 'lh_r_grasp');
  assert.ok(Math.abs(series[second - 1].arms.left.pronation - series[0].arms.left.pronation) < 0.2);
  await open(); await field.fill('turn my left palm up then right hand close'); await field.press('Enter');
  await page.locator('#ns-sequence-status').filter({hasText: 'Step 1 of 2'}).waitFor();
  const previous = (await read()).move;
  await page.keyboard.press('w');
  await page.waitForTimeout(2400);
  assert.equal((await read()).move, previous);
  assert.equal(await page.locator('#ns-sequence-status').textContent(), '');
  assert.deepEqual(await page.evaluate(() => [check.microphone, check.device]), [1, 0]);
  assert.deepEqual(requests.slice(beforeRequests), []);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({chromium: browser.version(), turns, selectedPostures, elbows, hands, seriesSteps: 2, manualOverride: true,
    voice: 'injected on-device transcript, reviewed before Move', deviceRequests: 0, commandRequests: 0, errors}));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
