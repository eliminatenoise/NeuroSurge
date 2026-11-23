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
 * Legacy bodyLook contract in third person (decision, see round5/R5-camera-NOTES.md):
 * R425 retains the physical body frame but re-solves the attached arm in actual C to honor the displayed anchor.
 * Reach feasibility/normal joints/full-body and view qualification remain open; this is not a fixed-pose waiver.
 *  - They keep the FIRST-PERSON frame they had when E was pressed ("body look", pose.bodyLook): the trunk yaw, the neck
 *    flex, the shoulder and the hand's screen-locked aim do not change when the camera leaves the head.
 *  - W / A / S / D keep moving the hand in that first-person frame (A / D across, W / S away / toward), and Space (hold
 *    or tap: grasp; double tap: the limbs turn once; double tap and hold: they keep turning slowly; R558, Message 40)
 *    works exactly as in first person.
 *  - The genuine NDC y +0.5 hand lock applies to the actual displayed view too. The optional R425 App/display path
 *    refits anatomy in this actual camera; the legacy bodyLook alone does not establish that screen rule.
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
  armNote: 'W/A/S/D still move your left hand. While you hold the brain or mirror body, they also move that item.'
});

/** The first-person camera: at the eye, the world origin (ns-scene-three CAMERA: PerspectiveCamera(the selected display FOV, aspect, 0.02, far)). */
export const FIRST_PERSON = Object.freeze({ position: Object.freeze([0, 0, 0]), nearM: 0.02 });

/**
 * 18 November 2026 (the owner: "they can see everything at the front of their body from the chin down all at once,
 * shoulders, chest and everything"; "You should be able to see your own shoulders and stomach/abs"): the game's view
 * point is no longer bound to the anatomical eye. The first-person camera is pulled BACK along its own viewing
 * direction (a dolly), as if you looked from the back of your head through your eyes:
 *  - the line through the crosshair is the same line as before, so aiming is unchanged;
 *  - near things (the chest under the chin) are drawn smaller and flatter, far things (the brain, the feet) barely
 *    change, and the shoulders, which lie about level with the eyes' plane, come into the lower corners;
 *  - only the CAMERA moves: the anatomical eye that the arm fit, the head pose and the reference frame use stays
 *    where it is (ns-app referenceFrameForLook; the pose carries it as armParentPosition for the scene).
 * 18 November 2026, later (the start posture changed: the pelvis rolled under, the upper back straight and leaning
 * back, the neck bent forward 40 degrees; ns-body BODY_POSTURES.open): with the head bowed that far the top of the
 * breastbone lies only 12 cm under the eyes, and a camera pulled BACK the 7 to 10 cm that suited the rounded back
 * looked straight down into the open root of the neck (the first ribs as loops; the neck near the eye is never
 * drawn). So the camera now rides ABOVE the eyes on the head: upM along the HEAD's own up direction (the head is
 * bowed less than the look: the eyes are lowered headAboveLookDeg in it, ns-body POSTURE_EYES, fading out by
 * headLevelEndDeg of upward tilt exactly as ns-app headPitchForLook has it). From there the collar bones lie along
 * the lower edge of the picture with the opening just below it, the caps of both shoulders are in the lower corners,
 * and the eyes see OVER the lower edge of the chest to the belly (from the eye itself the belly is edge-on behind the
 * chest: 5 % of the picture's half height; from 12 cm higher 14 %). Because the offset turns with the head, the
 * picture of your own chest and collar stays the same however far down you look. The crosshair's line is no longer
 * the eye's own line but one parallel to it; aiming uses the camera, as the picture does. backM (along the line of
 * sight) is kept as a second knob and is 0.
 * (What follows, down to the note of 19 November, is how it was until then: the eases toward the eye and the byPitch
 * table are gone; EYE_DOLLY below has the rule that replaced them.)
 * While the look rises from upFromDeg to upFullDeg both ease to 0 (the camera would otherwise sink into your own neck
 * and back when you look up), and while it turns from sideFromDeg to sideFullDeg to either side they ease to sideShare
 * of that (the opening at the root of the neck comes into the picture from behind there). Every part is continuous,
 * so no look makes the picture jump. Display choices found on screenshots and on the posed body's landmarks; not a
 * measurement of anything.
 * 18 November 2026, after a check (the chest filled the lower third of the picture as two slabs, the stomach was a
 * 50 px band behind its far edge, and the crosshair could no longer be put on your own belly): the camera now stands
 * 26 cm above the eyes along the head's up AND 14 cm back along the line of sight at the start look: from higher up
 * the chest is a smaller, flatter plate, the stomach and pelvis show over its far edge, and both shoulders and the
 * collar bones are inside a NARROWER view (100 degrees, was 116), so everything is drawn larger for its place. What
 * made that possible is the neck shade (ns-scene-three NECK_SHADE): the place where your own neck leaves the chest
 * is drawn as a dark shape, so a camera behind the collar bones no longer looks into the open rib cage. Below the
 * start look the offsets follow byPitch (rows [look pitch, upM, backM], read in a straight line between the rows): looking
 * further down the camera comes back to the line of sight and nearer the eye, so the crosshair reaches your own
 * belly at the look's lower end. Above the start look both ease to 0 between upFromDeg and upFullDeg (at a level look
 * the camera is the eye again).
 * 18 November 2026, after a second check (far down, the camera 12 cm back on the line of sight stood behind the
 * collar bones and looked into the neck shade from above: a black disc 480 px wide at 75 down, and, with the look
 * also turned 60 degrees or more to a side, the trunk seen opened from above: a flap of back muscle and a loose
 * stump beside the shade): the table's lower end is now 8 cm up and 0 back (at 75 down the camera stands over the
 * eye, in front of the collar bones: the shade is out of the picture and the chest lies below it), and the ease for
 * looks to a side runs from 50 to 100 degrees (was 95 to 155): looking 100 degrees or more to a side the camera is
 * the eye, as before the camera was moved at all. Seen on pictures at 0 / 30 / 60 / 75 / 95 degrees to a side and
 * 45 to 72 down: no opening, flap or stump.
 */
/* 18 November 2026, late (the owner: "a very wide field of view, but a very narrow depth of field. So things that are
 * far away look extremely close to us ... a very wide view, but a very flat view as well"; "a much larger set of four
 * limbs, and perhaps that involves dialing down the field of view to some extent"; "all of the torso has to be
 * visible at once"): the eye view is now a LONGER LENS FROM FURTHER BACK. The camera stands backM behind the eye on
 * the line of sight (and upM above it along the head's up) and the lens is narrower (the launcher's field of view,
 * 100 -> 54 degrees), so what is near (chest, shoulders) is drawn smaller for its place and what is far (shins, feet,
 * the mirror body, the brain) larger: depth is flattened. Why not further back with a still longer lens: in the
 * slumped posture the front of the trunk faces 49 degrees above level, so a look 41 degrees down runs PARALLEL to it;
 * from far back every ray runs along it and the chest hides the belly and pelvis (see the notes of this package). The
 * start look is therefore steeper (52 degrees down: the line of sight crosses the trunk's front at about 17 degrees),
 * which lets the camera stand back and the lens narrow while the whole torso stays in the picture.
 *  - zRefM: how the lens follows the camera when the camera comes back to the eye (looking up, far to a side, far
 *    down): the view's angle widens so that things zRefM in front of the eye keep their size (a dolly zoom: nothing
 *    near jumps), null = the angle stays the launcher's. The view's angle is the launcher's at the start look.
 *  - nearBehindEyeM: the near plane stands this far behind the eye's own plane (never nearer the camera than
 *    FIRST_PERSON.nearM), so nothing between the camera and the back of your own head is drawn.
 * Display choices, judged on pictures. */
