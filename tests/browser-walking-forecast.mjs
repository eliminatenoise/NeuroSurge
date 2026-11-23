// Run through START → Play → F and M. Expected values come from the fitted
// PyTorch encoder on the original and edited invented inputs.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHandler, HOST} from '../serve-local.mjs';

const {chromium} = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const reference = JSON.parse(readFileSync(new URL('./walking-forecast-reference.json', import.meta.url)));
const root = fileURLToPath(new URL('../', import.meta.url));
const allowedHosts = new Set();
const server = createServer(createHandler({root, allowedHosts})).listen(0, HOST);
await once(server, 'listening');
const host = HOST + ':' + server.address().port;
const origin = 'http://' + host;
allowedHosts.add(host);

let browser;
try {
  const args = ['--disable-background-networking'];
  if (process.env.NS_ANGLE) args.push('--use-angle=' + process.env.NS_ANGLE);
  browser = await chromium.launch({executablePath:process.env.NS_CHROMIUM, args});
  const page = await browser.newPage({viewport:{width:1280,height:800},reducedMotion:'reduce'});
  const errors = [], requests = [], blocked = [];
  let corruptNextWeights = false;
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const r = route.request(), url = new URL(r.url());
    if (url.origin !== origin || r.method() !== 'GET' || url.search || r.postData()) {
      blocked.push([r.method(),url.href]);
      return route.abort();
    }
    requests.push(url.pathname);
    if (corruptNextWeights && url.pathname.endsWith('/gait-pair/joint-model.json')) {
      corruptNextWeights = false;
      return route.fulfill({contentType:'application/json', body:'{}'});
    }
    return route.continue();
  });
  await page.addInitScript(() => {
    window.forecastProbe = {speech:0, devices:0};
    class Dictation {
      get processLocally() { return this.local; }
      set processLocally(value) { this.local = value; }
      start() {
        if (!this.local) throw Error('Speech must stay on device');
        forecastProbe.speech++;
        this.onresult({results:[[{transcript:'Show the walking forecast.'}]]});
        this.onend();
      }
      abort() {}
    }
    Object.defineProperty(window, 'SpeechRecognition', {value:Dictation});
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async () => {
      forecastProbe.devices++;
      throw new DOMException('No camera in test','NotAllowedError');
    }});
  });
  await page.goto(origin + '/START.html');
  await page.getByRole('link',{name:'Play the experimental preview'}).click();
  await page.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
    document.querySelector('#ns-app').dataset.nsPhase === 'playing', null, {timeout:120000});
  const canvas = page.locator('#ns-canvas');
  const field = page.getByRole('textbox', {name:'Command box'});
  const study = page.locator('#ns-act-gait');
  const ready = study.locator('[data-gait-ready]');
  const slider = study.getByRole('slider');
  const map = page.getByRole('dialog', {name:'Activity map'});
  const move = () => page.evaluate(() => window.__nsQA.inspect().state.activity.moveSeq);
  const probe = () => page.evaluate(() => window.forecastProbe);
  const open = async () => { await canvas.press('f'); await field.waitFor(); };
  async function check(extra) {
    const expected = reference[String(extra)];
    const cells = await study.locator('tbody td:last-child').allTextContents();
    const baseline = await study.locator('tbody td:first-of-type').allTextContents();
    assert.equal(cells.length, 4);
    baseline.forEach((v, i) => assert.ok(Math.abs(parseFloat(v) - reference['0'][i]) <= (i < 3 ? .0051 : .0501)));
    cells.forEach((text, i) => {
      assert.match(text, i < 3 ? /^[-+]?\d+\.\d{2} mm$/ : /^-?\d+\.\d N$/);
      assert.ok(Math.abs(parseFloat(text) - expected[i]) <= (i < 3 ? .0051 : .0501), text + ' / ' + expected[i]);
    });
    return cells;
  }
  const noChange = await move();
  await open();
  for (const bad of ['please do not forecast heel movement', 'forecast left heel movement',
    'forecast heel movement then bend my right elbow', 'show the walking forecast and open my hand']) {
    await field.fill(bad);
    await field.press('Enter');
    assert.equal(await study.isVisible(), false);
    assert.equal(await field.isVisible(), true);
  }
  assert.ok(!requests.some(url => url.includes('/gait-pair/')));
  assert.equal(await move(), noChange);
  await field.fill('Please forecast right heel movement.');
  await field.press('Enter');
  await ready.waitFor();
  assert.match(await study.locator('p[role=status]').textContent(), /Invented input/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ns-gait-title');
  const examples = {'0':await check(0)};
  await page.waitForLoadState('networkidle');
  const requestCount = requests.length;
  await slider.press('End');
  examples['3'] = await check(3);
  await slider.press('Home');
  examples['-3'] = await check(-3);
  assert.notDeepEqual(examples['3'], examples['-3']);
  assert.equal(requests.length, requestCount, 'changing inputs issued a request');
  assert.deepEqual(await probe(), {speech:0, devices:0});
  assert.equal(await move(), noChange);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ns-canvas');
  await page.setViewportSize({width:320,height:640});
  await open();
  await page.getByRole('button', {name:'Use voice'}).click();
  assert.equal(await field.inputValue(), 'Show the walking forecast.');
  assert.equal(await study.isVisible(), false);
  await field.press('Enter');
  await ready.waitFor();
  await check(0);
  assert.ok(await study.evaluate(el => {
    const b = el.getBoundingClientRect(), dialog = el.closest('dialog');
    return b.left >= 0 && b.right <= innerWidth && dialog.scrollWidth <= dialog.clientWidth;
  }));
  await map.getByRole('button', {name:'Back to game'}).click();
  await canvas.press('m');
  await map.getByRole('button', {name:'Walking forecast'}).click();
  await ready.waitFor();
  await check(0);
  assert.equal(await map.getByRole('button', {name:'Walking forecast'}).getAttribute('aria-pressed'),'true');
  assert.equal(await move(), noChange);
  assert.deepEqual(await probe(), {speech:1, devices:0});
  assert.deepEqual(blocked, []);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
    document.querySelector('#ns-app').dataset.nsPhase === 'playing', null, {timeout:120000});
  corruptNextWeights = true;
  await open();
  await field.fill('forecast heel movement');
  await field.press('Enter');
  await study.getByText('The local walking model could not open.', {exact:false}).waitFor();
  assert.equal(await ready.isVisible(), false);
  await map.getByRole('button', {name:'Walking forecast'}).click();
  await ready.waitFor();
  await check(0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({browser:browser.version(),examples,gameMovementCounter:noChange,
    forecastAssets:requests.filter(x => x.includes('/gait-pair/')),speech:'one reviewed local fixture',
    recoveredAfterDamagedWeights:true,externalOrDataRequests:blocked.length,devices:(await probe()).devices,widths:[1280,320]}));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
