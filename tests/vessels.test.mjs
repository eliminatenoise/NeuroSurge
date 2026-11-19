// 18 November 2026 (package VESSELS): the brain's vessels (ns-vessels), the cerebral-artery packet, and the brain
// against the muscles in colour.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  CEREBRAL_ARTERIES_DEFAULTS, CEREBRAL_ARTERIES_PACKET, validateArteryManifest, loadCerebralArteries, brainEnvelope, envelopeRadius,
  buildCerebralVeins, VEIN_COURSES, pointField, stripGive, STRIP_GIVE, vesselVertexGlsl, vesselFragmentGlsl
} from '../scene/src/ns-vessels.mjs';
import { parseObjFast } from '../scene/src/ns-assets.mjs';
import { BRAIN_FLESH, srgbToLinear } from '../scene/src/ns-brain-ink.mjs';
import { MUSCLE_TONES } from '../scene/src/ns-colors.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKT = path.join(ROOT, 'packets', CEREBRAL_ARTERIES_PACKET);
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

test('the cerebral-artery packet: pinned manifest, every file byte-exact, both territories and sides', () => {
  const mbytes = fs.readFileSync(path.join(PKT, 'CEREBRAL-ARTERIES-MESH-MANIFEST.json'));
  assert.equal(sha(mbytes), CEREBRAL_ARTERIES_DEFAULTS.manifestSha256);
  const m = JSON.parse(mbytes.toString('utf8'));
  const entries = validateArteryManifest(m);
  assert.equal(entries.length, 80);
  const sums = new Map(fs.readFileSync(path.join(PKT, 'SHA256SUMS.txt'), 'utf8').trim().split('\n').map(l => l.split(/\s+/)).map(([h, p]) => [p, h]));
  for (const e of entries) {
    const bytes = fs.readFileSync(path.join(PKT, e.path));
    assert.equal(sha(bytes), e.sha256, e.id);
    assert.equal(sums.get(e.path), e.sha256, e.id);
    assert.equal(bytes.length, e.bytes, e.id);
    assert.match(bytes.toString('utf8'), /BodyParts3D/, e.id); // the legacy header is kept
  }
  for (const t of ['mca', 'aca', 'pca', 'base']) assert.ok(entries.some(e => e.territory === t), t);
  assert.ok(entries.filter(e => e.side === 'left').length === entries.filter(e => e.side === 'right').length);
  assert.ok(entries.some(e => /central sulcus/.test(e.name)) && entries.some(e => /pericallosal/.test(e.name)) && entries.some(e => /lateral occipital/.test(e.name)));
});

