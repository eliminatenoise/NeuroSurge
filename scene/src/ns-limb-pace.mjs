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

/**
 * LIMB_ACROSS (22 November 2026, round r31, LIMBS4; section 195's "Not done": "A across the chest is the first pass's
 * slow curl"; the owner, section 185: "the limb keys never whip"). After S the right arm is folded, the hand by the
 * shoulder and the forearm out to its side. A (toward the body's other side) asked the joints' solve to turn the
 * shoulder-to-hand line; the cheapest answer was to raise the upper arm forward, which moves the elbow two to three
 * times as far as the hand, so the pace rule (LIMB_PACE creepMost) held the frame to a creep: in the browser on update 68
 * the hand went 0.4 to 0.5 mm a frame for the keys' 10 (2.5 s of A took it 42 mm toward the left; the elbow went 2.6
 * times as far), and the upper arm rose forward while the forearm still pointed out to the right. The movement that
 * brings a folded hand across is the upper arm's own turn about its length (turning it inward): the forearm swings
 * across in front of the body and the elbow stays where it is. Now:
 *   on        A (for the right arm; the side toward the body's other half) alone on a FOLDED limb (LIMB_PACE foldShare)
 *             first turns the upper arm about its length (the solve's `spin` joint, r_shoulder_rot), by the angle
 *             that moves the hand the keys' own step this frame (from the hand's move for one degree, measured on the
 *             drawn pose), as long as that move goes the keys' way (within offDeg) and the turn has range left; the
 *             frame's move is then tested as every key frame is (limbKeyFollow, the pace, the trunk and head keep-out,
 *             the other limbs' stop). The elbow does not move. Where it cannot (the turn's end, the chest), the frame
 *             falls back to the swing and the turn of the line, as before.
 *   back      D afterwards first turns the upper arm back the same way, to where A's turn began, and only then swings
 *             the folded arm out to the side as before (section 195): A then D comes back, not out with a turned arm.
 * The legs have no such joint (and their A and D are not slowed). on false: as before.
 */
export const LIMB_ACROSS = Object.freeze({ on: true, offDeg: 60, back: true });

/** LIMB_ACROSS: the turn (degrees, signed) of the upper arm about its length that moves the end the keys' own way `way`
 * this frame (world m), from `perDeg` (world m: the end's move for +1 degree of the turn, measured), the turn now `rot`
 * and its range [lo, hi] (degrees); `stop` (optional): a value the turn does not go past (D turning back to where A's
 * turn began). 0 when the rule is off, the move would be more than offDeg off the way, or no range is left that way.
 * Pure. */
export function spinStepDeg(perDeg, way, { rot = 0, lo = -Infinity, hi = Infinity, stop = null } = {}, o = LIMB_ACROSS) {
  if (!o || o.on === false || !perDeg || !way) return 0;
  const wl = len(way), pl = len(perDeg);
  if (!(wl > 1e-9) || !(pl > 1e-9)) return 0;
  const c = (perDeg[0] * way[0] + perDeg[1] * way[1] + perDeg[2] * way[2]) / (wl * pl);
  if (Math.abs(c) < Math.cos((Number.isFinite(o.offDeg) ? o.offDeg : 60) * Math.PI / 180)) return 0;
  const sg = c > 0 ? 1 : -1;
  let to = rot + sg * (wl / pl);
  to = Math.min(hi, Math.max(lo, to));
  if (Number.isFinite(stop)) to = sg > 0 ? Math.min(to, Math.max(rot, stop)) : Math.max(to, Math.min(rot, stop));
  const d = to - rot;
  return Math.abs(d) > 1e-6 && Math.sign(d) === sg ? d : 0;
}

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
 * 22 November 2026, round r30 (LIMBS3; a check of update 67, finding 3: the stop depended on the frame's length. The keys'
 * step and the knee's pace grow with the frame's time, so one long frame (a busy machine, 15 to 22 frames a second) took
 * the knee 147 mm in one frame; the first touch was found after the move, and the stop then held whatever overlap that
 * frame had left: both legs ended 81 and 94 mm into the arms).
 *   ahead   a move of the chosen limb (the keys or the look, with your trunk at rest) is first tested against each other
 *           limb it is not yet blocked by: where it would sink in deeper than the overlap now and deeper than deepM past
 *           where they first touched (slackM when they do not touch yet), only the share of the move that stays within
 *           that is taken (aheadShare; none: the move waits this frame). So however long a frame is, a limb comes in no
 *           deeper than the stop allows, and the push and the stop go on from there as on short frames. A move along or
 *           away is not changed. Tried and dropped: refusing the whole move (on long frames a leg then stopped up to a
 *           step short of the arm and never touched it); capping the frame time the keys' step uses at 1/30 s (the limbs
 *           slow down on a busy machine, and a long frame still sank the knee up to 50 mm).
 * ahead false: only the block below, after the first touch, as before.
 */
