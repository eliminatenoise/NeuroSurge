/** NeuroSurge scene: THE ROOM (owner, 18 November 2026: "And perhaps something should be done about the endless black
 * space."; 11 November: "Everything should look clinical and surgical."; Message 24: "I liked the space black
 * background"; Message 25: "Contrast and high dynamic range are still visually key").
 *
 * The brain, your body and the mirror body used to hang in a flat black void. They now hang in a PLACE: a very large,
 * round, dark operating theatre seen out of focus. Far below there is a tiled floor with a soft pool of surgical light
 * on it; round the pool the floor falls away into the dark; very far off a faint band of light at the foot of the wall
 * gives a horizon; high overhead, a little ahead of straight up, hang the soft lights of the lamp heads (they show
 * which way is up and are in the picture only when you look up); the air round the brain and round a body seen from
 * outside is faintly lit (a soft halo), and each of the three casts a soft shadow on the floor. It is still a dark
 * picture: away from the pool, the lamps and the three things the room is the old
 * space black (ROOM.black is the old background colour), so the glows keep their contrast.
 *
 * One shader on one full-screen triangle, drawn at the far depth after the solid things (so it is shaded only where
 * nothing covers it). No texture, no shadow map, no extra pass. (There was dust, as a few hundred points: far motes
 * were too faint to see and near ones read as stars in a black sky, the very thing the room is there to end; it is
 * gone.) The room is
 * fixed in the world: it has a floor and a ceiling whichever way you look, and it shifts properly when the view
 * point moves (the view from outside).
 *
 * A PICTURE OF A PLACE and nothing more: it is not a model of a real theatre, its sizes are chosen for the eye (the
 * brain is drawn many metres across, so the room is a hall), and nothing here is measured.
 *
 * Under prefers-reduced-motion the light does not change at all (no beat, no answer to a movement).
 */

/** Display choices (metres in the game's world: +y up, the eye near the origin, the look starts along -z).
 *  floorY / ceilY: the floor's and the lamp plane's height; wallR: the wall's radius about the light's axis (far: its
 *    foot is a nearly straight horizon a few degrees under eye level).
 *  centre: where the light's axis stands (x, z) until the scene gives the brain's first place (setCentre); the
 *    brain's pivot starts 7.5 m ahead (ns-app), so this is also where the loading picture puts it.
 *  bodyAt: about where your own body's middle is (for its floor shadow and its halo).
 *  black: the darkest the room gets (linear light) = the old flat background 0x05070b.
 *  pool: the light on the floor: `colour` (linear light at the middle), `radiusM` (falls to 37 % there), `amb` (the
 *    share of it that reaches the whole floor).
 *  tile: square tiles `sizeM` across with grout `groutM` wide that is `dark` of the tile's light darker.
 *  wall: `colour` at the foot of the wall, fading with height (`heightM` to 37 %); a slow unevenness round the room
 *    (`lobes` broad soft patches, `uneven` of the light deep). No folds: fine upright lines fan out into rays in a
 *    wide picture that looks down.
 *  lamps: lamp heads on the ceiling plane, places relative to the centre: [x, z, radius, gain]. They hang round the
 *    point straight above the eye (the eye starts about 7.5 m behind the centre), so each is more than 60 degrees up:
 *    never in a level look, whichever way you turn. lamp: a light out of focus: a hot `core` (`coreR` radii wide), a
 *    soft `disc` round it (from `discIn` to `discOut` radii) and a wide faint `halo` (`haloR` radii); no dark middle.
 *  gloss: the floor mirrors the foot of the wall (`wall`): `f0` straight down, rising to 1 at a grazing look.
 *  aura: the lit air round a thing: [light (linear), spread (in the thing's radii), core (in radii: the light is
 *    full out to there and falls off beyond over `spread`)] for the brain, the mirror body and your own body. The
 *    brain's is a rim: full at its outline (core 1) and gone a third of its size farther out, so the room stays
 *    black beyond; a body's is a soft patch behind the figure (core 0); `colour` its tint; a thing's own radius when the scene gives none (`radii`). The
 *    halo follows the thing, and it is not drawn for a thing the view point is inside (your own body from the eyes).
 *  shade: soft shadows on the floor under the brain / the mirror body / your own body: [radius (m), depth (0..1)];
 *    the brain's is `brainK` times the brain's own widest level half-width when the scene gives that.
 *  live: the light is `beat` brighter at the top of a heartbeat (the beat is first softened over `beatS` seconds,
 *    so it swells and does not flick) and `active` brighter for a moment when a movement is switched on (it rises in
 *    `inS`, falls in `outS` seconds). Nothing of this under reduced motion.
 *  ditherLsb: +- noise in 1/255 steps so the slow ramps do not band. */
