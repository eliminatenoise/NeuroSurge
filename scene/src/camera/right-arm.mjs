// MediaPipe image landmarks are normalized independently by image width and height.
// Use square-pixel coordinates before forming angles. Shoulder width sets a local
// sideways axis, so a small camera roll doesn't turn into shoulder elevation.
export function rightArmJoints(points, width, height) {
  if (!points || !Number.isFinite(width) || !Number.isFinite(height) || !(width > 0 && height > 0)) return null;
  const visible = [11, 12, 14, 16].map(index => points[index]);
  if (!visible.every(p => p && Number.isFinite(p.visibility) && p.visibility >= 0.65 &&
    p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)) return null;

  const [left, shoulder, elbow, wrist] = visible.map(p => [p.x * width, p.y * height]);
  const between = (a, b) => [b[0] - a[0], b[1] - a[1]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const across = between(left, shoulder), upper = between(shoulder, elbow), lower = between(elbow, wrist);
  const minLength = Math.min(width, height) * 0.025;
  if ([across, upper, lower].some(v => Math.hypot(...v) < minLength) || across[0] >= 0) return null;
  const down = [across[1], -across[0]];
  const deg = 180 / Math.PI;
  const abduction = Math.atan2(dot(upper, across), dot(upper, down)) * deg;
  // Near vertical an arm may pass a few pixels over the head. Both sides of
  // that numerical wrap correspond to the highest available lateral position.
  if (abduction < -15 && abduction > -160) return null; // arm crossed the chest
  const raised = abduction <= -160 ? 180 : abduction;
  const cosine = dot(upper, lower) / (Math.hypot(...upper) * Math.hypot(...lower));
  return {
    r_shoulder_abd: Math.max(0, Math.min(180, raised)),
    r_shoulder_flex: 0,
    r_elbow_flex: Math.min(145, Math.acos(Math.min(1, Math.max(-1, cosine))) * deg)
  };
}
