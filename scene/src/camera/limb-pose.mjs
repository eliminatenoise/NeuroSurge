// Coordinates come from the raw video bitmap. Only the on-screen preview is mirrored.
// A frontal person's anatomical right lies to the left of the image.
const chains = {
  rightArm: [11, 12, 14, 16],
  leftArm: [12, 11, 13, 15],
  rightLeg: [23, 24, 26, 28],
  leftLeg: [24, 23, 25, 27]
};

export const trackingChoices = {
  rightArm: {name: 'Right arm', frame: 'Face the lens. Show both shoulders, your right elbow and wrist.', motion: 'Right shoulder and elbow', parts: ['rightArm']},
  leftArm: {name: 'Left arm', frame: 'Face the lens. Show both shoulders, your left elbow and wrist.', motion: 'Left arm reach and elbow', parts: ['leftArm']},
  bothArms: {name: 'Both arms', frame: 'Face the lens with both shoulders, elbows and wrists in view.', motion: 'Both arms', parts: ['leftArm', 'rightArm']},
  leftLeg: {name: 'Left knee', frame: 'Turn partway sideways. Show shoulders, hips, your left knee and ankle.', motion: 'Left knee', parts: ['leftLeg']},
  rightLeg: {name: 'Right knee', frame: 'Turn partway sideways. Show shoulders, hips, your right knee and ankle.', motion: 'Right knee', parts: ['rightLeg']},
  armsAndKnees: {name: 'Both arms and knees', frame: 'Keep shoulders, elbows, wrists, hips and feet in view. Bend each knee where the lens can see it.', motion: 'Both arms and knees', parts: ['leftArm', 'rightArm', 'leftLeg', 'rightLeg']},
  bothKnees: {name: 'Both knees', frame: 'Turn partway sideways. Keep your shoulders, hips, knees and feet in view. Show a clear bend on each side.', motion: 'Both knees', parts: ['leftLeg', 'rightLeg']}
};

export function trackedLimbs(pose) {
  if (!pose) return [];
  const joints = pose.joints;
  return [
    pose.leftArm && 'leftArm',
    Number.isFinite(joints?.r_elbow_flex) && 'rightArm',
    Number.isFinite(joints?.knee_ext_L) && 'leftLeg',
    Number.isFinite(joints?.knee_ext_R) && 'rightLeg'
  ].filter(Boolean);
}

// A short loss releases the knee while retaining its starting calibration.
const BRIEF_KNEE_GAP_MS = 600;
export const kneeJoints = {leftLeg: ['knee_ext_L'], rightLeg: ['knee_ext_R'], bothKnees: ['knee_ext_L', 'knee_ext_R'], armsAndKnees: ['knee_ext_L', 'knee_ext_R']};

// Each knee must show two consecutive bends in the picture before its straight
// projection can drive the game. A missing frame withholds only that knee.
export function calibratedPose(stored, selection, result, now) {
  const keys = kneeJoints[selection];
  if (!keys) return result;
  // In the mixed mode a knee can wait for its second clear bend while the
  // same frame already drives either arm. Copy only the surviving channels.
  const pose = {}, joints = {};
  if (selection === 'armsAndKnees') {
    if (result?.leftArm) pose.leftArm = result.leftArm;
    const rightArm = ['r_shoulder_abd', 'r_shoulder_flex', 'r_elbow_flex'];
    if (rightArm.every(key => Number.isFinite(result?.joints?.[key]))) {
      for (const key of rightArm) joints[key] = result.joints[key];
    }
  }
  for (const key of keys) {
    const state = stored[key] ??= {ready: false, bends: 0, missingSince: null};
    const angle = result?.joints?.[key];
    if (state.missingSince !== null && now - state.missingSince >= BRIEF_KNEE_GAP_MS) state.ready = false;
    if (!Number.isFinite(angle)) {
      state.missingSince ??= now;
      state.bends = 0;
      continue;
    }
    state.missingSince = null;
    if (!state.ready) {
      state.bends = -angle >= 45 ? state.bends + 1 : 0;
      state.ready = state.bends >= 2;
    }
    if (state.ready) joints[key] = angle;
  }
  if (Object.keys(joints).length) pose.joints = joints;
  return pose.leftArm || pose.joints ? pose : null;
}

// The preview draws only the three points used for an accepted limb.
export function observedLimbPaths(points, pose) {
  return Object.fromEntries(trackedLimbs(pose).map(limb => [
    limb, chains[limb].slice(1).map(index => [points[index].x, points[index].y])
  ]));
}