export const ROOM = Object.freeze({
  floorY: -13, ceilY: 16, wallR: 260,
  centre: Object.freeze([0, -7.5]), bodyAt: Object.freeze([-0.04, -0.23, -0.53]),
  black: Object.freeze([0.0015, 0.0021, 0.0033]),
  pool: Object.freeze({ colour: Object.freeze([0.020, 0.040, 0.042]), radiusM: 19, amb: 0.05 }),
  tile: Object.freeze({ sizeM: 3, groutM: 0.07, dark: 0.55 }),
  wall: Object.freeze({ colour: Object.freeze([0.0045, 0.0105, 0.0115]), heightM: 30, lobes: 7, uneven: 0.16 }),
  lamps: Object.freeze([Object.freeze([0.3, 4.9, 3.8, 1]), Object.freeze([-5, 9.3, 1.7, 0.75]), Object.freeze([-6.2, 5.1, 1.2, 0.6])]),
  lamp: Object.freeze({ colour: Object.freeze([0.19, 0.245, 0.25]), core: 0.7, coreR: 0.5, disc: 0.3, discIn: 0.45, discOut: 1.25, halo: 0.07, haloR: 2.2 }),
  gloss: Object.freeze({ f0: 0.05, wall: 0.7 }),
  aura: Object.freeze({ colour: Object.freeze([0.72, 0.96, 1]), brain: Object.freeze([0.012, 0.4, 1]), mirror: Object.freeze([0.02, 0.9, 0]), body: Object.freeze([0.02, 0.9, 0]), radii: Object.freeze([7, 0.85, 0.85]) }),
  shade: Object.freeze({ brain: Object.freeze([8, 0.6]), brainK: 0.75, mirror: Object.freeze([4, 0.5]), body: Object.freeze([4, 0.5]) }),
  live: Object.freeze({ beat: 0.3, beatS: 0.11, active: 0.4, inS: 0.25, outS: 1.2 }),
  ditherLsb: 0.75
});

const f = x => (Number.isInteger(x) ? x.toFixed(1) : String(x));
const v3 = a => `vec3( ${f(a[0])}, ${f(a[1])}, ${f(a[2])} )`;
const AURA_KEYS = Object.freeze(['brain', 'mirror', 'body']);

/** The room's light arriving along one line of sight, in JavaScript: the same arithmetic as the shader (roomGlsl), for
 * tests and checks. eye [x, y, z] (m), dir a unit vector, st { centre: [x, z], gain, shade: [[x, z, r, depth] x 3],
 * aura: [[x, y, z, r] x 3] (brain, mirror body, your body; r 0 or a missing row: none; a row of 13 numbers carries,
 * after x, y, z, 1, the 3x3 matrix (column-major) that takes a world direction into the thing's own measure, where
 * its outline is at 1: the brain is not a ball) }.
 * Returns linear light [r, g, b] and what the line meets ('floor' | 'wall' | 'ceiling': above eye level the wall is
 * dark and the lamp plane is what shows). Pure. No pixel footprint: the grout is drawn at full sharpness here
 * (footM = 0) unless a footprint in metres is given. */