export const LIMB_BLOCK = Object.freeze({ on: true, deepM: 0.008, tolM: 0.001, ahead: true, aheadSteps: 5 });

/** LIMB_BLOCK ahead: the overlap (m) a move of the chosen limb may reach with another limb it is not blocked by: the
 * overlap now (penNow) or deepM past where they first touched (firstM: slackM when they do not touch yet), whichever is
 * more. Pure. */
export function aheadAllowM(penNow, firstM, o = LIMB_BLOCK) {
  return Math.max(Number.isFinite(penNow) ? penNow : -Infinity, (Number.isFinite(firstM) ? firstM : 0) + o.deepM);
}

/** LIMB_BLOCK ahead: the share (0..1) of a move to take. overAt(s): how far (m) the move's share s goes past what it may
 * reach (> 0: too deep; aheadAllowM against each limb, the worst); overAt(1) is asked first. 1 when the whole move is
 * within (tolM), else the largest share found within by aheadSteps halvings (0: none). Pure (overAt is the caller's). */
export function aheadShare(overAt, o = LIMB_BLOCK) {
  if (!o || o.on === false || o.ahead === false || typeof overAt !== 'function') return 1;
  if (!(overAt(1) > o.tolM)) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < (o.aheadSteps || 5); i++) { const m = (lo + hi) / 2; if (overAt(m) > o.tolM) hi = m; else lo = m; }
  return lo;
}

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

/**
 * LIMB_BLOCK leftArm (22 November 2026, round r31, LIMBS4; the owner, Message 174: a limb that collides pushes the other
 * "out of the way rather than going through them"; the checks of LIMBS2 and LIMBS3: "your left arm, when you move it, is
 * not stopped"). The left arm is the game arm: its own rig puts the hand at the place the view asks of it in the
 * simulation's step, so the stop cannot be tested on a pose the joints' solve found, as for the other limbs; it is
 * tested on the PLACE before the step. Measured in the browser on update 68 (left leg S 1.2 s, then the left arm chosen
 * and D 1 s): the left forearm went 122 mm deep into the folded left thigh, which cannot give way; with the right leg
 * folded, 105 mm into the right thigh.
 *   on      the left hand's place asked of the step, when the keys or the look move it with your trunk at rest, is cut
 *           as the other limbs' moves are (LIMB_BLOCK ahead, aheadShare: only the share of the move from where the hand
 *           is that sinks into no other limb deeper than the overlap now and deepM past where they first touched), and
 *           a move deeper into a limb that blocks it (LIMB_BLOCK deepM, the push could not move it) waits. The arm at a
 *           trial place is the two-rod arm with the elbow kept on its side (leftArmRodsAt below): the rig's own elbow
 *           swings toward its side at most FREE_HAND.swivelDegPerS, a few degrees a frame, so one frame's trial is
 *           within millimetres of the pose the step then draws.
 * on false: the left arm is not stopped, as before (it still pushes the others).
 */
export const LEFT_ARM_BLOCK = Object.freeze({ on: true });

/** LEFT_ARM_BLOCK: the bend point of a two-rod limb whose end is moved to `at` (world m), its root fixed, the two rods'
 * lengths kept (root -> bend, bend -> end as they are now) and the bend on the side of the root -> end line it is on now
 * (the nearest point of the circle it can lie on). pts: { root, bend, end } now. A place beyond the reach is taken at
 * the reach on the same line (the limb straight), one nearer than the fold at the fold. Pure; returns a new [x, y, z]. */
