/* Offline walking forecast. All coordinates and both output displacements use millimetres. */
(function (root) {
  "use strict";

  function validateHistory(frames) {
    if (!Array.isArray(frames) || frames.length !== 21 ||
        !Array.from(frames).every(frame => Array.isArray(frame) && frame.length === 2 &&
          Array.from(frame).every(point => Array.isArray(point) && point.length === 3 &&
            Array.from(point).every(Number.isFinite)))) {
      throw new TypeError("Provide 21 consecutive frames, with finite pelvis and right-heel XYZ in each.");
    }
  }

  // Rotate a measured horizontal heading to +forward and translate to the cutoff pelvis.
  // This helper never reads a target, future strike, whole-trial speed or laboratory walk direction.
  function orient(history) {
    validateHistory(history);
    const origin = history[20][0];
    const dx = origin[0] - history[0][0][0], dy = origin[1] - history[0][0][1];
    const length = Math.hypot(dx, dy);
    if (length < 10) throw new RangeError("Pelvis travel must reach 10 mm within the history.");
    const fx = dx / length, fy = dy / length;
    return history.map(frame => frame.map(point => {
      const x = point[0] - origin[0], y = point[1] - origin[1];
      return [fx*x + fy*y, -fy*x + fx*y, point[2] - origin[2]];
    }));
  }

  function dot(a, b) {
    let sum = 0;
    for (let j = 0; j < a.length; j++) sum += a[j] * b[j];
    return sum;
  }

  function add(a, b) { return a.map((v,j) => v + b[j]); }
  function diff(a, b) { return a.map((v,j) => v - b[j]); }

  function predict(bundle, input, fit) {
    if (!bundle || bundle.schema !== "walking-instruction-transformer-v1") throw new TypeError("Unknown model format.");
    const h = input.history_mm;
    validateHistory(h);
    if (h[20][0].some(v => Math.abs(v) > .001) || h[0][0][0] > -10.0+.0001 || Math.abs(h[0][0][1]) > .001) {
      throw new RangeError("Input must use the cutoff pelvis as origin and preceding pelvis travel as forward. Use orient() for laboratory coordinates.");
    }
    if (![10,20,30,40].includes(input.offset)) throw new RangeError("Use a strike-relative frame offset of 10, 20, 30 or 40.");
    const instruction = input.instruction;
    if (![4,5,"as usual","fast but not running",null].includes(instruction)) throw new TypeError("Unknown instruction. Withhold the cue with null.");
    if (fit !== undefined && fit !== "permuted") throw new RangeError("Unknown optional training control.");
    if (fit === "permuted" && instruction === null) throw new RangeError("The permuted-label fit takes a recorded instruction.");
    const kind = fit || (instruction === null ? "withheld" : "cue");
    const code = instruction === null ? 0 : ([4,"as usual"].includes(instruction) ? -1 : 1);
    const s = bundle.models[kind], n = bundle.norm;
    function linear(name, x) {
      return s[name+".weight"].map((w, j) => dot(w,x) + s[name+".bias"][j]);
    }
    function normalize(name, x) {
      const mean = x.reduce((a,b) => a+b,0) / x.length;
      const sd = Math.sqrt(x.reduce((a,b) => a+(b-mean)**2,0) / x.length + 1e-5);
      return x.map((v,j) => (v-mean)/sd * s[name+".weight"][j] + s[name+".bias"][j]);
    }
    const hidden = [];
    for (let t = 0; t < 7; t++) {
      const [first, mid, end] = h.slice(3*t,3*t+3).map(f => f.flat());
      const motion = [...end, ...diff(mid,first), ...diff(end,mid)].map((v,j) => (v-n.xm[j])/n.xs[j]);
      hidden.push(add(linear("embed",[...motion, (input.offset-25)/15, code]), s.position[t]));
    }
    const qkv = hidden.map(t => linear("qkv",t));
    const mixed = [];
    for (let head = 0; head < 3; head++) {
      const start = head*8;
      const q = qkv[6].slice(start, start+8);
      const logits = qkv.map(z => dot(q,z.slice(24+start,32+start)) / Math.sqrt(8));
      const peak = Math.max(...logits);
      const exp = logits.map(l => Math.exp(l-peak));
      const total = exp.reduce((a,b) => a+b,0);
      for (let j = 0; j < 8; j++) {
        mixed.push(qkv.reduce((a,z,i) => a+z[48+start+j]*exp[i]/total,0));
      }
    }
    const z = normalize("norm1", add(hidden[6], linear("attn_out",mixed)));
    const ff = linear("project",linear("hidden",z).map(Math.tanh));
    const residual = linear("readout",normalize("norm2",add(z,ff)));
    const previous = diff(h[20].flat(), h[10].flat());
    const result = residual.map((v,j) => previous[j]+v*n.ys[j]+n.ym[j]);
    if (!result.every(Number.isFinite)) throw new RangeError("Prediction exceeds finite numerical support.");
    return [result.slice(0,3), result.slice(3)];
  }
  root.WalkingForecast = Object.freeze({predict, orient});
  if (typeof module !== "undefined" && module.exports) module.exports = root.WalkingForecast;
})(globalThis);