export function roomLight(eye, dir, st = {}, o = ROOM, footM = 0) {
  const C = st.centre || o.centre, gain = Number.isFinite(st.gain) ? st.gain : 1, shade = st.shade || [], aura = st.aura || [];
  const ocx = eye[0] - C[0], ocz = eye[2] - C[1], dx = dir[0], dy = dir[1], dz = dir[2];
  const a = dx * dx + dz * dz, b = ocx * dx + ocz * dz, c = ocx * ocx + ocz * ocz - o.wallR * o.wallR;
  const tW = a > 1e-7 ? (-b + Math.sqrt(Math.max(b * b - a * c, 0))) / a : 1e7;
  const tF = dy < -1e-5 ? (o.floorY - eye[1]) / dy : 1e8;
  const col = [o.black[0], o.black[1], o.black[2]];
  const add = (k, s) => { col[0] += k[0] * s; col[1] += k[1] * s; col[2] += k[2] * s; };
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const lamps = (qx, qz) => {
    let l = 0;
    const P = o.lamp;
    for (const L of o.lamps) {
      const d = Math.hypot(qx - L[0], qz - L[1]) / L[2];
      l += L[3] * (P.core * Math.exp(-(d * d) / (P.coreR * P.coreR)) + P.disc * (1 - smooth(P.discIn, P.discOut, d)) + P.halo * Math.exp(-(d * d) / (P.haloR * P.haloR)));
    }
    return l;
  };
  const wall = (h, ang) => gain * Math.exp(-Math.max(h, 0) / o.wall.heightM) * (1 - o.wall.uneven * (0.5 + 0.5 * Math.sin(ang * o.wall.lobes + 2.4 * Math.sin(ang * 3))));
  let meets;
  if (tF < tW) {
    meets = 'floor';
    const px = ocx + dx * tF, pz = ocz + dz * tF;
    let sh = 1;
    for (const s of shade) { if (!s) continue; const qx = px + C[0] - s[0], qz = pz + C[1] - s[1]; sh *= 1 - s[3] * Math.exp(-(qx * qx + qz * qz) / (s[2] * s[2])); }
    const T = o.tile.sizeM, G = o.tile.groutM;
    const dist = u => (0.5 - Math.abs(u / T - Math.floor(u / T) - 0.5)) * T;
    const cov = u => { const w = Math.max(footM, 1e-4); return Math.min(1, Math.max(0, (0.5 * G - dist(u)) / w + 0.5)) * Math.min(1, G / w); };
    let line = Math.max(cov(px), cov(pz));
    line += (2 * G / T - line) * smooth(0.25 * T, 0.7 * T, footM);
    const pool = (o.pool.amb + (1 - o.pool.amb) * Math.exp(-(px * px + pz * pz) / (o.pool.radiusM * o.pool.radiusM))) * gain * sh;
    add(o.pool.colour, pool * (1 - o.tile.dark * line));
    const fres = o.gloss.f0 + (1 - o.gloss.f0) * Math.pow(1 + Math.max(-1, Math.min(0, dy)), 5);
    add(o.wall.colour, fres * o.gloss.wall * wall((tW - tF) * -dy, Math.atan2(ocz + dz * tW, ocx + dx * tW)));
  } else {
    meets = dy > 0 ? 'ceiling' : 'wall';
    add(o.wall.colour, wall(eye[1] + dy * tW - o.floorY, Math.atan2(ocz + dz * tW, ocx + dx * tW)));
    if (dy > 1e-4) { const tC = (o.ceilY - eye[1]) / dy; add(o.lamp.colour, gain * lamps(ocx + dx * tC, ocz + dz * tC)); }
  }
  // the lit air round the three things: brightest along a line that passes through a thing's middle
  for (let i = 0; i < 3; i++) {
    const A = aura[i], rule = o.aura[AURA_KEYS[i]];
    if (!A || !(A[3] > 0)) continue;
    // into the thing's own measure, where its outline is at 1: a ball of radius r, or the 3x3 matrix given after it
    const N = A.length >= 13 ? A : null, r = A[3], wx = A[0] - eye[0], wy = A[1] - eye[1], wz = A[2] - eye[2];
    const tr = (x, y, z) => (N ? [N[4] * x + N[7] * y + N[10] * z, N[5] * x + N[8] * y + N[11] * z, N[6] * x + N[9] * y + N[12] * z] : [x / r, y / r, z / r]);
    const e = tr(wx, wy, wz), d = tr(dx, dy, dz), ed = e[0] * d[0] + e[1] * d[1] + e[2] * d[2], dd = Math.max(d[0] * d[0] + d[1] * d[1] + d[2] * d[2], 1e-9), ee = e[0] * e[0] + e[1] * e[1] + e[2] * e[2];
    const t = Math.max(ed / dd, 0), qx = e[0] - d[0] * t, qy = e[1] - d[1] * t, qz = e[2] - d[2] * t;
    // none from inside the thing, and none on a line that looks away from it (the room stays black there)
    const over = Math.max(Math.sqrt(qx * qx + qy * qy + qz * qz) - rule[2], 0);
    add(o.aura.colour, gain * rule[0] * smooth(0.7, 1.6, Math.sqrt(ee)) * smooth(0, 0.3, ed / Math.sqrt(Math.max(ee * dd, 1e-18))) * Math.exp(-(over * over) / (rule[1] * rule[1])));
  }
  return { colour: col, meets };
}