/* 19 November 2026 (the owner: "there's a problem whenever you look to the far side of any screen, everything gets
 * super magnified and is unusable"; "The camera view should be free to move wherever it wants"). Until now the camera
 * came back to the eye when the look turned past 50 degrees to a side or rose toward level, and nearer the eye for
 * steep downward looks (the byPitch table, upFromDeg / upFullDeg, sideFromDeg / sideFullDeg). At the eye the same long
 * lens draws your own arm and shoulder, which lie a hand's breadth away, across the whole picture. Now the stand-off
 * is ONE distance at every look: backM behind the eye and upM above it. What keeps the camera out of your own neck
 * and back is where the stand-off points, not its length:
 *  - standPitchMaxDeg: for looks above this the camera stays where that look puts it (behind and above the head) and
 *    only turns there, so a level or upward look never lowers it into the trunk;
 *  - standYawMaxDeg: the stand-off follows the HEAD's turn (the neck's and the chest's together); past it only the
 *    eyes turn on, and the camera turns where it stands instead of swinging round in front of your face.
 * Inside both the camera stands straight behind the eye on the line of sight, as at the start. Everything is
 * continuous, so no look makes the picture jump, and nothing changes its size on screen because of the turn alone.
 * nearBehindEyeM 0.1 -> 0: the near plane stands AT the eye's own plane. With it 10 cm behind, the top of your own neck
 * (drawn in place since 18 November) was cut through by that plane: a dark hollow at the bottom of the start picture,
 * and ragged stumps of neck muscle standing up into the picture when the head was turned past about 80 degrees. At
 * the eye's plane the part of the neck above it is not drawn at all, and what remains is its root between the collar
 * bones. (Further forward, 8 cm in front of the eye, the plane cut the chest and the shoulder open instead: seen.)
 * Display choices, judged on pictures. */
/* 19 November 2026, after a check ("the whole torso visible at the start" was not met: the shoulders were cut by the
 * lower edge; and at far side looks the near plane, which stood at the eye's own plane, cut your neck and shoulder
 * open): backM 0.3 -> 0.5 and upM 0.1 -> 0.14: from further back your whole front, both shoulders included, is inside
 * the lower part of the start picture under the strip (the launcher has the layout). nearBehindEyeM 0 -> null: the
 * near plane is the scene's own again and cuts nothing; your head and neck are left out above the collar by the
 * scene (ns-scene-three EYE_COLLAR: a box that is not drawn and a plain cap), the same from every look. */
/* 19 November 2026, later (the owner: "a proper first person view"; a check: with the chosen limb's hand or foot held
 * three quarters up the picture the look is 50 to 60 degrees down, and from half a metre behind and above the head
 * that was a view of your own shoulders and collar from above, not out of your eyes). The stand-off now closes as the
 * look goes down: whole to downFromDeg below level, downShare of it from downToDeg, eased between. Looking down at
 * your own body you look out of your own eyes; at the start look and above nothing changes. */
export const EYE_DOLLY = Object.freeze({
  backM: 0.5, upM: 0.14, headAboveLookDeg: 30, headLevelEndDeg: 40,
  standPitchMaxDeg: -25, standYawMaxDeg: 110,
  // (the owner, on seeing it: "I like the zoom, pan ... dolly effect, but you've definitely gone overkill with it. It's
  // too extreme": the stand-off now closes to 0.55 of itself, not 0.12, and over a longer stretch of look, 27 to 75
  // degrees down: about a quarter of the travel, and under half a centimetre for each degree of look)
  // (and then: "there should essentially be no zoom effect when moving ... the camera view up and down ... There can be
  // some ... zoom effects when we're doing WASD": downShare 1 = the look's pitch moves the camera no nearer at all; the
  // stand-off is one length at every look again. A zoom tied to the keys is not built; the rule stays here for it.)
  downFromDeg: 27, downToDeg: 75, downShare: 1,
  zRefM: null, nearBehindEyeM: null
});
/** Where the first-person camera stands from the eye for a look { yaw, pitch } (radians; yaw from the body's own
 * forward): { backM along the stand-off line, upM along the head's up direction, headPitch (radians: the head's own
 * pitch for the stand-off's look), offset [x, y, z] (world metres: the whole displacement from the eye) }. Pure;
 * continuous. */
export function eyeDolly(look, o = EYE_DOLLY) {
  const l = lookOf(look, 'look');
  // (the stand-off closes for a look down: EYE_DOLLY downFromDeg / downToDeg / downShare)
  const dn = isNum(o.downFromDeg) && isNum(o.downToDeg) && isNum(o.downShare) && o.downToDeg > o.downFromDeg
    ? Math.min(1, Math.max(0, (-l.pitch / DEG - o.downFromDeg) / (o.downToDeg - o.downFromDeg))) : 0;
  const closeK = 1 - (1 - (isNum(o.downShare) ? o.downShare : 1)) * (dn * dn * (3 - 2 * dn));
  const backM = Math.max(0, o.backM) * closeK, upM = Math.max(0, o.upM) * closeK;
  // the look the stand-off is taken for: the look itself, held at standPitchMaxDeg and at +-standYawMaxDeg
  const pMax = isNum(o.standPitchMaxDeg) ? o.standPitchMaxDeg * DEG : Math.PI / 2, yMax = isNum(o.standYawMaxDeg) ? o.standYawMaxDeg * DEG : Math.PI;
  const sp = Math.min(l.pitch, pMax), syaw = Math.max(-yMax, Math.min(yMax, l.yaw)); // (the yaw as given, not wrapped: the look ends at straight behind on either side and must not jump there)
  // the head's pitch for that look (ns-app headPitchForLook with the posture's eye lowering)
  const e = o.headAboveLookDeg, end = o.headLevelEndDeg, pd = sp / DEG;
  const hd = pd <= -e ? pd + e : pd >= end ? pd : (end * (pd + e)) / (end + e), h = hd * DEG;
  const g = gazeDirection(l.yaw, l.pitch), b = gazeDirection(syaw, sp), sy = Math.sin(syaw), cy = Math.cos(syaw), sh = Math.sin(h), ch = Math.cos(h);
  // head up = (sin yaw sin h, cos h, cos yaw sin h) (cameraRotation's up column for the head's own pitch)
  const offset = [upM * sy * sh - backM * b[0], upM * ch - backM * b[1], upM * cy * sh - backM * b[2]];
  return { backM, upM, headPitch: h, offset, ...eyeFlatLens(offset, g, o) };
}
/** 18 November 2026, late (EYE_DOLLY zRefM / nearBehindEyeM): for a camera offset from the eye and the line of sight g:
 * depthBackM (how far the camera stands behind the eye's own plane), fovScale (multiplies tan(view angle / 2): 1 at
 * the start look; with zRefM, larger as the camera comes nearer the eye, so things zRefM ahead of the eye keep their
 * size) and nearM (the near plane: nearBehindEyeM behind the eye's plane, at least FIRST_PERSON.nearM). Pure. */
