/** Two eyeballs and their optic nerves at the front of the brain (19 November 2026).
 *
 * The owner: "it would be much better from a control standpoint, ease of use standpoint, and learning standpoint if we
 * were to invert the brain altogether so that the motor strip changed direction. But to make clear the direction of
 * the body, let's also include eyeballs with nerves connected to the brain." and "we're inverting the brain altogether
 * so that the eyeballs will be at the bottom."
 *
 * WHAT THIS IS. An illustration that shows which way the brain faces. It is built here in code, in the brain's own
 * atlas frame (BodyParts3D 4.0 whole-body millimetres: +x subject left, +y posterior, +z superior), and drawn in the
 * brain's group, so it is moved, turned and carried with the brain. It is NOT a traced anatomy, NOT part of the game's
 * signal (no motor area, no activity, no link), and nothing about it is measured.
 *
 * WHAT IS TAKEN FROM THE ATLAS, AND WHAT IS NOT.
 *  - From the atlas: how far each eye is from the midline and how high it is. These are the centres of the atlas's own
 *    two scleras (packets/bodyparts3d-head-r1, FJ1317 and FJ1368, in the same frame as the brain meshes): 29.8 mm either
 *    side of the brain's midline, 1518.1 mm high, 151.1 mm in front of the frame's origin plane; and their size (the
 *    scleras are 24.6 to 26.3 mm across; drawn 24.4 mm).
 *  - NOT from the atlas: each eyeball is moved straight FORWARD by `forwardMm` (30 mm). In the atlas the eyes lie under
 *    the frontal lobes (the front of the brain is at y -169.7 mm, the eyes' own fronts at -163.5), so from above, which
 *    is how the game shows the brain, they would be hidden. Moved forward they hang in front of the frontal poles with
 *    about 9 mm of each nerve in sight between the eyeball and the brain's edge.
 *  - NOT from the atlas: the nerves, the chiasm and the short tracts. The packets hold no mesh of them. They are smooth
 *    tubes through hand-placed points: from the back of each eyeball under the frontal lobes (kept 7 mm or more below
 *    the atlas brain's own underside, measured from its meshes) to a chiasm on the midline just under the brain
 *    (109 mm in front of the origin plane, where the atlas brain's underside is at 1536 mm), then a short way back and
 *    outward into the brain as the tracts. Because the eyeballs are moved forward the nerves are about 30 mm longer
 *    than a real optic nerve.
 *  - NOT anatomical: the eyes look forward AND `gazeUpDeg` (40 degrees) upward, toward whoever looks at the brain from
 *    above. Looking straight forward, each iris would be a thin edge at the lower rim of its eyeball in the view from
 *    above and the eyeballs would not read as eyes.
 *
 * Cost: about 2 600 triangles in two meshes, built once; no per-frame work of their own.
 * Pure: no Three.js, no DOM. The scene (ns-scene-three) makes the meshes and the materials.
 */

const freeze = Object.freeze;
const DEG = Math.PI / 180;

export const BRAIN_EYES = freeze({
  on: true,
  /** The brain's midline in the atlas frame (between the two precentral gyri: -1.6 and +0.6 mm). */
  midlineXmm: -0.5,
  /** The atlas's own eye centre (mean of the two scleras' bounds, mirrored about the midline): lateral, y, z (mm). */
  atlasLateralMm: 29.8, atlasYmm: -151.1, atlasZmm: 1518.1,
  /** Moved straight forward (toward -y) so they can be seen from above: an illustration choice, not anatomy. */
  forwardMm: 30,
  radiusMm: 12.2,
  /** The look: forward, raised this much toward the top of the brain (toward the viewer of the top view). */
  gazeUpDeg: 40,
  irisRadiusMm: 6.2, pupilRadiusMm: 2.7, limbusMm: 0.7, corneaBulgeMm: 1.5, corneaRadiusMm: 6.9,
  around: 28,
  /** sRGB colours. Moist and warm, in the brain's own look: an ivory white that turns pink toward the back of the
   * eyeball, an amber-brown iris (no motor area has this colour family at this darkness), a near-black pupil. */
  colors: freeze({
    sclera: 0xfbf4ea, scleraBack: 0xeeb9ad, limbus: 0x3a2413, irisOuter: 0x7c4a1c, irisInner: 0xc98a36, pupil: 0x060406,
    nerve: 0xf0d6bf, nerveEye: 0xf4c9b6, chiasm: 0xecc8b2
  }),
  eyeRoughness: 0.14, nerveRoughness: 0.4,
  /** The nerve, chiasm and tract of the LEFT side (x measured from the midline, positive = subject left; y, z atlas mm)
   * as points the tube's centre line passes through; the right side is the mirror image. The first two points are set
   * from the eyeball (see nervePath). radiusMm: the tube's radius along the path (start, chiasm, end). */
  nerve: freeze({
    insideEyeFrac: 0.8, medialAtEyeMm: 2.6, stubMm: 9, stubRiseMm: 3,
    viaMm: freeze([freeze([20.8, -150, 1531]), freeze([12.8, -128, 1537]), freeze([5.6, -113.5, 1533.2]), freeze([2.4, -109, 1532]),
      freeze([5, -104.5, 1531.4]), freeze([10, -100, 1529]), freeze([14, -96, 1526])]),
    radiusMm: 2.1, tractRadiusMm: 1.6, chiasmIndex: 5, around: 8, perSpan: 4
  }),
  /** The chiasm's own body: a flat ellipsoid on the midline where the two tubes meet (x from the midline, y, z; radii). */
  chiasm: freeze({ centreMm: freeze([0, -109, 1532]), radiiMm: freeze([6.2, 3.7, 2.0]), around: 12, rings: 6 }),
  /** Names for the tip beside the crosshair (ns-text BRAIN_PARTS holds the words). */
  parts: freeze(['eyeball', 'nerve'])
});

const srgbToLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** An sRGB hex colour as linear r, g, b (the vertex colours of a lit material are linear). */
export function hexLinear(hex) {
  return [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)];
}
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The two eye centres in atlas mm: { left: [x, y, z], right: [x, y, z] } (left = subject left, +x). */
export function eyeCentres(o = BRAIN_EYES) {
  const y = o.atlasYmm - o.forwardMm, z = o.atlasZmm;
  return { left: [o.midlineXmm + o.atlasLateralMm, y, z], right: [o.midlineXmm - o.atlasLateralMm, y, z] };
}

/** Where each eye looks (unit vector, atlas frame): forward (-y), raised by gazeUpDeg toward +z. */
export function eyeGaze(o = BRAIN_EYES) {
  const e = o.gazeUpDeg * DEG;
  return [0, -Math.cos(e), Math.sin(e)];
}

/** Points that bound the two eyeballs (flat xyz, atlas mm): each centre moved one radius (and the cornea's bulge)
 * along the six axis directions. For the start framing (ns-brain frameBrain motorKeepPoints): the eyeballs must be in
 * the start picture together with the motor strip. */
export function eyeKeepPoints(o = BRAIN_EYES) {
  const c = eyeCentres(o), r = o.radiusMm + o.corneaBulgeMm, out = [];
  for (const p of [c.left, c.right]) for (let a = 0; a < 3; a++) for (const s of [-1, 1]) { const q = p.slice(); q[a] += s * r; out.push(q[0], q[1], q[2]); }
  return Float64Array.from(out);
}

/** The polar rings of an eyeball: angle from the look's own axis (degrees) and the colour there. Two rings at one angle
 * make a sharp edge between two colours (the faces between them are left out). */
function eyeRings(o) {
  const C = o.colors, lin = k => hexLinear(C[k]), R = o.radiusMm;
  const aP = Math.asin(o.pupilRadiusMm / R) / DEG, aI = Math.asin(o.irisRadiusMm / R) / DEG, aL = Math.asin((o.irisRadiusMm + o.limbusMm) / R) / DEG;
  const pupil = lin('pupil'), inner = lin('irisInner'), outer = lin('irisOuter'), limbus = lin('limbus'), white = lin('sclera'), back = lin('scleraBack');
  const rings = [[0, pupil], [aP * 0.55, pupil], [aP, pupil], [aP, inner], [aP + (aI - aP) * 0.45, mix3(inner, outer, 0.45)], [aI - 1.2, outer], [aI, limbus], [aL, limbus], [aL, white]];
  for (const a of [aL + 7, 52, 66, 80, 94, 108, 122, 136, 150, 164, 180]) rings.push([a, mix3(white, back, smooth(84, 160, a))]);
  return rings;
}

/** The surface's distance from the eye centre at angle `a` (degrees) from the look's axis: the sphere, with the cornea's
 * shallow dome over the iris. */
function eyeProfile(a, o) {
  const aC = Math.asin(o.corneaRadiusMm / o.radiusMm) / DEG;
  if (a >= aC) return o.radiusMm;
  const t = Math.cos((a / aC) * (Math.PI / 2));
  return o.radiusMm + o.corneaBulgeMm * t * t;
}

/**
 * The two eyeballs as one indexed mesh: { positions (Float32Array xyz, atlas mm), normals, colors (linear rgb),
 * indices (Uint16Array), triangles, centres: { left, right }, gaze }.
 */
