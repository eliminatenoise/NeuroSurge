/** NeuroSurge loading picture ("assembly"): while the game's files load, the bones, the muscles and the parts of the
 * brain are drawn as they arrive, each one flying into its place, so the player watches the body and the brain come
 * together instead of reading a loading page (user note of 17 November 2026).
 *
 * This is a PICTURE OF THE LOADING, nothing more. It draws the same atlas files the game loads (the bytes the game
 * fetched, parsed a second time here with a small reader of its own), in the atlas' own standing posture, with plain
 * colours. It checks nothing: the game's own loader still verifies every file's hash and shape before it uses it, and
 * a part shown here can still be refused there. Nothing in this module is read by the game.
 *
 * The module has no DOM: it runs in a worker on an OffscreenCanvas (ns-assembly-worker.mjs), so the picture keeps
 * moving while the page's main thread builds the body, or on the page itself where a worker canvas is not available.
 *
 * Coordinates: the atlas' millimetres (BodyParts3D: +x the body's left, +y its back, +z up). The camera stands in
 * front of the body and looks at it like a mirror, with +z up.
 */

/** Kinds of part the picture knows, and their colour (sRGB hex). 'strip' is the precentral gyrus, where the game's
 * motor areas are drawn. */
export const ASSEMBLY_KINDS = Object.freeze({
  bone: 0xe8dfc8, muscle: 0xb2343c, eye: 0xf4f1ea, brain: 0xe0a39c, strip: 0xff4f9a
});

/** Layout numbers (millimetres, degrees, seconds). The brain is drawn a second time, larger and tipped toward the
 * viewer, above the body: the same arrangement as the game's first view (brain above, mirror body below). */
export const ASSEMBLY = Object.freeze({
  fovYDeg: 30, fill: 0.94,
  bodyCentre: Object.freeze([0, -40, 880]), bodyHalfWidth: 520, bottom: -140,
  brainCentre: Object.freeze([-0.5, -79.7, 1547.5]), brainScale: 6.0, brainTiltDeg: 48, brainAt: Object.freeze([0, -40, 2240]), top: 2700,
  flyMm: 260, flyS: 0.75, flashS: 1.1, swayDeg: 24, swayS: 11, maxStartsPerFrame: 14
});

/** Reads the vertices and faces of a Wavefront OBJ from its bytes (ASCII). Returns { positions: Float32Array,
 * indices: Uint32Array } with polygons fanned into triangles, or null when the file has no usable triangle. Only what
 * a picture needs: "v x y z" and "f a b c ..." (with or without /t/n parts); everything else is skipped. */
export function parseObjBytes(u8) {
  const n = u8.length;
  let pos = new Float32Array(3 * 8192), np = 0, idx = new Uint32Array(3 * 16384), ni = 0;
  let i = 0;
  const face = [];
  while (i < n) {
    const c = u8[i], d = i + 1 < n ? u8[i + 1] : 10;
    if (c === 118 && (d === 32 || d === 9)) { // "v "
      i += 2;
      for (let k = 0; k < 3; k++) {
        while (i < n && (u8[i] === 32 || u8[i] === 9)) i++;
        let sign = 1, v = 0, any = false;
        if (u8[i] === 45) { sign = -1; i++; } else if (u8[i] === 43) i++;
        while (i < n) { const q = u8[i] - 48; if (q < 0 || q > 9) break; v = v * 10 + q; i++; any = true; }
        if (u8[i] === 46) { i++; let f = 0.1; while (i < n) { const q = u8[i] - 48; if (q < 0 || q > 9) break; v += q * f; f *= 0.1; i++; any = true; } }
        if (any && (u8[i] === 101 || u8[i] === 69)) {
          i++; let es = 1, e = 0;
          if (u8[i] === 45) { es = -1; i++; } else if (u8[i] === 43) i++;
          while (i < n) { const q = u8[i] - 48; if (q < 0 || q > 9) break; e = e * 10 + q; i++; }
          v *= Math.pow(10, es * e);
        }
        if (np + 1 > pos.length) { const g = new Float32Array(pos.length * 2); g.set(pos); pos = g; }
        pos[np++] = any ? sign * v : 0;
      }
    } else if (c === 102 && (d === 32 || d === 9)) { // "f "
      i += 2; face.length = 0;
      while (i < n && u8[i] !== 10 && u8[i] !== 13) {
        while (i < n && (u8[i] === 32 || u8[i] === 9)) i++;
        let v = 0, any = false;
        while (i < n) { const q = u8[i] - 48; if (q < 0 || q > 9) break; v = v * 10 + q; i++; any = true; }
        if (any) face.push(v - 1);
        while (i < n && u8[i] !== 32 && u8[i] !== 9 && u8[i] !== 10 && u8[i] !== 13) i++; // the /t/n part
      }
      for (let k = 1; k + 1 < face.length; k++) {
        if (ni + 3 > idx.length) { const g = new Uint32Array(idx.length * 2); g.set(idx); idx = g; }
        idx[ni++] = face[0]; idx[ni++] = face[k]; idx[ni++] = face[k + 1];
      }
    }
    while (i < n && u8[i] !== 10) i++;
    i++;
  }
  const count = Math.floor(np / 3);
  if (count < 3 || ni < 3) return null;
  for (let k = 0; k < ni; k++) if (idx[k] >= count) return null;
  return { positions: pos.slice(0, count * 3), indices: idx.slice(0, ni) };
}