function eyeFlatLens(offset, g, o) {
  const depthBackM = Math.max(0, -(offset[0] * g[0] + offset[1] * g[1] + offset[2] * g[2]));
  let fovScale = 1;
  if (isNum(o.zRefM) && o.zRefM > 0) {
    // the depth while the camera stands straight behind the eye (any look inside the stand-off's range)
    const start = o.backM + o.upM * Math.sin(Math.min(o.headAboveLookDeg, 90) * DEG);
    fovScale = (o.zRefM + start) / (o.zRefM + depthBackM);
  }
  const nearM = isNum(o.nearBehindEyeM) ? Math.max(FIRST_PERSON.nearM, depthBackM - o.nearBehindEyeM) : FIRST_PERSON.nearM;
  return { depthBackM, fovScale, nearM };
}
/** How far back (m) the camera stands (eyeDolly's backM). */
export function eyeDollyBackM(look, o = EYE_DOLLY) { return eyeDolly(look, o).backM; }

/* 20 November 2026, afternoon (a hunt: with the right arm chosen, a look up carries the hand up beside and behind the
 * head, and a turn of the look to the other side then swings the camera, which stands EYE_DOLLY's half metre behind
 * and above the eye, round into that arm: the picture filled with the arm's inside, its muscles cut open by the near
 * plane). EYE_CLEAR: the eye view's camera keeps clear of your own limbs, given to it as rods (a segment with a
 * radius: shoulder to elbow, elbow to hand; hip to knee, knee to ankle). Where the camera's place comes within clearM of
 * a rod, it is moved ACROSS the line of sight, never along it: nothing in the picture grows or shrinks, and a look up or
 * down does not change the camera's distance (the owner: no zoom when the look moves up and down). It goes straight
 * away from the rod's nearest point (taken across the line of sight), so an arm that comes nearer pushes the camera
 * along before it, starting from nothing at clearM, and a camera place that goes past or through an arm is taken
 * round it: nothing jumps. ns-app eases the move as well. mostM caps it. Display choices. */
export const EYE_CLEAR = Object.freeze({ on: true, clearM: 0.07, mostM: 0.3, passes: 2 });
/** EYE_CLEAR: the camera place P (world m) kept clear of `rods` ([{ a, b, r }]: segment ends and radius, world m), for
 * the eye E and the unit line of sight g. Returns P itself when nothing is near. Pure. */
export function eyeClearOfRods(P, E, g, rods, o = EYE_CLEAR) {
  if (!o || !o.on || !Array.isArray(rods) || !rods.length) return P;
  const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const across = v => { const k = dot(v, g); return [v[0] - g[0] * k, v[1] - g[1] * k, v[2] - g[2] * k]; };
  let p = P;
  for (let pass = 0; pass < o.passes; pass++) {
    let moved = false;
    for (const rod of rods) {
      if (!rod || !isVec3(rod.a) || !isVec3(rod.b) || !isNum(rod.r)) continue;
      const ab = sub(rod.b, rod.a), L2 = dot(ab, ab), c = Math.max(0, rod.r) + o.clearM;
      if (!(L2 > 1e-12)) continue;
      const distAt = q => { const t = clamp(dot(sub(q, rod.a), ab) / L2, 0, 1); return len([q[0] - rod.a[0] - ab[0] * t, q[1] - rod.a[1] - ab[1] * t, q[2] - rod.a[2] - ab[2] * t]); };
      const t = clamp(dot(sub(p, rod.a), ab) / L2, 0, 1), Q = [rod.a[0] + ab[0] * t, rod.a[1] + ab[1] * t, rod.a[2] + ab[2] * t];
      const d = sub(p, Q), dl = len(d);
      if (dl >= c) continue;
      // the way out: straight away from the rod (from its nearest point), taken across the line of sight. That way turns
      // smoothly round the rod as the camera's place goes past it, so the camera goes round the arm, never through it.
      // Only very near the rod's middle, or with the camera straight in front of or behind it along the line of sight,
      // is that way not defined; there the way across the rod and the line of sight, on the eye's side, is blended in.
      const dx = across(d), dxl = len(dx);
      const a = [ab[0] / Math.sqrt(L2), ab[1] / Math.sqrt(L2), ab[2] / Math.sqrt(L2)];
      let m1 = cross(a, g); const m1l = len(m1);
      if (m1l > 1e-9) { m1 = [m1[0] / m1l, m1[1] / m1l, m1[2] / m1l]; if (dot(m1, sub(E, Q)) < 0) m1 = [-m1[0], -m1[1], -m1[2]]; }
      else { const te = across(sub(E, Q)), tel = len(te); m1 = tel > 1e-9 ? [te[0] / tel, te[1] / tel, te[2] / tel] : [0, 0, 0]; }
      const w = clamp(dxl / (0.25 * c), 0, 1), ws = w * w * (3 - 2 * w);
      let m = dxl > 1e-12 ? [dx[0] / dxl * ws + m1[0] * (1 - ws), dx[1] / dxl * ws + m1[1] * (1 - ws), dx[2] / dxl * ws + m1[2] * (1 - ws)] : m1;
      const ml = len(m);
      if (!(ml > 1e-9)) continue;
      m = [m[0] / ml, m[1] / ml, m[2] / ml];
      // how far along that way: to where the camera is clearM off the rod (bisection; at most mostM)
      const at = s => [p[0] + m[0] * s, p[1] + m[1] * s, p[2] + m[2] * s];
      let lo = 0, hi = o.mostM;
      if (distAt(at(hi)) < c) lo = hi;
      else for (let k = 0; k < 18; k++) { const mid = (lo + hi) / 2; if (distAt(at(mid)) < c) lo = mid; else hi = mid; }
      const step = lo === o.mostM ? lo : hi;
      if (!(step > 0)) continue;
      p = at(step); moved = true;
    }
    if (!moved) break;
  }
  const off = sub(p, P), ol = len(off);
  return ol > o.mostM ? [P[0] + off[0] * o.mostM / ol, P[1] + off[1] * o.mostM / ol, P[2] + off[2] * o.mostM / ol] : p;
}

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
 *    plane's corners lie up to about 1.9 x near from the camera at a 120 deg vertical FOV, about 1.6 x at 90);
 *  - maxDistanceM: the longest boom the keep-out rule may use;
 *  - followHead (R558, the user's Message 2: "I'm not sure how, head/neck, shoulder movement, hand placement (locked
 *    in reference to camera view) tied to cursor/camera movement are affected by third-person view? Perhaps the
 *    same?"; Message 16: "Ensure things are consistently sized across 1st/3rd person"): true = the mouse keeps turning
 *    the HEAD in third person exactly as in first person (the head, neck, chest, shoulder and hand all follow the one
 *    look) and the camera only moves: it rides behind and above the posed head, looking the way the head looks. The
 *    orbit centre is then centreFromEyeMm's height (19 cm) above the posed eye and its back distance (6 cm) behind it
 *    along the look; the boom's own pitch is held inside followMinPitchDeg..maxPitchDeg (so it never swings under the
 *    body) while the camera still faces the head's direction. E never changes the look, the body or anything's size
 *    or place; E then E returns exactly. false = the earlier orbit camera (its own look, the body frozen);
 *  - followMinPitchDeg (R558, followHead): the boom follows the head's look all the way down (-80, ns-app HEAD_LOOK
 *    maxDownDeg), so the camera stays on the head's line of sight and the crosshair stays on the body. With the boom
 *    held at minPitchDeg (-60) while the camera faced 80 down, the view's centre fell behind the body and the lower
 *    half of the picture was empty (seen in a screenshot). At -80 the camera is almost straight above the head; the
 *    keep-out spheres still lengthen the boom out of anything in the way (a raised arm).
 *  - followOffsetM (R558, issue hunt 2: with the camera straight behind the head, the mirror body, a literal reflection
 *    on the same line, hid completely behind your own back and only its arrow tips showed, drawn on your body): the
 *    followHead orbit centre is [right, up, back] metres from the posed eye in the look's own frame (right and back
 *    along the floor, up along world up): 0.42 m to the right and 0.42 m up (an over-the-shoulder view), 6 cm back as
 *    before. Seen from there at the start look the mirror body stands beside and above your head: measured with the
 *    arrow rule's sight lines (ns-scene-three FRAME_VIS), about 0.7 of its frame is seen at 1600x900 (its lower legs
 *    and one side stay behind your right shoulder) and all of it at 720x1200; your head and back sit in the lower left
 *    of the picture. With the earlier straight-behind camera none of it showed. Only the camera moves: no
 *    size or place of anything changes (Message 16), E then E still returns exactly, and the crosshair ray starts at
 *    the camera as before. Display choice.
 */
