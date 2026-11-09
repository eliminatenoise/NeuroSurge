/**
 * ns-camera.mjs: the NeuroSurge camera rig (round 5, R5-camera; lead decision D18; the user's R22: "a third person view
 * so we can view the posterior of the body using the E control key. When you press E, it switches from first person to
 * third person, and if you press E again, it switches vice versa").
 *
 * PURE MATH: no DOM, no THREE, no imports. Everything here runs in plain Node (tests/unit/R5-camera-*.test.mjs).
 *
 * Frames and conventions (the same as ns-scene-three, ns-controls, ns-arm and ns-brain):
 *  - World: metres, +x right, +y up; at body yaw 0 the player faces -z. The FIRST-PERSON eye is at the world origin
 *    (ns-scene-three CAMERA contract); the body is placed around it (ns-math bodyToWorldMatrix: BodyParts3D mm -> world m,
 *    BodyParts3D axes +x subject LEFT, +y POSTERIOR, +z SUPERIOR).
 *  - Look angles (ns-controls): yaw in radians about +y, positive = turn LEFT, never wrapped by the controls; pitch in
 *    radians, positive = look UP. View direction gazeDirection(yaw, pitch) = (-sin yaw cos pitch, sin pitch,
 *    -cos yaw cos pitch), exactly ns-brain gazeDirection. In Three: camera.rotation.set(pitch, yaw, 0, 'YXZ'), i.e. the
 *    camera rotation is Ry(yaw) Rx(pitch).
 *
 * The two views:
 *  - 'first': the head camera of rounds 1-4, unchanged: at the eye (world origin), looking along the controls' look.
 *  - 'third': a camera on a boom behind and a little above the body. The camera always looks THROUGH an orbit centre
 *    a little above the top of the head (THIRD_PERSON.centreFromEyeMm), so the crosshair passes over the head and on to
 *    the brain, and the body (seen from behind: head, shoulders, back) fills the lower middle of the screen. The mouse
 *    turns the boom about that centre (any yaw; pitch limited to THIRD_PERSON.minPitchDeg..maxPitchDeg), so the player
 *    can walk the camera all the way round to see the back and both sides. The camera never enters the body: the boom is
 *    lengthened until the camera is outside every keep-out sphere (the posed body's mesh bounding spheres, or the
 *    DEFAULT_BODY_PROXY), so the near plane (CAMERA.near 0.02 m) never cuts into a mesh.
 *
 * The toggle (E, VIEW_KEY_CODE): the camera eases over THIRD_PERSON.easeS (0.4 s, smoothstep) between the two views; with
 * prefers-reduced-motion it switches at once. The first-person look is never changed by the third-person view, so E then
 * E (no mouse movement) returns EXACTLY. Who keeps the looks: when ns-controls owns the view (R5-input: state.view
 * { mode, yaw, pitch, seq }; the mouse turns the third-person look in third person and the first-person look is frozen),
 * this module only eases between the two (syncView, drive A); with a controls state that has one look only, toggleView
 * stores the first-person look and hands it back (drive B). See createCameraState.
 *
 * What the body and the LEFT ARM do in third person (decision, see round5/R5-camera-NOTES.md):
 *  - They keep the FIRST-PERSON frame they had when E was pressed ("body look", pose.bodyLook): the trunk yaw, the neck
 *    flex, the shoulder and the hand's screen-locked aim do not change when the camera leaves the head.
 *  - W / A / S / D keep moving the hand in that first-person frame (A / D across, W / S away / toward), Space makes the fist
 *    and double-tap Space turns the forearm, exactly as in first person.
 *  - The NDC y +0.5 hand lock ("three quarters up the screen") is a FIRST-PERSON screen rule: in third person it still
 *    holds in the (unseen) first-person view the arm is aimed in, not on the third-person screen.
 *  - Why not let the arm follow the third-person camera: the boom turns all the way round the body; a hand locked to
 *    that screen would have to reach behind the back (outside the shoulder's range) and the body would spin with the
 *    mouse. Keeping the first-person frame means E never moves the body or the arm, and E again returns exactly.
 *
 * Gaze in third person: the crosshair ray starts at the CAMERA (pose.gazeRay), not at the eye. brainSourceRay() turns it
 * into the brain's source-mm frame for ns-brain classifyRegionGaze (with the origin ray it equals ns-brain
 * gazeRayForView to rounding). While the camera moves between views the gaze is SILENT (pose.silentGaze): the area under
 * the crosshair is recorded, never switched on, exactly like an orbit step (round-1 A4: no activation without the
 * player's look or click).
 *
 * Display rules the pose carries for the scene (multipliers 0..1):
 *  - headInPlace: the head and face meshes (ns-scene-three's face group) are drawn IN PLACE, opaque, once the camera is
 *    clear of the head (fades in while the camera is THIRD_PERSON.headClear.startM..fullM outside the head's keep-out
 *    sphere, DEFAULT_BODY_PROXY 'head'), so the ease never flashes a close-up of the inside of the skull;
 *  - faceGhost: the first-person face ghost / inset (looking up) is a first-person-only view: 1 - blend;
 *  - overBrainSeeThrough: the first-person "body see-through where it covers the brain" (BODY_OVER_BRAIN) is off in
 *    third person, which exists to show the back of the body: 1 - blend;
 *  - farExtraM: the camera's distance from the eye, to add to the far plane (ns-scene-three farPlaneFor is measured from
 *    the eye).
 */

