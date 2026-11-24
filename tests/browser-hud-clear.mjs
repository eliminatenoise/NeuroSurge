// 24 November 2026 (round r33, package UI5; DESIGN-DECISIONS section 205): nothing on the screen covers what it should
// not, at four window sizes (1600x900, 1280x720, 1920x1080, 800x600; NS_SIZES to choose), each in a fresh page:
//  - the start view: the tutorial's first cue (its ring on a motor area, its words beside it) covers neither the mirror
//    body's head and neck nor a shown region label, and its ring lies under no label; no drawn turn arrow lies under a
//    HUD card (the tutorial card in the top left corner, the panels, the limb buttons);
//  - the outside view (E): every mirror body's tip stays near its body (inside its box grown by one tip size), none
//    lies on its head and neck unless the fit found no clear place near the body and gave it update 70's place there
//    (pass 2: the fit's report says onHead), and no drawn arrow lies under a HUD card;
//  - (pass 2) a slow look (the pointer taken by one click in the middle, then small mouse steps for about 8 s): the
//    cue's words keep their place against the ring (update 70: 6 moves of more than 3 px; pass 1: 69 to 108, the
//    side changing 18 to 73 times) and never lie on a shown label for more than a few frames;
//  - (pass 3) then the check's wider look (about 9.5 s): in both looks the words jump (against the ring and on the
//    screen) no more often and no further than in update 70, never straight back to the side they left.
//  - (HUD74, 24 November 2026; the hunt of update 73, findings 3, 6 and 10) the hint under the picture stands clear of
//    the page's foot line, at the start and after a look up; in the tutorial's step 6 the "Brain" ring marks a place
//    where the game's own pick says a press takes the brain (in the eye view and from outside), its word and ring
//    share nothing with the other cue marks, the labels and the cards, Space there carries the brain and the step goes
//    on, and a drag from the ring of step 7 turns it; while Space holds the brain the information card stands inside
//    the window with its title in sight and no line cut, at the short reading level and at the full one.
// The mirror body's head and neck are the scene's own box (inspect().scene.mirror.onScreen.headPx: the head's and the
// neck's meshes as drawn now). Run with Node and Playwright (NS_PLAYWRIGHT_MODULE, NS_CHROMIUM, NS_ANGLE as for the
// other browser tests).
import assert from 'node:assert/strict';
import { captureMouse } from './capture-mouse.mjs';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = process.env.NS_TEST_ROOT ? resolve(process.env.NS_TEST_ROOT) : fileURLToPath(new URL('../', import.meta.url));
const { createHandler, HOST } = await import(pathToFileURL(join(root, 'serve-local.mjs')));
const allowedHosts = new Set();
const server = createServer(createHandler({ root, allowedHosts }));
server.listen(0, HOST);
await once(server, 'listening');
const host = `${HOST}:${server.address().port}`;
allowedHosts.add(host);
const sizes = (process.env.NS_SIZES || '1600x900,1280x720,1920x1080,800x600').split(',').map(s => s.split('x').map(Number));
const args = ['--disable-background-networking'];
if (process.env.NS_ANGLE) args.push(`--use-angle=${process.env.NS_ANGLE}`);
const report = { sizes: [], errors: [] };
let browser;

// what is on the screen now (CSS px boxes [x0, y0, x1, y1])
const readScreen = () => {
  const s = window.__nsQA.inspect({ arrowTrace: true }), trace = s.arrowTrace.value;
  const box = e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
  const shown = e => !e.hidden && e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0;
  const labels = [...document.querySelectorAll('.ns-region-label')].filter(shown).map(e => ({ text: e.textContent.trim(), box: box(e) }));
  const cue = (() => {
    const m = document.querySelector('.ns-guide-cues:not([hidden]) .ns-guide-mark-motor:not([hidden])');
    const n = m && m.querySelector('.ns-guide-mark-name');
    return m && shown(m) ? { ring: box(m), words: n && shown(n) ? box(n) : null, text: n ? n.textContent : '' } : null;
  })();
  const cards = [];
  for (const e of document.querySelectorAll('.ns-hud .ns-panel, .ns-quiet > .ns-prompt, .ns-limbs')) {
    if (!shown(e) || (e.parentNode && e.parentNode.hidden)) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) continue;
    cards.push({ name: String(e.className).split(' ')[0], box: box(e) });
  }
  const tips = [];
  for (const set of ['brain', 'mirror']) {
    const T = trace[set];
    if (!T || !T.shown) continue;
    for (const [dir, t] of Object.entries(T.dirs)) {
      const d = t.retainedDraw, b = t.boxPx;
      if (b && d && d.rootVisible && d.meshVisible && !d.hiddenUnderPanel) tips.push({ id: `${set}/${dir}`, box: [b.x0, b.y0, b.x1, b.y1] });
    }
  }
  const m = s.scene && s.scene.mirror;
  return { head: m && m.onScreen ? m.onScreen.headPx : null, body: m && m.onScreen ? m.onScreen.box : null, labels, cue, cards, tips, camera: s.camera.pose, frames: s.frames,
    outside: trace.outside ? trace.outside.tips : null, healthy: s.phase === 'running' && s.features.bodyRig && !s.placeholder && !s.qa };
};
const area = (a, b) => (a && b ? Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1])) : 0);