export function buildEyeballs(o = BRAIN_EYES) {
  const g = eyeGaze(o), cs = eyeCentres(o), rings = eyeRings(o), N = o.around;
  // an orthonormal frame about the look's axis: u = subject left (+x), v = g x u
  const u = [1, 0, 0], v = [g[1] * u[2] - g[2] * u[1], g[2] * u[0] - g[0] * u[2], g[0] * u[1] - g[1] * u[0]];
  const pos = [], nor = [], col = [], idx = [];
  for (const c of [cs.left, cs.right]) {
    const base = pos.length / 3;
    rings.forEach(([a, colour]) => {
      const t = a * DEG, r = eyeProfile(a, o), dr = (eyeProfile(a + 0.25, o) - eyeProfile(Math.max(0, a - 0.25), o)) / ((a + 0.25 - Math.max(0, a - 0.25)) * DEG);
      for (let j = 0; j < N; j++) {
        const ph = (j / N) * 2 * Math.PI, cp = Math.cos(ph), sp = Math.sin(ph), st = Math.sin(t), ct = Math.cos(t);
        const er = [st * (cp * u[0] + sp * v[0]) + ct * g[0], st * (cp * u[1] + sp * v[1]) + ct * g[1], st * (cp * u[2] + sp * v[2]) + ct * g[2]];
        const et = [ct * (cp * u[0] + sp * v[0]) - st * g[0], ct * (cp * u[1] + sp * v[1]) - st * g[1], ct * (cp * u[2] + sp * v[2]) - st * g[2]];
        pos.push(c[0] + r * er[0], c[1] + r * er[1], c[2] + r * er[2]);
        const n = [r * er[0] - dr * et[0], r * er[1] - dr * et[1], r * er[2] - dr * et[2]], l = Math.hypot(n[0], n[1], n[2]) || 1;
        nor.push(n[0] / l, n[1] / l, n[2] / l);
        col.push(colour[0], colour[1], colour[2]);
      }
    });
    for (let i = 0; i + 1 < rings.length; i++) {
      if (rings[i][0] === rings[i + 1][0]) continue; // a colour edge: two rings in one place
      const a0 = base + i * N, a1 = base + (i + 1) * N, pole0 = rings[i][0] === 0, pole1 = rings[i + 1][0] === 180;
      for (let j = 0; j < N; j++) {
        const k = (j + 1) % N;
        // outward-facing triangles (counter-clockwise seen from outside: the look's axis toward the viewer)
        if (!pole0) idx.push(a0 + j, a1 + j, a0 + k);
        if (!pole1) idx.push(a0 + k, a1 + j, a1 + k);
      }
    }
  }
  return { positions: Float32Array.from(pos), normals: Float32Array.from(nor), colors: Float32Array.from(col), indices: Uint16Array.from(idx), triangles: idx.length / 3, centres: cs, gaze: g };
}

/** The centre line of one side's nerve, chiasm and tract as points (atlas mm). side: +1 left, -1 right. */
export function nervePath(side, o = BRAIN_EYES) {
  const s = side < 0 ? -1 : 1, c = eyeCentres(o)[s > 0 ? 'left' : 'right'], n = o.nerve, R = o.radiusMm, m = o.midlineXmm;
  const pts = [
    [c[0] - s * n.medialAtEyeMm, c[1] + n.insideEyeFrac * R, c[2]],
    [c[0] - s * (n.medialAtEyeMm + 1.2), c[1] + R + n.stubMm, c[2] + n.stubRiseMm]
  ];
  for (const p of n.viaMm) pts.push([m + s * p[0], p[1], p[2]]);
  return pts;
}

/** A Catmull-Rom spline through `pts` (centripetal enough for these gentle paths: uniform), `per` samples a span. */
function splinePoints(pts, per) {
  const out = [], P = i => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t, q = [0, 0, 0];
      for (let a = 0; a < 3; a++) q[a] = 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3);
      out.push({ p: q, at: i + t });
    }
  }
  out.push({ p: pts[pts.length - 1].slice(), at: pts.length - 1 });
  return out;
}

/**
 * The two nerves with their tracts, and the chiasm's body, as one indexed mesh:
 * { positions, normals, colors, indices, triangles, paths: { left, right } (the control points) }.
 */