export const DEG = Math.PI / 180;

/** The two camera views. */
export const CAMERA_VIEWS = Object.freeze(['first', 'third']);
/** The view key (KeyboardEvent.code, layout independent) and its label for the Esc page / intro. */
export const VIEW_KEY_CODE = 'KeyE';
export const VIEW_KEY_LABEL = 'E';
/** Plain text proposals for ns-text (R17: simple words; the integrator owns ns-text). */
export const VIEW_TEXT = Object.freeze({
  controlsRow: Object.freeze(['E', 'see your body from behind (third person). Press E again to look out of your own eyes']),
  thirdPersonBadge: 'Seen from behind · E: back to your eyes',
  armNote: 'Your left arm keeps the aim it had in your own view: W, A, S, D move the hand the same way as before.'
});

/** The first-person camera: at the eye, the world origin (ns-scene-three CAMERA: PerspectiveCamera(70, aspect, 0.02, far)). */
export const FIRST_PERSON = Object.freeze({ position: Object.freeze([0, 0, 0]), nearM: 0.02 });

/**
 * Third-person rig (display choices, chosen from viewed screenshots: round5/R5-camera-NOTES.md):
 *  - centreFromEyeMm: the orbit centre, from the eye, in BodyParts3D axes (+y posterior, +z superior): 6 cm back (over
 *    the middle of the head) and 19 cm up (about 7 cm over the top of the skull, which is about 12 cm above the eye);
 *  - distanceM: the boom length from that centre;
 *  - E starts third person straight BEHIND the body (yaw = the body's forward). Its pitch aims the crosshair
 *    aimPitchBiasDeg below the line from the orbit centre to the brain's centre (aimAt), so the crosshair is on the
 *    brain on every screen shape (the brain is framed higher on portrait screens) while the body sits low and most of
 *    the brain stays visible over the head; without aimAt it is defaultPitchDeg;
 *  - minPitchDeg / maxPitchDeg: the mouse's pitch range in third person (from high above the head to a little below the
 *    shoulders), equal to ns-controls THIRD_PERSON pitchMinDeg / pitchMaxDeg (R5-input; unit-tested); yaw is free (all
 *    the way round). The keep-out sweep also covered -70 deg (round5/R5-camera-NOTES.md);
 *  - aimAtBrain: false makes the start pitch defaultPitchDeg whatever the brain's place;
 *  - easeS: the toggle's ease time (smoothstep), 0 under reduced motion;
 *  - headClear: the head fades in while the camera is startM..fullM OUTSIDE the head's keep-out sphere (the camera leaves
 *    the eye through the head; at 0.12 m outside the head is about 0.4 of the screen height, at 0.32 m about 0.25);
 *  - clearanceM: the extra gap kept between the camera and any keep-out sphere (3 x the 0.02 m near plane: the near
 *    plane's corners lie up to about 1.9 x near from the camera at a 120 deg vertical FOV);
 *  - maxDistanceM: the longest boom the keep-out rule may use.
 */
export const THIRD_PERSON = Object.freeze({
  centreFromEyeMm: Object.freeze([0, 60, 190]),
  distanceM: 1.4,
  defaultPitchDeg: -18,
  aimPitchBiasDeg: -16,
  aimAtBrain: true,
  minPitchDeg: -60,
  maxPitchDeg: 30,
  easeS: 0.4,
  headClear: Object.freeze({ startM: 0.12, fullM: 0.32 }),
  clearanceM: 0.06,
  maxDistanceM: 4
});

/**
 * A coarse, hand-placed keep-out proxy of the SEATED upper body (BodyParts3D mm relative to the eye, i.e. add eyeBp;
 * radius mm): the FALLBACK when the scene gives no posed-mesh bounding spheres (opts.avoid). Not a measurement. The
 * measured path is the scene's own spheres (round5/R5-camera-NOTES.md: 369 posed body / face / arm spheres; with them the
 * shipped boom kept >= 0.498 m and a forced 0.45 m boom >= 0.073 m from every drawn vertex). The 'head' sphere also
 * decides when the head is drawn in place (headInPlace); the eye lies inside it and the measured face meshes reach
 * about 6 cm behind the eye (this packet has no parietal or occipital bone).
 */
export const DEFAULT_BODY_PROXY = Object.freeze([
  Object.freeze({ name: 'head', centreFromEyeMm: Object.freeze([0, 70, 10]), radiusMm: 125 }),
  Object.freeze({ name: 'neck', centreFromEyeMm: Object.freeze([0, 80, -140]), radiusMm: 85 }),
  Object.freeze({ name: 'chest', centreFromEyeMm: Object.freeze([0, 90, -360]), radiusMm: 215 }),
  Object.freeze({ name: 'belly', centreFromEyeMm: Object.freeze([0, 90, -620]), radiusMm: 190 }),
  Object.freeze({ name: 'hips', centreFromEyeMm: Object.freeze([0, 60, -830]), radiusMm: 200 }),
  Object.freeze({ name: 'right shoulder', centreFromEyeMm: Object.freeze([-190, 90, -250]), radiusMm: 110 }),
  Object.freeze({ name: 'left shoulder', centreFromEyeMm: Object.freeze([190, 90, -250]), radiusMm: 110 })
]);

