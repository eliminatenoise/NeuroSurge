/* Standalone inference on four chronological bins of recorded or invented gait history. */
(function (root) {
  "use strict";
  function finiteRow(value, length, name) {
    if (!Array.isArray(value) || value.length !== length || !value.every(Number.isFinite)) {
      throw new TypeError("Expected " + length + " finite " + name + " values");
    }
  }
  function tokens(input, markerOnly) {
    const m = input.lab_marker_mm;
    if (!Array.isArray(m) || m.length !== 24) throw new RangeError("Expected 24 marker frames");
    for (const frame of m) {
      if (!Array.isArray(frame) || frame.length !== 2) throw new RangeError("Expected two markers");
      for (const point of frame) finiteRow(point, 3, "XYZ");
    }
    const emg = markerOnly ? Array.from({length:4}, () => Array(8).fill(0)) : input.emg_rms_uV;
    if (!Array.isArray(emg) || emg.length !== 4) throw new RangeError("Expected four RMS bins");
    function diff(a, b) { return a.map((v, j) => v - b[j]); }
    return emg.map((e, i) => {
      finiteRow(e, 8, "RMS");
      if (e.some(v => v < 0)) throw new RangeError("RMS must be nonnegative");
      const first = m[i*6], end = m[i*6+5];
      return [...diff(end[0],m[0][0]), ...diff(end[1],end[0]), ...diff(end[0],first[0]),
              ...diff(end[1],first[1]), end[0][2], input.offset_frames, ...e.map(Math.log1p)];
    });
  }
  function dot(a, b) {
    let value = 0;
    for (let j = 0; j < a.length; j++) value += a[j] * b[j];
    return value;
  }
  function plus(a, b) { return a.map((v, i) => v + b[i]); }
  function predict(model, input) {
    if (!model || model.schema !== "gait-pair-temporal-v1") throw new TypeError("Unknown weights");
    if (!Number.isInteger(input.offset_frames) || !model.supported_offsets.includes(input.offset_frames)) {
      throw new RangeError("Strike-relative offset outside the fitted support");
    }
    const s = model.state, n = model.norm;
    function linear(name, x) {
      return s[name+".weight"].map((w,i) => dot(w,x) + s[name+".bias"][i]);
    }
    function layerNorm(name, x) {
      const mean = x.reduce((a,b) => a+b,0)/x.length;
      const sd = Math.sqrt(x.reduce((a,b) => a+(b-mean)**2,0)/x.length + 1e-5);
      return x.map((v,i) => (v-mean)/sd * s[name+".weight"][i] + s[name+".bias"][i]);
    }
    const isMarker = model.kind === "marker";
    const h = tokens(input,isMarker).map((a,t) => {
      const x = a.map((v,i) => isMarker && i>=14 ? 0 : (v-n.xm[i])/n.xs[i]);
      return plus(linear("embed",x),s.position[t]);
    });
    const qkv = h.map(z => linear("qkv",z));
    // Only the last query is read out. All keys and values come from the stored past.
    const mixed = [];
    for (let head=0; head<2; head++) {
      const start = head*8;
      const q = qkv[3].slice(start,start+8);
      const logits = qkv.map(v => dot(q,v.slice(16+start,24+start))/Math.sqrt(8));
      const mx = Math.max(...logits), exps = logits.map(v => Math.exp(v-mx));
      const total = exps.reduce((a,b)=>a+b,0);
      for (let j=0; j<8; j++) {
        mixed.push(qkv.reduce((a,v,i) => a + v[32+start+j]*exps[i]/total,0));
      }
    }
    const z1 = layerNorm("norm1",plus(h[3],linear("attn_out",mixed)));
    const ff = linear("project",linear("hidden",z1).map(Math.tanh));
    const z = layerNorm("norm2",plus(z1,ff));
    const out = {};
    if (model.kind !== "force") out.heel_delta_mm = linear("heel",z).map((v,i) => v*n.ys[i]+n.ym[i]);
    if (model.kind !== "heel") out.plate_up_N = linear("force",z)[0]*n.ys[3]+n.ym[3];
    return out;
  }
  root.GaitPair = Object.freeze({predict});
  if (typeof module !== "undefined" && module.exports) module.exports = root.GaitPair;
})(globalThis);
