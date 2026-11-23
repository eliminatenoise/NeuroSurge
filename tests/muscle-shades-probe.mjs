// Helper of tests/browser-muscle-shades.mjs (not a test of its own): the colours drawn on both sides of every visible
// contact between two muscles (DESIGN-DECISIONS section 188). Needs the QA probe of ns-scene-three (shadeProbe).

/** In the page (pass to page.evaluate): analyse globalThis.__nsShadeProbeOut. For every screen boundary between two
 * different muscles of one body (codes from the outline pass's ID picture, a pixel counted only where all its samples
 * agree), the mean colour `reach` CSS px wide, `inset` CSS px inside each side (past the ink line), and their OKLab
 * distance; per pair of muscles the median over its boundary samples, lit and shaded apart (shaded: the shade factor,
 * the pixel's luminance over the muscle's resting colour's, under shadeK, or either side at the shade floor's luminance).
 * la, lb: the light on each side of the contact (the median shade factor on a's side and on b's), for the table of
 * muscles seen side by side (seenModuleText).
 * Also the hue and chroma of all muscle pixels (OKLCH; the light-blue glass lines and the tendon white left out). */
export function analyseShadeProbe(o) {
  const P = globalThis.__nsShadeProbeOut;
  if (!P || P.error) return { error: P ? P.error : 'no probe' };
  const { W, H, rgba, id, meshes } = P, ss = id.ss, D = id.data, IW = id.w;
  const dpr = o.dpr || 1;
  const code = new Int32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = -2;
    for (let sy = 0; sy < ss && c !== -1; sy++) for (let sx = 0; sx < ss; sx++) {
      const i = ((y * ss + sy) * IW + (x * ss + sx)) * 4;
      const s = (D[i] | D[i + 1] | D[i + 2]) === 0 ? 0 : ((D[i + 1] & 63) << 8) | D[i + 2];
      if (c === -2) c = s; else if (c !== s) { c = -1; break; }
    }
    code[y * W + x] = c;
  }
  const info = s => (s > 0 ? meshes[s] : null);
  const isM = s => { const m = info(s); return Boolean(m && m.kind === 'muscle'); };
  const LUT = new Float64Array(256);
  for (let i = 0; i < 256; i++) { const v = i / 255; LUT[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  const okLab = (r, g, b) => {
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  };
  const Y = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const body = w => (w === 'mirror' || w === 'armMirror' ? 'mirror' : 'self');
  const k = Math.max(2, Math.round((o.inset || 3) * dpr)), r = Math.max(1, Math.round((o.reach || 2) * dpr)), gapMax = Math.max(1, Math.round(2 * dpr));
  const pairs = new Map();
  const avg = (x0, y0, dx, dy, from, to) => {
    let R = 0, G = 0, B = 0, n = 0;
    for (let t = from; t <= to; t++) { const i = ((y0 + dy * t) * W + (x0 + dx * t)) * 4; R += LUT[rgba[i]]; G += LUT[rgba[i + 1]]; B += LUT[rgba[i + 2]]; n++; }
    return [R / n, G / n, B / n];
  };
  const runOf = (x0, y0, dx, dy, s, len) => {
    for (let t = 0; t <= len; t++) { const x = x0 + dx * t, y = y0 + dy * t; if (x < 0 || y < 0 || x >= W || y >= H || code[y * W + x] !== s) return false; }
    return true;
  };
  const scan = (dx, dy) => {
    const N = dx ? W : H, M = dx ? H : W;
    for (let j = 0; j < M; j++) for (let i = 0; i + 1 < N; i++) {
      const x = dx ? i : j, y = dx ? j : i, a = code[y * W + x];
      if (!isM(a)) continue;
      let t = 1, b = code[(y + dy) * W + (x + dx)];
      if (b === a) continue;
      while (b === -1 && t <= gapMax) { t++; const xx = x + dx * t, yy = y + dy * t; if (xx >= W || yy >= H) { b = -3; break; } b = code[yy * W + xx]; }
      if (!isM(b) || b === a) continue;
      const A = info(a), Bi = info(b);
      if (body(A.who) !== body(Bi.who) || A.id === Bi.id) continue;
      const xb = x + dx * t, yb = y + dy * t;
      if (!runOf(x, y, -dx, -dy, a, k + r) || !runOf(xb, yb, dx, dy, b, k + r)) continue;
      const ca = avg(x, y, -dx, -dy, k, k + r), cb = avg(xb, yb, dx, dy, k, k + r);
      const la = okLab(...ca), lb = okLab(...cb);
      const kA = A.base ? Y(...ca) / Math.max(1e-6, Y(...A.base)) : 1, kB = Bi.base ? Y(...cb) / Math.max(1e-6, Y(...Bi.base)) : 1, kk = (kA + kB) / 2;
      const shaded = kk < (o.shadeK || 0.17) || Math.min(Y(...ca), Y(...cb)) < (o.floorY || 0.0135);
      const key = A.id < Bi.id ? `${A.id}|${Bi.id}|${body(A.who)}` : `${Bi.id}|${A.id}|${body(A.who)}`;
      let p = pairs.get(key);
      if (!p) pairs.set(key, p = { a: A.id < Bi.id ? A : Bi, b: A.id < Bi.id ? Bi : A, body: body(A.who), s: [] });
      const first = A.id < Bi.id; // (the pair's own order: a is the smaller id)
      p.s.push([Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]), shaded ? 0 : 1, x, H - 1 - y, first ? kA : kB, first ? kB : kA]);
    }
  };
  scan(1, 0); scan(0, 1);
  const med = a => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return Math.round(b[b.length >> 1] * 1000) / 1000; };
  const contacts = [];
  for (const [key, p] of pairs) {
    if (p.s.length < (o.minN || 6) * dpr) continue;
    const lit = p.s.filter(q => q[1] === 1), sh = p.s.filter(q => q[1] === 0), mid = p.s[p.s.length >> 1];
    contacts.push({ key, body: p.body, a: p.a.source || p.a.name, b: p.b.source || p.b.name, ka: p.a.key, kb: p.b.key, ga: p.a.group, gb: p.b.group,
      twin: p.a.key === p.b.key, n: Math.round(p.s.length / dpr), dE: med(p.s.map(q => q[0])),
      nLit: lit.length, dELit: med(lit.map(q => q[0])), nShade: sh.length, dEShade: med(sh.map(q => q[0])), at: [Math.round(mid[2] / dpr), Math.round(mid[3] / dpr)],
      la: med(p.s.map(q => q[4])), lb: med(p.s.map(q => q[5])) });
  }
  contacts.sort((x, y) => x.dE - y.dE);
  let hs = 0, hs2 = 0, hn = 0, cs = 0;
  for (let i = 0; i < W * H; i++) {
    if (!isM(code[i])) continue;
    const lab = okLab(LUT[rgba[i * 4]], LUT[rgba[i * 4 + 1]], LUT[rgba[i * 4 + 2]]), C = Math.hypot(lab[1], lab[2]);
    if (C < 0.03) continue;
    let h = Math.atan2(lab[2], lab[1]) * 180 / Math.PI;
    if (h < -30 || h > 75) continue;
    hs += h; hs2 += h * h; hn++; cs += C;
  }
  const hm = hn ? hs / hn : null;
  return { W, H, contacts, hue: hn ? { mean: Math.round(hm * 10) / 10, sd: Math.round(Math.sqrt(Math.max(0, hs2 / hn - hm * hm)) * 10) / 10, chroma: Math.round(1000 * cs / hn) / 1000 } : null };
}