export function twoRodBendAt(pts, at) {
  const r = pts.root, l1 = len(sub(pts.bend, r)), l2 = len(sub(pts.end, pts.bend));
  const v = sub(at, r), dRaw = len(v);
  if (!(dRaw > 1e-9) || !(l1 > 1e-9)) return pts.bend.slice();
  const u = [v[0] / dRaw, v[1] / dRaw, v[2] / dRaw];
  const d = Math.min(l1 + l2 - 1e-9, Math.max(Math.abs(l1 - l2) + 1e-9, dRaw));
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  // (the side: the bend's offset now across the new line; the old line's if that is too small)
  const b = sub(pts.bend, r), bu = b[0] * u[0] + b[1] * u[1] + b[2] * u[2];
  let w = [b[0] - bu * u[0], b[1] - bu * u[1], b[2] - bu * u[2]], wl = len(w);
  if (!(wl > 1e-6)) {
    const e = sub(pts.end, r), el = len(e) || 1, eu = [e[0] / el, e[1] / el, e[2] / el], k = b[0] * eu[0] + b[1] * eu[1] + b[2] * eu[2];
    const w2 = [b[0] - k * eu[0], b[1] - k * eu[1], b[2] - k * eu[2]], wu = w2[0] * u[0] + w2[1] * u[1] + w2[2] * u[2];
    w = [w2[0] - wu * u[0], w2[1] - wu * u[1], w2[2] - wu * u[2]]; wl = len(w);
  }
  if (!(wl > 1e-6)) return [r[0] + u[0] * l1, r[1] + u[1] * l1, r[2] + u[2] * l1];
  return [r[0] + u[0] * a + w[0] / wl * hh, r[1] + u[1] * a + w[1] / wl * hh, r[2] + u[2] * a + w[2] / wl * hh];
}

/** LEFT_ARM_BLOCK: the share (0..1) of the left hand's move from `from` toward `to` (world m) to take, and the place:
 * { share, at }. overAt(p): how far (m) the arm with its hand at p goes past what it may reach (> 0: too deep; the
 * caller's aheadAllowM against each limb, the worst); refuses(p): true when the move to p goes deeper into a limb that
 * blocks the arm (LIMB_BLOCK; optional). A move that refuses waits ({ share 0, at: from }); otherwise aheadShare. Pure
 * (the callbacks are the caller's). */
