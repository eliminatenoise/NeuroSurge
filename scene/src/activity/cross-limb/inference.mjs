/** Named muscle activity and marker translation in the source coordinate system. */
export const muscles = ['left tibialis anterior','left soleus','left medial gastrocnemius','left peroneus longus',
  'right tibialis anterior','right soleus','right medial gastrocnemius','right peroneus longus',
  'right anterior deltoid','right brachioradialis','right flexor digitorum','right common extensor digitorum',
  'right first dorsal interosseous'];

function vector(length, fn) { return Array.from({length}, (_,i) => fn(i)); }
function dot(a,b) { return a.reduce((s,x,i) => s+x*b[i],0); }
function add(a,b) { return a.map((x,i)=>x+b[i]); }
function relu(a) { return a.map(x=>Math.max(0,x)); }
function mean(a) { return a.reduce((s,x)=>s+x,0)/a.length; }
function linear(state,key,x) {
  const bias=state[key+'.bias'];
  return state[key+'.weight'].map((w,i)=>dot(w,x)+bias[i]);
}
function norm(state,key,x) {
  const m=mean(x), sd=Math.sqrt(mean(x.map(y=>(y-m)**2))+1e-5);
  return x.map((v,i)=>(v-m)/sd*state[key+'.weight'][i]+state[key+'.bias'][i]);
}
function shape(x,expected) {
  if (!expected.length) return typeof x==='number' && Number.isFinite(x);
  return Array.isArray(x) && x.length===expected[0] && x.every(i=>shape(i,expected.slice(1)));
}
function validInput(e) {
  if (![0,1].includes(e.domain) || !Number.isInteger(e.session) ||
      (e.domain===0 ? ![0,1].includes(e.session)||![-1,1].includes(e.direction) : e.session<1||e.direction!==0))
    throw Error('Invalid study context');
  const mask=e.muscle_mask;
  if (!Array.isArray(mask)||mask.length!==13||mask.some(v=>typeof v!=='boolean') ||
      (e.domain===0 ? mask.some((v,j)=>v!==(j<8)) : mask.slice(0,8).some(Boolean)||mask.filter(Boolean).length<3))
    throw Error('Invalid muscle availability');
  if (!shape(e.patch_rms,[20,13])||!shape(e.past_rms,[13])||!shape(e.patch_xyz_mm,[20,3])||!shape(e.age_s,[20]))
    throw Error('Invalid dimensions or nonfinite input');
  if ([...e.patch_rms,e.past_rms].some(r=>r.some((v,j)=>v<0||(!mask[j]&&v!==0)))) throw Error('Invalid RMS or masked placeholder');
  if (e.age_s.some(v=>v< -1e-8||v>(e.domain ? 1/500 : 1/256)+1e-8) || Math.abs(e.age_s[19])>1e-7 ||
      e.patch_xyz_mm[19].some(v=>Math.abs(v)>1e-4)) throw Error('Marker time or cutoff-relative coordinate out of range');
}
function scalpTokens(weights, event) {
  const {scalp_values: values, scalp_mask: mask, domain} = event;
  if (!shape(values,[20,3,2]) || !Array.isArray(mask) || mask.length !== 3 ||
      mask.some(v => typeof v !== 'boolean') || !mask.some(Boolean))
    throw Error('Supply twenty scalp mean/RMS bins and three site availability flags');
  const branch = weights.kind === 'reference' ? 'central' : weights.kind;
  if (!['central','frontal','eye','neck'].includes(branch)) throw Error('Unknown scalp input branch');
  const sites = weights.site_names[branch][domain];
  if (mask.some((present,j) => present && !sites[j])) throw Error('Site unavailable in this study');
  const scaling = weights.scalp_scales[branch][domain];
  if (mask.some((present,j)=>present && !(scaling.count[j]>0))) throw Error('Site absent in fitting fold');
  return values.map(bin => bin.flatMap(([m,r],j) => {
    if (r < 0 || Math.abs(m) > r + 1e-5*Math.max(1,r) || (!mask[j] && (m !== 0 || r !== 0)))
      throw Error('Invalid scalp mean, RMS or missing-site placeholder');
    if (!mask[j] || weights.kind === 'reference') return [0,0,Number(mask[j])];
    return [Math.fround((m-scaling.mean[j][0])/scaling.scale[j][0]), Math.fround((r-scaling.mean[j][1])/scaling.scale[j][1]), 1];
  }));
}

