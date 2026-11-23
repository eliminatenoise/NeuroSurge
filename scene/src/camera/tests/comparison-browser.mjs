// In-tree exercise stills go through a canvas video track, the actual bundled
// pose worker, capture/occlusion gates and take store. Only dictation is scripted.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHandler, HOST} from '../../../../serve-local.mjs';

const {chromium} = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../../../', import.meta.url));
const allowedHosts = new Set();
const server = createServer(createHandler({root, allowedHosts})).listen(0, HOST);
await once(server, 'listening');
const host = HOST + ':' + server.address().port, origin = 'http://' + host;
allowedHosts.add(host);
let browser;
try {
  browser = await chromium.launch({executablePath:process.env.NS_CHROMIUM,
    args:['--disable-background-networking','--use-angle=' + (process.env.NS_ANGLE || 'swiftshader'),'--enable-unsafe-swiftshader']});
  const ctx = await browser.newContext({viewport:{width:900,height:690},reducedMotion:'reduce'});
  const requests = [], unexpected = [], errors = [];
  ctx.on('request', request => {
    requests.push(request.url());
    if (request.method() !== 'GET' || new URL(request.url()).origin !== origin) unexpected.push(request.url());
  });
  const page = await ctx.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const test = window.compareFixture = {starts:0,workers:0,samples:[],tracks:[],voice:0,storageWrites:0};
    for (const op of ['setItem','removeItem','clear']) {
      const original = Storage.prototype[op];
      Storage.prototype[op] = function(...args) {
        if (test.checkStorage) test.storageWrites++;
        return original.apply(this,args);
      };
    }
    const Speech = class {
      get processLocally() { return this.local; }
      set processLocally(v) { this.local = v; }
      start() { test.voice++; test.local = this.local; this.onresult({results:[[{transcript:test.text}]]}); }
      abort() {}
    };
    Object.defineProperty(window,'SpeechRecognition',{value:Speech});
    const Worker = window.Worker;
    window.Worker = class extends Worker {
      constructor(url, ...args) {
        super(url,...args);
        if (String(url).endsWith('/camera/pose-worker.js')) {
          test.workers++;
          this.addEventListener('message', ({data}) => {
            if (data.type === 'pose') test.samples.push({time:data.timestamp,result:data.result,received:performance.now()});
          });
        }
      }
    };
    navigator.mediaDevices.getUserMedia = async ({audio}) => {
      if (audio !== false) throw Error('Unexpected audio request');
      test.starts++;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 480;
      const draw = canvas.getContext('2d');
      const stream = canvas.captureStream(0), track = stream.getVideoTracks()[0];
      test.tracks.push(track);
      let img, cover;
      test.frame = async (name, mask) => {
        if (name) {
          const next = new Image();
          next.src = '/scene/src/camera/tests/' + name + '.jpg';
          await next.decode();
          img = next;
        } else { img = null; }
        cover = mask;
      };
      const timer = setInterval(() => {
        if (track.readyState === 'ended') { clearInterval(timer); return; }
        if (img) draw.drawImage(img,0,0); else draw.fillRect(0,0,480,480);
        if (cover) draw.fillRect(263,227,170,103);
        track.requestFrame();
      },70);
      return stream;
    };
    document.addEventListener('click', event => {
      if (event.target.textContent === 'Record take') test.start = performance.now();
      if (event.target.textContent === 'Finish take') test.end = performance.now();
    }, true);
  });
  await page.goto(origin + '/START.html');
  await page.getByRole('link',{name:'Play the experimental preview'}).press('Enter');
  await page.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
    document.querySelector('#ns-app').dataset.nsPhase === 'playing', null, {timeout:120000});
  const field = page.getByRole('textbox',{name:'Command box'}), canvas = page.locator('#ns-canvas');
  const panel = page.locator('#ns-motion-camera'), details = page.locator('[data-named-takes]');
  const form = page.locator('#ns-action-chat form'), result = details.locator('[data-comparison]');
  const status = text => form.getByText(text);
  const command = async words => { await field.fill(words); await field.press('Enter'); };
  const frame = (name,mask = false) => page.evaluate(([name,mask]) => compareFixture.frame(name,mask), [name,mask]);
  const waitReadings = async (n, condition) => {
    const start = await page.evaluate(() => compareFixture.samples.length);
    await page.waitForFunction(([start,n,condition]) => compareFixture.samples.slice(start).filter(({result}) =>
      condition === 'both' ? result?.leftArm && result?.joints : condition === 'right' ? result?.joints && !result?.leftArm : !result
    ).length >= n, [start,n,condition], {timeout:15000});
  };
  async function record(name, longer) {
    await canvas.press('c');
    await panel.getByRole('combobox').selectOption('bothArms');
    await page.waitForFunction(() => document.querySelector('#ns-motion-camera video')?.srcObject);
    await frame(longer ? 'arm-up' : 'elbow-bent');
    await waitReadings(2,'both');
    await panel.getByRole('button',{name:'Record take'}).click();
    await waitReadings(3,'both');
    if (longer) {
      await frame('arm-down',true);
      await waitReadings(3,'right');
      await frame(null);
      await waitReadings(5,'gap');
      await frame('elbow-bent');
      await waitReadings(3,'both');
    }
    await panel.getByRole('button',{name:'Finish take'}).click();
    await panel.getByText(/Both arms · .* pose samples/).waitFor();
    const samples = await page.evaluate(() => {
      const {samples,start,end} = compareFixture;
      const rows = samples.filter(s => s.time >= start && s.received <= end);
      return rows.filter((s,i) => s.result || rows[i-1]?.result).map(({time,result}) => {
        const upper = result?.leftArm?.upper;
        return {time:time-start, left:result?.leftArm?.elbowDeg ?? null, right:result?.joints?.r_elbow_flex ?? null,
          // The bundled tracker takes square-pixel projections into the chest
          // frame. Compare an independent dot-product calculation with the UI.
          leftLift: upper ? Math.acos(Math.min(1,Math.max(-1,-upper[1] / Math.hypot(...upper)))) * 180/Math.PI : null,
          rightLift: result?.joints?.r_shoulder_abd ?? null};
      });
    });
    await canvas.press('f');
    await details.locator('summary').click();
    await details.getByRole('textbox',{name:'Take name'}).fill(name);
    await details.getByRole('button',{name:'Save last take'}).click();
    await details.getByText('Saved “' + name + '” in this tab.').waitFor();
    return samples;
  }
  const a = 'Overhead left and right', b = 'Bent arms';
  const first = await record(a,true);
  await field.press('Escape');
  const second = await record(b,false);
  await page.evaluate(() => { compareFixture.checkStorage = true; });
  const before = requests.length;
  const activity = () => page.evaluate(() => ({
    starts:compareFixture.starts,workers:compareFixture.workers,voice:compareFixture.voice,
    tracks:compareFixture.tracks.map(t=>t.readyState),local:localStorage.length,session:sessionStorage.length
  }));
  const initial = await activity();
  assert.equal(initial.starts,2);
  assert.equal(initial.workers,2);
  assert.deepEqual(initial.tracks,['ended','ended']);
  const words = 'Compare take named OVERHEAD  left and right with take named bent arms.';
  await command(words);
  await result.getByRole('heading',{name:'Angles by capture time'}).waitFor();
  assert.equal(await page.evaluate(() => document.activeElement.id),'ns-comparison-title');
  const table = result.locator('table');
  const verifiedRates = {};
  async function check(side) {
    verifiedRates[side] = [];
    const columns = await table.evaluate(t => [1,2].map(i => Array.from(t.tBodies[0].rows).flatMap((row,bin) =>
      [...row.cells[i].children].map(el => ({value:el.textContent,bin})))));
    for (const [i,wanted] of [first,second].entries()) {
      const values = columns[i].filter(x => !x.value.includes('expired'));
      assert.equal(values.length,wanted.length);
      for (let k=0;k<values.length;k++) {
        const {value,bin} = values[k], point = wanted[k];
        const [time,angle] = value.split(' s · ');
        assert.ok(Math.abs(Number(time)*1000-point.time)<5, JSON.stringify({value,point}));
        assert.equal(Math.floor(Number(time)*2),bin);
        assert.equal(angle,point[side] === null ? 'No reading' : point[side].toFixed(1)+'°');
      }
      const visible = wanted.filter(p=>p[side] !== null);
      const angles = visible.map(p=>p[side]);
      const summary = await table.locator('thead tr').nth(1).locator('td').nth(i).locator('div').allTextContents();
      assert.equal(summary[0], Math.min(...angles).toFixed(1)+'° to '+Math.max(...angles).toFixed(1)+'°');
      assert.equal(summary[1], visible.length + ' of ' + wanted.length + ' saved frames');
      assert.deepEqual(summary[2], values.find(v=>!v.value.includes('No reading')).value.split(' s · ')[0] + '–' +
        values.findLast(v=>!v.value.includes('No reading')).value.split(' s · ')[0] + ' s from first to last reading');
      const expected = [];
      for (let k = 1; k < wanted.length; k++) {
        const prev = wanted[k-1], curr = wanted[k], elapsed = curr.time - prev.time;
        if (prev[side] === null || curr[side] === null || elapsed < 50 || elapsed > 250) continue;
        expected.push({start: prev.time, end: curr.time, elapsed, rate: (curr[side] - prev[side]) / (elapsed / 1000)});
      }
      assert.ok(expected.length, 'fixture must supply a timed interval for ' + side);
      const cell = table.getByRole('row', {name:/Change per second/}).locator('td').nth(i);
      const [range, coverage] = await cell.locator(':scope > div').allTextContents();
      const extrema = range.match(/^([+-]?[\d.]+) to ([+-]?[\d.]+) °\/s$/);
      assert.ok(extrema, range);
      for (const [index, bound] of [Math.min,Math.max].entries()) {
        assert.ok(Math.abs(Number(extrema[index+1]) - bound(...expected.map(p => p.rate))) <= .050001);
      }
      const duration = (expected.reduce((sum,p) => sum + p.elapsed,0) / 1000).toFixed(3);
      assert.equal(coverage, expected.length + (expected.length === 1 ? ' interval' : ' intervals') + ' · ' + duration + ' s covered');
      await cell.locator('summary').click();
      const entries = await cell.locator('details > div').allInnerTexts();
      assert.equal(entries.length,expected.length);
      for (const [n, entry] of entries.entries()) {
        const [, start, end, rate] = /^(\d+\.\d+)–(\d+\.\d+) s · ([+-]?[\d.]+) °\/s$/.exec(entry);
        const p = expected[n];
        assert.ok(Math.abs(Number(start) * 1000 - p.start) < 5 && Math.abs(Number(end) * 1000 - p.end) < 5);
        assert.ok(Math.abs(Number(rate) - p.rate) <= .050001);
      }
      verifiedRates[side].push({range, coverage});
    }
    return columns.map(col=>col.length);
  }
  const left = await check('left');
  assert.ok(first.some(point=>point.left === null && point.right !== null));
  assert.ok(first.some(point=>point.left === null && point.right === null));
  assert.match(await table.innerText(),/Take ended/);
  await result.getByRole('combobox',{name:'Joint'}).selectOption('Right elbow');
  const right = await check('right');
  const joints = result.getByRole('combobox',{name:'Joint'});
  assert.deepEqual(await joints.locator('option').allTextContents(), ['Left elbow','Right elbow','Left upper-arm lift','Right shoulder lift']);
  await joints.selectOption('Left upper-arm lift');
  await check('leftLift');
  const leftRange = await table.locator('thead tr').nth(1).locator('td').allTextContents();
  await joints.selectOption('Right shoulder lift');
  await check('rightLift');
  const rightRange = await table.locator('thead tr').nth(1).locator('td').allTextContents();
  assert.deepEqual(await activity(),initial);
  assert.equal(requests.length,before);
  await command('compare take named missing with take named bent arms');
  await status(/Both takes must be saved/).waitFor();
  assert.ok(await result.isHidden());
  await details.getByRole('combobox',{name:'First take'}).selectOption(b);
  await details.getByRole('combobox',{name:'Second take'}).selectOption(a);
  await details.getByRole('button',{name:'Compare takes'}).press('Enter');
  assert.match(await table.locator('thead th').nth(1).innerText(),/^Bent arms /);
  await details.getByRole('textbox',{name:'Take name'}).fill('Second alias');
  await details.getByRole('button',{name:'Save last take'}).click();
  assert.ok(await result.isHidden());
  await command('compare take named bent arms with take named second alias');
  await status(/same recording/).waitFor();
  assert.ok(await result.isHidden());
  await details.getByRole('button',{name:'Compare takes'}).click();
  await page.evaluate(text => {compareFixture.text=text;},words);
  await form.getByRole('button',{name:'Use voice'}).click();
  assert.equal(await field.inputValue(),words);
  assert.match(await table.locator('thead th').nth(1).innerText(),/^Bent arms /);
  await form.getByRole('button',{name:'Move',exact:true}).click();
  assert.match(await table.locator('thead th').nth(1).innerText(),/^Overhead left and right /);
  assert.ok(await page.evaluate(() => compareFixture.local && compareFixture.voice === 1));
  await page.setViewportSize({width:320,height:640});
  assert.ok(await table.evaluate(t => t.getBoundingClientRect().right <= document.documentElement.clientWidth));
  assert.equal(requests.length,before);
  const final = await activity();
  assert.deepEqual({...final,voice:0},initial);
  assert.equal(await page.evaluate(() => compareFixture.storageWrites),0);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#ns-app')?.dataset.nsPhase==='playing',null,{timeout:90000});
  await canvas.press('f');
  await command(words);
  await status(/Both takes must be saved/).waitFor();
  assert.ok(await result.isHidden());
  assert.deepEqual(unexpected,[]);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({left,right,leftRange,rightRange,verifiedRates,comparisonRequests:0,physicalCamera:false,voice:'reviewed scripted on-device transcript',model:'bundled CPU Pose Landmarker',initial,browser:browser.version()}));
} finally {
  await browser?.close();
  server.close();
}
