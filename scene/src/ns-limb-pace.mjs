/** NeuroSurge: the pace of your own limbs under the keys, the light of a limb at the end of its range, and limbs that
 * neither stay pushed after a movement from the brain nor pass through each other (22 November 2026, LIMBS2; a browser
 * hunt of Body update 64, findings H1, H2 and H3, and a check of the SEEMOVE rounds: a leg left 87 mm off its place).
 *
 * Pure maths, no DOM, no three.js: points are world metres [x, y, z], angles degrees. The app (ns-app stepLimbHold,
 * stepLimbPush) uses these. Display rules of this game's controls; nothing here is a measured movement, force or speed.
 */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = a => Math.hypot(a[0], a[1], a[2]);

/**
 * LIMB_PACE (the hunt, H1; the owner, section 185: "the limb keys never whip"; Message 186: A and D swing a limb about
 * the shoulder or hip with its bend unchanged). The keys move a limb's END (the hand, the ankle) at the keys' pace and
 * the cut of section 185 (ns-app LIMB_KEYS.view keyMost) kept only the end to it. Nothing kept the ELBOW or the KNEE:
 * with the elbow fully bent (after S) the hand lies close to the shoulder, near the line about which the shoulder's
 * forward raise turns the arm; there the two shoulder joints the keys' solve uses turn almost the same way (measured
 * offline on the game's body: their columns went from 58 to 11 degrees apart, the smaller singular value from 1.22 to
 * 0.14 mm a degree, against a damping of 0.81), and the damped step answered a 1 to 2 cm step of the hand with 12 to 24
 * degrees of upper arm a frame. A or D then threw the upper arm round the shoulder, back behind the trunk or up over the
 * head, in a third of a second (the elbow at 2 to 4 m/s, the hand at 0.6), and a short tap kept it swinging after the
 * key was up. Now, on a frame of the keys:
 *   bendMost   the elbow or knee point goes at most this many times the keys' own way this frame, as the end does
 *              (the same keyMost, 1.25): no part of the limb is faster than the keys move its end;
 *   rhoFar, creepMost   and where the elbow or knee goes more than rhoFar times as far as it would if the limb swung
 *              as one piece about the shoulder or hip to carry the end its own way this frame (the "throw" itself: the
 *              limb turning round its own line from the shoulder to the hand, which moves the elbow and not the hand),
 *              the frame is taken only slowly: the elbow or knee at most creepMost times the keys' way. Where the joints
 *              can bring the end the keys' way ONLY so (the folded arm under A or D), the limb curls that way slowly, as
 *              LIMBFREE lets an end curl off the keys' line (keyLatFar), and is never thrown;
 *   releaseStops  when the keys are let go, the place the limb was being taken to is put where its end is: the keys'
 *              lead (up to 2 cm ahead of the end) is not chased after the key is up (a 0.1 s tap went on swinging the
 *              arm for 0.9 s).
 * Measured offline on the game's body (96 right-arm poses, each key 0.75 s, 13 018 moving frames, before the change): the
 * elbow went 6.0 / 16.8 / 43.8 / 94.4 mm a frame (median / 90th / 99th percentile / most) for the keys' 10; its move over
 * the one-piece swing's ("rho") had a 99th percentile of 4.1 under W, 5.5 under S, 3.0 under A, 11.6 under D, and 7 to
 * 25 in the hunt's throw. With these values, offline: S 2.5 s then D 0.6 s turns the upper arm 29 degrees (was 86, to
 * its back end), the elbow at most 12.5 mm a frame (was 108), the hand 31 mm (was 68); after a 0.1 s tap nothing moves;
 * over the same 384 runs of each key the elbow's 90th percentile is 12.5 mm a frame for every key and 58 runs moved the
 * end under 2 cm in 0.75 s (52 before); the project's trap grid (tests/limb-hold.test.mjs, two keys at least 3 mm in
 * 0.1 s from 132 poses) passes. creepMost 0.3 left two folded right-arm poses with W alone (A 2 to 3 mm, D 0 to 1).
 * Tried and dropped: a move whose elbow went more than 4 times as far as the hand WAITS (the folded arm then answered only
 * W: A and D waited, S was at the fold; the project's own test asks for two keys); the cut of the elbow's pace alone (the
 * throw became a 0.6 s sweep of the upper arm behind the trunk for 5 cm of hand); a cut of the out-of-plane part of the
 * elbow's move (the arm's two shoulder joints turn the forearm's plane under W and S too: half of all W and S frames would
 * have been slowed); a damping in proportion to the solve's largest column (it cannot bound a step that answers the 2 cm
 * lead without making the folded arm slow everywhere).
 */
