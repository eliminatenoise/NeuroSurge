/* Ruhr target-reach v1. All positions and returned offsets use metres. */
(() => {
  "use strict";
  const horizons = [0.4, 0.6, 0.8];
  const add = (a, b) => a.map((v, i) => v + b[i]);
  const subtract = (a, b) => a.map((v, i) => v - b[i]);
  const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

  function tokens({ xyz, time, hand, target }) {
    if (!["left", "right"].includes(hand) || !Number.isInteger(target) || target < 1 || target > 9) {
      throw new RangeError("Choose an assigned hand and a target from 1 to 9.");
    }
    if (xyz.length !== 5 || !xyz.every(row => row.length === 3 && row.every(Number.isFinite)) ||
        time.length !== 5 || !time.every((t, i) => Number.isFinite(t) && t >= 0 && t <= 0.2 && (i === 0 || t > time[i - 1]))) {
      throw new RangeError("Expected five ordered optical measurements in the first 0.200 seconds.");
    }
    const right = Number(hand === "right");
    const goals = Array(18).fill(0);
    goals[right * 9 + target - 1] = 1;
    return xyz.map((point, i) => [
      ...subtract(point, xyz[0]), ...subtract(point, xyz[Math.max(0, i - 1)]),
      time[i], 1 - right, right, ...goals
    ]);
  }

  function predict(model, history) {
    const input = tokens(history).map(row => row.map((v, i) => {
      if ((model.mode === "pose_only" && i >= 9) || (model.mode === "goal_only" && i < 6)) return 0;
      return (v - model.mean[i]) / model.scale[i];
    }));
    const p = model.parameters;
    const asMetres = flat => horizons.map((_, h) => flat.slice(h * 3, h * 3 + 3).map(v => v * model.target_scale));
    if (model.family === "ridge") {
      const flat = input.flat();
      return asMetres(p.bias.map((bias, i) => flat.reduce((v, x, j) => v + x * p.coefficient[j][i], bias)));
    }
    if (model.family !== "transformer") throw new RangeError("Unknown fitted model family.");
    const dense = (x, key) => p[key + ".weight"].map((w, i) => dot(x, w) + p[key + ".bias"][i]);
    function normalize(x, key) {
      const mean = x.reduce((a, b) => a + b) / x.length;
      const sd = Math.sqrt(x.reduce((a, v) => a + (v - mean) ** 2, 0) / x.length + 1e-5);
      return x.map((v, j) => (v - mean) / sd * p[key + ".weight"][j] + p[key + ".bias"][j]);
    }
    const embedded = input.map((row, i) => add(dense(row, "embed"), p.pos[i]));
    const qkv = embedded.map(row => dense(row, "qkv"));
    function attention(i, head) {
      const at = 8 * head;
      const query = qkv[i].slice(at, at + 8);
      const scores = qkv.map(row => dot(query, row.slice(16 + at, 24 + at)) / Math.sqrt(8));
      const max = Math.max(...scores);
      const weights = scores.map(value => Math.exp(value - max));
      const denominator = weights.reduce((a, b) => a + b);
      return query.map((_, j) => qkv.reduce((sum, row, k) => sum + weights[k] * row[32 + at + j], 0) / denominator);
    }
    // All inputs enter attention. Only the last token enters the output layer.
    const last = embedded.length - 1;
    const attended = [...attention(last, 0), ...attention(last, 1)];
    const residual = normalize(add(embedded[last], dense(attended, "project")), "ln1");
    const hidden = dense(residual, "expand").map(v => Math.max(v, 0));
    const lastToken = normalize(add(residual, dense(hidden, "reduce")), "ln2");
    return asMetres(dense(lastToken, "readout"));
  }

  function baseline(method, history, meanByHandTarget) {
    if (method === "goal_hand_mean") return meanByHandTarget[history.hand + "/" + history.target];
    if (method === "stationary") return horizons.map(() => [0, 0, 0]);
    if (method !== "velocity") throw new RangeError("Unknown baseline.");
    const dt = history.time[4] - history.time[3];
    const velocity = subtract(history.xyz[4], history.xyz[3]).map(v => v / dt);
    return horizons.map(t => velocity.map(v => v * (t - history.time[4])));
  }

  function parseTarget(command) {
    const match = /^(?:target\s+)?([1-9])$/i.exec(command.trim());
    return match ? Number(match[1]) : null;
  }
  globalThis.TargetReach = Object.freeze({ horizons: Object.freeze(horizons), predict, baseline, parseTarget });
})();