/** Smooth vertex normals (area weighted) and the centre of the bounding box of a parsed mesh. */
export function meshNormalsAndCentre(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let k = 0; k < indices.length; k += 3) {
    const a = 3 * indices[k], b = 3 * indices[k + 1], c = 3 * indices[k + 2];
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    normals[a] += nx; normals[a + 1] += ny; normals[a + 2] += nz;
    normals[b] += nx; normals[b + 1] += ny; normals[b + 2] += nz;
    normals[c] += nx; normals[c + 1] += ny; normals[c + 2] += nz;
  }
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let k = 0; k < positions.length; k += 3) {
    const l = Math.hypot(normals[k], normals[k + 1], normals[k + 2]) || 1;
    normals[k] /= l; normals[k + 1] /= l; normals[k + 2] /= l;
    const x = positions[k], y = positions[k + 1], z = positions[k + 2];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  return { normals, centre: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2] };
}

const easeOut = u => 1 - Math.pow(1 - Math.min(1, Math.max(0, u)), 3);

/** The loading picture's brain beats, as an exposed brain does in surgery (user note of 17 November 2026: "a beating
 * reacting brain as you would see in neurosurgery"): a heartbeat-shaped swell (a quick rise, a slower fall with a small
 * second bump) on a slow rise and fall like breathing. Returns { beat: 0..1, breath: -1..1 } for a time in seconds.
 * A display rhythm for a picture; nothing is measured. Pure. */
export const BRAIN_BEAT = Object.freeze({ beatS: 0.92, breathS: 4.4, swell: 0.014, breathSwell: 0.008 });
export function brainBeat(t, o = BRAIN_BEAT) {
  const ph = ((t % o.beatS) + o.beatS) % o.beatS / o.beatS;
  const rise = ph < 0.14 ? Math.sin((Math.PI / 2) * (ph / 0.14)) ** 2 : Math.exp(-(ph - 0.14) / 0.2);
  const notch = 0.14 * Math.exp(-(((ph - 0.42) / 0.06) ** 2));
  return { beat: Math.min(1, rise + notch), breath: Math.sin((2 * Math.PI * t) / o.breathS) };
}
/** The beat's clock (seconds), shared by the loading picture and the game's living brain (ns-brain-live), so the brain
 * that came together on the loading picture goes on beating in step in the game: the wall clock, wrapped at a whole
 * number of beats and of breaths (110 beats = 23 breaths = 101.2 s), so the wrap is not seen. Pure but for the clock. */
export function brainBeatClock(epochMs = Date.now(), o = BRAIN_BEAT) {
  const wrapMs = Math.round(110 * o.beatS * 1000);
  return (((epochMs % wrapMs) + wrapMs) % wrapMs) / 1000;
}

/**
 * The picture. THREE: the three.js module; canvas: a canvas or an OffscreenCanvas; width / height: CSS pixels;
 * pixelRatio: device pixels per CSS pixel (kept at most 1.5: this is a loading picture).
 * Returns { add(kind, parsed), setProgress(fraction, finishing), resize(width, height, pixelRatio), frame(nowMs),
 * dispose(), state() }. add() takes a parseObjBytes result; frame() draws one picture.
 */
