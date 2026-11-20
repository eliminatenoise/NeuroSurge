/** The organs in the opened chest and the neck's end in the eye view (20 November 2026).
 *
 * The owner, 19 November: "Yes, it's nice to have a view within the body and the rib cage. Perhaps put some organs in
 * there for fun, but make sure the occluding muscles, neck muscles are gone, and the transition between is smooth. So
 * you don't just have, part of a muscle ripped off and detached."
 *
 * Pure numbers: the organ meshes (ns-organs: illustrations placed by proportion, not traced anatomy and not part of the
 * game's signal) against the rib cage of the body as the page prepares it (tools/page-body.mjs), and the rule that
 * leaves the neck's muscles out of the eye view (ns-scene-three EYE_COLLAR.hide) against the same body in its baked
 * start posture. No browser, no pixels (the pictures are in the package notes). Nothing here is measured anatomy.
 * Run: node --test tests/organs.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as NO from '../scene/src/ns-organs.mjs';
import { EYE_COLLAR } from '../scene/src/ns-scene-three.mjs';
import { loadPageBody } from '../tools/page-body.mjs';
import { trunkShapeField } from '../scene/src/ns-body-shape.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const built = NO.buildOrgans();

/** Signed volume of triangles [a, b) of an indexed mesh (positive when the faces face out). */
function volume(m, a = 0, b = m.indices.length / 3) {
  const p = m.positions, I = m.indices;
  let v = 0;
  for (let t = a; t < b; t++) {
    const i = 3 * I[3 * t], j = 3 * I[3 * t + 1], k = 3 * I[3 * t + 2];
    v += (p[i] * (p[j + 1] * p[k + 2] - p[j + 2] * p[k + 1]) - p[i + 1] * (p[j] * p[k + 2] - p[j + 2] * p[k]) + p[i + 2] * (p[j] * p[k + 1] - p[j + 1] * p[k])) / 6;
  }
  return v;
}
const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

test('two meshes of a few thousand triangles, every number finite, every part closed with its faces facing out', () => {
  assert.equal(NO.ORGANS.on, true);
  assert.equal(NO.ORGANS.host, 't6');
  assert.ok(built.triangles > 3000 && built.triangles < 8000, `${built.triangles} triangles`);
  assert.equal(built.triangles, built.heart.triangles + built.tissue.triangles);
  for (const m of [built.heart, built.tissue]) {
    assert.equal(m.positions.length, m.normals.length);
    assert.equal(m.positions.length, m.colors.length);
    assert.ok([...m.positions, ...m.normals, ...m.colors].every(Number.isFinite));
    assert.ok(Math.max(...m.indices) < m.positions.length / 3);
  }
  // (20 November 2026, the owner: "a smaller and much flatter chest": the organs go through the trunk rule with the rib
  // cage, ns-body-shape, and the heart, the most forward of them, is drawn about 0.3 thinner front to back: 0.42 l in
  // the numbers of ORGANS, 0.3 drawn; the lungs 2.4 and 2.1)
  assert.ok(volume(built.heart) > 250e3 && volume(built.heart) < 700e3, 'a heart of 0.25 to 0.7 litres');
  assert.ok(volume(NO.buildOrgans(NO.ORGANS, null).heart) > 300e3, 'in the source body\'s numbers a heart of more than 0.3 litres');
  for (const [name, [a, b]] of Object.entries(built.tissue.ranges)) assert.ok(volume(built.tissue, a, b) > 0, `${name} faces out`);
  const lungs = volume(built.tissue, ...built.tissue.ranges.leftLung) + volume(built.tissue, ...built.tissue.ranges.rightLung);
  assert.ok(lungs > 1.5e6 && lungs < 4e6, `lungs ${Math.round(lungs / 1000)} cm3`);
  assert.ok(volume(built.tissue, ...built.tissue.ranges.rightLung) > volume(built.tissue, ...built.tissue.ranges.leftLung), 'the right lung is the larger (the heart takes room on the left)');
});

