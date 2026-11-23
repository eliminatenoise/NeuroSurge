/** The electrical map's live scan and storms (22 November 2026, DESIGN-DECISIONS section 192, part 3; the owner: "I
 * mean like a live brain scan map where you have electrical wire, electrical storm activity going everywhere"): the
 * pure parts, with the model built from the repository's files and the nerve data. The owner's rule that no point
 * brightens and darkens faster than about three times a second is checked on the curves of light themselves. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BODY_MOTOR_MAP } from '../scene/src/ns-bodymap.mjs';
import { buildEmap, brainBoxesFromManifest, syntheticAreaAnchors, brainBoxesFromPositions, createEmapState, createEmapFrame, emapStep, EMAP_FLAG } from '../scene/src/ns-emap.mjs';
import * as NsWiring from '../scene/src/ns-wiring-data.mjs';
import { EMAP_STORM, SCAN_STOPS, scanRamp, scanAmount, scanTone, scanRampGlsl, stormEnvelope, baseSourceAt, createStorms, stormAt, stepStorms, stormActs, scanHeatAt, fibreLightAt, trafficAt, trafficOf, peaksPerSecond } from '../scene/src/ns-emap-storm.mjs';
import { emapScanShaders, emapShaders } from '../scene/src/ns-emap-three.mjs';
import { EMAP as WORDS } from '../scene/src/ns-text.mjs';

const rig = JSON.parse(fs.readFileSync(new URL('../packs/BODY-RIG.json', import.meta.url), 'utf8')).rig;
const manifest = JSON.parse(fs.readFileSync(new URL('../inputs/MESH-MANIFEST.json', import.meta.url), 'utf8'));
const boxes = brainBoxesFromManifest(manifest.assets);
const areas = syntheticAreaAnchors(BODY_MOTOR_MAP, boxes);
const muscles = [];
for (const m of rig.muscles) { const s = rig.meshSegment[m.id]; if (s && s.restCentroid) muscles.push({ id: m.id, name: m.name, side: m.side, rig: 'body', seg: s.segment, centre: s.restCentroid }); }
const model = buildEmap({ bodyMap: BODY_MOTOR_MAP, rig, boxes, areas, muscles, wiring: NsWiring });
const RATE = 120;

test('the network: every link of the nerve data is a bundle of fibres between two regions, neighbouring surface regions are joined, and every fibre says its two regions', () => {
  assert.deepEqual(model.warnings, []);
  const R = model.scanRegions, L = model.scanLinks;
  assert.ok(R.length >= 30, `${R.length} regions`);
  assert.ok(L.filter(l => l.kind === 'link').length >= 40, 'the links of the data');
  assert.ok(L.filter(l => l.kind === 'local').length >= 40, 'neighbouring surface regions');
  for (const l of L) { assert.ok(R[l.a] && R[l.b] && l.a !== l.b); assert.ok(l.lenMm > 3 && l.lenMm < 400, `${R[l.a].name} - ${R[l.b].name}: ${l.lenMm}`); }
  for (const r of R) assert.ok(!/ventricle|aqueduct|white matter/i.test(r.name), `${r.name} is not a region of activity`);
  // each fibre's vertices carry its regions, how far along it they lie (rising from 0 to its length) and its length
  const V = model.vertices;
  let fibres = 0;
  for (const id of model.netWires) {
    let last = -1, ok = true, len = 0, n = 0;
    for (let v = 0; v < model.vertexCount; v += 2) {
      if (V.sig[4 * v] !== id) continue;
      assert.ok(V.sig[4 * v + 3] & EMAP_FLAG.net);
      if (!(V.net[4 * v] >= 0 && V.net[4 * v + 1] >= 0)) ok = false;
      if (V.net[4 * v + 2] < last - 1e-6) ok = false;
      last = V.net[4 * v + 2]; len = V.net[4 * v + 3]; n++;
    }
    assert.ok(ok && n >= 2 && Math.abs(last - len) < 1e-3, `fibre ${id}`);
    fibres++;
  }
  assert.ok(fibres >= 250, `${fibres} fibres (three a link since 22 November)`);
  // every area's block is a region (a storm starts there when the area switches on)
  for (const a of model.areas) assert.ok(a.region >= 0 && /precentral/i.test(R[a.region].name), a.id);
  // the other wires say no region, and how far along they lie for the traffic
  const trunk = model.wires.find(w => w.kind === 'trunk');
  for (let v = 0; v < model.vertexCount; v += 2) if (V.sig[4 * v] === trunk.id) { assert.equal(V.net[4 * v], -1); assert.ok(Math.abs(V.net[4 * v + 3] - trunk.lenMm) < 1e-3); }
});

test('the brain boxes from the page\'s own vertices carry surface points for the storms and the fibres', () => {
  const pos = new Float32Array(300); for (let i = 0; i < 300; i++) pos[i] = i;
  const [b] = brainBoxesFromPositions(new Map([['X', { name: 'Left angular gyrus', positions: pos }]]));
  assert.equal(b.pts.length, 3 * 24);
  for (let j = 0; j < 24; j++) assert.equal(b.pts[3 * j] % 3, 0, 'each point is a vertex');
});

test('the scan\'s colour scale: deep violet at rest, through blue, cyan, green, yellow and orange, near white only at the hottest cores; never a white-out', () => {
  const c0 = scanRamp(0), c1 = scanRamp(1), mid = scanRamp(0.5);
  assert.ok(c0[2] > c0[0] && c0[2] > c0[1], 'violet-blue at rest');
  assert.ok(c1[0] > 0.9 && c1[1] > 0.85, 'near white at the hottest');
  assert.ok(mid[1] > mid[0], 'cyan-green in the middle');
  assert.ok(scanAmount(0) < 0.3 && scanAmount(0.25) < 0.4, 'a faint veil of colour at rest');
  assert.ok(scanAmount(5) <= 0.75, 'never more than 0.74 laid over the picture');
  assert.ok(scanTone(0.5) === 0.5 && scanTone(1) < 0.9 && scanTone(1.3) > 0.99, 'near white only where heats meet');
  for (let h = 0; h <= 1; h += 0.05) { const a = scanRamp(h), b = scanRamp(h + 0.05); assert.ok(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 0.5, 'smooth'); }
  const glsl = scanRampGlsl();
  for (const st of SCAN_STOPS) assert.ok(glsl.includes(String(st[1])) || st[1] === 0, 'the shader has the same stops');
});

test('storms: one starts every one to three seconds, some where the look rests, each fires its links and its regions flare in turn (two hops), several overlap, now and then a volley goes down the cord', () => {
  const S = createStorms({ regions: model.scanRegions, links: model.scanLinks });
  const starts = [];
  let lastStarted = 0, maxOn = 0, atLook = 0;
  const look = 3;
  for (let f = 0; f <= 120 * RATE; f++) {
    const t = f / RATE;
    stepStorms(S, t, { lookRegion: look });
    if (S.started > lastStarted) { starts.push(t); lastStarted = S.started; const q = S.slots.find(x => x.on && x.hop === 0 && Math.abs(x.t0 - t) < 1e-9); if (q && q.region === look) atLook++; }
    maxOn = Math.max(maxOn, S.slots.filter(q => q.on).length);
  }
  assert.ok(starts.length >= 120 / 3 - 2 && starts.length <= 120 / 1 + 2, `${starts.length} storms in two minutes`);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= EMAP_STORM.everyS[0] - 1e-6 && starts[i] - starts[i - 1] <= EMAP_STORM.everyS[1] + 0.02, 'one to three seconds apart');
  assert.ok(atLook >= 0.15 * starts.length && atLook <= 0.6 * starts.length, `${atLook} of ${starts.length} where the look rests`);
  assert.ok(S.hopsStarted >= starts.length, `${S.hopsStarted} regions flared from a front`);
  assert.ok(maxOn >= 4, 'several at once');
  assert.ok(S.cordVolleys >= 0.15 * starts.length && S.cordVolleys <= 0.5 * starts.length, `${S.cordVolleys} volleys down the cord`);
  // between them, small flares of their own (no cascade, no volley), about one a second or more
  assert.ok(S.minorStarted >= 120 / EMAP_STORM.minor.everyS[1] - 5 && S.minorStarted <= 120 / EMAP_STORM.minor.everyS[0] + 5, `${S.minorStarted} small flares`);
});

test('a storm\'s hops: the joined region flares when the front along the fibre arrives, weaker, and the front reaches it along the fibre', () => {
  const S = createStorms({ regions: model.scanRegions, links: model.scanLinks, seed: 7 });
  const link = model.scanLinks.find(l => l.kind === 'link');
  const q = stormAt(S, 1, link.a, model.scanRegions[link.a].centre, 1);
  assert.ok(q && q.send);
  const hops = S.slots.filter(x => x.on && x.hop === 1);
  assert.ok(hops.length >= 1 && hops.length <= EMAP_STORM.hopFan);
  for (const h of hops) {
    const es = model.scanLinks.filter(l => (l.a === link.a && l.b === h.region) || (l.b === link.a && l.a === h.region));
    assert.ok(es.length, 'a hop is a region joined to the storm\'s');
    assert.ok(es.some(e => Math.abs(h.t0 - (1 + EMAP_STORM.riseS * 0.5 + e.lenMm / EMAP_STORM.fibreMmS)) < 1e-6), 'when the front along one of the links between them arrives');
    assert.ok(Math.abs(h.s - EMAP_STORM.hopGain[1]) < 1e-9, 'weaker');
  }
  assert.ok(S.slots.some(x => x.on && x.hop === 2), 'and on once more');
  assert.ok(!S.slots.some(x => x.on && x.hop > EMAP_STORM.hops));
  // the front along a fibre of that link: dark ahead of it, lit behind it, from the storm's end
  stepStorms(S, 1 + 0.3);
  const front = 0.3 * EMAP_STORM.fibreMmS;
  assert.ok(fibreLightAt(S, link.a, link.b, front * 0.5, 200) > 0.3, 'lit behind the front');
  assert.ok(fibreLightAt(S, link.a, link.b, front + 4 * EMAP_STORM.fibreHeadMm, 200) === 0, 'dark ahead of it');
  assert.ok(fibreLightAt(S, link.b, link.a, 200 - front * 0.5, 200) > 0.3, 'the same from the other end');
});

/** Curves of light over `seconds` at a rate of RATE samples a second. */
function curves(S, seconds, points, extra = null) {
  const out = points.map(() => []);
  for (let f = 0; f <= seconds * RATE; f++) {
    const t = f / RATE;
    stepStorms(S, t, { lookRegion: 2 });
    if (extra) extra(t);
    points.forEach((p, i) => out[i].push(scanHeatAt(S, p)));
  }
  return out;
}

