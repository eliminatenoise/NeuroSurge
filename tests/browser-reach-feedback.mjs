// The ordinary launcher and the on-device transcript handoff. No real devices.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {createHandler, HOST} from '../serve-local.mjs';
const {chromium} = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const oracle = JSON.parse(readFileSync(new URL('reach-feedback-reference.json', import.meta.url)));
const recordings = JSON.parse(readFileSync(new URL('../scene/src/activity/reach-feedback/recordings.json', import.meta.url)));
const hosts = new Set(), server = createServer(createHandler({root, allowedHosts:hosts})).listen(0, HOST);
await once(server, 'listening');
const host = HOST + ':' + server.address().port, origin = 'http://' + host;
hosts.add(host);
let browser;
try {
  const args = ['--disable-background-networking'];
  if (process.env.NS_ANGLE) args.push('--use-angle=' + process.env.NS_ANGLE);
  browser = await chromium.launch({executablePath:process.env.NS_CHROMIUM, args});
  const reports = [];
  for (const width of [1280, 320]) {
    const mobile = width === 320;
    const page = await browser.newPage({viewport:{width,height:840}, isMobile:mobile, hasTouch:mobile, reducedMotion:'reduce'});
    const outside = [], errors = [], assets = [];
    await page.route('**/*', async route => {
      if (new URL(route.request().url()).origin !== origin) {
        outside.push(route.request().url());
        return route.abort();
      }
      if (route.request().url().includes('/reach-feedback/')) assets.push(route.request().url());
      return route.continue();
    });
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      window.deviceRequests = 0;
      window.speechStarts = 0;
      for (const api of ['getUserMedia','getDisplayMedia','enumerateDevices']) {
        Object.defineProperty(navigator.mediaDevices, api, {value() { ++window.deviceRequests; throw Error('Unexpected device access'); }});
      }
      class LocalSpeech {
        get processLocally() { return this.local; }
        set processLocally(v) { this.local = v; }
        start() {
          if (this.processLocally !== true) throw Error('Expected on-device speech');
          ++window.speechStarts;
          this.onresult({results:[[{transcript:'Forecast a reach and its sensory feedback.'}]]});
          this.onend();
        }
        abort() {}
      }
      Object.defineProperty(window, 'SpeechRecognition', {value:LocalSpeech});
    });
    await page.goto(origin + '/START.html');
    await page.getByRole('link', {name:'Play the experimental preview'}).click();
    await page.waitForFunction(() => window.__nsQA?.inspect().features.bodyRig &&
      document.querySelector('#ns-app').dataset.nsPhase === 'playing', null, {timeout:120000});
    assert.equal(assets.length, 0);
    const seq = () => page.evaluate(() => window.__nsQA.inspect().state.activity.moveSeq);
    const before = await seq(), canvas = page.locator('#ns-canvas'), map = page.getByRole('dialog', {name:'Activity map'});
    const panel = page.locator('#ns-act-reach-feedback'), results = panel.locator('[data-feedback-results]');
    const enter = page.getByRole('button', {name:'F · Command box'});
    const command = page.getByRole('textbox', {name:'Command box'});
    if (mobile) await enter.tap(); else await canvas.press('f');
    if (mobile) {
      await page.getByRole('button', {name:'Use voice'}).tap();
      assert.equal(await command.inputValue(), 'Forecast a reach and its sensory feedback.');
      assert.equal(await map.isVisible(), false);
      await page.getByRole('button', {name:'Move',exact:true}).tap();
    } else {
      await command.fill('forecast a reach and its sensory feedback');
      await command.press('Enter');
    }
    await results.waitFor();
    const inspectMotion = () => panel.locator('[data-motion-table] tbody tr').evaluateAll(rows =>
      rows.map(r => Array.from(r.cells).slice(1).map(c => Number(c.textContent))));
    const inspectCount = () => panel.locator('[data-count-table] tbody tr').evaluateAll(rows =>
      rows.map(r => Number(r.cells[1].textContent)));
    let checks = 0;
    function near(actual, expected) { assert.ok(Math.abs(actual - expected) <= .000501); checks++; }
    for (const split of ['within', 'transfer']) {
      await panel.getByLabel('Held recording').selectOption(split);
      const measured = recordings[split].measured, expected = oracle[split];
      for (const [field, offset, axes, factor] of [['hand',0,3,1000],['elbow',3,3,1000],['handle',6,2,1]]) {
        await panel.getByLabel('Tracked point').selectOption(field);
        for (const time of [0, 4, 9]) {
          await panel.getByLabel('Time after last position').selectOption(String(time));
          const values = await inspectMotion();
          assert.equal(values.length, axes);
          for (let j = 0; j < axes; j++) {
            near(values[j][0], measured.movement[time][offset+j] * factor);
            near(values[j][1], expected.movement[time][offset+j] * factor);
          }
        }
      }
      for (const i of [0, 11, 22]) {
        await panel.getByLabel('Recorded unit').selectOption(String(i));
        for (const t of [-1, 0, 9]) {
          await panel.getByLabel('Count interval after cutoff').selectOption(String(t));
          const values = await inspectCount();
          const count = array => t < 0 ? array.reduce((sum, row) => sum + row[i], 0) : array[t][i];
          for (const [a, series] of [measured.delayed,expected.direct,expected.full].entries()) near(values[a], count(series));
        }
      }
      assert.ok(await map.evaluate(d => d.scrollWidth <= d.clientWidth));
    }
    if (mobile) await map.getByRole('button', {name:'Back to game'}).tap(); else await page.keyboard.press('Escape');
    assert.equal(await canvas.evaluate(e => e === e.ownerDocument.activeElement), true);
    if (mobile) await page.getByRole('button', {name:'M · Activity map'}).tap(); else await canvas.press('m');
    await map.getByRole('button',{name:'Reach and spikes',exact:true}).click();
    await results.waitFor();
    await panel.getByLabel('Held recording').selectOption('within');
    await panel.getByLabel('Tracked point').selectOption('hand');
    await panel.getByLabel('Time after last position').selectOption('9');
    await panel.getByLabel('Recorded unit').selectOption('0');
    await panel.getByLabel('Count interval after cutoff').selectOption('-1');
    if (process.env.NS_REACH_EVIDENCE) {
      await panel.locator('h2').evaluate(el => el.scrollIntoView({block:'start'}));
      await map.screenshot({path:process.env.NS_REACH_EVIDENCE + '/game-' + width + '.png'});
      await panel.locator('[data-count-table]').evaluate(el => el.scrollIntoView({block:'center'}));
      await map.screenshot({path:process.env.NS_REACH_EVIDENCE + '/game-counts-' + width + '.png'});
    }
    await map.getByRole('button',{name:'Cortical reach',exact:true}).click();
    await map.locator('[data-reach-results]').waitFor();
    await map.getByRole('button',{name:'Reach and spikes',exact:true}).click();
    await results.waitFor();
    near((await inspectMotion())[0][1],oracle.within.movement[9][0]*1000);
    await map.getByRole('button',{name:'Back to game'}).click();
    assert.equal(await seq(), before);
    assert.deepEqual(errors, []); assert.deepEqual(outside, []);
    assert.equal(await page.evaluate(() => window.deviceRequests), 0);
    assert.equal(await page.evaluate(() => window.speechStarts), mobile ? 1 : 0);
    assert.equal(assets.filter(s => s.endsWith('models.json')).length, 1);
    reports.push({width, input:mobile?'on-device speech stub, touch':'typed, keyboard', checks, errors, outside, deviceRequests:0});
    await page.close();
  }
  console.log(JSON.stringify(reports));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
