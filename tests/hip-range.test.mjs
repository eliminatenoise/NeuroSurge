/** The touch-free hip range (ns-body hipRotationClearRange), 19 November 2026: the quick way (the body posed twice, the
 * legs' points turned about the hip turn's own line for every other angle) gives the range that posing the whole body
 * for each angle gives, on the game's own body, and is several times quicker. Also the exact nearest-distance search on
 * a grid against a search over every pair. What the rig computes on this one reference body, never how a real hip moves. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { loadBody } = await import(path.join(repo, 'tools/load-body.mjs'));
const { body, rig, baked } = await loadBody(repo);
const rest = body.bodyPostureAngles(baked);

/** A fixed stream of numbers in 0 .. 1 (no Math.random: the cases are the same on every run). */
function stream(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

test('the quick hip range is the exact one, posture after posture', () => {
  const rnd = stream(20261119), L = body.BODY_JOINT_LIMITS;
  const ids = ['hip_flex_L', 'hip_flex_R', 'hip_abd_L', 'hip_abd_R', 'knee_ext_L', 'knee_ext_R', 'ankle_dorsi_L', 'ankle_dorsi_R'];
  const cases = [{}, rest];
  for (let n = 0; n < 22; n++) {
    const t = { ...rest };
    // (half the cases stay near the start posture, where the feet are close; half go anywhere in the joints' ranges)
    for (const id of ids) { const [lo, hi] = L[id]; t[id] = n % 2 ? lo + (hi - lo) * rnd() : Math.max(lo, Math.min(hi, (Number.isFinite(rest[id]) ? rest[id] : 0) + (rnd() - 0.5) * 30)); }
    cases.push(body.clampBodyJointTargets(t).applied);
  }
  let limited = 0;
  for (const t of cases) {
    const quick = body.hipRotationClearRange(rig, t), exact = body.hipRotationClearRange(rig, t, { exact: true });
    // (the two differ only by rounding in the last place of a point: a tenth of a degree at most, where a step falls on it)
    assert.ok(Math.abs(quick.internalDeg - exact.internalDeg) <= 0.1 + 1e-9 && Math.abs(quick.externalDeg - exact.externalDeg) <= 0.1 + 1e-9,
      `quick ${quick.internalDeg} / ${quick.externalDeg}, exact ${exact.internalDeg} / ${exact.externalDeg}`);
    assert.deepEqual(quick.limitedBy, exact.limitedBy);
    assert.ok((quick.gapMm === null) === (exact.gapMm === null) && (quick.gapMm === null || Math.abs(quick.gapMm - exact.gapMm) < 0.11));
    if (quick.limitedBy.internal === 'feet' || quick.limitedBy.external === 'feet') limited++;
  }
  assert.ok(limited >= 3, `some of the cases are limited by the feet (${limited}), so the search itself is compared`);
});

test('the quick hip range is several times quicker than posing the whole body for each angle', () => {
  // (the fastest of several interleaved runs of each: the test suite runs files side by side, and a single timing of
  // each was once slowed by the others enough to fail; the fastest run is what the code itself costs)
  const once = opts => { const t0 = process.hrtime.bigint(); body.hipRotationClearRange(rig, rest, opts); return Number(process.hrtime.bigint() - t0) / 1e6; };
  once({}); once({ exact: true }); // (warm)
  let quick = Infinity, exact = Infinity;
  for (let i = 0; i < 9; i++) { quick = Math.min(quick, once({})); exact = Math.min(exact, once({ exact: true })); }
  assert.ok(quick * 2 < exact, `quick ${quick.toFixed(2)} ms, exact ${exact.toFixed(2)} ms (fastest of 9 each)`);
});

test('the nearest distance between two point sets on a grid is the one a search over every pair finds', () => {
  const rnd = stream(7), every = (a, b) => { let best = Infinity; for (let i = 0; i < a.length; i += 3) for (let j = 0; j < b.length; j += 3) best = Math.min(best, Math.hypot(a[i] - b[j], a[i + 1] - b[j + 1], a[i + 2] - b[j + 2])); return best; };
  for (let n = 0; n < 40; n++) {
    const off = n * 3, a = new Float64Array(180), b = new Float64Array(240);
    for (let i = 0; i < a.length; i++) a[i] = rnd() * 100;
    for (let i = 0; i < b.length; i++) b[i] = rnd() * 100 + (i % 3 === 0 ? 60 + off : 0); // (b beside a, further away case by case)
    const want = every(a, b), got = body.pointSetsNear(a, b, 20);
    if (want < 20) assert.ok(Math.abs(got - want) < 1e-12, `${got} for ${want}`); else assert.equal(got, Infinity);
  }
});
