// Use the game's packaged launcher and review-first voice flow. Native reference
// values come from CPU PyTorch on the same generated input and control edits.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHandler, HOST} from '../serve-local.mjs';

const cases = JSON.parse(readFileSync(new URL('./muscle-motion-reference.json', import.meta.url)));
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
      const probe = window.muscleProbe = {voice:0,capture:0};
      class LocalVoice {
        get processLocally() { return this.local; }
        set processLocally(value) { this.local = value; }
        start() {
          if (!this.local) throw Error('Unexpected remote speech');
          probe.voice++;
          this.onresult({results:[[{transcript:'Forecast muscle and movement while walking.'}]]});
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
      if (corrupt && url.pathname.endsWith('/muscle-motion/weights.json')) {
        corrupt = false;
        return route.fulfill({contentType:'application/json',body:'{}'});
      }
      return route.continue();
    });
    const canvas = page.locator('#ns-canvas');
    const panel = page.locator('#ns-act-muscle');
    const map = page.getByRole('dialog',{name:'Activity map'});
    const field = page.getByRole('textbox',{name:'Command box'});
    const ready = () => page.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
      document.querySelector('#ns-app').dataset.nsPhase === 'playing', null, {timeout:120000});
    const openF = () => mobile ? page.getByRole('button',{name:'F · Command box'}).tap() : canvas.press('f');
    const send = () => mobile ? page.getByRole('button',{name:'Move',exact:true}).tap() : field.press('Enter');
    const close = () => mobile ? map.getByRole('button',{name:'Back to game'}).tap() : page.keyboard.press('Escape');
    const choose = () => map.getByRole('button',{name:'Muscle and movement',exact:true}).click();
    const state = () => page.evaluate(() => ({moves:window.__nsQA.inspect().state.activity.moveSeq,...muscleProbe}));
    const posture = panel.getByRole('combobox',{name:'Posture'});
    const direction = panel.getByRole('combobox',{name:'Scene rotation'});
    const amplitude = panel.getByRole('combobox',{name:'Past leg voltage'});
    const observed = {};
    async function check(name) {
      try { await panel.locator('[data-muscle-ready]').waitFor({timeout:10000}); }
      catch(error) {
        console.error(JSON.stringify({status:await panel.locator('[role=status]').textContent(),
          panelVisible:await panel.isVisible(),active:await page.evaluate(()=>document.activeElement.outerHTML.slice(0,160)),
          errors,studyRequests:requests.filter(path=>path.includes('/muscle-motion/'))}));
        throw error;
      }
      const expected = cases[name];
      assert.equal(await posture.inputValue(),String(expected.posture));
      assert.equal(await direction.inputValue(),String(expected.direction));
      assert.equal(await amplitude.inputValue(),String(expected.amplitude));
      const readTable = selector => panel.locator(selector+' tbody tr').evaluateAll(rows =>
        rows.map(row => [...row.cells].map(cell => cell.textContent)));
      const muscles = await readTable('[data-muscle-voltage-table]');
      assert.deepEqual(muscles.map(row => row[0]),['Tibialis anterior','Soleus','Medial gastrocnemius','Peroneus longus']);
      const path = await readTable('[data-path]');
      assert.equal(path.length,32);
      const assertNear = (display,reference) => {
        assert.match(display,/^[-+]?\d+\.\d{2}$/);
        assert.ok(Math.abs(Number(display)-reference) <= .00501,[name,display,reference]);
      };
      const rms = [];
      muscles.forEach((row,i) => {
        assertNear(row[1],expected.future_rms_uv[i]);
        assertNear(row[2],expected.future_rms_uv[i+4]);
        rms.push(row[1],row[2]);
      });
      path.forEach(([time,...xyz],i) => {
        assert.equal(Number(time),Number(((i+1)*1000/256).toFixed(2)));
        xyz.forEach((value,j) => assertNear(value,expected.future_path_mm[i][j]));
      });
      const ends = await panel.locator('figure output').allTextContents();
      assert.deepEqual(ends,path.at(-1).slice(1).map(value => value+' mm'));
      const points = await panel.locator('polyline').evaluateAll(lines => lines.map(line => [...line.points].map(p => [p.x,p.y])));
      assert.equal(points.length,3);
      const bound = Math.max(1,Math.ceil(Math.max(...expected.future_path_mm.flat().map(Math.abs))));
      points.forEach((trajectory,axis) => {
        assert.equal(trajectory.length,33);
        assert.deepEqual(trajectory[0],[44,65]);
        trajectory.slice(1).forEach(([x,y],i) => {
          assert.equal(x,44+316*(i+1)/32);
          assert.ok(Math.abs(y-(65-48*expected.future_path_mm[i][axis]/bound)) < .001,[name,i,axis,y]);
        });
      });
      assert.match(await panel.locator('[role=status]').textContent(),new RegExp('synthetic history · '+(expected.posture ? 'walking':'standing')));
      assert.ok(await panel.evaluate(el => {
        const rect = el.getBoundingClientRect(), dialog = el.closest('dialog');
        return rect.left >= 0 && rect.right <= innerWidth && dialog.scrollWidth <= dialog.clientWidth;
      }));
      observed[name] = {rms,endpoint:ends};
    }
    await page.goto(origin + '/START.html');
    await page.getByRole('link',{name:'Play the experimental preview'}).click();
    await ready();
    assert.ok(requests.every(path => !path.includes('/muscle-motion/')));
    const before = await state();
    await openF();
    for (const wrong of ['do not forecast muscle and movement','forecast muscle and movement then bend my left knee',
                         'forecast muscle and movement and open the camera']) {
      await field.fill(wrong); await send();
      assert.equal(await panel.isVisible(),false);
      assert.equal(await field.isVisible(),true);
    }
    assert.deepEqual(await state(),before);
    await page.waitForLoadState('networkidle');
    const startRequests = requests.length;
    await field.fill('Please forecast muscle and movement.'); await send(); await check('standing');
    assert.equal(await page.evaluate(() => document.activeElement.id),'ns-muscle-title');
    await page.waitForLoadState('networkidle');
    const studyAssets = requests.slice(startRequests).sort();
    assert.deepEqual(studyAssets.map(path => path.replace('/scene/src/activity/muscle-motion/','')),
      ['model.js','panel.mjs','synthetic-event.json','weights.json']);
    const loaded = requests.length;
    await posture.selectOption('1'); await check('walking');
    await direction.selectOption('-1'); await check('other_rotation');
    await amplitude.selectOption('1.5'); await check('higher_voltage');
    await posture.selectOption('0'); await amplitude.selectOption('0.5'); await check('lower_voltage');
    assert.notDeepEqual(observed.standing,observed.walking);
    assert.notDeepEqual(observed.other_rotation,observed.higher_voltage);
    assert.equal(requests.length,loaded);
    assert.deepEqual(await state(),before);
    const save = file => process.env.NS_SCREENSHOT_DIR &&
      page.screenshot({path:process.env.NS_SCREENSHOT_DIR+'/'+file+'-'+width+'.png'});
    await panel.locator('figure').scrollIntoViewIfNeeded(); await save('muscle-path');
    await panel.locator('[data-muscle-voltage-table]').scrollIntoViewIfNeeded(); await save('muscle-voltage');
    await panel.getByText('Read all 32 predicted positions').click();
    const table = panel.locator('[data-path]');
    await table.locator('tbody tr').last().scrollIntoViewIfNeeded();
    assert.ok(await table.locator('tbody tr').last().isVisible());
    assert.ok(await table.evaluate(el => el.getBoundingClientRect().right <= innerWidth));
    await close();
    await openF(); await page.getByRole('button',{name:'Use voice'}).click();
    assert.equal(await field.inputValue(),'Forecast muscle and movement while walking.');
    assert.equal(await panel.isVisible(),false);
    await send(); await check('walking'); await close();
    if (mobile) await page.getByRole('button',{name:'M · Activity map'}).tap();
    else await canvas.press('m');
    await map.getByRole('button',{name:'Game pathways'}).click();
    assert.match(await page.locator('#ns-act-game [data-muscles]').textContent(),/avatar/i);
    await choose(); await check('standing'); await close();
    assert.deepEqual(await state(),{moves:before.moves,voice:1,capture:0});
    if (!mobile) {
      await page.reload(); await ready(); corrupt = true;
      await openF(); await field.fill('forecast muscle and movement'); await send();
      await panel.getByText('The model could not open.',{exact:false}).waitFor();
      assert.equal(await panel.locator('[data-muscle-ready]').isVisible(),false);
      await choose(); await check('standing');
    }
    assert.deepEqual(unexpected,[]); assert.deepEqual(errors,[]);
    reports.push({width, touch:mobile, studyAssets, observed, reviewedLocalVoice:1, captureCalls:0,
      externalRequests:unexpected, damagedWeightsRetry:!mobile});
    await context.close();
  }
  console.log(JSON.stringify({browser:browser.version(),reports}));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