const fail = (code, message) => { throw new Error(`ns:${code}: ${message}`); };
const isNum = x => typeof x === 'number' && Number.isFinite(x);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const isVec3 = v => (Array.isArray(v) || ArrayBuffer.isView(v)) && v.length === 3 && isNum(v[0]) && isNum(v[1]) && isNum(v[2]);
const vec3 = (v, name) => { if (!isVec3(v)) fail('camera_input', `${name} must be a finite [x, y, z]`); return [v[0], v[1], v[2]]; };
const isLook = l => Boolean(l) && isNum(l.yaw) && isNum(l.pitch);
const lookOf = (l, name) => { if (!isLook(l)) fail('camera_input', `${name} must be { yaw, pitch } in finite radians`); return { yaw: l.yaw, pitch: l.pitch }; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a); return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : fail('camera_input', 'zero-length direction'); };
const isMat4 = m => (Array.isArray(m) || ArrayBuffer.isView(m)) && m.length === 16 && Array.prototype.every.call(m, isNum);

/** Angle wrapped to (-pi, pi]. */
export function wrapAngle(a) {
  if (!isNum(a)) fail('camera_input', 'angle must be finite');
  let w = Math.atan2(Math.sin(a), Math.cos(a));
  if (w === -Math.PI) w = Math.PI;
  return w;
}

/** The toggle's ease: smoothstep 3p^2 - 2p^3 (p clamped to 0..1); ease(0) = 0, ease(1) = 1 exactly. */
export function easeView(p) {
  const t = clamp(isNum(p) ? p : 0, 0, 1);
  return t * t * (3 - 2 * t);
}