test('the owner\'s rule on the scan: no point of the brain brightens and darkens more than about three times a second, through a minute of storms', () => {
  const S = createStorms({ regions: model.scanRegions, links: model.scanLinks, seed: 11 });
  const pts = [];
  for (const r of model.scanRegions) for (let j = 0; j < r.pts.length / 3; j += 3) pts.push([r.pts[3 * j], r.pts[3 * j + 1], r.pts[3 * j + 2]]);
  const C = curves(S, 60, pts.slice(0, 60));
  let worst = 0, hot = 0;
  for (const c of C) { worst = Math.max(worst, peaksPerSecond(c, RATE)); hot = Math.max(hot, ...c); }
  assert.ok(worst <= 3, `the busiest point: ${worst} times in one second`);
  assert.ok(hot > 0.55, `storms reach the hot colours (${hot.toFixed(2)})`);
});

test('the owner\'s rule on the wires: the traffic passes a point at most 1.1 times a second, a front along a fibre brightens a point once and settles, the cord volley passes once', () => {
  for (let id = 0; id < 400; id += 7) for (const cls of ['brain', 'body', 'bundle']) {
    const T = trafficOf(id, cls), c = [];
    assert.ok(T.hz <= 1.1 + 1e-9 && T.hz >= 0.5);
    for (let f = 0; f < 10 * RATE; f++) c.push(trafficAt(40, f / RATE, T));
    assert.ok(peaksPerSecond(c, RATE) <= 2, `wire ${id} (${cls})`);
  }
  const S = createStorms({ regions: model.scanRegions, links: model.scanLinks, seed: 3 });
  const link = model.scanLinks.find(l => l.kind === 'link');
  const c = [];
  for (let f = 0; f <= 30 * RATE; f++) { const t = f / RATE; if (f % (2 * RATE) === 0) stormAt(S, t, link.a, model.scanRegions[link.a].centre, 1); stepStorms(S, t); c.push(fibreLightAt(S, link.a, link.b, 60, 150)); }
  assert.ok(peaksPerSecond(c, RATE) <= 3, 'a point of a fibre under storms every two seconds');
});

