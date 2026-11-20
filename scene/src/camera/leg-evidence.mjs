// Landmark visibility is an estimate. A tracker may still place a knee or ankle
// over a blank occluder. Ask the original video for local visible detail as well.
// Read three small patches together, only for a proposed knee control sample.
export function createLegEvidence() {
  const tile = 9;
  const rows = 24;
  const canvas = new OffscreenCanvas(3 * tile, tile + rows);
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  return function legVisible(frame, points, limb) {
    if (!ctx) return false;
    const knee = points[limb === 'leftLeg' ? 25 : 26];
    const ankle = points[limb === 'leftLeg' ? 27 : 28];
    const span = Math.max(tile, Math.round(Math.min(frame.width, frame.height) * 0.025));
    for (let i = 0; i < 3; i++) {
      const t = i / 2;
      const x = ((1 - t) * knee.x + t * ankle.x) * frame.width;
      const y = ((1 - t) * knee.y + t * ankle.y) * frame.height;
      const sx = Math.round(x - span / 2), sy = Math.round(y - span / 2);
      if (sx < 0 || sy < 0 || sx + span > frame.width || sy + span > frame.height) return false;
      ctx.drawImage(frame, sx, sy, span, span, i * tile, 0, tile, tile);
    }
    // Also inspect a thumbnail. When the lower frame is covered the detector
    // sometimes places a plausible-looking ankle immediately ABOVE the cover.
    ctx.drawImage(frame, 0, tile, canvas.width, rows);
    const {data} = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const luminance = k => (data[k] + 2 * data[k + 1] + data[k + 2]) / 4;
    for (let i = 0; i < 3; i++) {
      let min = 255, max = 0;
      for (let y = 0; y < tile; y++) {
        for (let x = 0; x < tile; x++) {
          const k = 4 * (y * canvas.width + i * tile + x);
          const luma = luminance(k);
          min = Math.min(min, luma);
          max = Math.max(max, luma);
        }
      }
      if (max - min < 8) return false;
    }
    // Reject a contiguous flat lower band at least a quarter of the image
    // tall when the estimated ankle is in or near that band. A distant
    // letterbox below a fully visible leg can remain.
    let min = 255, max = 0, flatRows = 0;
    for (let y = canvas.height - 1; y >= tile; y--) {
      for (let x = 0; x < canvas.width; x++) {
        const value = luminance(4 * (y * canvas.width + x));
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      if (max - min >= 8) break;
      flatRows++;
    }
    return flatRows < rows / 4 || ankle.y < 1 - flatRows / rows - 0.12;
  };
}