/** Linear light -> the display's sRGB value 0..1 (for checks of how bright the room is on screen). Pure. */
export function srgbOf(x) { const v = Math.min(1, Math.max(0, x)); return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; }

/** The shader text of the room: `vec3 nsRoom( vec3 eye, vec3 dir )` (dir a unit vector) returns linear light. It reads
 * uRoom (centre x, centre z, gain, 0), uRoomShade[3] (x, z, radius, depth), uRoomAura[3] (x, y, z, 1; 0: none) and
 * uRoomAuraN[3] (world -> the thing's own measure, where its outline is at 1). The numbers are ROOM's. */
export function roomGlsl(o = ROOM) {
  const P = o.lamp;
  const lampRows = o.lamps.map(L => `	{ float d = length( q - vec2( ${f(L[0])}, ${f(L[1])} ) ) / ${f(L[2])}; float d2 = d * d;
		l += ${f(L[3])} * ( ${f(P.core)} * exp( - d2 / ${f(P.coreR * P.coreR)} ) + ${f(P.disc)} * ( 1.0 - smoothstep( ${f(P.discIn)}, ${f(P.discOut)}, d ) ) + ${f(P.halo)} * exp( - d2 / ${f(P.haloR * P.haloR)} ) ); }`).join('\n');
  const auraRows = AURA_KEYS.map((key, i) => `	{ vec4 A = uRoomAura[ ${i} ]; vec3 e = uRoomAuraN[ ${i} ] * ( A.xyz - eye ), d = uRoomAuraN[ ${i} ] * dir; float ed = dot( e, d ), dd = max( dot( d, d ), 1e-9 ), ee = dot( e, e ); vec3 q = e - d * max( ed / dd, 0.0 ); float over = max( length( q ) - ${f(o.aura[key][2])}, 0.0 );
		au += ${f(o.aura[key][0])} * step( 0.5, A.w ) * smoothstep( 0.7, 1.6, sqrt( ee ) ) * smoothstep( 0.0, 0.3, ed * inversesqrt( max( ee * dd, 1e-18 ) ) ) * exp( - over * over / ${f(o.aura[key][1] * o.aura[key][1])} ); }`).join('\n');
  return `uniform vec4 uRoom;
uniform vec4 uRoomShade[ 3 ];
uniform vec4 uRoomAura[ 3 ];
uniform mat3 uRoomAuraN[ 3 ];
float nsRoomLamps( vec2 q ) {
	float l = 0.0;
${lampRows}
	return l;
}
float nsRoomWall( float h, float ang, float gain ) {
	return gain * exp( - max( h, 0.0 ) / ${f(o.wall.heightM)} ) * ( 1.0 - ${f(o.wall.uneven)} * ( 0.5 + 0.5 * sin( ang * ${f(o.wall.lobes)} + 2.4 * sin( ang * 3.0 ) ) ) );
}
float nsRoomGrout( float u, float w ) {
	float dist = ( 0.5 - abs( fract( u / ${f(o.tile.sizeM)} ) - 0.5 ) ) * ${f(o.tile.sizeM)};
	return clamp( ( ${f(0.5 * o.tile.groutM)} - dist ) / w + 0.5, 0.0, 1.0 ) * min( 1.0, ${f(o.tile.groutM)} / w );
}
vec3 nsRoom( vec3 eye, vec3 dir ) {
	vec2 C = uRoom.xy, oc = eye.xz - C;
	float gain = uRoom.z;
	float a = dot( dir.xz, dir.xz ), b = dot( oc, dir.xz ), c = dot( oc, oc ) - ${f(o.wallR * o.wallR)};
	float tW = a > 1e-7 ? ( - b + sqrt( max( b * b - a * c, 0.0 ) ) ) / a : 1e7;
	float tF = dir.y < -1e-5 ? ( ${f(o.floorY)} - eye.y ) / dir.y : 1e8;
	vec3 col = ${v3(o.black)};
	// the floor point and its pixel footprint, taken outside the branch (screen derivatives inside one are not defined)
	vec2 p = oc + dir.xz * min( tF, 1e4 );
	vec2 w = max( fwidth( p ), vec2( 1e-4 ) );
	vec2 pw = oc + dir.xz * tW;
	float ang = atan( pw.y, pw.x );
	if ( tF < tW ) {
		float sh = 1.0;
		for ( int i = 0; i < 3; i ++ ) { vec2 q = p + C - uRoomShade[ i ].xy; sh *= 1.0 - uRoomShade[ i ].w * exp( - dot( q, q ) / ( uRoomShade[ i ].z * uRoomShade[ i ].z ) ); }
		float foot = max( w.x, w.y );
		float line = max( nsRoomGrout( p.x, w.x ), nsRoomGrout( p.y, w.y ) );
		line += ( ${f(2 * o.tile.groutM / o.tile.sizeM)} - line ) * smoothstep( ${f(0.25 * o.tile.sizeM)}, ${f(0.7 * o.tile.sizeM)}, foot );
		float pool = ( ${f(o.pool.amb)} + ${f(1 - o.pool.amb)} * exp( - dot( p, p ) / ${f(o.pool.radiusM * o.pool.radiusM)} ) ) * gain * sh;
		col += ${v3(o.pool.colour)} * pool * ( 1.0 - ${f(o.tile.dark)} * line );
		float fres = ${f(o.gloss.f0)} + ${f(1 - o.gloss.f0)} * pow( 1.0 + clamp( dir.y, -1.0, 0.0 ), 5.0 );
		col += ${v3(o.wall.colour)} * ( fres * ${f(o.gloss.wall)} * nsRoomWall( ( tW - tF ) * - dir.y, ang, gain ) );
	} else {
		col += ${v3(o.wall.colour)} * nsRoomWall( eye.y + dir.y * tW - ${f(o.floorY)}, ang, gain );
		if ( dir.y > 1e-4 ) col += ${v3(o.lamp.colour)} * ( gain * nsRoomLamps( oc + dir.xz * ( ( ${f(o.ceilY)} - eye.y ) / dir.y ) ) );
	}
	float au = 0.0;
${auraRows}
	col += ${v3(o.aura.colour)} * ( gain * au );
	return col;
}`;
}

