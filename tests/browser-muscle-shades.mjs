// Touching muscles are told apart on the screen (DESIGN-DECISIONS section 188; the owner, Message 202: "muscles next to
// each other can be obviously told apart"). Reads the colours DRAWN on both sides of every visible contact between two
// muscles (the QA probe of ns-scene-three, shadeProbe, and tests/muscle-shades-probe.mjs) in the start view, the view from
// outside, the mirror body held near and the raised right arm in shadow, and checks in the start view, with the mirror
// body held near and with the arm in shadow (there also the contacts in shade) that few
// contacts are drawn nearly equal (OKLab distance under 0.03) or weak (under 0.06), no long one under 0.025, and that
// the muscles stay one rose red (the numbers are at `limits` below).
// The picture is fixed at the full level (the saved setting 'high'): with 'auto' the game lowers its picture when frames
// are slow, and on a busy machine the same view then measures differently from run to run. Every hold is driven by the
// game's own state, not by time (the frame step is capped, so a timed hold moves less when frames are slow).
// Run with Node and Playwright (NS_PLAYWRIGHT_MODULE, NS_CHROMIUM, NS_ANGLE as the other browser tests).
// NS_SEEN_OUT=<file> also visits the other views listed in ns-muscle-seen.mjs and writes that module again to <file> (the
// muscles the pictures show side by side and the light on each; scene/src/ns-muscle-seen.mjs to replace it).
// NS_SCREENSHOTS=<folder> saves a picture of every view measured.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHandler, HOST } from '../serve-local.mjs';
import { analyseShadeProbe, shadeCounts, seenModuleText } from './muscle-shades-probe.mjs';
import { MUSCLE_SEEN_CONTACTS } from '../scene/src/ns-muscle-seen.mjs';

const { chromium } = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const allowedHosts = new Set();
const server = createServer(createHandler({ root, allowedHosts }));
server.listen(0, HOST);
await once(server, 'listening');
const host = `${HOST}:${server.address().port}`;
allowedHosts.add(host);
const seenOut = process.env.NS_SEEN_OUT || null;
const args = ['--disable-background-networking'];
if (process.env.NS_ANGLE) args.push(`--use-angle=${process.env.NS_ANGLE}`);
const report = { errors: [], views: {} };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// What the two strict views must keep (a guard against going back, not a promise that every contact is told apart).
// near: a contact under 0.03; long: seen along this many CSS px or more, and none of those under longUnder; weak: under
// 0.06. Measured on 21 November 2026: the start view 150 contacts, none near, 11 weak, the weakest long one 0.032; the
// mirror body held near 176, none near, 9 weak, the weakest long one 0.037 (before section 188: 3 near and 29 weak, 9
// near and 44 weak). longUnder is 0.025, not 0.03, to leave room for the difference from run to run (the mirror body
// stops within a few centimetres of 1.0 m, and a contact in deep shade then measures a few thousandths more or less).
const limits = Object.freeze({ long: 20, longUnder: 0.025, nearShare: 0.02, weakShare: 0.13 });
// The raised right arm in shadow (a third strict view since 22 November 2026), with a count of the contacts in shade:
// @@SHADOWNUMBERS@@
const shadowLimits = Object.freeze({ ...limits, nearShare: 0.04, weakShare: 0.15, shadeNearShare: 0.12, shadeWeakShare: 0.3 });
let browser;