test('the resting sources swell, drift and fade slowly (each period five seconds or more), and reduced motion stands everything still: no storms, a steady scan', () => {
  const S = createStorms({ regions: model.scanRegions, links: model.scanLinks });
  for (const b of S.baseSrc) { assert.ok(b.period >= EMAP_STORM.base.periodS[0]); assert.ok(Math.min(b.dx, b.dy, b.dz) >= EMAP_STORM.base.driftS[0]); }
  const p = [0, 0, 0, 0], a = baseSourceAt(S.baseSrc[0], 0, EMAP_STORM, [0, 0, 0, 0]);
  baseSourceAt(S.baseSrc[0], 0.05, EMAP_STORM, p);
  assert.ok(Math.hypot(p[0] - a[0], p[1] - a[1], p[2] - a[2]) < 1, 'a source moves less than a millimetre in a frame or three');
  assert.ok(stormEnvelope(0, 1.5) === 0 && stormEnvelope(EMAP_STORM.riseS, 1.5) > 0.99 && stormEnvelope(EMAP_STORM.riseS + 1.5, 1.5) === 0);
  const R = createStorms({ regions: model.scanRegions, links: model.scanLinks });
  const pts = [model.scanRegions[0].centre, model.scanRegions[5].centre];
  const out = pts.map(() => []);
  for (let f = 0; f < 10 * RATE; f++) { stepStorms(R, f / RATE, { reduced: true }); pts.forEach((q, i) => out[i].push(scanHeatAt(R, q))); }
  assert.equal(R.started, 0, 'no storms');
  for (const c of out) assert.ok(Math.max(...c) - Math.min(...c) < 1e-9, 'a steady scan');
});

