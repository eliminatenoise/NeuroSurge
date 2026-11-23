import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHandler, HOST} from '../serve-local.mjs';

const {chromium} = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const hosts = new Set();
const root = fileURLToPath(new URL('../', import.meta.url));
const server = createServer(createHandler({root, allowedHosts: hosts})).listen(0, HOST);
await once(server, 'listening');
const host = HOST + ':' + server.address().port, origin = 'http://' + host;
hosts.add(host);
let browser;
try {
  browser = await chromium.launch({executablePath: process.env.NS_CHROMIUM,
    args: ['--disable-background-networking', '--use-angle=' + (process.env.NS_ANGLE || 'swiftshader')]});
  for (const width of [320,1280]) {
    const page = await browser.newPage({viewport: {width, height: 820}, hasTouch: width === 320, reducedMotion:'reduce'});
    const errors = [], denied = [], weightReads = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.route('**/*', route => {
      const req = route.request(), url = new URL(req.url());
      if (req.method() !== 'GET' || url.origin !== origin || url.search) {
        denied.push([req.method(), url.pathname, url.search]);
        return route.abort();
      }
      if (url.pathname.endsWith('/grip-preview/weights.json')) weightReads.push(url.pathname);
      return route.continue();
    });
    await page.addInitScript(() => {
      const audit = window.gripAudit = {device:0, voices:0, clipboard:0};
      navigator.mediaDevices.getUserMedia = async () => { audit.device++; throw Error('Device request'); };
      for (const method of ['write','writeText','read','readText'])
        if (navigator.clipboard) Object.defineProperty(navigator.clipboard, method, {value: () => { audit.clipboard++; throw Error('Clipboard request'); }});
      window.SpeechRecognition = class {
        get processLocally() { return this.local; }
        set processLocally(v) { this.local = v; }
        start() {
          if (!this.local) throw Error('Off-device recognition');
          audit.voices++;
          this.onresult?.({results:[[{transcript:'preview grip open the lid then move left'}]]});
          this.onend?.();
        }
        abort() {}
      };
    });
    await page.goto(origin + '/START.html');
    await page.getByRole('link', {name:'Play the experimental preview'}).click();
    await page.waitForFunction(() => window.__nsQA?.inspect()?.features?.bodyRig &&
      document.querySelector('#ns-app').dataset.nsPhase === 'playing', null, {timeout:120000});
    const game = page.locator('#ns-canvas'), dialog = page.locator('#ns-action-chat');
    const cmd = page.getByRole('textbox', {name:'Command box'}), panel = dialog.locator('[data-grip-preview]');
    const input = panel.getByRole('textbox', {name:'Instruction'});
    const rows = () => panel.locator('tbody tr').allTextContents();
    const expected = ['Index-2.02+1.44','Middle-0.36+10.44','Ring+1.48+7.08','Little+1.17+7.43'];
    await game.press('f');
    if (width === 320) {
      await dialog.getByRole('button', {name:'Use voice'}).click();
      assert.equal(await cmd.inputValue(), 'preview grip open the lid then move left');
      assert.equal(await panel.isVisible(), false);
    } else await cmd.fill('preview grip: open the lid then move left');
    await cmd.press('Enter');
    await panel.locator('tbody tr').first().waitFor();
    assert.deepEqual(await rows(), expected);
    assert.equal(await page.evaluate(() => window.__nsQA.inspect().shell.mode), 'paused');
    const selectModel = panel.locator('[data-model-choice]');
    await selectModel.selectOption('context');
    const beforeChangingWords = await rows();
    await input.fill("Don’t open before closing the cover");
    assert.deepEqual(await rows(), beforeChangingWords);
    assert.match(await panel.getByRole('status').innerText(), /neg → open → before → close/);
    await selectModel.selectOption('ordered');
    assert.notDeepEqual(await rows(), beforeChangingWords);
    await panel.locator('[data-history]').selectOption('camera');
    const closing = await rows();
    await panel.locator('[data-history]').selectOption('printer');
    assert.notDeepEqual(await rows(), closing);
    await input.fill('zzzzq');
    assert.match(await panel.getByRole('status').innerText(), /zero word features/);
    await input.fill('');
    assert.equal(await panel.getByRole('table').count(), 0);
    await input.fill('Open the lid then move left.');
    assert.deepEqual(await rows(), expected);
    const layout = await dialog.evaluate(el => ({
      x:el.getBoundingClientRect().left, right:el.getBoundingClientRect().right,
      content:el.scrollWidth, width:el.clientWidth
    }));
    assert.ok(layout.x>=0 && layout.right<=width && layout.content<=layout.width, JSON.stringify(layout));
    if (process.env.NS_SCREENSHOT_DIR) {
      await panel.locator('h2').focus();
      await page.screenshot({path:join(process.env.NS_SCREENSHOT_DIR, 'grip-' + width + '.png')});
    }
    await panel.locator('summary').click();
    assert.match(await panel.locator('details').innerText(), /26 instructions.*15 from three recording groups/s);
    await input.press('Escape');
    assert.equal(await page.evaluate(() => window.__nsQA.inspect().shell.mode), 'playing');
    assert.equal(await panel.locator('input').inputValue(), '');
    assert.equal(await dialog.locator('#ns-chat-input').inputValue(), '');
    await game.press('f');
    await dialog.getByRole('button', {name:'Preview grip', exact:true}).click();
    assert.equal(await input.inputValue(), '');
    await input.fill('Open the cover');
    await panel.getByRole('button', {name:'Back to game'}).click();
    await game.press('f');
    await cmd.fill('forecast my wrists');
    await cmd.press('Enter');
    await dialog.locator('[data-wrist-forecast]').getByText(/No wrist samples/).waitFor();
    await page.keyboard.press('Escape');
    const audit = await page.evaluate(() => window.gripAudit);
    assert.deepEqual(audit, {device:0, clipboard:0, voices:width === 320 ? 1 : 0});
    assert.equal(weightReads.length, 1);
    assert.deepEqual(denied, []);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({width, layout, expected, audit, weightReads, denied, errors}));
    await page.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