/** smoothstep(e0, e1, x) in 0..1. */
function smooth(e0, e1, x) {
  if (!(e1 > e0)) return x >= e1 ? 1 : 0;
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** View direction for a look (unit), exactly ns-brain gazeDirection. */
export function gazeDirection(yaw, pitch) {
  if (!isNum(yaw) || !isNum(pitch)) fail('camera_input', 'yaw and pitch must be finite');
  const cp = Math.cos(pitch);
  return [0 - Math.sin(yaw) * cp, Math.sin(pitch), 0 - Math.cos(yaw) * cp];
}

/** Look angles of a direction (the inverse of gazeDirection; yaw in (-pi, pi]). */
export function lookOfDirection(dir) {
  const d = norm(vec3(dir, 'dir'));
  return { yaw: Math.atan2(-d[0], -d[2]), pitch: Math.asin(clamp(d[1], -1, 1)) };
}

/** Camera rotation Ry(yaw) Rx(pitch) as a column-major 3x3 (columns: right, up, back = -view direction). */
export function cameraRotation(yaw, pitch) {
  if (!isNum(yaw) || !isNum(pitch)) fail('camera_input', 'yaw and pitch must be finite');
  const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
  // right = (cy, 0, -sy); up = (sy sp, cp, cy sp); back = (sy cp, -sp, cy cp)
  return [cy, 0, -sy, sy * sp, cp, cy * sp, sy * cp, -sp, cy * cp];
}

/** Column-major 4x4 times a point. */
export function transformPoint(m, p) {
  if (!isMat4(m)) fail('camera_input', 'matrix must be a finite column-major 4x4');
  const q = vec3(p, 'point');
  return [m[0] * q[0] + m[4] * q[1] + m[8] * q[2] + m[12], m[1] * q[0] + m[5] * q[1] + m[9] * q[2] + m[13], m[2] * q[0] + m[6] * q[1] + m[10] * q[2] + m[14]];
}

/** Uniform scale of a column-major 4x4's linear part (the length of its first column; 0.001 for bodyToWorld). */
function matScale(m) { return Math.hypot(m[0], m[1], m[2]); }

/** The body's forward yaw (rad) from a bodyToWorld matrix: the world direction of the anterior (-y BodyParts3D) axis
 * projected on the floor (as ns-scene-three setBodyFrame); 0 for a body facing -z. */
export function bodyForwardYaw(bodyToWorld) {
  if (!isMat4(bodyToWorld)) fail('camera_input', 'bodyToWorld must be a finite column-major 4x4');
  const ax = -bodyToWorld[4], az = -bodyToWorld[6];
  return Math.hypot(ax, az) > 1e-12 ? Math.atan2(-ax, -az) : 0;
}

/** World position of the third-person orbit centre: bodyToWorld (eyeBp + centreFromEyeMm). Without a body frame: the
 * eye-relative offset in an upright body facing -z (0.001 m per mm). */
export function orbitCentreWorld(bodyToWorld, eyeBp, { centreFromEyeMm = THIRD_PERSON.centreFromEyeMm } = {}) {
  const off = vec3(centreFromEyeMm, 'centreFromEyeMm');
  if (bodyToWorld == null) return [-off[0] * 0.001, off[2] * 0.001, off[1] * 0.001];
  const e = vec3(eyeBp, 'eyeBp');
  return transformPoint(bodyToWorld, [e[0] + off[0], e[1] + off[1], e[2] + off[2]]);
}

/** DEFAULT_BODY_PROXY placed in the world: [{ name, centre (m), radius (m) }]. */
export function bodyProxyWorld(bodyToWorld, eyeBp, proxy = DEFAULT_BODY_PROXY) {
  if (!Array.isArray(proxy)) fail('camera_input', 'proxy must be an array');
  const e = bodyToWorld == null ? null : vec3(eyeBp, 'eyeBp');
  const s = bodyToWorld == null ? 0.001 : matScale(bodyToWorld);
  return proxy.map(p => {
    const c = vec3(p.centreFromEyeMm, 'proxy.centreFromEyeMm');
    const centre = e === null ? [-c[0] * 0.001, c[2] * 0.001, c[1] * 0.001] : transformPoint(bodyToWorld, [e[0] + c[0], e[1] + c[1], e[2] + c[2]]);
    return { name: p.name, centre, radius: p.radiusMm * s };
  });
}

/** Clamp a look to the third-person pitch range (yaw untouched, never wrapped). */
export function clampThirdLook(look, { minPitchDeg = THIRD_PERSON.minPitchDeg, maxPitchDeg = THIRD_PERSON.maxPitchDeg } = {}) {
  const l = lookOf(look, 'look');
  return { yaw: l.yaw, pitch: clamp(l.pitch, minPitchDeg * DEG, maxPitchDeg * DEG) };
}

/**
 * Smallest boom length t >= distance whose camera (centre - t dir) lies outside every keep-out sphere grown by
 * clearance. Spheres: [{ centre: [x, y, z] m, radius m }]. Returns { distance, pushed (m added), blocked (true when the
 * rule needed more than maxDistance; the camera then stays at maxDistance) }.
 */
export function boomDistance(centre, dir, distance, avoid = [], { clearanceM = THIRD_PERSON.clearanceM, maxDistanceM = THIRD_PERSON.maxDistanceM } = {}) {
  const o = vec3(centre, 'centre'), d = norm(vec3(dir, 'dir'));
  if (!(isNum(distance) && distance > 0)) fail('camera_input', 'distance must be > 0');
  if (!Array.isArray(avoid)) fail('camera_input', 'avoid must be an array of { centre, radius }');
  let t = distance;
  // Each pass moves t to the far exit of every sphere it is inside; t only grows, so this ends (a sphere once exited
  // along the boom is never re-entered further out). Bounded by the sphere count + 1 passes.
  for (let pass = 0; pass <= avoid.length; pass++) {
    let moved = false;
    for (const s of avoid) {
      if (!s || !isVec3(s.centre) || !(isNum(s.radius) && s.radius >= 0)) continue;
      const rho = s.radius + clearanceM;
      const oc = sub(o, s.centre);
      // |o - c - t d|^2 = rho^2  ->  t^2 - 2 t (d . oc) + |oc|^2 - rho^2 = 0
      const b = dot(d, oc), c = dot(oc, oc) - rho * rho, disc = b * b - c;
      if (disc <= 0) continue;
      const root = Math.sqrt(disc), tExit = b + root, tEnter = b - root;
      if (t < tExit && t > tEnter) { t = tExit + 1e-9; moved = true; }
    }
    if (!moved) break;
  }
  if (t > maxDistanceM) return { distance: maxDistanceM, pushed: maxDistanceM - distance, blocked: true };
  return { distance: t, pushed: t - distance, blocked: false };
}

/**
 * The third-person camera for a look: it looks along gazeDirection(look) THROUGH the orbit centre, from the boom's end
 * (centre - distance x direction), with the boom lengthened out of every keep-out sphere (boomDistance). Returns
 * { position, yaw, pitch (the clamped look), direction, distance, pushed, blocked }.
 */
export function thirdPersonCamera(look, centre, { distanceM = THIRD_PERSON.distanceM, avoid = [], clearanceM = THIRD_PERSON.clearanceM,
  maxDistanceM = THIRD_PERSON.maxDistanceM, minPitchDeg = THIRD_PERSON.minPitchDeg, maxPitchDeg = THIRD_PERSON.maxPitchDeg } = {}) {
  const l = clampThirdLook(look, { minPitchDeg, maxPitchDeg });
  const o = vec3(centre, 'centre');
  const dir = gazeDirection(l.yaw, l.pitch);
  const boom = boomDistance(o, dir, distanceM, avoid, { clearanceM, maxDistanceM });
  const position = [o[0] - boom.distance * dir[0], o[1] - boom.distance * dir[1], o[2] - boom.distance * dir[2]];
  return { position, yaw: l.yaw, pitch: l.pitch, direction: dir, distance: boom.distance, pushed: boom.pushed, blocked: boom.blocked };
}

/** The look E starts third person with: the body's forward yaw (unwrapped next to the body look's yaw, so the controls'
 * yaw never jumps by a whole turn); the pitch of the line from the orbit centre to aimAt (the brain's centre, world m)
 * plus aimPitchBiasDeg, or defaultPitchDeg without aimAt; clamped to the third-person pitch range. */
export function defaultThirdLook(bodyLook, bodyToWorld = null, { eyeBp = null, aimAt = null, defaultPitchDeg = THIRD_PERSON.defaultPitchDeg,
  aimPitchBiasDeg = THIRD_PERSON.aimPitchBiasDeg, centreFromEyeMm = THIRD_PERSON.centreFromEyeMm,
  minPitchDeg = THIRD_PERSON.minPitchDeg, maxPitchDeg = THIRD_PERSON.maxPitchDeg } = {}) {
  const b = lookOf(bodyLook, 'bodyLook');
  const fwd = bodyToWorld == null ? 0 : bodyForwardYaw(bodyToWorld);
  let pitch = defaultPitchDeg * DEG;
  if (isVec3(aimAt) && (bodyToWorld == null || isVec3(eyeBp))) {
    const v = sub(aimAt, orbitCentreWorld(bodyToWorld, eyeBp, { centreFromEyeMm }));
    if (len(v) > 1e-9) pitch = Math.atan2(v[1], Math.hypot(v[0], v[2])) + aimPitchBiasDeg * DEG;
  }
  return { yaw: b.yaw + wrapAngle(fwd - b.yaw), pitch: clamp(pitch, minPitchDeg * DEG, maxPitchDeg * DEG) };
}

/* ------------------------------------------------------------------ state machine */

/**
 * Camera state (plain, frozen):
 *  - view: the TARGET view ('first' | 'third');
 *  - progress: 0 (at the eye) .. 1 (third person), moved by stepCamera toward the view;
 *  - fpLook / tpLook: only for the SELF-CONTAINED drive (toggleView, one controls look): the first-person look stored on
 *    entering third person, and the third-person look frozen on leaving it (the camera eases back from it); null when the
 *    controls own both looks (syncView, ns-controls R5-input) or when not needed;
 *  - arrived: true for the one step on which progress reached the view (a silent-gaze frame);
 *  - toggles: number of view changes (a counter for QA / e2e).
 *
 * Two ways to drive it (the integrator picks one; both are unit-tested):
 *  A. ns-controls owns the view (R5-input: state.view { mode, yaw, pitch, seq }, viewMode / viewLook / armLook): every
 *     frame cam = syncView(cam, controls.viewMode(cs)); cam = stepCamera(cam, dt, { reducedMotion });
 *     pose = cameraPose(cam, { bodyLook: controls.armLook(cs), thirdLook: { yaw: cs.view.yaw, pitch: cs.view.pitch }, ... }).
 *  B. self-contained (controls with one look only): on E, r = toggleView(cam, { look, ... }); cam = r.state and the
 *     controls' look := r.controlsLook; every frame stepCamera, then cameraPose(cam, { look: controls look, ... }).
 */
export function createCameraState({ view = 'first' } = {}) {
  if (!CAMERA_VIEWS.includes(view)) fail('camera_input', `view must be one of ${CAMERA_VIEWS.join(', ')}`);
  // A state may start in third person only when the controls own both looks (drive A); the camera is then already there.
  return Object.freeze({ kind: 'ns-camera-state', view, progress: view === 'third' ? 1 : 0, fpLook: null, tpLook: null, arrived: false, toggles: 0 });
}

const checkState = s => { if (!s || s.kind !== 'ns-camera-state') fail('camera_state', 'state must come from createCameraState / toggleView / syncView / stepCamera'); return s; };

/**
 * Drive A: follow the controls' view mode ('first' | 'third', ns-controls viewMode). A change starts the ease from where
 * the camera is now (a quick E E turns the camera back mid-way, never jumps). The controls keep both looks.
 */
export function syncView(state, mode) {
  const s = checkState(state);
  if (!CAMERA_VIEWS.includes(mode)) fail('camera_input', `mode must be one of ${CAMERA_VIEWS.join(', ')}`);
  if (mode === s.view) return s;
  return Object.freeze({ ...s, view: mode, fpLook: null, tpLook: null, arrived: false, toggles: s.toggles + 1 });
}

/**
 * Drive B: E pressed. look: the controls' current { yaw, pitch }; bodyToWorld / eyeBp: the current body frame (the
 * body's forward, the orbit centre); aimAt: the brain's centre in world m (ns-brain view pivotWorld) for the start pitch;
 * blocked: true to ignore the key (e.g. while Space drags the brain, or while paused).
 * Returns { state, controlsLook, changed }: the app must set the controls' look to controlsLook (ns-controls state yaw /
 * pitch) when changed is true:
 *  - first -> third: fpLook := look; controlsLook = the start third-person look (defaultThirdLook) or, while the camera
 *    is still easing back from third person, the third-person look it is leaving (so the camera simply turns round);
 *  - third -> first: tpLook := the clamped look; controlsLook = the stored fpLook EXACTLY (return exactly).
 */
export function toggleView(state, { look, bodyToWorld = null, eyeBp = null, aimAt = null, blocked = false, rig = THIRD_PERSON } = {}) {
  const r = { ...THIRD_PERSON, ...(rig || {}) };
  const { minPitchDeg, maxPitchDeg } = r;
  const s = checkState(state);
  const l = lookOf(look, 'look');
  if (blocked === true) return { state: s, controlsLook: l, changed: false };
  if (s.view === 'first') {
    const back = s.progress > 0 && isLook(s.tpLook) ? { yaw: s.tpLook.yaw, pitch: s.tpLook.pitch } : null;
    const tp = back || defaultThirdLook(l, bodyToWorld, { eyeBp, aimAt: r.aimAtBrain === false ? null : aimAt, defaultPitchDeg: r.defaultPitchDeg,
      aimPitchBiasDeg: r.aimPitchBiasDeg, centreFromEyeMm: r.centreFromEyeMm, minPitchDeg, maxPitchDeg });
    return {
      state: Object.freeze({ ...s, view: 'third', fpLook: Object.freeze({ yaw: l.yaw, pitch: l.pitch }), tpLook: null, arrived: false, toggles: s.toggles + 1 }),
      controlsLook: clampThirdLook(tp, { minPitchDeg, maxPitchDeg }),
      changed: true
    };
  }
  const fp = isLook(s.fpLook) ? { yaw: s.fpLook.yaw, pitch: s.fpLook.pitch } : l;
  const tp = clampThirdLook(l, { minPitchDeg, maxPitchDeg });
  return {
    state: Object.freeze({ ...s, view: 'first', fpLook: null, tpLook: Object.freeze(tp), arrived: false, toggles: s.toggles + 1 }),
    controlsLook: fp,
    changed: true
  };
}

/** Back to first person at once (e.g. a restart): progress 0; controlsLook = the stored first-person look (drive B) or
 * the given look. */
export function resetCamera(state, { look } = {}) {
  const s = checkState(state);
  const fp = s.view === 'third' && isLook(s.fpLook) ? { yaw: s.fpLook.yaw, pitch: s.fpLook.pitch } : isLook(look) ? { yaw: look.yaw, pitch: look.pitch } : null;
  return { state: Object.freeze({ ...s, view: 'first', progress: 0, fpLook: null, tpLook: null, arrived: false }), controlsLook: fp, changed: s.view !== 'first' || s.progress !== 0 };
}

/**
 * Advance the toggle's ease by dtS seconds (non-finite or negative dt counts as 0). reducedMotion (or easeS <= 0) jumps
 * to the view at once. Sets arrived on the step that reaches the view; clears tpLook once back at the eye.
 */
export function stepCamera(state, dtS, { reducedMotion = false, easeS = THIRD_PERSON.easeS } = {}) {
  const s = checkState(state);
  const target = s.view === 'third' ? 1 : 0;
  if (s.progress === target) return s.arrived ? Object.freeze({ ...s, arrived: false }) : s;
  const dt = isNum(dtS) && dtS > 0 ? dtS : 0;
  let p;
  if (reducedMotion === true || !(easeS > 0)) p = target;
  else {
    const stepP = dt / easeS;
    p = target > s.progress ? Math.min(target, s.progress + stepP) : Math.max(target, s.progress - stepP);
    if (Math.abs(target - p) < 1e-9) p = target;
  }
  const arrived = p === target;
  return Object.freeze({ ...s, progress: p, arrived, tpLook: arrived && target === 0 ? null : s.tpLook });
}

/** Drive B: the controls' look kept inside the current view's limits: third person clamps the pitch (so the mouse has
 * no dead zone at the limit); first person is unchanged (ns-controls' own +/- 80 deg). */
export function constrainLook(state, look, { minPitchDeg = THIRD_PERSON.minPitchDeg, maxPitchDeg = THIRD_PERSON.maxPitchDeg } = {}) {
  const s = checkState(state);
  const l = lookOf(look, 'look');
  return s.view === 'third' ? clampThirdLook(l, { minPitchDeg, maxPitchDeg }) : l;
}

/**
 * The camera for this frame.
 * @param state from createCameraState / syncView / toggleView / stepCamera
 * @param opts drive A: bodyLook (ns-controls armLook: the first-person look) and thirdLook (ns-controls state.view yaw /
 *   pitch: the third-person look, kept by the controls in both views); drive B: look (the controls' one look).
 * @param opts.bodyToWorld the body frame (BodyParts3D mm -> world m; ns-arm armAttachment(...).bodyToWorld, the matrix
 *   given to ns-scene-three setBodyFrame); opts.eyeBp the eye in BodyParts3D mm (the same anatomy.eyeBp); without them
 *   the orbit centre and proxy assume an upright body facing -z with the eye at the origin
 * @param opts.avoid keep-out spheres [{ centre, radius }] in world m (the posed body's mesh bounding spheres); default:
 *   DEFAULT_BODY_PROXY placed with the body frame
 * @param opts.rig THIRD_PERSON overrides
 * @returns frozen {
 *   view, progress, blend (eased 0..1), firstPerson (blend 0 and settled in first person: every first-person rule
 *   applies and the pose is the round-4 camera bit for bit), thirdPerson (blend 1), moving (between the views),
 *   position [x, y, z] m, yaw, pitch (camera orientation: rotation.set(pitch, yaw, 0, 'YXZ')), direction (unit),
 *   bodyLook { yaw, pitch }: the look the SIMULATION must use for the body, the shoulder and the hand (ns-app stepFrame
 *     inputs.yaw / pitch): always the first-person look;
 *   gazeLook { yaw, pitch }: the camera's own look (brain grab carry, the activity's look deadband);
 *   gazeRay { origin, dir } in world m (the crosshair ray from the camera);
 *   silentGaze: true while moving and on the arrival step (the region under the crosshair is recorded silently);
 *   headInPlace, faceGhost, overBrainSeeThrough (0..1 multipliers, see the header), farExtraM, nearM,
 *   orbitCentre, boom { distance, pushed, blocked } (third-person side, or null in pure first person) }
 */
export function cameraPose(state, { look = null, bodyLook = null, thirdLook = null, bodyToWorld = null, eyeBp = null, avoid = null, rig = THIRD_PERSON } = {}) {
  const s = checkState(state);
  const driveA = isLook(bodyLook) && isLook(thirdLook);
  if (!driveA && !isLook(look)) fail('camera_input', 'cameraPose needs { bodyLook, thirdLook } (controls own the view) or { look }');
  if (bodyToWorld != null && !isMat4(bodyToWorld)) fail('camera_input', 'bodyToWorld must be a finite column-major 4x4');
  if (bodyToWorld != null && !isVec3(eyeBp)) fail('camera_input', 'eyeBp is required with bodyToWorld');
  const r = { ...THIRD_PERSON, ...(rig || {}) };
  const blend = easeView(s.progress);
  const target = s.view === 'third' ? 1 : 0;
  // Silent while the camera has not settled on its view (also the toggle frame itself when dt is 0) and on the arrival
  // step: the crosshair sweeps across the brain without the player aiming.
  const silentGaze = s.arrived === true || s.progress !== target;
  let fp, tpLook;
  if (driveA) { fp = { yaw: bodyLook.yaw, pitch: bodyLook.pitch }; tpLook = clampThirdLook(thirdLook, r); }
  else {
    const live = { yaw: look.yaw, pitch: look.pitch };
    fp = s.view === 'third' && isLook(s.fpLook) ? { yaw: s.fpLook.yaw, pitch: s.fpLook.pitch } : live;
    tpLook = s.view === 'third' ? clampThirdLook(live, r) : isLook(s.tpLook) ? clampThirdLook(s.tpLook, r) : null;
  }
  if (s.progress === 0 || tpLook === null) {
    const dir = gazeDirection(fp.yaw, fp.pitch);
    return Object.freeze({
      view: s.view, progress: s.progress, blend: 0, firstPerson: s.view === 'first', thirdPerson: false, moving: s.progress !== target,
      position: [0, 0, 0], yaw: fp.yaw, pitch: fp.pitch, direction: dir,
      bodyLook: fp, gazeLook: fp, gazeRay: { origin: [0, 0, 0], dir },
      silentGaze, headInPlace: 0, faceGhost: 1, overBrainSeeThrough: 1, farExtraM: 0, nearM: FIRST_PERSON.nearM,
      orbitCentre: null, boom: null
    });
  }
  const centre = orbitCentreWorld(bodyToWorld, eyeBp, r);
  const keepOut = Array.isArray(avoid) ? avoid : bodyProxyWorld(bodyToWorld, eyeBp);
  const tp = thirdPersonCamera(tpLook, centre, { ...r, avoid: keepOut });
  let yaw, pitch;
  if (blend >= 1) { yaw = tp.yaw; pitch = tp.pitch; }
  else { yaw = fp.yaw + blend * wrapAngle(tp.yaw - fp.yaw); pitch = fp.pitch + blend * (tp.pitch - fp.pitch); }
  const position = [blend * tp.position[0], blend * tp.position[1], blend * tp.position[2]];
  const dir = gazeDirection(yaw, pitch);
  const fromEye = len(position);
  const head = bodyProxyWorld(bodyToWorld, eyeBp, [DEFAULT_BODY_PROXY[0]])[0];
  const outsideHead = len(sub(position, head.centre)) - head.radius;
  const headInPlace = smooth(r.headClear.startM, r.headClear.fullM, outsideHead);
  return Object.freeze({
    view: s.view, progress: s.progress, blend, firstPerson: false, thirdPerson: blend >= 1, moving: s.progress !== target,
    position, yaw, pitch, direction: dir,
    bodyLook: fp, gazeLook: { yaw, pitch }, gazeRay: { origin: position.slice(), dir },
    silentGaze, headInPlace, faceGhost: 1 - blend, overBrainSeeThrough: 1 - blend, farExtraM: fromEye, nearM: FIRST_PERSON.nearM,
    orbitCentre: centre, boom: { distance: tp.distance, pushed: tp.pushed, blocked: tp.blocked }
  });
}

/* ------------------------------------------------------------------ rays and projection for any camera position */

/**
 * A world ray (e.g. pose.gazeRay) in the brain's SOURCE mm frame under an ns-brain brainViewTransform view (its
 * column-major `inverse`, squash included): { origin, dir (unit) }. With the origin ray of a first-person look this is
 * ns-brain gazeRayForView(yaw, pitch, view) to rounding (unit test).
 */
export function brainSourceRay(ray, view) {
  if (!ray) fail('camera_input', 'ray must be { origin, dir }');
  if (!view || !isMat4(view.inverse)) fail('camera_input', 'view must be an ns-brain brainViewTransform result (with `inverse`)');
  const o = vec3(ray.origin, 'ray.origin'), d = vec3(ray.dir, 'ray.dir'), m = view.inverse;
  const origin = transformPoint(m, o);
  const dir = norm([m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]]);
  return { origin, dir };
}

