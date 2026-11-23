// Orthographic camera basis from the NeuroTranslation whole-body CMU replay.
function viewBasis(yaw, pitch) {
  const deg = Math.PI / 180, c = Math.cos(yaw*deg), s = Math.sin(yaw*deg);
  const ct = Math.cos(pitch*deg), st = Math.sin(pitch*deg);
  return {right:[c,-s,0], down:[s*st,c*st,-ct], near:[s*ct,c*ct,st]};
}

function translatedFrames(clip, schema) {
  const n = Math.round(schema.durationSeconds * schema.rateHz) + 1;
  if (clip.rateHz !== schema.rateHz || clip.positionsMm?.length !== n || clip.rootMm?.length !== n) {
    throw Error('The movement has an unexpected sample rate or duration.');
  }
  function triple(point) {
    return Array.isArray(point) && point.length === 3 && point.every(Number.isFinite);
  }
  return clip.positionsMm.map((row, frame) => {
    if (row.length !== schema.joints.length || !row.every(triple) || !triple(clip.rootMm[frame])) {
      throw Error('The movement contains an invalid body point.');
    }
    return row.map(point => point.map((value, axis) => value + clip.rootMm[frame][axis]));
  });
}

function sceneBounds(...motions) {
  const lo = [Infinity,Infinity,Infinity], hi = [-Infinity,-Infinity,-Infinity];
  for (const frames of motions) for (const row of frames) for (const point of row) {
    point.forEach((value,i) => {
      lo[i] = Math.min(lo[i], value); hi[i] = Math.max(hi[i],value);
    });
  }
  return {lo,hi};
}

function camera(bounds,width,height,yaw,pitch) {
  const {right,down,near} = viewBasis(yaw,pitch);
  const centre = bounds.hi.map((v,i) => (v+bounds.lo[i])/2);
  const half = bounds.hi.map((v,i) => (v-bounds.lo[i])/2);
  const span = axis => 2 * axis.reduce((s,v,i) => s + Math.abs(v)*half[i],0);
  const scale = Math.min((width-42)/Math.max(100,span(right)),(height-30)/Math.max(100,span(down)));
  const dot = (point,axis) => axis.reduce((sum,v,i) => sum+v*(point[i]-centre[i]),0);
  return {
    project:point => [width/2+dot(point,right)*scale,height/2+dot(point,down)*scale,dot(point,near)],
    right,down
  };
}

function drawMovement(canvas, scene, state) {
  const {width,height} = canvas.getBoundingClientRect();
  if (width < 50 || height < 50) return;
  const dpr = Math.min(window.devicePixelRatio || 1,2);
  const w = Math.round(width*dpr), h = Math.round(height*dpr);
  if (canvas.width !== w || canvas.height !== h) {canvas.width=w;canvas.height=h;}
  const ctx = canvas.getContext('2d');
  if (!ctx) throw Error('This browser could not open the drawing surface.');
  ctx.setTransform(w/width,0,0,h/height,0,0);
  ctx.clearRect(0,0,width,height);
  const {project,right,down} = camera(scene.bounds,width,height,state.yaw,state.pitch);
  function line(a,b,colour,thickness,dash=[]) {
    ctx.strokeStyle=colour;ctx.lineWidth=thickness;ctx.setLineDash(dash);
    ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();
  }
  const {lo,hi} = scene.bounds, step = 250, z = lo[2];
  const from = lo.slice(0,2).map(v=>step*(Math.floor(v/step)-3));
  const to = hi.slice(0,2).map(v=>step*(Math.ceil(v/step)+3));
  for (let x=from[0];x<=to[0];x+=step) line(project([x,from[1],z]),project([x,to[1],z]),'#29423b',1);
  for (let y=from[1];y<=to[1];y+=step) line(project([from[0],y,z]),project([to[0],y,z]),'#29423b',1);

  const items = [];
  const radius = Math.min(4.6,Math.max(3,width/150));
  function layer(kind,frames) {
    const recorded = kind === 'recorded', colour = recorded ? '#87dbff' : '#e0ed8d';
    if(state.selected>=0) {
      const path=frames.map(row=>project(row[state.selected]));
      for(let i=1;i<path.length;i++)line(path[i-1],path[i],recorded?'#5f9db1':'#8fa25a',1.2,recorded?[3,3]:[]);
    }
    const dots = frames[state.frame].map(project);
    const dash = recorded && state.mode==='overlay' ? [5,4] : [];
    for (const [a,b] of scene.edges) {
      const depth = (dots[a][2]+dots[b][2])/2;
      items.push({depth,draw:()=>line(dots[a],dots[b],colour,recorded?2.3:3.2,dash)});
    }
    for (const [i,[x,y,depth]] of dots.entries()) {
      items.push({depth:depth+.001,draw:()=>{
        ctx.setLineDash([]);ctx.beginPath();ctx.arc(x,y,radius + (recorded ? 0.6 : 0),0,2*Math.PI);
        ctx.fillStyle=recorded?'#112521':colour;ctx.fill();ctx.strokeStyle=recorded?colour:'#22372e';
        ctx.lineWidth=recorded?2:1.2;ctx.stroke();
      }});
    }
    if(state.selected>=0) {
      const [x,y] = dots[state.selected];
      items.push({depth:Infinity,draw:()=>{
        ctx.strokeStyle=colour;ctx.lineWidth=1.5;ctx.setLineDash([]);ctx.beginPath();ctx.arc(x,y,radius+4,0,2*Math.PI);ctx.stroke();
      }});
    }
  }
  if (state.mode !== 'recorded') layer('generated',scene.gen);
  if (state.mode !== 'generated') layer('recorded',scene.rec);
  ctx.lineCap='round'; items.sort((a,b)=>a.depth-b.depth);
  for (const item of items) item.draw();
  const ox=36,oy=37;
  ctx.font='11px Arial, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  for (let i=0;i<3;i++) {
    const dx=right[i],dy=down[i],colour=['#bacbbf','#92bbab','#d5cca8'][i];
    line([ox,oy],[ox+19*dx,oy+19*dy],colour,1.2);
    ctx.fillStyle=colour;ctx.fillText('XYZ'[i],ox+29*dx,oy+29*dy);
  }
}
export { translatedFrames, sceneBounds, drawMovement };