/* 22 November 2026, second pass (a check of LIMBS2: "the folded right arm still ends behind the trunk (after S, D) and
 * over the head (after S, A, D) ... only slower"; "the creep makes A and D on a folded leg about 5 times slower"):
 *   swing, foldShare   A or D ALONE on a FOLDED limb (the end nearer the root than foldShare of the limb's full reach)
 *              swings the limb as one piece JUDGED BY ITS UPPER SEGMENT (limbSwingMove): the elbow or knee point turns
 *              toward the body's right or left on its ball round the shoulder or hip, and the end is carried with it
 *              rigidly. A / D turned the line from the shoulder to the HAND; with the hand at the shoulder the joints could
 *              only answer that by swinging the whole upper arm round (behind the trunk, over the head). The upper arm
 *              now goes out to the side (abduction, the owner's own words for A / D, Message 186) and comes back the same
 *              way. Where that swing cannot be followed (the hanging folded arm brought across: the combined-range rule
 *              allows no crossing that low), the frame falls back to the turn of the shoulder-to-hand line, so A still
 *              brings the folded arm across the chest. A straight or part-bent limb is moved as before.
 *   leg        the legs' own values: a thigh swung out with the knee drawn up moves the knee about twice as far as the
 *              ankle, a sweep and not a throw (rho 2.0 to 2.15, where the arm's throw was 7 to 25), and the arm's values
 *              held a folded leg's A and D to about a fifth of the keys' pace (0.11 m/s for 0.6). A leg's knee may go
 *              bendMost 2.5 times the keys' way and no creep is applied to a leg. And a leg is not swung: its sideways
 *              lift ends at 45 degrees, and a swing judged by the thigh then went on by lowering the thigh, so A took a
 *              left leg drawn up out to the side and on down and back behind you (in the browser, 746 mm of ankle in
 *              2.5 s); the turn of the hip-to-ankle line stops at the lift's end, as before LIMBS2.
 */
export const LIMB_PACE = Object.freeze({ on: true, bendMost: 1.25, rhoFar: 2, creepMost: 0.5, releaseStops: true,
  swing: true, foldShare: 0.6, leg: Object.freeze({ bendMost: 2.5, rhoFar: null, creepMost: null, swing: false }) });

/** LIMB_PACE: the values for a limb ('rightArm', 'rightLeg', 'leftLeg'): the legs' own (LIMB_PACE.leg) over the arm's.
 * Pure. */
export function paceFor(limb, o = LIMB_PACE) {
  return o && o.leg && (limb === 'rightLeg' || limb === 'leftLeg') ? { ...o, ...o.leg } : o;
}

/** LIMB_PACE rhoFar: how many times as far the bend point goes as a swing of the limb as one piece about its root would
 * take it for the end's own move (before / after: { root, bend, end }, world m; the end's move counted at least
 * floorM). 1 for such a swing; 0 when the bend point does not move. Pure. */
export function limbBendRho(before, after, floorM = 1e-4) {
  const bm = len(sub(after.bend, before.bend));
  if (!(bm > 0)) return 0;
  const er = len(sub(before.end, before.root)), br = len(sub(before.bend, before.root));
  if (!(er > 1e-6)) return Infinity;
  return bm / (Math.max(len(sub(after.end, before.end)), floorM) * br / er);
}