/** The counts of one view: contacts (not a left / right pair of one muscle), those under `fail` and `weak`, in light and
 * in shade (a contact with at least 6 shaded samples). */
export function shadeCounts(res, { fail = 0.03, weak = 0.06 } = {}) {
  const c = res.contacts.filter(x => !x.twin), sh = c.filter(x => x.nShade >= 6), li = c.filter(x => x.nLit >= 6);
  return { contacts: c.length, fail: c.filter(x => x.dE < fail).length, weak: c.filter(x => x.dE < weak).length,
    litFail: li.filter(x => x.dELit < fail).length, shadeContacts: sh.length, shadeFail: sh.filter(x => x.dEShade < fail).length, shadeWeak: sh.filter(x => x.dEShade < weak).length, hue: res.hue };
}

/** The rows of the table of muscles seen side by side (ns-muscle-seen.mjs) from the analyses of several views:
 * [a, b, longest boundary seen, light samples]. A light sample is [light on a, light on b] in hundredths of the full
 * light (the shade factors of one view's contact, la and lb), kept for up to `most` views per pair, the longest
 * boundaries first (but the view with the most nearly equal light on the two sides always), a view left out when its
 * light is nearly that of one already kept or is no shade at all (over 1.1: a tendon's white). `old`: the rows of the table
 * being replaced; a pair the new pictures do not show keeps its row (the table never forgets a pair seen once). */
export function seenRows(results, old = [], most = 6) {
  const m = new Map();
  for (const [a, b, n, light] of old) m.set(`${a}|${b}`, { a, b, n, light: Array.isArray(light) ? light : [], s: [] });
  for (const r of results) for (const c of r.contacts) {
    if (c.twin || !c.ka || !c.kb) continue;
    const first = c.ka < c.kb, a = first ? c.ka : c.kb, b = first ? c.kb : c.ka, key = `${a}|${b}`;
    let e = m.get(key);
    if (!e) m.set(key, (e = { a, b, n: 0, light: [], s: [] }));
    e.n = Math.max(e.n, c.n);
    // (a factor over 1.1 is not a shade: the boundary lies on a muscle's white tendon end or on something lit)
    if (c.la > 0 && c.lb > 0 && c.la <= 1.1 && c.lb <= 1.1) e.s.push([c.n, first ? c.la : c.lb, first ? c.lb : c.la]);
  }
  const rows = [];
  for (const e of m.values()) {
    const keep = [];
    e.s.sort((x, y) => y[0] - x[0] || x[1] - y[1] || x[2] - y[2]);
    // (22 November 2026: the view where the light on the two sides is most nearly the same is always kept, so a pair
    // that the longer contacts show only under very different light cannot rely on that light alone)
    const even = e.s.filter(q => Math.abs(Math.log(q[1] / q[2])) < 0.25).sort((x, y) => Math.abs(Math.log(x[1] / x[2])) - Math.abs(Math.log(y[1] / y[2])) || y[0] - x[0])[0];
    if (even) keep.push(even);
    for (const q of e.s) {
      if (keep.length >= most) break;
      if (!keep.some(k => Math.abs(Math.log(k[1] / k[2]) - Math.log(q[1] / q[2])) < 0.12 && Math.abs(Math.log(k[1] * k[2]) - Math.log(q[1] * q[2])) < 0.5)) keep.push(q);
    }
    rows.push([e.a, e.b, e.n, keep.length ? keep.map(q => [Math.max(1, Math.round(q[1] * 100)), Math.max(1, Math.round(q[2] * 100))]) : e.light]);
  }
  return rows.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] < y[1] ? -1 : 1));
}
/** The table's text (the rows between the brackets of MUSCLE_SEEN_CONTACTS). */
export function seenModuleText(results, old = [], most = 6) {
  return seenRows(results, old, most).map(([a, b, n, light]) => `  [${JSON.stringify(a)}, ${JSON.stringify(b)}, ${n}, ${JSON.stringify(light)}]`).join(',\n');
}
