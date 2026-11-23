// Same issue-frame transform as landmarks.py. Pixel x and y share a unit.
// The endpoint is deliberately unavailable here; it is used only for later scoring.
export const WRIST = {left:15, right:16};
export const TRACKED_POINTS = Object.freeze({
  left: {index:15,label:'left wrist'},
  right: {index:16,label:'right wrist'},
  'left-shoulder': {index:11,label:'left shoulder'},
  'right-shoulder': {index:12,label:'right shoulder'},
  'left-elbow': {index:13,label:'left elbow'},
  'right-elbow': {index:14,label:'right elbow'},
  'left-hip': {index:23,label:'left hip'},
  'right-hip': {index:24,label:'right hip'},
  'left-knee': {index:25,label:'left knee'},
  'right-knee': {index:26,label:'right knee'},
  'left-ankle': {index:27,label:'left ankle'},
  'right-ankle': {index:28,label:'right ankle'}
});
const visible = point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);
export function trackedPoint(selection, xy) {
  if (selection === 'auto') {
    return visible(xy[WRIST.left]) ? TRACKED_POINTS.left : TRACKED_POINTS.right;
  }
  return (Object.hasOwn(TRACKED_POINTS, selection) && TRACKED_POINTS[selection]) || null;
}
export const BONES = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
export function observation(rows, point, lead=.12) {
  if (rows.length !== 5 || rows.some((row,i)=>!Number.isFinite(row.t) || (i && (row.t<=rows[i-1].t || row.t-rows[i-1].t>.24+1e-10)))) return null;
  const last=rows[4];
  const eligible=last.xy.map((p,j)=>visible(p) && rows.filter(r=>visible(r.xy[j])).length>=3);
  if (!eligible[point]) return null;
  const indices=eligible.flatMap((ok,j)=>ok?[j]:[]);
  const center=[0,1].map(a=>indices.reduce((s,j)=>s+last.xy[j][a],0)/indices.length);
  const radius=Math.sqrt(indices.reduce((s,j)=>s+(last.xy[j][0]-center[0])**2+(last.xy[j][1]-center[1])**2,0)/indices.length);
  if (!Number.isFinite(radius) || radius<=0) return null;
  const origin=last.xy[point], shape=origin.map((x,a)=>(x-center[a])/radius);
  const X=rows.map(row=>{
    const present=indices.filter(j=>visible(row.xy[j]));
    const mean=[0,1].map(a=>present.length?present.reduce((s,j)=>s+(row.xy[j][a]-last.xy[j][a])/radius,0)/present.length:null);
    const displacement=visible(row.xy[point])?row.xy[point].map((x,a)=>(x-origin[a])/radius):[null,null];
    return [...displacement,...mean,...shape,row.t-last.t,lead];
  });
  return {X:[X],point,origin,radius,lead,issue:last.t,frameId:last.id};
}
export function endpoint(packet, prediction) {
  if (!Array.isArray(prediction) || prediction.length!==2 || !prediction.every(Number.isFinite)) throw Error('Invalid landmark forecast.');
  return prediction.map((x,i)=>packet.origin[i]+packet.radius*x);
}

// Record the closest usable point while the forecast can still be in flight.
// The first usable frame at or after the target closes the comparison window.
export function observeTarget(comparison, frame) {
  if (comparison.closed) return;
  const {packet, match} = comparison;
  const target = packet.issue + packet.lead;
  const offset = frame.t - target;
  const distance = Math.abs(offset);
  const coordinates = frame.xy[packet.point];
  const usable = visible(coordinates);
  const tolerance = .04;
  // Absorb rounding from adding the lead and subtracting source times.
  const precision = 2 * Number.EPSILON * Math.max(Math.abs(target), Math.abs(frame.t), tolerance);
  if (frame.t > packet.issue && distance <= tolerance + precision && usable &&
      (!match || distance < match.distance - precision)) {
    comparison.match = {time: frame.t, distance, coordinates: [...coordinates]};
  }
  comparison.closed = offset > tolerance + precision || (offset >= -precision && usable && !!comparison.match);
}

export function parseGoal(text) {
  const s=text.trim().toLowerCase().replace(/[.!?]+$/,'').replace(/\s+/g,' ');
  const m=/^(?:(?:please|can you|could you) )?(?:(?:raise|lift|move|bring|put|get) (?:my |your |the |the avatar['’]s )?(left|right) (?:hand|wrist|arm) (?:up )?(?:above|over|higher than) (?:my |your |the |its |that |the same |the avatar['’]s )?(?:(left|right) )?shoulder)(?: please)?$/.exec(s);
  if (!m || (m[2] && m[1]!==m[2])) return null;
  return {effector:m[1]+' wrist',side:m[1],relation:'above ipsilateral shoulder',targetClearancePx:48,tolerancePx:4,targetClearanceM:.05,toleranceM:.005,frame:'640 × 480 virtual frontal plane'};
}
// A two-link kinematic body with independent wrist/shoulder readback in its drawing plane.
export function virtualFrame(side,phase,extraDegrees=0) {
  const xy=Array(33).fill(null), u=Math.min(1,Math.max(0,phase)), smooth=u*u*(3-2*u);
  for(const [arm,sign,shoulder,elbow,wrist,hip,knee,ankle] of [['left',1,11,13,15,23,25,27],['right',-1,12,14,16,24,26,28]]) {
    const a=(arm===side?12+110*smooth+extraDegrees:12)*Math.PI/180, b=a+10*Math.PI/180;
    xy[shoulder]=[320+sign*55,176];
    xy[elbow]=[xy[shoulder][0]+sign*62*Math.sin(a),xy[shoulder][1]+62*Math.cos(a)];
    xy[wrist]=[xy[elbow][0]+sign*58*Math.sin(b),xy[elbow][1]+58*Math.cos(b)];
    xy[hip]=[320+sign*42,310]; xy[knee]=[320+sign*43,372]; xy[ankle]=[320+sign*48,438];
  }
  return xy;
}
export function checkGoal(intent,xy) {
  const clearance=xy[intent.side==='left'?11:12][1]-xy[WRIST[intent.side]][1];
  const shortfall=Math.max(0,intent.targetClearancePx-clearance);
  return {clearance,shortfall,passed:shortfall<=intent.tolerancePx};
}
export function virtualUnits() {
  // Three invented units in millisecond bins, with all three decay traces from rat.py.
  const events=[[0,0],[1,1],[3,1],[9,2],[12,1],[14,0]],issue=14;
  return [[0,1,2].map(unit=>{
    const history=events.filter(([,u])=>u===unit).map(([t])=>t);
    return [[Math.log1p(history.length),...[10,100,1000].map(tau=>Math.log1p(history.reduce((s,t)=>s+Math.exp(-(issue-t)/tau),0))),Number(history.includes(issue))]];
  })];
}
