/**
 * A small normal-view layer of simulated electricity. Trails follow edges of
 * the displayed motor blocks and cortical meshes in their atlas coordinates.
 * They illustrate activity, independently of measured neural signals.
 */
import { brainGapGlsl, brainGapUniformValue } from './ns-brain-gap.mjs';
import { stormEnvelope } from './ns-emap-storm.mjs';

export const AMBIENT_EMAP = Object.freeze({
  strip: Object.freeze({ limit: 72, perSurface: 3, liftMm: 1.2, alpha: .28, colour: [.24, .69, .91] }),
  brain: Object.freeze({ limit: 88, perSurface: 5, liftMm: .85, alpha: .21, colour: [.35, .62, .90] }),
  maxVertices: 14,
  order: 17.5,
});

const excludedCortex = /precentral|unassigned motor-strip|white matter|ventricle|aqueduct|habenula|tuber|pineal|colliculus|hypothalamus|(?:brain|cerebral) stem|medulla|pons|thalamus|caudate|putamen|amygdala|hippocamp/i;
const nextRandom = value => (Math.imul(value, 1664525) + 1013904223) >>> 0;
const unitRandom = value => (value >>> 8) / 16777216;
const smoothStorm = Object.freeze({ riseS: 1.4 });

const vertexShader = `
attribute vec2 aTravel;
attribute vec2 aGap;
varying vec2 vTravel;
varying vec2 vGap;
varying vec3 vPlace;
void main() {
  vTravel = aTravel;
  vGap = aGap;
  vPlace = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragmentShader = `
