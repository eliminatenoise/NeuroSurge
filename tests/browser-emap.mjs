// The electrical map (the M key; DESIGN-DECISIONS section 192) through the normal game and genuine key and mouse events.
// M on: the map is built, drawn and says so; the picture is another one. M off straight away: the ordinary picture is
// back as it was and the map does nothing in a frame. M on again: a look at a motor area sends a volley, and the map
// reports its area, its route's stations and when the front reaches the farthest muscle. The map changes no camera and
// no control, and it stays on through a pause and through the outside view.
// NS_RAW=1 refuses the pack index. NS_REDUCED=1 uses a reduced-motion browser context (no sparks, steady light).
// The picture quality is fixed for the run (NS_QUALITY: "low", the default here, or "high"): with "auto" a busy machine
// changes the level in the middle of the run, and the test compares pictures taken before and after the map.
// NS_PLAYWRIGHT_MODULE and NS_CHROMIUM can point to a local installation; NS_ANGLE selects the graphics back end.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHandler, HOST } from '../serve-local.mjs';
import { EMAP } from '../scene/src/ns-emap.mjs';
import { EMAP as WORDS } from '../scene/src/ns-text.mjs';

const { chromium } = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const allowedHosts = new Set();
const server = createServer(createHandler({ root, allowedHosts }));
server.listen(0, HOST);
await once(server, 'listening');
const host = `${HOST}:${server.address().port}`;
allowedHosts.add(host);
const args = ['--disable-background-networking'];
const angle = process.env.NS_ANGLE;
if (angle) args.push(`--use-angle=${angle}`);
if (angle === 'swiftshader') args.push('--enable-unsafe-swiftshader');
const raw = process.env.NS_RAW === '1';
const reducedMotion = process.env.NS_REDUCED === '1' ? 'reduce' : 'no-preference';
const quality = process.env.NS_QUALITY === 'high' ? 'high' : 'low';
const errors = [];
const WAIT = 180_000; // the map's model is built a few milliseconds a frame; a busy machine draws few frames
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, reducedMotion });
  page.setDefaultTimeout(WAIT);
  page.on('pageerror', error => errors.push(String(error)));
  const wiringAsked = []; // the nerve data (about 155 kB) is asked for at the first M press, not before
  page.on('request', r => { if (/ns-wiring-data\.mjs/.test(r.url())) wiringAsked.push(r.url()); });
  page.on('console', m => { if (m.type() === 'error' && /shader|program|WebGL/i.test(m.text())) errors.push(m.text().slice(0, 300)); });
  if (raw) await page.route('**/packs/PACK-INDEX.json', route => route.abort());
  await page.addInitScript(q => { try { localStorage.setItem('neurosurge.settings.v1', JSON.stringify({ quality: q })); } catch { /* the default then */ } }, quality);
  await page.goto(`http://${host}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL('**/scene/example/preview.html');
  await page.waitForFunction(() => ['playing', 'error'].includes(document.querySelector('#ns-app')?.dataset.nsPhase));
  const inspect = () => page.evaluate(() => {
    const s = window.__nsQA.inspect(), app = document.querySelector('#ns-app'), card = document.querySelector('.ns-emap-card');
    return {
      frames: s.frames, healthy: s.phase === 'running' && s.features.bodyRig && !s.placeholder, mode: s.shell.mode,
      emap: s.emap, attr: app.getAttribute('data-ns-emap'), read: app.getAttribute('data-ns-read'),
      card: card && card.getClientRects().length ? { title: card.querySelector('.ns-emap-title').textContent, rows: [...card.querySelectorAll('.ns-emap-words')].map(e => e.textContent), honest: card.querySelector('.ns-emap-honest').textContent,
        more: card.querySelector('.ns-emap-more').getClientRects().length > 0, route: [...card.querySelectorAll('.ns-emap-route li')].map(e => e.textContent), notes: [...card.querySelectorAll('.ns-emap-notes li')].length,
        box: (b => [b.left, b.top, b.right, b.bottom])(card.getBoundingClientRect()), inner: card.scrollHeight - card.clientHeight,
        panel: (q => q && q.getClientRects().length ? (b => [b.left, b.top, b.right, b.bottom])(q.getBoundingClientRect()) : null)(document.querySelector('.ns-infopanel')) } : null,
      camera: s.camera.pose, view: s.camera.view, look: [s.controls.yaw, s.controls.pitch], area: s.state.gaze.regionId, step: s.areaStep, quality: s.scene.quality.name,
      joints: s.bodyJointTargets
    };
  });
  /** The game's own picture, small (64 x 36 of the canvas), read in a frame the game drew. */
  const picture = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
    const c = document.querySelector('#ns-canvas'), k = document.createElement('canvas');
    k.width = 64; k.height = 36;
    const g = k.getContext('2d', { willReadFrequently: true });
    g.drawImage(c, 0, 0, 64, 36);
    resolve(Array.from(g.getImageData(0, 0, 64, 36).data));
  }))));
  const differ = (a, b) => { let d = 0; for (let i = 0; i < a.length; i += 4) d += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return d / (a.length / 4 * 3); };
  const frames = async n => { const from = (await inspect()).frames; await page.waitForFunction(({ from, n }) => window.__nsQA.inspect().frames >= from + n, { from, n }, { polling: 60 }); };
  const mapIs = amount => page.waitForFunction(a => { const e = window.__nsQA.inspect().emap; return e && (a > 0 ? e.built && e.amount >= a : e.amount <= 0); }, amount, { polling: 80 });

  await page.mouse.click(800, 450); // the look is captured, as in play
  await frames(6);
  const first = await inspect();
  assert.ok(first.healthy);
  assert.equal(first.attr, 'off', 'the map is off at the start of a session');
  assert.equal(first.emap.on, false);
  assert.equal(first.card, null, 'no legend while the map is off');
  // nothing of the map is fetched or built before the first M press, however long the game has run
  await page.waitForFunction(() => window.__nsQA.inspect().frames > 240, null, { polling: 100 });
  const before = await inspect();
  assert.equal(before.emap.built, false, 'no model before the first M press');
  assert.equal(wiringAsked.length, 0, 'the nerve data is not fetched before the first M press');
  const pic0 = await picture();

  // M on: built, drawn, said
  await page.keyboard.press('KeyM');
  await mapIs(1);
  await frames(4);
  const on = await inspect();
  assert.equal(on.attr, 'on');
  assert.equal(on.emap.on, true);
  assert.equal(on.emap.error, null);
  assert.equal(wiringAsked.length, 1, 'the nerve data is fetched once, at the first M press');
  assert.ok(on.emap.built && on.emap.drawn && on.emap.bodyPosed, 'the map is built and drawn over both bodies');
  assert.ok(on.emap.lines > 500 && on.emap.vertices > 10000, `${on.emap.lines} lines`);
  assert.deepEqual(on.emap.build.warnings, []);
  assert.equal(on.emap.dropped, 0);
  assert.ok(on.emap.slow.command > 2 && on.emap.slow.command < 6, 'slowed, and it says by how much');
  assert.deepEqual(on.camera, first.camera, 'the map changes no camera');
  assert.deepEqual(on.look, first.look, 'and no look');
  assert.deepEqual(on.joints, first.joints, 'and no movement');
  assert.equal(on.view, first.view);
  assert.ok(on.card, 'the legend shows with the map');
  assert.equal(on.card.title, WORDS.title);
  assert.deepEqual(on.card.rows, [WORDS.scan, WORDS.down, WORDS.up]);
  assert.equal(on.card.honest, WORDS.honest);
  assert.equal(on.card.more, false, 'More detail is closed at the start (the R key opens it)');
  if (reducedMotion === 'reduce') assert.equal(on.emap.sparks, 0, 'no sparks under reduced motion');
  else assert.ok(on.emap.sparks <= EMAP.spark.max);
  const picOn = await picture();

  // M off at once: the ordinary picture as it was, and nothing of the map in a frame
  await page.keyboard.press('KeyM');
  await mapIs(0);
  await frames(4);
  const off = await inspect();
  assert.equal(off.attr, 'off');
  assert.equal(off.emap.on, false);
  assert.equal(off.emap.drawn, false);
  assert.equal(off.card, null);
  assert.deepEqual(off.camera, first.camera);
  assert.equal(off.quality, first.quality, 'the picture quality did not change during the comparison');
  const picOff = await picture();
  const changed = differ(pic0, picOn), restored = differ(pic0, picOff);
  assert.ok(changed > 6, `the map is another picture (mean difference ${changed.toFixed(2)} of 255)`);
  assert.ok(restored < Math.max(1.5, 0.2 * changed), `M off gives the ordinary picture back (${restored.toFixed(2)} against ${changed.toFixed(2)})`);
  await frames(12);
  const idle = await inspect();
  assert.equal(idle.emap.frames, off.emap.frames, 'with the map off its part of a frame does not run');
  assert.equal(idle.emap.paletteWrites, off.emap.paletteWrites);

  // M on again: a look at a motor area sends a volley down its route
  await page.keyboard.press('KeyM');
  await mapIs(1);
  let volley = null, stepped = null;
  for (let i = 0; i < 8 && !volley; i++) {
    const before = await inspect();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(seq => (window.__nsQA.inspect().areaStep?.seq || 0) > seq, before.step?.seq || 0, { polling: 20 });
    stepped = await inspect();
    const want = stepped.area;
    try {
      await page.waitForFunction(id => { const v = window.__nsQA.inspect().emap.lastVolley; return v && v.area === id; }, want, { polling: 30, timeout: 4_000 });
      volley = (await inspect()).emap.lastVolley;
    } catch { volley = null; } // an in-between area: it has links only; step on
  }
  assert.ok(volley, 'a look at a motor area is reported as a volley');
  assert.equal(volley.area, stepped.area);
  assert.equal(typeof volley.movement, 'string');
  assert.ok(volley.stations.length >= 6, volley.stations.join(' > '));
  assert.match(volley.stations[0], /^motor area /);
  assert.match(volley.stations[volley.stations.length - 1], /^muscle: /);
  assert.ok(volley.stations.some(s => /bridge/.test(s)), 'the route passes the drawn bridge from the big brain to the body');
  assert.ok(volley.arrivalS > 0 && volley.arrivalS <= EMAP.arriveMaxS + 1e-6, `the farthest muscle is reached in ${volley.arrivalS} s`);
  const lit = await inspect();
  assert.ok(lit.emap.volleys >= 1 && lit.emap.dropped === 0);

  // the reading levels: More detail names the area's route; "off" hides the legend but not the map
  await page.keyboard.press('KeyR');
  await frames(3);
  const more = await inspect();
  assert.equal(more.read, 'more');
  assert.ok(more.card.more && more.card.route.length >= 2, `More detail: the route of the area under the look (${JSON.stringify(more.card.route)})`);
  // (seen in a picture on 21 November: More detail lay on the game's own information panel, two texts on top of each other)
  assert.ok(more.card.panel, 'the information panel is shown at this level');
  const [cl, ct, cr, cb] = more.card.box, [pl, pt, pr, pb] = more.card.panel;
  assert.ok(cb <= pt || ct >= pb || cr <= pl || cl >= pr, `the legend does not lie on the information panel: legend ${more.card.box.map(Math.round)} panel ${more.card.panel.map(Math.round)}`);
  assert.ok(more.card.inner <= 1, `nothing of the legend is cut off at this window size (${more.card.inner} px hidden)`);
  await page.keyboard.press('KeyR');
  await frames(3);
  const hidden = await inspect();
  assert.equal(hidden.read, 'off');
  assert.equal(hidden.card, null, 'the hidden level shows no legend');
  assert.equal(hidden.emap.on, true);
  await page.keyboard.press('KeyR');
  await frames(2);

  // it stays on through the outside view and through a pause
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__nsQA.inspect().camera.view === 'third');
  assert.equal((await inspect()).emap.on, true, 'the map stays on in the outside view');
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__nsQA.inspect().camera.view === 'first');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__nsQA.inspect().shell.mode === 'paused');
  const paused = await inspect();
  assert.equal(paused.attr, 'on', 'the map stays on through a pause');
  await page.keyboard.press('KeyM'); // a key behind the pause page does nothing
  assert.equal((await inspect()).attr, 'on');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__nsQA.inspect().shell.mode === 'playing');
  await page.mouse.click(800, 450);
  await frames(3);
  assert.equal((await inspect()).emap.on, true);
  await page.keyboard.press('KeyM');
  await mapIs(0);
  const end = await inspect();
  assert.equal(end.attr, 'off');
  assert.equal(end.emap.error, null);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ reducedMotion, raw, quality: end.quality, standIn: on.emap.standIn, lines: on.emap.lines, vertices: on.emap.vertices, buildMs: on.emap.build.ms, slices: on.emap.build.slices, slow: on.emap.slow,
    pictureChange: Number(changed.toFixed(2)), pictureRestored: Number(restored.toFixed(2)), volley, errors, chromium: browser.version() }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