test('tied to the muscles: a lit area is the hottest spot of the scan, its linked regions warm, the feeling strip behind it warms when the report is back', () => {
  // (any area, the ones next to the midline too: a toes area's own heat is not taken by the midline fade)
  for (const area of model.areas.filter(a => a.down && a.linkEnds.length && (/toes|knee|hand/.test(a.id)))) {
  const st = createEmapState(model), fr = createEmapFrame(model);
  const S = createStorms({ regions: model.scanRegions, links: model.scanLinks });
  const L = fr.links[0];
  for (let f = 0; f <= 2 * RATE; f++) {
    const t = f / RATE;
    fr.now = t; fr.nLinks = 1; L.area = area.index; L.action = null; L.level = 1; L.pulse = true; L.hint = false; L.sig = 1; L.n = 0; L.restart = f === 0;
    emapStep(model, st, fr);
    stepStorms(S, t, { reduced: true });
    stormActs(S, model, st, t);
  }
  const hArea = scanHeatAt(S, area.centre), end = area.linkEnds.find(e => Math.abs(e[0]) > 30) || area.linkEnds[0], hLink = scanHeatAt(S, end), hFar = scanHeatAt(S, [area.centre[0] * -1, area.centre[1] + 60, area.centre[2] - 40]);
  assert.ok(hArea > 0.9, `${area.id}: the area is the hottest (${hArea.toFixed(2)}, x ${area.centre[0].toFixed(1)} mm)`);
  assert.ok(hLink > hFar + 0.2, `${area.id}: its linked region warms (${hLink.toFixed(2)} against ${hFar.toFixed(2)})`);
  assert.ok(S.nAct >= 2 && S.nAct <= EMAP_STORM.act.n);
  }
});

test('the shaders: the scan\'s and the lines\' texts carry the same arrays and constants, no power of anything, and the legend says it is made up', () => {
  const sc = emapScanShaders(), ln = emapShaders();
  for (const t of [sc.vertexShader, sc.fragmentShader, ln.vertexShader, ln.fragmentShader]) assert.doesNotMatch(t, /\bpow\s*\(/);
  assert.match(sc.vertexShader, new RegExp(`uBase\\[ ${EMAP_STORM.base.n} \\]`));
  assert.match(sc.vertexShader, new RegExp(`uSt0\\[ ${EMAP_STORM.slots} \\]`));
  assert.match(ln.fragmentShader, new RegExp(`uSt2\\[ ${EMAP_STORM.slots} \\]`));
  assert.match(ln.vertexShader, /attribute vec4 aNet/);
  assert.match(WORDS.honest, /[Mm]ade.up/);
  assert.match(WORDS.honest, /Not a recording/);
});

test('the midline: the scan\'s heat fades to the floor toward it (no bar in the gap between the halves), and a storm never starts on a point of it while its region has another', () => {
  const S = createStorms({ regions: model.scanRegions, links: model.scanLinks, seed: 5 });
  const mid = [];
  for (let f = 0; f <= 30 * RATE; f++) {
    stepStorms(S, f / RATE, { lookRegion: 1 });
    for (const y of [-60, -20, 20]) { for (const k of [0, 1, 2, 3]) { const q = S.storm0; if (q[4 * k + 3] > 0) mid.push(scanHeatAt(S, [Math.sign(q[4 * k]) * 4, q[4 * k + 1], q[4 * k + 2]])); } }
  }
  assert.ok(mid.length > 100);
  for (const h of mid) assert.ok(Math.abs(h - EMAP_STORM.floor) < 1e-9, 'within 6 mm of the midline the scan stays at its floor');
  const R = createStorms({ regions: model.scanRegions, links: model.scanLinks, seed: 9 });
  let starts = 0;
  for (let f = 0; f <= 60 * RATE; f++) {
    stepStorms(R, f / RATE, { eye: [0, -300, 60] });
    for (const q of R.slots) if (q.on && Math.abs(q.t0 - f / RATE) < 1e-9) {
      const reg = R.regions[q.region];
      const off = reg && reg.pts && Array.from({ length: reg.pts.length / 3 }, (_, i) => Math.abs(reg.pts[3 * i]) >= EMAP_STORM.medialMm).some(Boolean);
      if (off) { starts++; assert.ok(Math.abs(q.c[0]) >= EMAP_STORM.medialMm, `${reg.name}: a storm on the midline`); }
    }
  }
  assert.ok(starts > 20);
});
