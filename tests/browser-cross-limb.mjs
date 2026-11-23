// Use the game's packaged launcher and review-first voice flow. Native reference
// values come from CPU PyTorch on the same generated input and control edits.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHandler, HOST} from '../serve-local.mjs';

const cases = JSON.parse(readFileSync(new URL('./cross-limb-reference.json', import.meta.url)));
const mapCases = JSON.parse(readFileSync(new URL('./cross-limb-map-reference.json', import.meta.url)));
const scalpCases=JSON.parse(readFileSync(new URL('./scalp-forecast-reference.json',import.meta.url)));
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
      const probe = window.limbProbe = {voice:0,capture:0, transcript:'Forecast my pelvis path.'};
      class LocalVoice {
        get processLocally() { return this.local; }
        set processLocally(value) { this.local = value; }
        start() {
          if (!this.local) throw Error('Unexpected remote speech');
          probe.voice++;
          this.onresult({results:[[{transcript:probe.transcript}]]});
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
      if (corrupt && url.pathname.endsWith('/cross-limb/model-joint.json')) {
        corrupt = false;
        return route.fulfill({contentType:'application/json',body:'{}'});
      }
      return route.continue();
    });
    const canvas = page.locator('#ns-canvas');
    const panel = page.locator('#ns-act-limb');
    const map = page.getByRole('dialog',{name:'Activity map'});
    const field = page.getByRole('textbox',{name:'Command box'});
    const ready = () => page.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
      document.querySelector('#ns-app').dataset.nsPhase === 'playing', null, {timeout:120000});
    const openF = () => mobile ? page.getByRole('button',{name:'F · Command box'}).tap() : canvas.press('f');
    const send = () => mobile ? page.getByRole('button',{name:'Move',exact:true}).tap() : field.press('Enter');
    const close = () => mobile ? map.getByRole('button',{name:'Back to game'}).tap() : page.keyboard.press('Escape');
    const choose = () => map.getByRole('button',{name:'Wrist and pelvis',exact:true}).click();
    const state = () => page.evaluate(() => ({moves:window.__nsQA.inspect().state.activity.moveSeq,capture:limbProbe.capture,voice:limbProbe.voice}));
    const task = panel.getByLabel('Movement task');
    const posture = panel.getByLabel('Posture');
    const direction = panel.getByLabel('Scene rotation');
    const amp = panel.getByLabel('Earlier muscle amplitude');
    const travel = panel.getByLabel('Earlier marker travel');
    const read = selector => panel.locator(selector + ' tbody tr').evaluateAll(rows =>
      rows.map(row => [...row.cells].map(cell => cell.textContent)));
    const branches = ['joint','specialist'];
    const observed = {};

    async function check(name) {
      const expected = cases[name], {domain, session, sign, amplitude, distance} = expected.input;
      await panel.locator('[data-forecasts]').waitFor({timeout:10000});
      assert.equal(await task.inputValue(),domain);
      assert.equal(await amp.inputValue(),String(amplitude));
      assert.equal(await travel.inputValue(),String(distance));
      assert.equal(await posture.isVisible(),domain === 'lower');
      if (domain === 'lower') {
        assert.equal(await posture.inputValue(),String(session));
        assert.equal(await direction.inputValue(),String(sign));
      }
      const muscleRows = await read('[data-limb-rms]');
      const pathRows = await Promise.all([1,2].map(i => read('[data-path-tables] table:nth-child('+i+')')));
      const ends = await read('[data-limb-end]');
      const units = await panel.locator('[data-limb-rms] caption').innerText();
      const condition = await panel.locator('[data-condition]').innerText();
      const upper = domain === 'upper';
      assert.ok(units.endsWith(upper ? 'source amplitude units' : 'µV'));
      assert.match(condition,upper ? /400 ms after/ : /129 ms after/);
      const assessment = await panel.locator('[data-assessment]').textContent();
      assert.match(assessment,upper ? /882 recorded lifts from three/ : /1,759 recorded rotations from six/);
      assert.match(assessment,upper ? /4.87 mm/ : /2.17 mm/);
      assert.equal(muscleRows.length,upper ? 5 : 8);
      assert.deepEqual(muscleRows.map(row => row[0]),upper
        ? ['Right anterior deltoid','Right brachioradialis','Right flexor digitorum','Right common extensor digitorum','Right first dorsal interosseous']
        : ['Left','Right'].flatMap(side =>
          ['tibialis anterior','soleus','medial gastrocnemius','peroneus longus'].map(muscle => side + ' ' + muscle)));
      assert.deepEqual(ends.map(row => row[0]),upper ? ['X','Y','Z'] : ['Side to side','Vertical','Front to back']);
      assert.equal(pathRows[0].length,32);
      assert.equal(pathRows[1].length,32);
      assert.equal(ends.length,3);
      const points = await panel.locator('polyline').evaluateAll(lines =>
        lines.map(line => [...line.points].map(p => [p.x,p.y])));
      assert.equal(points.length,6);
      const limit = Math.max(1,Math.ceil(Math.max(...branches.flatMap(branch =>
        expected[branch].path_mm.flat().map(Math.abs)))));
      function near(display,value,decimals=2) {
        if (value === null) return assert.equal(display,'Unavailable');
        assert.match(display,decimals === 2 ? /^[-+]?\d+\.\d{2}$/ : /^[-+]?\d+\.\d{4}$/);
        assert.ok(Math.abs(Number(display)-value) <= 0.501 * 10**(-decimals), [name,display,value]);
      }
      branches.forEach((branch,b) => {
        const {rms,path_mm} = expected[branch];
        muscleRows.forEach((row,i) => near(row[b+1],rms[i + (upper ? 8 : 0)],upper ? 4 : 2));
        ends.forEach((row,axis) => near(row[b+1],path_mm[31][axis]));
        pathRows[b].forEach(([time,...xyz],i) => {
          assert.equal(Number(time),Number(((i+1)*1000/256).toFixed(3)));
          xyz.forEach((v,axis) => near(v,path_mm[i][axis]));
        });
        for (let axis=0;axis<3;axis++) {
          const line = points[axis*2+b];
          assert.equal(line.length,33);
          assert.deepEqual(line[0],[32,39]);
          line.slice(1).forEach(([x,y],i) => {
            assert.equal(x,32+265*(i+1)/32);
            assert.ok(Math.abs(y-(39-20*path_mm[i][axis]/limit)) < .001,[name,axis,b,i,y]);
          });
        }
      });
      assert.notDeepEqual(pathRows[0],pathRows[1]);
      assert.notDeepEqual(muscleRows.map(row=>row[1]),muscleRows.map(row=>row[2]));
      assert.ok(await panel.evaluate(el => {
        const rect = el.getBoundingClientRect(), dialog = el.closest('dialog');
        return rect.left >= 0 && rect.right <= innerWidth && dialog.scrollWidth <= dialog.clientWidth;
      }));
      observed[name] = {muscles:muscleRows,at125ms:ends};
    }
    const save = file => process.env.NS_SCREENSHOT_DIR &&
      page.screenshot({path:process.env.NS_SCREENSHOT_DIR+'/'+file+'-'+width+'.png'});
    await page.goto(origin + '/START.html');
    await page.getByRole('link',{name:'Play the experimental preview'}).click();
    await ready();
    assert.ok(requests.every(path => !path.includes('/cross-limb/')));
    const before = await state();
    await openF();
    for (const wrong of ['do not forecast my wrist lift','forecast my pelvis path then bend my right elbow',
                         'forecast my pelvis path and open the camera']) {
      await field.fill(wrong); await send();
      assert.equal(await panel.isVisible(),false);
      assert.equal(await field.isVisible(),true);
    }
    assert.deepEqual(await state(),before);
    await field.fill('Please forecast my wrist lift.'); await send(); await check('upper');
    assert.equal(await page.evaluate(() => document.activeElement.id),'ns-limb-title');
    await page.waitForLoadState('networkidle');
    const studyAssets = requests.filter(path => path.includes('/cross-limb/')).map(path=>path.split('/').pop()).sort();
    assert.deepEqual(studyAssets,['assets.mjs','inference.mjs','model-joint.json','model-lower.json','model-upper.json',
      'panel.mjs','scalp-history.mjs','synthetic-lower.json','synthetic-upper.json']);
    const loaded = requests.length;
    await amp.selectOption('1.5'); await check('upper_louder');
    await travel.selectOption('0.5'); await check('upper_shorter');
    await panel.locator('figure').scrollIntoViewIfNeeded(); await save('wrist-path');
    await task.selectOption('lower'); await check('lower');
    await posture.selectOption('0'); await check('lower_stand');
    await direction.selectOption('1'); await check('lower_clockwise');
    await amp.selectOption('0.5'); await check('lower_quieter');
    await travel.selectOption('1.5'); await check('lower_farther');
    await panel.locator('[data-limb-rms]').scrollIntoViewIfNeeded(); await save('pelvis-muscles');
    assert.notDeepEqual(observed.upper,observed.upper_louder);
    assert.notDeepEqual(observed.upper_louder,observed.upper_shorter);
    assert.notDeepEqual(observed.lower,observed.lower_stand);
    assert.notDeepEqual(observed.lower_stand,observed.lower_clockwise);
    assert.notDeepEqual(observed.lower_clockwise,observed.lower_quieter);
    assert.notDeepEqual(observed.lower_quieter,observed.lower_farther);
    await panel.getByText('Read the 32 positions from each model').click();
    await panel.locator('[data-path-tables] table').last().locator('tbody tr').last().scrollIntoViewIfNeeded();
    assert.ok(await panel.locator('[data-path-tables] table').last().evaluate(el => el.getBoundingClientRect().right <= innerWidth));
    assert.equal(requests.length,loaded);
    assert.deepEqual(await state(),before);
    await close(); await openF();
    await page.getByRole('button',{name:'Use voice'}).click();
    assert.equal(await field.inputValue(),'Forecast my pelvis path.');
    assert.equal(await panel.isVisible(),false);
    await send(); await check('lower'); await close();
    await openF(); await field.fill('forecast my pelvis path'); await send(); await check('lower'); await close();
    if (mobile) await page.getByRole('button',{name:'M · Activity map'}).tap();
    else await canvas.press('m');
    await map.getByRole('button',{name:'Game pathways'}).click();
    assert.match(await page.locator('#ns-act-game [data-muscles]').textContent(),/avatar/i);
    await choose(); await check('upper');
    const maps = panel.getByLabel('Model comparison');
    await maps.selectOption('maps');
    await panel.locator('[data-map-explanation]').waitFor();
    for (const key of ['upper','lower']) {
      await task.selectOption(key);
      const upper = key === 'upper';
      const muscle = await read('[data-limb-rms]');
      for (const [i, name] of ['separate','matched'].entries()) {
        const target = mapCases[key][name];
        const table = await read('[data-path-tables] table:nth-child('+(i+1)+')');
        assert.equal(table.length,32);
        table.forEach((row,k) => row.slice(1).forEach((v,axis) =>
          assert.ok(Math.abs(Number(v)-target.path_mm[k][axis]) <= .00501)));
        muscle.forEach((row,j) => {
          const value = target.rms[j+(upper?8:0)];
          if (value === null) assert.equal(row[i+1],'Unavailable');
          else assert.ok(Math.abs(Number(row[i+1])-value) <= (upper?.0000501:.00501));
        });
      }
      assert.ok(await panel.locator('[data-assessment]').isHidden());
      assert.equal(await panel.locator('.limb-key [data-first-model]').innerText(),'Body-part maps');
    }
    await maps.selectOption('specialist'); await check('lower'); await close();
    assert.deepEqual(await state(),{moves:before.moves,capture:0,voice:1});
    if (!mobile) {
      await page.reload(); await ready(); corrupt = true;
      await openF(); await field.fill('forecast my pelvis path'); await send();
      await panel.getByText('The forecasts could not open.',{exact:false}).waitFor();
      assert.equal(await panel.locator('[data-forecasts]').isVisible(),false);
      await choose(); await check('upper');
    }
    if (await map.isVisible()) await close();
    for (const [domain,command] of [['upper','forecast my wrist lift with scalp'],['lower','forecast my pelvis path with scalp']]) {
      await openF(); await field.fill(command); await send();
      await panel.locator('[data-scalp-controls]').waitFor(); assert.equal(await task.inputValue(),domain);
      assert.equal(await panel.getByLabel('Model comparison').inputValue(),'scalp');
      for (const mode of ['all','middle']) {
        if (mode === 'middle') {
          await panel.getByLabel('Scalp signal size').selectOption('1.5');
          await panel.getByLabel('Scalp sites',{exact:true}).selectOption('middle');
        }
        const amps=await read('[data-limb-rms]');
        for (const [i,name] of ['central','reference'].entries()) {
          const expected=scalpCases[domain+'-'+mode][name];
          const positions=await read('[data-path-tables] table:nth-child('+(i+1)+')');
          assert.equal(positions.length,32);
          positions.forEach((row,k)=>row.slice(1).forEach((v,a)=>assert.ok(Math.abs(Number(v)-expected.path_mm[k][a])<=.0051)));
          amps.forEach((row,j)=>{
            const v=expected.rms[(domain==='upper'?8:0)+j];
            if(v===null) assert.equal(row[i+1],'Unavailable');
            else assert.ok(Math.abs(Number(row[i+1])-v)<=(domain==='upper'?.000051:.0051));
          });
        }
      }
      assert.ok(await panel.evaluate(el=>el.closest('dialog').scrollWidth<=el.closest('dialog').clientWidth));
      await close();
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
