// Use the game's packaged launcher and review-first voice flow. Native reference
// values come from CPU PyTorch on the same generated input and control edits.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHandler, HOST} from '../serve-local.mjs';

const cases = JSON.parse(readFileSync(new URL('./visual-balance-reference.json', import.meta.url)));
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
    const width = mobile ? 320 : 1280;
    const context = await browser.newContext({viewport:{width,height:mobile ? 640 : 800},
      isMobile:mobile, hasTouch:mobile, reducedMotion:'reduce'});
    const page = await context.newPage();
    const errors = [], requests = [], unexpected = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const probe = window.balanceProbe = {voice:0,capture:0};
      class LocalVoice {
        get processLocally() { return this.local; }
        set processLocally(value) { this.local = value; }
        start() {
          if (!this.local) throw Error('Unexpected remote speech');
          probe.voice++;
          this.onresult({results:[[{transcript:'Forecast my balance.'}]]});
          this.onend();
        }
        abort() {}
      }
      Object.defineProperty(window, 'SpeechRecognition', {value:LocalVoice});
      for (const method of ['getUserMedia','getDisplayMedia','enumerateDevices']) {
        Object.defineProperty(navigator.mediaDevices, method, {value:async () => {
          probe.capture++;
          throw Error('Unexpected device access');
        }});
      }
    });
    let corrupt = false;
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin || request.method() !== 'GET' || url.search || request.postData()) {
        unexpected.push([request.method(),url.href]);
        return route.abort();
      }
      requests.push(url.pathname);
      if (corrupt && url.pathname.endsWith('/visual-balance/weights.json')) {
        corrupt = false;
        return route.fulfill({contentType:'application/json',body:'{}'});
      }
      return route.continue();
    });
    const canvas = page.locator('#ns-canvas');
    const panel = page.locator('#ns-act-balance');
    const map = page.getByRole('dialog',{name:'Activity map'});
    const field = page.getByRole('textbox',{name:'Command box'});
    const ready = () => page.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
      document.querySelector('#ns-app').dataset.nsPhase === 'playing', null, {timeout:120000});
    const openF = () => mobile ? page.getByRole('button',{name:'F · Command box'}).tap() : canvas.press('f');
    const send = () => mobile ? page.getByRole('button',{name:'Move',exact:true}).tap() : field.press('Enter');
    const close = () => mobile ? map.getByRole('button',{name:'Back to game'}).tap() : page.keyboard.press('Escape');
    const choose = () => map.getByRole('button',{name:'Visual balance',exact:true}).click();
    const state = () => page.evaluate(() => ({moves:window.__nsQA.inspect().state.activity.moveSeq,...balanceProbe}));
    const direction = panel.getByRole('combobox',{name:'Scene rotation'});
    const travel = panel.getByRole('combobox',{name:'Change past sideways head travel'});
    const amplitude = panel.getByRole('combobox',{name:'Scalp voltage amplitude'});
    const outputs = {};
    async function check(name) {
      await panel.locator('[data-balance-ready]').waitFor();
      const expected = cases[name];
      assert.equal(await direction.inputValue(),String(expected.direction));
      assert.equal(await travel.inputValue(),String(expected.travel));
      assert.equal(await amplitude.inputValue(),String(expected.amplitude));
      const rows = await panel.locator('tbody tr').evaluateAll(rows => rows.map(row => [...row.cells].map(cell => cell.textContent)));
      assert.deepEqual(rows.map(row => row[0]), ['Sacrum · side to side','Sacrum · vertical','Sacrum · front to back',
        'Head · side to side','Head · vertical','Head · front to back']);
      for (const [i,branch] of ['full','no_scalp'].entries()) {
        rows.forEach((row,j) => {
          assert.match(row[i+1],/^[-+]?\d+\.\d{2}$/);
          assert.ok(Math.abs(Number(row[i+1])-expected[branch].flat()[j]) <= 0.00501,[name,row,expected[branch]]);
        });
      }
      outputs[name] = rows.map(row => row.slice(1));
      assert.match(await panel.getByRole('status').textContent(),/Invented walking event/);
      assert.ok(await panel.evaluate(el => {
        const rect = el.getBoundingClientRect(), dialog = el.closest('dialog');
        return rect.left >= 0 && rect.right <= innerWidth && dialog.scrollWidth <= dialog.clientWidth;
      }));
    }
    await page.goto(origin + '/START.html');
    await page.getByRole('link',{name:'Play the experimental preview'}).click();
    await ready();
    assert.ok(requests.every(path => !path.includes('/visual-balance/')));
    const before = await state();
    await openF();
    for (const wrong of ['do not forecast my balance','forecast my balance then bend my left knee',
                         'forecast my balance and open the camera']) {
      await field.fill(wrong);
      await send();
      assert.equal(await panel.isVisible(),false);
      assert.equal(await field.isVisible(),true);
    }
    assert.deepEqual(await state(),before);
    await page.waitForLoadState('networkidle');
    const startRequests = requests.length;
    await field.fill('Please forecast my balance.');
    await send();
    await check('original');
    assert.equal(await page.evaluate(() => document.activeElement.id),'ns-balance-title');
    await page.waitForLoadState('networkidle');
    const studyAssets = requests.slice(startRequests).sort();
    assert.deepEqual(studyAssets.map(path => path.replace('/scene/src/activity/visual-balance/','')),['panel.mjs','visual-walk.js','weights.json']);
    const loaded = requests.length;
    await direction.selectOption('-1');
    await check('counterclockwise');
    await travel.selectOption('3');
    await check('head');
    await amplitude.selectOption('1.5');
    await check('scalp');
    assert.notDeepEqual(outputs.head,outputs.counterclockwise);
    assert.notDeepEqual(outputs.scalp.map(row => row[0]),outputs.head.map(row => row[0]));
    assert.deepEqual(outputs.scalp.map(row => row[1]),outputs.head.map(row => row[1]));
    await direction.selectOption('1');
    await travel.selectOption('-3');
    await amplitude.selectOption('0.5');
    await check('other_edits');
    assert.equal(requests.length,loaded);
    assert.deepEqual(await state(),before);
    await close();
    await openF();
    await page.getByRole('button',{name:'Use voice'}).click();
    assert.equal(await field.inputValue(),'Forecast my balance.');
    assert.equal(await panel.isVisible(),false);
    await send(); await check('original'); await close();
    if (mobile) await page.getByRole('button',{name:'M · Activity map'}).tap();
    else await canvas.press('m');
    await choose(); await check('original');
    if (process.env.NS_SCREENSHOT_DIR) {
      await panel.getByRole('heading').scrollIntoViewIfNeeded();
      await page.screenshot({path:process.env.NS_SCREENSHOT_DIR + '/balance-' + width + '.png'});
    }
    if (mobile) {
      const table = panel.getByRole('table');
      await table.scrollIntoViewIfNeeded();
      assert.ok(await table.evaluate(el => {
        const first = el.querySelector('thead').getBoundingClientRect();
        const last = el.querySelector('tbody tr:last-child').getBoundingClientRect();
        const dialog = el.closest('dialog').getBoundingClientRect();
        return first.top >= dialog.top && last.bottom <= dialog.bottom;
      }));
      if (process.env.NS_SCREENSHOT_DIR) {
        await page.screenshot({path:process.env.NS_SCREENSHOT_DIR + '/balance-mobile-table.png'});
      }
    }
    await close();
    assert.deepEqual(await state(),{moves:before.moves,voice:1,capture:0});
    if (!mobile) {
      await page.reload(); await ready();
      corrupt = true;
      await openF(); await field.fill('forecast my balance'); await send();
      await panel.getByText('The balance models could not open.',{exact:false}).waitFor();
      assert.equal(await panel.locator('tbody tr').count(),0);
      assert.equal(await panel.locator('[data-balance-ready]').isVisible(),false);
      await choose(); await check('original');
    }
    assert.deepEqual(unexpected,[]); assert.deepEqual(errors,[]);
    reports.push({width, touch:mobile, studyAssets, outputs, reviewedLocalVoice:1, captureCalls:0,
      externalRequests:unexpected, damagedWeightsRetry:!mobile});
    await context.close();
  }
  console.log(JSON.stringify({browser:browser.version(),reports}));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