export function leftArmMoveCut(from, to, overAt, refuses = null, o = LIMB_BLOCK) {
  if (!from || !to) return { share: 1, at: to };
  const at = s => (s === 1 ? to : [from[0] + (to[0] - from[0]) * s, from[1] + (to[1] - from[1]) * s, from[2] + (to[2] - from[2]) * s]);
  if (typeof refuses === 'function' && refuses(to)) return { share: 0, at: from.slice() };
  const share = typeof overAt === 'function' && o && o.ahead !== false ? aheadShare(s => overAt(at(s)), o) : 1;
  return { share, at: share === 1 ? to : at(share) };
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
 * 22 November 2026, round r30 (LIMBS3; a check of update 67, finding 1: with the right arm chosen, "Bend trunk forward"
 * pushed the right leg, and the right leg chosen during the movement, Digit3 at 0.3 or 0.6 s, stayed 86 mm off its place
 * for good, 90 mm with a side bend; the owner, Message 206: no permanent movements). The record was dropped as soon as the
 * pushed limb became the chosen one ("a pushed limb you choose is yours"). Choosing a limb is not moving it:
 *   chosenKept  the record of a limb you choose is kept, and its way back goes on with the trunk's return. What you then
 *               do to that limb yourself (the keys, the look carrying it, a drag) is yours: a joint whose place changed
 *               that way has the change carried into the place it goes back to (pushBackStep `own`), so the push is
 *               undone and your own move is kept. Tried and dropped: dropping such a joint from the record (the push's
 *               part of it then stayed: a leg moved with S after the choice ended 86 mm plus S off its control); letting
 *               a chosen leg wait, untaken by the view, until its way back is done (the keys on it would then be undone
 *               with the trunk's return, as they are on a waiting right arm).
 * chosenKept false: a pushed limb you choose before the trunk is back stays where it is, as before.
 * 22 November 2026, round r31 (LIMBS4): what the keys and the look do to a chosen pushed limb is no longer carried as
 * joint changes once the shadow has moved (KEY_SHADOW below, pushBackStep's ownTo): the place it goes back to is where
 * the same input takes the limb from its own place. A drag or a limb turn is still carried as joint changes.
 */
export const PUSH_BACK = Object.freeze({ on: true, shareMin: 0.02, restDegS: 90, chosenKept: true });

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
 * restDegS. own (r30, chosenKept: the limb is the chosen one): a joint whose place something else changed was moved by
 * the player, and the change is carried into both ends of its way (`to` and `from`): kept, not undone; own may give the
 * player's change itself ({ jointId: degrees }, measured from where the joint WAS: a place set by the player is also
 * where the joint is, so the place's own change would count the joint's lag behind the way back as the player's).
 * ownTo (r31, KEY_SHADOW; with own): { jointId: degrees }, the place such a joint goes back to (the shadow's: the same
 * input played at rest), in place of the carried change; the change still shifts `from`. Returns { rec,
 * joints (places to set now), done (at rest, every joint home, none moving) }. Pure. */
export function pushBackStep(rec, { place = {}, moving = () => false, away = 0, atRest = false, dt = 0, own = false, ownTo = null } = {}, o = PUSH_BACK) {
  const share = atRest ? 0 : Math.max(0, Math.min(rec.share, rec.away0 > 1e-9 ? away / rec.away0 : 0));
  const from = { ...rec.from }, last = { ...(rec.last || {}) }, joints = {};
  let busy = false, left = false, goals = rec.to;
  for (const id of Object.keys(rec.to)) {
    let to = rec.to[id];
    if (!Number.isFinite(to)) continue;
    if (moving(id)) { busy = true; continue; }
    const p = Number.isFinite(place[id]) ? place[id] : to;
    const moved = Number.isFinite(last[id]) && Math.abs(p - last[id]) > 1e-6;
    const ownD = own && typeof own === 'object' && Number.isFinite(own[id]) ? own[id] : null;
    if (own && ownTo && Number.isFinite(ownTo[id]) && o.chosenKept !== false) {
      // (r31, KEY_SHADOW: the place to go back to is the shadow's, where the player's input ends at rest; the player's
      // change of the limb itself is carried into `from` only, so the way back goes on from where the limb now is)
      if (goals === rec.to) goals = { ...rec.to };
      to = goals[id] = ownTo[id] + 0;
      if ((moved || ownD !== null) && Number.isFinite(from[id])) from[id] += ownD !== null ? ownD : p - last[id];
    } else if ((moved || ownD !== null) && own && o.chosenKept !== false) {
      const d = ownD !== null ? ownD : p - last[id];
      if (goals === rec.to) goals = { ...rec.to };
      to = goals[id] = to + d + 0;
      if (Number.isFinite(from[id])) from[id] += d;
    } else if (moved && share > o.shareMin) from[id] = to + (p - to) / share;
    let v;
    if (share > o.shareMin) v = to + ((Number.isFinite(from[id]) ? from[id] : p) - to) * share;
    else { const step = o.restDegS * (dt > 0 ? Math.min(dt, 0.1) : 0); v = Math.abs(to - p) <= step ? to : p + Math.sign(to - p) * step; }
    if (Math.abs(v - p) > 1e-9) joints[id] = v + 0;
    last[id] = v + 0;
    if (Math.abs(v - to) > 1e-6) left = true;
  }
  return { rec: { ...rec, to: goals, from, last, share }, joints, done: atRest && !busy && !left };
}

/**
 * KEY_SHADOW (22 November 2026, round r31, LIMBS4; the owner, Message 206: "no permanent movements": a movement from the
 * brain contracts and returns, and only the player's own placing stays; a check of update 68: keys or a look used on a
 * pushed leg chosen during a trunk movement left it 18 to 36 mm off where the same input ends with no trunk movement (W
 * 35.4 mm, though W alone moves that leg 2 mm; S 41.0; A then D 19.8; a look 18.4 to 19.4); and R7: keys on the held
 * right arm during a trunk movement were undone when it was let go before the trunk was back, 88.4 mm off).
 * A key's move made at the pushed or bent pose has no one equal at rest: the same joint changes taken back to the rest
 * pose move the hand or foot somewhere else (and where the joint has no room left at rest, W moved a leg 2 mm at rest
 * but bent it 13 degrees back at the pushed pose). What does have one equal is the INPUT. Now:
 *   on      while a limb's way back runs (a pushed limb chosen during the movement, PUSH_BACK; the right arm let go during
 *           it, ns-app HOLD_BODY holdArmBack) or the trunk carries the held right arm, a SHADOW of the limb stands at the
 *           place it goes back to, with the trunk at rest. Each frame of the keys on the limb is played on the shadow
 *           too, through the same rules as the view's hold plays it at rest (keyShadowStep: the place on the keys' line
 *           within leadM, one solve a frame, limbKeyFollow and keyMoveCut, LIMB_PACE with the swing and LIMB_ACROSS, the
 *           trunk keep-out of an arm, nothing under HOLD_LIGHT minDeg), and a look that carries the limb carries the
 *           shadow by the same look from the camera with the trunk at rest (keyShadowCarry). The place the limb goes back
 *           to becomes the shadow's: the push and the trunk's carry are undone, and the player's input ends where it
 *           ends with no movement. The limb itself still answers the keys as it does now, frame by frame.
 * on false: the joint changes made at the pushed pose are carried (PUSH_BACK chosenKept), and the right arm let go goes
 * back to its places from before the movement, as before.
 * Not modelled on the shadow (where the control would differ): another limb in the way (LIMB_PUSH, LIMB_BLOCK), the
 * contact of a leg with the trunk, two keys at once falling back to one, the keep-out of the head's column in the eye
 * view, and a look carrying a limb beyond its reach (the shadow then waits where it is).
 */
export const KEY_SHADOW = Object.freeze({ on: true, waitMm: 40 });

const shDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** KEY_SHADOW: a new shadow of `limb` standing at the joint places `q` (degrees by joint: the limb's own; the rest of the
 * body is env.base at each step). Pure. */
export function keyShadowNew(limb, q) {
  return { limb, q: { ...q }, keyU: null, keyLen: 0, lastErr: 0, memo: {}, stuck: null, keyed: false, spinA: null, moved: false, place: null };
}
/** KEY_SHADOW: the shadow's points (m, body frame): { root, bend, end }. env: as keyShadowStep. Pure. */
export function keyShadowPoints(sh, env) {
  const sg = env.asDrawn({ ...env.base, ...sh.q });
  return { root: env.limbPoint(env.rig, sg, sh.limb, 'root').map(v => v / 1000), bend: env.limbPoint(env.rig, sg, sh.limb, 'bend').map(v => v / 1000), end: env.limbPoint(env.rig, sg, sh.limb, 'end').map(v => v / 1000) };
}
/**
 * KEY_SHADOW: one frame of the keys (ax: +1 D, -1 A; az: +1 W, -1 S; dt s) on the shadow, as the view's hold plays a
 * frame of the keys on a body limb at rest (ns-app stepLimbHoldCore); a frame with no key ends the keys' line (the place
 * put on the end: LIMB_PACE releaseStops). env: { rig, chain (ns-grasp LIMB_CHAIN[limb]), base (the rest of the body's
 * angles, the trunk at rest), asDrawn(angles) -> segments, limbPoint, solveLimb, limits (holdLimits), project, opts:
 * { follow, track } (the solve's options), keyMove (limbKeyMove), keyFollow (limbKeyFollow), keyCut (keyMoveCut),
 * speedMps, leadM, maxDt, keepOut(angles, p m) -> m inside the trunk (an arm; optional) }. Returns a new shadow
 * (moved: whether this frame moved it). Pure apart from env's functions.
 */
export function keyShadowStep(sh0, ax, az, dt, env) {
  const sh = { ...sh0, q: { ...sh0.q }, moved: false };
  if (!ax && !az) { if (sh.keyed) { sh.keyU = null; sh.keyLen = 0; sh.keyed = false; } return sh; }
  const limb = sh.limb, c = env.chain, pace = paceFor(limb), right = [-1, 0, 0];
  const full = q => ({ ...env.base, ...q });
  const ptsOf = q => { const sg = env.asDrawn(full(q)); return { sg, root: env.limbPoint(env.rig, sg, limb, 'root').map(v => v / 1000), bend: env.limbPoint(env.rig, sg, limb, 'bend').map(v => v / 1000), end: env.limbPoint(env.rig, sg, limb, 'end').map(v => v / 1000) }; };
  const sp = env.speedMps * Math.min(Math.max(dt, 0), env.maxDt || 0.1), lead = env.leadM;
  const P0 = ptsOf(sh.q), root = P0.root, end = P0.end, pts = { root, bend: P0.bend, end };
  const keepOut = typeof env.keepOut === 'function' ? p => env.keepOut(full(sh.q), p) : null;
  const folded = LIMB_PACE.on && ax !== 0 && az === 0 && limbFolded(pts, pace);
  let joints = null;
  // (LIMB_ACROSS: A on a folded limb with a `spin` joint turns it first; D turns A's turn back first)
  if (folded && c.spin && LIMB_ACROSS.on) {
    const id = c.spin.joint, rot = sh.q[id], across = c.side === 'right' ? ax < 0 : ax > 0;
    const rec = sh.spinA && Math.abs(sh.spinA.last - rot) < 0.05 ? sh.spinA : null;
    if (Number.isFinite(rot) && (across || (LIMB_ACROSS.back && rec)) && env.limits[id]) {
      const way = sub(env.keyMove(end, root, right, ax, 0, sp), end), e1 = ptsOf({ ...sh.q, [id]: rot + 1 }).end;
      const d = spinStepDeg(sub(e1, end), way, { rot, lo: env.limits[id][0], hi: env.limits[id][1], stop: across ? null : rec.from });
      if (d) {
        const q = env.project ? env.project(full({ ...sh.q, [id]: rot + d })) : full({ ...sh.q, [id]: rot + d }), js = {};
        for (const j of [...c.joints, id]) js[j] = q[j];
        const P1 = ptsOf({ ...sh.q, ...js }), fol = env.keyFollow(end, P1.end, way);
        const ok = fol.take && fol.share > 0.999 && limbPaceShare(pts, { root, bend: P1.bend, end: P1.end }, sp, pace) > 0.999 && Math.abs(js[id] - rot) > 1e-3
          && !(keepOut && keepOut(P1.end) > keepOut(end) + 1e-3);
        if (ok) { joints = js; sh.spinA = !across && Math.abs(js[id] - rec.from) < 0.05 ? null : { from: rec ? rec.from : rot, last: js[id] }; }
      }
    }
  }
  let T = null;
  if (!joints) {
    const from = sh.keyU ? [root[0] + sh.keyU[0] * sh.keyLen, root[1] + sh.keyU[1] * sh.keyLen, root[2] + sh.keyU[2] * sh.keyLen] : end;
    const swingOf = p => (folded ? limbSwingMove(pts, p, right, ax, sp, pace) : null);
    const classic = p => env.keyMove(p, root, right, ax, az, sp);
    T = swingOf(from) || classic(from);
    if (keepOut && keepOut(T) > keepOut(from) + 5e-4) T = end.slice(); // (an arm's key into the trunk moves nothing: no slide here)
    const gap = len(sub(T, end));
    if (gap > 0.0015) { // (a frame of the keys always solves: the hold's 'stuck' place is for still frames)
      const solve = (t, memo, track) => env.solveLimb({ rig: env.rig, segmentsFor: env.asDrawn, targets: full(sh.q), limb, targetMm: t.map(v => v * 1000), limits: env.limits, opts: track ? env.opts.track : env.opts.follow, project: env.project, memo, spin: Boolean(c.spin) });
      const take = (rs, way) => {
        const paceOf = (eM, bM) => limbPaceShare(pts, { root, bend: bM, end: eM }, sp, pace);
        const e0 = rs.endMm.map(v => v / 1000), fol = env.keyFollow(end, e0, way);
        if (!fol.take) return null;
        let out = { joints: rs.joints, end: e0, bend: rs.bendMm ? rs.bendMm.map(v => v / 1000) : null, folded: rs.folded, errorMm: rs.errorMm };
        const p0 = out.bend ? paceOf(out.end, out.bend) : 1;
        if (fol.share < 1 || p0 < 1) {
          let share = Math.min(fol.share, p0);
          for (let pass = 0; pass < 4; pass++) {
            const q = { ...sh.q }; for (const id of Object.keys(rs.joints)) q[id] = sh.q[id] + (rs.joints[id] - sh.q[id]) * share;
            const qp = env.project ? env.project(full(q)) : full(q), js = {}; for (const id of Object.keys(rs.joints)) js[id] = qp[id];
            const P1 = ptsOf({ ...sh.q, ...js }), kEnd = env.keyCut(sub(P1.end, end), way);
            if (!(kEnd > 0)) return null;
            out = { ...out, joints: js, end: P1.end, bend: P1.bend };
            const k = Math.min(kEnd, paceOf(P1.end, P1.bend));
            if (!(k < 0.999)) break;
            share *= k;
          }
        }
        if (keepOut && keepOut(out.end) > keepOut(end) + 1e-3) return null;
        return out;
      };
      const swEnd = swingOf(end), way = sub(swEnd || classic(end), end);
      let t = take(solve(T, sh.memo, !(sh.lastErr < 12 && gap < 0.06)), way);
      if (!t && swEnd) { // (the swing waits: the turn of the line for this frame)
        const w1 = sub(classic(end), end), wl = len(w1);
        if (wl > 1e-6) t = take(solve([end[0] + w1[0] * lead / wl, end[1] + w1[1] * lead / wl, end[2] + w1[2] * lead / wl], null, true), w1);
      }
      if (t) {
        sh.lastErr = t.errorMm;
        const inner = t.folded === true && t.errorMm > lead * 1000 + 2;
        if (!inner) {
          let big = 0; for (const id of Object.keys(t.joints)) big = Math.max(big, Math.abs(t.joints[id] - sh.q[id]));
          if (big >= HOLD_LIGHT.minDeg) joints = t.joints; else T = end.slice();
        } else T = end.slice();
      } else T = end.slice();
    }
  }
  if (joints) { Object.assign(sh.q, joints); sh.moved = true; if (sh.spinA && c.spin && Number.isFinite(sh.q[c.spin.joint])) sh.spinA = { ...sh.spinA, last: sh.q[c.spin.joint] }; }
  // (the keys' place: a direction from the root and a length, neither wound up beyond the end's own: as the hold keeps it)
  const end2 = sh.moved ? ptsOf(sh.q).end : end;
  const tp = T || end2, v = sub(tp, root), len0 = len(v);
  if (len0 > 1e-4) {
    let u = ax === 0 && sh.keyU ? sh.keyU : [v[0] / len0, v[1] / len0, v[2] / len0], L = len0;
    const e = sub(end2, root), en = len(e);
    if (en > 1e-4) {
      const eh = [e[0] / en, e[1] / en, e[2] / en], th = Math.acos(Math.max(-1, Math.min(1, shDot(u, eh)))), most = lead / Math.max(0.05, L);
      if (ax !== 0 && th > most) { const k = most / th, sn = Math.sin(th) || 1, a = Math.sin((1 - k) * th) / sn, b = Math.sin(k * th) / sn; u = [eh[0] * a + u[0] * b, eh[1] * a + u[1] * b, eh[2] * a + u[2] * b]; const un = len(u) || 1; u = [u[0] / un, u[1] / un, u[2] / un]; }
      const o = shDot(e, u); L = Math.max(o - lead, Math.min(o + lead, L));
    }
    sh.keyU = u; sh.keyLen = L;
  }
  sh.keyed = true;
  return sh;
}
/** KEY_SHADOW: the look carried the limb this frame: the shadow's end is solved to `target` (m, body frame; where the
 * same look carries it at rest), from where it stands (env.opts.reach). Taken when the solve ends within waitMm of it;
 * otherwise the shadow waits (a limb carried beyond its reach waits). Returns a new shadow. Pure apart from env's. */
export function keyShadowCarry(sh0, target, env, o = KEY_SHADOW) {
  const sh = { ...sh0, q: { ...sh0.q }, moved: false, keyU: null, keyLen: 0, keyed: false, stuck: null };
  if (!target) return sh;
  const full = q => ({ ...env.base, ...q });
  const r = env.solveLimb({ rig: env.rig, segmentsFor: env.asDrawn, targets: full(sh.q), limb: sh.limb, targetMm: target.map(v => v * 1000), limits: env.limits, opts: env.opts.reach, project: env.project, memo: null });
  if (!(r && r.errorMm <= o.waitMm)) return sh;
  let big = 0; for (const id of Object.keys(r.joints)) big = Math.max(big, Math.abs(r.joints[id] - sh.q[id]));
  if (big >= HOLD_LIGHT.minDeg) { Object.assign(sh.q, r.joints); sh.moved = true; }
  return sh;
}