/**
 * The look that puts a world point under the crosshair. Third person: the crosshair ray always passes through the orbit
 * centre (the camera looks THROUGH it), so the look is simply the direction from the orbit centre to the point, whatever
 * the boom length or a keep-out push (exact; QA / e2e aiming: a first-person "rotate the camera by the NDC angle" helper
 * is NOT exact here, because turning the look also swings the camera round the body). First person (pose.orbitCentre
 * null): the direction from the eye (the world origin). The yaw is unwrapped next to `nearYaw` (default the pose's yaw).
 */
export function aimLook(point, pose, { nearYaw = null } = {}) {
  const p = vec3(point, 'point');
  const from = pose && isVec3(pose.orbitCentre) ? pose.orbitCentre : [0, 0, 0];
  const l = lookOfDirection(sub(p, from));
  const ref = isNum(nearYaw) ? nearYaw : pose && isNum(pose.yaw) ? pose.yaw : 0;
  return { yaw: ref + wrapAngle(l.yaw - ref), pitch: l.pitch };
}

/** World ray through screen point (xNdc, yNdc) (x right, y up, -1..1) of a pose's camera: { origin, dir }. */
export function pixelRay(pose, xNdc, yNdc, { fovYDeg = 70, aspect } = {}) {
  if (!pose || !isVec3(pose.position) || !isNum(pose.yaw) || !isNum(pose.pitch)) fail('camera_input', 'pose must come from cameraPose');
  if (!isNum(xNdc) || !isNum(yNdc)) fail('camera_input', 'xNdc and yNdc must be finite');
  if (!(isNum(aspect) && aspect > 0)) fail('camera_input', 'aspect must be > 0');
  if (!(isNum(fovYDeg) && fovYDeg > 0 && fovYDeg < 180)) fail('camera_input', 'fovYDeg must be in (0, 180)');
  const t = Math.tan((fovYDeg * DEG) / 2);
  const R = cameraRotation(pose.yaw, pose.pitch);
  const c = norm([xNdc * t * aspect, yNdc * t, -1]);
  const dir = norm([R[0] * c[0] + R[3] * c[1] + R[6] * c[2], R[1] * c[0] + R[4] * c[1] + R[7] * c[2], R[2] * c[0] + R[5] * c[1] + R[8] * c[2]]);
  return { origin: [pose.position[0], pose.position[1], pose.position[2]], dir };
}

