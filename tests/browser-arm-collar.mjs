// Runs the normal preview in Chromium. The Node, Playwright and Chromium settings match browser-limb-controls.mjs.
//
// 20 November 2026, evening (the owner: "ensure, especially with the right arm, that muscles do not become transparent
// under certain angles, because in previous versions, if you hold the arm up in certain angles, muscles will disappear
// and turn transparent. That shouldn't be happening."; DESIGN-DECISIONS section 172). The eye view's collar box
// (ns-scene-three EYE_COLLAR) used to cut away whatever of your own body came into the column over the collar: a right
// hand held up over the head, the deltoid by the neck. This test carries the right arm up beside and over the head and
// looks round and down, and reads after every step what the picture drops (inspect().scene.organs.neck.draw, a QA read
// switched on by globalThis.__nsLimbDraw): no vertex of your body may be cut and no muscle of either body culled while
// on screen. It also checks that the arm really went into the box (else it would prove nothing).
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHandler, HOST } from '../serve-local.mjs';

const { chromium } = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const allowedHosts = new Set();
const server = createServer(createHandler({ root, allowedHosts }));
server.listen(0, HOST);
await once(server, 'listening');
const host = `${HOST}:${server.address().port}`;
allowedHosts.add(host);
const viewport = { width: 1600, height: 900 };
const args = ['--disable-background-networking'];
if (process.env.NS_ANGLE) args.push(`--use-angle=${process.env.NS_ANGLE}`);

let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.NS_CHROMIUM || undefined, args });
  const page = await browser.newPage({ viewport, reducedMotion: 'no-preference' });
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(() => { globalThis.__nsLimbDraw = true; });
  const poll = { polling: 80 };
  const read = () => page.evaluate(() => {
    const s = window.__nsQA.inspect();
    const n = s.scene && s.scene.organs && s.scene.organs.neck;
    return { frames: s.frames, limb: s.limbs && s.limbs.limb, yaw: s.controls.yaw, pitch: s.controls.pitch, firstPerson: s.camera.pose && s.camera.pose.firstPerson,
      cuts: n ? n.cuts : null, clipped: n ? n.clipped : null, hiddenOn: n ? n.on : null, draw: n ? n.draw : null };
  });

  await page.goto(`http://${host}/scene/example/preview.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__nsQA?.inspect()?.shell.mode === 'playing', null, poll);
  await page.waitForFunction(() => { const n = window.__nsQA.inspect().scene.organs.neck; return n && n.on === true; }, null, poll);
  const start = await read();
  assert.equal(start.firstPerson, true);
  assert.equal(start.cuts, false, 'the collar box cuts nothing');
  assert.equal(start.clipped, 0, 'no material of your body carries its planes');
  assert.ok(start.draw && start.draw.rightArm && start.draw.trunk, 'the QA read is there');

  await page.keyboard.press('4');
  await page.waitForFunction(() => window.__nsQA.inspect().limbs.limb === 'rightArm', null, poll);
  await page.mouse.click(viewport.width / 2, viewport.height / 2);
  await page.waitForFunction(() => document.pointerLockElement?.id === 'ns-canvas', null, poll);

  // the look carries the right arm: up beside and over the head, round to the right (the camera then looks across the
  // place of your head), down the body, and back up on the other side
  let x = viewport.width / 2, y = viewport.height / 2;
  const path = [[0, -30, 12], [30, 0, 10], [0, 30, 6], [0, -30, 6], [0, 40, 14], [-40, 0, 14], [0, -40, 12]];
  const steps = [];
  for (const [dx, dy, n] of path) {
    for (let i = 0; i < n; i++) {
      x += dx; y += dy;
      await page.mouse.move(x, y, { steps: 2 });
      await page.waitForTimeout(90);
      steps.push(await read());
    }
  }
  await page.waitForTimeout(900);
  steps.push(await read());

  const parts = steps.map(s => s.draw);
  const arm = parts.map(d => d.rightArm);
  const inBox = arm.filter(a => a.inBox > 0).length, inBoxSeen = arm.filter(a => a.inBoxSeen > 0).length;
  const cut = parts.flatMap((d, i) => Object.entries(d).filter(([, v]) => v.cut > 0).map(([p, v]) => `step ${i}: ${p} ${v.cut} (in the picture ${v.cutSeen})`));
  const culled = parts.flatMap((d, i) => Object.values(d).flatMap(v => v.culled).map(c => `step ${i}: ${c}`));
  assert.ok(inBox >= 5 && inBoxSeen >= 1, `the right arm went into the collar box (${inBox} steps) and was seen there (${inBoxSeen} steps): else this proves nothing`);
  assert.deepEqual(cut, [], 'nothing of your body is cut away');
  assert.deepEqual(culled, [], 'no muscle is culled while on screen');
  assert.ok(steps.every(s => s.cuts === false && s.clipped === 0));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ chromium: browser.version(), steps: steps.length, inBox, inBoxSeen, cut: cut.length, culled: culled.length,
    last: { yaw: steps[steps.length - 1].yaw, pitch: steps[steps.length - 1].pitch } }));
} finally {
  if (browser) await browser.close();
  server.close();
  await once(server, 'close');
}