const BACKDROP_VS_CAMERA = `varying vec3 vRoomDir;
varying vec3 vRoomEye;
void main() {
	// the line of sight through this corner of the picture, in the world (the camera's own turn, without its place)
	vec3 v = vec3( ( position.x + projectionMatrix[ 2 ][ 0 ] ) / projectionMatrix[ 0 ][ 0 ], ( position.y + projectionMatrix[ 2 ][ 1 ] ) / projectionMatrix[ 1 ][ 1 ], -1.0 );
	vRoomDir = transpose( mat3( viewMatrix ) ) * v;
	vRoomEye = cameraPosition;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`;
const BACKDROP_VS_FIXED = `uniform mat3 uRoomRay;
uniform vec3 uRoomEye;
varying vec3 vRoomDir;
varying vec3 vRoomEye;
void main() {
	vRoomDir = uRoomRay * vec3( position.xy, -1.0 );
	vRoomEye = uRoomEye;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`;
const backdropFs = o => `precision highp float;
varying vec3 vRoomDir;
varying vec3 vRoomEye;
${roomGlsl(o)}
void main() {
	gl_FragColor = vec4( nsRoom( vRoomEye, normalize( vRoomDir ) ), 1.0 );
	#include <colorspace_fragment>
	float n = fract( sin( dot( floor( gl_FragCoord.xy ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) + fract( sin( dot( floor( gl_FragCoord.xy ), vec2( 39.3468, 11.1351 ) ) ) * 24634.6345 ) - 1.0;
	gl_FragColor.rgb = max( gl_FragColor.rgb + n * ${f(o.ditherLsb / 255)}, 0.0 );
}`;

/** The matrix that turns a corner of the picture (x, y in -1..1, with z = -1) into a line of sight in the world, for a
 * view with no camera object of the game's (the loading picture): a look `yawDeg` to the left and `pitchDeg` up from
 * level along -z, `fovYDeg` up and down, at `aspect` (width / height). Column-major 3x3 (9 numbers). Pure. */