test('the heart lies left of the midline with its apex down, forward and to the left; the lungs keep off it', () => {
  const F = NO.heartFrame();
  assert.ok(F.apex[0] > F.base[0] && F.apex[1] < F.base[1] && F.apex[2] < F.base[2]);
  let sx = 0; const p = built.heart.positions;
  for (let i = 0; i < p.length; i += 3) sx += p[i];
  assert.ok(sx / (p.length / 3) > 5, 'most of the heart is on the subject\'s left (+x)');
  // no lung vertex inside the heart: its distance from the heart's axis is beyond the heart's own half sizes there
  const H = NO.ORGANS.heart, T = built.tissue.positions;
  for (const key of ['leftLung', 'rightLung']) {
    const [a, b] = built.tissue.ranges[key], I = built.tissue.indices;
    let inside = 0;
    for (let t = 3 * a; t < 3 * b; t++) {
      const i = 3 * I[t], v = [T[i] - F.base[0], T[i + 1] - F.base[1], T[i + 2] - F.base[2]];
      const s = (v[0] * F.axis[0] + v[1] * F.axis[1] + v[2] * F.axis[2]) / F.length;
      if (s < 0.05 || s > 0.95) continue;
      const side = v[0] * F.side[0] + v[1] * F.side[1] + v[2] * F.side[2], front = v[0] * F.front[0] + v[1] * F.front[1] + v[2] * F.front[2];
      const w = H.widestAt, prof = s <= w ? Math.sqrt(1 - ((w - s) / w) ** H.basePower) : (1 - ((s - w) / (1 - w)) ** H.apexPower) ** H.apexRound;
      if (Math.hypot(side / (H.halfWidthMm * prof), front / (H.halfThickMm * prof)) < 0.98) inside++;
    }
    assert.equal(inside, 0, `${key}: vertices inside the heart`);
  }
});

test('clear organ colours: a dark red heart, pink-grey lungs lighter than it, a red aorta, blue veins and pulmonary arteries', () => {
  const C = NO.ORGANS.colors, L = k => NO.organLinear(C[k]);
  const heart = L('heart'), lung = L('lung'), aorta = L('aorta'), blue = L('pulmonary'), vein = L('vein');
  assert.ok(heart[0] > 3 * heart[1] && heart[0] > 3 * heart[2] && lum(heart) < 0.08, 'dark red');
  assert.ok(lum(lung) > 2.5 * lum(heart) && lung[0] > lung[1] && lung[1] > 0.6 * lung[0] * 0.5, 'pink-grey, lighter than the heart');
  assert.ok(aorta[0] > 3 * aorta[2] && blue[2] > 2 * blue[0] && vein[2] > 2 * vein[0]);
});

test('every organ is inside the rib cage of the page body, under the eye view\'s collar cut', async () => {
  const src = await loadPageBody(root);
  // (20 November 2026, ns-body-shape: the page body's chest is drawn flatter and the organs go through the same trunk rule,
  // which never changes which of two points at one height and side is further forward. The check is made in the source
  // body's numbers: the organs as ORGANS has them, the ribs moved back by the rule undone. Measured on the flattened
  // ribs themselves, sectors round one fixed axis no longer follow the flatter cage's wall: lung points at its front
  // corners read up to 13 mm "beyond" it.)
  const tf = trunkShapeField(), builtSrc = NO.buildOrgans(NO.ORGANS, null);
  // the cage's inner wall per 20 mm of height and 15 degrees round the axis (x 0, y -100): the 5th percentile distance of
  // its bones there (ribs, costal cartilages, breastbone; the spine's sector, 30 to 150 degrees, is left out)
  const pts = [];
  for (const [id, info] of Object.entries(src.rig.meshSegment)) {
    if (info.kind !== 'bone' || !/^([rl]_rib\d+|[rl]_cc\d+|sternum)$/.test(info.segment)) continue;
    const p = src.meshesById.get(id).positions;
    for (let i = 0; i < p.length; i += 3) pts.push([p[i], tf.sourceY(p[i], p[i + 1], p[i + 2]), p[i + 2]]);
  }
  const cell = (x, y, z) => { const a = Math.atan2(y + 100, x) * 180 / Math.PI; return { k: `${Math.floor(z / 20)}|${Math.floor(((a + 360) % 360) / 15)}`, a, r: Math.hypot(x, y + 100) }; };
  const walls = new Map();
  for (const [x, y, z] of pts) { const c = cell(x, y, z); if (!walls.has(c.k)) walls.set(c.k, []); walls.get(c.k).push(c.r); }
  const wall = new Map([...walls].filter(([, r]) => r.length >= 12).map(([k, r]) => [k, r.sort((a, b) => a - b)[Math.floor(0.05 * r.length)]]));
  let checked = 0, out = 0, worst = 0;
  for (const m of [builtSrc.heart, builtSrc.tissue]) {
    const p = m.positions;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2];
      assert.ok(z < EYE_COLLAR.box.zFromMm - 10, 'below the collar cut');
      assert.ok(Math.abs(x) < 115 && y > -205 && y < -10 && z > 1080, `inside the cage's box: ${x}, ${y}, ${z}`);
      const c = cell(x, y, z), aa = (c.a + 360) % 360;
      if (aa > 30 && aa < 150) continue;
      const w = wall.get(c.k);
      if (w === undefined) continue;
      checked++;
      if (c.r > w + 3) { out++; worst = Math.max(worst, c.r - w); }
    }
  }
  assert.ok(checked > 2000, `${checked} vertices checked against a rib`);
  // a rib is a band with gaps above and below it: a vertex may lie a little beyond the 5th percentile of a cell whose
  // rib runs across it at a slant, never far
  assert.ok(out / checked < 0.03 && worst < 12, `${out} of ${checked} vertices beyond the inner wall, at most ${worst.toFixed(1)} mm`);
});

