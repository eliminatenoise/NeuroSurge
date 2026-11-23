// The local server's validators (20 November 2026): a file the browser already has costs a 304, not a second download
// (the page and the loading picture's worker both import three.module.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler, etagFor, notModified } from '../serve-local.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('local video blobs are allowed only on the playable page', async () => {
  const server = http.createServer(createHandler({root}));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const game = await fetch(origin + '/scene/example/preview.html', {method: 'HEAD'});
    const menu = await fetch(origin + '/', {method: 'HEAD'});
    assert.equal(game.status, 200);
    assert.equal(menu.status, 200);
    assert.match(game.headers.get('content-security-policy'), /media-src 'self' blob:/);
    assert.doesNotMatch(menu.headers.get('content-security-policy'), /media-src/);
    assert.match(game.headers.get('content-security-policy'), /connect-src 'self'/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('ETag and Last-Modified are sent, and an unchanged file is answered with 304', async () => {
  const server = http.createServer(createHandler({ root }));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const first = await fetch(`${base}/serve-local.mjs`);
    assert.equal(first.status, 200);
    const tag = first.headers.get('etag'), modified = first.headers.get('last-modified');
    assert.match(tag, /^W\/"[0-9a-f]+-[0-9a-f]+"$/);
    assert.ok(Number.isFinite(Date.parse(modified)));
    assert.equal(first.headers.get('cache-control'), 'no-cache', 'every use still asks again');
    const size = (await first.arrayBuffer()).byteLength;
    assert.ok(size > 1000);
    const again = await fetch(`${base}/serve-local.mjs`, { headers: { 'If-None-Match': tag } });
    assert.equal(again.status, 304);
    assert.equal((await again.arrayBuffer()).byteLength, 0);
    assert.equal(again.headers.get('etag'), tag);
    assert.ok(again.headers.get('content-security-policy'), 'the security headers come with a 304 too');
    const other = await fetch(`${base}/serve-local.mjs`, { headers: { 'If-None-Match': 'W/"0-0"' } });
    assert.equal(other.status, 200);
    assert.equal((await other.arrayBuffer()).byteLength, size);
    const since = await fetch(`${base}/serve-local.mjs`, { headers: { 'If-Modified-Since': modified } });
    assert.equal(since.status, 304);
    const old = await fetch(`${base}/serve-local.mjs`, { headers: { 'If-Modified-Since': new Date(Date.parse(modified) - 3600e3).toUTCString() } });
    assert.equal(old.status, 200);
    await old.arrayBuffer();
    const missing = await fetch(`${base}/no-such-file.js`, { headers: { 'If-None-Match': '*' } });
    assert.equal(missing.status, 404, 'a missing file is still a 404');
    await missing.arrayBuffer();
  } finally { await new Promise(r => server.close(r)); }
});

test('the tag follows the file (size and time) and If-None-Match wins over If-Modified-Since', () => {
  const st = { size: 1234, mtimeMs: 1700000000123.4 };
  assert.equal(etagFor(st), 'W/"4d2-18bcfe5687b"');
  assert.notEqual(etagFor(st), etagFor({ ...st, size: 1235 }));
  assert.notEqual(etagFor(st), etagFor({ ...st, mtimeMs: st.mtimeMs + 1000 }));
  assert.equal(notModified({ 'if-none-match': etagFor(st) }, st), true);
  assert.equal(notModified({ 'if-none-match': `"x", ${etagFor(st).slice(2)}` }, st), true, 'a list, and a strong form of the weak tag');
  assert.equal(notModified({ 'if-none-match': '"x"', 'if-modified-since': new Date(1800000000000).toUTCString() }, st), false);
  assert.equal(notModified({ 'if-modified-since': new Date(1700000000000).toUTCString() }, st), true);
  assert.equal(notModified({ 'if-modified-since': 'not a date' }, st), false);
  assert.equal(notModified({}, st), false);
});