/* 18 November 2026 (the body now LIES BACK, stretched out ahead of the eyes, where on 11 November it sat upright): the
 * view from behind was framed for an upright body, 1.4 m straight behind and above the head, looking the way the head
 * looks. From there the lying body was a small top-down shape under the back of the brain (seen in a screenshot: about
 * 150 px of a 900 px picture), and its posture could not be read at all. Now, for the followHead camera:
 *  - followOffsetM puts the orbit centre over the middle of the lying body: 0.6 m AHEAD of the eyes along the look's
 *    floor direction (a negative "back") and 0.25 m below them;
 *  - followYawDeg turns the boom, and the camera with it, 75 degrees to the left of the head's direction about that
 *    centre, so the camera stands behind and to the RIGHT of the body and looks across it: the curved back, the rolled
 *    shoulder, the chest, the straight hips and the legs are seen in one three-quarter picture, with the brain and
 *    the mirror body beyond the feet;
 *  - distanceM 1.4 -> 0.85: with the 108 degree view a camera has to stand close for the body to be more than a
 *    small shape (the mirror body's slide in this view, ns-mirror MIRROR_OUTSIDE, follows the same number).
 * The mouse still turns the head exactly as in the eye view and the camera turns with it (by the same angles, the
 * fixed 75 degrees apart); E changes nothing but the camera; E then E returns exactly. The crosshair ray starts at
 * the camera and runs along the camera's own direction, as before. Display choices, checked in screenshots. */
/* 18 November 2026, later (a check of that view: turning the look swung the body out of the picture, because the orbit
 * centre lay 0.6 m ahead of the eyes ALONG THE LOOK; the head at the picture's edge was drawn as a long white egg by
 * the wide view; no look showed the back; and the crosshair opened on your own thigh, so a muscle name came up at
 * once). Now, with followBody:
 *  - the orbit centre is fixed over the BODY, which never turns (the pelvis stays put): followOffsetM is measured from
 *    the eye along the body's own forward (the start direction), not along the look: 0.48 m ahead of the eye and
 *    5 cm above it, about 0.3 m ABOVE the middle of the lying body (at the eye's own height the crosshair rested on
 *    the right hand, which lies level in front of the chest);
 *  - the camera always looks straight through that centre, so the whole body stays in the middle of the picture
 *    wherever the look goes (and nothing of it is stretched at the picture's edge: within about 26 degrees of the
 *    middle at distanceM 1.6, drawn with a narrower view: followFovYDeg), and the crosshair passes just over the body instead of resting on it;
 *  - the mouse turns the head as before AND carries the camera round the body: at the start look it stands behind
 *    and to the right (followYawDeg 75), a look 75 degrees to the right brings it straight behind the head, where
 *    the rounded upper back shows, and further round it comes to the left side. followYawMinDeg / followYawMaxDeg
 *    stop it before it would stand inside the brain beyond the feet;
 *  - it stands followPitchBiasDeg lower than the look's own pitch would put it (at the start look about 18 degrees
 *    above the body's level, a side-on picture of the posture rather than a top-down one), never lower than
 *    followMaxPitchDeg (just under the body's level, looking up at the back) however far up the look goes.
 * E still changes nothing but the camera, and E then E returns exactly. Display choices, checked in screenshots. */
