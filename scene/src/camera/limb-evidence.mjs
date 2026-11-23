// Landmark visibility is an estimate. A tracker may still place a wrist or ankle
// over a blank occluder. Ask the original video for local visible detail as well.
// Read small patches together, only for a proposed limb pose.
export function createLimbEvidence() {
  const tile = 9;
  const rows = 24;
  const canvas = new OffscreenCanvas(4 * tile, tile + rows);
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  return function limbVisible(frame, points, limb, checkFoot = false) {
    if (!ctx) return false;
    const leg = limb === 'leftLeg' || limb === 'rightLeg';
    const offset = limb === 'leftLeg' || limb === 'leftArm' ? 0 : 1;
    const middle = points[(leg ? 25 : 13) + offset];
    const end = points[(leg ? 27 : 15) + offset];
    const span = Math.max(tile, Math.round(Math.min(frame.width, frame.height) * 0.025));
    const patches = [middle, {x: (middle.x + end.x) / 2, y: (middle.y + end.y) / 2}, end];
    // With two legs in view the tracker can land one ankle on the other leg or
    // just above a cover. Require visible detail at the foot it associates with that shin.
    if (checkFoot) {
      const foot = points[31 + offset];
      if (!foot || !Number.isFinite(foot.x) || !Number.isFinite(foot.y) || !(foot.visibility >= 0.65)) return false;
      patches.push(foot);
    }
    for (const [i, point] of patches.entries()) {
      const x = point.x * frame.width, y = point.y * frame.height;
      const sx = Math.round(x - span / 2), sy = Math.round(y - span / 2);
      if (sx < 0 || sy < 0 || sx + span > frame.width || sy + span > frame.height) return false;
      ctx.drawImage(frame, sx, sy, span, span, i * tile, 0, tile, tile);
    }
    // Also inspect a thumbnail. When the lower frame is covered the detector
    // sometimes places a plausible-looking ankle immediately ABOVE the cover.
    const width = patches.length * tile;
    if (leg) ctx.drawImage(frame, 0, tile, width, rows);
    const {data} = ctx.getImageData(0, 0, width, leg ? canvas.height : tile);
    const luminance = k => (data[k] + 2 * data[k + 1] + data[k + 2]) / 4;
    for (let i = 0; i < patches.length; i++) {
      let min = 255, max = 0;
      for (let y = 0; y < tile; y++) {
        for (let x = 0; x < tile; x++) {
          const k = 4 * (y * width + i * tile + x);
          const luma = luminance(k);
          min = Math.min(min, luma);
          max = Math.max(max, luma);
        }
      }
      if (max - min < 8) return false;
    }
    if (!leg) return true;
    // Reject a contiguous flat lower band at least a quarter of the image
    // tall when the estimated ankle is in or near that band. A distant
    // letterbox below a fully visible leg can remain.
    let min = 255, max = 0, flatRows = 0;
    for (let y = canvas.height - 1; y >= tile; y--) {
      for (let x = 0; x < width; x++) {
        const value = luminance(4 * (y * width + x));
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      if (max - min >= 8) break;
      flatRows++;
    }
    return flatRows < rows / 4 || end.y < 1 - flatRows / rows - 0.12;
  };
}
