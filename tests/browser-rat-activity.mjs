// Open the real game on loopback. Exercise the activity map without a camera or an account.
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
const origin = 'http://' + host;
allowedHosts.add(host);
let browser;
try {
  const args = ['--disable-background-networking'];
  if (process.env.NS_ANGLE) args.push('--use-angle=' + process.env.NS_ANGLE);
  browser = await chromium.launch({executablePath:process.env.NS_CHROMIUM, args});
  const page = await browser.newPage({viewport:{width:1280, height:900}});
  const requests = [], errors = [];
  page.on('request', request => requests.push(request.url()));
  page.on('pageerror', error => errors.push(String(error)));
  await page.route(url => /^https?:$/.test(url.protocol) && url.origin !== origin, route => route.abort());
  await page.addInitScript(() => {
    window.deviceCalls = 0;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {value() {
      window.deviceCalls++;
      return Promise.reject(Error('Physical device excluded'));
    }});
  });
  await page.goto(origin + '/');
  await page.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
    document.querySelector('#ns-app').dataset.nsPhase === 'playing', null, {timeout:120000});
  await page.locator('#ns-canvas').focus();
  await page.keyboard.press('m');
  const dialog = page.getByRole('dialog', {name:'Activity map'});
  const tab = dialog.getByRole('button', {name:'Rat brain activity', exact:true});
  const panel = dialog.locator('#ns-act-rat');
  const wt = name => panel.locator('[data-wt="' + name + '"]');
  await dialog.locator('[data-replay]').waitFor();
  assert.ok(!requests.some(url => /\/wtrack\/|\/read-packet\.js/.test(url)));
  assert.equal(await panel.isVisible(), false);

  // Switch back to the game pathways while a damaged packet is in flight.
  const packetPath = '**/wtrack/packet.json';
  let release;
  const deferred = new Promise(resolve => { release = resolve; });
  await page.route(packetPath, async route => {
    await deferred;
    await route.fulfill({contentType:'application/json', body:'{}'});
  }, {times:1});
  const requested = page.waitForRequest(packetPath);
  await tab.click();
  await requested;
  await dialog.getByRole('button', {name:'Game pathways'}).click();
  release();
  assert.equal(await panel.isVisible(), false);
  assert.equal(await dialog.locator('#ns-act-game').isVisible(), true);
  await tab.click();
  await panel.getByRole('button', {name:'Try again'}).click();
  await wt('body').waitFor();
  assert.equal(await dialog.locator('#ns-act-recording').isVisible(), false);
  assert.equal(await dialog.locator('#ns-act-hand').isVisible(), false);
  assert.equal(await page.evaluate(() => window.__nsQA.inspect().shell.mode), 'paused');

  assert.equal(await wt('pfc').locator('tbody tr').count(), 41);
  assert.equal(await wt('ca1').locator('tbody tr').count(), 31);
  assert.equal(await wt('pfc').locator('tbody tr').first().locator('td').count(), 4);
  // Display-rounded X/Y in centimetres from the independently sealed Python fits.
  const expected = {
    55:['70.70','102.94','70.76','101.58'],
    56:['45.78','11.31','45.59','10.78'],
    57:['111.69','77.80','110.87','78.21']
  };
  for (const [trip, coordinates] of Object.entries(expected)) {
    await wt('trip').selectOption(trip);
    assert.deepEqual(await wt('results').locator('td').allTextContents(), coordinates);
  }
  await wt('mode').selectOption('combined');
  await wt('reveal').click();
  assert.match(await wt('outcome').innerText(), /Camera row 145747/);
  assert.equal(await wt('track').locator('g circle').count(), 5);
  assert.equal(await wt('close').locator('g circle').count(), 5);
  const summary = panel.locator('#ns-rat-sources summary');
  await panel.getByRole('link', {name:'Sources and method'}).click();
  assert.ok(await summary.evaluate(el => el.parentNode.open && document.activeElement === el));
  const note = panel.getByRole('link', {name:'Download the method and source notes'});
  const downloaded = page.waitForEvent('download');
  await note.click();
  assert.equal((await downloaded).suggestedFilename(), 'NOTICE.md');
  assert.equal(await panel.locator('#ns-rat-sources a').first().getAttribute('target'), '_blank');

  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({width, height:800});
    assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), 'Dialog fits at ' + width);
    assert.ok(await panel.evaluate(el => el.scrollWidth <= el.clientWidth), 'Recording fits at ' + width);
    const columns = await panel.locator('.wt-maps').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    assert.equal(columns, width < 500 ? 1 : 2);
    if (process.env.NS_RAT_EVIDENCE) {
      for (const [section, element] of [['maps', wt('clock')], ['spikes', wt('pfc')]]) {
        await element.evaluate(el => el.scrollIntoView({block:'start'}));
        await page.screenshot({path:process.env.NS_RAT_EVIDENCE + '/' + section + '-' + width + '.png'});
      }
    }
  }
  await wt('pfc').focus();
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ns-canvas');
  await page.keyboard.press('m');
  await dialog.locator('[data-replay]').waitFor();
  assert.equal(await panel.isVisible(), false);
  await tab.click();
  assert.equal(await wt('trip').inputValue(), '57');
  assert.equal(await wt('mode').inputValue(), 'combined');
  assert.equal(requests.filter(url => url.endsWith('/wtrack/packet.json')).length, 2);
  await dialog.getByRole('button', {name:'Back to game'}).click();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ns-canvas');
  await page.keyboard.press('f');
  await page.getByRole('textbox', {name:'Move the body'}).waitFor();
  await page.keyboard.press('Escape');
  await page.keyboard.press('m');
  await dialog.getByRole('button', {name:'Game pathways'}).click();
  await dialog.getByLabel('Body region').selectOption('rh_knee');
  const knee = await page.evaluate(() => window.__nsQA.inspect().bodyDrawnJoints.knee_ext_L);
  await dialog.getByRole('button', {name:'Try this movement in the game'}).click();
  await page.waitForFunction(before => Math.abs(window.__nsQA.inspect().bodyDrawnJoints.knee_ext_L - before) > 15, knee);
  assert.ok(requests.every(url => url.startsWith(origin + '/') || url.startsWith('data:')));
  assert.equal(await page.evaluate(() => window.deviceCalls), 0);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({trips:[55,56,57], regions:[41,31], widths:[1280,390,320],
    corruptPacketRecovered:true, resumedGameplay:true, deviceCalls:0, remoteRequests:0}));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
