/**
 * A moved item (ns-collide moved()) is the item you would get by making every entry the plain way.
 *
 * The stop-at-contact rule moves a whole body's sphere cover by one matrix several times a frame (the mirror body is
 * your body's cover seen through the mirror matrix). R558 (performance): moved() no longer makes each entry's 16-number
 * matrix at once. It works the product out in plain numbers for the entry's scale, centre and radius, and the entry
 * makes the matrix the first time something reads it. This suite checks that nothing else changed: every number of a
 * moved entry, and its matrix whenever it is read, has the same bits as an entry made with entry(table, mul(d, m)),
 * and a gap searched against a moved item is the same number.
 *
 * Checked on made-up point clouds and matrices from a fixed random sequence. Not covered here: the game's real meshes,
 * how much time this saves (measured in the browser; see DESIGN-DECISIONS.md) and the picture.
 *
 * Run: node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../scene/src/ns-collide.mjs';

/** A fixed random sequence (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A turn about a random axis, a stretch of each axis, a slight shear and a shift: column-major 4x4. */
function randomMatrix(r, shift = 2) {
  let x = r() - 0.5, y = r() - 0.5, z = r() - 0.5;
  const n = Math.hypot(x, y, z) || 1, a = r() * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  x /= n; y /= n; z /= n;
  const R = [t * x * x + c, t * x * y + s * z, t * x * z - s * y, t * x * y - s * z, t * y * y + c, t * y * z + s * x, t * x * z + s * y, t * y * z - s * x, t * z * z + c];
  const k = [0.4 + r() * 1.6, 0.4 + r() * 1.6, 0.4 + r() * 1.6], sh = (r() - 0.5) * 0.2;
  const m = new Float64Array(16);
  for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) m[4 * col + row] = R[3 * col + row] * k[col] + (col === 1 && row === 0 ? sh : 0);
  m[12] = (r() - 0.5) * shift; m[13] = (r() - 0.5) * shift; m[14] = (r() - 0.5) * shift; m[15] = 1;
  return m;
}
function randomTable(r, lazy = false) {
  const n = 30 + Math.floor(r() * 90), p = new Float64Array(3 * n), size = 0.05 + r() * 0.25;
  for (let i = 0; i < p.length; i++) p[i] = (r() - 0.5) * size;
  const full = C.sphereTable(p, { leaf: size / 6, group: size / 2 });
  return lazy ? C.lazySphereTable(full.bound, () => full) : full;
}
function randomItem(r, entries, shift = 2) {
  const out = [];
  for (let i = 0; i < entries; i++) out.push(C.entry(randomTable(r, i % 3 === 2), randomMatrix(r, shift), i % 2 ? r() * 0.05 : 0, i % 4 === 0 ? { part: 'p' + i } : null));
  return C.item(out);
}
/** The same bits (Object.is tells +0 from -0 and holds for NaN). */
function sameBits(a, b, what) {
  assert.equal(a.length, b.length, what + ': length');
  for (let i = 0; i < a.length; i++) assert.ok(Object.is(a[i], b[i]), `${what}[${i}]: ${a[i]} is not ${b[i]}`);
}
/** Every entry of `got` against the entry made the plain way from the matching entry of `src` and the matrix `d`. */
function sameAsPlain(got, src, d, what) {
  assert.equal(got.entries.length, src.entries.length);
  const plain = C.item(src.entries.map(e => C.entry(e.table, C.mul(d, e.m), e.pad, e.tag)));
  sameBits(got.lo, plain.lo, what + ' box low');
  sameBits(got.hi, plain.hi, what + ' box high');
  for (let i = 0; i < plain.entries.length; i++) {
    const g = got.entries[i], p = plain.entries[i];
    assert.equal(g.table, src.entries[i].table, what + ': the table is the source entry\'s');
    assert.equal(g.tag, p.tag);
    assert.ok(Object.is(g.pad, p.pad) && Object.is(g.s, p.s) && Object.is(g.r, p.r), `${what} entry ${i}: pad, scale and radius`);
    sameBits(g.c, p.c, `${what} entry ${i} centre`);
    assert.ok(g.m instanceof Float64Array && g.m.length === 16, 'the matrix is a Float64Array of 16');
    sameBits(g.m, p.m, `${what} entry ${i} matrix`);
    assert.equal(g.m, g.m, 'the matrix is made once');
  }
  return plain;
}

test('a moved item has the numbers of entries made the plain way, bit for bit', () => {
  const r = rng(558);
  for (let round = 0; round < 60; round++) {
    const it = randomItem(r, 1 + Math.floor(r() * 12)), d = randomMatrix(r);
    sameAsPlain(C.moved(it, d), it, d, 'round ' + round);
  }
});

