// The load guard (19 November 2026): the page's first script, with no imports, says so with "Try again" when a script
// of the game cannot be had, when a script throws before the launcher runs, when nothing has advanced for 20 s, or
// when the launcher reports a failure; a stall's panel goes away when loading moves again.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installLoadGuard, LOAD_STALL_MS, LOAD_QUIET_MS } from '../scene/src/ns-load-guard.mjs';

function fakePage() {
  let t = 0, tick = null; const listeners = {}; const nodes = [];
  const el = tag => ({ tagName: tag.toUpperCase(), className: '', dataset: {}, children: [], textContent: '', attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; }, append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); c.parent = this; if (this === body) nodes.push(c); return c; },
    addEventListener(type, f) { (this.on = this.on || {})[type] = f; }, focus() {}, remove() { const i = nodes.indexOf(this); if (i >= 0) nodes.splice(i, 1); },
    classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, contains(c) { return this.set.has(c); } } });
  const body = el('body'), barRoot = el('div');
  const word = el('span'); word.textContent = 'Loading';
  const doc = { body, documentElement: body, createElement: el, querySelectorAll: sel => (sel === '.ns-load' ? [barRoot] : sel === '.ns-load .ns-load-word' ? [word] : []) };
  const win = { performance: { now: () => t }, setInterval: f => { tick = f; return 1; }, clearInterval: () => { tick = null; }, reloaded: 0,
    addEventListener: (type, f) => { listeners[type] = f; }, removeEventListener: type => { delete listeners[type]; }, location: { reload() { win.reloaded++; } } };
  return { win, doc, barRoot, word, panels: () => nodes.filter(n => n.className === 'ns-load-fail'), at: ms => { t = ms; }, tick: () => tick && tick(), fire: (type, ev) => listeners[type] && listeners[type](ev), watching: () => tick !== null };
}
const words = p => p.children.map(c => c.textContent);

test('the guard imports nothing, and the page loads it first', () => {
  const src = fs.readFileSync(new URL('../scene/src/ns-load-guard.mjs', import.meta.url), 'utf8');
  assert.equal(/^\s*import\s/m.test(src) || /\bimport\s*\(/.test(src), false, 'a guard that needs another file cannot report that file missing');
  const html = fs.readFileSync(new URL('../scene/example/preview.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)].map(m => [m[1], m[0]]);
  assert.equal(scripts[0][0], '../src/ns-load-guard.mjs');
  assert.ok(/\basync\b/.test(scripts[0][1]), 'it runs as soon as it is in, not behind the other scripts');
  const launcher = scripts.find(s => s[0].endsWith('eye-view-r558.mjs'));
  assert.ok(launcher && /\bdata-ns-needed\b/.test(launcher[1]), 'the launcher is marked as a script the game cannot do without');
});

test('nothing for 20 s: the panel with Try again; it goes when loading moves again', () => {
  const p = fakePage();
  const g = installLoadGuard({ win: p.win, doc: p.doc });
  assert.equal(installLoadGuard({ win: p.win, doc: p.doc }), g, 'installed once');
  for (let s = 1000; s <= LOAD_STALL_MS; s += 1000) { p.at(s); p.tick(); assert.equal(p.word.textContent, s > LOAD_QUIET_MS ? 'Waiting' : 'Loading', `the bar's word after ${s} ms without news`); }
  assert.equal(p.panels().length, 0);
  p.at(LOAD_STALL_MS + 1000); p.tick();
  assert.equal(p.panels().length, 1);
  assert.deepEqual(words(p.panels()[0]).slice(0, 3), ['Loading has stopped.', 'Check your connection, then try again.', 'Try again']);
  assert.ok(p.barRoot.classList.contains('ns-load-stopped'));
  p.panels()[0].children[2].on.click();
  assert.equal(p.win.reloaded, 1, 'Try again loads the page again');
  // news (a byte, a file, a step): the panel goes at once, without waiting for the next check
  p.at(LOAD_STALL_MS + 1500); g.advance();
  assert.equal(p.panels().length, 0);
  assert.equal(p.barRoot.classList.contains('ns-load-stopped'), false);
  assert.equal(g.state().stalls, 1);
});

test('the bar\'s own record of the last news counts, and the bar is frozen and thawed', () => {
  const p = fakePage(); const calls = []; let news = 0;
  const g = installLoadGuard({ win: p.win, doc: p.doc });
  g.attach({ bar: { freeze: k => calls.push('freeze ' + k), thaw: () => calls.push('thaw') }, lastAdvance: () => news });
  for (let s = 1000; s <= 30000; s += 1000) { p.at(s); news = s - 500; p.tick(); } // the bar reports news all along
  assert.equal(p.panels().length, 0);
  for (let s = 31000; s <= 51000; s += 1000) { p.at(s); p.tick(); }               // then nothing
  assert.equal(p.panels().length, 1);
  news = 51200; p.at(52000); p.tick();
  assert.equal(p.panels().length, 0);
  assert.deepEqual(calls, ['freeze stalled', 'thaw']);
});

test('a needed script that cannot be loaded: the panel at once; another script\'s failure is not taken for it', () => {
  const p = fakePage();
  const g = installLoadGuard({ win: p.win, doc: p.doc });
  p.fire('error', { target: { tagName: 'SCRIPT', dataset: {}, src: 'http://x/scene/example/early-load.mjs' } });
  assert.equal(p.panels().length, 0);
  p.fire('error', { target: { tagName: 'SCRIPT', dataset: { nsNeeded: '' }, src: 'http://x/scene/example/eye-view-r558.mjs?v=1' } });
  assert.equal(p.panels().length, 1);
  const w = words(p.panels()[0]);
  assert.equal(w[0], 'Loading did not finish.');
  assert.ok(w[3].includes('eye-view-r558.mjs'));
  assert.equal(p.watching(), false, 'a failed load is no longer watched');
  assert.ok(g.state().failed);
});

test('a script that throws before the launcher has taken over is a failed load; afterwards the launcher reports', () => {
  const a = fakePage(); installLoadGuard({ win: a.win, doc: a.doc });
  a.fire('error', { target: a.win, error: new Error('this address is not supported'), message: 'Uncaught Error' });
  assert.equal(a.panels().length, 1);
  assert.ok(words(a.panels()[0])[3].includes('this address is not supported'));
  const b = fakePage(); const g = installLoadGuard({ win: b.win, doc: b.doc });
  g.takenOver();
  b.fire('error', { target: b.win, error: new Error('a stray error in the running game'), message: 'x' });
  assert.equal(b.panels().length, 0);
  g.fail('HTTP 404 for a file');
  assert.equal(b.panels().length, 1);
  assert.ok(words(b.panels()[0])[3].includes('HTTP 404'));
});

test('when the game is ready the guard is gone: no panel, no watching, nothing later', () => {
  const p = fakePage();
  const g = installLoadGuard({ win: p.win, doc: p.doc });
  for (let s = 1000; s <= LOAD_STALL_MS + 2000; s += 1000) { p.at(s); p.tick(); }
  assert.equal(p.panels().length, 1);
  g.finish();
  assert.equal(p.panels().length, 0);
  assert.equal(p.watching(), false);
  p.fire('error', { target: { tagName: 'SCRIPT', dataset: { nsNeeded: '' }, src: 'x.mjs' } });
  g.fail('late');
  assert.equal(p.panels().length, 0);
});
