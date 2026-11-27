// 25 November 2026 (hunt of update 78, finding 9): the orientation labels ("Front (anterior)", "Brain's right half",
// ...) keep off the limb buttons and the hint at every reading level, from outside (key E, where the two rows stand
// beside your head and trunk) and in the eye view. At each window size (NS_SIZES, default 1600x900,1280x720,1920x1080):
// the "short" and "off" reading levels show no orientation label; at the full level, a grid of looks set by drags of
// empty space (25 from outside, 6 in the eye view with the brain's front in sight); at each look no shown label shares
// a pixel with the limb buttons' bar or the shown hint, or crosses the window's edge. On update 80 from outside, at
// 1600x900 3 looks of 25 put "Front (anterior)" under the bar (115 x 18 px) and 1 put "Brain's right half" under it;
// 1280x720 and 1920x1080 3 each (the scene's overlayObstacles limbs, ns-app labelRects, ns-scene-three
// ORIENTATION_EDGE.rowGapPx). The check also asks that some label stood just above the bar in one of the looks, so
// that the case of the finding was met.
// (A review: the eye-view looks above never failed on update 80; the testers' own eye-view case did. At 1600x900, on a
// fresh page at the full level with limb 2 chosen, the brain is carried sideways by Space + D as in the testers' run,
// then 12 looks near yaw -0.65 to -0.8 and pitch -0.25 to -0.35 (NS_EYE_CARRIED_SIZES: the sizes this is done at). On
// update 80 "Front (anterior)" stood on the limb buttons in 10 of 25 such looks.)
// Run with Node and Playwright (NS_PLAYWRIGHT_MODULE, NS_CHROMIUM, NS_ANGLE as for the other browser tests).
// NS_ORIENT_SCREENSHOTS=<prefix> saves a picture of each look where a label stands near the bar.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = process.env.NS_TEST_ROOT ? resolve(process.env.NS_TEST_ROOT) : fileURLToPath(new URL('../', import.meta.url));
const { createHandler, HOST } = await import(pathToFileURL(resolve(root, 'serve-local.mjs')));
const { chromium } = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const allowedHosts = new Set();
const server = createServer(createHandler({ root, allowedHosts }));
server.listen(0, HOST);
await once(server, 'listening');
const host = HOST + ':' + server.address().port;
allowedHosts.add(host);
const args = ['--disable-background-networking'];
if (process.env.NS_ANGLE) args.push('--use-angle=' + process.env.NS_ANGLE);
const sizes = (process.env.NS_SIZES || '1600x900,1280x720,1920x1080').split(',').map(s => s.split('x').map(Number));
const OUTSIDE_LOOKS = [];
for (const yaw of [-0.6, -0.3, 0, 0.3, 0.6]) for (const pitch of [0.2, 0, -0.1, -0.2, -0.4]) OUTSIDE_LOOKS.push([yaw, pitch]);
const EYE_LOOKS = [[0, -0.8], [0, -0.9], [-0.3, -0.85], [0.3, -0.85], [-0.45, -0.95], [0.45, -0.95]];
const EYE_CARRIED_LOOKS = [];
for (const yaw of [-0.65, -0.7, -0.75, -0.8]) for (const pitch of [-0.25, -0.3, -0.35]) EYE_CARRIED_LOOKS.push([yaw, pitch]);
const eyeCarriedSizes = new Set((process.env.NS_EYE_CARRIED_SIZES || '1600x900').split(','));
const errors = [];
const report = { errors, sizes: [] };
let browser;