/** Screen NDC of a world point for a pose's camera: { x, y (up), depth (along the view axis, m; <= 0 behind) }. */
export function projectToNdc(pose, point, { fovYDeg = 70, aspect } = {}) {
  if (!pose || !isVec3(pose.position) || !isNum(pose.yaw) || !isNum(pose.pitch)) fail('camera_input', 'pose must come from cameraPose');
  if (!(isNum(aspect) && aspect > 0)) fail('camera_input', 'aspect must be > 0');
  const w = sub(vec3(point, 'point'), pose.position);
  const R = cameraRotation(pose.yaw, pose.pitch); // camera-from-world = R^T
  const cx = R[0] * w[0] + R[1] * w[1] + R[2] * w[2], cy = R[3] * w[0] + R[4] * w[1] + R[5] * w[2], cz = R[6] * w[0] + R[7] * w[1] + R[8] * w[2];
  const t = Math.tan((fovYDeg * DEG) / 2), depth = -cz;
  return { x: cx / (depth * t * aspect), y: cy / (depth * t), depth };
}

/** Nearest hit distance (m) of a ray with a list of spheres [{ centre, radius }], or Infinity. For a coarse "is the body
 * in front of the brain" test; the scene's mesh raycast is the exact one. */
export function raySpheresHit(ray, spheres) {
  const o = vec3(ray && ray.origin, 'ray.origin'), d = norm(vec3(ray && ray.dir, 'ray.dir'));
  let best = Infinity;
  for (const s of spheres || []) {
    if (!s || !isVec3(s.centre) || !(isNum(s.radius) && s.radius >= 0)) continue;
    const oc = sub(o, s.centre), b = dot(d, oc), c = dot(oc, oc) - s.radius * s.radius, disc = b * b - c;
    if (disc < 0) continue;
    const root = Math.sqrt(disc);
    const t = -b - root >= 0 ? -b - root : -b + root >= 0 ? 0 : Infinity; // inside the sphere: hit at 0
    if (t < best) best = t;
  }
  return best;
}