export function roomRayMatrix(out, { fovYDeg, aspect, yawDeg = 0, pitchDeg = 0 }) {
  const ty = Math.tan((fovYDeg * Math.PI) / 360), tx = ty * aspect, y = (yawDeg * Math.PI) / 180, p = (pitchDeg * Math.PI) / 180;
  const cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p);
  // the camera's axes in the world (three's 'YXZ' order: yaw about +y, then pitch about the turned x)
  const right = [cy, 0, -sy], up = [sy * sp, cp, cy * sp], back = [sy * cp, -sp, cy * cp];
  out[0] = right[0] * tx; out[1] = right[1] * tx; out[2] = right[2] * tx;
  out[3] = up[0] * ty; out[4] = up[1] * ty; out[5] = up[2] * ty;
  out[6] = back[0]; out[7] = back[1]; out[8] = back[2];
  return out;
}

/** The backdrop mesh: one triangle that covers the picture, at the far depth. With `fixed` it does not read the
 * camera: its view is set by setFixedView (the loading picture). Returns { mesh, uniforms, setFixedView, dispose }. */
export function createRoomBackdrop({ THREE, fixed = false, o = ROOM } = {}) {
  const uniforms = {
    uRoom: { value: new THREE.Vector4(o.centre[0], o.centre[1], 1, 0) },
    uRoomShade: { value: [new THREE.Vector4(0, 0, 1, 0), new THREE.Vector4(0, 0, 1, 0), new THREE.Vector4(0, 0, 1, 0)] },
    uRoomAura: { value: [new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0), new THREE.Vector4(0, 0, 0, 0)] },
    uRoomAuraN: { value: [new THREE.Matrix3(), new THREE.Matrix3(), new THREE.Matrix3()] }
  };
  if (fixed) { uniforms.uRoomRay = { value: new THREE.Matrix3() }; uniforms.uRoomEye = { value: new THREE.Vector3(0, 0, 0) }; }
  const material = new THREE.ShaderMaterial({
    name: 'ns-room backdrop (display only)', uniforms, vertexShader: fixed ? BACKDROP_VS_FIXED : BACKDROP_VS_CAMERA, fragmentShader: backdropFs(o),
    depthTest: true, depthWrite: false, toneMapped: false, fog: false
  });
  if (THREE.LessEqualDepth !== undefined) material.depthFunc = THREE.LessEqualDepth;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'ns-room backdrop'; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.matrixWorldAutoUpdate = false;
  mesh.renderOrder = ROOM_ORDER.backdrop;
  const ray = new Float32Array(9);
  function setFixedView(view) { if (!fixed) return false; roomRayMatrix(ray, view); uniforms.uRoomRay.value.fromArray(ray); if (view.eye) uniforms.uRoomEye.value.fromArray(view.eye); return true; }
  return { mesh, uniforms, setFixedView, dispose() { geometry.dispose(); material.dispose(); } };
}

/** Draw order: the backdrop is the LAST of the solid things (at the far depth, so only where nothing covers it). */
export const ROOM_ORDER = Object.freeze({ backdrop: 1e6 });

/** How bright the room's light is this frame (its gain): 1 at rest, more at the top of a beat and for a moment when a
 * movement is switched on. `beat` is the softened beat 0..1 (roomBeatStep), `level` the eased 0..1 "a movement was
 * switched on" value (roomActiveStep), both kept by the caller. Under reduced motion exactly 1, whatever it is given. Pure. */
export function roomGain(beat = 0, level = 0, o = ROOM, reducedMotion = false) {
  if (reducedMotion) return 1;
  const b = Number.isFinite(beat) ? Math.min(1, Math.max(0, beat)) : 0, l = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  return 1 + o.live.beat * b + o.live.active * l;
}
/** Soften the beat (a quick rise and a slower fall, 0..1) over dtS seconds, so the room's light swells with it and
 * does not flick; 0 under reduced motion. Pure. */
export function roomBeatStep(soft, beat, dtS, reducedMotion = false, o = ROOM) {
  if (reducedMotion) return 0;
  const b = Number.isFinite(beat) ? Math.min(1, Math.max(0, beat)) : 0;
  if (!(dtS > 0)) return soft;
  return soft + (b - soft) * (1 - Math.exp(-dtS / o.live.beatS));
}
/** Ease the "a movement was switched on" level toward 1 (on) or 0 (off) over dtS seconds. Under reduced motion it
 * stays 0: the room's light does not answer at all. Pure. */
