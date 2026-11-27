// 25 November 2026 (DESIGN-DECISIONS section 217): the game played with the keyboard alone, in Chromium.
// After a Tab, with the focus on a limb button, the game's keys still work (they were dead until the focus left the
// buttons); a button keeps Enter and Space. From the first screen each arrow key walks its half of the strip from the
// top of the n outward, one area a press, and says so at the end (each key went straight to its end of the strip and
// then did nothing).
// 25 November 2026 (hunt of update 78, finding 3; ns-controls LOOK_KEY): Arrow Up and Arrow Down turn the look a step,
// so in the eye view the chosen limb rises and falls with them, the tutorial's look step (4 of 10) is done with them, its
// words show the two keys, and from the start look a few presses up put the mark on the mirror body, which Space then
// holds. Before, the two keys did nothing: the step could only be skipped and the mirror body never held.
// 25 November 2026 (a review of that fix): with the cards hidden (R twice) the look step still shows the two keys as
// keys; with the mouse left resting on the picture, Space after the arrows holds the mirror body the mark is on (it took
// what the resting pointer was on, nothing); a long information card with the focus in it, or clicked last, keeps
// Arrow Up and Arrow Down for its own scroll (they had turned the view behind it) until a press on the picture; a view
// turned away upward says that Arrow Down turns it back.
// Run with Node and Playwright (NS_PLAYWRIGHT_MODULE, NS_CHROMIUM, NS_ANGLE as for the other browser tests).
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = process.env.NS_TEST_ROOT ? resolve(process.env.NS_TEST_ROOT) : fileURLToPath(new URL('../', import.meta.url));
const { createHandler, HOST } = await import(pathToFileURL(resolve(root, 'serve-local.mjs')));
const { chromium } = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const { TIP } = await import(pathToFileURL(resolve(root, 'scene/src/ns-text.mjs')));
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
const report = { errors };
let browser;

async function open({ skip = true } = {}) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(45_000);
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto('http://' + host + '/scene/example/preview.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#ns-app')?.dataset.nsPhase === 'playing');
  await page.waitForTimeout(800);
  for (let i = 0; skip && i < 12 && (await page.evaluate(() => document.querySelector('.ns-prompt-count')?.textContent ?? '')); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(220); }
  return page;
}
const read = page => page.evaluate(() => {
  const s = window.__nsQA.inspect(), a = document.activeElement, tip = document.querySelector('.ns-tip');
  return { focus: a ? `${a.tagName.toLowerCase()}.${String(a.className).split(' ')[0]}` : null, limb: s.limbs?.limb ?? null, end: s.limbs?.ends?.[s.limbs.limb]?.end ?? null,
    up: s.limbs?.ends?.[s.limbs.limb]?.inPicture?.up ?? null, pitch: s.controls.pitch, yaw: s.controls.yaw, front: s.controlTargets?.front ?? null,
    carry: s.state.objectCarry?.held ? s.state.objectCarry.target : null, step: document.querySelector('.ns-prompt-count')?.textContent ?? null,
    keys: [...document.querySelectorAll('.ns-prompt .ns-guide-key')].map(k => k.textContent),
    gaze: s.state.gaze.regionId, seq: s.state.trigger.seq, view: s.camera?.view ?? null, read: document.querySelector('[data-ns-read]')?.getAttribute('data-ns-read') ?? null,
    mode: s.shell.mode, tip: tip && tip.getClientRects().length ? tip.innerText : null };
});

