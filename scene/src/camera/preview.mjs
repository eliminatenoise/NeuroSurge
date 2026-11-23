import {trackedLimbs} from './limb-pose.mjs';

export function createCameraPreview(video) {
  const element = document.createElement('div');
  const overlay = document.createElement('canvas');
  overlay.className = 'ns-camera-paths';
  overlay.setAttribute('aria-hidden', 'true');
  Object.assign(element.style, {position: 'relative'});
  Object.assign(video.style, {
    display: 'block', width: '100%', maxHeight: '18vh', objectFit: 'contain', transform: 'scaleX(-1)'
  });
  Object.assign(overlay.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    objectFit: 'contain', transform: 'scaleX(-1)', pointerEvents: 'none'
  });
  overlay.hidden = true;
  element.append(video, overlay);
  const ctx = overlay.getContext('2d');

  function clear() {
    ctx?.clearRect(0, 0, overlay.width, overlay.height);
    overlay.hidden = true;
  }
  function setMirrored(mirrored) {
    video.style.transform = overlay.style.transform = mirrored ? 'scaleX(-1)' : 'none';
  }
  function draw(paths, pose, width, height) {
    const limbs = trackedLimbs(pose).filter(limb => paths?.[limb]);
    if (!ctx || limbs.length === 0 || !width || !height) { clear(); return; }

    // Both elements use the same contain and mirror transforms. Point XY is
    // normalized in the camera image before either CSS transform is applied.
    if (overlay.width !== width || overlay.height !== height) {
      overlay.width = width;
      overlay.height = height;
    } else ctx.clearRect(0, 0, width, height);
    const thickness = Math.max(2, Math.min(width, height) * .012);
    ctx.lineJoin = ctx.lineCap = 'round';
    for (const limb of limbs) {
      const points = paths[limb].map(([x, y]) => [x * width, y * height]);
      ctx.beginPath();
      ctx.moveTo(...points[0]);
      for (const point of points.slice(1)) ctx.lineTo(...point);
      ctx.strokeStyle = '#132b35';
      ctx.lineWidth = thickness + 4;
      ctx.stroke();
      ctx.strokeStyle = '#a5f3db';
      ctx.lineWidth = thickness;
      ctx.stroke();

      for (const [x, y] of points) {
        ctx.beginPath();
        ctx.arc(x, y, thickness * .75, 0, 2 * Math.PI);
        ctx.fillStyle = '#a5f3db';
        ctx.fill();
        ctx.strokeStyle = '#132b35';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    overlay.hidden = false;
  }

  return {element, clear, draw, setMirrored};
}
