/* CPU inference with the released eight-token Transformer. No dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VisualWalkForecast = api;
})(globalThis, function () {
  'use strict';
  const sequence = (n, fn) => Array.from({length:n}, (_, i) => fn(i));
  function dim(a, n, label) {
    if (!Array.isArray(a) || a.length !== n) throw new TypeError('Expected '+label+' with length '+n);
  }
  function finite(x, label) {
    if (!Number.isFinite(x)) throw new TypeError('Expected finite '+label);
    return x;
  }
  function clipped(x, stat, i) {
    return Math.min(6, Math.max(-6, (x-stat.mean[i])/stat.sd[i]));
  }
  function branchSignals(event, norm, prefix, n) {
    const good = event[prefix+'_good'];
    dim(good, n, prefix+' mask');
    good.forEach(v => { if (typeof v !== 'boolean') throw new TypeError('Expected Boolean channel mask'); });
    return ['mean','rms'].map(type => {
      const key = prefix+'_'+type+'_uv', data = event[key], stat = norm[key];
      dim(data, 8, key);
      const seen = good.map((x,i) => x && stat.seen[i]);
      const values = data.map(bin => {
        dim(bin, n, key+' bin');
        return bin.map((x,i) => {
          if (!good[i]) return 0;
          finite(x, key);
          if (type === 'rms' && x < 0) throw new TypeError('RMS voltage cannot be negative');
          return seen[i] ? clipped(type==='rms'?Math.log1p(x):x,stat,i) : 0;
        });
      });
      return {seen, values};
    });
  }
  function scalpFields(values, seen) {
    return sequence(8, j => {
      const bank = Math.floor(j/2), mode = j%2;
      let sum = 0, denom = 0;
      for (let c=0;c<32;c++) {
        const ix=bank*32+c, w=Math.cos(Math.PI*mode*(c+.5)/32);
        if (seen[ix]) { sum+=w*values[ix]; denom+=w*w; }
      }
      return denom>0 ? sum/Math.sqrt(denom) : 0;
    });
  }
  function dot(a,b) { let s=0; for(let i=0;i<a.length;i++) s+=a[i]*b[i]; return s; }
  function linear(x, s, name) {
    const bias = s[name+'.bias'];
    return s[name+'.weight'].map((w,i) => dot(x,w)+(bias?bias[i]:0));
  }
  function plus(a,b) { return a.map((v,i)=>v+b[i]); }
  function layernorm(x,s,name) {
    const mean=x.reduce((a,b)=>a+b,0)/x.length;
    const variance=x.reduce((a,b)=>a+(b-mean)**2,0)/x.length;
    return x.map((v,i)=>(v-mean)/Math.sqrt(variance+1e-5)*s[name+'.weight'][i]+s[name+'.bias'][i]);
  }
  function predict(event,bundle) {
    if (!bundle || !['full','no_scalp'].includes(bundle.mode)) throw new TypeError('Unknown weight branch');
    if (event.direction!==1 && event.direction!==-1) throw new TypeError('Direction must be ±1');
    const m=event.motion_mm;
    dim(m,160,'motion samples');
    const motion=m.map(pair=>{
      dim(pair,2,'markers');
      for(const xyz of pair) { dim(xyz,3,'source axes'); xyz.forEach(v=>finite(v,'coordinate')); }
      return pair.flat();
    });
    if (motion[159].some(v=>Math.abs(v)>1e-5)) throw new TypeError('Motion must be centred at the final sample');
    const norm=bundle.norm, s=bundle.state;
    const nuisance=branchSignals(event,norm,'nuisance',13);
    const eeg=branchSignals(event,norm,'eeg',128);
    const tokens=sequence(8,t=>{
      const last=motion[t*20+19], first=motion[t*20];
      const pos=last.concat(last.map((v,i)=>v-first[i])).map((v,i)=>clipped(v,norm.motion,i));
      let slots=pos.concat(nuisance[0].values[t].slice(0,4));
      if(bundle.mode==='full') {
        const fields=eeg.flatMap(a=>scalpFields(a.values[t],a.seen));
        slots=slots.map((v,i)=>v+.35*fields[i]);
      }
      return pos.concat(nuisance[0].values[t],nuisance[1].values[t],event.direction,slots);
    });
    const h=tokens.map((x,i)=>plus(linear(x,s,'embed'),s.position[i]));
    const qkv=h.map(x=>linear(x,s,'qkv'));
    const mixed=[];
    for(let head=0;head<3;head++){
      const start=head*8, q=qkv[7].slice(start,start+8);
      const scores=qkv.map(row=>dot(q,row.slice(24+start,32+start))/Math.sqrt(8));
      const peak=Math.max(...scores), probs=scores.map(v=>Math.exp(v-peak)), sum=probs.reduce((a,b)=>a+b,0);
      for(let k=0;k<8;k++) mixed.push(probs.reduce((acc,v,i)=>acc+v/sum*qkv[i][48+start+k],0));
    }
    const z=layernorm(plus(h[7],linear(mixed,s,'attn_out')),s,'norm1');
    const ff=linear(linear(z,s,'hidden').map(Math.tanh),s,'project');
    const out=plus(linear(layernorm(plus(z,ff),s,'norm2'),s,'readout'),
                   linear(tokens.flatMap(a=>a.slice(0,12)),s,'motion_readout'));
    const mm=out.map((v,i)=>finite(v*norm.residual.sd[i]+norm.residual.mean[i]+motion[159][i]-motion[127][i],'forecast'));
    return [mm.slice(0,3),mm.slice(3)];
  }
  function example(phase=0,direction=1) {
    finite(phase,'phase');
    if(direction!==-1 && direction!==1) throw new TypeError('Direction must be ±1');
    const amplitudes=[16,11,7,21,15,10];
    const position=(i,k)=>amplitudes[k]*Math.sin(phase+i*.037+k*.43)+3*Math.cos(i*.081+phase+k*.7);
    const event={direction,motion_mm:sequence(160,i=>sequence(2,m=>sequence(3,j=>{
      const k=m*3+j;
      return position(i,k)-position(159,k);
    })))};
    for(const [prefix,channels,amp] of [['eeg',128,8],['nuisance',13,14]]) {
      event[prefix+'_good']=sequence(channels,j=>j%17!==5);
      for(const stat of ['mean','rms']) event[prefix+'_'+stat+'_uv']=sequence(8,t=>sequence(channels,j=>{
        if(!event[prefix+'_good'][j]) return 0;
        const mean=amp*Math.sin(phase+t*.41+j*.13)+.3*Math.cos(t+j);
        return stat==='mean'?mean:Math.sqrt(mean*mean+amp);
      }));
    }
    return event;
  }
  return Object.freeze({predict,example});
});
