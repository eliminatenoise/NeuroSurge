import { makeCamera } from './spatial-recording.mjs';

const MARKER_COLOUR = {L:'#70d8ff', R:'#ffb36b', other:'#e5e9ed'};
function stroke(ctx, a, b) {
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

export function drawFrame(canvas, model, index, {width,height,dpr,yaw,pitch,follow,lines,selected}) {
  if (width < 32 || height < 40) return;
  const px = Math.round(width*dpr), py = Math.round(height*dpr);
  if (canvas.width !== px || canvas.height !== py) { canvas.width = px; canvas.height = py; }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(px/width,0,0,py/height,0,0);
  ctx.clearRect(0,0,width,height);
  const {project,right,down} = makeCamera(model,index,follow,width,height,yaw,pitch);
  const {lab, clip, edges} = model;
  // A fixed half-metre lab grid reveals horizontal travel even with a
  // following camera. The recorded coordinates always remain in lab space.
  const step = 500;
  const lo = lab.lo.slice(0,2).map(v => step*(Math.floor(v/step)-1));
  const hi = lab.hi.slice(0,2).map(v => step*(Math.ceil(v/step)+1));
  ctx.strokeStyle = '#314552';
  ctx.lineWidth = 1;
  for (let x=lo[0]; x<=hi[0]; x+=step) stroke(ctx, project([x,lo[1],0]), project([x,hi[1],0]));
  for (let y=lo[1]; y<=hi[1]; y+=step) stroke(ctx, project([lo[0],y,0]), project([hi[0],y,0]));

  const dots = clip.frames[index].map(p => p && project(p));
  if (lines) {
    ctx.strokeStyle = '#8faab6';
    ctx.lineWidth = 1.7;
    for (const [a,b] of edges) if (dots[a] && dots[b]) stroke(ctx,dots[a],dots[b]);
  }
  const visible = [];
  dots.forEach((p,i) => { if (p) visible.push(i); });
  visible.sort((a,b) => dots[a][2]-dots[b][2]);
  for (const i of visible) {
    const [x,y] = dots[i];
    ctx.fillStyle = MARKER_COLOUR[clip.markers[i][0]] || MARKER_COLOUR.other;
    ctx.beginPath(); ctx.arc(x,y,3.15,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#12202b'; ctx.lineWidth = .85; ctx.stroke();
  }
  if (dots[selected]) {
    const [x,y] = dots[selected];
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x,y,6,0,Math.PI*2); ctx.stroke();
  }
  // Keep the positive lab-axis directions visible while the camera turns.
  ctx.font = '11px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const origin = [39,36];
  for (let axis=0; axis<3; axis++) {
    ctx.strokeStyle = ['#b8ceda','#8cbda9','#d4bda1'][axis];
    ctx.fillStyle = ctx.strokeStyle;
    const dx = right[axis], dy = down[axis];
    stroke(ctx,origin,[origin[0]+22*dx,origin[1]+22*dy]);
    ctx.fillText('XYZ'[axis],origin[0]+31*dx,origin[1]+31*dy);
  }
}