function between(a, b) { return [b[0] - a[0], b[1] - a[1]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
function visible(p) {
  return p && Number.isFinite(p.x) && p.x >= 0 && p.x <= 1 &&
    Number.isFinite(p.y) && p.y >= 0 && p.y <= 1 &&
    Number.isFinite(p.visibility) && p.visibility >= 0.65;
}

export function poseForLimb(points, width, height, limb) {
  const chain = chains[limb];
  if (!points || !Array.isArray(chain) || !Number.isFinite(width) || !Number.isFinite(height) ||
      width <= 0 || height <= 0) return null;
  const markers = chain.map(index => points[index]);
  if (!markers.every(visible)) return null;
  const [opposite, root, middle, end] = markers.map(p => [p.x * width, p.y * height]);
  const across = between(opposite, root), upper = between(root, middle), lower = between(middle, end);
  const minLength = Math.min(width, height) * 0.025;
  const left = limb === 'leftArm' || limb === 'leftLeg';
  // Reject reversed or edge-on shoulders/hips and collapsed projected segments.
  if ((left ? across[0] : -across[0]) < minLength ||
      Math.hypot(...upper) < minLength || Math.hypot(...lower) < minLength) return null;
  const cosine = dot(upper, lower) / (Math.hypot(...upper) * Math.hypot(...lower));
  const bend = Math.acos(Math.min(1, Math.max(-1, cosine))) * 180 / Math.PI;
  if (limb === 'leftLeg' || limb === 'rightLeg') {
    if (![points[11], points[12]].every(visible)) return null;
    const shoulderX = (points[11].x + points[12].x) * width / 2;
    const shoulderY = (points[11].y + points[12].y) * height / 2;
    const torso = Math.hypot(shoulderX - (opposite[0] + root[0]) / 2, shoulderY - (opposite[1] + root[1]) / 2);
    // Strong foreshortening or a concealed ankle can collapse the projected
    // thigh or shin. A knee bend needs both links to be readable in the picture.
    if (torso <= Math.hypot(...across) || Math.min(Math.hypot(...upper), Math.hypot(...lower)) < 0.5 * torso) return null;
    // This rig stores flexion as negative knee extension. The hip remains game-controlled.
    return {joints: {[left ? 'knee_ext_L' : 'knee_ext_R']: -Math.min(135, bend) || 0}};
  }
  // Shoulder line defines the sideways axis and its downward perpendicular on each frame.
  const down = left ? [-across[1], across[0]] : [across[1], -across[0]];
  const abduction = Math.atan2(dot(upper, across), dot(upper, down)) * 180 / Math.PI;
  if (abduction < -15 && abduction > -160) return null; // folded across the torso
  if (!left) {
    return {joints: {r_shoulder_abd: Math.max(0, abduction <= -160 ? 180 : abduction),
      r_shoulder_flex: 0, r_elbow_flex: Math.min(145, bend)}};
  }
  // The left arm is the game's separately rigged reaching hand. Supply a wrist
  // bearing and an elbow bend in its chest frame. Zero depth chooses the avatar's
  // lateral plane; it is a drawing convention, never a camera measurement.
  const wrist = between(root, end);
  if (Math.hypot(...wrist) < minLength) return null;
  function chestDirection(v) {
    const scale = Math.hypot(...across) * Math.hypot(...v);
    return [-dot(v, across) / scale, -dot(v, down) / scale, 0];
  }
  return {leftArm: {bearing: chestDirection(wrist), upper: chestDirection(upper), elbowDeg: Math.min(145, bend)}};
}

// When the detector fits both shins to nearly the same line, a visible shoe
// cannot tell which knee it belongs to. Measure separation in image pixels
// relative to the shorter shin, so moving closer to the lens changes neither test.
function shinsOverlap(points, width, height) {
  const shins = [25, 26, 27, 28].map(index => points?.[index]);
  if (!shins.every(visible)) return false;
  const distance = (a, b) => Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
  const [leftKnee, rightKnee, leftAnkle, rightAnkle] = shins;
  const separation = Math.min(distance(leftKnee, leftAnkle), distance(rightKnee, rightAnkle)) / 4;
  return distance(leftKnee, rightKnee) < separation && distance(leftAnkle, rightAnkle) < separation;
}

// Build a fresh packet from just the limbs visible in this frame.
export function poseForSelection(points, width, height, selection, hasDetail) {
  function read(limb) {
    const result = poseForLimb(points, width, height, limb);
    return result && hasDetail(limb) ? result : null;
  }
  const arms = selection === 'bothArms' || selection === 'armsAndKnees';
  const knees = selection === 'bothKnees' || selection === 'armsAndKnees';
  if (!arms && !knees) return read(selection);
  const leftArm = arms ? read('leftArm')?.leftArm : null;
  const joints = arms ? {...read('rightArm')?.joints} : {};
  if (knees && !shinsOverlap(points, width, height)) {
    Object.assign(joints, read('leftLeg')?.joints, read('rightLeg')?.joints);
  }
  const pose = {};
  if (leftArm) pose.leftArm = leftArm;
  if (Object.keys(joints).length) pose.joints = joints;
  return pose.leftArm || pose.joints ? pose : null;
}

// Keep two coordinates per tracked wrist. The source bitmap is unmirrored.
// A frame-height is isotropic in image pixels even when the video is not square.
export function observedWrists(points, width, height, pose) {
  const tracks = {};
  for (const [side, tracked, shoulder, wrist, sign] of [
    ['leftArm', pose?.leftArm, 11, 15, 1],
    ['rightArm', Number.isFinite(pose?.joints?.r_elbow_flex), 12, 16, -1]
  ]) {
    const a = points?.[shoulder], b = points?.[wrist];
    if (tracked && visible(a) && visible(b) && width > 0 && height > 0) {
      tracks[side] = [sign * (b.x - a.x) * width / height, a.y - b.y];
    }
  }
  return tracks;
}

// Unmirrored image coordinates in units of frame height, with Y increasing down.
// Admit only the selected arms that passed the detector and image-detail gates.
export function observedArmGeometry(points, width, height, pose) {
  if (!(width > 0) || !(height > 0)) return;
  const ratio = width / height;
  if (!(ratio > 0) || !Number.isFinite(ratio) || ![11, 12].every(i => visible(points?.[i]))) return;
  const xy = i => [points[i].x * ratio, points[i].y];
  const geometry = {aspect: ratio, shoulders: {leftArm: xy(11), rightArm: xy(12)}};
  if (pose?.leftArm && [15, 13].every(i => visible(points[i]))) geometry.leftArm = [xy(15), xy(13)];
  if (Number.isFinite(pose?.joints?.r_elbow_flex) && [16, 14].every(i => visible(points[i])))
    geometry.rightArm = [xy(16), xy(14)];
  if (geometry.leftArm || geometry.rightArm) return geometry;
}
