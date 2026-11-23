// START → Play → F / M. The oracle contains CPU PyTorch predictions on
// the same invented input; the UI runs the bundled JavaScript weights.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHandler, HOST} from '../serve-local.mjs';

const reference = JSON.parse(readFileSync(new URL('./walking-instruction-reference.json', import.meta.url)));
const {chromium} = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const allowedHosts = new Set();
const server = createServer(createHandler({root, allowedHosts})).listen(0, HOST);
await once(server, 'listening');
const host = HOST + ':' + server.address().port;
allowedHosts.add(host);
const origin = 'http://' + host;

let browser;
try {
  const args = ['--disable-background-networking'];
  if (process.env.NS_ANGLE) args.push('--use-angle=' + process.env.NS_ANGLE);
  browser = await chromium.launch({executablePath:process.env.NS_CHROMIUM, args});
  const reports = [];
  for (const mobile of [false, true]) {
    const context = await browser.newContext({viewport:mobile ? {width:320,height:640} : {width:1280,height:800},
      reducedMotion:'reduce', isMobile:mobile, hasTouch:mobile});
    const page = await context.newPage();
    const errors = [], requests = [], unexpected = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      const probe = window.probe = {speech:0,camera:0,heard:'Forecast fast walking without running.'};
      class LocalVoice {
        get processLocally() { return this.local; }
        set processLocally(value) { this.local = value; }
        start() {
          if (!this.local) throw Error('Only reviewed local speech is supported');
          probe.speech++;
          this.onresult({results:[[{transcript:probe.heard}]]});
          this.onend();
        }
        abort() {}
      }
      Object.defineProperty(window, 'SpeechRecognition', {value:LocalVoice});
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {value:async () => {
        probe.camera++;
        throw new Error('Unexpected device request');
      }});
    });
    let corrupt = false;
    await context.route('**/*', route => {
      const r = route.request(), url = new URL(r.url());
      if (url.origin !== origin || r.method() !== 'GET' || url.search || r.postData()) {
        unexpected.push([r.method(), url.href]);
        return route.abort();
      }
      requests.push(url.pathname);
      if (corrupt && url.pathname.endsWith('/walking-instruction/weights.json')) {
        corrupt = false;
        return route.fulfill({contentType:'application/json', body:'{}'});
      }
      return route.continue();
    });

    const field = page.getByRole('textbox', {name:'Command box'});
    const panel = page.locator('#ns-act-pace');
    const map = page.getByRole('dialog', {name:'Activity map'});
    const cue = panel.getByRole('combobox', {name:'Walking instruction'});
    const canvas = page.locator('#ns-canvas');
    const openF = () => mobile ? page.getByRole('button', {name:'F · Command box'}).tap() : canvas.press('f');
    const send = () => mobile ? page.getByRole('button', {name:'Move', exact:true}).tap() : field.press('Enter');
    const close = () => mobile ? map.getByRole('button', {name:'Back to game'}).tap() : page.keyboard.press('Escape');
    const ready = () => page.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
      document.querySelector('#ns-app').dataset.nsPhase === 'playing', null, {timeout:120000});
    const state = () => page.evaluate(() => ({move:window.__nsQA.inspect().state.activity.moveSeq,
      speech:probe.speech,camera:probe.camera}));
    const values = {};
    async function check(code) {
      await panel.locator('[data-pace-ready]').waitFor();
      assert.equal(await cue.inputValue(), String(code));
      assert.equal(await panel.locator('[data-pace-cue]').textContent(), code === 4 ? 'As usual' : 'Fast but not running');
      assert.match(await panel.getByRole('status').textContent(), /Invented history/);
      const rows = await panel.locator('tbody tr').evaluateAll(rows => rows.map(row => [...row.cells].map(c => c.textContent)));
      assert.deepEqual(rows.map(row => row[0]), ['Pelvis forward','Pelvis left','Pelvis up','Right heel forward','Right heel left','Right heel up']);
      for (const [j, name] of [String(code), 'none'].entries()) {
        rows.forEach((row, i) => {
          assert.match(row[j + 1], /^[-+]?\d+\.\d mm$/);
          assert.ok(Math.abs(parseFloat(row[j + 1]) - reference[name].flat()[i]) <= 0.05001, row.join(' / '));
        });
      }
      values[code] = rows.map(row => row.slice(1));
      assert.ok(await panel.evaluate(el => {
        const rect = el.getBoundingClientRect(), dialog = el.closest('dialog');
        return rect.left >= 0 && rect.right <= innerWidth && dialog.scrollWidth <= dialog.clientWidth;
      }));
    }

    await page.goto(origin + '/START.html');
    await page.getByRole('link', {name:'Play the experimental preview'}).click();
    await ready();
    const before = await state();
    await openF();
    for (const wrong of ['do not forecast my usual walk','forecast fast running',
      'forecast my usual walk then bend my left knee','forecast my usual walk and open the camera']) {
      await field.fill(wrong); await send(); assert.equal(await panel.isVisible(), false);
      assert.equal(await field.isVisible(), true);
    }
    assert.deepEqual(await state(), before);
    await page.waitForLoadState('networkidle');
    const first = requests.length;
    await field.fill('Please forecast my usual walk.'); await send();
    await check(4);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'ns-pace-title');
    await page.waitForLoadState('networkidle');
    const studyAssets = requests.slice(first).sort();
    assert.deepEqual(studyAssets.map(p => p.replace('/scene/src/activity/walking-instruction/', '')),
      ['input.json','panel.mjs','predict.js','weights.json']);
    const loaded = requests.length;
    await cue.selectOption('5'); await check(5);
    assert.notDeepEqual(values[4].map(c => c[0]), values[5].map(c => c[0]));
    assert.deepEqual(values[4].map(c => c[1]), values[5].map(c => c[1]));
    assert.equal(requests.length, loaded);
    assert.deepEqual(await state(), before);
    await close();

    await openF();
    await page.getByRole('button', {name:'Use voice'}).click();
    assert.equal(await field.inputValue(), 'Forecast fast walking without running.');
    assert.equal(await panel.isVisible(), false);
    await send(); await check(5); await close();
    if (mobile) await page.getByRole('button', {name:'M · Activity map'}).tap();
    else await canvas.press('m');
    await map.getByRole('button', {name:'Walking instructions',exact:true}).click();
    await check(4);
    await close();
    assert.deepEqual(await state(), {move:before.move,speech:1,camera:0});

    // Reopen over a damaged response; after a clean retry no stale numbers remain.
    if (!mobile) {
      await page.reload();
      await ready();
      corrupt = true;
      await openF();
      await field.fill('Forecast fast but not running'); await send();
      await panel.getByText('The walking instruction model could not open.', {exact:false}).waitFor();
      assert.equal(await panel.locator('[data-pace-ready]').isVisible(), false);
      await map.getByRole('button', {name:'Walking instructions',exact:true}).click();
      await check(4);
    }
    assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
    reports.push({width:mobile ? 320 : 1280,touch:mobile,values,studyAssets,unexpected,
      forecastDeviceStarts:0,reviewedLocalVoice:1,damagedWeightsRetry:!mobile});
    await context.close();
  }
  console.log(JSON.stringify({browser:browser.version(),reports}));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
