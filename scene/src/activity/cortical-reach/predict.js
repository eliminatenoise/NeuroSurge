/* Offline area 2 Transformer inference. Load with a classic script on file:// or via predict.mjs. */
(function (global) {
  'use strict';
  const session = 'C_20170912_COactpas';
  const units = Object.freeze([
    'ch12:sort1','ch13:sort1','ch16:sort1','ch17:sort1','ch18:sort1','ch24:sort1',
    'ch25:sort1','ch27:sort1','ch27:sort2','ch29:sort1','ch35:sort1','ch35:sort2',
    'ch37:sort1','ch39:sort1','ch49:sort1','ch52:sort1','ch52:sort2','ch53:sort1',
    'ch55:sort1','ch56:sort1','ch58:sort1','ch61:sort1','ch62:sort1','ch65:sort1',
    'ch67:sort1','ch70:sort1','ch72:sort1','ch73:sort1','ch90:sort1','ch92:sort1'
  ]);
  const widths = {movement: 4, neural: 30, cue: 7};
  const modes = {all: Object.keys(widths), movement_cue: ['movement','cue'],
    neural_cue: ['neural','cue'], cue_only: ['cue'], movement_only: ['movement'], neural_only: ['neural']};
  const shapes = {position:[5,16]};
  for (const [layer,size] of Object.entries({embed:[16,41],qkv:[48,16],project:[16,16],
    expand:[32,16],reduce:[16,32],readout:[2,16]})) {
    shapes[layer+'.weight'] = size;
    shapes[layer+'.bias'] = [size[0]];
  }
  for (const layer of ['attn_norm','ff_norm','final_norm']) {
    shapes[layer+'.weight']=[16];
    shapes[layer+'.bias']=[16];
  }
  function check(value, dimensions, label) {
    if (!dimensions.length) {
      if (!Number.isFinite(value)) throw new Error(label+' must contain finite numbers');
      return;
    }
    if (!Array.isArray(value) || value.length!==dimensions[0]) throw new Error('invalid shape: '+label);
    for (const element of value) check(element,dimensions.slice(1),label);
  }
  function sameUnits(ids) {
    return Array.isArray(ids) && ids.length===units.length && units.every((id,i)=>id===ids[i]);
  }
  function checkCues(rows) {
    for (const col of [0,3,6]) {
      for (let i=0;i<rows.length;i++) {
        const row=rows[i], prior=i?rows[i-1]:null, flag=row[col];
        if (![0,1].includes(flag) || (prior && prior[col]>flag)) throw new Error('invalid cue flag');
        if (col===6) continue;
        const [c,s]=row.slice(col+1,col+3);
        if (flag===0 && (c!==0 || s!==0)) throw new Error('unavailable direction must be zero');
        if (flag===1 && Math.abs(Math.hypot(c,s)-1)>1e-5) throw new Error('direction must be a unit vector');
        if (prior && prior[col]===1 && Math.max(Math.abs(prior[col+1]-c),Math.abs(prior[col+2]-s))>1e-5)
          throw new Error('known direction changed within input history');
      }
    }
  }
  function validateWeights(w) {
    if (!w || w.format!=='area2-handle-transformer-v1' || w.session!==session ||
      !Object.hasOwn(modes,w.mode) || ![17,41,73].includes(w.seed) || !sameUnits(w.unit_ids))
      throw new Error('unknown weights format, session, unit order, seed or mode');
    const p=w.parameters;
    if (!p || Object.keys(p).length!==Object.keys(shapes).length) throw new Error('unexpected parameters');
    for (const [name,size] of Object.entries(shapes)) check(p[name],size,name);
    for (const [name,size] of Object.entries({x_mean:[41],x_scale:[41],y_mean:[2],y_scale:[]}))
      check(w[name],size,name);
    if (w.x_scale.some(v=>v<=0) || w.y_scale<=0) throw new Error('scale must be positive');
  }
  const plus=(a,b)=>a.map((v,i)=>v+b[i]);
  const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
  function predict(w, input) {
    validateWeights(w);
    if (!input || input.session!==session) throw new Error('session mismatch');
    const kept=modes[w.mode];
    for (const [name,width] of Object.entries(widths)) {
      if (!Object.hasOwn(input,name)) {
        if (kept.includes(name)) throw new Error('missing required history: '+name);
        continue;
      }
      check(input[name],[5,width],name);
      if (name==='neural') {
        if (!sameUnits(input.unit_ids)) throw new Error('recording or unit order differs');
        if (input[name].some(row=>row.some(v=>!Number.isSafeInteger(v)||v<0)))
          throw new Error('counts must be nonnegative safe integers');
      }
      if (name==='cue') checkCues(input.cue);
    }
    const x=Array.from({length:5},(_,t)=>{
      const token=[];
      for (const [name,width] of Object.entries(widths)) {
        for (let i=0;i<width;i++) {
          const j=token.length;
          token.push(kept.includes(name)?Math.max(-8,Math.min(8,(input[name][t][i]-w.x_mean[j])/w.x_scale[j])):0);
        }
      }
      return token;
    });
    const p=w.parameters;
    const linear=(v,name)=>p[name+'.weight'].map((row,i)=>dot(v,row)+p[name+'.bias'][i]);
    const norm=(v,name)=>{
      const mean=v.reduce((s,n)=>s+n,0)/v.length;
      const inverse=1/Math.sqrt(v.reduce((s,n)=>s+(n-mean)*(n-mean),0)/v.length+1e-5);
      return v.map((n,i)=>(n-mean)*inverse*p[name+'.weight'][i]+p[name+'.bias'][i]);
    };
    let h=x.map((token,t)=>plus(linear(token,'embed'),p.position[t]));
    const qkv=h.map(token=>linear(norm(token,'attn_norm'),'qkv'));
    h=h.map((token,t)=>{
      const output=[];
      for (const start of [0,8]) {
        const query=qkv[t].slice(start,start+8);
        const scores=qkv.map(v=>dot(query,v.slice(16+start,24+start))/Math.sqrt(8));
        const peak=Math.max(...scores);
        const exp=scores.map(s=>Math.exp(s-peak));
        const total=exp.reduce((s,v)=>s+v,0);
        for (let j=0;j<8;j++) output.push(qkv.reduce((s,v,i)=>s+exp[i]/total*v[32+start+j],0));
      }
      return plus(token,linear(output,'project'));
    });
    const last=h[4];
    const ff=linear(norm(last,'ff_norm'),'expand').map(v=>Math.max(v,0));
    const result=linear(norm(plus(last,linear(ff,'reduce')),'final_norm'),'readout')
      .map((v,i)=>v*w.y_scale+w.y_mean[i]);
    if (!result.every(Number.isFinite)) throw new Error('nonfinite forecast');
    return result;
  }
  global.Area2Forecast = Object.freeze({predict, unitIds:units, session});
})(globalThis);
