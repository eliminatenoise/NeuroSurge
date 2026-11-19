/** NeuroSurge loading picture: the ORDER in which the parts appear (owner, 18 November 2026: "for the loading
 * animation, if possible, we want to go inside out always. So whatever's the deepest structure, such as the bones and
 * then the deepest muscles, and then include that for the brain's anatomy as well, where you load the inside of the
 * brain as well to show the innermost structures").
 *
 * Two tracks build side by side, each from the inside out, and neither waits for the other:
 *   body:  the bones from the core outward (spine and skull; ribcage, pelvis, face and eyes; the shoulder girdle; upper
 *          arm and thigh; forearm and leg; wrist and ankle; hand and foot), then the muscles layer by layer, deep,
 *          intermediate, outer (the game's own layer of each muscle: ns-body bodyMuscleLayer, passed in by the caller).
 *          Inside a tier the parts follow one another outward (up the spine into the skull; from the trunk out to the
 *          fingers and toes), so each layer is seen spreading over the last.
 *   brain: the brain stem, the cerebellum, the ventricles, the deep nuclei, the white matter, the cortex hidden in the
 *          depths (insula, cingulate, parahippocampal and fusiform gyri), the outer cortex, the motor strip (precentral
 *          gyrus), and last the arteries that lie on the surface. Inside a tier: from the brain's middle outward.
 *
 * The files arrive in whatever order the game fetches them (by packet: the arm and the brain, then the body, then the
 * missing muscles, the head and the face). The picture HOLDS an arrived part back until its tier comes up and releases
 * the tiers in order (createAssemblyRelease): a tier opens when the one before it is complete and has been seen for a
 * moment. While files are still coming, a tier waits for its own missing files (the game fetches by packet, so a tier's
 * files are spread over the whole fetch, and waiting is the only way to keep the order); it gives up on a missing file
 * only when no file at all has come for `stallS` (a stalled or failed fetch) or when the game is ready, and the late
 * file then comes in as soon as it arrives. The game never waits for the picture: it gets its bytes as before, and the
 * picture only decides when to draw what it was given. Since the game spends most of its loading time building after
 * the last file has come, holding parts back costs the picture nothing at the end.
 *
 * Pure: no DOM, no three.js, no clock of its own (the caller passes the time). A display order from general anatomy
 * (which structure lies on which), not a measurement.
 */

/** The tiers of each track, deepest first. */
export const ASSEMBLY_TIERS = Object.freeze({
  body: Object.freeze(['spine and skull', 'ribcage, pelvis, face and eyes', 'shoulder girdle', 'upper arm and thigh', 'forearm and leg',
    'wrist and ankle', 'hand and foot', 'deep muscles', 'intermediate muscles', 'outer muscles']),
  brain: Object.freeze(['brain stem', 'cerebellum', 'ventricles', 'deep nuclei', 'white matter', 'inner cortex', 'outer cortex', 'motor strip', 'arteries'])
});
const T = { body: Object.fromEntries(ASSEMBLY_TIERS.body.map((n, i) => [n, i])), brain: Object.fromEntries(ASSEMBLY_TIERS.brain.map((n, i) => [n, i])) };

/** Timing (seconds). holdS: the least time a tier is shown before the next one starts (from its first part); waveS: the
 * time over which a tier's parts start one after another, outward; stallS: how long no file at all may come before a
 * tier stops waiting for a missing file while later parts wait (longer than the pause of about 3 s on a slow computer
 * while the game builds the arm and brain before it asks for the body's files); hurry: the factor on hold and wave once
 * the game is ready, so the rest lands while the picture fades; lagS: the mirror body's delay behind your own body (one
 * heartbeat of the picture's brain, BRAIN_BEAT.beatS). With every file in: the body about 5.5 s, the brain about 5 s. */