// the shown orientation labels, the limb buttons' bar and the shown hint (CSS px boxes)
const readRows = () => {
  const shown = e => { if (!e || e.hidden || !e.getClientRects().length) return false; for (let x = e; x instanceof Element; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden' || x.hidden || Number(cs.opacity) < 0.05) return false; } return true; };
  const box = e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
  const rows = [];
  for (const e of document.querySelectorAll('.ns-limbs')) if (shown(e)) rows.push({ what: 'the limb buttons', box: box(e) });
  for (const e of document.querySelectorAll('.ns-shell-toast')) if (shown(e) && e.textContent.trim()) rows.push({ what: 'the hint', box: box(e) });
  const labels = [...document.querySelectorAll('.ns-orient')].filter(shown).map(e => ({ text: e.textContent.trim(), box: box(e) }));
  const s = window.__nsQA.inspect();
  return { rows, labels, W: innerWidth, H: innerHeight, yaw: s.controls.yaw, pitch: s.controls.pitch, cam: s.camera.view };
};

try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  report.chromium = browser.version();
  let nearTotal = 0;
  for (const [width, height] of sizes) {
    const tag = `${width}x${height}`;
    let page = null; // (a second, fresh page for the carried brain's looks: the helpers below act on the page of the moment)
    const open = async () => {
      page = await browser.newPage({ viewport: { width, height } });
      page.setDefaultTimeout(45_000);
      page.on('pageerror', error => errors.push(String(error)));
      await page.goto('http://' + host + '/scene/example/preview.html', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#ns-app')?.dataset.nsPhase === 'playing');
      await page.waitForTimeout(1200);
      for (let i = 0; i < 14 && (await count()); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(260); }
    };
    const count = () => page.evaluate(() => { const c = document.querySelector('.ns-prompt-count'); return c && c.getClientRects().length ? c.textContent : ''; });
    await open();
    const level = () => page.evaluate(() => document.querySelector('[data-ns-read]')?.getAttribute('data-ns-read'));
    const toLevel = async lv => { for (let i = 0; i < 4 && (await level()) !== lv; i++) { await page.keyboard.press('r'); await page.waitForTimeout(350); } assert.equal(await level(), lv, `${tag}: the ${lv} reading level`); };
    const one = { size: tag, looks: 0, labels: 0, nearBar: 0, faults: [] };
    const check = async name => {
      const m = await page.evaluate(readRows);
      one.looks++; one.labels += m.labels.length;
      const bar = m.rows.find(r => r.what === 'the limb buttons');
      for (const l of m.labels) {
        const [x0, y0, x1, y1] = l.box;
        if (x0 < -0.5 || y0 < -0.5 || x1 > m.W + 0.5 || y1 > m.H + 0.5) one.faults.push(`${name}: "${l.text}" at ${l.box.map(Math.round)} crosses the window's edge`);
        for (const r of m.rows) {
          const ox = Math.min(x1, r.box[2]) - Math.max(x0, r.box[0]), oy = Math.min(y1, r.box[3]) - Math.max(y0, r.box[1]);
          if (ox > 0 && oy > 0) one.faults.push(`${name} (${m.cam}, yaw ${m.yaw.toFixed(2)}, pitch ${m.pitch.toFixed(2)}): "${l.text}" at ${l.box.map(Math.round)} on ${r.what} at ${r.box.map(Math.round)} (${Math.round(ox)}x${Math.round(oy)})`);
        }
        // (a label just above the bar, within its width: the case of the finding)
        if (bar && x1 > bar.box[0] && x0 < bar.box[2] && y1 <= bar.box[1] && y1 > bar.box[1] - 120) {
          one.nearBar++;
          if (process.env.NS_ORIENT_SCREENSHOTS) await page.screenshot({ path: `${process.env.NS_ORIENT_SCREENSHOTS}-${tag}-${name}.png` });
        }
      }
      return m;
    };
    // the short and off reading levels draw no orientation label
    for (const lv of ['read', 'off']) {
      await toLevel(lv);
      await page.waitForTimeout(400);
      const m = await check(lv);
      assert.deepEqual(m.labels, [], `${tag}: no orientation label at the ${lv} level`);
    }
    await toLevel('more');
    // drags of empty space (never on a card, the bar or the hint) until the look is within a step of (yaw, pitch)
    const empty = async () => {
      for (const [fx, fy] of [[0.04, 0.12], [0.96, 0.12], [0.3, 0.06], [0.7, 0.06], [0.5, 0.06], [0.04, 0.45], [0.96, 0.45], [0.3, 0.14], [0.7, 0.14]]) {
        const x = Math.round(fx * width), y = Math.round(fy * height);
        await page.mouse.move(x, y);
        await page.waitForTimeout(90);
        const free = await page.evaluate(([x, y]) => {
          for (const c of document.querySelectorAll('.ns-hud .ns-panel, .ns-quiet > .ns-prompt, .ns-limbs, aside.ns-infopanel, .ns-shell-toast, .ns-emap-card, .ns-essential')) {
            if (c.hidden || !c.getClientRects().length) continue;
            const r = c.getBoundingClientRect();
            if (x >= r.left - 8 && x <= r.right + 8 && y >= r.top - 8 && y <= r.bottom + 8) return false;
          }
          const f = window.__nsQA.inspect().controlTargets?.front;
          return !f || f === 'nothing';
        }, [x, y]);
        if (free) return [x, y];
      }
      return null;
    };
    const lookNow = () => page.evaluate(() => { const c = window.__nsQA.inspect().controls; return [c.yaw, c.pitch]; });
    const goTo = async (yaw, pitch) => {
      let radPerPx = 0.0038;
      for (let k = 0; k < 6; k++) {
        const [y0, p0] = await lookNow();
        const dx = Math.round((y0 - yaw) / radPerPx), dy = Math.round((p0 - pitch) / radPerPx);
        if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
        const p = await empty();
        if (!p) return;
        const cx = Math.max(2 - p[0], Math.min(width - 2 - p[0], dx)), cy = Math.max(2 - p[1], Math.min(height - 2 - p[1], dy));
        await page.mouse.move(p[0], p[1]);
        await page.mouse.down();
        for (let i = 1; i <= 6; i++) { await page.mouse.move(p[0] + (cx * i) / 6, p[1] + (cy * i) / 6); await page.waitForTimeout(16); }
        await page.mouse.up();
        await page.waitForTimeout(120);
        const [y1, p1] = await lookNow();
        const moved = Math.hypot(y1 - y0, p1 - p0), asked = Math.hypot(cx, cy);
        if (moved > 0.01 && asked > 10) radPerPx = moved / asked; // (the look's own speed, whatever the setting)
      }
    };
    await page.keyboard.press('e');
    await page.waitForTimeout(2400);
    for (const [yaw, pitch] of OUTSIDE_LOOKS) { await goTo(yaw, pitch); await page.waitForTimeout(450); await check(`outside-${yaw}-${pitch}`); }
    await page.keyboard.press('e');
    await page.waitForTimeout(2200);
    for (const [yaw, pitch] of EYE_LOOKS) { await goTo(yaw, pitch); await page.waitForTimeout(450); await check(`eye-${yaw}-${pitch}`); }
    if (eyeCarriedSizes.has(tag)) {
      // the testers' eye-view case: a fresh page (the pointer never moved, so Space holds what the mark in the middle is on),
      // the full level, limb 2, the brain carried sideways by Space + D, then the looks
      await page.close();
      await open();
      await toLevel('more');
      await page.keyboard.press('2'); await page.waitForTimeout(300);
      await page.keyboard.down(' '); await page.waitForTimeout(500);
      const carried = await page.evaluate(() => { const s = window.__nsQA.inspect(); return s.state.objectCarry?.held ? s.state.objectCarry.target : null; });
      await page.keyboard.down('d'); await page.waitForTimeout(600); await page.keyboard.up('d'); await page.waitForTimeout(200);
      await page.keyboard.up(' '); await page.waitForTimeout(900);
      assert.equal(carried, 'brain', `${tag}: Space holds the brain, which D carries sideways`);
      for (const [yaw, pitch] of EYE_CARRIED_LOOKS) { await goTo(yaw, pitch); await page.waitForTimeout(450); await check(`eye-carried-${yaw}-${pitch}`); }
    }
    nearTotal += one.nearBar;
    report.sizes.push(one);
    assert.ok(one.labels > 10, `${tag}: the looks showed orientation labels (${one.labels} in ${one.looks} looks)`);
    assert.deepEqual(one.faults, [], `${tag}: no orientation label on the limb buttons or the hint, or past the window's edge`);
    await page.close();
  }
  assert.ok(nearTotal >= 1, `a label stood just above the limb buttons in some look (${nearTotal}): the finding's case was met`);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.failure = String(error && error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : error);
  console.log(JSON.stringify(report, null, 2));
  throw error;
} finally {
  if (browser) await browser.close();
  server.close();
}
