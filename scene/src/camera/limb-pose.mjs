// Coordinates come from the raw video bitmap. Only the on-screen preview is mirrored.
// A frontal person's anatomical right lies to the left of the image.
const chains = {
  rightArm: [11, 12, 14, 16],
  leftArm: [12, 11, 13, 15],
  rightLeg: [23, 24, 26, 28],
  leftLeg: [24, 23, 25, 27]
};

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