/** LIMB_PACE: the share (0..1] of a frame's joint change the keys keep so that the bend point goes at most bendMost x
 * the keys' way (wayM, m), and at most creepMost x the way where it goes more than rhoFar x the one-piece swing's
 * (limbBendRho, the end's move counted at least a twentieth of the way). before / after: { root, bend, end } (world m;
 * after: where the whole change would put them). 1 when the rule is off, there is no way, or nothing is over. Pure (the
 * caller measures again after the cut: the pose is not linear in the joints). */
export function limbPaceShare(before, after, wayM, o = LIMB_PACE) {
  if (!o || o.on === false || !(wayM > 1e-9) || !before || !after) return 1;
  const bm = len(sub(after.bend, before.bend));
  let most = Number.isFinite(o.bendMost) ? o.bendMost : Infinity;
  if (Number.isFinite(o.rhoFar) && Number.isFinite(o.creepMost) && limbBendRho(before, after, 0.05 * wayM) > o.rhoFar) most = Math.min(most, o.creepMost);
  return bm > most * wayM ? (most * wayM) / bm : 1;
}

/** LIMB_PACE foldShare: whether a limb is folded: its end nearer its root than foldShare of its full reach (the upper and
 * lower segments' lengths together). pts: { root, bend, end } (world m). Pure. */
export function limbFolded(pts, o = LIMB_PACE) {
  if (!pts || !o || !Number.isFinite(o.foldShare)) return false;
  const reach = len(sub(pts.bend, pts.root)) + len(sub(pts.end, pts.bend));
  return reach > 1e-6 && len(sub(pts.end, pts.root)) < o.foldShare * reach;
}

/** LIMB_PACE swing: where A (ax -1) or D (+1) take `place` (world m; the end, or the place the keys keep ahead of it) on a
 * folded limb: the limb turned as one piece about its root, about the axis that turns the upper segment (root -> bend)
 * toward bodyRight (unit, world) or away from it, by the angle that moves the end stepM (m), at most the angle that moves
 * the bend point bendMost x stepM, and no further than the upper segment pointing straight along the body's right or
 * left. pts: { root, bend, end } (world m) as the limb is drawn now. null when the rule is off or the upper segment
 * already points that way (nothing to swing). Pure; returns a new [x, y, z]. */
export function limbSwingMove(pts, place, bodyRight, ax, stepM, o = LIMB_PACE) {
  if (!o || o.on === false || o.swing === false || !pts || !place || !ax || !(stepM > 0)) return null;
  const b = sub(pts.bend, pts.root), bl = len(b);
  if (!(bl > 1e-6)) return null;
  const u = [b[0] / bl, b[1] / bl, b[2] / bl], d = bodyRight[0] * u[0] + bodyRight[1] * u[1] + bodyRight[2] * u[2];
  const t = [bodyRight[0] - d * u[0], bodyRight[1] - d * u[1], bodyRight[2] - d * u[2]], tl = len(t);
  if (!(tl > 1e-3)) return null;
  const sg = ax > 0 ? 1 : -1, th = [t[0] / tl, t[1] / tl, t[2] / tl];
  const n = [(u[1] * th[2] - u[2] * th[1]) * sg, (u[2] * th[0] - u[0] * th[2]) * sg, (u[0] * th[1] - u[1] * th[0]) * sg]; // (unit: u and th are)
  const e = sub(pts.end, pts.root), ne = len([n[1] * e[2] - n[2] * e[1], n[2] * e[0] - n[0] * e[2], n[0] * e[1] - n[1] * e[0]]);
  const left = Math.atan2(tl, sg * d); // (the angle still to go before the upper segment points along the right or left)
  const bend = Number.isFinite(o.bendMost) ? (o.bendMost * stepM) / bl : Infinity;
  const ang = Math.min(ne > 1e-6 ? stepM / ne : Infinity, bend, left);
  if (!(ang > 0) || !Number.isFinite(ang)) return null;
  const v = sub(place, pts.root), c = Math.cos(ang), sn = Math.sin(ang), k = (n[0] * v[0] + n[1] * v[1] + n[2] * v[2]) * (1 - c);
  const x = [n[1] * v[2] - n[2] * v[1], n[2] * v[0] - n[0] * v[2], n[0] * v[1] - n[1] * v[0]];
  return [pts.root[0] + v[0] * c + x[0] * sn + n[0] * k, pts.root[1] + v[1] * c + x[1] * sn + n[1] * k, pts.root[2] + v[2] * c + x[2] * sn + n[2] * k];
}