export const ASSEMBLY_ORDER = Object.freeze({
  body: Object.freeze({ holdS: Object.freeze([0.8, 0.6, 0.35, 0.35, 0.35, 0.35, 0.45, 0.9, 0.7, 0.9]), waveS: Object.freeze([0.7, 0.5, 0.25, 0.25, 0.25, 0.25, 0.35, 0.8, 0.6, 0.8]) }),
  brain: Object.freeze({ holdS: Object.freeze([0.55, 0.5, 0.6, 0.65, 0.55, 0.5, 0.65, 0.5, 0.55]), waveS: Object.freeze([0.3, 0.2, 0.35, 0.4, 0.3, 0.3, 0.45, 0.2, 0.45]) }),
  stallS: 5, hurry: 0.12, lagS: 0.92,
  // Pace (createAssemblyRelease expect()): when the picture knows about when the game will be ready (the last load's
  // time on this computer), each tier's hold and wave are stretched by up to maxStretch so the track ends about
  // `endsBeforeS` before then: the body allows for the mirror body's beat and the last flight, the brain for the strip's
  // areas lighting.
  maxStretch: 4, endsBeforeS: Object.freeze({ body: 2, brain: 4.5 }),
  // 19 November 2026: the game now loads in a few seconds (mesh packs), less than the default pace needs. So the pace
  // may also be quickened, down to minStretch, and a short load leaves at most endShare of itself after the last layer.
  minStretch: 0.2, endShare: 0.12
});

// Landmarks of the atlas body (BodyParts3D millimetres: +x the body's left, +y its back, +z up), from the manifests'
// bounds: the shoulder and hip joints, the spine's line, the middle of the brain.
const SHOULDER = [175, -76, 1320], HIP = [85, -80, 830], SPINE_Y = -45, BRAIN_MID = [0, -80, 1547];
const clamp01 = v => (v < 0 ? 0 : v > 0.999 ? 0.999 : v);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const mirrorX = (p, x) => [Math.sign(x || 1) * p[0], p[1], p[2]];

/** How far out from the body's core a point lies, in millimetres along the body: from the spine's line for the trunk,
 * neck and head; for a limb, its root's distance plus the distance from the shoulder or hip joint. groups: the
 * manifest's groups (they name the limb); without a limb group a point far to the side or below the pelvis counts as
 * limb. Pure. */
export function assemblyOutwardMm(centre, groups = []) {
  const g = groups.join(' ');
  const arm = /arm|upper_limb/.test(g) || (!/leg|torso|pelvis|neck|head|face/.test(g) && Math.abs(centre[0]) > 210 && centre[2] > 500);
  const leg = !arm && (/leg/.test(g) || (!/torso|pelvis|neck|head|face/.test(g) && centre[2] < 700));
  if (arm) return 200 + dist(centre, mirrorX(SHOULDER, centre[0]));
  if (leg) return 150 + dist(centre, mirrorX(HIP, centre[0]));
  return Math.hypot(centre[0], centre[1] - SPINE_Y);
}

const BONE_RULES = [
  [/vertebra|\batlas\b|\baxis\b|sacrum|coccyx|frontal bone|parietal bone|occipital bone|temporal bone|sphenoid|ethmoid/, 'spine and skull'],
  [/\brib\b|costal|sternum|manubrium|xiphoid|hip bone|ilium|ischium|pubis|maxilla|mandible|zygomatic|nasal bone|lacrimal|palatine|vomer|hyoid/, 'ribcage, pelvis, face and eyes'],
  [/clavicle|scapula/, 'shoulder girdle'],
  [/humerus|femur/, 'upper arm and thigh'],
  [/radius|ulna|tibia|fibula|patella/, 'forearm and leg'],
  [/scaphoid|lunate|triquetr|pisiform|trapezi|capitate|hamate|talus|calcaneus|navicular|cuboid|cuneiform/, 'wrist and ankle'],
  [/metacarpal|metatarsal|phalan/, 'hand and foot']
];
const BRAIN_RULES = [
  [/medulla|\bpons\b|midbrain|colliculus/, 'brain stem'],
  [/cerebell/, 'cerebellum'],
  [/ventricle|aqueduct/, 'ventricles'],
  [/parahippocampal/, 'inner cortex'],
  [/thalam|habenula|pineal|tuber cinereum|caudate|putamen|pallid|amygdala|hippocamp|fornix|mammillary|nucleus/, 'deep nuclei'],
  [/white matter|internal capsule|corpus callosum|commissure/, 'white matter'],
  [/insula|cingulate|parahippocampal|fusiform/, 'inner cortex'],
  [/precentral/, 'motor strip']
];
const ruleTier = (rules, name) => { for (const [re, tier] of rules) if (re.test(name)) return tier; return null; };

