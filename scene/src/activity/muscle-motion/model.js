/* Paired leg-muscle and sacrum forecasts. No network or runtime dependencies. */
(function (root) {
  "use strict";
  function matrix(value, columns, label) {
    if (!Array.isArray(value) || value.length !== 160 ||
        !value.every(row => Array.isArray(row) && row.length === columns && row.every(Number.isFinite))) {
      throw new TypeError(label + " must contain 160 finite rows of " + columns + " numbers");
    }
    return value;
  }

  function add(a, b) {
    return a.map((x, i) => x + b[i]);
  }

  function dot(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; ++i) sum += a[i] * b[i];
    return sum;
  }

  function projection(x, w, name) {
    return w[name + ".weight"].map((row, i) => dot(x, row) + w[name + ".bias"][i]);
  }

  function normalize(x, w, name) {
    const mean = x.reduce((a,b) => a+b, 0) / x.length;
    const variance = x.reduce((a,v) => a+(v-mean)**2, 0) / x.length;
    const inv = 1 / Math.sqrt(variance + 0.00001);
    return x.map((v, i) => (v-mean)*inv*w[name+".weight"][i] + w[name+".bias"][i]);
  }

  function encode(input, scale) {
    const leg = matrix(input.leg_uv, 8, "leg_uv");
    const xyz = matrix(input.sacrum_mm, 3, "sacrum_mm");
    if (![0,1].includes(input.posture) || ![-1,1].includes(input.direction)) {
      throw new TypeError("Use posture 0/1 and rotation direction -1/+1");
    }
    const hold = Array.from({length:8}, (_, j) =>
      Math.sqrt(leg.slice(-32).reduce((acc,row) => acc + row[j]**2, 0)/32));
    const velocity = xyz[159].map((x,i) => (x-xyz[143][i])/16);
    const tokens = [];
    for (let s=0; s<160; s+=8) {
      const raw = [];
      for (let j=0; j<8; j++) {
        let energy=0;
        for (let t=s; t<s+8; t++) energy += leg[t][j]**2;
        raw.push(Math.log1p(Math.sqrt(energy/8)));
      }
      for (let j=0; j<3; j++) {
        let sum=0;
        for (let t=s; t<s+8; t++) sum += xyz[t][j]-xyz[159][j];
        raw.push(sum/8);
      }
      for (let j=0; j<3; j++) raw.push(xyz[s+7][j]-xyz[s][j]);
      tokens.push([...raw.map((v,i) => (v-scale.mean[i])/scale.sd[i]), input.posture,input.direction]);
    }
    return {tokens,hold,velocity};
  }

  function estimate(features, scale, w) {
    const h = features.tokens.map((x,t) => add(projection(x,w,"inp"),w.pos[t]));
    const qkv = h.map(x => projection(normalize(x,w,"norm1"),w,"qkv"));
    // The heads read only the final token. Earlier tokens supply the keys and values.
    const ctx = [];
    for (let head=0; head<2; head++) {
      const ofs = head*12;
      const query = qkv[19].slice(ofs,ofs+12);
      const logits = qkv.map(row => dot(query,row.slice(24+ofs,36+ofs))/Math.sqrt(12));
      const max = Math.max(...logits);
      const exp = logits.map(v => Math.exp(v-max));
      const sum = exp.reduce((a,b)=>a+b,0);
      for (let j=0; j<12; j++) {
        let c=0;
        for (let t=0; t<20; t++) c += exp[t] * qkv[t][48+ofs+j]/sum;
        ctx.push(c);
      }
    }
    const x = add(h[19],projection(ctx,w,"mix"));
    const hidden = projection(normalize(x,w,"norm2"),w,"ff1").map(v=>Math.max(0,v));
    const out = normalize(add(x,projection(hidden,w,"ff2")),w,"outnorm");
    const result = {};
    if (w["muscle.weight"]) {
      result.future_rms_uv = projection(out,w,"muscle").map((v,j) =>
        (features.hold[j]+.05*scale.rms_mean[j])*Math.exp(Math.min(3,Math.max(-3,v))));
    }
    if (w["path.weight"]) {
      const flat = projection(out,w,"path").map(x=>x*scale.path_scale);
      const anchors = [[0,0,0]];
      for (let k=0; k<12; k+=3) anchors.push(flat.slice(k,k+3));
      result.future_path_mm = Array.from({length:32},(_,i) => {
        const k = Math.floor(i/8), frac = (i%8+1)/8;
        return features.velocity.map((v,j) =>
          v*(i+1)+anchors[k][j]+frac*(anchors[k+1][j]-anchors[k][j]));
      });
    }
    return result;
  }

  function predict(weights, input, mode="joint") {
    if (weights.schema_version !== 1) throw new RangeError("Unsupported weight format");
    const features = encode(input,weights.scale);
    if (mode === "joint") return estimate(features,weights.scale,weights.models.joint);
    if (mode === "specialists") return Object.assign({},
      estimate(features,weights.scale,weights.models.muscle),
      estimate(features,weights.scale,weights.models.path));
    throw new TypeError("Choose joint or specialists");
  }
  const api = Object.freeze({predict});
  root.MuscleMotion = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