/**
 * HOLD_LIGHT (the hunt, H2; the owner: no blinking or flicker, "the game currently physically hurts to look at with your
 * eyes"; light may rise, hold and fade, slowly). Holding D with the drawn-in right arm at the back end of its range, the
 * keys' solve could not settle: each frame it moved the shoulder's sideways joint back and forth by 0.01 to 0.3 degrees
 * (after the key was up, by 0.0001 to 0.004), every such change counted as a move (over 1e-6 degrees), and each lit the
 * area and action of its own direction: "lift the arm sideways", which lights the big shoulder muscle beside the eye, and
 * "bring it in", which lights muscles out of view, in turn, about 8 times a second, with the light beam to the brain
 * pulsing with them. Now, for the limb the view holds:
 *   minDeg   a frame whose largest joint change is under this is no move: nothing is set, nothing lights, and the hold
 *            stops solving the place it cannot reach (it ran on every frame until two answers were exactly equal);
 *   flipDeg  the light names a joint and direction only once that joint has gone at least this far that way since it
 *            last turned, and keeps naming it while it goes on that way: a joint trembling at the end of its range
 *            lights nothing new (the light it had fades as a pulse does), a real turn back lights after a degree.
 * on false: every change over 1e-6 degrees is a move and the joint that moved most lights, as before.
 */
export const HOLD_LIGHT = Object.freeze({ on: true, minDeg: 0.02, flipDeg: 1 });

/** HOLD_LIGHT: one frame of the held limb's light. prev: the last result or null ({ acc: { jointId: degrees gone the
 * same way since the joint last turned (signed) }, lit: the joint and direction last named, { id, sign } }); d: this
 * frame's change of each joint (degrees). Returns { acc, lit, move (whether the change is a move at all), light (the
 * joint and direction to light this frame, or null; true when the rule is off: the joint that moved most) }. Pure. */
export function holdLightStep(prev, d, o = HOLD_LIGHT) {
  let big = 0;
  for (const v of Object.values(d || {})) if (Number.isFinite(v)) big = Math.max(big, Math.abs(v));
  if (!o || o.on === false) return { acc: {}, lit: null, move: big > 1e-6, light: true };
  const acc0 = prev && prev.acc ? prev.acc : {}, lit0 = prev && prev.lit ? prev.lit : null;
  if (!(big >= o.minDeg)) return { acc: acc0, lit: lit0, move: false, light: null };
  const acc = { ...acc0 };
  for (const [id, v] of Object.entries(d)) {
    if (!Number.isFinite(v) || Math.abs(v) < o.minDeg) continue;
    const a = Number.isFinite(acc[id]) ? acc[id] : 0;
    acc[id] = a !== 0 && Math.sign(a) !== Math.sign(v) ? v : a + v; // (a turn starts a new run)
  }
  const ok = id => Number.isFinite(d[id]) && Math.abs(d[id]) >= o.minDeg && Math.sign(d[id]) === Math.sign(acc[id]) && Math.abs(acc[id]) >= o.flipDeg;
  let light = lit0 && ok(lit0.id) && Math.sign(acc[lit0.id]) === lit0.sign ? lit0 : null;
  if (!light) {
    let best = null;
    for (const id of Object.keys(acc)) if (ok(id) && (best === null || Math.abs(acc[id]) > Math.abs(acc[best]))) best = id;
    light = best === null ? null : { id: best, sign: Math.sign(acc[best]) };
  }
  return { acc, lit: light || lit0, move: true, light };
}