/** Plain JSON for the QA snapshot (`camera`). */
export function cameraSnapshot(state, pose = null) {
  const s = checkState(state);
  const r6 = x => Math.round(x * 1e6) / 1e6;
  const look = l => (isLook(l) ? { yaw: r6(l.yaw), pitch: r6(l.pitch) } : null);
  return {
    view: s.view, progress: r6(s.progress), toggles: s.toggles, fpLook: look(s.fpLook), tpLook: look(s.tpLook),
    pose: pose ? {
      blend: r6(pose.blend), firstPerson: pose.firstPerson, thirdPerson: pose.thirdPerson, moving: pose.moving,
      position: pose.position.map(r6), yaw: r6(pose.yaw), pitch: r6(pose.pitch), bodyLook: look(pose.bodyLook), gazeLook: look(pose.gazeLook),
      silentGaze: pose.silentGaze, headInPlace: r6(pose.headInPlace), faceGhost: r6(pose.faceGhost), overBrainSeeThrough: r6(pose.overBrainSeeThrough),
      farExtraM: r6(pose.farExtraM), boom: pose.boom ? { distance: r6(pose.boom.distance), pushed: r6(pose.boom.pushed), blocked: pose.boom.blocked } : null,
      // QA / e2e aiming in third person: aimLook(point, { orbitCentre, yaw }) (the crosshair ray passes this point).
      orbitCentre: Array.isArray(pose.orbitCentre) ? pose.orbitCentre.map(r6) : null
    } : null
  };
}
