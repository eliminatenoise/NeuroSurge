// Uses the ordinary local game launcher with every off-machine request blocked.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHandler, HOST } from '../serve-local.mjs';

const {chromium} = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../',import.meta.url));
const allowedHosts = new Set();
const server = createServer(createHandler({root,allowedHosts})).listen(0,HOST);
await once(server,'listening');
const host = HOST + ':' + server.address().port;
allowedHosts.add(host);
let browser;
try {
  const args = ['--disable-background-networking'];
  if (process.env.NS_ANGLE) args.push('--use-angle='+process.env.NS_ANGLE);
  browser = await chromium.launch({executablePath:process.env.NS_CHROMIUM,args});
  const page = await browser.newPage({viewport:{width:1000,height:850}});
  const errors = [], external = [], clips = [];
  page.on('pageerror',e => errors.push(String(e)));
  await page.route('**/*',route => {
    const url = new URL(route.request().url());
    if (['http:','https:'].includes(url.protocol) && url.host !== host) {
      external.push(url.href);
      return route.abort();
    }
    if (url.pathname.startsWith('/assets/spatial-motion/')) clips.push(url.pathname);
    return route.continue();
  });
  await page.addInitScript(() => {
    window.mediaRequests = 0;
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value() {
      window.mediaRequests++;
      return Promise.reject(new Error('No devices in the replay.'));
    }});
  });
  await page.goto('http://'+host+'/');
  await page.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
    document.querySelector('#ns-app')?.dataset.nsPhase === 'playing',null,{timeout:120_000});
  const dialog = page.getByRole('dialog',{name:'Activity map'});
  const whole = dialog.getByRole('button',{name:'Whole-body motion'});
  const panel = dialog.getByRole('region',{name:'Recorded whole-body movement'});
  const picker = panel.getByLabel('Recording',{exact:true});
  const time = panel.getByLabel('Time in recording');
  const pixels = () => panel.locator('canvas').evaluate(c => c.toDataURL());
  await page.keyboard.press('m');
  await dialog.locator('[data-replay]').waitFor();
  assert.deepEqual(clips,[]);
  await whole.click();
  await time.waitFor();
  assert.equal(await picker.inputValue(),'02_06');
  assert.equal(await panel.locator('[data-motion-count]').innerText(),'41 of 41 visible');
  assert.equal(await picker.locator('option').count(),3);

  await picker.selectOption('13_11');
  await time.waitFor();
  assert.match(await panel.locator('[data-motion-info]').innerText(),/13_11/);
  await panel.getByText('Read a marker’s position',{exact:true}).click();
  await panel.getByLabel('Marker',{exact:true}).selectOption('LFHD');
  assert.equal(await panel.locator('[data-motion-coordinates]').innerText(),'LFHD · X -608 mm · Y 80.2 mm · Z 1717.9 mm');
  const before = await pixels();
  await panel.getByLabel('Turn',{exact:true}).focus();
  await page.keyboard.press('Home');
  assert.notEqual(await pixels(),before);
  await panel.getByLabel('Follow the waist').check();
  assert.equal(await panel.locator('[data-motion-coordinates]').innerText(),'LFHD · X -608 mm · Y 80.2 mm · Z 1717.9 mm');
  assert.match(await panel.locator('[data-motion-view]').innerText(),/follows waist/);
  const withLines = await pixels();
  await panel.getByLabel('Connect nearby markers').uncheck();
  assert.notEqual(await pixels(),withLines);
  await panel.getByLabel('Connect nearby markers').check();
  await panel.getByRole('button',{name:'Recenter view'}).click();
  assert.equal(await panel.getByLabel('Follow the waist').isChecked(),false);
  assert.equal(await panel.getByLabel('Turn',{exact:true}).inputValue(),'28');

  await panel.getByRole('button',{name:'Play movement'}).click();
  await page.waitForFunction(() => Number(document.querySelector('[data-motion-time]').value) >= 2);
  await panel.getByRole('button',{name:'Pause movement'}).click();
  const stopped = await time.inputValue();
  await page.waitForTimeout(170);
  assert.equal(await time.inputValue(),stopped);
  await time.focus();
  await page.keyboard.press('End');
  assert.equal(await time.inputValue(),'103');
  assert.match(await panel.locator('[data-motion-clock]').innerText(),/3\.433 s · frame 433/);
  await picker.selectOption('132_23');
  await time.waitFor();
  assert.equal(await time.inputValue(),'0');
  await panel.getByText('How was this movement recorded?',{exact:true}).click();
  assert.match(await panel.locator('[data-motion-quality]').innerText(),/zero quality/);
  assert.equal(await panel.locator('[data-motion-marker] option[value="ANT"]').count(),1);
  await panel.getByText('How was this movement recorded?',{exact:true}).click();
  await panel.getByText('Read a marker’s position',{exact:true}).click();
  await page.setViewportSize({width:360,height:700});
  assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight > el.clientHeight));
  if (process.env.NS_SPATIAL_CAPTURE) await panel.locator('figure').screenshot({path:process.env.NS_SPATIAL_CAPTURE});

  await panel.getByRole('button',{name:'Play movement'}).click();
  await dialog.getByRole('button',{name:'Game pathways'}).click();
  await dialog.getByLabel('Body region').waitFor();
  const held = await dialog.locator('[data-motion-time]').inputValue();
  await page.waitForTimeout(200);
  await whole.click();
  assert.equal(await time.inputValue(),held);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement.id),'ns-canvas');
  await page.keyboard.press('f');
  const field = page.getByRole('textbox',{name:'Move the body'});
  await field.fill('Replay a forward jump');
  await field.press('Enter');
  await panel.locator('[data-motion-info]').filter({hasText:'13_11'}).waitFor();
  assert.equal(await picker.inputValue(),'13_11');
  assert.equal(await field.isVisible(),false);
  await page.keyboard.press('Escape');
  const choose = id => page.evaluate(clipId => document.dispatchEvent(
    new CustomEvent('ns-open-spatial-replay',{detail:{clipId}})),id);
  await choose('02_06');
  await time.waitFor();
  assert.equal(await picker.inputValue(),'02_06');
  await choose('made-up');
  await panel.getByRole('status').filter({hasText:'Choose a recording'}).waitFor();
  assert.equal(await time.isVisible(),false);

  await page.route('**/assets/spatial-motion/13_11.json',r => r.fulfill({body:'{}',contentType:'application/json'}));
  await picker.selectOption('13_11');
  await panel.getByRole('button',{name:'Try again'}).waitFor();
  assert.equal(await time.isVisible(),false);
  await page.unroute('**/assets/spatial-motion/13_11.json');
  await panel.getByRole('button',{name:'Try again'}).click();
  await time.waitFor();
  assert.equal(await picker.inputValue(),'13_11');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__nsQA.inspect().shell.mode === 'playing');
  assert.equal(await page.locator('#ns-camera-open').isEnabled(),true);
  assert.equal(await page.evaluate(() => window.mediaRequests),0);
  assert.deepEqual(errors,[]);
  assert.deepEqual(external,[]);
  console.log(JSON.stringify({threeRecordings:true,depthRotation:true,sourceCoordinates:true,offline:true,checksumRecovery:true,narrowWidth:360,mediaRequests:0,errors}));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