/**
 * LIMB_BLOCK (the hunt, H3; the owner, Message 174: a limb that collides pushes the other "out of the way rather than
 * going through them"; LIMB_PUSH in ns-app). A leg swung out with the keys went straight through the arm on its side:
 * the push takes at most 12 mm a frame and only the overlap's growth, a thigh near the knee swept 20 to 34 mm a frame,
 * an arm pushed only partly follows (one solve step a frame; the left hand stops at its full reach and was counted as
 * pushed whether it moved or not), and an overlap once there was never pushed again. Now the push is backed by a stop:
 *   deepM   when the overlap of the chosen limb with another limb, measured each frame, has grown more than this past
 *           what it was when they first touched (the other limb did not give way as fast as the chosen one came, or
 *           could not give way at all), the pair BLOCKS: from then on a move of the chosen limb that would take it
 *           deeper into that limb waits (as a limb waits at the body or at a fully bent joint), whatever moves it (the
 *           keys or the look, with your trunk at rest), until the two no longer touch. A move along it or away is
 *           taken as before, and so is one that stays within deepM of where they first touched;
 *   tolM    "deeper": the overlap after the move more than this past the overlap now.
 * The push itself is unchanged: a limb that can give way is still pushed; the stop only takes over where it cannot.
 * Not during a trunk movement (a first version refused the view's hold there: with the right arm chosen, "Bend trunk
 * forward" carried it onto the thigh, the hold could not keep the hand in its place, and the arm was left 260 mm off it
 * when the trunk came back): a movement from the brain carries the limbs together and back by itself (PUSH_BACK).
 * A display rule on rods (each limb two rods with a thickness), not the drawn surfaces.
 */
export const LIMB_BLOCK = Object.freeze({ on: true, deepM: 0.008, tolM: 0.001 });

/** The deepest overlap (m) of two limbs' rods (each { root, bend, tip, r: [upper, lower] }, world m): the largest sum
 * of two rods' thicknesses less their distance, over the four pairs of rods (negative: apart by that much). nearest:
 * the rods' nearest points (ns-app rodsNearest). Pure. */
export function limbsOverlapM(A, B, nearest) {
  if (!A || !B || typeof nearest !== 'function') return -Infinity;
  const ra = [[A.root, A.bend, A.r[0]], [A.bend, A.tip, A.r[1]]], rb = [[B.root, B.bend, B.r[0]], [B.bend, B.tip, B.r[1]]];
  let best = -Infinity;
  for (const a of ra) for (const b of rb) { const q = nearest(a[0], a[1], b[0], b[1]); best = Math.max(best, a[2] + b[2] - q.d); }
  return best;
}

/** LIMB_BLOCK: whether a pair blocks, from its overlap now (pen) and when they first touched (pen0), both m. Pure. */
export function pushBlocks(pen, pen0, o = LIMB_BLOCK) {
  return Boolean(o && o.on !== false && Number.isFinite(pen) && Number.isFinite(pen0) && pen > pen0 + o.deepM);
}

/** LIMB_BLOCK: whether a blocked chosen limb's move waits: its overlap with the other limb would go from penNow to
 * penNew (m), deeper than now and deeper than `allowM` (the overlap when they first touched plus deepM: down to that a
 * limb that was drawn back out may come in again). Pure. */
export function blockRefuses(penNow, penNew, o = LIMB_BLOCK, allowM = -Infinity) {
  const floor = Math.max(Number.isFinite(penNow) ? penNow : -Infinity, Number.isFinite(allowM) ? allowM : -Infinity);
  return Boolean(o && o.on !== false && Number.isFinite(penNew) && penNew > floor + o.tolM);
}

