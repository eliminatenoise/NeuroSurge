/** NeuroSurge: the mark where a contact happens (18 November 2026, package CONTACT; owner, 17 November: "And I asked for
 * collision effects. And limb pushing limb effects").
 *
 * A small pool of ripples that face the camera. Each starts at the contact's place, moved a few centimetres toward the
 * eye so the two touching surfaces do not hide it, and runs outward and fades within CONTACT_FX.s (about a third of a
 * second): a dark band, the shadow of the tissue dented by the touch, with a thin wet highlight inside it and a short
 * pale flush at the centre, the way a press shows on glossy flesh. A pale additive light alone was tried first and
 * hardly showed on the pale muscle. No words. The app places one on your body and one at the same place of the mirror
 * body (scaled with it). The ripple is drawn with the depth test (hidden behind what stands in front of it) and once more,
 * faint, without it (a touch behind a limb still shows a little). Under prefers-reduced-motion it does not run outward:
 * it fades where it is. The ripples write no depth and are not drawn when idle. A display mark only: nothing measured.
 */

/** slots: ripples in the pool; s: seconds a ripple lives; r0 / r1: its radius at the start and at the end (world metres
 * at scale 1; the bodies are drawn life size); liftM: how far it stands toward the eye from the contact; dent / wet /
 * flush: the colours of the dark band, the highlight and the centre; alpha: the strength of the band; through: the
 * strength of the copy drawn without the depth test; riseS: how fast it comes up; kickMmS: the speed (brain source mm per
 * second) a touch gives the living brain's tissue (ns-brain-live wobble; it swings back on its own spring). */
export const CONTACT_FX = Object.freeze({
  slots: 8, s: 0.34, r0: 0.025, r1: 0.09, liftM: 0.05,
  dent: Object.freeze([0.28, 0.05, 0.06]), wet: Object.freeze([1.0, 0.93, 0.88]), flush: Object.freeze([1.0, 0.72, 0.66]),
  alpha: 0.85, through: 0.3, riseS: 0.03, kickMmS: 55
});

const VERT = `
uniform float uSize;
varying vec2 vXY;
void main() {
  vXY = position.xy;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * uSize;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform float uAlpha;
uniform float uRing;
uniform float uCore;
uniform vec3 uDent;
uniform vec3 uWet;
uniform vec3 uFlush;
varying vec2 vXY;
void main() {
  float d = length(vXY);
  if (d > 1.0) discard;
  float band = exp(-pow((d - uRing) / 0.19, 2.0));
  float wet = exp(-pow((d - (uRing - 0.2)) / 0.06, 2.0));
  float core = exp(-pow(d / 0.35, 2.0)) * uCore;
  float edge = 1.0 - smoothstep(0.85, 1.0, d);
  vec3 col = uDent;
  col = mix(col, uFlush, clamp(core * 1.4, 0.0, 1.0));
  col = mix(col, uWet, clamp(wet * 1.2, 0.0, 1.0));
  float a = clamp(band * 0.85 + wet * 0.9 + core * 0.55, 0.0, 1.0) * uAlpha * edge;
  gl_FragColor = vec4(col, a);
}`;

/** The pool. Returns { group, flash(points, { strength, scales }), step(dtMs, camera), state(), dispose() }. */
export function createContactFx({ THREE, reducedMotion = false, o = CONTACT_FX } = {}) {
  const group = new THREE.Group();
  group.name = 'ns-contact-fx';
  const geo = new THREE.PlaneGeometry(2, 2);
  const v3 = c => new THREE.Vector3(c[0], c[1], c[2]);
  const base = new THREE.ShaderMaterial({
    uniforms: { uSize: { value: o.r0 }, uAlpha: { value: 0 }, uRing: { value: 0.3 }, uCore: { value: 1 }, uDent: { value: v3(o.dent) }, uWet: { value: v3(o.wet) }, uFlush: { value: v3(o.flush) } },
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true, toneMapped: false
  });
  const slots = [];
  for (let i = 0; i < o.slots; i++) {
    const mat = i === 0 ? base : base.clone(), see = base.clone();
    see.depthTest = false;
    const mesh = new THREE.Mesh(geo, mat), ghost = new THREE.Mesh(geo, see);
    for (const m of [mesh, ghost]) { m.visible = false; m.frustumCulled = false; group.add(m); }
    mesh.renderOrder = 991; ghost.renderOrder = 990; mesh.name = `ns-contact-fx-${i}`; ghost.name = `ns-contact-fx-through-${i}`;
    slots.push({ mesh, ghost, mat, see, age: 1, strength: 0, scale: 1, at: [0, 0, 0] });
  }
  let next = 0, flashes = 0, active = 0;
  const eye = [0, 0, 0];
  function flash(points, { strength = 1, scales = null } = {}) {
    if (!Array.isArray(points)) return 0;
    let n = 0;
    points.forEach((p, k) => {
      if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) return;
      const s = slots[next]; next = (next + 1) % slots.length;
      s.at[0] = p[0]; s.at[1] = p[1]; s.at[2] = p[2]; s.age = 0; s.strength = Math.max(0, Math.min(1, strength));
      s.scale = scales && Number.isFinite(scales[k]) && scales[k] > 0 ? scales[k] : 1;
      s.mesh.visible = true; s.ghost.visible = true; n++; flashes++;
    });
    return n;
  }
  /** One step: age every ripple by dtMs, run it outward and fade it, keep it standing toward the eye (no allocation). */
  function step(dtMs, camera) {
    active = 0;
    const dt = dtMs > 0 ? Math.min(dtMs, 100) / 1000 : 0;
    if (camera && camera.matrixWorld) { const e = camera.matrixWorld.elements; eye[0] = e[12]; eye[1] = e[13]; eye[2] = e[14]; }
    for (const s of slots) {
      if (s.age >= 1) continue;
      s.age = Math.min(1, s.age + dt / o.s);
      if (s.age >= 1) { s.mesh.visible = false; s.ghost.visible = false; continue; }
      active++;
      const t = s.age, open = reducedMotion ? 0.55 : 1 - (1 - t) * (1 - t);
      const rise = Math.min(1, (t * o.s) / o.riseS), fade = Math.pow(1 - t, 1.3);
      const size = (o.r0 + (o.r1 - o.r0) * open) * s.scale, ring = reducedMotion ? 0.55 : 0.3 + 0.55 * open, core = reducedMotion ? 0.6 * (1 - t) : Math.max(0, 1 - t * 3);
      const a = o.alpha * (0.45 + 0.55 * s.strength) * rise * fade;
      for (const [m, k] of [[s.mat, 1], [s.see, o.through]]) { const u = m.uniforms; u.uSize.value = size; u.uRing.value = ring; u.uCore.value = core; u.uAlpha.value = a * k; }
      const dx = eye[0] - s.at[0], dy = eye[1] - s.at[1], dz = eye[2] - s.at[2], dl = Math.hypot(dx, dy, dz) || 1, k = Math.min(o.liftM * s.scale, dl * 0.5) / dl;
      s.mesh.position.set(s.at[0] + dx * k, s.at[1] + dy * k, s.at[2] + dz * k);
      s.ghost.position.copy(s.mesh.position);
    }
  }
  return {
    group, flash, step,
    state: () => ({ flashes, active, reducedMotion }),
    dispose() { geo.dispose(); for (const s of slots) { s.mat.dispose(); s.see.dispose(); } }
  };
}