export function roomActiveStep(level, on, dtS, reducedMotion = false, o = ROOM) {
  if (reducedMotion) return 0;
  const target = on ? 1 : 0;
  if (!(dtS > 0)) return level;
  const tau = target > level ? o.live.inS : o.live.outS, n = level + (target - level) * (1 - Math.exp(-dtS / tau));
  return Math.abs(target - n) < 0.004 ? target : n;
}

/** The room for the game's scene. Returns { group (add it to the scene), update(frame), setCentre(x, z), state(),
 * dispose() }. update({ dtMs, beat, active, brain, brainShape, mirror, body }): beat 0..1 and
 * active (a movement switched on) from the living brain; brain / mirror / body = world places [x, y, z] or
 * [x, y, z, radius] (or null) for the floor shadows and the halos; brainShape = 9 numbers (a 3x3 matrix, column-major)
 * from the world into the brain's own measure where its outline is at 1 (the brain is not a ball), or null.
 * Writes a handful of uniforms: no allocation. */
export function createRoom({ THREE, reducedMotion = false, o = ROOM } = {}) {
  const group = new THREE.Group();
  group.name = 'ns-room (display only)'; group.matrixAutoUpdate = false;
  const backdrop = createRoomBackdrop({ THREE, o });
  group.add(backdrop.mesh);
  const U = backdrop.uniforms, shade = U.uRoomShade.value, aura = U.uRoomAura.value, auraN = U.uRoomAuraN.value, auraR = [0, 0, 0];
  let level = 0, soft = 0, centreSet = false;
  const ok = p => p && p.length >= 3 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]);
  // one thing: its floor shadow (x, z, radius, depth) and its halo (x, y, z, radius)
  // (p: [x, y, z] or [x, y, z, radius]; shape: 9 numbers, the 3x3 matrix (column-major) from the world into the thing's
  // own measure, for a thing that is not a ball)
  const put = (i, p, rule, shadeR, shape) => {
    if (!ok(p)) { shade[i].w = 0; aura[i].w = 0; auraR[i] = 0; return; }
    const r = p.length >= 4 && p[3] > 0 ? p[3] : o.aura.radii[i];
    shade[i].set(p[0], p[2], shadeR > 0 ? shadeR * r : rule[0], rule[1]);
    aura[i].set(p[0], p[1], p[2], 1); auraR[i] = r;
    const m = auraN[i].elements;
    if (shape && shape.length >= 9) for (let k = 0; k < 9; k++) m[k] = shape[k];
    else { m[0] = m[4] = m[8] = 1 / r; m[1] = m[2] = m[3] = m[5] = m[6] = m[7] = 0; }
  };
  function setCentre(x, z) { if (!Number.isFinite(x) || !Number.isFinite(z)) return false; U.uRoom.value.x = x; U.uRoom.value.y = z; centreSet = true; return true; }
  function update(fr) {
    const dtS = fr && fr.dtMs > 0 ? Math.min(0.25, fr.dtMs / 1000) : 0;
    level = roomActiveStep(level, Boolean(fr && fr.active > 0), dtS, reducedMotion, o);
    soft = roomBeatStep(soft, fr ? fr.beat : 0, dtS, reducedMotion, o);
    U.uRoom.value.z = roomGain(soft, level, o, reducedMotion);
    // the light's axis is where the brain FIRST stands; it stays there (a lamp does not follow what is moved under it)
    if (!centreSet && fr && ok(fr.brain)) setCentre(fr.brain[0], fr.brain[2]);
    put(0, fr && fr.brain, o.shade.brain, fr && fr.brain && fr.brain.length >= 4 && fr.brain[3] > 0 ? o.shade.brainK : 0, fr && fr.brainShape);
    put(1, fr && fr.mirror, o.shade.mirror, 0, null); put(2, fr && fr.body, o.shade.body, 0, null);
  }
  const r3 = v => Math.round(v * 1000) / 1000;
  function state() {
    const r = U.uRoom.value;
    return { centre: [r.x, r.y], centreSet, gain: r3(r.z), beat: r3(soft), active: r3(level), dust: 0,
      shadows: [shade[0].w > 0, shade[1].w > 0, shade[2].w > 0],
      things: aura.map((a, i) => (a.w > 0 ? { at: [r3(a.x), r3(a.y), r3(a.z)], radiusM: r3(auraR[i]), shadowM: r3(shade[i].z) } : null)), reducedMotion };
  }
  function dispose() { backdrop.dispose(); }
  return { group, update, setCentre, state, dispose };
}
