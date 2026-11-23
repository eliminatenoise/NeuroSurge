/* Expected detected spikes in the next 20 ms. No libraries or network calls. */
(function (root) {
  "use strict";
  function predictCount(model, history) {
    if (model.format !== "spindle-count-transformer-1") throw new Error("Unsupported weight format");
    if (!Array.isArray(history) || history.length !== 5 || Array.from(history).some(row => row === undefined)) throw new Error("Supply five completed 20 ms bins, oldest first");
    const { mean, sd } = model.normalizer;
    const tokens = history.map(row => {
      if (!Array.isArray(row) || row.length !== 5 || !Array.from(row).every(Number.isFinite))
        throw new Error("Each bin needs five finite input numbers");
      if (!Number.isSafeInteger(row[4]) || row[4] < 0) throw new Error("Spike counts must be nonnegative safe integers");
      return row.map((x,i) => model.active.includes(i) ? Math.max(-10,Math.min(10,(x-mean[i])/sd[i])) : 0);
    });
    const w = model.weights;
    const sum = values => values.reduce((total,v) => total + v, 0);
    const add = (a,b) => a.map((v,i) => v+b[i]);
    const dot = (a,b) => sum(a.map((v,i) => v*b[i]));
    const affine = (name,x) => w[name+".weight"].map((row,i) => dot(x,row)+w[name+".bias"][i]);
    function norm(name,x) {
      const avg = sum(x)/x.length;
      const inv = 1/Math.sqrt(sum(x.map(a => (a-avg)**2))/x.length + 1e-5);
      return x.map((a,i) => (a-avg)*inv*w[name+".weight"][i]+w[name+".bias"][i]);
    }
    const h = tokens.map((row,t) => add(affine("embed",row), w.position[t]));
    const qkv = h.map(row => affine("qkv",norm("attn_norm",row)));
    const width = model.width, depth = width/model.heads;
    const out = h.map((item,t) => {
      const attended = [];
      for (let head=0; head<model.heads; head++) {
        const offset = head*depth, q = qkv[t].slice(offset,offset+depth);
        let scores = qkv.map(row => dot(q,row.slice(width+offset,width+offset+depth))/Math.sqrt(depth));
        const top = Math.max(...scores);
        scores = scores.map(v => Math.exp(v-top));
        const total = sum(scores);
        for (let j=0;j<depth;j++) attended.push(sum(qkv.map((row,i) => scores[i]*row[2*width+offset+j]))/total);
      }
      const u = add(item,affine("proj",attended));
      const hidden = affine("expand",norm("ff_norm",u)).map(v => Math.max(0,v));
      return add(u,affine("reduce",hidden));
    });
    const z = affine("readout",norm("final_norm",out[4]))[0];
    return Math.max(0,z)+Math.log1p(Math.exp(-Math.abs(z)))+1e-6;
  }
  const api = { predictCount };
  root.SpindleCount = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
