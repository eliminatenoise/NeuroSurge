/* CC0 1.0. HoloAssist measurements carry the CDLA-Permissive-2.0 licence. */
(() => {
  'use strict';
  const fingers = ['Index', 'Middle', 'Ring', 'Little'];
  const joints = ['Palm', 'Wrist', 'ThumbMetacarpal', 'ThumbProximal', 'ThumbDistal', 'ThumbTip',
    ...fingers.flatMap(finger => ['Metacarpal','Proximal','Intermediate','Distal','Tip'].map(part => finger + part))];
  const names = joints.map(s => s.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase());
  const edges = [[0,1],[1,2],[2,3],[3,4],[4,5]];
  for (const base of [6,11,16,21]) {
    edges.push([1,base]);
    for (let j=base; j<base+4; j++) edges.push([j,j+1]);
  }
  const fullMask = 2 ** 26 - 1;
  const bit = (mask, i) => !!(mask & (1 << i));
  const maskOk = mask => Number.isInteger(mask) && mask >= 0 && mask <= fullMask;
  function validate(rec) {
    if (!rec || rec.schema !== 'hand-replay-v1' || rec.side !== 'right' || rec.units !== 'm' ||
        !Array.isArray(rec.axes) || rec.axes.join('|') !== 'X forward|Y left|Z up' ||
        !Array.isArray(rec.joints) || rec.joints.length !== 26 || !rec.joints.every((name,i) => name === joints[i]) ||
        !Number.isInteger(rec.clock?.sourceRows) || rec.clock.sourceRows < 1 ||
        !Number.isFinite(rec.clock.medianSyncStepSeconds) || rec.clock.medianSyncStepSeconds <= 0 ||
        !Array.isArray(rec.segments) || !rec.segments.length) throw Error('This file has an unsupported hand recording format.');
    const ids = new Set();
    for (const s of rec.segments) {
      if (typeof s.segmentId !== 'string' || !s.segmentId.startsWith(rec.recording + ':') || ids.has(s.segmentId) ||
          !Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < 0 || s.end <= s.start ||
          typeof s.label !== 'string' || !Array.isArray(s.frames)) throw Error('Invalid action interval.');
      ids.add(s.segmentId);
      let previousRow = -1, previousT = -Infinity;
      for (const f of s.frames) {
        if (!Number.isInteger(f.row) || f.row <= previousRow || f.row >= rec.clock.sourceRows || !Number.isFinite(f.t) ||
            f.t < s.start || f.t >= s.end || f.t <= previousT || !Number.isSafeInteger(f.tick) ||
            typeof f.active !== 'boolean' || !maskOk(f.valid) || !maskOk(f.tracked) ||
            !Array.isArray(f.xyz) || f.xyz.length !== 26) throw Error('Invalid hand sample or sample clock.');
        f.xyz.forEach((point, j) => {
          if (point === null) return;
          if (!f.active || !bit(f.valid,j) || !bit(f.tracked,j) || !Array.isArray(point) ||
              point.length !== 3 || !point.every(Number.isFinite)) throw Error('A joint position conflicts with its tracking flags.');
        });
        previousRow=f.row; previousT=f.t;
      }
    }
  }

  const pos = frame => frame.xyz.filter(Boolean);
  function centreOf(points) {
    const low = [Infinity,Infinity,Infinity], high = [-Infinity,-Infinity,-Infinity];
    for (const p of points) for (let a=0; a<3; a++) {low[a]=Math.min(low[a],p[a]); high[a]=Math.max(high[a],p[a]);}
    return low.map((v,i) => (v+high[i])/2);
  }
  // Same orthonormal orbit basis as the programme's CMU marker viewer, with roll.
  function camera(yaw, pitch, roll) {
    const c=Math.cos(yaw), s=Math.sin(yaw), ct=Math.cos(pitch), st=Math.sin(pitch);
    const right=[c,-s,0], down=[s*st,c*st,-ct], near=[-s*ct,-c*ct,-st];
    return {right:right.map((v,i)=>v*Math.cos(roll)+down[i]*Math.sin(roll)),
      down:down.map((v,i)=>v*Math.cos(roll)-right[i]*Math.sin(roll)), near};
  }
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  function startingOrbit(segment) {
    const defaultOrbit={yaw:.4,pitch:-1.01,roll:0,zoom:1};
    const frame=segment?.frames.find(f=>[1,7,22].every(j=>f.xyz[j]));
    if (!frame) return defaultOrbit;
    const wrist=frame.xyz[1], index=frame.xyz[7], little=frame.xyz[22];
    const across=index.map((v,i)=>v-little[i]);
    const length=index.map((v,i)=>(v+little[i])/2-wrist[i]);
    const normal=[across[1]*length[2]-across[2]*length[1],across[2]*length[0]-across[0]*length[2],across[0]*length[1]-across[1]*length[0]];
    const magnitude=Math.hypot(...normal);
    if (magnitude<1e-8) return defaultOrbit;
    const yaw=Math.atan2(-normal[0],-normal[1]),pitch=-Math.asin(Math.max(-1,Math.min(1,normal[2]/magnitude)));
    const basis=camera(yaw,pitch,0),roll=Math.atan2(dot(length,basis.right),-dot(length,basis.down));
    return {yaw,pitch,roll,zoom:1};
  }
  function bounds(segment) {
    const all=segment.frames.flatMap(f => pos(f));
    if (!all.length) return null;
    const centre=centreOf(all);
    let spread=0, local=0;
    for (const f of segment.frames) {
      const points=pos(f);
      if (!points.length) continue;
      const focus=centreOf(points);
      for (const p of points) {
        spread=Math.max(spread,Math.hypot(...p.map((v,i)=>v-centre[i])));
        local=Math.max(local,Math.hypot(...p.map((v,i)=>v-focus[i])));
      }
    }
    return {centre, spread:Math.max(.025,spread), local:Math.max(.025,local)};
  }
  function draw(canvas, frame, orbit, field, joint, follow) {
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if (!w || !h) return;
    const dpr=Math.min(window.devicePixelRatio||1,2);
    if (canvas.width!==Math.round(w*dpr) || canvas.height!==Math.round(h*dpr)) {
      canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr);
    }
    const ctx=canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);
    ctx.clearRect(0,0,w,h);
    const basis=camera(orbit.yaw,orbit.pitch,orbit.roll);
    function line(a,b,color,width) {
      ctx.strokeStyle=color; ctx.lineWidth=width; ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
    }
    const font='12px system-ui, sans-serif';
    ctx.font=font; ctx.lineCap='round'; ctx.textAlign='center'; ctx.textBaseline='middle';
    const origin=[38,37];
    ['X','Y','Z'].forEach((name, i) => {
      const col=['#a2d6ff','#eab59d','#80dfc9'][i], dx=basis.right[i], dy=basis.down[i];
      line(origin,[origin[0]+20*dx,origin[1]+20*dy],col,1.5);
      ctx.fillStyle=col; ctx.fillText(name,origin[0]+30*dx,origin[1]+30*dy);
    });
    const points=frame ? pos(frame) : [];
    if (!points.length || !field) return;
    const centre=follow ? centreOf(points) : field.centre;
    const radius=follow ? field.local : field.spread;
    const scale=Math.min(w*.83,h*.79)*orbit.zoom/(2*radius);
    const dots=frame.xyz.map(p => {
      if (!p) return null;
      const v=p.map((x,i)=>x-centre[i]);
      return [w/2+dot(v,basis.right)*scale,h/2+dot(v,basis.down)*scale,dot(v,basis.near)];
    });
    // Painter's order for segment and joint depth. Missing endpoints never form a guide.
    const items=[];
    for (const [a,b] of edges) if (dots[a] && dots[b]) items.push({a,b,depth:(dots[a][2]+dots[b][2])/2});
    for (let a=0;a<26;a++) if (dots[a]) items.push({a,depth:dots[a][2]});
    items.sort((a,b)=>a.depth-b.depth);
    for (const item of items) {
      const a=dots[item.a];
      if (item.b !== undefined) {line(a,dots[item.b],'#68aeae',Math.max(2.3,Math.min(6,scale*.003))); continue;}
      const isTip=[5,10,15,20,25].includes(item.a), selected=item.a===joint;
      ctx.beginPath(); ctx.arc(a[0],a[1],selected?5.8:isTip?4.6:3.8,0,Math.PI*2);
      ctx.fillStyle=selected?'#ffcf80':isTip?'#e7fffc':'#9de2d4'; ctx.fill(); ctx.strokeStyle='#123233';ctx.lineWidth=1.1;ctx.stroke();
    }
    if (dots[joint]) {
      const [x,y]=dots[joint];ctx.beginPath();ctx.arc(x,y,8.8,0,Math.PI*2);ctx.strokeStyle='#ffcf80';ctx.lineWidth=1.6;ctx.stroke();
    }
    const maxLength=Math.min(90,w*.28)/scale;
    const powers=[.001,.002,.005,.01,.02,.05,.1,.2,.5,1,2,5];
    const metres=powers.filter(m=>m<=maxLength).pop();
    if (metres) {
      const x=w-17-metres*scale,y=h-18;
      line([x,y],[w-17,y],'#b4c7c9',1.4);line([x,y-3],[x,y+3],'#b4c7c9',1.4);line([w-17,y-3],[w-17,y+3],'#b4c7c9',1.4);
      ctx.fillStyle='#cbdadb';ctx.fillText(`${Number((metres*100).toFixed(1))} cm`,x+metres*scale/2,y-12);
    }
  }

  const seconds=t=>Number(t.toFixed(3)).toString();
  function mountHandReplay(host, {recording, segmentId, onSegmentChange, showSegmentPicker=true} = {}) {
    validate(recording);
    const el=document.createElement('section'); el.className='handReplay'; el.setAttribute('aria-label','Recorded right-hand movement');
    el.innerHTML=`<label class="hr-pick">Recorded action<select data-k="pick"></select></label>
      <p class="hr-caption" data-k="caption"></p>
      <div class="hr-stage"><canvas data-k="canvas" tabindex="0" aria-label="Right-hand joint positions. Drag or use arrow keys to rotate. Q and E roll the view."></canvas><span data-k="empty" class="hr-empty"></span></div>
      <div class="hr-clock"><button type="button" data-k="play">Play</button><label>Recording time <output data-k="time"></output><input data-k="timebar" type="range" min="0" value="0" step="1" aria-label="Recording sample"></label></div>
      <div class="hr-inspect"><label>Inspect joint<select data-k="joint"></select></label><div class="hr-joint"><strong data-k="xyz"></strong><span data-k="wrist"></span></div></div>
      <div class="hr-view"><button type="button" data-k="out" aria-label="Zoom out">−</button><button type="button" data-k="in" aria-label="Zoom in">+</button><button type="button" data-k="reset">Recenter</button><label><input data-k="follow" type="checkbox" checked> Follow hand</label></div>
      <p class="hr-instruction">Drag to turn. Shift-drag to roll. Use the time slider to inspect a sample.</p><p class="hr-status" data-k="status"></p>`;
    host.replaceChildren(el);
    const ui=Object.fromEntries([...el.querySelectorAll('[data-k]')].map(node=>[node.dataset.k,node]));
    function option(value, label) { const o=document.createElement('option'); o.value=value; o.textContent=label; return o; }
    for (const s of recording.segments) ui.pick.append(option(s.segmentId,`${seconds(s.start)}–${seconds(s.end)} s · ${s.action || s.label}`));
    names.forEach((n,i)=>ui.joint.append(option(String(i),n))); ui.joint.value='10';
    ui.pick.parentElement.hidden=!showSegmentPicker;
    let segment=null,field=null,initialOrbit=null,index=0,playing=false,raf=0,drag=null,absentTime=null,disposed=false;
    const orbit={};
    function resetView() { Object.assign(orbit,initialOrbit); }
    function frameNow() {return absentTime===null ? segment?.frames[index] : null;}
    function paint() {draw(ui.canvas,frameNow(),orbit,field,Number(ui.joint.value),ui.follow.checked);}
    function update() {
      const f=frameNow(), j=Number(ui.joint.value);
      ui.timebar.value=String(index);ui.timebar.disabled=!segment?.frames.length;ui.play.disabled=!segment || segment.frames.length<2;
      ui.time.textContent=f ? `${seconds(f.t)} s` : absentTime!==null? `${seconds(absentTime)} s`:'—';
      ui.timebar.setAttribute('aria-valuetext', f ? `${seconds(f.t)} seconds, source row ${f.row}` : 'No sample');
      const tracked=f ? pos(f).length : 0;
      ui.empty.textContent=tracked ? '' : !segment ? 'No replay for this interval' : !f ? 'No source row at this time' : 'Hand tracking missing at this sample';
      ui.empty.hidden=!!tracked;
      const p=f?.xyz[j];
      const reason=!f ? 'No sample' : !f.active ? 'Hand inactive' : !bit(f.valid,j) ? 'Joint invalid' : !bit(f.tracked,j) ? 'Joint untracked' : 'No finite position';
      ui.xyz.textContent=p ? p.map((v,i)=>`${'XYZ'[i]} ${v.toFixed(4)}`).join('   ')+' m' : reason;
      ui.wrist.textContent=p && f.xyz[1] ? `${(1000*Math.hypot(...p.map((v,i)=>v-f.xyz[1][i]))).toFixed(1)} mm from wrist` : 'Wrist distance unavailable';
      ui.status.textContent=f ? `Right hand · ${tracked}/26 joints · source row ${f.row} (zero-based) · sensor +${(f.tick/1e7).toFixed(7)} s from first source row` : 'Right hand · no measured positions displayed';
      paint();
    }
    function pause() { playing=false; cancelAnimationFrame(raf); ui.play.textContent='Play'; }
    function selectSegment(id) {
      if (disposed) return false;
      pause(); absentTime=null; index=0; segment=recording.segments.find(s=>s.segmentId===id)||null;
      field=segment ? bounds(segment) : null; ui.pick.value=segment?.segmentId||'';
      ui.caption.textContent=segment ? `Observer’s description · ${segment.label}` : 'This selection has no matching recorded interval in this file.';
      // Start on the earliest tracked sample. Earlier gaps remain accessible on the slider.
      if (segment) index=Math.max(0,segment.frames.findIndex(f=>f.xyz.some(Boolean)));
      ui.timebar.max=String(Math.max(0,(segment?.frames.length||0)-1));
      initialOrbit=startingOrbit(segment);resetView();update();return !!segment;
    }
    function changeZoom(factor) {orbit.zoom=Math.max(.3,Math.min(5,orbit.zoom*factor));paint();}
    function play() {
      if (playing) {pause();return;}
      const frames=segment?.frames; if (!frames || frames.length<2) return;
      if (index===frames.length-1) index=0;
      const start=performance.now(), origin=frames[index].t;
      playing=true;ui.play.textContent='Pause';
      function step(now) {
        if (!playing || disposed) return;
        const wanted=origin+(now-start)/1000, previous=index, priorGap=absentTime!==null;
        while(index+1<frames.length && frames[index+1].t<=wanted) index++;
        absentTime=(index<frames.length-1 && wanted-frames[index].t>1.5*recording.clock.medianSyncStepSeconds)?wanted:null;
        if (index!==previous || priorGap || absentTime!==null) update();
        if (index===frames.length-1) {pause();return;}
        raf=requestAnimationFrame(step);
      }
      absentTime=null;update();raf=requestAnimationFrame(step);
    }
    ui.pick.addEventListener('change',()=>{if (selectSegment(ui.pick.value) && typeof onSegmentChange==='function') onSegmentChange(segment.segmentId);});
    ui.play.addEventListener('click',play);
    ui.timebar.addEventListener('input',()=>{pause();absentTime=null;index=Number(ui.timebar.value);update();});
    ui.joint.addEventListener('change',update);ui.follow.addEventListener('change',paint);
    ui.in.addEventListener('click',()=>changeZoom(1.26));ui.out.addEventListener('click',()=>changeZoom(1/1.26));
    ui.reset.addEventListener('click',()=>{resetView();paint();});
    ui.canvas.addEventListener('pointerdown',e=>{if(drag || e.button!==0) return;drag={id:e.pointerId,x:e.clientX,y:e.clientY};ui.canvas.setPointerCapture(e.pointerId);});
    ui.canvas.addEventListener('pointermove',e=>{if(!drag || e.pointerId!==drag.id) return; const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      if(e.shiftKey) orbit.roll+=dx*.013;else {orbit.yaw+=dx*.013;orbit.pitch+=dy*.013;}
      drag.x=e.clientX;drag.y=e.clientY;paint();});
    for (const event of ['pointerup','pointercancel','lostpointercapture']) ui.canvas.addEventListener(event,e=>{if(drag?.id===e.pointerId) drag=null;});
    ui.canvas.addEventListener('wheel',e=>{e.preventDefault();changeZoom(e.deltaY<0?1.11:1/1.11);},{passive:false});
    ui.canvas.addEventListener('keydown',e=>{const d=.15;
      const controls={ArrowLeft:()=>orbit.yaw-=d,ArrowRight:()=>orbit.yaw+=d,ArrowUp:()=>orbit.pitch+=d,ArrowDown:()=>orbit.pitch-=d,q:()=>orbit.roll-=d,e:()=>orbit.roll+=d,'+':()=>changeZoom(1.26),'-':()=>changeZoom(1/1.26),Home:resetView};
      if (Object.hasOwn(controls,e.key)) {e.preventDefault();controls[e.key]();paint();}});
    const resize=new ResizeObserver(paint);resize.observe(ui.canvas);
    const hide=()=>{if(document.hidden) pause();};document.addEventListener('visibilitychange',hide);
    selectSegment(segmentId ?? recording.segments[0].segmentId);
    return {selectSegment,pause,destroy(){ disposed=true;pause();resize.disconnect();document.removeEventListener('visibilitychange',hide);el.remove(); }};
  }
  globalThis.mountHandReplay=mountHandReplay;
})();
