// 25 November 2026 (FIX76; a second play-through of Body update 74, finding 7; the owner, Message 207: "The limb should
// never get stuck"), in Chromium at 1280x720. After a press on a thigh and a drag far up, the first S draws the foot in
// and the first A swings the leg (on update 76 each moved the foot 0.0 cm for as long as it was held); and on the right
// arm folded by a drag of the forearm, where S has nothing left to draw in (the elbow is at its end), W reaches out the
// whole time it is held (on update 76 it stopped beside the neck after 8 to 10 cm).
// Run with Node and Playwright (NS_PLAYWRIGHT_MODULE, NS_CHROMIUM, NS_ANGLE as for the other browser tests).
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
const width = 1280, height = 720;
const errors = [];
const report = { errors, cases: [] };
let browser;

try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  report.chromium = browser.version();
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(45_000);
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto('http://' + host + '/scene/example/preview.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#ns-app')?.dataset.nsPhase === 'playing');
  await page.waitForTimeout(1200);
  for (let i = 0; i < 9; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(250); } // (the tutorial, skipped)
  await page.waitForTimeout(600);
  const state = limb => page.evaluate(limb => { const s = window.__nsQA.inspect(), L = s.limbs; return { front: s.controlTargets?.front ?? null, arrow: s.controlTargets?.arrow === true, chosen: L.limb, end: L.ends[limb].end, drawn: s.bodyDrawnJoints, drag: s.controls.drag && s.controls.drag.binding ? s.controls.drag.binding : null, solve: L.lastSolve }; }, limb);
  const cm = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 100;
  // a press on the wanted part of the limb, found by the game's own pick near where it lies at the start; the button stays down
  const pressOn = async (limb, part, guess) => {
    for (let r = 0; r <= 48; r += 12) for (const [ox, oy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r]]) {
      if (r === 0 && (ox || oy)) continue;
      const x = guess[0] + ox, y = guess[1] + oy;
      await page.mouse.move(x, y); await page.waitForTimeout(90);
      const s = await state(limb);
      if (s.arrow || !new RegExp(`^own:[a-z]+:${limb}$`).test(s.front || '')) continue;
      await page.mouse.down(); await page.waitForTimeout(70);
      const d = (await state(limb)).drag;
      if (d && d.limb === limb && part.test(String(d.segment || ''))) return [x, y];
      await page.mouse.up(); await page.waitForTimeout(70);
    }
    return null;
  };
  const dragFrom = async (at, dx, dy) => {
    for (let j = 1; j <= 24; j++) { await page.mouse.move(Math.max(4, Math.min(width - 4, at[0] + dx * j / 24)), Math.max(4, Math.min(height - 4, at[1] + dy * j / 24))); await page.waitForTimeout(22); }
    await page.waitForTimeout(350); await page.mouse.up(); await page.waitForTimeout(1200);
  };
  const hold = async (limb, key) => { const a = await state(limb); await page.keyboard.down(key); await page.waitForTimeout(520); const held = await state(limb); await page.waitForTimeout(80); await page.keyboard.up(key); await page.waitForTimeout(450); return { cm: cm((await state(limb)).end, a.end), held }; };
  const resetBody = async () => {
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Reset body', exact: true }).click(); await page.waitForTimeout(250);
    await page.keyboard.press('Escape'); await page.waitForFunction(() => window.__nsQA.inspect().shell.mode === 'playing'); await page.waitForTimeout(500);
  };

  // both legs: the thigh dragged up as far as it goes, then S; again, then A
  for (const [limb, guess, dx, hip] of [['leftLeg', [590, 360], -420, 'hip_flex_L'], ['rightLeg', [690, 360], 420, 'hip_flex_R']]) {
    for (const key of ['s', 'a']) {
      const at = await pressOn(limb, /thigh/, guess);
      assert.ok(at, `${limb}: a press on the thigh takes the leg`);
      await dragFrom(at, dx, -360);
      const lifted = await state(limb);
      assert.equal(lifted.chosen, limb, `${limb}: the dragged leg is the chosen limb`);
      assert.ok(lifted.drawn[hip] > 105, `${limb}: the drag lifted the thigh (${lifted.drawn[hip]} degrees)`);
      const r = await hold(limb, key);
      assert.ok(r.cm > 10, `${limb}: after the drag, ${key.toUpperCase()} held 0.6 s moves the foot (${r.cm.toFixed(1)} cm; 0.0 on update 76)`);
      report.cases.push({ limb, key, at, hipDeg: Math.round(lifted.drawn[hip]), movedCm: Math.round(r.cm * 10) / 10 });
      await resetBody();
    }
  }
  // the right arm: the forearm dragged up and across folds the elbow to its end; S has nothing to draw in, W reaches out
  {
    const limb = 'rightArm';
    const at = await pressOn(limb, /forearm|radius|ulna/, [736, 356]);
    assert.ok(at, 'rightArm: a press on the forearm takes the arm');
    await dragFrom(at, -420, -360);
    const folded = await state(limb);
    assert.ok(folded.drawn.r_elbow_flex >= 143, `rightArm: the drag folded the elbow to its end (${folded.drawn.r_elbow_flex} degrees)`);
    const s = await hold(limb, 's');
    assert.ok(s.cm < 1, `rightArm: S on the folded arm is at the end of its range (${s.cm.toFixed(1)} cm)`);
    const w = await hold(limb, 'w');
    assert.ok(w.cm > 25, `rightArm: W then reaches out for as long as it is held (${w.cm.toFixed(1)} cm; 8 to 10 on update 76)`);
    // (half a second into W: about 80 degrees here; on update 76 it stayed at 128, where the hand had stopped)
    assert.ok(w.held.drawn.r_elbow_flex < 115, `rightArm: the elbow opens (${w.held.drawn.r_elbow_flex} degrees while W is held)`);
    report.cases.push({ limb, at, elbowDeg: Math.round(folded.drawn.r_elbow_flex), sCm: Math.round(s.cm * 10) / 10, wCm: Math.round(w.cm * 10) / 10 });
  }
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
