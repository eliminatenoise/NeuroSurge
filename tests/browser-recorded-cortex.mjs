import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHandler, HOST} from '../serve-local.mjs';

const {chromium} = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const allowedHosts = new Set();
const server = createServer(createHandler({root, allowedHosts})).listen(0, HOST);
await once(server, 'listening');
const host = HOST + ':' + server.address().port;
const viewer = 'https://eliminatenoise.github.io/Interoceptomics/recorded-cortex/';
allowedHosts.add(host);
let browser;
try {
  const args = ['--disable-background-networking'];
  if (process.env.NS_ANGLE) args.push('--use-angle=' + process.env.NS_ANGLE);
  browser = await chromium.launch({executablePath:process.env.NS_CHROMIUM, args});
  const context = await browser.newContext({viewport:{width:320,height:640}, reducedMotion:'reduce'});
  const allRequests = [], outside = [], errors = [];
  await context.route('**/*', route => {
    const url = route.request().url();
    allRequests.push(url);
    if (new URL(url).host === host) return route.continue();
    outside.push(url);
    // Verify the navigation without contacting a site or depending on its deployment.
    if (url === viewer) return route.fulfill({contentType:'text/html',body:'Requested map'});
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const devices = window.measuredTest = {speech:0, camera:[], aborts:0};
    class LocalSpeech {
      get processLocally() {return this.local;}
      set processLocally(value) {this.local = value;}
      start() {
        devices.speech++;
        devices.local = this.processLocally;
        this.onresult({results:[[{transcript:'Please compare the recorded cortical activity.'}]]});
      }
      abort() {devices.aborts++;}
    }
    Object.defineProperty(window,'SpeechRecognition',{value:LocalSpeech});
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async constraints => {
      devices.camera.push(constraints);
      throw new DOMException('Controlled denial','NotAllowedError');
    }});
  });
  await page.goto('http://' + host + '/START.html');
  await page.getByRole('link',{name:'Play the experimental preview'}).press('Enter');
  await page.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
    document.querySelector('#ns-app').dataset.nsPhase === 'playing', null, {timeout:120000});
  await page.waitForLoadState('networkidle');
  const before = allRequests.length;
  const words = page.getByRole('textbox',{name:'Command box'});
  const panel = page.locator('#ns-act-cortex');
  const map = page.getByRole('dialog',{name:'Activity map'});
  const cue = panel.getByRole('combobox',{name:'Finger cue'});
  const spread = panel.getByRole('checkbox');
  const game = () => page.evaluate(() => ({mode:window.__nsQA.inspect().shell.mode, focus:document.activeElement.id,
    elbow:window.__nsQA.inspect().bodyDrawnJoints.r_elbow_flex}));
  const initial = await game();
  await page.keyboard.press('f');
  await words.fill('do not show recorded brain activity');
  await words.press('Enter');
  assert.equal(await words.isVisible(),true);
  assert.equal(await panel.isVisible(),false);
  await words.fill('show recorded brain activity');
  const t = performance.now();
  await words.press('Enter');
  await cue.waitFor();
  const latencyMs = performance.now() - t;
  assert.equal((await game()).focus,'ns-cortex-title');
  assert.equal((await game()).mode,'paused');
  assert.equal(await map.getByRole('button',{name:'Recorded cortex'}).getAttribute('aria-pressed'),'true');
  assert.match(await panel.getByRole('status').innerText(), /88 cue–blank pairs/);
  const motor = panel.getByRole('row',{name:/Dorsal primary motor cortex/});
  assert.deepEqual(await motor.getByRole('cell').allInnerTexts(),['−5.67','+2.90']);
  await page.keyboard.press('Tab');
  assert.equal(await cue.evaluate(e => e === document.activeElement),true);
  await cue.press('ArrowDown');
  assert.equal(await cue.inputValue(),'thumb');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  assert.equal(await spread.isChecked(),true);
  assert.match(await motor.innerText(),/−6.39 to −3.08/);
  assert.match(await motor.innerText(),/\+1.47 to \+3.52/);
  const data = await panel.locator('[data-cortex-values]').evaluate(el => JSON.parse(el.textContent));
  const signed = new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2,signDisplay:'exceptZero'});
  const db = value => signed.format(value).replace('-', '−');
  let valuesChecked = 0;
  for (const [digit,n] of Object.entries(data.trial_counts)) {
    await cue.selectOption(digit);
    assert.match(await panel.getByRole('status').innerText(),new RegExp(n + ' cue–blank pairs'));
    const rendered = await panel.locator('tbody tr').evaluateAll(rows =>
      rows.map(row => [...row.children].map(cell => cell.innerText.trim())));
    const rectangles = await panel.locator('tbody tr').evaluateAll(rows =>
      rows.map(row => [...row.querySelectorAll('svg rect')].map(rect =>
        [Number(rect.getAttribute('x')), Number(rect.getAttribute('width'))])));
    assert.equal(rendered.length,6);
    for (const [index,area] of data.regions.filter(r => r.status === 'measured').entries()) {
      const [label,...cells] = rendered[index];
      assert.ok(label.startsWith(area.label) && label.includes(area.n_contacts + ' contact'));
      for (const [bandIndex,band] of data.bands.entries()) {
        const {mean_db,q25_db,q75_db} = area.by_cue[digit][band.id];
        assert.equal(cells[bandIndex], db(mean_db) + '\n' + db(q25_db) + ' to ' + db(q75_db));
        assert.ok(Math.abs(mean_db) <= 10, 'The common ±10 dB scale must fit every mean.');
        assert.deepEqual(rectangles[index][bandIndex], [Math.min(0,mean_db), Math.abs(mean_db)]);
        valuesChecked += 3;
      }
    }
  }
  await cue.selectOption('all');
  assert.equal(await map.evaluate(el => el.scrollWidth <= el.clientWidth),true);
  if (process.env.NS_EVIDENCE_DIR) {
    await panel.locator('table').scrollIntoViewIfNeeded();
    await page.screenshot({path:process.env.NS_EVIDENCE_DIR+'/reader-320.png'});
    await page.setViewportSize({width:1280,height:900});
    await spread.uncheck();
    await map.evaluate(el => {el.scrollTop = 0;});
    await page.screenshot({path:process.env.NS_EVIDENCE_DIR+'/reader-1280.png'});
  }
  const link = panel.getByRole('link',{name:/full 3D/});
  assert.equal(await link.getAttribute('href'),viewer);
  assert.equal(await link.getAttribute('target'),'_blank');
  assert.equal(await link.getAttribute('rel'),'noopener noreferrer');
  await page.keyboard.press('Escape');
  assert.equal((await game()).focus,'ns-canvas');
  await page.keyboard.press('f');
  await page.getByRole('button',{name:'Use voice'}).press('Enter');
  assert.equal(await words.inputValue(),'Please compare the recorded cortical activity.');
  assert.equal(await panel.isVisible(),false);
  await words.press('Enter');
  await cue.waitFor();
  await page.keyboard.press('c');
  const devices = await page.evaluate(()=>window.measuredTest);
  assert.deepEqual(devices,{speech:1,camera:[],aborts:1,local:true});
  assert.ok(Math.abs((await game()).elbow - initial.elbow)<1);
  assert.equal(context.pages().length,1);
  assert.deepEqual(allRequests.slice(before),[]);
  await link.focus();
  const popupPromise = context.waitForEvent('page');
  await link.press('Enter');
  const popup = await popupPromise;
  await popup.waitForLoadState();
  assert.equal(popup.url(),viewer);
  assert.equal(await popup.evaluate(()=>window.opener),null);
  await popup.close();
  await page.keyboard.press('Escape');
  await page.keyboard.press('m');
  await map.getByRole('button',{name:'Recorded cortex'}).press('Enter');
  await cue.waitFor();
  await map.getByRole('button',{name:'Game pathways'}).press('Enter');
  assert.equal(await panel.isVisible(),false);
  await map.getByRole('button',{name:'Back to game'}).press('Enter');
  // The existing C control is the only request for video in this run.
  await page.keyboard.press('c');
  await page.getByText('Camera off. The camera permission was denied or blocked by the browser.').waitFor();
  const constraints = await page.evaluate(()=>window.measuredTest.camera);
  assert.equal(constraints.length,1);
  assert.equal(constraints[0].audio,false);
  assert.equal((await game()).mode,'playing');
  assert.deepEqual(outside,[viewer]);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({chromium:browser.version(),valuesChecked,latencyMs,parserAndReaderRequests:0,
    cameraRequestsDuringReading:0,realDevicesUsed:0,confirmedLocalDictation:true,explicitMapNavigation:true,
    mapNavigationIntercepted:true,keyboard:true,narrowWidth:320,errors}));
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