/**
 * The place of one part in the order: { track: 'body' | 'brain', tier (index into ASSEMBLY_TIERS[track]), frac (0..1:
 * its place inside the tier, inner first) }, or null for a kind this picture does not draw.
 * part: { kind ('bone' | 'eye' | 'muscle' | 'brain' | 'strip' | 'vessel'), name (the atlas name; '' when unknown),
 * groups (manifest groups), centre ([x, y, z] mm), layer (for a muscle: 'deep' | 'intermediate' | 'outer' |
 * 'unclassified', the game's own bodyMuscleLayer) }. Pure.
 */
export function assemblyDepth({ kind, name = '', groups = [], centre = [0, 0, 0], layer = 'unclassified' } = {}) {
  const n = String(name || '').toLowerCase(), c = Array.isArray(centre) && centre.length === 3 && centre.every(Number.isFinite) ? centre : [0, 0, 0];
  const gs = Array.isArray(groups) ? groups.map(String) : [];
  if (kind === 'brain' || kind === 'strip' || kind === 'vessel') {
    const tier = kind === 'vessel' ? 'arteries' : kind === 'strip' ? 'motor strip' : (ruleTier(BRAIN_RULES, n) || 'outer cortex');
    return { track: 'brain', tier: T.brain[tier], frac: clamp01(dist(c, BRAIN_MID) / 95) };
  }
  if (kind === 'muscle') {
    // A muscle without a layer counts as intermediate (none of the game's muscles is without one today).
    const tier = layer === 'deep' ? 'deep muscles' : layer === 'outer' ? 'outer muscles' : 'intermediate muscles';
    return { track: 'body', tier: T.body[tier], frac: clamp01(assemblyOutwardMm(c, gs) / 1100) };
  }
  if (kind === 'bone' || kind === 'eye') {
    let tier = kind === 'eye' ? 'ribcage, pelvis, face and eyes' : ruleTier(BONE_RULES, n);
    const out = assemblyOutwardMm(c, gs);
    if (!tier) tier = out < 160 ? 'ribcage, pelvis, face and eyes' : out < 330 ? 'upper arm and thigh' : out < 640 ? 'forearm and leg' : 'hand and foot';
    // Up the spine into the skull; from the spine outward round the trunk; outward along the limbs.
    const frac = tier === 'spine and skull' ? (c[2] - 780) / (1650 - 780) : tier === 'ribcage, pelvis, face and eyes' ? out / 230
      : tier === 'shoulder girdle' ? Math.abs(c[0]) / 170 : (out - 250) / 850;
    return { track: 'body', tier: T.body[tier], frac: clamp01(frac) };
  }
  return null;
}

/** Number of parts per tier, per track, for a list of parts given as assemblyDepth inputs (pure): the table the release
 * rule waits on. */
export function assemblyTierCounts(parts) {
  const out = { body: ASSEMBLY_TIERS.body.map(() => 0), brain: ASSEMBLY_TIERS.brain.map(() => 0) };
  for (const p of parts) { const d = assemblyDepth(p); if (d) out[d.track][d.tier]++; }
  return out;
}