export function createAssemblyView({ THREE, canvas, width, height, pixelRatio = 1, options = ASSEMBLY }) {
  const o = options;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(o.fovYDeg, 1, 200, 20000);
  camera.up.set(0, 0, 1);
  scene.add(new THREE.HemisphereLight(0xf2f4ff, 0x1a1418, 1.15));
  const key = new THREE.DirectionalLight(0xfff1e2, 2.4); key.position.set(-900, -2600, 2600); scene.add(key);
  const rim = new THREE.DirectionalLight(0x69b7ff, 1.5); rim.position.set(1400, 2200, 1500); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xff8f7a, 0.5); fill.position.set(1800, -1200, 300); scene.add(fill);

  // The body turns a little about its own upright axis; the large brain is tipped toward the viewer and turns with it.
  const bodyPivot = new THREE.Group(); bodyPivot.position.set(o.bodyCentre[0], o.bodyCentre[1], 0); scene.add(bodyPivot);
  const body = new THREE.Group(); body.position.set(-o.bodyCentre[0], -o.bodyCentre[1], 0); bodyPivot.add(body);
  const brainPivot = new THREE.Group(); brainPivot.position.set(o.brainAt[0], o.brainAt[1], o.brainAt[2]); scene.add(brainPivot);
  // The top of the brain tips toward the viewer, so the motor strip shows.
  const brainTilt = new THREE.Group(); brainTilt.rotation.x = o.brainTiltDeg * Math.PI / 180; brainTilt.scale.setScalar(o.brainScale); brainPivot.add(brainTilt);
  const brain = new THREE.Group(); brain.position.set(-o.brainCentre[0], -o.brainCentre[1], -o.brainCentre[2]); brainTilt.add(brain);

  const base = {};
  for (const k of Object.keys(ASSEMBLY_KINDS)) {
    base[k] = new THREE.MeshStandardMaterial({ color: ASSEMBLY_KINDS[k], roughness: k === 'bone' || k === 'eye' ? 0.5 : 0.42, metalness: 0.02,
      emissive: k === 'strip' ? 0xff2f86 : 0x000000, emissiveIntensity: k === 'strip' ? 0.35 : 0 });
  }
  const flash = { bone: new THREE.Color(0x9fdcff), eye: new THREE.Color(0x9fdcff), muscle: new THREE.Color(0xff7a5c), brain: new THREE.Color(0xffb3c8), strip: new THREE.Color(0xff5fb0) };

  // Progress bar: two thin quads in a screen-space scene.
  const hudScene = new THREE.Scene(), hudCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  const quad = new THREE.PlaneGeometry(1, 1); quad.translate(0.5, 0.5, 0);
  const track = new THREE.Mesh(quad, new THREE.MeshBasicMaterial({ color: 0x2a323c, transparent: true, opacity: 0.7, depthTest: false, toneMapped: false }));
  const barMat = new THREE.MeshBasicMaterial({ color: 0x7fe3ff, transparent: true, opacity: 0.95, depthTest: false, toneMapped: false });
  const bar = new THREE.Mesh(quad, barMat);
  hudScene.add(track, bar);

  const pending = [];  // parsed parts waiting for their turn to start
  const moving = [];   // parts flying in or still flashing
  let W = 1, H = 1, t0 = null, lastMs = 0, parts = 0, triangles = 0, progress = 0, shown = 0, finishing = false, disposed = false, frames = 0;
  const byKind = {};

  function resize(w, h, pr = pixelRatio) {
    W = Math.max(1, Math.floor(w)); H = Math.max(1, Math.floor(h));
    renderer.setPixelRatio(Math.min(1.5, Math.max(0.5, pr || 1)));
    renderer.setSize(W, H, false);
    const aspect = W / H;
    camera.aspect = aspect;
    const half = Math.tan(o.fovYDeg * Math.PI / 360);
    const span = (o.top - o.bottom) / 2, mid = (o.top + o.bottom) / 2;
    const dist = Math.max(span / half, (o.bodyHalfWidth * 1.25) / (half * aspect)) / o.fill;
    camera.position.set(o.bodyCentre[0], o.bodyCentre[1] - dist, mid);
    camera.lookAt(o.bodyCentre[0], o.bodyCentre[1], mid);
    camera.updateProjectionMatrix();
    // bar: 36 % of the width, 3 px tall, 26 px above the bottom edge
    const bw = 0.36, bh = 3 / H, by = 26 / H;
    track.scale.set(bw, bh, 1); track.position.set(0.5 - bw / 2, by, 0);
    bar.position.set(0.5 - bw / 2, by, 0);
  }
  resize(width, height, pixelRatio);

  function add(kind, parsed) {
    if (disposed || !parsed) return;
    const k = Object.prototype.hasOwnProperty.call(ASSEMBLY_KINDS, kind) ? kind : 'muscle';
    const { normals, centre } = meshNormalsAndCentre(parsed.positions, parsed.indices);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(parsed.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    g.setIndex(new THREE.BufferAttribute(parsed.indices, 1));
    pending.push({ kind: k, geometry: g, centre, tris: parsed.indices.length / 3 });
  }

  function start(p, nowS) {
    const inBrain = p.kind === 'brain' || p.kind === 'strip';
    const mat = base[p.kind].clone();
    if (p.kind === 'muscle') mat.color.offsetHSL((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.07);
    const mesh = new THREE.Mesh(p.geometry, mat);
    mesh.frustumCulled = false;
    // Fly-in direction: away from the body's upright axis (from the brain's centre for a brain part), a little upward.
    const c = inBrain ? o.brainCentre : [o.bodyCentre[0], o.bodyCentre[1], p.centre[2]];
    let dx = p.centre[0] - c[0], dy = p.centre[1] - c[1], dz = inBrain ? p.centre[2] - c[2] : 0.25 * (p.centre[2] - o.bodyCentre[2]) / 880;
    const l = Math.hypot(dx, dy, dz);
    if (l < 1e-3) { dx = 0; dy = -1; dz = 0; } else { dx /= l; dy /= l; dz /= l; }
    const reach = (inBrain ? o.flyMm / o.brainScale * 1.6 : o.flyMm) * (0.75 + Math.random() * 0.6);
    (inBrain ? brain : body).add(mesh);
    moving.push({ mesh, kind: p.kind, t: nowS, dir: [dx * reach, dy * reach, dz * reach], rest: mat.emissiveIntensity, restColor: mat.emissive.clone() });
    parts++; triangles += p.tris; byKind[p.kind] = (byKind[p.kind] || 0) + 1;
  }

  function frame(nowMs) {
    if (disposed) return;
    if (t0 === null) t0 = nowMs;
    const t = (nowMs - t0) / 1000, dt = Math.min(0.1, Math.max(0, (nowMs - lastMs) / 1000)); lastMs = nowMs;
    for (let k = 0; k < o.maxStartsPerFrame && pending.length; k++) start(pending.shift(), t);
    for (let k = moving.length - 1; k >= 0; k--) {
      const m = moving[k], u = (t - m.t) / o.flyS, e = easeOut(u), f = Math.max(0, 1 - (t - m.t) / o.flashS);
      m.mesh.position.set(m.dir[0] * (1 - e), m.dir[1] * (1 - e), m.dir[2] * (1 - e));
      m.mesh.scale.setScalar(0.55 + 0.45 * e);
      m.mesh.material.emissive.copy(m.restColor).lerp(flash[m.kind], f);
      m.mesh.material.emissiveIntensity = m.rest + (0.9 - m.rest) * f * f;
      if (u >= 1 && f <= 0) {
        m.mesh.position.set(0, 0, 0); m.mesh.scale.setScalar(1);
        const old = m.mesh.material;
        if (m.kind !== 'muscle') { m.mesh.material = base[m.kind]; old.dispose(); } else { old.emissive.setHex(0x000000); old.emissiveIntensity = 0; }
        moving.splice(k, 1);
      }
    }
    const sway = Math.sin((t / o.swayS) * 2 * Math.PI) * o.swayDeg * Math.PI / 180;
    bodyPivot.rotation.z = sway;
    brainPivot.rotation.z = sway * 0.8;
    // The brain beats (a heartbeat swell on a slow breathing rise and fall), and the strip's light beats with it,
    // brighter once everything is in and the game is being built.
    const pulse = brainBeat(brainBeatClock()); // the shared clock: the game's brain takes the beat over in step
    brainTilt.scale.setScalar(o.brainScale * (1 + BRAIN_BEAT.swell * pulse.beat + BRAIN_BEAT.breathSwell * pulse.breath));
    brainPivot.position.z = o.brainAt[2] + 6 * pulse.breath;
    base.strip.emissiveIntensity = 0.3 + (finishing ? 0.55 : 0.3) * pulse.beat;
    shown += (progress - shown) * Math.min(1, dt * 6);
    bar.scale.set(Math.max(0.0001, 0.36 * shown), 3 / H, 1);
    barMat.opacity = finishing ? 0.55 + 0.4 * (0.5 + 0.5 * Math.sin(t * 6)) : 0.95;
    renderer.autoClear = true;
    renderer.render(scene, camera);
    renderer.autoClear = false;
    renderer.render(hudScene, hudCam);
    frames++;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    scene.traverse(x => { if (x.isMesh) { x.geometry.dispose(); if (x.material && x.material.dispose) x.material.dispose(); } });
    for (const p of pending) p.geometry.dispose();
    for (const k of Object.keys(base)) base[k].dispose();
    quad.dispose(); track.material.dispose(); barMat.dispose();
    renderer.dispose();
  }

  return {
    add, resize, frame, dispose,
    setProgress(fraction, isFinishing = false) { progress = Math.min(1, Math.max(progress, Number.isFinite(fraction) ? fraction : 0)); finishing = isFinishing === true; },
    state: () => ({ parts, triangles, pending: pending.length, moving: moving.length, progress, finishing, width: W, height: H, frames, byKind: { ...byKind } })
  };
}
