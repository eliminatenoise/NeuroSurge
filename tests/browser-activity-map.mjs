// Run from a source checkout with Chromium and Playwright. No device is opened.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHandler, HOST } from '../serve-local.mjs';

const { chromium } = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const allowedHosts = new Set();
const server = createServer(createHandler({ root, allowedHosts })).listen(0, HOST);
await once(server, 'listening');
const host = HOST + ':' + server.address().port;
allowedHosts.add(host);
let browser;
try {
  const args = ['--disable-background-networking'];
  if (process.env.NS_ANGLE) args.push('--use-angle=' + process.env.NS_ANGLE);
  browser = await chromium.launch({ executablePath:process.env.NS_CHROMIUM, args });
  const page = await browser.newPage({ viewport:{ width:1360, height:900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    window.mediaRequests = 0;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {value() {
      window.mediaRequests++;
      return Promise.reject(new Error('Physical device use is excluded.'));
    }});
  });
  async function ready() {
    await page.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
      document.querySelector('#ns-app').dataset.nsPhase === 'playing', null, {timeout:120_000});
  }
  await page.goto('http://' + host + '/');
  await ready();
  assert.ok(page.url().endsWith('/scene/example/preview.html'));
  await page.locator('#ns-canvas').click({position:{x:530,y:450}});
  await page.waitForFunction(() => !!document.pointerLockElement);
  await page.keyboard.press('m');
  const dialog = page.getByRole('dialog', {name:'Activity map'});
  await dialog.waitFor();
  await dialog.locator('[data-replay]').waitFor();
  const seek = page.getByRole('slider',{name:'Time from cue'});
  assert.equal(await seek.inputValue(), '256');
  await page.waitForFunction(() => !document.pointerLockElement);
  assert.equal(await page.evaluate(() => window.__nsQA.inspect().shell.mode), 'paused');
  assert.equal(await page.locator('.activity-trace').count(), 4);
  assert.equal(await dialog.locator('[data-site]').count(), 8);
  assert.equal(await dialog.locator('[data-pairs] output').count(), 4);
  assert.deepEqual(await dialog.locator('[data-pairs] output').allTextContents(), ['-6 µV','3 µV','2 µV','-2 µV']);
  assert.equal(await dialog.getByLabel('Scalp trace').locator('option').count(), 8);
  assert.equal(await dialog.getByLabel('Forearm trace').locator('option').count(), 12);
  await dialog.getByLabel('Scalp trace').selectOption('scalpCP3_uV');
  await dialog.getByLabel('Forearm trace').selectOption('forearmM1R_uV');
  assert.equal(await dialog.getByLabel('Forearm EMG · M1R',{exact:true}).textContent(), '-1 µV');
  assert.match(await page.getByLabel('Wrist extension',{exact:true}).innerText(), /2.6/);
  await page.getByRole('button',{name:'Play recording'}).click();
  await page.waitForFunction(() => Number(document.querySelector('[data-seek]').value) > 340);
  await page.getByRole('button',{name:'Pause recording'}).click();
  const onPause = await seek.inputValue();
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  assert.equal(await seek.inputValue(), onPause);
  await seek.focus();
  await page.keyboard.press('End');
  assert.equal(await seek.inputValue(), '1536');
  assert.match(await page.getByLabel('Wrist extension',{exact:true}).innerText(), /-49\.3/);
  await dialog.locator('[data-model] summary').click();
  await dialog.getByRole('table').waitFor();
  await dialog.getByLabel('Forecast target').selectOption('1');
  assert.equal(await seek.inputValue(), '768');
  assert.equal(await dialog.getByLabel('Scalp EEG · CP3',{exact:true}).textContent(), '19 µV');
  assert.equal(await dialog.getByLabel('Forearm EMG · M1R',{exact:true}).textContent(), '40 µV');
  assert.deepEqual(await dialog.locator('[data-site] .site-voltage').allTextContents(), ['+10','+9','+3','+3','+1','+19','+7','+1']);
  assert.deepEqual(await dialog.locator('[data-pairs] output').allTextContents(), ['-33 µV','2 µV','12 µV','-19 µV']);
  assert.match(await dialog.locator('[data-plane-angles]').textContent(), /-16\.14° extension · -2\.17° radial/);
  await dialog.getByLabel('Forearm trace').selectOption('forearmM4LminusM4R_uV');
  assert.equal(await dialog.getByLabel('Forearm EMG · M4L − M4R',{exact:true}).textContent(), '-19 µV');
  await dialog.locator('.activity-transport').scrollIntoViewIfNeeded();
  if (process.env.NS_ACTIVITY_CAPTURE) await dialog.screenshot({path:process.env.NS_ACTIVITY_CAPTURE});
  await page.setViewportSize({width:390,height:700});
  assert.ok(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth));
  assert.equal(await dialog.getByLabel('Forearm trace').inputValue(), 'forearmM4LminusM4R_uV');
  await page.setViewportSize({width:1360,height:900});
  const oracle = JSON.parse(await readFile(new URL('./fixtures/paired-wrist.json', import.meta.url)));
  const cells = dialog.locator('[data-forecast-table] tr');
  for (const [index, row] of oracle.rows.entries()) {
    await dialog.getByLabel('Forecast target').selectOption(String(index));
    await cells.nth(4).waitFor();
    assert.equal(Number(await seek.inputValue()), 256 + row.target_offset_after_cue_ticks);
    const expected = [row.measured_deg, row.anchor_deg, ...['motion','emg','full'].map(key => row.predictions[key].angle_deg)];
    for (const [i, angles] of expected.entries()) {
      assert.deepEqual(await cells.nth(i).locator('td').allTextContents(), angles.map(v => v.toFixed(1) + '°'));
    }
  }
  await dialog.getByLabel('Forecast target').selectOption('1');
  await dialog.getByLabel('Model', {exact:true}).selectOption('temporal');
  await cells.nth(4).waitFor();
  const forecastRows = await dialog.locator('[data-forecast-table] tr').allTextContents();
  assert.match(forecastRows[0], /measured-16.1°/);
  assert.match(forecastRows[3], /forecast-26.1°/);
  assert.match(forecastRows[4], /-9.9°/);
  const gameButton = dialog.getByRole('button',{name:'Game pathways'});
  await gameButton.click();
  const region = dialog.getByLabel('Body region');
  await region.selectOption('rh_shoulder');
  assert.equal(await dialog.locator('[data-move]').isDisabled(),true);
  assert.match(await dialog.locator('[data-muscles]').innerText(), /W\/A\/S\/D/);
  await region.selectOption('lh_jaw');
  assert.match(await dialog.locator('[data-motor]').innerText(), /brainstem → cranial/);
  await region.selectOption('rh_knee');
  assert.match(await dialog.locator('[data-sensory]').innerText(), /Left knee receptors → sensory nerves → spinal cord → brain/);
  const knees = () => page.evaluate(() => {
    const j = window.__nsQA.inspect().bodyDrawnJoints;
    return [j.knee_ext_L, j.knee_ext_R];
  });
  const before = await knees();
  await dialog.getByRole('button',{name:'Try this movement in the game'}).click();
  await ready();
  await page.waitForFunction(n => Math.abs(window.__nsQA.inspect().bodyDrawnJoints.knee_ext_L - n)>15, before[0]);
  const after = await knees();
  assert.ok(Math.abs(after[1]-before[1])<5);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'ns-canvas');
  await page.keyboard.press('f');
  await page.getByRole('textbox',{name:'Move the body'}).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'M · Activity map'}).click();
  await dialog.waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(),0);

  // A corrupt model download leaves the recording and earlier model usable.
  await page.route('**/activity/paired/weights/full.bin', route =>
    route.fulfill({contentType:'application/octet-stream', body:Buffer.alloc(82208)}));
  await page.reload();
  await ready();
  await page.getByRole('button',{name:'M · Activity map'}).click();
  await dialog.locator('[data-replay]').waitFor();
  await dialog.locator('[data-model] summary').click();
  await page.getByText('This model could not run.', {exact:false}).waitFor();
  assert.equal(await cells.count(), 2);
  await dialog.getByLabel('Model', {exact:true}).selectOption('temporal');
  await cells.nth(4).waitFor();
  await page.unroute('**/activity/paired/weights/full.bin');
  await dialog.getByLabel('Model', {exact:true}).selectOption('paired');
  await cells.nth(4).waitFor();
  assert.match(await cells.nth(4).textContent(), /Wrist \+ forearm \+ scalp/);
  await page.keyboard.press('Escape');

  // Missing fixture remains visibly missing. The game and a different pathway
  // still work and the overlay does not quietly substitute synthetic voltage.
  await page.route('**/inputs/activity/wrist-pointing.json', route => route.fulfill({status:404,body:''}));
  await page.reload();
  await ready();
  await page.getByRole('button',{name:'M · Activity map'}).click();
  await dialog.getByText(/Recording unavailable or its checksum changed/).waitFor();
  assert.equal(await dialog.getByRole('slider').count(),0);
  await gameButton.click();
  await region.selectOption('lh_hand');
  assert.match(await dialog.locator('[data-motor]').innerText(), /right hand/i);
  await page.setViewportSize({width:390,height:700});
  const fits = await dialog.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight > el.clientHeight);
  assert.ok(fits, 'narrow-screen map must fit and scroll');
  await page.keyboard.press('Escape');
  await ready();
  assert.equal(await page.evaluate(() => window.mediaRequests),0);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pairedTargets:oracle.rows.length,pairedForecasts:oracle.rows.length*3,corruptModelRecovered:true,forecastRows,knees:{before,after},missingClip:true,narrowScreen:true,mediaRequests:0,errors}));
} finally {
  await browser?.close();
  await new Promise(r => server.close(r));
}