/** The number of files of each tier the game loads today (the five body and brain manifests and the cerebral arteries'
 * manifest; tests/assembly.test.mjs checks it against them). The late manifests (the missing muscles, the head and the
 * face) are fetched by the game only after the body, so the picture cannot count them when it starts; this table lets
 * a tier wait for files whose manifest has not come yet. If it is out of date, nothing breaks: a tier that waits for a
 * file that never comes gives up once no file has come for stallS (or when the game is ready), and an extra file is
 * drawn when it comes. */
export const ASSEMBLY_TIER_COUNTS = Object.freeze({
  body: Object.freeze([32, 59, 4, 4, 10, 28, 78, 156, 42, 139]),
  brain: Object.freeze([10, 2, 5, 8, 4, 8, 20, 2, 80])
});

/**
 * The release rule: arrived parts are held and released tier by tier on each track (see the module comment).
 * counts: expected parts per tier ({ body: [...], brain: [...] }); order: timing (ASSEMBLY_ORDER).
 * Returns { arrive(part), due(nowS, out), hurry(), alive(), expect(tS), know(counts), state() }:
 *   arrive(part): part = { track, tier, frac, ... } (anything else is carried along); a part with a tier outside the
 *     table goes to the last tier.
 *   due(nowS, out = []): pushes onto `out` the parts to start now, in order, and returns it.
 *   hurry(): the game is ready; the rest of the order runs at ASSEMBLY_ORDER.hurry of its pace and never waits for a
 *     missing file again.
 *   know(counts): a manifest has come with these parts per tier; once told, a tier stops waiting for files of manifests
 *     that have not come (when later parts wait and it has been seen), so a packet the game asks for last (the head,
 *     the face, the missing muscles) does not hold the whole body back on a slow connection; its parts come in late.
 *   expect(tS): about when the game will be ready (the caller's seconds), or null; the tiers are then paced to fill the
 *     time (ASSEMBLY_ORDER.maxStretch, endsBeforeS), so the picture keeps building through the whole load.
 *   state(): { body: { tier, held, started }, brain: {...}, hurried } for checks.
 * Pure but for the time the caller passes.
 */