export const THIRD_PERSON = Object.freeze({
  centreFromEyeMm: Object.freeze([0, 60, 190]),
  // (third pass, a check: from straight behind the head the crosshair rested on the player's own skull and a bone name
  // came up: the centre is now 12 cm above the eye, not 5, so the line of sight clears the head from behind; 18 cm cut the feet off at the bottom of the picture)
  // (19 November 2026, after a check: straight behind at 1.4 m the camera, your body, the mirror body and the brain
  // stood in one line: the face areas were above the picture, and a look up put your skull and shoulders in front of
  // the mirror body and the strip. The camera now aims at a point 1 m ahead of your eyes over your legs (it was 0.48)
  // from 2.8 m (distanceM, it was 1.4) and about as high as before (followPitchBiasDeg -19): the whole strip is at the
  // top, the mirror body just under it, and your whole body below them, head on the midline, none hiding another;
  // the crosshair opens on the empty space between the mirror body and your feet. After the lead's larger strip
  // (ns-app BRAIN_START_MOTOR_FRAC 0.58) the same day: the aim point 0.5 m above the eyes (it was 0.2), distanceM 3.0 and
  // followFovYDeg 66 -> 74, so the whole of the larger strip is still in the picture.)
  // (19 November 2026, later, after a second check: from 3.0 m your body was 210 px tall at 1600x900 and the mirror body
  // 90, half of what they were, with the lower third of the picture empty. The camera now stands 1.65 m from an aim
  // point 0.85 m ahead of and 0.3 m above your eyes, a little flatter (followPitchBiasDeg -19 -> -14) and wider
  // (followFovYDeg 78): the whole strip is still at the top, your body is about 380 px tall and reaches the lower
  // edge, and the mirror body, which is drawn larger and lower from outside (ns-mirror MIRROR_OUTSIDE magnifyBy /
  // dropM), stands about 230 px tall between the strip and your feet.)
  followOffsetM: Object.freeze([0, 0.3, -0.85]),
  // (fourth pass, 18 November 2026: 75 -> 24. Side-on, the brain beyond the feet was cut off at the right edge, so no
  // area could be switched on from outside. From 24 degrees round, the camera stands behind your right shoulder: the
  // whole body is seen three-quarter from behind, in its true proportions, with the whole motor strip beyond the
  // feet, and the crosshair opens on the bare brain between its arrows and the mirror body. A look 51 degrees to the
  // left still brings the side-on picture of the posture, 24 to the right the one from straight behind.)
  // (18 November 2026, after a check of the 24: from behind the right shoulder the lying body was seen end-on, its
  // legs foreshortened to stumps that read as cut off, and the tip by the crosshair opened over them. 24 -> 66: the
  // camera stands to the right and a little behind, so the whole body, head to feet, is seen three-quarter from the
  // side in its true proportions, with the right half of the motor strip beyond the feet (the brain is twice the
  // size it was when 75 cut it off) and the crosshair in the open beside the brain. A look 66 to the right brings
  // the picture from straight behind with the whole strip.)
  // (18 November 2026, late, package FLAT: 66 -> 50 with distanceM 1.7 -> 1.9 and followFovYDeg 60 -> 66. With the
  // brain now beyond and below the feet, at 66 only the right half of the strip was in the picture; at 50 the whole
  // strip, both halves, is in it beside the body, which is still seen from the side in its true proportions.)
  // (19 November 2026, the owner: "For third-person view, the head should not be shifted to the right, such that when
  // you make it neutral, the head is always tilted to the right. It's extremely disturbing. It should just start off in
  // the middle." The head was never turned: the CAMERA stood 50 degrees round to the right, so the body lay slanted
  // across the picture with its head to one side. 50 -> 0: the camera stands straight behind the head, on the body's
  // midline, and higher (followPitchBiasDeg 16 -> -20: it looks down along the lying body instead of across it, so
  // the legs are not hidden behind the trunk) and nearer (distanceM 1.9 -> 1.4). At a neutral look the head is at the
  // bottom middle of the picture, the body runs straight up the middle to the feet, and the mirror body and the
  // brain stand beyond them. A look to a side still carries the camera round the body by the same angle.)
  followYawDeg: 0,
  followBody: true,
  followPitchBiasDeg: -14,
  followMaxPitchDeg: 5,
  followYawMinDeg: -130,
  followYawMaxDeg: 130,
  // followFovYDeg: the view's own angle (up and down) from outside. The eye view's 108 degrees makes a body 1.5 m
  // away a small shape in the middle of the picture and stretches whatever nears an edge; at 60 degrees and 1.6 m
  // the lying body fills about half the picture's width and keeps its proportions. The scene eases the angle with
  // the view (ns-scene-three setCameraPose viewFovYDeg). null = the eye view's angle.
  followFovYDeg: 78,
  // (third pass: 1.6 -> 1.9: with the trunk rising more steeply from the pelvis and the centre a little higher, the feet left the bottom of the picture at 1.6)
  // (18 November 2026: 1.9 -> 1.7 with followYawDeg 66: the body a little larger, feet still inside the picture)
  distanceM: 1.65,
  defaultPitchDeg: -18,
  aimPitchBiasDeg: -16,
  aimAtBrain: true,
  minPitchDeg: -60,
  maxPitchDeg: 30,
  easeS: 0.4,
  headClear: Object.freeze({ startM: 0.12, fullM: 0.32 }),
  clearanceM: 0.06,
  maxDistanceM: 4,
  followHead: true,
  followMinPitchDeg: -80
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

/** R558 (followHead): the orbit centre for a head look (world m; eye: the posed eye in world m). With followOffsetM
 * [right, up, back] (THIRD_PERSON, issue hunt 2): that far to the right of the look and behind it along the floor, and
 * up along world up. Without it (null): centreFromEyeMm's superior part above the eye and its posterior part behind it,
 * along the look's floor direction (the earlier camera straight behind the head). */
export function followCentre(eye, look, { centreFromEyeMm = THIRD_PERSON.centreFromEyeMm, followOffsetM = THIRD_PERSON.followOffsetM } = {}) {
  const e = vec3(eye, 'eye'), l = lookOf(look, 'look');
  if (followOffsetM != null) {
    const o = vec3(followOffsetM, 'followOffsetM'), s = Math.sin(l.yaw), c = Math.cos(l.yaw);
    // right of the look along the floor = (cos yaw, 0, -sin yaw); behind it = (sin yaw, 0, cos yaw)
    return [e[0] + o[0] * c + o[2] * s, e[1] + o[1], e[2] - o[0] * s + o[2] * c];
  }
  const off = vec3(centreFromEyeMm, 'centreFromEyeMm');
  const backM = off[1] * 0.001, upM = off[2] * 0.001;
  return [e[0] + backM * Math.sin(l.yaw), e[1] + upM, e[2] + backM * Math.cos(l.yaw)];
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

/** Sample the starting eye once. The playing camera never follows the animated anatomy. */
export function createPlayerCamera(eye, initialLook) {
  const startingEye = vec3(eye, 'starting eye position');
  const stand = eyeDolly(initialLook);
  // Leave room to raise either arm at normal desktop aspect ratios without changing the lens during play.
  const backM = 0.46;
  const forward = gazeDirection(initialLook.yaw, 0);
  return Object.freeze({
    first: Object.freeze(startingEye.map((value, i) => value + stand.offset[i] - backM * forward[i])),
    centre: Object.freeze(followCentre(startingEye, LEVEL_AHEAD)),
    distanceM: THIRD_PERSON.distanceM
  });
}

/** Direct look from a fixed eye-view position, or a constant-distance orbit requested by the player. */
export function playerCameraPose(state, camera, look, bodyLook = look) {
  const s = checkState(state);
  const { yaw, pitch } = lookOf(look, 'player look');
  const thirdPerson = s.view === 'third';
  const direction = gazeDirection(yaw, pitch);
  const position = thirdPerson ? camera.centre.map((value, i) => value - camera.distanceM * direction[i]) : camera.first;
  const progress = thirdPerson ? 1 : 0;
  return {
    view: s.view, progress, blend: progress, moving: false, firstPerson: !thirdPerson, thirdPerson,
    position, yaw, pitch, direction, bodyLook, gazeLook: { yaw, pitch }, gazeRay: { origin: position, dir: direction },
    silentGaze: s.arrived === true, fixedObserver: true, headInPlace: progress, faceGhost: 1 - progress,
    overBrainSeeThrough: 1 - progress, nearM: FIRST_PERSON.nearM, fovScale: 1,
    farExtraM: thirdPerson ? camera.distanceM : 0,
    ...(thirdPerson ? { orbitCentre: camera.centre, boom: { distance: camera.distanceM, pushed: false, blocked: false },
      viewFovYDeg: THIRD_PERSON.followFovYDeg } : {})
  };
}

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
 * blocked: true to ignore the key (e.g. while F holds the brain or the mirror body, or while paused).
 * Returns { state, controlsLook, changed }: the app must set the controls' look to controlsLook (ns-controls state yaw /
 * pitch) when changed is true:
 *  - first -> third: fpLook := look; controlsLook = the start third-person look (defaultThirdLook) or, while the camera
 *    is still easing back from third person, the third-person look it is leaving (so the camera simply turns round);
 *  - third -> first: tpLook := the clamped look; controlsLook = the stored fpLook EXACTLY (return exactly).
 */
export function toggleView(state, { look, bodyToWorld = null, eyeBp = null, aimAt = null, blocked = false, rig = THIRD_PERSON, geometryFraming = false } = {}) {
  const r = { ...THIRD_PERSON, ...(rig || {}) };
  const { minPitchDeg, maxPitchDeg } = r;
  const s = checkState(state);
  const l = lookOf(look, 'look');
  if (blocked === true) return { state: s, controlsLook: l, changed: false };
  // R442 engineering mode: E changes the observer translation, never the live physical-look intent.
  // Legacy orbit yaw/pitch are NOT reinterpreted as a new anatomical/body look.
  if (geometryFraming === true) return {
    state: Object.freeze({ ...s, view: s.view === 'first' ? 'third' : 'first', fpLook: null, tpLook: null, arrived: false, toggles: s.toggles + 1 }),
    controlsLook: l, changed: true
  };
  // R558 (followHead): one look in both views; only the camera moves.
  if (r.followHead === true) return {
    state: Object.freeze({ ...s, view: s.view === 'first' ? 'third' : 'first', fpLook: null, tpLook: null, arrived: false, toggles: s.toggles + 1 }),
    controlsLook: l, changed: true
  };
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

/**
 * 20 November 2026 (hunt 5): how far the followBody camera can go (degrees), and the looks that take it there. In
 * cameraPose the look is held inside followMinPitchDeg..maxPitchDeg, the boom stands followYawDeg round from it and
 * followPitchBiasDeg lower, its yaw is held inside followYawMinDeg..followYawMaxDeg and its pitch at most
 * followMaxPitchDeg, then inside followMinPitchDeg..maxPitchDeg again. Past those looks the camera stood still while the
 * look ran on unseen (up to the eye view's own +-88 / +-170 degrees): the mouse then did nothing for a while on the way
 * back, and E opened the eye view on wherever the hidden look had got to (the black room above the brain). The app keeps
 * the look inside `look` while the view is outside.
 * Returns { camera: { yawMinDeg, yawMaxDeg, pitchMinDeg, pitchMaxDeg }, look: { ...the same } }, or null for a rig
 * without followHead and followBody (its pitch range is the controls' own, setPitchLimits).
 */
export function followReach(rig = THIRD_PERSON) {
  const r = { ...THIRD_PERSON, ...(rig || {}) };
  if (r.followHead !== true || r.followBody !== true) return null;
  const yawOff = isNum(r.followYawDeg) ? r.followYawDeg : 0, bias = isNum(r.followPitchBiasDeg) ? r.followPitchBiasDeg : 0;
  const top = Math.min(isNum(r.followMaxPitchDeg) ? r.followMaxPitchDeg : r.maxPitchDeg, r.maxPitchDeg);
  const camera = { yawMinDeg: isNum(r.followYawMinDeg) ? r.followYawMinDeg : -Infinity, yawMaxDeg: isNum(r.followYawMaxDeg) ? r.followYawMaxDeg : Infinity,
    pitchMinDeg: Math.min(r.followMinPitchDeg, top), pitchMaxDeg: top };
  const look = { yawMinDeg: camera.yawMinDeg - yawOff, yawMaxDeg: camera.yawMaxDeg - yawOff,
    pitchMinDeg: Math.max(r.followMinPitchDeg, camera.pitchMinDeg - bias), pitchMaxDeg: Math.min(r.maxPitchDeg, camera.pitchMaxDeg - bias) };
  if (look.pitchMinDeg > look.pitchMaxDeg) look.pitchMinDeg = look.pitchMaxDeg = (look.pitchMinDeg + look.pitchMaxDeg) / 2;
  return Object.freeze({ camera: Object.freeze(camera), look: Object.freeze(look) });
}

/** Drive B: the controls' look kept inside the current view's limits: third person clamps the pitch (so the mouse has
 * no dead zone at the limit); first person is unchanged (ns-controls' own +/- 80 deg). */
export function constrainLook(state, look, { minPitchDeg = THIRD_PERSON.minPitchDeg, maxPitchDeg = THIRD_PERSON.maxPitchDeg, followHead = THIRD_PERSON.followHead } = {}) {
  const s = checkState(state);
  const l = lookOf(look, 'look');
  return s.view === 'third' && followHead !== true ? clampThirdLook(l, { minPitchDeg, maxPitchDeg }) : l;
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
const LEVEL_AHEAD = Object.freeze({ yaw: 0, pitch: 0 });
export function cameraPose(state, { look = null, bodyLook = null, thirdLook = null, bodyToWorld = null, eyeBp = null, avoid = null, rig = THIRD_PERSON, firstPersonFrame = null, handRayFraming = null } = {}) {
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
  if (handRayFraming !== null) {
    if (driveA || !isLook(look) || typeof handRayFraming !== 'function') fail('camera_input', 'hand-ray framing requires one live physical look and a pure data callback');
    fp = { yaw: look.yaw, pitch: look.pitch }; tpLook = null;
  } else if (driveA) { fp = { yaw: bodyLook.yaw, pitch: bodyLook.pitch }; tpLook = clampThirdLook(thirdLook, r); }
  else if (r.followHead === true) {
    // R558 (followHead): the body keeps the live look in both views; the boom follows it (its pitch held in range).
    fp = { yaw: look.yaw, pitch: look.pitch };
    tpLook = s.view === 'third' || s.progress > 0 ? clampThirdLook(fp, { minPitchDeg: r.followMinPitchDeg, maxPitchDeg: r.maxPitchDeg }) : null;
  } else {
    const live = { yaw: look.yaw, pitch: look.pitch };
    fp = s.view === 'third' && isLook(s.fpLook) ? { yaw: s.fpLook.yaw, pitch: s.fpLook.pitch } : live;
    tpLook = s.view === 'third' ? clampThirdLook(live, r) : isLook(s.tpLook) ? clampThirdLook(s.tpLook, r) : null;
  }
  const reference = typeof firstPersonFrame === 'function' ? firstPersonFrame(fp) : null;
  if (firstPersonFrame !== null && typeof firstPersonFrame !== 'function') fail('camera_input', 'firstPersonFrame must be a pure source-frame function');
  const firstOrigin = reference ? vec3(reference.position, 'first-person position world m') : [0, 0, 0];
  // 18 November 2026 (EYE_DOLLY): with the configured eye view the first-person camera stands behind the eye on its
  // own line of sight; firstOrigin stays the eye (the arm's parent point, the orbit centre's base).
  const dolly = reference && handRayFraming === null ? eyeDolly(fp) : null;
  const dollyM = dolly ? dolly.backM : 0, raiseM = dolly ? dolly.upM : 0, dollyOn = dollyM > 0 || raiseM > 0;
  const firstCam = dollyOn ? [firstOrigin[0] + dolly.offset[0], firstOrigin[1] + dolly.offset[1], firstOrigin[2] + dolly.offset[2]] : firstOrigin;
  if (reference) { if (!isMat4(reference.bodyToWorld) || !isVec3(reference.eyeBp)) fail('camera_input', 'canonical body and original eye required'); bodyToWorld = reference.bodyToWorld; eyeBp = reference.eyeBp; }
  if (handRayFraming !== null && s.progress > 0) {
    if (!reference || !isMat4(reference.eyeToWorld)) fail('camera_input', 'hand-ray framing requires the selected canonical F');
    const data = handRayFraming(), ray = vec3(data && data.ray, 'canonical hand ray');
    if (ray[2] !== -1) fail('camera_input', 'hand ray uses depth-m parameter with z=-1');
    const path = handRayBoom(reference, ray, bodyToWorld, eyeBp, Array.isArray(avoid) ? avoid : bodyProxyWorld(bodyToWorld, eyeBp), r);
    const k = blend * path.exitDepthM, position = firstOrigin.map((v, i) => v + k * path.backDirection[i]);
    const dir = gazeDirection(fp.yaw, fp.pitch), fromEye = len(sub(position, firstOrigin));
    const head = bodyProxyWorld(bodyToWorld, eyeBp, [DEFAULT_BODY_PROXY[0]])[0];
    const headInPlace = smooth(r.headClear.startM, r.headClear.fullM, len(sub(position, head.centre)) - head.radius);
    return Object.freeze({ view: s.view, progress: s.progress, blend, firstPerson: false, thirdPerson: blend >= 1, moving: s.progress !== target,
      position, yaw: fp.yaw, pitch: fp.pitch, direction: dir, bodyLook: fp, gazeLook: { ...fp }, gazeRay: { origin: position.slice(), dir },
      silentGaze, headInPlace, faceGhost: 1 - blend, overBrainSeeThrough: 1 - blend, farExtraM: fromEye, nearM: FIRST_PERSON.nearM,
      orbitCentre: path.centre, boom: { distance: len(sub(position, path.centre)), pushed: false, blocked: false },
      handRayFraming: Object.freeze({ kind: 'geometry-hand-ray-observer-r442-v1', canonicalRay: ray, canonicalF: Array.from(reference.eyeToWorld),
        backDepthM: k, exitDepthM: path.exitDepthM, sphereRadiusM: path.radiusM, maximumRadiusM: path.maximumRadiusM, checkedKeepOutSpheres: path.checked,
        collisionPolicy: 'Whole continuous canonical-to-boom segment checked with original padded spheres; no jump through an obstacle or silent distance clamp',
        scope: 'Engineering posterior observer, not a measured anatomical eye or normalmechanics/pixel qualification' }) });
  }
  if (s.progress === 0 || tpLook === null) {
    const dir = gazeDirection(fp.yaw, fp.pitch);
    return Object.freeze({
      view: s.view, progress: s.progress, blend: 0, firstPerson: s.view === 'first', thirdPerson: false, moving: s.progress !== target,
      position: reference ? firstCam.slice() : [0, 0, 0], yaw: fp.yaw, pitch: fp.pitch, direction: dir,
      bodyLook: fp, gazeLook: fp, gazeRay: { origin: reference ? firstCam.slice() : [0, 0, 0], dir },
      silentGaze, headInPlace: 0, faceGhost: 1, overBrainSeeThrough: 1, farExtraM: dollyOn ? len(sub(firstCam, firstOrigin)) : 0, nearM: dolly ? dolly.nearM : FIRST_PERSON.nearM,
      orbitCentre: null, boom: null,
      ...(dollyOn ? { armParentPosition: firstOrigin.slice(), eyeDollyM: dollyM, eyeRaiseM: raiseM } : {}),
      ...(dolly ? { fovScale: dolly.fovScale } : {}) // 18 November 2026, late (EYE_DOLLY zRefM): the eye view's lens for this look
    });
  }
  const follow = r.followHead === true && !driveA;
  // R558 (followHead): the orbit centre rides on the posed head: above the eye and a little behind it along the look.
  // 18 November 2026, later (followBody): the centre is fixed over the body (the offset runs along the body's own
  // forward, the start direction), not carried round with the look.
  const overBody = follow && r.followBody === true;
  const centre = follow ? followCentre(firstOrigin, overBody ? LEVEL_AHEAD : fp, r) : orbitCentreWorld(bodyToWorld, eyeBp, r);
  const keepOut = Array.isArray(avoid) ? avoid : bodyProxyWorld(bodyToWorld, eyeBp);
  // 18 November 2026 (followYawDeg): the boom, and the camera on it, stand turned by a fixed angle from the head's
  // direction, so the lying body is seen from behind and to one side; the turn eases in with the view.
  const yawOff = follow && isNum(r.followYawDeg) ? r.followYawDeg * DEG : 0;
  let boomLook = yawOff ? { yaw: tpLook.yaw + yawOff, pitch: tpLook.pitch } : tpLook;
  if (overBody) {
    const lo = isNum(r.followYawMinDeg) ? r.followYawMinDeg * DEG : -Infinity, hi = isNum(r.followYawMaxDeg) ? r.followYawMaxDeg * DEG : Infinity;
    const bias = isNum(r.followPitchBiasDeg) ? r.followPitchBiasDeg * DEG : 0, top = isNum(r.followMaxPitchDeg) ? r.followMaxPitchDeg * DEG : r.maxPitchDeg * DEG;
    boomLook = { yaw: clamp(boomLook.yaw, lo, hi), pitch: Math.min(top, boomLook.pitch + bias) };
  }
  const tp = thirdPersonCamera(boomLook, centre, { ...r, ...(follow ? { minPitchDeg: r.followMinPitchDeg } : {}), avoid: keepOut });
  let yaw, pitch;
  if (overBody) { yaw = fp.yaw + blend * (tp.yaw - fp.yaw); pitch = fp.pitch + blend * (tp.pitch - fp.pitch); } // the camera faces the centre over the body; the turn eases in with the view
  else if (follow) { yaw = fp.yaw + blend * yawOff; pitch = fp.pitch; } // the camera turns with the head (a fixed angle apart); only its place moves
  else if (blend >= 1) { yaw = tp.yaw; pitch = tp.pitch; }
  else { yaw = fp.yaw + blend * wrapAngle(tp.yaw - fp.yaw); pitch = fp.pitch + blend * (tp.pitch - fp.pitch); }
  const position = reference ? firstCam.map((v, i) => (1 - blend) * v + blend * tp.position[i]) : [blend * tp.position[0], blend * tp.position[1], blend * tp.position[2]];
  const dir = gazeDirection(yaw, pitch);
  const fromEye = len(reference ? sub(position, firstOrigin) : position);
  const head = bodyProxyWorld(bodyToWorld, eyeBp, [DEFAULT_BODY_PROXY[0]])[0];
  const outsideHead = len(sub(position, head.centre)) - head.radius;
  const headInPlace = smooth(r.headClear.startM, r.headClear.fullM, outsideHead);
  return Object.freeze({
    view: s.view, progress: s.progress, blend, firstPerson: false, thirdPerson: blend >= 1, moving: s.progress !== target,
    position, yaw, pitch, direction: dir,
    bodyLook: fp, gazeLook: { yaw, pitch }, gazeRay: { origin: position.slice(), dir },
    silentGaze, headInPlace, faceGhost: 1 - blend, overBrainSeeThrough: 1 - blend, farExtraM: fromEye,
    // 18 November 2026, late: the eye view's near plane eases out with the view (no flash of the back of your head)
    nearM: dolly ? FIRST_PERSON.nearM + (1 - blend) * (dolly.nearM - FIRST_PERSON.nearM) : FIRST_PERSON.nearM,
    ...(dolly ? { fovScale: 1 + (1 - blend) * (dolly.fovScale - 1) } : {}),
    orbitCentre: centre, boom: { distance: tp.distance, pushed: tp.pushed, blocked: tp.blocked },
    viewFovYDeg: overBody && isNum(r.followFovYDeg) && r.followFovYDeg > 0 ? r.followFovYDeg : null
  });
}

// R442: the positive line/sphere exit preserves the existing third-person boom radius.
// The observer travels BACK on the canonical hand ray. No body/arm matrix is translated here.
function handRayBoom(reference, ray, bodyToWorld, eyeBp, avoid, r) {
  const F = reference.eyeToWorld, f = vec3(reference.position, 'canonical F origin');
  const backDirection = [0, 1, 2].map(i => -(F[i] * ray[0] + F[4 + i] * ray[1] + F[8 + i] * ray[2]));
  const centre = orbitCentreWorld(bodyToWorld, eyeBp, r), q = sub(f, centre);
  const A = dot(backDirection, backDirection), B = dot(backDirection, q);
  const radiusM = r.distanceM, maximumRadiusM = r.maxDistanceM;
  if (!(A > 0 && isNum(A) && isNum(radiusM) && radiusM > 0 && isNum(maximumRadiusM) && maximumRadiusM >= radiusM && isNum(r.clearanceM) && r.clearanceM >= 0)) fail('camera_input', 'invalid existing boom geometry');
  const discriminant = B * B - A * (dot(q, q) - radiusM * radiusM);
  if (!(discriminant >= 0 && isNum(discriminant))) fail('camera_input', 'hand-ray boom sphere has no real intersection');
  const exitDepthM = (-B + Math.sqrt(discriminant)) / A;
  if (!(exitDepthM >= 0 && isNum(exitDepthM))) fail('camera_input', 'canonical observer is beyond the forward boom exit');
  const endpoint = f.map((v, i) => v + exitDepthM * backDirection[i]);
  // Squared norm is convex: endpoints bound this whole straight path relative to the same body centre.
  if (Math.max(len(q), len(sub(endpoint, centre))) > maximumRadiusM) fail('camera_input', 'hand-ray path exceeds the original maximum boom bound');
  let checked = 0;
  for (let index = 0; index < avoid.length; index++) {
    const sphere = avoid[index];
    if (!sphere || !isVec3(sphere.centre) || !(isNum(sphere.radius) && sphere.radius >= 0)) fail('camera_input', 'invalid hand-ray keep-out sphere');
    const u = sub(f, sphere.centre), at = clamp(-dot(backDirection, u) / A, 0, exitDepthM);
    const closest = u.map((v, i) => v + at * backDirection[i]), padded = sphere.radius + r.clearanceM;
    checked++;
    if (dot(closest, closest) < padded * padded) {
      const error = new Error('ns:camera_input: continuous hand-ray observer path intersects an original padded keep-out sphere');
      error.code = 'whole_arm_display_refused'; error.detail = { status: 'refused', reason: 'hand_ray_camera_path_collision',
        index, sphereName: typeof sphere.name === 'string' ? sphere.name : null, centre: Array.from(sphere.centre), radiusM: sphere.radius,
        clearanceM: r.clearanceM, closestDepthM: at, closestDistanceM: len(closest), exitDepthM, canonicalF: Array.from(F), ray: Array.from(ray) };
      throw error;
    }
  }
  return { centre, backDirection, exitDepthM, radiusM, maximumRadiusM, checked };
}

/**
 * 20 November 2026 (ns-app NECK_VIEW; the owner: "certainly in first person view and all other views, neck movement is
 * exaggerated, so you can see it's moving"): a settled eye-view pose (cameraPose, first person, progress 0) turned to
 * `look` { yaw, pitch } (radians) and rolled by rollRad about its own line of sight, as the head would carry it. The
 * camera stays about the same eye (pose.armParentPosition, the eye; or the camera itself when it stands at the eye) and
 * stands where EYE_DOLLY puts it for that look, exactly as cameraPose does for an ordinary look, so the turn changes
 * nothing's size; the crosshair ray, the camera's own look and the lens follow. bodyLook (the look the body, the
 * shoulder and the left hand use) is kept: the body does not turn with it. Any other pose comes back unchanged. Pure.
 */
export function turnEyeView(pose, look, rollRad = 0) {
  if (!pose || pose.firstPerson !== true || pose.progress !== 0 || !isLook(look)) return pose;
  const eye = isVec3(pose.armParentPosition) ? pose.armParentPosition : isVec3(pose.position) ? pose.position : null;
  if (!eye) return pose;
  const atEye = !isVec3(pose.armParentPosition);
  const dolly = atEye ? null : eyeDolly(look);
  const position = dolly ? [eye[0] + dolly.offset[0], eye[1] + dolly.offset[1], eye[2] + dolly.offset[2]] : eye.slice();
  const dir = gazeDirection(look.yaw, look.pitch), l = { yaw: look.yaw, pitch: look.pitch };
  return Object.freeze({ ...pose, position, yaw: l.yaw, pitch: l.pitch, direction: dir, gazeLook: l, gazeRay: { origin: position.slice(), dir },
    roll: isNum(rollRad) ? rollRad : 0,
    ...(dolly ? { farExtraM: len(sub(position, eye)), nearM: dolly.nearM, fovScale: dolly.fovScale, eyeDollyM: dolly.backM, eyeRaiseM: dolly.upM } : {}) });
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
      orbitCentre: Array.isArray(pose.orbitCentre) ? pose.orbitCentre.map(r6) : null,
      // (20 November 2026: EYE_CLEAR) the eye, and how far the camera was moved off your own limbs (m)
      eye: Array.isArray(pose.armParentPosition) ? pose.armParentPosition.map(r6) : null, eyeClearM: isNum(pose.eyeClearM) ? pose.eyeClearM : 0
    } : null
  };
}
