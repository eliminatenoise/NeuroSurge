/* Frozen count-model inference for Area 2. Classic script for file:// and browser embeds. */
(function (global) {
  'use strict';
  const contactIds = Object.freeze([4,12,13,15,16,18,19,25,27,29,31,35,36,37,39,49,51,52,53,54,58,61,65,72,88,90]);
  const modes = Object.freeze({
    all:[true,true,true], count_cue:[false,true,true], cue:[false,false,true],
    movement:[true,false,false], count:[false,true,false], movement_cue:[true,false,true]
  });
  function matrix(rows, n, m, name, count=false) {
    if (!Array.isArray(rows) || rows.length!==n || rows.some(row=>!Array.isArray(row) || row.length!==m ||
        row.some(v=>!Number.isFinite(v) || (count && (!Number.isSafeInteger(v) || v<0))))) {
      throw new Error('Expected '+name+' with '+n+' rows and '+m+' valid numbers per row.');
    }
  }
  function history(packet) {
    if (!packet || packet.contact_ids?.length!==26 || !contactIds.every((id,i)=>packet.contact_ids[i]===id)) {
      throw new Error('Contact order differs from the recorded guide.');
    }
    const {position,counts,cues,elapsed}=packet;
    matrix(position,20,2,'encoder positions');
    matrix(counts,20,26,'prior counts',true);
    matrix(cues,5,7,'cue flags and directions');
    matrix(elapsed,5,3,'cue elapsed times');
    const tokens=[];
    for (let i=0;i<5;i++) {
      const first=position[i*4], last=position[i*4+3];
      const totals=counts.slice(i*4,i*4+4).reduce((a,row)=>a.map((v,c)=>v+row[c]),Array(26).fill(0));
      tokens.push([...last,last[0]-first[0],last[1]-first[1],...totals,...cues[i],...elapsed[i]]);
    }
    return tokens;
  }
  function previous(packet) {
    matrix(packet.counts,20,26,'prior counts',true);
    return packet.counts.slice(-10).reduce((a,row)=>a.map((v,c)=>v+row[c]),Array(26).fill(0));
  }
  const plus=(a,b)=>a.map((v,i)=>v+b[i]);
  const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
  function predict(w, raw) {
    matrix(raw,5,40,'input tokens');
    for(const [t,token] of raw.entries()){
      if(token.slice(4,30).some(v=>!Number.isSafeInteger(v)||v<0)) throw new Error('Earlier contact counts must be whole nonnegative numbers.');
      for(const [flag,clock] of [[30,37],[33,38],[36,39]]){
        const seen=token[flag], earlier=t?raw[t-1]:null;
        if(![0,1].includes(seen) || (earlier && earlier[flag]>seen) || (seen?token[clock]<=0:token[clock]!==0))
          throw new Error('Cue visibility and elapsed time disagree.');
        if(flag===36)continue;
        const dx=token[flag+1],dy=token[flag+2];
        if((seen?dx*dx+dy*dy!==1:dx!==0||dy!==0) || (earlier?.[flag]===1 && (earlier[flag+1]!==dx || earlier[flag+2]!==dy)))
          throw new Error('Invalid direction for a visible cue.');
      }
    }
    const keep=modes[w.mode];
    if (w.format!=='area2-26-contact-count-v1' || !keep || w.contact_ids?.length!==26 || !contactIds.every((id,i)=>w.contact_ids[i]===id)) {
      throw new Error('Unknown model arm or contact order.');
    }
    const x=raw.map(row=>row.map((v,i)=>keep[i<4?0:i<30?1:2] && w.x_active[i] ?
      Math.max(-8,Math.min(8,(v-w.x_mean[i])/w.x_scale[i])):0));
    const p=w.parameters;
    let mu;
    if (p.coef) {
      const z=p.intercept.slice();
      x.flat().forEach((v,i)=>p.coef[i].forEach((c,j)=>{z[j]+=v*c;}));
      mu=z.map(Math.exp);
    } else {
      const linear=(v,name)=>p[name+'.weight'].map((row,i)=>dot(v,row)+p[name+'.bias'][i]);
      function norm(v,name) {
        const mean=v.reduce((s,n)=>s+n,0)/v.length;
        const inverse=1/Math.sqrt(v.reduce((s,n)=>s+(n-mean)**2,0)/v.length+1e-5);
        return v.map((n,i)=>(n-mean)*inverse*p[name+'.weight'][i]+p[name+'.bias'][i]);
      }
      const h=x.map((token,t)=>plus(linear(token,'embed'),p.position[t]));
      const qkv=h.map(token=>linear(norm(token,'attn_norm'),'qkv'));
      // Only the last token feeds the readout after this single self-attention layer.
      const attended=[];
      for (const start of [0,8]) {
        const q=qkv[4].slice(start,start+8);
        const scores=qkv.map(v=>dot(q,v.slice(16+start,24+start))/Math.sqrt(8));
        const peak=Math.max(...scores), exp=scores.map(s=>Math.exp(s-peak));
        const sum=exp.reduce((s,v)=>s+v,0);
        for (let j=0;j<8;j++) attended.push(qkv.reduce((s,v,i)=>s+exp[i]/sum*v[32+start+j],0));
      }
      const last=plus(h[4],linear(attended,'project'));
      const ff=linear(norm(last,'ff_norm'),'expand').map(v=>Math.max(v,0));
      const z=linear(norm(plus(last,linear(ff,'reduce')),'final_norm'),'readout');
      mu=z.map(v=>Math.max(v,0)+Math.log1p(Math.exp(-Math.abs(v)))+1e-6);
    }
    if (mu.length!==26 || !mu.every(v=>Number.isFinite(v) && v>=0)) throw new Error('Invalid expected count.');
    return mu;
  }
  function forecast(weights, means, row, packet, family, mode, seed) {
    if (family==='simple') {
      if (mode==='mean') return means.slice();
      if (mode==='persistence') return previous(packet);
      throw new Error('Unknown simple comparison.');
    }
    if (!['transformer','poisson'].includes(family)) throw new Error('Unknown model family.');
    let raw=history(packet), arm=mode;
    if (mode==='wrong_movement') {
      if (!row.donor) return null;
      raw=raw.map((r,t)=>[...row.donor.movement[t],...r.slice(4)]);
      arm='all';
    }
    const key=arm+'-'+(family==='poisson'?'poisson':seed);
    if (!weights[key]) throw new Error('Missing fitted model '+key);
    return predict(weights[key],raw);
  }
  global.ContactForecast=Object.freeze({contactIds,history,previous,predict,forecast});
})(globalThis);