export function createAssemblyRelease({ counts = ASSEMBLY_TIER_COUNTS, order = ASSEMBLY_ORDER } = {}) {
  let hurried = false, arrivals = 0, seenArrivals = 0, lastArrivalS = null, expectS = null, news = false;
  const tracks = {};
  for (const name of Object.keys(ASSEMBLY_TIERS)) {
    const n = ASSEMBLY_TIERS[name].length;
    tracks[name] = { name, n, tier: 0, openedS: null, waveS0: null, stretch: 1, known: new Array(n).fill(0), expected: Array.from({ length: n }, (_, i) => Math.max(0, (counts[name] && counts[name][i]) | 0)),
      arrived: new Array(n).fill(0), started: new Array(n).fill(0), held: Array.from({ length: n }, () => []) };
  }
  function arrive(part) {
    const tr = part && tracks[part.track];
    if (!tr) return;
    const tier = Number.isInteger(part.tier) && part.tier >= 0 ? Math.min(tr.n - 1, part.tier) : tr.n - 1;
    const f = Number.isFinite(part.frac) ? part.frac : 0.5;
    const list = tr.held[tier];
    let i = list.length;
    while (i > 0 && list[i - 1].frac > f) i--;
    list.splice(i, 0, { ...part, tier, frac: f });
    tr.arrived[tier]++;
    arrivals++;
  }
  const laterWaiting = tr => { for (let k = tr.tier + 1; k < tr.n; k++) if (tr.held[k].length) return true; return false; };
  function stepTrack(tr, nowS, out) {
    if (tr.openedS === null) tr.openedS = nowS;
    const o = order[tr.name];
    for (let guard = 0; guard <= tr.n; guard++) {
      // Late parts of a tier already passed come in at once.
      for (let k = 0; k < tr.tier; k++) while (tr.held[k].length) { out.push(tr.held[k].shift()); tr.started[k]++; }
      const c = tr.tier, list = tr.held[c];
      if (list.length && tr.waveS0 === null) {
        tr.waveS0 = nowS;
        // The pace of this tier: stretched so the rest of the track ends endsBeforeS before the expected ready time.
        let rest = 0; for (let k = c; k < tr.n; k++) rest += o.holdS[k];
        const lo = Number.isFinite(order.minStretch) ? order.minStretch : 1, endS = expectS === null ? 0 : Math.min(order.endsBeforeS[tr.name], (Number.isFinite(order.endShare) ? order.endShare : 1) * expectS);
        tr.stretch = expectS === null || !(rest > 0) ? 1 : Math.min(order.maxStretch, Math.max(lo, (expectS - endS - nowS) / rest));
      }
      const h = hurried ? order.hurry : tr.stretch;
      const age = tr.waveS0 === null ? 0 : nowS - tr.waveS0;
      while (list.length && list[0].frac * o.waveS[c] * h <= age + 1e-9) { out.push(list.shift()); tr.started[c]++; }
      if (c >= tr.n - 1) { while (list.length) { out.push(list.shift()); tr.started[c]++; } return; }
      const complete = tr.arrived[c] >= tr.expected[c] && list.length === 0;
      // Every file of this tier whose manifest has come is in; the rest belong to packets the game has not asked for
      // yet (know()). Those are not waited for once later parts are waiting: they come in when they arrive.
      const knownIn = tr.knowing && tr.arrived[c] >= tr.known[c] && list.length === 0;
      const emptyTier = tr.expected[c] === 0 && tr.arrived[c] === 0;
      const seen = tr.waveS0 !== null && age >= o.holdS[c] * h;
      const late = laterWaiting(tr);
      const stalled = lastArrivalS !== null && nowS - lastArrivalS >= order.stallS;
      const givenUp = late && (hurried || stalled) && list.length === 0;
      if (emptyTier || (complete && seen) || (knownIn && late && seen) || (givenUp && (seen || tr.waveS0 === null))) {
        tr.tier = c + 1; tr.openedS = nowS; tr.waveS0 = null;
        continue;
      }
      return;
    }
  }
  return {
    arrive,
    due(nowS, out = []) {
      if (arrivals !== seenArrivals || news) { seenArrivals = arrivals; news = false; lastArrivalS = nowS; } // files are still coming
      for (const tr of Object.values(tracks)) stepTrack(tr, nowS, out);
      return out;
    },
    hurry() { hurried = true; },
    /** 20 November 2026: files are still coming even though none has arrived just now (the bytes of a pack: a pack
     * brings all its files at once, and on a slow line the next one can be many seconds away), so a tier does not take
     * the pause for a stalled fetch and stop waiting for its files (seen: the left arm's muscles drawn before the spine). */
    alive() { news = true; },
    /** The parts of a manifest that has come, counted per tier ({ body: [...], brain: [...] }): from the first call on,
     * a tier no longer waits for files of manifests that have not come (packets the game asks for later). */
    know(counts) {
      for (const tr of Object.values(tracks)) {
        const c = counts && counts[tr.name];
        if (!Array.isArray(c)) continue;
        tr.knowing = true;
        for (let k = 0; k < tr.n; k++) tr.known[k] += Math.max(0, c[k] | 0);
      }
    },
    /** About when the game will be ready, in the caller's seconds (null: not known; the default pace). */
    expect(tS) { expectS = Number.isFinite(tS) ? tS : null; },
    state: () => ({ hurried, expectS, ...Object.fromEntries(Object.values(tracks).map(tr => [tr.name, { tier: tr.tier, stretch: Math.round(tr.stretch * 100) / 100, held: tr.held.reduce((a, l) => a + l.length, 0), started: tr.started.slice(), arrived: tr.arrived.slice() }])) })
  };
}