uniform float uTime;
uniform float uEnvelope;
uniform float uAlpha;
uniform vec3 uColour;
varying vec2 vTravel;
varying vec2 vGap;
varying vec3 vPlace;
${brainGapGlsl().head}
void main() {
  if (nsGapIn(vPlace, vGap) > 0.5) discard;
  float at = vTravel.x;
  float phase = fract(vTravel.y + 0.27 * uTime + 0.78 * at);
  float hump = 0.5 + 0.5 * cos(6.2831853 * phase);
  float pulse = hump * hump * hump;
  float endFade = smoothstep(0.0,0.22,at) * (1.0 - smoothstep(0.76,1.0,at));
  float alpha = uAlpha * endFade * (0.42 + (0.42 + 0.16 * uEnvelope) * pulse);
  gl_FragColor = vec4(uColour, alpha);
  #include <colorspace_fragment>
}`;

function meshInfo(mesh) {
  const geometry = mesh?.geometry;
  const position = geometry?.getAttribute?.('position');
  if (!position || position.itemSize < 3 || position.count < 3) return null;
  const index = geometry.getIndex();
  const count = Math.floor((index ? index.count : position.count) / 3);
  if (!count) return null;
  return { mesh, position, index, count, normal: geometry.getAttribute('normal') };
}

function triangleVertex(surface, slot) {
  return surface.index ? surface.index.getX(slot) : slot;
}

function graphNear(surface, seed) {
  const edges = new Map();
  const add = (a, b) => {
    if (a === b) return;
    let exits = edges.get(a);
    if (!exits) edges.set(a, exits = new Set());
    exits.add(b);
  };
  // Adjacent triangles are usually stored near each other. Keep the local
  // graph bounded even when a high-detail anatomical mesh is loaded.
  const lo = Math.max(0, seed - 115), hi = Math.min(seed + 116, surface.count);
  for (let i = lo; i < hi; i++) {
    const a = triangleVertex(surface, 3 * i), b = triangleVertex(surface, 3 * i + 1), c = triangleVertex(surface, 3 * i + 2);
    add(a,b); add(b,a); add(b,c); add(c,b); add(c,a); add(a,c);
  }
  return edges;
}

function trailOn(surface, seed, startCorner, cap) {
  const edges = graphNear(surface, seed);
  const point = surface.position;
  const path = [triangleVertex(surface, 3 * seed + startCorner)];
  const seen = new Set(path);
  let distance = 0, dx = 0, dy = 0, dz = 0;
  for (let i = 1; i < cap && distance < 44; i++) {
    const from = path.at(-1);
    let pick, score = -Infinity, step, nx, ny, nz;
    for (const to of edges.get(from) || []) {
      if (seen.has(to)) continue;
      const x = point.getX(to) - point.getX(from);
      const y = point.getY(to) - point.getY(from);
      const z = point.getZ(to) - point.getZ(from);
      const length = Math.hypot(x, y, z);
      if (!(length >= .12 && length <= 18) || distance + length > 54) continue;
      const turn = (x * dx + y * dy + z * dz) / length;
      const rank = length + 3 * turn;
      if (rank <= score) continue;
      score = rank; pick = to; step = length;
      nx = x / length; ny = y / length; nz = z / length;
    }
    if (pick === undefined) break;
    path.push(pick);
    seen.add(pick);
    distance += step;
    dx = nx; dy = ny; dz = nz;
  }
  return path.length >= 3 && distance >= 4.5 ? path : null;
}

function motorMeshes(objects) {
  const result = [];
  for (const region of objects.regions || []) {
    for (const mesh of region?.meshes || []) {
      if (meshInfo(mesh)) { result.push(mesh); break; }
    }
  }
  if (!result.length && meshInfo(objects.strip)) result.push(objects.strip);
  return result;
}

function corticalMeshes(objects) {
  return (objects.glass || []).filter(mesh => !excludedCortex.test(mesh?.name || '') && meshInfo(mesh));
}

function layerGeometry(THREE, meshes, settings) {
  const source = meshes.map(meshInfo).filter(Boolean);
  const position = [], travel = [], gap = [];
  let paths = 0, drawnMeshes = 0;
  let rng = 0x5a31f1d4;
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();

  for (const [index, surface] of source.entries()) {
    const { mesh } = surface;
    // Spread the budget through the whole ordered atlas, including both sides.
    const allotted = Math.floor((index + 1) * settings.limit / source.length) -
      Math.floor(index * settings.limit / source.length);
    const ownCount = Math.min(settings.perSurface, allotted);
    let contributed = false;
    const cut = mesh.userData?.nsGap;
    for (let p = 0; p < ownCount && paths < settings.limit; p++) {
      let path;
      for (let attempt = 0; attempt < 4 && !path; attempt++) {
        rng = nextRandom(rng);
        const phase = unitRandom(rng);
        const seed = Math.min(surface.count - 1, Math.floor(surface.count * (p + .1 + .8 * phase) / ownCount));
        path = trailOn(surface, seed, (rng >>> 2) % 3, AMBIENT_EMAP.maxVertices);
      }
      if (!path) continue;
      contributed = true;
      paths++;
      const phase = unitRandom(rng);
      const append = (index, at) => {
        point.fromBufferAttribute(surface.position, index);
        if (surface.normal) {
          direction.fromBufferAttribute(surface.normal, index).normalize();
          point.addScaledVector(direction, settings.liftMm);
        }
        if (mesh.matrix) point.applyMatrix4(mesh.matrix);
        position.push(point.x, point.y, point.z);
        travel.push(at, phase);
        gap.push(cut?.side || 0, cut?.kind || 0);
      };
      for (let i = 1; i < path.length; i++) {
        append(path[i - 1], (i - 1) / (path.length - 1));
        append(path[i], i / (path.length - 1));
      }
    }
    if (contributed) drawnMeshes++;
  }
  if (!position.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('aTravel', new THREE.Float32BufferAttribute(travel, 2));
  geometry.setAttribute('aGap', new THREE.Float32BufferAttribute(gap, 2));
  return { geometry, paths, segments: position.length / 6, sourceMeshes: drawnMeshes };
}

function layer(THREE, meshes, settings, name) {
  const data = layerGeometry(THREE, meshes, settings);
  if (!data) return null;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uEnvelope: { value: 0 },
      uAlpha: { value: settings.alpha },
      uColour: { value: new THREE.Color(...settings.colour) },
      nsGapCut: { value: new THREE.Vector4(...brainGapUniformValue()) },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.LineSegments(data.geometry, material);
  mesh.name = 'ns-ambient electrical ' + name + ' (simulated)';
  mesh.renderOrder = AMBIENT_EMAP.order;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.raycast = () => {};
  mesh.visible = false;
  return { mesh, data, material };
}

export function createAmbientEmap({ THREE, objects } = {}) {
  if (!THREE || !objects?.brainGroup) throw new TypeError('Ambient electricity needs the active brain group.');
  const brain = objects.brainGroup;
  let strip = null, cortex = null, stripHead, cortexHead, stripCount, cortexCount;
  let start = null, visible = false, reduced = false;

  function release(entry) {
    if (!entry) return;
    brain.remove(entry.mesh);
    entry.data.geometry.dispose();
    entry.material.dispose();
  }

  function prepare() {
    const firstStrip = objects.regions?.[0]?.meshes?.[0] || objects.strip;
    const firstCortex = objects.glass?.[0];
    const nextStripCount = objects.regions?.length || 0;
    const nextCortexCount = objects.glass?.length || 0;
    if (stripHead === firstStrip && cortexHead === firstCortex && stripCount === nextStripCount && cortexCount === nextCortexCount) return;
    release(strip);
    release(cortex);
    stripHead = firstStrip;
    cortexHead = firstCortex;
    stripCount = nextStripCount;
    cortexCount = nextCortexCount;
    strip = layer(THREE, motorMeshes(objects), AMBIENT_EMAP.strip, 'motor strip');
    cortex = layer(THREE, corticalMeshes(objects), AMBIENT_EMAP.brain, 'cortex');
    if (strip) brain.add(strip.mesh);
    if (cortex) brain.add(cortex.mesh);
  }

  function frame({ nowMs, enabled = true, reduced: reducedMotion = false } = {}) {
    reduced = Boolean(reducedMotion);
    if (enabled && brain.visible) prepare();
    visible = Boolean(enabled && brain.visible && (strip || cortex));
    if (!visible || !Number.isFinite(nowMs)) start = null;
    else if (start === null || nowMs < start) start = nowMs;
    const t = reduced || start === null ? 0 : ((nowMs - start) / 1000) % 200;
    const envelope = reduced ? 0 : stormEnvelope(t % 8, 3.6, smoothStorm);
    for (const item of [strip, cortex]) {
      if (!item) continue;
      item.mesh.visible = visible;
      if (visible) {
        item.material.uniforms.uTime.value = t;
        item.material.uniforms.uEnvelope.value = envelope;
      }
    }
    return visible;
  }

  const summarize = item => item ? {
    paths: item.data.paths, segments: item.data.segments, sourceMeshes: item.data.sourceMeshes,
    peakAlpha: item.material.uniforms.uAlpha.value,
  } : null;

  return {
    frame,
    state: () => ({ simulated: true, visible, reduced, strip: summarize(strip), brain: summarize(cortex) }),
    dispose() {
      release(strip);
      release(cortex);
      visible = false;
      strip = cortex = null;
      stripHead = cortexHead = undefined;
      stripCount = cortexCount = undefined;
      start = null;
    },
  };
}