try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  for (const [width, height] of sizes) {
    const tag = `${width}x${height}`;
    let page = await browser.newPage({ viewport: { width, height } });
    page.setDefaultTimeout(60_000);
    page.on('pageerror', error => report.errors.push(`${tag}: ${String(error)}`));
    await page.goto(`http://${host}/scene/example/preview.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => ['playing', 'error'].includes(document.querySelector('#ns-app')?.dataset.nsPhase));
    await page.locator('.ns-keys.ns-ctl').waitFor({ state: 'detached' });
    // the first cue shows its ring and words, and the arrows are planned
    await page.waitForFunction(() => {
      const n = document.querySelector('.ns-guide-cues:not([hidden]) .ns-guide-mark-motor:not([hidden]) .ns-guide-mark-name');
      const t = window.__nsQA.inspect({ arrowTrace: true }).arrowTrace.value;
      return n && n.getBoundingClientRect().width > 0 && t.brain.shown && t.mirror.shown;
    });
    const advance = async (count = 6) => { const f = await page.evaluate(() => window.__nsQA.inspect().frames); await page.waitForFunction(([f, n]) => window.__nsQA.inspect().frames >= f + n, [f, count]); };
    await advance();
    const start = await page.evaluate(readScreen);
    const one = { tag, start: { head: start.head, cue: start.cue, labels: start.labels.map(l => l.text), tips: start.tips.length, cards: start.cards.map(c => c.name) } };
    report.sizes.push(one);
    assert.ok(start.healthy, `${tag}: the game runs`);
    assert.ok(start.cue && start.cue.words, `${tag}: the tutorial's first cue shows its ring and words`);
    assert.ok(Array.isArray(start.head) && start.head.length === 4, `${tag}: the mirror body's head and neck are on the screen`);
    assert.equal(area(start.cue.words, start.head), 0, `${tag}: the cue's words "${start.cue.text}" ${JSON.stringify(start.cue.words.map(Math.round))} leave the mirror body's head and neck ${JSON.stringify(start.head)} clear`);
    for (const l of start.labels) {
      assert.equal(area(start.cue.words, l.box), 0, `${tag}: the cue's words leave the label "${l.text}" clear`);
      assert.equal(area(start.cue.ring, l.box), 0, `${tag}: the cue's ring ${JSON.stringify(start.cue.ring.map(Math.round))} lies under no label ("${l.text}" ${JSON.stringify(l.box.map(Math.round))})`);
    }
    // 24 November 2026 (HINT_ROW, DESIGN-DECISIONS section 207): with the pointer free the hint under the picture shows
    // all the time; the limb buttons' bar stands clear of it (on main its box lay 5 px into the bar, and at 800x600,
    // on two lines, over the buttons' words).
    const rows = await page.evaluate(() => {
      const B = e => { if (!e || e.hidden || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
      return { hint: B(document.querySelector('.ns-shell-toast')), bar: B(document.querySelector('.ns-limbs')), chips: [...document.querySelectorAll('.ns-limbs-chip')].map(B) };
    });
    one.start.hint = rows.hint && rows.hint.map(Math.round); one.start.limbBar = rows.bar && rows.bar.map(Math.round);
    assert.ok(rows.hint && rows.bar && rows.chips.length === 4, `${tag}: the hint and the four limb buttons show at the start`);
    assert.equal(area(rows.hint, rows.bar), 0, `${tag}: the hint ${JSON.stringify(one.start.hint)} leaves the limb buttons' bar ${JSON.stringify(one.start.limbBar)} clear`);
    assert.ok(rows.hint[1] - rows.bar[3] >= 4 || rows.hint[3] <= rows.bar[1] || rows.hint[0] >= rows.bar[2] || rows.hint[2] <= rows.bar[0], `${tag}: with a gap between them`);
    assert.ok(rows.bar[1] > height * 0.75 && rows.hint[3] <= height, `${tag}: both stay in the bottom of the picture`);
    // 24 November 2026 (FOOT_LINE; the hunt of update 73, finding 10): the hint stands clear of the page's foot line
    // ("Simulated activity · Game editions · Notes and credits", bottom left). At 800x600 the hint's usual place, two
    // lines in the bottom middle, shared 84 x 8 px with it from the start.
    const footOf = () => page.evaluate(() => {
      const B = e => { if (!e || e.hidden || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
      return { hint: B(document.querySelector('.ns-shell-toast')), foot: B(document.querySelector('.preview-note')) };
    });
    const hintClearOfFoot = (h, when) => {
      assert.ok(h.hint && h.foot, `${tag}: ${when} the hint and the page's foot line show`);
      assert.equal(area(h.hint, h.foot), 0, `${tag}: ${when} the hint ${JSON.stringify(h.hint.map(Math.round))} leaves the foot line ${JSON.stringify(h.foot.map(Math.round))} clear`);
      if (h.hint[0] < h.foot[2] && h.hint[2] > h.foot[0]) assert.ok(h.foot[1] - h.hint[3] >= 3, `${tag}: ${when} with a gap above it (${Math.round(h.foot[1] - h.hint[3])} px)`);
    };
    { const h = await footOf(); one.start.foot = h.foot && h.foot.map(Math.round); hintClearOfFoot(h, 'at the start'); }
    for (const t of start.tips) for (const c of start.cards) {
      assert.equal(area(t.box, c.box), 0, `${tag}: the ${t.id} tip ${JSON.stringify(t.box.map(Math.round))} lies under no HUD card (${c.name} ${JSON.stringify(c.box.map(Math.round))})`);
    }
    // the outside view
    await page.keyboard.press('e');
    await page.waitForFunction(() => { const p = window.__nsQA.inspect().camera.pose; return p.thirdPerson && !p.moving; });
    await page.waitForFunction(() => Boolean(window.__nsQA.inspect({ arrowTrace: true }).arrowTrace.value.outside));
    await advance();
    const outside = await page.evaluate(readScreen);
    one.outside = { head: outside.head, tips: outside.tips.map(t => `${t.id} ${t.box.map(Math.round).join(',')}`) };
    assert.ok(Array.isArray(outside.head) && outside.head.length === 4, `${tag}: from outside the mirror body's head and neck are on the screen`);
    one.outside.report = outside.outside;
    for (const t of outside.tips) {
      if (t.id.startsWith('mirror/')) {
        const fit = (outside.outside || []).find(r => r.tip === t.id.replace('/', ':'));
        if (!(fit && fit.onHead)) assert.equal(area(t.box, outside.head), 0, `${tag}: from outside the mirror body's ${t.id} tip ${JSON.stringify(t.box.map(Math.round))} is off its own head ${JSON.stringify(outside.head)}`);
        const b = outside.body, grow = Math.max(t.box[2] - t.box[0], t.box[3] - t.box[1]) + 8;
        assert.ok(Array.isArray(b) && t.box[0] >= b[0] - grow && t.box[1] >= b[1] - grow && t.box[2] <= b[2] + grow && t.box[3] <= b[3] + grow,
          `${tag}: from outside the mirror body's ${t.id} tip ${JSON.stringify(t.box.map(Math.round))} stays near its body ${JSON.stringify(b)}`);
      }
      for (const c of outside.cards) assert.equal(area(t.box, c.box), 0, `${tag}: from outside the ${t.id} tip lies under no HUD card (${c.name})`);
    }
    // (pass 2) back to the eye view, the pointer taken, a slow look with every frame of the cue and the labels recorded
    await page.keyboard.press('e');
    await page.waitForFunction(() => { const p = window.__nsQA.inspect().camera.pose; return p.firstPerson && !p.moving; });
    // 24 November 2026 (section 206): since main's drag-to-look start a click no longer takes the pointer, and the mouse
    // steps below moved a free pointer: the look never turned and both looks passed without measuring anything. The
    // pointer is taken with "Capture mouse" on the pause page, and the look is checked to have turned.
    await captureMouse(page, width / 2, height / 2);
    await page.waitForTimeout(500);
    {
      // (HINT_ROW: with the pointer captured there is no hint, and the bar stands at its own place)
      const captured = await page.evaluate(() => { const t = document.querySelector('.ns-shell-toast'), b = document.querySelector('.ns-limbs'); return { hint: Boolean(t && !t.hidden && t.getClientRects().length), bottom: b ? b.style.bottom : null }; });
      assert.equal(captured.hint, false, `${tag}: no hint while the pointer is captured`);
      assert.equal(captured.bottom, '', `${tag}: the limb buttons' bar is back at its own place`);
    }
    const lookBefore = await page.evaluate(() => { const c = window.__nsQA.inspect().controls; return [c.yaw, c.pitch]; });
    const startRec = () => page.evaluate(() => {
      window.__cueRec = []; window.__cueRecOn = true;
      const B = e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
      const tick = () => {
        if (!window.__cueRecOn) return;
        const m = document.querySelector('.ns-guide-cues:not([hidden]) .ns-guide-mark-motor:not([hidden])');
        const n = m && m.querySelector('.ns-guide-mark-name');
        const shown = e => !e.hidden && e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0;
        window.__cueRec.push(m && n && shown(n) ? [B(m), B(n), m.dataset.place || '', [...document.querySelectorAll('.ns-region-label')].filter(shown).map(B)] : null);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const stopRec = () => page.evaluate(() => { window.__cueRecOn = false; return window.__cueRec; });
    // a move: the words' offset from the ring changes by more than 3 px (the check's rule); (pass 3) `jumps`: such a move
    // that also moves the words on the screen by more than 3 px (words held still against the tutorial card or the
    // picture's edge while the ring goes on are steady to the eye, though their offset changes); a quick return: back to
    // the side left within 8 frames
    const lookStats = rec => {
      let moves = 0, maxMove = 0, jumps = 0, maxJump = 0, sides = 0, returns = 0, onLabel = 0, cueFrames = 0, prev = null;
      const seq = [];
      for (let i = 0; i < rec.length; i++) {
        const f = rec[i];
        if (!f) { prev = null; continue; }
        cueFrames++;
        const [ring, words, side, labels] = f, rel = [words[0] - ring[0], words[1] - ring[1]];
        if (prev) {
          const d = Math.hypot(rel[0] - prev.rel[0], rel[1] - prev.rel[1]), ds = Math.hypot(words[0] - prev.words[0], words[1] - prev.words[1]);
          if (d > 3) { moves++; maxMove = Math.max(maxMove, d); if (ds > 3) { jumps++; maxJump = Math.max(maxJump, Math.min(d, ds)); } }
          if (side !== prev.side) {
            sides++;
            const last = seq[seq.length - 1];
            if (last && last.side === side && i - last.at <= 8) returns++;
            seq.push({ side: prev.side, at: i });
          }
        }
        if (labels.some(l => area(words, l) > 1)) onLabel++;
        prev = { rel, side, words };
      }
      return { frames: rec.length, cueFrames, moves, maxMovePx: Math.round(maxMove), jumps, maxJumpPx: Math.round(maxJump), sideChanges: sides, quickReturns: returns, wordsOnLabelFrames: onLabel };
    };
    await startRec();
    let mx = width / 2;
    let my = height / 2;
    const steps = async (dx, dy, n) => { for (let i = 0; i < n; i++) { mx += dx / n; my += dy / n; await page.mouse.move(mx, my); await page.waitForTimeout(14); } };
    await steps(150, 0, 50);
    { const c = await page.evaluate(() => { const k = window.__nsQA.inspect().controls; return [k.yaw, k.pitch]; });
      assert.ok(Math.abs(c[0] - lookBefore[0]) > 0.05, `${tag}: the mouse steps turn the look (yaw ${lookBefore[0]} -> ${c[0]})`); }
    await steps(-300, 0, 100); await steps(150, 0, 50); await steps(0, -70, 30); await steps(0, 70, 30);
    await page.waitForTimeout(400);
    const look = lookStats(await stopRec());
    one.look = look;
    // (pass 3) the check's wider look: 200 px left and 60 up, 400 right, back
    await startRec();
    await steps(-200, -60, 90); await steps(400, 0, 160); await steps(-200, 60, 90);
    await page.waitForTimeout(400);
    const wide = lookStats(await stopRec());
    one.wide = wide;
    // Limits (pass 3, 24 November 2026). Update 70 on the check's probe (work/ui5/p3/before), at 1600x900 / 800x600: the
    // standard look 6 / 6 moves, all of them jumps, at most 66 px, side changes 6 / 6, no quick return; the wide look
    // 14 / 18 moves and jumps, at most 80 / 77 px. Pass 3 on the same probe (work/ui5/p3/after3): jumps 6 / 8 and
    // 12 / 10, at most 28 / 60 and 102 / 82 px, moves 7 / 19 and 13 / 27 (a move that is no jump: the words held still
    // on the screen against the card or the edge). The limits are those numbers with a little room, not update 70's
    // everywhere: at 800x600 the standard look jumps 8 times, and in the wide look one jump is larger (the ring going
    // to another area; in this test 102 to 121 px at 1600x900, 1280x720 and 1920x1080), and at 1920x1080 one jump in
    // the standard look is 98 px. Pass 2 allowed 30 moves and 10 side changes, and its looks jumped up to 199 px.
    for (const [name, L, most, mostPx, mostMoves] of [['look', look, 10, 110, 25], ['wide look', wide, 18, 130, 40]]) {
      assert.ok(L.cueFrames >= L.frames / 2, `${tag}: the cue shows through the ${name} (${L.cueFrames} of ${L.frames} frames)`);
      assert.ok(L.moves <= mostMoves, `${tag}: during the ${name} the words' offset from the ring changes at most ${mostMoves} times (${L.moves})`);
      assert.ok(L.jumps <= most, `${tag}: during the ${name} the cue's words jump (against the ring and on the screen) at most ${most} times (${L.jumps}; update 70: 6 in the look, 14 to 18 in the wide look)`);
      assert.ok(L.maxJumpPx <= mostPx, `${tag}: during the ${name} no jump of the words is larger than ${mostPx} px (${L.maxJumpPx})`);
      assert.ok(L.sideChanges <= 6, `${tag}: during the ${name} the words change side at most 6 times (${L.sideChanges})`);
      assert.equal(L.quickReturns, 0, `${tag}: during the ${name} the words never go straight back to the side they left`);
      assert.ok(L.wordsOnLabelFrames <= 3, `${tag}: during the ${name} the words lie on a shown label in at most 3 frames (${L.wordsOnLabelFrames})`);
    }
    // 24 November 2026 (DESIGN-DECISIONS section 207): with the pointer free again, the tip beside the pointer keeps off
    // the tutorial's card (ns-quiet tipSides `card`): on main, at 800x600, 24 of 228 pointer places near the top left
    // put the tip partly under that card. A grid of pointer places round the card's right and lower edges; every tip
    // shown is clear of the card and inside the picture.
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.pointerLockElement && window.__nsQA.inspect().shell.mode === 'paused');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__nsQA.inspect().shell.mode === 'playing');
    const cardBox = await page.evaluate(() => { const e = document.querySelector('.ns-prompt'); if (!e || e.hidden || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
    let tipsSeen = 0;
    if (cardBox) {
      for (let y = Math.max(20, cardBox[1] + 10); y <= cardBox[3] + 60; y += 22) for (let x = Math.max(20, cardBox[2] - 120); x <= Math.min(width - 20, cardBox[2] + 120); x += 30) {
        await page.mouse.move(x, y);
        await advance(3);
        const t = await page.evaluate(() => { const e = document.querySelector('.ns-tip'), c = document.querySelector('.ns-prompt'); const B = q => { if (!q || q.hidden || !q.getClientRects().length) return null; const r = q.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }; return { tip: B(e), card: B(c), text: e ? e.innerText.replace(/\n/g, ' | ') : '' }; });
        if (!t.tip || !t.card) continue;
        tipsSeen++;
        assert.equal(area(t.tip, t.card), 0, `${tag}: the tip "${t.text}" ${JSON.stringify(t.tip.map(Math.round))} with the pointer at ${x},${y} keeps off the tutorial card ${JSON.stringify(t.card.map(Math.round))}`);
        assert.ok(t.tip[0] >= 0 && t.tip[1] >= 0 && t.tip[2] <= width && t.tip[3] <= height, `${tag}: and stays in the picture`);
      }
    }
    one.tipsNearCard = tipsSeen;

    // ---- 24 November 2026 (package HUD74; the hunt of update 73, findings 3, 6 and 10), with the pointer free ----
    // In a fresh page at the start look: the looks above leave the view where their mouse steps ended.
    await page.close();
    page = await browser.newPage({ viewport: { width, height } });
    page.setDefaultTimeout(60_000);
    page.on('pageerror', error => report.errors.push(`${tag}: ${String(error)}`));
    await page.goto(`http://${host}/scene/example/preview.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => ['playing', 'error'].includes(document.querySelector('#ns-app')?.dataset.nsPhase));
    await page.locator('.ns-keys.ns-ctl').waitFor({ state: 'detached' });
    await page.waitForFunction(() => { const t = window.__nsQA.inspect({ arrowTrace: true }).arrowTrace.value; return t.brain.shown && t.mirror.shown; });
    await advance();
    const front = () => page.evaluate(() => { const c = window.__nsQA.inspect().controlTargets; return c ? { front: c.front, arrow: c.arrow, at: c.at } : null; });
    const frontAt = async (x, y) => { await page.mouse.move(x, y, { steps: 3 }); await advance(4); return front(); };
    // (10) after a look up the hint goes beside the brain's back arrow, on the left where the right has no room, and lay
    // on the foot line there: 8 px shared in height at 1280x720 and 1600x900 (261 and 144 px across). Three drags on
    // empty space, 60, 40 and 30 px up, as the tester's (the second is the one that put the hint on the foot line);
    // where the brain fills the picture's sides no drag is made and the start's check stands.
    {
      one.lookUp = [];
      const lookStart = await page.evaluate(() => window.__nsQA.inspect().controls.pitch);
      for (const up of [60, 40, 30]) {
        let empty = null;
        for (const [x, y] of [[width - 40, 60], [40, 60], [width - 40, height * 0.5], [40, height * 0.5], [width - 40, height - 140], [40, height - 140], [width / 2, 40]]) {
          const f = await frontAt(Math.round(x), Math.round(y));
          if (f && !f.front && !f.arrow) { empty = [Math.round(x), Math.round(y)]; break; }
        }
        if (!empty) { one.lookUp.push({ skipped: 'no empty place to drag from' }); break; }
        const pitch0 = await page.evaluate(() => window.__nsQA.inspect().controls.pitch);
        await page.waitForTimeout(120);
        await page.mouse.down();
        for (let j = 1; j <= 15; j++) { await page.mouse.move(empty[0], empty[1] - (up * j) / 15); await page.waitForTimeout(16); }
        await page.mouse.up();
        await page.waitForTimeout(700);
        const pitch1 = await page.evaluate(() => window.__nsQA.inspect().controls.pitch);
        assert.ok(Math.abs(pitch1 - pitch0) > 0.02, `${tag}: the drag on empty space turns the look (pitch ${pitch0} -> ${pitch1})`);
        const h = await footOf();
        one.lookUp.push({ hint: h.hint && h.hint.map(Math.round), foot: h.foot && h.foot.map(Math.round), pitchDeg: Math.round(pitch1 * 1800 / Math.PI) / 10, sameColumn: Boolean(h.hint && h.foot && h.hint[0] < h.foot[2] && h.hint[2] > h.foot[0]) });
        hintClearOfFoot(h, `after a look up to ${one.lookUp[one.lookUp.length - 1].pitchDeg} degrees`);
      }
      // the look back where it started, for what follows: the same way down in one drag; without an empty place to
      // drag from, the page is loaded again
      const went = one.lookUp.filter(u => !u.skipped).length;
      if (went) {
        const down = [60, 40, 30].slice(0, went).reduce((a, b) => a + b, 0);
        let empty = null;
        for (const [x, y] of [[width - 40, 60], [40, 60], [width - 40, height * 0.3], [40, height * 0.3], [width / 2, 40]]) {
          const f = await frontAt(Math.round(x), Math.round(y));
          if (f && !f.front && !f.arrow) { empty = [Math.round(x), Math.round(y)]; break; }
        }
        let back = false;
        if (empty) {
          await page.waitForTimeout(120);
          await page.mouse.down();
          for (let j = 1; j <= 30; j++) { await page.mouse.move(empty[0], empty[1] + (down * j) / 30); await page.waitForTimeout(16); }
          await page.mouse.up();
          await page.waitForTimeout(500);
          back = Math.abs((await page.evaluate(() => window.__nsQA.inspect().controls.pitch)) - lookStart) < 0.005;
        }
        if (!back) {
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForFunction(() => ['playing', 'error'].includes(document.querySelector('#ns-app')?.dataset.nsPhase));
          await page.locator('.ns-keys.ns-ctl').waitFor({ state: 'detached' });
          await page.waitForFunction(() => { const t = window.__nsQA.inspect({ arrowTrace: true }).arrowTrace.value; return t.brain.shown && t.mirror.shown; });
          await advance();
        }
        one.lookBack = back ? 'dragged' : 'page loaded again';
      }
    }
    // (3) the tutorial's step 6, "Hold Space on the brain, carry it, then release", with a limb chosen by its key as a
    // player has by then (the "Shoulder aim" / "Hip aim" mark shows then too: at 1280x720 the word "Brain" lay on its
    // words, 40 x 16 px). On update 73 the ring stood at the brain's turning point as drawn: at 800x600 the mirror
    // body's pelvis (Space took the mirror body, the step stayed 6/9).
    const stepNow = () => page.evaluate(() => { const c = document.querySelector('.ns-prompt-count'); return c && c.getClientRects().length ? c.textContent.trim() : ''; });
    await page.keyboard.press('2');
    await advance(6);
    for (let i = 0; i < 9 && !/^6\//.test(await stepNow()); i++) { await page.keyboard.press('Enter'); await page.waitForTimeout(350); }
    assert.match(await stepNow(), /^6\/\d/, `${tag}: the tutorial is at its step 6`);
    await page.mouse.move(width - 46, Math.round(height * 0.42));
    const cueMarks = () => {
      const B = e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
      const shown = e => Boolean(e) && !e.hidden && e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0;
      const out = { rings: {}, words: {}, labels: [], cards: [] };
      if (!document.querySelector('.ns-guide-cues:not([hidden])')) return out;
      for (const m of document.querySelectorAll('.ns-guide-cues .ns-guide-mark')) {
        if (!shown(m)) continue;
        const k = String(m.className).replace(/.*ns-guide-mark-/, ''), n = m.querySelector('.ns-guide-mark-name');
        out.rings[k] = B(m); if (shown(n)) out.words[k] = { text: n.textContent, box: B(n) };
      }
      for (const e of document.querySelectorAll('.ns-region-label')) if (shown(e)) out.labels.push({ name: `label "${e.textContent.trim()}"`, box: B(e) });
      for (const e of document.querySelectorAll('.ns-hud .ns-panel, .ns-quiet > .ns-prompt, .ns-limbs, .ns-shell-toast, .ns-infopanel')) {
        if (!shown(e) || (e.parentNode && e.parentNode.hidden)) continue;
        const cs = getComputedStyle(e);
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) continue;
        out.cards.push({ name: `card ${String(e.className).split(' ')[0]}`, box: B(e) });
      }
      // (the arrows' plain captions, shown for every brain arrow in step 7)
      for (const e of document.querySelectorAll('.ns-arrow-tip')) if (shown(e)) out.cards.push({ name: `caption "${e.textContent}"`, box: B(e) });
      const s = window.__nsQA.inspect(), m = s.scene && s.scene.mirror;
      out.head = m && m.onScreen ? m.onScreen.headPx : null; out.cue = s.guideCue || null;
      return out;
    };
    const ringShown = async (when = '') => {
      try {
        await page.waitForFunction(() => { const m = document.querySelector('.ns-guide-cues:not([hidden]) .ns-guide-mark-brain:not([hidden])'); const n = m && m.querySelector('.ns-guide-mark-name'); const c = window.__nsQA.inspect().guideCue; return Boolean(m && n && n.getBoundingClientRect().width > 0 && c && c.placed && !c.searching); }, null, { timeout: 15000 });
      } catch {
        const st = await page.evaluate(() => { const s = window.__nsQA.inspect(); return { cue: s.guideCue, step: (document.querySelector('.ns-prompt-count') || {}).textContent, read: document.querySelector('.ns-app').getAttribute('data-ns-read'), view: s.camera.view, carry: s.state.objectCarry && s.state.objectCarry.held, layer: Boolean(document.querySelector('.ns-guide-cues:not([hidden])')) }; });
        assert.fail(`${tag}: ${when} the Brain ring does not show within 15 s: ${JSON.stringify(st)}`);
      }
    };
    // the ring and its word share nothing with the other marks, the labels, the cards and the mirror body's head
    const brainCueClear = (m, view) => {
      const ring = m.rings.brain, words = m.words.brain;
      assert.ok(ring && words && words.text === 'Brain', `${tag}: ${view} the "Brain" ring and its word show`);
      for (const [name, b] of [['ring', ring], ['word', words.box]]) {
        assert.ok(b[0] >= 0 && b[1] >= 0 && b[2] <= width && b[3] <= height, `${tag}: ${view} the Brain ${name} ${JSON.stringify(b.map(Math.round))} is inside the picture`);
        for (const [k, r] of Object.entries(m.rings)) if (k !== 'brain') assert.equal(area(b, r), 0, `${tag}: ${view} the Brain ${name} ${JSON.stringify(b.map(Math.round))} leaves the ${k} mark ${JSON.stringify(r.map(Math.round))} clear`);
        for (const [k, w] of Object.entries(m.words)) if (k !== 'brain') assert.equal(area(b, w.box), 0, `${tag}: ${view} the Brain ${name} ${JSON.stringify(b.map(Math.round))} leaves the words "${w.text}" ${JSON.stringify(w.box.map(Math.round))} clear`);
        for (const o of [...m.labels, ...m.cards]) assert.equal(area(b, o.box), 0, `${tag}: ${view} the Brain ${name} ${JSON.stringify(b.map(Math.round))} leaves the ${o.name} ${JSON.stringify(o.box.map(Math.round))} clear`);
      }
      if (m.head) assert.equal(area(ring, m.head), 0, `${tag}: ${view} the Brain ring ${JSON.stringify(ring.map(Math.round))} is off the mirror body's head and neck ${JSON.stringify(m.head)}`);
      return [Math.round((ring[0] + ring[2]) / 2), Math.round((ring[1] + ring[3]) / 2)];
    };
    const brainPick = async (at, view) => {
      const f = await frontAt(at[0], at[1]);
      assert.ok(f && !f.arrow && /^brain:(glass|outline)$/.test(f.front || ''), `${tag}: ${view} the game's pick at the Brain ring ${at} says the brain's bare glass (it says ${f && (f.arrow ? 'an arrow tip' : f.front)})`);
      return f.front;
    };
    await ringShown('in step 6');
    await advance(4);
    const eye = await page.evaluate(cueMarks);
    assert.ok(eye.rings.joint && eye.words.joint, `${tag}: with a limb chosen by its key the hip or shoulder mark shows beside the Brain ring`);
    const eyeAt = brainCueClear(eye, 'in the eye view');
    one.brainCue = { eye: { ring: eye.rings.brain.map(Math.round), word: eye.words.brain.box.map(Math.round), joint: eye.words.joint.box.map(Math.round), search: eye.cue }, pick: {} };
    one.brainCue.pick.eye = await brainPick(eyeAt, 'in the eye view');
    // from outside (E): the ring is found afresh for that view
    await page.mouse.move(width - 46, Math.round(height * 0.42));
    await page.keyboard.press('e');
    await page.waitForFunction(() => { const p = window.__nsQA.inspect().camera.pose; return p.thirdPerson && !p.moving; });
    await ringShown('from outside');
    await advance(4);
    const out3 = await page.evaluate(cueMarks);
    const outAt = brainCueClear(out3, 'from outside');
    one.brainCue.outside = { ring: out3.rings.brain.map(Math.round), word: out3.words.brain.box.map(Math.round), search: out3.cue };
    one.brainCue.pick.outside = await brainPick(outAt, 'from outside');
    await page.mouse.move(width - 46, Math.round(height * 0.42));
    await page.keyboard.press('e');
    await page.waitForFunction(() => { const p = window.__nsQA.inspect().camera.pose; return p.firstPerson && !p.moving; });
    await ringShown('back in the eye view');
    await advance(4);
    // Space on the ring carries the brain; (6) the information card, "Hands and feet: grip", then stands inside the
    // window with its title in sight and nothing running over its foot (on update 73, at 800x600: 692 px tall, its
    // title above the top edge)
    const gripCard = () => page.evaluate(() => {
      const p = document.querySelector('.ns-infopanel');
      if (!p || p.hidden || !p.getClientRects().length || getComputedStyle(p).display === 'none') return null;
      const B = e => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
      const t = p.querySelector('.ns-infopanel-title');
      const drawn = e => !e.hidden && e.getClientRects().length > 0;
      return { title: t ? t.textContent : '', box: B(p), titleBox: t && drawn(t) ? B(t) : null, over: p.scrollHeight - p.clientHeight, scrollTop: p.scrollTop, card: p.getAttribute('data-ns-card'), keyfit: p.getAttribute('data-ns-keyfit'),
        rows: [...p.querySelectorAll('.ns-infopanel-rows dt')].filter(drawn).map(e => e.textContent), level: document.querySelector('.ns-app').getAttribute('data-ns-read') };
    });
    const cardFits = (c, level) => {
      assert.ok(c && c.title === 'Hands and feet: grip' && c.card === 'key', `${tag}: at the ${level} level Space on the brain shows the grip card (${c && c.title})`);
      assert.ok(c.box[1] >= 0 && c.box[3] <= height && c.box[0] >= 0 && c.box[2] <= width, `${tag}: at the ${level} level the grip card ${JSON.stringify(c.box.map(Math.round))} stands inside the ${width}x${height} window`);
      assert.ok(c.titleBox && c.titleBox[1] >= Math.max(0, c.box[1]) - 1 && c.titleBox[3] <= Math.min(height, c.box[3]) + 1, `${tag}: at the ${level} level its title is in sight (${JSON.stringify(c.titleBox && c.titleBox.map(Math.round))} in ${JSON.stringify(c.box.map(Math.round))}, scrolled ${c.scrollTop})`);
      assert.ok(c.over <= 1, `${tag}: at the ${level} level nothing of it runs over its box (${c.over} px; parts left out: stage ${c.keyfit})`);
      assert.ok(c.rows.includes('Key') && c.rows.includes('Strip part'), `${tag}: at the ${level} level it keeps its key and strip part (${c.rows})`);
    };
    const holdBrain = async (at, level) => {
      await page.mouse.move(at[0], at[1], { steps: 3 });
      await advance(4);
      await page.keyboard.down('Space');
      await page.waitForFunction(() => { const c = window.__nsQA.inspect().state.objectCarry; return Boolean(c && c.held); });
      const carried = await page.evaluate(() => window.__nsQA.inspect().state.objectCarry.target);
      assert.equal(carried, 'brain', `${tag}: Space on the Brain ring ${at} takes the brain`);
      await page.waitForFunction(() => { const t = document.querySelector('.ns-infopanel .ns-infopanel-title'); return Boolean(t && t.textContent === 'Hands and feet: grip' && t.getClientRects().length); });
      // (Space is held well past the tap threshold: let go sooner it is a tap, which keeps the hold)
      await page.waitForTimeout(700);
      await advance(8);
      const c = await gripCard();
      cardFits(c, level);
      return c;
    };
    one.gripCard = {};
    { const c = await holdBrain(eyeAt, 'short'); one.gripCard.short = { box: c.box.map(Math.round), heightPx: Math.round(c.box[3] - c.box[1]), stage: c.keyfit, rows: c.rows }; }
    // carried a little way, the ring rides on the brain; let go: the step goes on
    for (let k = 1; k <= 12; k++) { await page.mouse.move(eyeAt[0] + k * 6, eyeAt[1] + k * 2); await page.waitForTimeout(20); }
    await advance(4);
    { const m = await page.evaluate(cueMarks); assert.ok(m.rings.brain, `${tag}: the ring stays on the brain while it is carried`); }
    await page.keyboard.up('Space');
    await page.waitForFunction(() => /^7\//.test((document.querySelector('.ns-prompt-count') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => {});
    assert.match(await stepNow(), /^7\/\d/, `${tag}: after the brain was carried and let go the tutorial goes on to step 7`);
    // (6) the full level (R): an opened area card is scrolled to its More detail; the grip card that follows kept that
    // scroll and its title was out of sight at every size, with 132 to 479 px of it under its foot
    await page.mouse.move(width - 46, Math.round(height * 0.42));
    await page.waitForFunction(() => { const c = window.__nsQA.inspect().state.objectCarry; return !(c && c.held); });
    await page.keyboard.press('r');
    await page.waitForFunction(() => document.querySelector('.ns-app').getAttribute('data-ns-read') === 'more');
    let onArea = null;
    scan: for (const fy of [0.14, 0.2, 0.26, 0.32, 0.1]) for (let x = Math.round(width * 0.3); x <= width * 0.7; x += 24) {
      const f = await frontAt(x, Math.round(height * fy));
      if (f && !f.arrow && /^brain:area:/.test(f.front || '')) { onArea = [x, Math.round(height * fy)]; break scan; }
    }
    if (onArea) {
      await page.waitForTimeout(600); // (the card takes the area the pointer rests on, and opens at its More detail)
      one.gripCard.openScroll = await page.evaluate(() => { const p = document.querySelector('.ns-infopanel'); return p ? Math.round(p.scrollTop) : null; });
    }
    await page.mouse.move(width - 46, Math.round(height * 0.42));
    await ringShown('in step 7 at the full level');
    await advance(4);
    const eye7 = await page.evaluate(cueMarks);
    const at7 = brainCueClear(eye7, 'in step 7');
    one.brainCue.pick.step7 = await brainPick(at7, 'in step 7');
    { const c = await holdBrain(at7, 'full'); one.gripCard.full = { box: c.box.map(Math.round), heightPx: Math.round(c.box[3] - c.box[1]), stage: c.keyfit, rows: c.rows, scrollTop: Math.round(c.scrollTop) }; }
    await page.keyboard.up('Space');
    await page.waitForFunction(() => { const c = window.__nsQA.inspect().state.objectCarry; return !(c && c.held); });
    await page.keyboard.press('r'); await page.keyboard.press('r');
    await page.waitForFunction(() => (document.querySelector('.ns-app').getAttribute('data-ns-read') || 'read') === 'read');
    // (3) step 7, "Drag the brain to turn it": a press on its ring and a drag turns the brain, and the step goes on
    await page.mouse.move(width - 46, Math.round(height * 0.42));
    await ringShown('in step 7');
    await advance(4);
    // (step 7 shows a caption by every brain arrow: from outside too the ring, its word and the captions keep apart)
    await page.keyboard.press('e');
    await page.waitForFunction(() => { const p = window.__nsQA.inspect().camera.pose; return p.thirdPerson && !p.moving; });
    await ringShown('in step 7 from outside');
    await advance(6);
    const out7 = await page.evaluate(cueMarks);
    assert.ok(out7.cards.some(o => o.name.startsWith('caption')), `${tag}: step 7 shows the brain arrows' captions`);
    const outAt7 = brainCueClear(out7, 'in step 7 from outside');
    one.brainCue.pick.step7outside = await brainPick(outAt7, 'in step 7 from outside');
    await page.mouse.move(width - 46, Math.round(height * 0.42));
    await page.keyboard.press('e');
    await page.waitForFunction(() => { const p = window.__nsQA.inspect().camera.pose; return p.firstPerson && !p.moving; });
    await ringShown('in step 7, back in the eye view');
    await advance(6);
    const eye7b = await page.evaluate(cueMarks);
    const at7b = brainCueClear(eye7b, 'in step 7, the short level again');
    await brainPick(at7b, 'in step 7, the short level again');
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(at7b[0] + i * 6, at7b[1]); await page.waitForTimeout(20); }
    await page.mouse.up();
    await page.waitForFunction(() => /^8\//.test((document.querySelector('.ns-prompt-count') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => {});
    assert.match(await stepNow(), /^8\/\d/, `${tag}: a drag from the Brain ring turns the brain and the tutorial goes on to step 8`);
    // ---- 25 November 2026 (FIX76; a second play-through of update 74, finding 9) ----
    // In the outside view your own head and trunk are at the bottom middle of the picture, where the limb buttons and
    // the hint stand: at 800x600 the two rows covered 64 % of them (69 % at 1280x720, 61 % at 1600x900). While a strip
    // beside your head and trunk is free the two rows stand in it: no px shared with the game's own box of your head
    // and trunk, the buttons 6 px clear of the hint (section 207), the hint above the foot line (210), nothing on a
    // card; and back in the eye view both rows are where they were.
    {
      const rows = () => page.evaluate(() => {
        const box = sel => { const e = document.querySelector(sel); if (!e || e.hidden || !e.getClientRects().length) return null; const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; };
        const q = window.__nsQA.inspect().limbs.rows;
        return { bar: box('.ns-limbs'), hint: box('.ns-shell-toast'), foot: box('.preview-note'), info: box('.ns-infopanel'), guide: box('.ns-quiet > .ns-prompt'), panels: [...document.querySelectorAll('.ns-hud .ns-panel')].map(e => (e.hidden || !e.getClientRects().length ? null : (r => [r.left, r.top, r.right, r.bottom])(e.getBoundingClientRect()))).filter(Boolean), body: q.body, strip: q.strip };
      });
      await page.mouse.move(width - 46, Math.round(height * 0.42));
      await advance(8);
      const eye = await rows();
      assert.ok(eye.bar && eye.hint, `${tag}: the limb buttons and the hint show in the eye view`);
      assert.equal(eye.strip, null, `${tag}: the eye view moves nothing`);
      await page.keyboard.press('e');
      await page.waitForFunction(() => { const p = window.__nsQA.inspect().camera.pose; return p.thirdPerson && !p.moving; });
      await page.waitForFunction(() => window.__nsQA.inspect().limbs.rows.body !== null, null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
      await advance(6);
      const out = await rows();
      assert.ok(out.body, `${tag}: your head and trunk are in the outside picture`);
      assert.ok(out.strip, `${tag}: a strip beside your head and trunk takes the two rows (${JSON.stringify(out.body)})`);
      assert.ok(out.bar && out.hint, `${tag}: both rows show from outside`);
      for (const [name, b] of [['buttons', out.bar], ['hint', out.hint]]) {
        assert.equal(area(b, out.body), 0, `${tag}: the ${name} [${b.map(Math.round)}] keep off your head and trunk [${out.body}]`);
        assert.ok(b[0] >= -0.5 && b[1] >= -0.5 && b[2] <= width + 0.5 && b[3] <= height + 0.5, `${tag}: the ${name} are inside the window [${b.map(Math.round)}]`);
        for (const c of [out.info, out.guide, ...out.panels]) assert.equal(area(b, c), 0, `${tag}: the ${name} [${b.map(Math.round)}] lie on no card [${c && c.map(Math.round)}]`);
      }
      assert.ok(out.hint[1] - out.bar[3] >= 5.5, `${tag}: the buttons stand 6 px clear of the hint (${(out.hint[1] - out.bar[3]).toFixed(1)} px)`);
      if (out.foot && out.hint[0] < out.foot[2] && out.hint[2] > out.foot[0]) assert.ok(out.foot[1] - out.hint[3] >= 3.5, `${tag}: the hint stands above the foot line (${(out.foot[1] - out.hint[3]).toFixed(1)} px)`);
      one.rowsOutside = { body: out.body, strip: out.strip, bar: out.bar.map(Math.round), hint: out.hint.map(Math.round) };
      await page.keyboard.press('e');
      await page.waitForFunction(() => { const p = window.__nsQA.inspect().camera.pose; return p.firstPerson && !p.moving; });
      await advance(8);
      const back = await rows();
      for (const k of ['bar', 'hint']) assert.ok(back[k] && back[k].every((v, i) => Math.abs(v - eye[k][i]) <= 0.5), `${tag}: back in the eye view the ${k === 'bar' ? 'buttons' : 'hint'} are where they were (${back[k] && back[k].map(Math.round)} / ${eye[k].map(Math.round)})`);
    }
    await page.close();
  }
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = String(error);
  throw error;
} finally {
  console.log(JSON.stringify(report, null, 2));
  await browser?.close();
  server.closeAllConnections();
  server.close();
}