export function predict(weights,e) {
  validInput(e);
  const dual = weights.format === 'cross-limb-path-map-v1';
  const scalp = weights.format === 'scalp-muscle-motion-v1';
  if ((!dual && !scalp && weights.format !== 'cross-limb-temporal-v1') ||
      (dual && !['separate', 'matched'].includes(weights.kind)) ||
      JSON.stringify(weights.muscles) !== JSON.stringify(muscles))
    throw Error('Unknown checkpoint format or muscle vocabulary');
  const s=weights.state, d=e.domain, mask=e.muscle_mask;
  const rmsScale=weights.scales.amp[d], xyzScale=weights.scales.xyz[d];
  const electrical = scalp ? scalpTokens(weights, e) : null;
  const active=muscles.map((_,j)=>j).filter(j=>mask[j]);
  const pose=e.patch_xyz_mm.map(x=>x.map(v=>v/xyzScale));
  const x=e.patch_rms.map((r,i)=>{
    const amps=active.map(j=>Math.log1p(r[j]/rmsScale[j]));
    const pool=vector(8,k=>mean(active.map((j,a)=>Math.max(0,s['names.weight'][j][k]+amps[a]*s.slope[k]))));
    const patch=linear(s,'patch',[...pool,...pose[i],e.age_s[i]*500,d===0?e.session:0,e.direction,d]);
    const token = electrical ? add(patch,s['scalp_patch.weight'].map(w => dot(w,electrical[i]))) : patch;
    return add(add(token,s['time.weight'][i]),s['segment.weight'][d]);
  });
  // No later layer mixes tokens. Only the final query influences the two forecasts.
  const qkv=x.map(row=>linear(s,'qkv',row));
  const attended=[];
  for(let head=0;head<2;head++) {
    const offset=8*head;
    const q=qkv[19].slice(offset,offset+8);
    const logits=qkv.map(r=>dot(q,r.slice(16+offset,24+offset))/Math.sqrt(8));
    const mx=Math.max(...logits), exp=logits.map(v=>Math.exp(v-mx)), sum=exp.reduce((a,b)=>a+b,0);
    for(let k=0;k<8;k++) attended.push(exp.reduce((acc,p,t)=>acc+p/sum*qkv[t][32+offset+k],0));
  }
  const z=norm(s,'norm1',add(x[19],linear(s,'attn_out',attended)));
  const h=norm(s,'norm2',add(z,linear(s,'ff2',relu(linear(s,'ff1',z)))));
  const rstate=linear(s,'rms_state',h);
  const rms=muscles.map((_,j)=>mask[j] ? Math.max(0,e.past_rms[j]/rmsScale[j]+
    linear(s,'rms_out',relu(add(rstate,s['names.weight'][j])))[0])*rmsScale[j] : null);
  const hpath=linear(s,'path_state',h);
  const interval=1/32+e.age_s[18]-e.age_s[19];
  const velocity=pose[19].map((v,j)=>(v-pose[18][j])*(.125/interval));
  const path_mm = vector(32, i => {
    const features = relu(add(hpath, s['path_time.weight'][i]));
    const byStudy = dual && weights.kind === 'separate';
    let residual = linear(s, byStudy && d === 1 ? 'path_alt' : 'path_out', features);
    if (dual && weights.kind === 'matched') {
      const late = linear(s, 'path_alt', features);
      residual = residual.map((early, axis) => early + (i / 31) * (late[axis] - early));
    }
    return add(velocity, residual).map(v => v * ((i + 1) / 32) * xyzScale);
  });
  return {rms,path_mm};
}

/** Build the causal model input from already qualified native history. Times are seconds relative to cutoff. */
export function encodeHistory({domain,session,direction,channel_names,emg_s,emg,pose_s,pose_mm}) {
  const er=domain===0?256:4000, pr=domain===0?256:500, eps=1e-8;
  if (!Array.isArray(channel_names)||new Set(channel_names).size!==channel_names.length) throw Error('Duplicate or absent muscle names');
  const ids=channel_names.map(n=>muscles.indexOf(n));
  if (ids.some(j=>j<0)) throw Error('Unknown muscle name');
  function history(t,a,width,rate) {
    if (!Array.isArray(t)||t.length<2||!shape(t,[t.length])||!shape(a,[t.length,width])||
        Math.abs(t.at(-1))>eps||t[0]>-.625+1/rate+eps||t.some((v,i)=>v>eps||(i&&Math.abs(v-t[i-1]-1/rate)>eps)))
      throw Error('Missing, irregular or future native history');
  }
  history(emg_s,emg,ids.length,er); history(pose_s,pose_mm,3,pr);
  const muscle_mask=muscles.map((_,j)=>ids.includes(j)), patch_rms=[],patch_xyz_mm=[],age_s=[];
  for(let i=0;i<20;i++) {
    const end=(i-19)/32;
    const chosen=emg_s.map((time,k)=>time>end-1/32+eps&&time<=end+eps?k:-1).filter(k=>k>=0);
    if(chosen.length!==er/32) throw Error('Missing electrical sample');
    const r=Array(13).fill(0);
    ids.forEach((j,col)=>{ r[j]=Math.sqrt(mean(chosen.map(k=>emg[k][col]**2))); });
    patch_rms.push(r);
    const k=pose_s.findLastIndex(v=>v<=end+eps);
    if(k<0) throw Error('Missing causal marker sample');
    patch_xyz_mm.push(pose_mm[k].map((v,j)=>v-pose_mm.at(-1)[j]));
    age_s.push(Math.max(0,end-pose_s[k]));
  }
  const past_rms=muscles.map((_,j)=>Math.sqrt(mean(patch_rms.slice(-4).map(r=>r[j]**2))));
  const out={domain,session,direction,muscle_mask,patch_rms,patch_xyz_mm,age_s,past_rms};
  validInput(out);
  return out;
}