test('moving a moved item again, and a move given as 32-bit numbers or a plain array, give the same', () => {
  const r = rng(11);
  for (let round = 0; round < 30; round++) {
    const it = randomItem(r, 1 + Math.floor(r() * 8)), d1 = randomMatrix(r), d2 = randomMatrix(r);
    // the first move's matrices are never read before the second move reads them
    const once = C.moved(it, d1), twice = C.moved(once, d2);
    const plainOnce = sameAsPlain(C.moved(it, d1), it, d1, 'once');
    sameAsPlain(twice, plainOnce, d2, 'twice');
    const d32 = Float32Array.from(d1);
    sameAsPlain(C.moved(it, d32), it, Float64Array.from(d32), '32-bit move');
    sameAsPlain(C.moved(it, Array.from(d1)), it, d1, 'plain array move');
  }
});

test('a moved item keeps nothing of the caller\'s array, and its source is left as it was', () => {
  const r = rng(77);
  for (let round = 0; round < 30; round++) {
    const it = randomItem(r, 2 + Math.floor(r() * 6)), d = randomMatrix(r), keep = Float64Array.from(d);
    const before = it.entries.map(e => Float64Array.from(e.m));
    const got = C.moved(it, d);
    d.fill(123.5); // the caller reuses its array before anything has read a moved entry's matrix
    sameAsPlain(got, it, keep, 'after the caller wrote');
    it.entries.forEach((e, i) => sameBits(e.m, before[i], 'source matrix ' + i));
  }
});

test('a gap searched against a moved item is the same number, whichever is searched first', () => {
  const r = rng(2026);
  let below = 0, searches = 0;
  for (let round = 0; round < 80; round++) {
    const a = randomItem(r, 2 + Math.floor(r() * 8), 0.6), b = randomItem(r, 2 + Math.floor(r() * 8), 0.6), d = randomMatrix(r, 0.6);
    const plain = C.item(a.entries.map(e => C.entry(e.table, C.mul(d, e.m), e.pad, e.tag)));
    for (const cap of [Infinity, 0.5, 0.04]) {
      const m1 = C.moved(a, d), m2 = C.moved(a, d);
      const want = C.minGap(plain, b, cap), wantBack = C.minGap(b, plain, cap);
      assert.ok(Object.is(C.minGap(m1, b, cap), want), `round ${round} cap ${cap}: moved against other`);
      assert.ok(Object.is(C.minGap(b, m2, cap), wantBack), `round ${round} cap ${cap}: other against moved`);
      assert.ok(Object.is(C.minGap(m1, b, cap), want), 'and again, with the spheres already made');
      assert.equal(C.touches(m2, b), C.touches(plain, b));
      sameAsPlain(m1, a, d, 'after the searches'); // reading the matrices afterwards gives the same bits as before
      searches++;
      if (want < cap) below++;
    }
  }
  assert.ok(below > searches / 4 && below < searches, `the made-up items are near each other often enough to test something (${below} of ${searches})`);
});

test('how far a moved item\'s spheres travelled is the same number', () => {
  const r = rng(9);
  for (let round = 0; round < 40; round++) {
    const it = randomItem(r, 1 + Math.floor(r() * 8)), d1 = randomMatrix(r), d2 = randomMatrix(r);
    const plain = d => C.item(it.entries.map(e => C.entry(e.table, C.mul(d, e.m), e.pad, e.tag)));
    assert.ok(Object.is(C.itemTravel(C.moved(it, d2), C.moved(it, d1)), C.itemTravel(plain(d2), plain(d1))), 'round ' + round);
    assert.ok(Object.is(C.itemTravel(C.moved(it, d1), it), C.itemTravel(plain(d1), it)));
  }
});

test('moved() refuses what it refused before', () => {
  const r = rng(3), it = randomItem(r, 3), good = randomMatrix(r);
  for (const bad of [null, undefined, 'matrix', [1, 2, 3], new Float64Array(15), new Float64Array(17), Array.from(good).fill(NaN, 5, 6), Array.from(good).fill(Infinity, 12, 13)]) {
    assert.throws(() => C.moved(it, bad), /ns:collide: moved needs a finite 4x4 matrix/);
  }
  const huge = Float64Array.from(good).map(v => v * 1e200), far = C.moved(it, huge); // finite itself, and its entries still are
  assert.throws(() => C.moved(far, huge), /ns:collide: moved: nonfinite matrix/);
  assert.equal(C.moved(C.item([]), good).entries.length, 0);
});