try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.setDefaultTimeout(240_000); // (a busy machine can need two minutes to start the game)
  page.on('pageerror', error => report.errors.push(String(error)));
  await page.addInitScript(() => { try { localStorage.setItem('neurosurge.settings.v1', JSON.stringify({ quality: 'high' })); } catch { /* the check of what was drawn says so */ } });
  const start = async () => {
    await page.waitForFunction(() => ['playing', 'error'].includes(document.querySelector('#ns-app')?.dataset.nsPhase));
    assert.equal(await page.evaluate(() => document.querySelector('#ns-app').dataset.nsPhase), 'playing');
    await sleep(2500);
    await page.mouse.click(800, 450); // the pointer is captured: a move turns the look by its difference
    await sleep(500);
  };
  await page.goto(`http://${host}/scene/example/preview.html`, { waitUntil: 'domcontentloaded' });
  await start();
  let px = 800, py = 450, ox = 0, oy = 0;
  const look = async (dx, dy, steps = 10, wait = 12) => { for (let i = 0; i < steps; i++) { px += dx / steps; py += dy / steps; await page.mouse.move(px, py); await sleep(wait); } ox += dx; oy += dy; };
  const lookTo = (x, y, steps) => look(x - ox, y - oy, steps);
  // the game's state: frames drawn, what the crosshair is on, what Space holds, where the mirror body and the limbs are
  const state = () => page.evaluate(() => {
    const s = window.__nsQA.inspect(), m = s.scene && s.scene.mirror, c = s.state && s.state.objectCarry, q = s.scene.quality;
    return { frames: s.frames, front: String((s.controlTargets || {}).front || ''), held: Boolean(c && c.held), target: c ? c.target : null, mirror: m ? m.centre : null,
      eye: s.camera && s.camera.pose ? s.camera.pose.position : null, end: s.limbs && s.limbs.ends && s.limbs.ends[s.limbs.limb] ? s.limbs.ends[s.limbs.limb].end : null,
      drawn: `${q.name} ${q.buffer.join('x')}` };
  });
  /** Waits until `n` more frames are drawn (a still view draws none: then at most maxMs). */
  const settle = async (n = 2, maxMs = 600) => { const f0 = (await state()).frames, t0 = Date.now(); while (Date.now() - t0 < maxMs) { await sleep(40); if ((await state()).frames >= f0 + n) return; } };
  /** Puts the crosshair on the mirror body: two reads a few frames apart must agree (one read can be a frame late). */
  const aimMirror = async () => {
    for (let y = 0; y >= -260; y -= 10) for (const x of [0, 30, -30, 60, -60]) {
      await lookTo(x, y, 2); await settle(2, 400);
      if (/^mirror:/.test((await state()).front)) { await settle(2, 400); if (/^mirror:/.test((await state()).front)) return true; }
    }
    return false;
  };
  /** Takes the mirror body with Space and draws it in with S until its centre is `distM` (level) from the eye. */
  const mirrorNear = async (distM = 1.0) => {
    assert.ok(await aimMirror(), 'the crosshair finds the mirror body');
    await page.keyboard.down('Space');
    let s = await state();
    for (let i = 0; i < 80 && !s.held; i++) { await sleep(60); s = await state(); }
    assert.ok(s.held && s.target === 'mirror', `Space holds the mirror body (held ${s.held}, ${s.target})`);
    const dist = v => Math.hypot(v.mirror[0] - v.eye[0], v.mirror[2] - v.eye[2]);
    // (the last stretch in short taps: a held key overshoots by what one slow frame moves, and a contact in deep shade
    // measures differently with the mirror body 5 cm nearer or farther)
    await page.keyboard.down('KeyS');
    for (const t0 = Date.now(); Date.now() - t0 < 30_000 && dist(s) > distM + 0.12;) { await sleep(25); s = await state(); }
    await page.keyboard.up('KeyS'); await sleep(400); s = await state();
    for (let i = 0; i < 80 && dist(s) > distM; i++) { await page.keyboard.down('KeyS'); await sleep(30); await page.keyboard.up('KeyS'); await sleep(140); s = await state(); }
    await sleep(300);
    await page.keyboard.up('Space'); await sleep(600);
    s = await state();
    if (s.held) { await page.keyboard.press('Space'); await sleep(600); s = await state(); } // (a short hold is a tap and keeps holding: tap again)
    assert.ok(!s.held && dist(s) < distM + 0.02 && dist(s) > distM - 0.1, `the mirror body is let go at ${dist(s).toFixed(2)} m`);
    report.mirrorNearM = Math.round(dist(s) * 1000) / 1000;
    await sleep(1500);
  };
  /** Holds a limb key until the chosen limb's end has gone `goM` or stops at a joint's limit. */
  const holdMove = async (key, goM = 0.72, maxMs = 15_000) => {
    let last = (await state()).end || [0, 0, 0], gone = 0, still = 0;
    await page.keyboard.down(key);
    for (const t0 = Date.now(); Date.now() - t0 < maxMs;) {
      await sleep(40);
      const e = (await state()).end || last, d = Math.hypot(e[0] - last[0], e[1] - last[1], e[2] - last[2]);
      gone += d; still = d < 0.0015 ? still + 1 : 0; last = e;
      if (gone >= goM || (still >= 8 && Date.now() - t0 > 1200)) break;
    }
    await page.keyboard.up(key); await sleep(400); await settle(3, 1200);
  };
  const drag = async (dx, dy) => { await page.mouse.down(); await sleep(120); await look(dx, dy, 14, 30); await sleep(200); await page.mouse.up(); await sleep(500); await settle(3, 1200); };
  const results = [];
  const probe = async name => {
    await settle(3, 1500);
    await page.evaluate(() => { globalThis.__nsShadeProbeOut = null; globalThis.__nsShadeProbe = true; });
    await page.waitForFunction(() => Boolean(globalThis.__nsShadeProbeOut));
    const res = await page.evaluate(analyseShadeProbe, { dpr: 1 });
    await page.evaluate(() => { globalThis.__nsShadeProbeOut = null; });
    assert.ok(!res.error, res.error);
    const drawn = (await state()).drawn;
    assert.equal(drawn, 'full 1600x900', `${name}: the full picture is drawn`);
    results.push(res);
    report.views[name] = { ...shadeCounts(res), weakest: res.contacts.filter(c => !c.twin).slice(0, 5).map(c => `${c.dE} ${c.a} ~ ${c.b} (${c.n} px, ${c.body === 'mirror' ? 'mirror body' : 'own body'})`) };
    if (process.env.NS_SCREENSHOTS) await page.screenshot({ path: `${process.env.NS_SCREENSHOTS}/${name}.png` });
    return res;
  };
  const strict = (res, name, lim = limits) => {
    const c = shadeCounts(res);
    if (lim.shadeNearShare !== undefined) {
      assert.ok(c.shadeFail <= lim.shadeNearShare * c.shadeContacts, `${name}: ${c.shadeFail} of ${c.shadeContacts} contacts in shade nearly equal`);
      assert.ok(c.shadeWeak <= lim.shadeWeakShare * c.shadeContacts, `${name}: ${c.shadeWeak} of ${c.shadeContacts} contacts in shade weak`);
    }
    const near = res.contacts.filter(x => !x.twin && x.n >= lim.long && x.dE < lim.longUnder);
    assert.equal(near.length, 0, `${name}: touching muscles seen along ${lim.long} px or more drawn nearly equal: ${near.map(x => `${x.a} ~ ${x.b} ${x.dE} (${x.n} px)`).join('; ')}`);
    assert.ok(c.fail <= lim.nearShare * c.contacts, `${name}: ${c.fail} of ${c.contacts} contacts nearly equal (under 0.03)`);
    assert.ok(c.weak <= lim.weakShare * c.contacts, `${name}: ${c.weak} of ${c.contacts} contacts weak (under 0.06)`);
    assert.ok(res.hue && res.hue.mean >= 18 && res.hue.mean <= 26 && res.hue.sd <= 6, `${name}: one rose red (hue ${JSON.stringify(res.hue)})`);
    assert.ok(res.hue.chroma >= 0.08 && res.hue.chroma <= 0.13, `${name}: chroma ${res.hue.chroma}`);
  };
  report.toneMs = await page.evaluate(() => window.__nsQA.inspect().scene?.glow?.muscleLook?.toneMs ?? null); // (the steps given out at load, ms)

  // (22 November 2026: the table of seen pairs must not fall away silently: every muscle it names is one of the body's)
  report.seenUnknown = await page.evaluate(() => window.__nsQA.inspect().scene?.glow?.muscleLook?.stepWorst?.seenUnknown ?? null);
  assert.equal(report.seenUnknown, 0, 'every muscle the table of seen pairs names is drawn');

  const first = await probe('start');
  if (seenOut) {
    await lookTo(0, 220); await sleep(1500); await probe('down');
    await lookTo(-320, 150); await sleep(1500); await probe('left');
    await lookTo(320, 150); await sleep(1500); await probe('right');
    // (22 November 2026: down and to the left, your right forearm at the right of the picture: its flexors there in
    // nearly the same light)
    await lookTo(-200, 300); await sleep(1500); await probe('down-left');
    await lookTo(0, 0); await sleep(1200);
  }
  await page.keyboard.press('KeyE'); await sleep(3000);
  await probe('outside');
  await page.keyboard.press('KeyE'); await sleep(3000);
  await mirrorNear(1.0);
  const near = await probe('mirror-near');
  if (seenOut) {
    assert.ok(await aimMirror()); await drag(140, 0); await probe('mirror-turned-1');
    assert.ok(await aimMirror()); await drag(140, 0); await probe('mirror-turned-2');
    assert.ok(await aimMirror()); await drag(0, 120); await probe('mirror-tilted');
  }
  // the right arm raised by its keys (S, W, D) from a fresh start, then in shadow (a strict view since 22 November 2026:
  // the deepest shade, where the steps were hardest to keep apart) and, for the table, looked up at
  const again = async () => { await page.reload({ waitUntil: 'domcontentloaded' }); await start(); px = 800; py = 450; ox = 0; oy = 0; };
  await again();
  // 24 November 2026 (DESIGN-DECISIONS section 204): the player-controlled camera from GitHub main stands still, 0.96 m
  // behind the eye, the look is no longer held inside what the neck can do, and with a limb chosen the look's up and
  // down also aims that limb (main's joint aim, ns-app updateJointAim). The earlier sequence here (a look between the
  // keys, then the right leg chosen and a look 250 px down and 150 px right) ended on the empty floor behind the body:
  // no muscle drawn, 0 contacts, and the check failed on "hue null". Now the keys raise the right arm with the look left
  // at the start look, and a turn of the look to the side only (no up or down, so the aim leaves the arm where the keys
  // put it) brings the raised hand into the middle of the picture: the arm lies across the picture, its underside in the
  // shade of the one light. Measured on the combined branch: 139 contacts, 22 of them in shade.
  const rightHandX = () => page.evaluate(() => { const e = window.__nsQA.inspect().limbs.ends.rightArm; return e && e.inPicture ? e.inPicture.x : null; });
  await page.keyboard.press('Digit4'); await sleep(1200);
  await holdMove('KeyS'); if (seenOut) await probe('right-arm-S');
  await holdMove('KeyW');
  await holdMove('KeyD'); if (seenOut) await probe('right-arm-D');
  for (let i = 0; i < 16; i++) {
    const x = await rightHandX();
    assert.ok(Number.isFinite(x), 'the right hand is in front of the camera');
    if (Math.abs(x) < 0.2) break;
    await look(Math.sign(x) * 40, 0, 4); await settle(2, 600);
  }
  assert.ok(Math.abs(await rightHandX()) < 0.2, 'the look turned to the raised right hand');
  await sleep(2500);
  const shadow = await probe('right-arm-in-shadow');
  if (seenOut) {
    await lookTo(250, -150, 12); await sleep(2000); await probe('right-arm-look-up');
    // the left arm reached out and swung; the left leg lifted and swung
    await again();
    await page.keyboard.press('Digit1'); await sleep(1200);
    await lookTo(-250, 120, 12); await sleep(800); await holdMove('KeyW', 0.9); await probe('left-arm-W');
    await holdMove('KeyA'); await probe('left-arm-A');
    await page.keyboard.press('Digit2'); await sleep(1200);
    await lookTo(-60, 260, 12); await sleep(800); await holdMove('KeyW', 0.9); await probe('left-leg-W');
    await holdMove('KeyD'); await probe('left-leg-D');
    const file = fileURLToPath(new URL('../scene/src/ns-muscle-seen.mjs', import.meta.url));
    const text = await readFile(file, 'utf8');
    const head = 'export const MUSCLE_SEEN_CONTACTS = Object.freeze([\n', tail = '\n].map(';
    const i = text.indexOf(head), j = text.indexOf(tail, i);
    assert.ok(i > 0 && j > i, 'the table in ns-muscle-seen.mjs');
    await writeFile(seenOut, text.slice(0, i + head.length) + seenModuleText(results, MUSCLE_SEEN_CONTACTS) + text.slice(j));
    report.seenWrittenTo = seenOut;
  }
  strict(first, 'the start view');
  strict(near, 'the mirror body held near');
  strict(shadow, 'the raised right arm in shadow', shadowLimits);
  assert.deepEqual(report.errors, []);
} finally {
  console.log(JSON.stringify(report, null, 2));
  await browser?.close();
  server.closeAllConnections();
  server.close();
}