try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  report.chromium = browser.version();

  // 1. the focus on a limb button: the game's keys go on working
  let page = await open();
  await page.keyboard.press('Tab');
  const tabbed = await read(page);
  assert.equal(tabbed.focus, 'button.ns-limbs-chip', 'Tab puts the focus on the first limb button');
  await page.keyboard.press('3'); await page.waitForTimeout(500);
  const chose = await read(page);
  assert.equal(chose.limb, 'rightLeg', 'key 3 chooses the right leg with the focus on a button');
  await page.keyboard.down('s'); await page.waitForTimeout(450); await page.keyboard.up('s'); await page.waitForTimeout(400);
  const drew = await read(page);
  const movedCm = Math.hypot(...drew.end.map((v, i) => v - chose.end[i])) * 100;
  assert.ok(movedCm > 5, `S draws the leg in (${movedCm.toFixed(1)} cm)`);
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(600);
  const aimed = await read(page);
  assert.ok(aimed.gaze && aimed.seq > drew.seq, 'an arrow key aims at an area and it moves');
  await page.keyboard.press('e'); await page.waitForFunction(() => window.__nsQA.inspect().camera?.view === 'third');
  await page.keyboard.press('e'); await page.waitForFunction(() => window.__nsQA.inspect().camera?.view === 'first');
  await page.keyboard.press('r'); await page.waitForTimeout(300);
  assert.notEqual((await read(page)).read, aimed.read, 'R changes the reading level');
  assert.equal((await read(page)).focus, 'button.ns-limbs-chip', 'the focus stayed on the button all the while');
  // the button keeps its own keys: Space and Enter work it (the first button chooses the left arm)
  await page.keyboard.press('Space'); await page.waitForTimeout(400);
  assert.equal((await read(page)).limb, 'leftArm', 'Space on the focused button presses the button');
  await page.keyboard.press('Escape'); await page.waitForFunction(() => window.__nsQA.inspect().shell.mode === 'paused');
  // in the pause page a key is the page's: S there moves no limb
  const paused = await read(page);
  await page.keyboard.press('s'); await page.waitForTimeout(300);
  assert.equal((await read(page)).mode, 'paused');
  report.focus = { movedCm: Math.round(movedCm * 10) / 10, aimed: aimed.gaze, pausedFocus: paused.focus };
  await page.close();

  // 2. each arrow key from the first screen
  for (const [key, first, last] of [['ArrowRight', 'lh_toes', 'lh_scan_inferior'], ['ArrowLeft', 'rh_toes', 'rh_scan_inferior']]) {
    page = await open();
    const seen = []; let endTip = null;
    for (let i = 0; i < 34; i++) {
      await page.keyboard.press(key); await page.waitForTimeout(430);
      const s = await read(page);
      if (s.gaze === seen[seen.length - 1]) { endTip = s.tip; break; }
      seen.push(s.gaze);
    }
    assert.equal(seen[0], first, `${key}: the first press aims at the first area on that side of the middle (${seen[0]})`);
    assert.equal(new Set(seen).size, seen.length, `${key}: every press reaches another area`);
    assert.ok(seen.length >= 25, `${key}: the key walks its half of the strip (${seen.length} areas)`);
    assert.equal(seen[seen.length - 1], last, `${key}: the walk ends at the strip's end`);
    assert.ok(endTip && endTip.replace(/\s+/g, ' ').includes(TIP.areaEnd(key === 'ArrowRight' ? 1 : -1).replace(/\s+/g, ' ')),`${key}: a press at the end says there are no more areas this way (${JSON.stringify(endTip)})`);
    report[key] = { areas: seen.length, first: seen[0], last: seen[seen.length - 1] };
    await page.close();
  }
  // 3. Arrow Up and Arrow Down turn the look; in the eye view the chosen limb follows; the tutorial's look step
  page = await open({ skip: false });
  const DEG = Math.PI / 180, cm = (a, b) => Math.hypot(...a.map((v, i) => v - b[i])) * 100;
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(900); // step 1: an arrow key aims at an area and it moves
  for (let i = 0; i < 3 && (await read(page)).step === '2/10'; i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(400); } // step 2 asks for a click
  await page.keyboard.press('4'); await page.waitForTimeout(900); // step 3: choose the right arm
  const chosen = await read(page);
  assert.equal(chosen.limb, 'rightArm');
  assert.equal(chosen.step, '4/10', 'the look step is next');
  assert.deepEqual(chosen.keys.filter(k => k === '↑' || k === '↓'), ['↑', '↓'], `the look step shows the two keys (${JSON.stringify(chosen.keys)})`);
  // the cards hidden (R: more, then off): the step's card still draws the two keys as keys; R again: back to the start
  await page.keyboard.press('r'); await page.waitForTimeout(300); await page.keyboard.press('r'); await page.waitForTimeout(500);
  const hidden = await read(page);
  assert.equal(hidden.read, 'off');
  assert.deepEqual(hidden.keys.filter(k => k === '↑' || k === '↓'), ['↑', '↓'], `with the cards hidden too (${JSON.stringify(hidden.keys)})`);
  await page.keyboard.press('r'); await page.waitForTimeout(500);
  assert.equal((await read(page)).step, '4/10', 'R leaves the step as it was');
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(700);
  const raised = await read(page);
  assert.ok(Math.abs(raised.pitch - chosen.pitch - 3 * DEG) < 1e-6, `Arrow Up turns the look up 3 degrees (${((raised.pitch - chosen.pitch) / DEG).toFixed(2)})`);
  assert.equal(raised.yaw, chosen.yaw, 'and not sideways');
  const raiseCm = cm(raised.end, chosen.end);
  assert.ok(raiseCm > 5, `the chosen arm moves with the look (${raiseCm.toFixed(1)} cm)`);
  assert.ok(raised.up > chosen.up, `its hand rises in the picture although the view turned up (${chosen.up} -> ${raised.up})`);
  assert.equal(raised.step, '5/10', 'the tutorial\'s look step is done with the key');
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(700);
  const lowered = await read(page);
  assert.ok(Math.abs(lowered.pitch - chosen.pitch) < 1e-6, 'Arrow Down turns it back down');
  assert.ok(cm(lowered.end, chosen.end) < raiseCm / 3, `and the arm comes back down (${cm(lowered.end, chosen.end).toFixed(1)} cm from where it was)`);
  report.look = { raiseCm: Math.round(raiseCm * 10) / 10, upBefore: chosen.up, upAfter: raised.up, keys: chosen.keys };
  await page.close();

  // 4. From the start look a few presses of Arrow Up put the mark on the mirror body, and Space holds it
  page = await open();
  let presses = 0, on = await read(page);
  while (!String(on.front).startsWith('mirror:') && presses < 8) { await page.keyboard.press('ArrowUp'); await page.waitForTimeout(450); presses++; on = await read(page); }
  assert.ok(String(on.front).startsWith('mirror:'), `the mark reaches the mirror body with Arrow Up (${presses} presses, ${on.front})`);
  await page.keyboard.down('Space'); await page.waitForTimeout(600);
  assert.equal((await read(page)).carry, 'mirror', 'Space holds the mirror body');
  await page.keyboard.up('Space'); await page.waitForTimeout(400);
  report.mirror = { presses, front: on.front };
  await page.close();
  // 4b. the same with the mouse left resting on the picture (moved once to empty space, then not touched): after the
  // arrows the mark is the aim, and Space holds what the mark is on
  page = await open();
  const emptyAt = async p => p.evaluate(({ w, h }) => { for (const [fx, fy] of [[0.8, 0.3], [0.85, 0.2], [0.15, 0.3], [0.9, 0.45], [0.1, 0.2]]) { const x = Math.round(fx * w), y = Math.round(fy * h), e = document.elementFromPoint(x, y); if (e && e.tagName === 'CANVAS') return [x, y]; } return null; }, { w: width, h: height });
  const rest = await emptyAt(page);
  assert.ok(rest, 'a place on the picture with no card on it');
  await page.mouse.move(rest[0], rest[1], { steps: 4 }); await page.waitForTimeout(600);
  presses = 0; on = await read(page);
  while (!String(on.front).startsWith('mirror:') && presses < 8) { await page.keyboard.press('ArrowUp'); await page.waitForTimeout(450); presses++; on = await read(page); }
  assert.ok(String(on.front).startsWith('mirror:'), `with the mouse resting, the mark reaches the mirror body (${presses} presses, ${on.front})`);
  await page.keyboard.down('Space'); await page.waitForTimeout(600);
  assert.equal((await read(page)).carry, 'mirror', 'Space holds the mirror body the mark is on, not what the resting pointer is on');
  await page.keyboard.up('Space'); await page.waitForTimeout(400);
  report.mirrorMouseResting = { presses, rest };
  await page.close();

  // 5. a long information card keeps Arrow Up and Arrow Down for its scroll, with the focus in it or after a click on it;
  // a press on the picture gives the keys back to the view
  page = await open();
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(900);
  await page.keyboard.press('r'); await page.waitForTimeout(900); // the full card: More detail open, the card scrolls
  const cardNow = () => page.evaluate(() => { const c = document.querySelector('aside.ns-infopanel'); return c ? { top: c.scrollTop, more: c.scrollHeight - c.clientHeight } : null; });
  const long = await cardNow();
  assert.ok(long && long.more > 40, `the full card holds more than it shows (${JSON.stringify(long)})`);
  for (let i = 0; i < 25 && !(await page.evaluate(() => Boolean(document.activeElement?.closest?.('aside.ns-infopanel')))); i++) await page.keyboard.press('Tab');
  const inCard = await read(page), tabbedTo = await cardNow(); // (the Tab itself may scroll the fold into view)
  for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(200); }
  const scrolled = await cardNow(), afterTab = await read(page);
  // (three presses scroll about 40 px each; on the build before they turned the view and the card moved 18 px as its words changed)
  assert.ok(scrolled.top - tabbedTo.top >= 60, `with the focus in the card Arrow Down scrolls it (${tabbedTo.top} -> ${scrolled.top} px)`);
  assert.equal(afterTab.pitch, inCard.pitch, 'and does not turn the view behind it');
  const cardBox = await page.evaluate(() => { const r = document.querySelector('aside.ns-infopanel').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
  await page.mouse.click(Math.round((cardBox[0] + cardBox[2]) / 2), Math.round(cardBox[1] + (cardBox[3] - cardBox[1]) * 0.6)); await page.waitForTimeout(400);
  const clicked = await read(page);
  for (let i = 0; i < 2; i++) { await page.keyboard.press('ArrowUp'); await page.waitForTimeout(200); }
  const back = await cardNow();
  assert.ok(back.top < scrolled.top, `after a click on the card Arrow Up scrolls it back (${scrolled.top} -> ${back.top})`);
  assert.equal((await read(page)).pitch, clicked.pitch, 'and does not turn the view');
  const picture = await emptyAt(page);
  assert.ok(picture, 'a place on the picture with no card on it');
  await page.mouse.click(picture[0], picture[1]); await page.waitForTimeout(500);
  const pressed = await read(page);
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(500);
  const turned = await read(page);
  assert.ok(Math.abs(turned.pitch - pressed.pitch + 3 * DEG) < 1e-6, `after a press on the picture Arrow Down turns the view again (${((turned.pitch - pressed.pitch) / DEG).toFixed(2)})`);
  report.card = { more: long.more, tabbedTo: tabbedTo.top, scrolled: scrolled.top, back: back.top, picture };
  await page.close();

  // 6. a view turned away upward says which key turns it back
  page = await open();
  let lost = null, ups = 0;
  for (; ups < 45 && !(lost && /turned away/.test(lost)); ups++) { await page.keyboard.press('ArrowUp'); await page.waitForTimeout(160); lost = (await read(page)).tip; }
  await page.waitForTimeout(600); lost = (await read(page)).tip;
  assert.ok(lost && /turned away/.test(lost) && lost.includes(TIP.viewLostUp.hint), `the words of a view turned up name Arrow Down (${JSON.stringify(lost)})`);
  let downs = 0;
  for (; downs < 10 && /turned away/.test((await read(page)).tip || ''); downs++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(700); }
  assert.ok(!/turned away/.test((await read(page)).tip || ''), `Arrow Down turns the view back (${downs} presses)`);
  report.lost = { ups, downs };
  await page.close();

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