/**
 * PUSH_BACK (a check of the SEEMOVE rounds, cases K4 and K3 of its break scenario: with the right arm chosen, "Bend trunk
 * forward" carried the arm onto the right thigh, the arm pushed the leg, and the leg stayed 87 mm off its place after the
 * trunk had come back; the owner, Message 206: "no permanent movements"). A limb pushed while your trunk (or the neck's
 * bow, which moves the shoulders) is not at rest is pushed by a movement that returns by itself, so it returns with it:
 * its angles go back from where the push left them to where they were before the first push of that movement, in step
 * with the trunk's way back (pushBackStep below, the same rule as the right arm let go during a movement), and are
 * exactly those once the trunk is at rest. A push at rest (the chosen limb moved by you into another) stays, as
 * Message 174 asks ("to put them back in place, of course, you've got to grasp them and move them"). A pushed limb you
 * choose before the trunk is back is yours: it stays where it is.
 * on false: every push stays, as before.
 * Second pass (a check of LIMBS2: P1, "Bend right knee" and then the trunk left the knee bent for good; P2, a knee
 * movement switched on during the trunk's return did not happen; and SEEMOVE round 7 changed ns-app holdArmBack's form,
 * so the call threw inside the frame once both were merged). The way back is this module's own step (pushBackStep), on
 * the joints' PLACES (the activity's bodyGoal: where each joint returns after a movement, never where a movement has it
 * now); the record is kept until every joint is home. Near rest and after it, what is left goes at most restDegS. The
 * app sets these places as places only (the activity's 'limbPlace', from SEEMOVE round 8), so a movement of the joint
 * under way goes on and returns to the new place; `moving` (leave such a joint alone) is for a caller that can only
 * set a joint's place and position at once. The push itself leaves a joint in a movement alone (ns-app stepLimbPush).
 */
export const PUSH_BACK = Object.freeze({ on: true, shareMin: 0.02, restDegS: 90 });

/** PUSH_BACK: the record of a limb pushed during a movement after one more push. rec: the record so far or null;
 * before / after: the limb's joint PLACES before and after this push (degrees by joint); away: how far the trunk is from
 * rest now (ns-app holdTrunkAway). The places to go back to stay those before the FIRST push (a joint first pushed later
 * gets its own); the way back is measured from this push on. Pure; returns a new record. */
export function pushBackAfter(rec, before, after, away) {
  const to = { ...before, ...(rec && rec.to ? rec.to : {}) };
  return { to, from: { ...after }, last: { ...after }, away0: away, share: 1 };
}

/** PUSH_BACK: one frame of a pushed limb's way back. rec: pushBackAfter's record (or the last step's); input { place: the
 * joints' places now (bodyGoal), moving(id): a movement of that joint or its return is under way, away: the trunk's
 * distance from rest, atRest, dt (s) }. Each joint's place goes from `from` to `to` in step with the share of the trunk's
 * way still to go (it never grows again); a moving joint is left alone; a joint whose place something else changed (the
 * end of its movement, another push) goes on from where it is; near rest and after it, what is left goes at most
 * restDegS. Returns { rec, joints (places to set now), done (at rest, every joint home, none moving) }. Pure. */
export function pushBackStep(rec, { place = {}, moving = () => false, away = 0, atRest = false, dt = 0 } = {}, o = PUSH_BACK) {
  const share = atRest ? 0 : Math.max(0, Math.min(rec.share, rec.away0 > 1e-9 ? away / rec.away0 : 0));
  const from = { ...rec.from }, last = { ...(rec.last || {}) }, joints = {};
  let busy = false, left = false;
  for (const id of Object.keys(rec.to)) {
    const to = rec.to[id];
    if (!Number.isFinite(to)) continue;
    if (moving(id)) { busy = true; continue; }
    const p = Number.isFinite(place[id]) ? place[id] : to;
    if (Number.isFinite(last[id]) && Math.abs(p - last[id]) > 1e-6 && share > o.shareMin) from[id] = to + (p - to) / share;
    let v;
    if (share > o.shareMin) v = to + ((Number.isFinite(from[id]) ? from[id] : p) - to) * share;
    else { const step = o.restDegS * (dt > 0 ? Math.min(dt, 0.1) : 0); v = Math.abs(to - p) <= step ? to : p + Math.sign(to - p) * step; }
    if (Math.abs(v - p) > 1e-9) joints[id] = v + 0;
    last[id] = v + 0;
    if (Math.abs(v - to) > 1e-6) left = true;
  }
  return { rec: { ...rec, from, last, share }, joints, done: atRest && !busy && !left };
}