test('the artery loader refuses a manifest or a file that is not the pinned one', async () => {
  const files = new Map([['M', JSON.stringify({ packet: CEREBRAL_ARTERIES_PACKET, assets: [{ element_id: 'FJ1666', path: 'meshes/FJ1666.obj', sha256: 'a'.repeat(64), bytes: 10, vertices: 3, territory: 'mca', bounds_min: [0, 0, 0], bounds_max: [1, 1, 1] }] })], ['B/meshes/FJ1666.obj', 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n']]);
  const fetchText = async u => files.get(u);
  await assert.rejects(loadCerebralArteries({ fetchText, sha256Hex: sha, parse: parseObjFast, manifestUrl: 'M', packetBase: 'B' }), /pinned/);
  const pin = sha(files.get('M'));
  await assert.rejects(loadCerebralArteries({ fetchText, sha256Hex: sha, parse: parseObjFast, manifestUrl: 'M', packetBase: 'B', expectedManifestSha256: pin }), /sha256 does not match/);
});

test('the real packet loads through the loader (checked before parsing) and lies on the game brain', async () => {
  const fetchText = async u => fs.readFileSync(path.join(ROOT, 'scene', 'example', u), 'utf8');
  const r = await loadCerebralArteries({ fetchText, sha256Hex: sha, parse: parseObjFast });
  assert.equal(r.meshes.length, 80);
  // every artery's centre is inside the brain's box widened by 15 mm (registration: same source frame)
  for (const a of r.meshes) {
    const p = a.positions; let x = 0, y = 0, z = 0; const n = p.length / 3;
    for (let i = 0; i < p.length; i += 3) { x += p[i]; y += p[i + 1]; z += p[i + 2]; }
    x /= n; y /= n; z /= n;
    assert.ok(x > -85 && x < 85 && y > -185 && y < 25 && z > 1450 && z < 1645, a.id);
  }
});

// a sphere of radius 70 about the envelope's centre, as a brain stand-in
function sphere(c, r, n = 60) {
  const out = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j < 2 * n; j++) {
    const th = Math.PI * i / n, ph = Math.PI * j / n;
    out.push(c[0] + r * Math.sin(th) * Math.cos(ph), c[1] + r * Math.sin(th) * Math.sin(ph), c[2] + r * Math.cos(th));
  }
  return Float32Array.from(out);
}

test('veins and sinuses lie on the envelope, never inside it, with every named vessel laid on both sides', () => {
  const C = [0, -80, 1548];
  const E = brainEnvelope([sphere(C, 70)]);
  assert.ok(Math.abs(envelopeRadius(E, 0, 0, 1) - 70) < 1.5 && Math.abs(envelopeRadius(E, 1, 0, 0) - 70) < 1.5);
  const V = buildCerebralVeins(E);
  for (const part of [V.veins, V.sinus]) {
    assert.ok(part.indices.length > 0);
    for (let i = 0; i < part.positions.length; i += 3) {
      const d = Math.hypot(part.positions[i] - C[0], part.positions[i + 1] - C[1], part.positions[i + 2] - C[2]);
      assert.ok(Number.isFinite(d) && d > 69.4 && d < 76, `vertex ${i / 3} at ${d}`);
    }
    for (const k of part.indices) assert.ok(k < part.positions.length / 3);
  }
  for (const name of ['superior sagittal sinus', 'left transverse sinus', 'right superior anastomotic vein (Trolard)', 'left inferior anastomotic vein (Labbe)',
    'left superficial middle cerebral vein', 'right central (Rolandic) vein', 'left inferior cerebral vein']) assert.ok(V.names.includes(name), name);
  assert.equal(V.names.length, VEIN_COURSES.reduce((n, c) => n + (c.side === 'both' ? 2 : 1), 0));
});

test('over the motor strip a vein narrows and sinks, an artery vertex gets its give', () => {
  const C = [0, -80, 1548];
  const E = brainEnvelope([sphere(C, 70)]);
  // a strip patch on the top of the sphere where the central vein crosses
  const strip = [];
  for (let x = -80; x <= 80; x += 1.5) for (let y = -70; y <= -40; y += 1.5) { const z2 = 70 * 70 - x * x - (y + 80) ** 2; if (z2 > 0) strip.push(x, y, C[2] + Math.sqrt(z2)); }
  const near = pointField([Float32Array.from(strip)]);
  const give = (x, y, z) => { const d = near(x, y, z); return d >= STRIP_GIVE.nearMm ? 0 : d <= STRIP_GIVE.fullMm ? 1 : 1 - (d - STRIP_GIVE.fullMm) / (STRIP_GIVE.nearMm - STRIP_GIVE.fullMm); };
  const free = buildCerebralVeins(E), given = buildCerebralVeins(E, { give });
  const maxR = P => { let m = 0; for (let i = 0; i < P.length; i += 3) { const x = P[i], y = P[i + 1], z = P[i + 2]; if (y > -68 && y < -42 && z > C[2] + 40) m = Math.max(m, Math.hypot(x - C[0], y - C[1], z - C[2])); } return m; };
  assert.ok(maxR(given.veins.positions) < 70, 'sunk under the strip');
  assert.ok(maxR(free.veins.positions) > 70.4, 'on the surface elsewhere');
  const g = stripGive(Float32Array.from([0, -55, C[2] + Math.sqrt(70 * 70 - 25 * 25), 0, 0, C[2] + 70]), near); // on the strip / 80 mm from it
  assert.ok(g[0] > 0.99 && g[1] === 0);
});

test('shader pieces: the arteries pulse with the beat, the tuck is only there when asked for', () => {
  assert.match(vesselVertexGlsl({ pulseMm: 0.22, tuckMm: 1.6 }), /objectNormal \* \( 0\.22 \* nsLive\.y \)[\s\S]*nsGive/);
  assert.doesNotMatch(vesselVertexGlsl({ pulseMm: 0.03 }), /nsGive/);
  assert.match(vesselFragmentGlsl({ pulseGlow: 0.22 }), /nsLive\.y/);
});

test('no procedural vessel lines remain in the cortex, and the cortex is lighter and cooler than every muscle tone', () => {
  assert.equal(BRAIN_FLESH.vessel, null);
  const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const crown = lum(BRAIN_FLESH.crown.map(srgbToLinear));
  for (const t of MUSCLE_TONES) {
    assert.ok(crown > 1.4 * lum(t.linear), `${t.name}: cortex ${crown.toFixed(3)} vs ${lum(t.linear).toFixed(3)}`);
    assert.ok(t.oklch[2] >= 20 && t.oklch[2] <= 45, `${t.name} hue`); // warm red-brown, not purple, not tan
  }
  // 19 November 2026 (the owner: "the brain should be a little more pinkish, fleshy"): a soft flesh pink, still far
  // paler than the muscles
  const [r, g, b] = BRAIN_FLESH.crown;
  assert.ok(r > g && r > b && Math.max(r, g, b) - Math.min(r, g, b) > 0.1 && Math.max(r, g, b) - Math.min(r, g, b) < 0.3);
});

// ---- the bodies' vessels (centre lines riveted to the drawn muscles and bones)
import { BODY_VESSELS_DEFAULTS, BODY_VESSEL_SKIP, BODY_VESSEL_LOOK, validateBodyVessels, loadBodyVessels, bindBodyVessels, evalBodyVessels, bodyTubeIndex, writeBodyTubes } from '../scene/src/ns-vessels.mjs';

test('the body-vessel centre lines: pinned file, both legs and the right arm, named superficial veins', async () => {
  const fetchText = async u => fs.readFileSync(path.join(ROOT, 'scene', 'example', u), 'utf8');
  const v = await loadBodyVessels({ fetchText, sha256Hex: sha });
  assert.equal(sha(fs.readFileSync(path.join(ROOT, 'packets/bodyparts3d-body-vessels-r1/BODY-VESSEL-CENTRELINES.json'))), BODY_VESSELS_DEFAULTS.sha256);
  for (const n of ['left great saphenous vein', 'right great saphenous vein', 'right femoral artery', 'left popliteal artery', 'right cephalic vein', 'right radial artery'])
    assert.ok(v.some(x => x.name === n), n);
  assert.ok(v.filter(x => x.superficial).every(x => x.kind === 'vein'));
  assert.ok(BODY_VESSEL_SKIP.test('left cephalic vein') && BODY_VESSEL_SKIP.test('dorsal venous network of left hand') && !BODY_VESSEL_SKIP.test('left great saphenous vein'));
  await assert.rejects(loadBodyVessels({ fetchText, sha256Hex: sha, expectedSha256: 'b'.repeat(64) }), /pinned/);
});

test('a riveted vessel follows the surface it is bound to: moved, turned, and a superficial vein stays on top', () => {
  // a flat strip of "muscle" (z = 0 plane, normals +z after winding) and a superficial vein lying 1 mm into it
  const P = [], I = [];
  for (let i = 0; i <= 40; i++) for (let j = 0; j <= 4; j++) P.push(20 + i * 3, -10 + j * 5, 0);
  for (let i = 0; i < 40; i++) for (let j = 0; j < 4; j++) { const a = i * 5 + j; I.push(a, a + 5, a + 1, a + 1, a + 5, a + 6); }
  const mesh = { id: 'm', positions: Float32Array.from(P), indices: Uint32Array.from(I) };
  const vessels = validateBodyVessels({ packet: 'bodyparts3d-body-vessels-r1', vessels: [{ element_id: 'FJ2103', name: 'left great saphenous vein', kind: 'vein', side: 'left', superficial: true,
    branches: [Array.from({ length: 30 }, (_, i) => [30 + i * 3, 0, -1, 1.5])] }] });
  const B = bindBodyVessels(vessels, [mesh]);
  assert.equal(B.unbound, 0);
  const N = new Float32Array(P.length); for (let i = 2; i < N.length; i += 3) N[i] = 1;
  const out = new Float32Array(B.points * 3);
  const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  evalBodyVessels(B, [{ p: mesh.positions, n: N, m: I4 }], out);
  for (let i = 0; i < B.points; i++) assert.ok(out[3 * i + 2] >= 1.5 + 0.29, `on top: ${out[3 * i + 2]}`); // radius + gap above the surface
  // the whole surface turned 90 degrees about z and moved: the vessel goes with it
  const M = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 100, 50, 7, 1];
  const out2 = new Float32Array(out.length);
  evalBodyVessels(B, [{ p: mesh.positions, n: N, m: M }], out2);
  for (let i = 0; i < B.points; i++) {
    const x = out[3 * i], y = out[3 * i + 1], z = out[3 * i + 2];
    assert.ok(Math.abs(out2[3 * i] - (100 - y)) < 1e-3 && Math.abs(out2[3 * i + 1] - (50 + x)) < 1e-3 && Math.abs(out2[3 * i + 2] - (z + 7)) < 1e-3);
  }
  const S = BODY_VESSEL_LOOK.sides, idx = bodyTubeIndex(B), pos = new Float32Array(B.points * S * 3), nor = new Float32Array(pos.length);
  writeBodyTubes(B, out, pos, nor);
  assert.equal(idx.length, (B.points - 1) * S * 6);
  for (const v of pos) assert.ok(Number.isFinite(v));
});
