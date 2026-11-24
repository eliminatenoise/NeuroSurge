// Estimate motion in the tracked image plane using positions through the issue time.
// Time in lead units makes the forecast evaluation point exactly 1.
export function localMotion(rows, point, lead) {
  const last = rows.at(-1);
  const origin = last.xy[point];
  let timeSquared = 0, timeCubed = 0, timeFourth = 0;
  const linearTerms = [0, 0], curvedTerms = [0, 0];
  for (const row of rows.slice(0, -1)) {
    const xy = row.xy[point];
    if (!xy) continue;
    const time = (row.t - last.t) / lead;
    const weight = 2 ** time;
    const time2 = time * time;
    timeSquared += weight * time2;
    timeCubed += weight * time2 * time;
    timeFourth += weight * time2 * time2;
    for (let axis = 0; axis < 2; axis++) {
      const displacement = xy[axis] - origin[axis];
      linearTerms[axis] += weight * time * displacement;
      curvedTerms[axis] += weight * time2 * displacement;
    }
  }
  if (timeSquared <= 0) throw new Error('The motion estimate needs an earlier tracked position');
  const recentLine = origin.map((position, axis) => position + linearTerms[axis] / timeSquared);
  // The second copy of the fourth power penalizes the curvature term.
  const curveDiagonal = 2 * timeFourth;
  const determinant = timeSquared * curveDiagonal - timeCubed * timeCubed;
  const recentCurve = origin.map((position, axis) => {
    const speed = (curveDiagonal * linearTerms[axis] - timeCubed * curvedTerms[axis]) / determinant;
    const curvature = (timeSquared * curvedTerms[axis] - timeCubed * linearTerms[axis]) / determinant;
    return position + speed + curvature;
  });
  if (![...recentLine, ...recentCurve].every(Number.isFinite)) throw new Error('Local motion estimate is not finite');
  return {recent_line: recentLine, recent_curve: recentCurve};
}