// 20 November 2026, evening (the owner: "ensure, especially with the right arm, that muscles do not become transparent
// under certain angles, because in previous versions, if you hold the arm up in certain angles, muscles will disappear
// and turn transparent"): the box no longer cuts anything (EYE_COLLAR.cut false). It cut whatever came into it, your
// raised right arm and the trunk muscles that go with it included; the few back muscles and the vertebra measured here
// as lying partly in it are drawn whole. This test used to say the box "cuts only the tops of a few back muscles".
test('the eye view leaves out what the collar box would cut to a torn stub, and the box cuts nothing: the tops of a few back muscles in it are drawn whole', async () => {
  assert.equal(EYE_COLLAR.cut, false, 'the collar box cuts nothing (a raised arm in it was cut away)');
  const src = await loadPageBody(root);
  const B = await import('../scene/src/ns-body.mjs');
  const baked = B.bakeBodyPosture(src.rig, src.meshesById, { posture: B.DEFAULT_BODY_POSTURE });
  const S = baked.segments.get('sternum');
  // the breastbone's baked frame inverted (rigid): drawn -> source
  const inv = p => { const x = p[0] - S[12], y = p[1] - S[13], z = p[2] - S[14]; return [S[0] * x + S[1] * y + S[2] * z, S[4] * x + S[5] * y + S[6] * z, S[8] * x + S[9] * y + S[10] * z]; };
  const X = EYE_COLLAR.box, hide = [], cut = [];
  for (const [id, m] of baked.meshesById) {
    const p = m.positions; let inside = 0;
    for (let i = 0; i < p.length; i += 3) { const q = inv([p[i], p[i + 1], p[i + 2]]); if (q[2] > X.zFromMm && q[0] > X.xMm[0] && q[0] < X.xMm[1] && q[1] > X.yMm[0] && q[1] < X.yMm[1]) inside++; }
    const share = inside / (p.length / 3);
    if (share >= EYE_COLLAR.hide.shareFrom) hide.push(id); else if (share > 0) cut.push([id, share]);
  }
  assert.equal(EYE_COLLAR.hide.shareFrom, 0.2);
  // the upper trapezius and the neck's own muscles reaching the collar are gone, not cut (the scene leaves out those it
  // draws: the ones near the eye are face-layer meshes and never drawn in the eye view anyway)
  for (const id of ['FJ1521', 'FJ1521M', 'FJ1539', 'FJ1539M', 'FJ1594', 'FJ1572', 'FJ1532M']) assert.ok(hide.includes(id), `${id} is left out`);
  // the trunk's own back muscles and the first thoracic vertebra stay, only their tops in the box: 5 to 13 % of the
  // vertices of these source meshes (2 to 5 % of the coarser meshes the game draws, measured in the browser:
  // inspect().scene.organs.neck), drawn whole since 20 November 2026 (evening). The muscles more in the box and not hidden
  // are neck muscles near the eye: face-layer meshes, which the eye view never draws.
  const cutShare = new Map(cut);
  for (const id of ['FJ1554', 'FJ1554M', 'FJ1537', 'FJ1537M', 'FJ1542', 'FJ1542M', 'FJ3158']) {
    assert.ok(!hide.includes(id), `${id} stays`);
    assert.ok(cutShare.has(id) && cutShare.get(id) < 0.15, `${id}: ${Math.round((cutShare.get(id) || 0) * 100)} % cut`);
  }
});