export function buildNerves(o = BRAIN_EYES) {
  const n = o.nerve, C = o.colors, cNerve = hexLinear(C.nerve), cEye = hexLinear(C.nerveEye), cCh = hexLinear(C.chiasm);
  const pos = [], nor = [], col = [], idx = [];
  const paths = { left: nervePath(1, o), right: nervePath(-1, o) };
  for (const key of ['left', 'right']) {
    const S = splinePoints(paths[key], n.perSpan), base = pos.length / 3, M = n.around, last = paths[key].length - 1;
    let prevU = null;
    S.forEach((smp, i) => {
      const a = S[Math.max(0, i - 1)].p, b = S[Math.min(S.length - 1, i + 1)].p;
      let t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const tl = Math.hypot(t[0], t[1], t[2]) || 1; t = [t[0] / tl, t[1] / tl, t[2] / tl];
      // a frame that does not twist: carry the last side vector along, made square to the new direction
      let uu = prevU || (Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]);
      const d = uu[0] * t[0] + uu[1] * t[1] + uu[2] * t[2];
      uu = [uu[0] - d * t[0], uu[1] - d * t[1], uu[2] - d * t[2]]; const ul = Math.hypot(uu[0], uu[1], uu[2]) || 1; uu = [uu[0] / ul, uu[1] / ul, uu[2] / ul];
      prevU = uu;
      const w = [t[1] * uu[2] - t[2] * uu[1], t[2] * uu[0] - t[0] * uu[2], t[0] * uu[1] - t[1] * uu[0]];
      const past = smooth(n.chiasmIndex, last, smp.at), r = n.radiusMm + (n.tractRadiusMm - n.radiusMm) * past;
      const colour = mix3(mix3(cEye, cNerve, smooth(0.6, 2.2, smp.at)), cCh, smooth(n.chiasmIndex - 1.5, n.chiasmIndex, smp.at));
      for (let j = 0; j < M; j++) {
        const ph = (j / M) * 2 * Math.PI, e = [Math.cos(ph) * uu[0] + Math.sin(ph) * w[0], Math.cos(ph) * uu[1] + Math.sin(ph) * w[1], Math.cos(ph) * uu[2] + Math.sin(ph) * w[2]];
        pos.push(smp.p[0] + r * e[0], smp.p[1] + r * e[1], smp.p[2] + r * e[2]); nor.push(e[0], e[1], e[2]); col.push(colour[0], colour[1], colour[2]);
      }
    });
    for (let i = 0; i + 1 < S.length; i++) for (let j = 0; j < M; j++) {
      const k = (j + 1) % M, a0 = base + i * M, a1 = a0 + M;
      idx.push(a0 + j, a0 + k, a1 + j, a0 + k, a1 + k, a1 + j);
    }
    // a rounded end inside the brain (the eye end is inside the eyeball and needs none)
    const endC = pos.length / 3, eP = S[S.length - 1].p, eA = S[S.length - 2].p;
    let t = [eP[0] - eA[0], eP[1] - eA[1], eP[2] - eA[2]]; const tl = Math.hypot(t[0], t[1], t[2]) || 1; t = [t[0] / tl, t[1] / tl, t[2] / tl];
    pos.push(eP[0] + n.tractRadiusMm * 0.8 * t[0], eP[1] + n.tractRadiusMm * 0.8 * t[1], eP[2] + n.tractRadiusMm * 0.8 * t[2]); nor.push(t[0], t[1], t[2]); col.push(cCh[0], cCh[1], cCh[2]);
    const ring = base + (S.length - 1) * M;
    for (let j = 0; j < M; j++) idx.push(ring + j, ring + (j + 1) % M, endC);
  }
  // the chiasm: a flat ellipsoid on the midline
  {
    const ch = o.chiasm, c = [o.midlineXmm + ch.centreMm[0], ch.centreMm[1], ch.centreMm[2]], R = ch.radiiMm, base = pos.length / 3, M = ch.around, K = ch.rings;
    for (let i = 0; i <= K; i++) {
      const th = (i / K) * Math.PI;
      for (let j = 0; j < M; j++) {
        const ph = (j / M) * 2 * Math.PI, e = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
        pos.push(c[0] + R[0] * e[0], c[1] + R[1] * e[1], c[2] + R[2] * e[2]);
        const nn = [e[0] / R[0], e[1] / R[1], e[2] / R[2]], l = Math.hypot(nn[0], nn[1], nn[2]) || 1;
        nor.push(nn[0] / l, nn[1] / l, nn[2] / l); col.push(cCh[0], cCh[1], cCh[2]);
      }
    }
    for (let i = 0; i < K; i++) for (let j = 0; j < M; j++) {
      const k = (j + 1) % M, a0 = base + i * M, a1 = a0 + M;
      if (i > 0) idx.push(a0 + j, a1 + j, a0 + k);
      if (i < K - 1) idx.push(a0 + k, a1 + j, a1 + k);
    }
  }
  return { positions: Float32Array.from(pos), normals: Float32Array.from(nor), colors: Float32Array.from(col), indices: Uint16Array.from(idx), triangles: idx.length / 3, paths };
}
