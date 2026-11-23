// Real local pose worker, controlled video, and an on-device dictation stub.
// NS_CAMERA_REFERENCE_DIR contains the documented lunge still used by selected-limb-browser.mjs.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFile, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHandler, HOST} from '../serve-local.mjs';

const {chromium} = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const hosts = new Set(), root = fileURLToPath(new URL('../', import.meta.url));
const handler = createHandler({root, allowedHosts:hosts});
const still = await readFile(join(process.env.NS_CAMERA_REFERENCE_DIR, 'lunge-right-arm.jpg'));
const server = createServer((req, res) => {
  if (req.url !== '/__test__/lunge-right-arm') return handler(req, res);
  res.writeHead(200, {'Content-Type':'image/jpeg'});
  res.end(still);
}).listen(0, HOST);
await once(server, 'listening');
const host = HOST + ':' + server.address().port, origin = 'http://' + host;
hosts.add(host);
let browser;
try {
  browser = await chromium.launch({executablePath:process.env.NS_CHROMIUM, args:[
    '--disable-background-networking', '--use-angle=' + (process.env.NS_ANGLE || 'swiftshader'),
    '--enable-unsafe-swiftshader'
  ]});
  for (const width of [1280, 320]) {
    const page = await browser.newPage({viewport:{width,height:820}, hasTouch:width === 320, reducedMotion:'reduce'});
    const errors = [], outbound = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      const r = route.request();
      if (r.method() !== 'GET' || new URL(r.url()).origin !== origin) {
        outbound.push([r.method(), r.url()]);
        return route.abort();
      }
      return route.continue();
    });
    await page.addInitScript(() => {
      const audit = window.wristAudit = {requests:0, starts:0, poses:[]};
      const recordEvent = e => e.target?.textContent === 'Record take' && e.target?.matches('button');
      document.addEventListener('click', e => {
        if (recordEvent(e)) audit.before = performance.now();
      }, true);
      document.addEventListener('click', e => {
        if (audit.before && !audit.after && e.target.textContent === 'Finish take') audit.after = performance.now();
      });
      class LocalVoice {
        get processLocally() { return this.local; }
        set processLocally(v) { this.local = v; }
        start() {
          if (this.local !== true) throw Error('Dictation was not on-device');
          audit.starts++;
          this.onresult?.({results:[[{transcript:'Please predict both wrists.'}]]});
          this.onend?.();
        }
        abort() {}
      }
      window.SpeechRecognition = LocalVoice;
      navigator.mediaDevices.getUserMedia = async request => {
        if (!request.video || request.audio !== false) throw Error('Unexpected device request');
        audit.requests++;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 480;
        const ctx = canvas.getContext('2d');
        const image = new Image();
        image.src = '/__test__/lunge-right-arm';
        await image.decode();
        const stream = canvas.captureStream(12);
        audit.track = stream.getVideoTracks()[0];
        const start = performance.now();
        const draw = () => {
          const size = 480 + 15 * Math.sin((performance.now() - start) / 700);
          ctx.fillRect(0, 0, 480, 480);
          ctx.drawImage(image, (480-size)/2, (480-size)/2, size, size);
        };
        draw();
        const timer = setInterval(() => audit.track.readyState === 'ended' ? clearInterval(timer) : draw(), 80);
        return stream;
      };
      const WorkerImpl = Worker;
      window.Worker = class extends WorkerImpl {
        constructor(url, ...args) {
          super(url, ...args);
          if (String(url).endsWith('/camera/pose-worker.js')) this.addEventListener('message', ({data}) => {
            if (data.type === 'pose') audit.poses.push({t:data.timestamp, wrists:data.wrists || null, armGeometry:data.armGeometry || null});
          });
        }
      };
    });
    await page.goto(origin + '/START.html');
    await page.getByRole('link',{name:'Play the experimental preview'}).click();
    await page.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
      document.querySelector('#ns-app').dataset.nsPhase === 'playing', null, {timeout:120000});
    const game = page.locator('#ns-canvas'), panel = page.locator('[data-wrist-forecast]');
    const field = page.getByRole('textbox',{name:'Command box'});
    const run = async text => { await field.fill(text); await field.press('Enter'); };
    await game.press('f');
    await run('forecast my wrists');
    await panel.getByText(/No wrist samples/).waitFor();
    await panel.getByRole('button',{name:'Try a synthetic example'}).click();
    const slider = panel.locator('[data-cutoff]');
    const index = async n => slider.evaluate((el, n) => {
      el.value = String(n); el.dispatchEvent(new Event('input',{bubbles:true}));
    }, n);
    const left = panel.locator('[data-wrist=leftArm]'), right = panel.locator('[data-wrist=rightArm]');
    const method = panel.locator('[data-wrist-method]');
    assert.equal(await method.inputValue(), 'auto');
    for (const side of ['leftArm', 'rightArm']) {
      const card = panel.locator('[data-role-side=' + side + ']');
      assert.equal(await card.locator('table').count(), 1);
      assert.doesNotMatch(await card.locator('h3').innerText(), /lead|other/);
    }
    if (process.env.NS_SCREENSHOT_DIR) {
      await panel.locator('h2').focus();
      await page.screenshot({path:join(process.env.NS_SCREENSHOT_DIR, 'example-' + width + '.png')});
    }
    await method.selectOption('leftArm');
    await panel.locator('[data-role-side=leftArm]').getByRole('row',{name:/Model position/}).waitFor();
    await method.selectOption('rightArm');
    await panel.locator('[data-role-side=rightArm]').getByRole('row',{name:/Model position/}).waitFor();
    await index(58);
    assert.match(await panel.locator('[data-role-side=leftArm]').innerText(), /missing/);
    await method.selectOption('trend');
    await index(58);
    assert.match(await left.innerText(), /No visible wrist/);
    assert.equal(await right.locator('table').count(), 1);
    await index(84);
    assert.match(await right.innerText(), /beyond the last frame/);
    await panel.getByRole('button',{name:'Replay at half speed'}).click();
    await page.waitForFunction(() => +document.querySelector('[data-cutoff]').value >= 2);
    await panel.getByRole('button',{name:'Pause replay'}).click();
    assert.equal(await page.evaluate(() => wristAudit.requests + wristAudit.starts), 0);
    await panel.getByRole('button',{name:'Back to game'}).click();
    // Play the earlier, offset-only take format through the same panel binding.
    // The clone avoids replacing the game's actual last take.
    const legacy = await panel.evaluate(async original => {
      const {bindWristForecast} = await import('/scene/src/camera/wrist-forecast/panel.mjs');
      const copy = original.cloneNode(true);
      const frames = Array.from({length:16}, (_,i) => ({time:50*i, wrists:{leftArm:[.03*i,-.02*i]}}));
      const binding = bindWristForecast(copy, () => ({frames}), () => {});
      try {
        binding.open();
        return {method:copy.querySelector('[data-wrist-method]').value,
          fallback:!copy.querySelector('[data-offsets-only]').hidden,
          trend:!copy.querySelector('[data-trend-results]').hidden,
          hasLeft:!!copy.querySelector('[data-wrist=leftArm] table'),
          hasRight:!!copy.querySelector('[data-wrist=rightArm] table')};
      } finally { binding.dispose(); }
    });
    assert.deepEqual(legacy, {method:'auto',fallback:true,trend:true,hasLeft:true,hasRight:false});
    await game.press('c');
    const camera = page.locator('#ns-motion-camera'), paired = width === 1280;
    if (paired) await camera.getByRole('combobox').selectOption('bothArms');
    const record = camera.getByRole('button',{name:'Record take', exact:true});
    await page.waitForFunction(() => window.wristAudit.poses.length >= 3 &&
        [...document.querySelectorAll('#ns-motion-camera button')].some(b => b.textContent === 'Record take' && !b.disabled),
      null, {timeout:60000});
    assert.ok(await page.evaluate(() => wristAudit.poses.every(p => !p.wrists && !p.armGeometry)));
    await record.click();
    try {
      await page.waitForFunction(() => {
        const seen = wristAudit.poses.filter(p => p.wrists?.rightArm);
        return seen.length >= 10 && seen.at(-1).t - seen[0].t >= 1800;
      }, null, {timeout:12000});
    } catch (e) {
      console.error(await page.evaluate(() => ({poses:wristAudit.poses,status:document.querySelector('#ns-motion-camera').innerText})));
      throw e;
    }
    await camera.getByRole('button',{name:'Finish take'}).click();
    assert.equal(await page.evaluate(() => wristAudit.track.readyState), 'ended');
    await game.press('f');
    if (width === 320) {
      await page.getByRole('button',{name:'Use voice'}).tap();
      assert.equal(await field.inputValue(), 'Please predict both wrists.');
      assert.ok(await panel.isHidden());
      await field.press('Enter');
    } else await page.getByRole('button',{name:'Forecast my wrists',exact:true}).click();
    await panel.getByText(/Last camera take/).waitFor();
    assert.equal(await method.inputValue(), 'auto');
    assert.ok(await panel.locator('[data-role-model]').isVisible());
    const captured = await page.evaluate(() => ({poses:wristAudit.poses.filter(p => p.wrists), all:wristAudit.poses,
      calls:wristAudit.requests, voices:wristAudit.starts, before:wristAudit.before, after:wristAudit.after}));
    assert.ok(captured.after >= captured.before && captured.after - captured.before < 25, JSON.stringify(captured));
    assert.equal(captured.calls, 1);
    assert.equal(captured.voices, width === 320 ? 1 : 0);
    // Check against original worker replies on the frame-grab clock, using the independently
    // bracketed Record take event to locate the anchor. No game timeline/model imports.
    const count = +await slider.getAttribute('max') + 1;
    await method.selectOption('trend');
    let compared;
    for (let i = 2; i < count - 1; i++) {
      await index(i);
      const table = right.locator('table');
      if (!await table.count()) continue;
      const observedRow = table.getByRole('row',{name:/Camera path/});
      const later = await observedRow.locator('td').allTextContents();
      if (later.some(s => !s.includes('interpolated') && !s.includes('sampled'))) continue;
      const t = parseFloat(await panel.locator('[data-clock]').innerText()) * 1000;
      const found = captured.poses.filter(p => p.t >= captured.before + t - .55 && p.t <= captured.after + t + .55);
      assert.equal(found.length, 1, JSON.stringify({i,t,captured}));
      const anchor = found[0], observedSides = paired ? ['rightArm','leftArm'] : ['rightArm'];
      if (paired && !await left.locator('table').count()) continue;
      for (const side of observedSides) {
        const section = side === 'leftArm' ? left : right;
        const round = v => v.toFixed(4), asText = p => '(' + p.map(round).join(', ') + ')';
        assert.ok((await section.innerText()).includes('At the cursor ' + asText(anchor.wrists[side])));
        const cells = await section.locator('table').getByRole('row',{name:/Camera path/}).locator('td').allTextContents();
        for (const [k, dt] of [8000/30,500].entries()) {
          const at = anchor.t + dt;
          const next = captured.poses.findIndex(p => p.t >= at - 1e-7);
          const a = captured.poses[next-1], b = captured.poses[next];
          assert.ok(a?.wrists[side] && b?.wrists[side] && b.t - a.t <= 250);
          const v = a.wrists[side].map((coord, j) => coord + (at-a.t)/(b.t-a.t)*(b.wrists[side][j]-coord));
          assert.ok(cells[k].startsWith(asText(v)), JSON.stringify([side,dt,v,cells[k]]));
        }
      }
      if (!paired) assert.match(await left.innerText(), /No visible wrist/);
      compared = {anchorMs:t, horizonMs:[8000/30,500], sides:observedSides, samples:count};
      break;
    }
    assert.ok(compared, JSON.stringify(captured));
    const cases = [];
    for (const lead of ['auto','leftArm','rightArm']) {
      await method.selectOption(lead);
      let checked = false;
      for (let i = 0; i < count; i++) {
        await index(i);
        const cards = panel.locator('[data-role-side]');
        const observedSides = paired ? ['leftArm','rightArm'] : ['rightArm'];
        const sample = {};
        for (const side of observedSides) {
          const card = cards.and(page.locator('[data-role-side=' + side + ']'));
          if (!await card.locator('table').count()) continue;
          const values = async label => card.getByRole('row', {name:label}).locator('td').allTextContents();
          const observation = await values(/Camera path/);
          if (observation.every(text => text.includes('sampled') || text.includes('interpolated'))) {
            sample[side] = {forecast:await values(/Model position/), observation,
              error:await values(/Model error/), hold:await values(/Hold error/)};
          }
        }
        if (Object.keys(sample).length !== observedSides.length) continue;
        if (!paired) assert.match(await panel.locator('[data-role-side=leftArm]').innerText(), /missing/);
        const anchorMs = parseFloat(await panel.locator('[data-clock]').innerText()) * 1000;
        const raw = captured.poses.filter(p => p.t >= captured.before + anchorMs - .55 && p.t <= captured.after + anchorMs + .55);
        assert.equal(raw.length, 1);
        cases.push({lead, at:raw[0].t, sample});
        checked = true;
        break;
      }
      assert.ok(checked, JSON.stringify({lead, width, count, captured}));
    }
    await method.selectOption('auto');
    if (process.env.NS_ROLE_EVIDENCE_DIR) {
      await writeFile(join(process.env.NS_ROLE_EVIDENCE_DIR, 'role-' + width + '.json'),
        JSON.stringify({width, cases, frames:captured.all.filter(p => p.t >= captured.poses[0].t && p.t <= captured.poses.at(-1).t).map(p => ({time:p.t,armGeometry:p.armGeometry}))}));
      await panel.locator('[data-role-model] canvas').scrollIntoViewIfNeeded();
      await page.screenshot({path:join(process.env.NS_ROLE_EVIDENCE_DIR, 'role-' + width + '.png')});
    }
    const layout = await panel.evaluate(el => ({viewport:innerWidth,
      x:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,
      scroll:el.scrollWidth, width:el.clientWidth}));
    assert.ok(layout.x >= 0 && layout.right <= width && layout.scroll <= layout.width + 1, JSON.stringify(layout));
    if (process.env.NS_SCREENSHOT_DIR) {
      await panel.locator('h2').focus();
      await page.screenshot({path:join(process.env.NS_SCREENSHOT_DIR, 'wrist-' + width + '.png')});
    }
    await page.keyboard.press('Escape');
    await game.press('f'); await run('match my arm reach');
    await page.locator('[data-reach-study] h2').waitFor();
    await page.keyboard.press('Escape');
    await game.press('m');
    await page.getByRole('dialog',{name:'Activity map'}).waitFor();
    assert.deepEqual(errors, []); assert.deepEqual(outbound, []);
    console.log(JSON.stringify({width,compared,roleCases:cases,layout,cameraRequests:captured.calls,onDeviceTranscript:captured.voices,errors,outbound}));
    await page.close();
  }
} finally {
  await browser?.close();
  await new Promise(r => server.close(r));
}
