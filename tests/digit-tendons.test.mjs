/** The finger and toe tendons drawn white (ns-scene-three DIGIT_TENDONS, 20 November 2026; the owner: "Finger/toe tendons
 * should be there and white-ish"). On the game's own body: the long finger and toe muscles' meshes reach the fingertips
 * and toe tips, and the rule marks their parts beyond the wrist and ankle (and the short foot muscles' parts in the
 * toes) as tendon, leaving the bellies alone. What the rule does on this one reference body, not a dissection record. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { DIGIT_TENDONS, DIGIT_TENDONS_DRAWN, digitTendonKind, digitTendonWeights } = await import(path.join(repo, 'scene/src/ns-scene-three.mjs'));
const { REFERENCE_JOINTS } = await import(path.join(repo, 'scene/src/ns-body.mjs'));
const { loadBody } = await import(path.join(repo, 'tools/load-body.mjs'));
const { inputs, rig } = await loadBody(repo);
const nameOf = e => e.embedded_source_name || e.name || e.requested_structure || '';
const meshOf = re => { for (const e of inputs.entries) if (re.test(nameOf(e))) { const m = inputs.meshesById.get(e.element_id); if (m && m.positions) return m; } return null; };

test('the names: the long finger and toe muscles, the short toe muscles and the small hand muscles; not the wrist muscles', () => {
  assert.equal(digitTendonKind('Right flexor digitorum profundus'), 'arm');
  assert.equal(digitTendonKind('Left extensor digitorum'), 'arm');
  assert.equal(digitTendonKind('Right extensor digitorum longus'), 'leg', 'not the forearm muscle of almost the same name');
  assert.equal(digitTendonKind('Extensor digitorum brevis.r'), 'foot');
  assert.equal(digitTendonKind('Medial head of flexor hallucis brevis.l'), 'foot');
  assert.equal(digitTendonKind('Set of lumbricals of right hand'), 'hand');
  assert.equal(digitTendonKind('Right extensor carpi radialis longus'), null);
  assert.equal(digitTendonKind('Right biceps brachii'), null);
  assert.equal(digitTendonKind(null), null);
});

test('the rule\'s places agree with the body rig\'s joints', () => {
  // the rule's own numbers are the source atlas's (its wrist at z 800, its toes' joints at y -165) ...
  const J = REFERENCE_JOINTS;
  assert.ok(Math.abs(J.r_wrist.point[2] - 800) < 5 && DIGIT_TENDONS.arm.fullZ > 800 && DIGIT_TENDONS.arm.noneZ > DIGIT_TENDONS.arm.fullZ);
  assert.ok(DIGIT_TENDONS.leg.fullZ > J.r_ankle.point[2] && DIGIT_TENDONS.leg.noneZ > DIGIT_TENDONS.leg.fullZ);
  assert.ok(Math.abs(J.r_mtp.point[1] - (-165)) < 5 && DIGIT_TENDONS.foot.fullY < DIGIT_TENDONS.foot.noneY);
  // ... and since 20 November 2026 (the owner: "Let's make the limbs longer"; ns-body-shape) the body is drawn with longer
  // limbs, so the game uses the same places moved with the limbs (DIGIT_TENDONS_DRAWN): just above the drawn wrist and
  // ankle, across the drawn ball of the foot
  const D = DIGIT_TENDONS_DRAWN, w = rig.pivots.r_wrist.point[2], a = rig.pivots.r_ankle.point[2], m = rig.pivots.r_mtp.point[1];
  assert.ok(D.arm.fullZ > w && D.arm.fullZ < w + 25 && D.arm.noneZ > D.arm.fullZ, `arm ${D.arm.fullZ} over the wrist at ${w}`);
  assert.ok(D.leg.fullZ > a && D.leg.noneZ > D.leg.fullZ, `leg ${D.leg.fullZ} over the ankle at ${a}`);
  assert.ok(D.foot.fullY < m && m < D.foot.noneY, `foot ${D.foot.fullY} .. ${D.foot.noneY} across the toes' joints at ${m}`);
});

for (const [re, kind] of [[/^Right flexor digitorum profundus$/, 'arm'], [/^Right extensor digitorum longus$/, 'leg'], [/^Right flexor digitorum brevis$/, 'foot']]) {
  test(`${re.source.replace(/[\^$]/g, '')}: white in the fingers or toes, muscle-coloured over the belly`, () => {
    const m = meshOf(re);
    assert.ok(m, 'the mesh is in the body');
    const p = m.positions, n = p.length / 3, w = new Float32Array(n);
    assert.ok(digitTendonWeights(kind, p, w) > 0);
    // the point farthest into the fingers or toes is full tendon; the belly's middle is not touched
    let tip = 0, z = [];
    for (let v = 0; v < n; v++) { if (kind === 'foot' ? p[3 * v + 1] < p[3 * tip + 1] : p[3 * v + 2] < p[3 * tip + 2]) tip = v; z.push(p[3 * v + 2]); }
    assert.equal(w[tip], 1);
    z.sort((a, b) => a - b);
    const mid = z[Math.floor(z.length * 0.8)];
    let midW = 0, midN = 0;
    for (let v = 0; v < n; v++) if (Math.abs(p[3 * v + 2] - mid) < 5) { midW += w[v]; midN++; }
    if (kind !== 'foot') assert.ok(midN > 0 && midW / midN < 0.01, `the upper belly stays muscle (${(midW / midN).toFixed(3)})`);
    // an existing higher weight is kept
    const w2 = new Float32Array(n).fill(1);
    assert.equal(digitTendonWeights(kind, p, w2), 0);
  });
}
