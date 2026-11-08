/** NeuroSurge POV arm scene: asset I/O contract and loader orchestration (browser and Node).
 *
 * MESH-MANIFEST.json (Root's pov-demo-assets) is the only allowlist. No network I/O is built in:
 * callers inject readText(path) and sha256Hex(text). Paths handed to readText are the
 * manifest's relative 'meshes/<element_id>.obj' paths; the caller resolves them against
 * the hosted asset base. Geometry stays in the BodyParts3D source frame (millimetres,
 * +x subject LEFT, +y POSTERIOR, +z SUPERIOR; an inferred right-handed LPS frame).
 * Nothing here centres, mirrors, rotates or rescales an individual component.
 * See ASSET-IO-CONTRACT.md for the full contract.
 *
 * Round 3 (R3-perf): parseObjFast, an exact drop-in for ns-obj parseObj (one pass over the text into typed arrays, no
 * regex/split per line; anything outside its fast grammar is handed to parseObj itself, so results AND refusals are
 * identical). loadAssets and loadFullbodyAssets use it by default; utf8ByteLength skips its per-character loop for
 * pure-ASCII text. Every byte, sha256, vertex-count and laterality check is unchanged and still runs in the same order.
 *
 * Round 4 (R4-load): progressive loading. streamFullbodyAssets loads the full body in two parts: a small PRIORITY part
 * first (by default the two lacrimal bones that eyePosition reads, so the first-person eye and therefore the first view
 * are exactly the same as with the whole body), then the BULK, started by the caller once the first frame is up
 * (start()), largest files first, with bounded concurrency and optional time slicing. loadFullbodyAssets is the same
 * stream in one go. An optional byte path (readBytes + sha256HexBytes) checks the served bytes themselves and decodes
 * each file once, so the page no longer re-encodes every text for hashing. Every check (byte count, then sha256, then
 * parse, then vertex count, finiteness and laterality) and the parsed geometry are unchanged
 * (tests/unit/R4-load-progressive.test.mjs proves equality on all 428 meshes the game loads: 134 arm and brain + 294 body).
 * No URL is built here: callers inject the readers, and manifest paths stay relative ('meshes/<id>.obj').
 */
import { parseObj, OBJ_LIMITS, MAX_COMMENTS } from './ns-obj.mjs';
import { sub, dot, length, scale, reject } from './ns-math.mjs';
import { CAP_FRACTION, SHOULDER_CAP_MM, ELBOW_CAP_MM } from './ns-rig.mjs';

const fail = (code, message) => { throw new Error(`ns:${code}: ${message}`); };
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isVec3 = v => Array.isArray(v) && v.length === 3 && v.every(x => Number.isFinite(x));

// ---------------------------------------------------------------------------------------
// R3-perf: fast exact OBJ parsing
// ---------------------------------------------------------------------------------------

/** The statements ns-obj parseObj recognises and ignores (its IGNORED set; tests/unit/R3-perf-obj-fast.test.mjs checks
 * that parseObj accepts every one of them, so the fast path never skips a line parseObj would refuse). */
const OBJ_FAST_IGNORED = new Set([
  'vn', 'vt', 'g', 'o', 's', 'usemtl', 'mtllib',
  'vp', 'l', 'p', 'cstype', 'deg', 'bmat', 'step', 'curv', 'curv2', 'surf', 'parm', 'trim',
  'hole', 'scrv', 'sp', 'end', 'con', 'mg', 'bevel', 'c_interp', 'd_interp', 'lod',
  'shadow_obj', 'trace_obj', 'ctech', 'stech', 'maplib', 'usemap', 'call', 'csh'
]);
export const OBJ_FAST_IGNORED_STATEMENTS = Object.freeze([...OBJ_FAST_IGNORED]);
/** Exact powers of ten (every 10^k with k <= 22 is exactly representable as a double). */
const POW10 = Object.freeze(Array.from({ length: 23 }, (_, k) => Number(`1e${k}`)));
const NON_ASCII_RE = /[^\x00-\x7f]/;
const isPositiveInt = v => Number.isSafeInteger(v) && v > 0;

function growF32(a, need) { const b = new Float32Array(Math.max(need, a.length * 2)); b.set(a); return b; }
function growU32(a, need) { const b = new Uint32Array(Math.max(need, a.length * 2)); b.set(a); return b; }

/**
 * The fast path of parseObjFast. Returns the parsed mesh, or null whenever the text is outside the fast grammar or
 * would be refused, so the caller can hand it to ns-obj parseObj (which then returns the same mesh or throws its own
 * error). The fast grammar is parseObj's grammar restricted to ASCII separators: lines end at LF, CR or CRLF; fields are
 * separated by spaces and tabs only; `#` comment lines; the ignored statements; `v x y z [extra...]` with plain decimal
 * numbers; `f` with `a`, `a/b`, `a//c`, `a/b/c` references (negative = relative). Any other character outside a comment
 * or an ignored line, an inline `#` on a v/f line, a limit overflow or an invalid index returns null.
 * Numbers: a plain decimal with at most 15 digits (leading zeros included) and no exponent is m / 10^k with m and 10^k exact
 * doubles; IEEE division is correctly rounded, so it equals Number(token), the value parseObj stores before the same
 * Float32 rounding. Every other number (an exponent, more digits) uses Number(token) itself.
 * `knownUtf8Bytes`: the caller-verified UTF-8 byte length (loadAssets passes the count it checked against the manifest),
 * used only for the maxBytes limit.
 */
export function tryParseObjFast(text, { maxBytes = OBJ_LIMITS.maxBytes, maxVertices = OBJ_LIMITS.maxVertices, maxFaces = OBJ_LIMITS.maxFaces, knownUtf8Bytes } = {}) {
  if (typeof text !== 'string' || !isPositiveInt(maxBytes) || !isPositiveInt(maxVertices) || !isPositiveInt(maxFaces)) return null;
  const L = text.length;
  if (L > maxBytes) return null;
  // parseObj's maxBytes test (UTF-8 bytes). A text of at most maxBytes/3 UTF-16 units cannot exceed it.
  if (L * 3 > maxBytes) {
    const bytes = Number.isSafeInteger(knownUtf8Bytes) ? knownUtf8Bytes : utf8ByteLength(text);
    if (bytes > maxBytes) return null;
  }
  const hasCR = text.indexOf('\r') >= 0;
  const lineEnd = from => {
    if (!hasCR) { const e = text.indexOf('\n', from); return e < 0 ? L : e; }
    let e = from;
    while (e < L) { const d = text.charCodeAt(e); if (d === 10 || d === 13) break; e++; }
    return e;
  };
  // Initial capacities from the text length (BodyParts3D OBJ99: about 40 characters per stored coordinate and 24 per
  // stored index, vn lines included); the arrays double when a file needs more, and are trimmed to size at the end.
  let pos = new Float32Array(Math.max(96, Math.ceil(L / 40)));
  let idx = new Uint32Array(Math.max(96, Math.ceil(L / 24)));
  let np = 0, ni = 0, vertexCount = 0, faceCount = 0, polygonCount = 0, maxPositive = 0;
  const comments = [];
  let i = 0, c = 0;
  while (i < L) {
    c = text.charCodeAt(i);
    if (c === 32 || c === 9) {
      do { i++; c = i < L ? text.charCodeAt(i) : 10; } while (c === 32 || c === 9);
    }
    if (c === 10 || c === 13) { i++; continue; }
    if (c === 35) { // '#': a comment line (parseObj keeps line.slice(1).trim() of the trimmed line)
      const e = lineEnd(i);
      if (comments.length < MAX_COMMENTS) comments.push(text.slice(i + 1, e).trim());
      i = e;
      continue;
    }
    const d = i + 1 < L ? text.charCodeAt(i + 1) : 10;
    if (c === 118 && (d === 32 || d === 9)) { // 'v ': three coordinates, extra components ignored
      if (vertexCount >= maxVertices) return null;
      i += 2;
      if (np + 3 > pos.length) pos = growF32(pos, np + 3);
      for (let k = 0; k < 3; k++) {
        c = i < L ? text.charCodeAt(i) : 10;
        while (c === 32 || c === 9) { i++; c = i < L ? text.charCodeAt(i) : 10; }
        const start = i;
        let neg = false;
        if (c === 45 || c === 43) { neg = c === 45; i++; c = i < L ? text.charCodeAt(i) : 10; }
        let m = 0, nd = 0, nf = 0;
        while (c >= 48 && c <= 57) { m = m * 10 + (c - 48); nd++; i++; c = i < L ? text.charCodeAt(i) : 10; }
        if (c === 46) {
          i++; c = i < L ? text.charCodeAt(i) : 10;
          while (c >= 48 && c <= 57) { m = m * 10 + (c - 48); nd++; nf++; i++; c = i < L ? text.charCodeAt(i) : 10; }
        }
        if (nd === 0) return null;
        let value;
        if (c === 101 || c === 69) {
          i++; c = i < L ? text.charCodeAt(i) : 10;
          if (c === 43 || c === 45) { i++; c = i < L ? text.charCodeAt(i) : 10; }
          let ne = 0;
          while (c >= 48 && c <= 57) { ne++; i++; c = i < L ? text.charCodeAt(i) : 10; }
          if (ne === 0) return null;
          value = Number(text.slice(start, i));
        } else if (nd <= 15) {
          value = m / POW10[nf];
          if (neg) value = -value;
        } else {
          value = Number(text.slice(start, i));
        }
        if (!(c === 32 || c === 9 || c === 10 || c === 13)) return null;
        if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value))) return null;
        pos[np++] = value;
      }
      // Extra components are ignored, but an inline '#' would be kept as a comment by parseObj: hand that to it.
      while (c !== 10 && c !== 13 && c !== 35) { i++; c = i < L ? text.charCodeAt(i) : 10; }
      if (c === 35) return null;
      vertexCount++;
      continue;
    }
    if (c === 102 && (d === 32 || d === 9)) { // 'f ': fan-triangulated polygon
      i += 2;
      let n = 0, first = 0, prev = 0;
      for (;;) {
        c = i < L ? text.charCodeAt(i) : 10;
        while (c === 32 || c === 9) { i++; c = i < L ? text.charCodeAt(i) : 10; }
        if (c === 10 || c === 13) break;
        let neg = false;
        if (c === 45) { neg = true; i++; c = i < L ? text.charCodeAt(i) : 10; }
        let r = 0, nd = 0;
        while (c >= 48 && c <= 57) { r = r * 10 + (c - 48); nd++; i++; c = i < L ? text.charCodeAt(i) : 10; }
        if (nd === 0 || nd > 15 || r === 0) return null;
        for (let g = 0; g < 2 && c === 47; g++) { // '/' [ ['-'] digits ]
          i++; c = i < L ? text.charCodeAt(i) : 10;
          if (c === 45) { i++; c = i < L ? text.charCodeAt(i) : 10; if (!(c >= 48 && c <= 57)) return null; }
          while (c >= 48 && c <= 57) { i++; c = i < L ? text.charCodeAt(i) : 10; }
        }
        if (!(c === 32 || c === 9 || c === 10 || c === 13)) return null;
        let ref;
        if (!neg) { if (r > maxPositive) maxPositive = r; ref = r - 1; } else { ref = vertexCount - r; if (ref < 0) return null; }
        if (n === 0) first = ref;
        else if (n >= 2) {
          if (faceCount + 1 > maxFaces) return null;
          if (ni + 3 > idx.length) idx = growU32(idx, ni + 3);
          idx[ni++] = first; idx[ni++] = prev; idx[ni++] = ref;
          faceCount++;
        }
        prev = ref;
        n++;
      }
      if (n < 3) return null;
      polygonCount++;
      continue;
    }
    // Any other statement: only parseObj's ignored keywords are skipped here.
    let e = i;
    while (e < L) { const k = text.charCodeAt(e); if (k === 32 || k === 9 || k === 10 || k === 13) break; e++; }
    if (!OBJ_FAST_IGNORED.has(text.slice(i, e))) return null;
    i = lineEnd(e);
  }
  if (maxPositive > vertexCount || vertexCount === 0 || faceCount === 0) return null;
  const positions = pos.slice(0, np);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let j = 0; j < positions.length; j += 3) {
    for (let k = 0; k < 3; k++) {
      const value = positions[j + k];
      if (value < min[k]) min[k] = value;
      if (value > max[k]) max[k] = value;
    }
  }
  return { positions, indices: idx.slice(0, ni), vertexCount, faceCount, polygonCount, bounds: { min, max }, comments };
}

/**
 * Drop-in replacement for ns-obj parseObj(text, limits): the same return shape and values (positions bit-for-bit,
 * indices, counts, bounds, comments) and, for text outside the fast grammar, parseObj's own result or refusal.
 * About 4.7x faster than parseObj on the 436 pinned BodyParts3D files in Node (perf/r3/NODE-PARSE-BENCH.json: about 1030 ms
 * -> 220 ms); in the browser the load's OBJ parsing drops from about 940 ms to about 280 ms (round3/R3-perf-NOTES.md).
 */
export function parseObjFast(text, options = {}) {
  const fast = tryParseObjFast(text, options || {});
  if (fast) return fast;
  const { maxBytes = OBJ_LIMITS.maxBytes, maxVertices = OBJ_LIMITS.maxVertices, maxFaces = OBJ_LIMITS.maxFaces } = options || {};
  return parseObj(text, { maxBytes, maxVertices, maxFaces });
}

/** Frozen null-prototype record map (so ids such as 'constructor' never hit Object.prototype). */
function frozenMap(pairs) {
  const o = Object.create(null);
  for (const [k, v] of pairs) o[k] = (v !== null && typeof v === 'object') ? Object.freeze(v) : v;
  return Object.freeze(o);
}

// ---------------------------------------------------------------------------------------
// View-model arm subset. Names are the manifest embedded_source_name values (tests check).
// ---------------------------------------------------------------------------------------

/** [element id, segment, name] for the 30 view-model bones (27 hand bones + humerus, radius, ulna). U3a: the ulna is its
 * own rig segment ('ulna': elbow flexion only) so that the radius ('forearm') and the hand can pronate and supinate. */
const BONES = [
  ['FJ3262', 'upperarm', 'Left humerus'],
  ['FJ3277', 'forearm', 'Left radius'],
  ['FJ3286', 'ulna', 'Left ulna'],
  ['FJ3257', 'hand', 'Left capitate'],
  ['FJ3261', 'hand', 'Left hamate'],
  ['FJ3268', 'hand', 'Left lunate'],
  ['FJ3276', 'hand', 'Left pisiform'],
  ['FJ3278', 'hand', 'Left scaphoid'],
  ['FJ3283', 'hand', 'Left trapezium'],
  ['FJ3284', 'hand', 'Left trapezoid'],
  ['FJ3285', 'hand', 'Left triquetral'],
  ['FJ3243', 'hand', 'Left second metacarpal bone'],
  ['FJ3246', 'hand', 'Left third metacarpal bone'],
  ['FJ3249', 'hand', 'Left fourth metacarpal bone'],
  ['FJ3252', 'hand', 'Left fifth metacarpal bone'],
  ['FJ3240', 'thumb_mc', 'Left first metacarpal bone'],
  ['FJ3318', 'thumb_pp', 'Proximal phalanx of left thumb'],
  ['FJ3188', 'thumb_dp', 'Distal phalanx of left thumb'],
  ['FJ3313', 'index_pp', 'Proximal phalanx of left index finger'],
  ['FJ3296', 'index_mp', 'Middle phalanx of left index finger'],
  ['FJ3183', 'index_dp', 'Distal phalanx of left index finger'],
  ['FJ3316', 'middle_pp', 'Proximal phalanx of left middle finger'],
  ['FJ3299', 'middle_mp', 'Middle phalanx of left middle finger'],
  ['FJ3186', 'middle_dp', 'Distal phalanx of left middle finger'],
  ['FJ3317', 'ring_pp', 'Proximal phalanx of left ring finger'],
  ['FJ3291', 'ring_mp', 'Middle phalanx of left ring finger'],
  ['FJ3187', 'ring_dp', 'Distal phalanx of left ring finger'],
  ['FJ3314', 'little_pp', 'Proximal phalanx of left little finger'],
  ['FJ3297', 'little_mp', 'Middle phalanx of left little finger'],
  ['FJ3184', 'little_dp', 'Distal phalanx of left little finger']
];

/** [element id, name, movement-map muscle_catalog key or null] for the 45 view-model muscles
 * (44 from pov-demo-assets plus FJ1466M left abductor digiti minimi from pov-demo-assets-r2).
 * null = the mesh has no catalog muscle (deltoid, pronators, supinator, palmaris longus,
 * APL, APB, opponens/flexor digiti minimi, coracobrachialis). */
const MUSCLES = [
  ['FJ1467M', 'Acromial part of left deltoid', null],
  ['FJ1468M', 'Clavicular part of left deltoid', null],
  ['FJ1466M', 'Abductor digiti minimi of left hand', 'ADM'],
  ['FJ1470M', 'Flexor digiti minimi brevis of left hand', null],
  ['FJ1472M', 'Left extensor carpi ulnaris', 'ECU'],
  ['FJ1473M', 'Humeral head of left flexor carpi ulnaris', 'FCU'],
  ['FJ1474M', 'Humeral head of left pronator teres', null],
  ['FJ1475M', 'Left flexor digitorum superficialis', 'FDS'],
  ['FJ1477M', 'Lateral head of left triceps brachii', 'TRI'],
  ['FJ1478M', 'Long head of left biceps brachii', 'BIC'],
  ['FJ1479M', 'Long head of left triceps brachii', 'TRI'],
  ['FJ1480M', 'Medial head of left triceps brachii', 'TRI'],
  ['FJ1481M', 'Oblique head of left adductor pollicis', 'ADP'],
  ['FJ1482M', 'Opponens digiti minimi of left hand', null],
  ['FJ1483M', 'Left abductor pollicis brevis', null],
  ['FJ1484M', 'Left abductor pollicis longus', null],
  ['FJ1485M', 'Left anconeus', 'ANC'],
  ['FJ1486M', 'Left brachialis', 'BRA'],
  ['FJ1487M', 'Left brachioradialis', 'BRD'],
  ['FJ1488M', 'Left coracobrachialis', null],
  ['FJ1489M', 'Left extensor carpi radialis brevis', 'ECRB'],
  ['FJ1490M', 'Left extensor carpi radialis longus', 'ECRL'],
  ['FJ1491M', 'Left extensor digiti minimi', 'EDM'],
  ['FJ1492M', 'Left extensor digitorum', 'ED'],
  ['FJ1493M', 'Left extensor indicis', 'EI'],
  ['FJ1494M', 'Left extensor pollicis brevis', 'EPB'],
  ['FJ1495M', 'Left extensor pollicis longus', 'EPL'],
  ['FJ1496M', 'Left flexor carpi radialis', 'FCR'],
  ['FJ1497M', 'Left flexor digitorum profundus', 'FDP'],
  ['FJ1498M', 'Left flexor pollicis longus', 'FPL'],
  ['FJ1499M', 'Left flexor digitorum superficialis', 'FDS'],
  ['FJ1501M', 'Left opponens pollicis', 'OP'],
  ['FJ1502M', 'Left palmaris longus', null],
  ['FJ1503M', 'Left pronator quadratus', null],
  ['FJ1505M', 'Left supinator', null],
  ['FJ1509M', 'Set of dorsal interossei of left hand', 'DI'],
  ['FJ1510M', 'Set of lumbricals of left hand', 'LUM'],
  ['FJ1511M', 'Set of palmar interossei of left hand', 'PI'],
  ['FJ1512M', 'Short head of left biceps brachii', 'BIC'],
  ['FJ1513M', 'Spinal part of left deltoid', null],
  // Superficial head only; the deep-head candidate FJ1469 is quarantined (coverage gap).
  ['FJ1514M', 'Superficial head of left flexor pollicis brevis', 'FPB'],
  ['FJ1515M', 'Transverse head of left adductor pollicis', 'ADP'],
  ['FJ1516M', 'Ulnar head of left pronator teres', null],
  ['FJ1517M', 'Left extensor carpi ulnaris', 'ECU'],
  ['FJ1518M', 'Ulnar head of left flexor carpi ulnaris', 'FCU']
];

const GIRDLE_REASON = 'shoulder girdle: sits at or behind the eye in the first-person view-model, so it is not shown';

/** [element id, kind, name] for the shoulder-girdle components excluded from the view-model. */
const GIRDLE = [
  ['FJ3279', 'bone', 'Left scapula'],
  ['FJ3237', 'bone', 'Left clavicle'],
  ['FJ1532M', 'muscle', 'Left levator scapulae'],
  ['FJ1506M', 'muscle', 'Left supraspinatus'],
  ['FJ1500M', 'muscle', 'Left infraspinatus muscle'],
  ['FJ1504M', 'muscle', 'Left subscapularis'],
  ['FJ1507M', 'muscle', 'Left teres major'],
  ['FJ1508M', 'muscle', 'Left teres minor']
];

/** element id -> { segment, kind: 'bone' | 'muscle', name } for the view-model arm subset.
 * Muscles have segment null: they are skinned by blending, not attached rigidly. */
export const SEGMENT_OF = frozenMap([
  ...BONES.map(([id, segment, name]) => [id, { segment, kind: 'bone', name }]),
  ...MUSCLES.map(([id, name]) => [id, { segment: null, kind: 'muscle', name }])
]);

/** Ids not shown in the first-person view-model (they sit at or behind the eye). */
export const SHOULDER_GIRDLE_EXCLUDED = Object.freeze(GIRDLE.map(([id]) => id));

/** id -> { kind, name, reason } for each SHOULDER_GIRDLE_EXCLUDED id. */
export const SHOULDER_GIRDLE_INFO = frozenMap(GIRDLE.map(([id, kind, name]) => [id, { kind, name, reason: GIRDLE_REASON }]));

/** Never loaded, even when listed: a manifest naming one is refused. */
export const QUARANTINED = Object.freeze(['FJ1469', 'FJ1469M', 'FJ1406M']);
/** Source packets an accepted manifest entry may name; each maps to a Root-provided base path/URL. */
export const SOURCE_PACKETS = Object.freeze(['pov-demo-assets', 'pov-demo-assets-r2']);

/** Brain role ids; every other brain-group id is glass context. */
export const BRAIN = Object.freeze({
  rightPrecentral: 'FJ1801',
  leftPrecentral: 'FJ1800',
  rightPostcentral: 'FJ1798',
  leftPostcentral: 'FJ1797'
});
const BRAIN_SIDE = frozenMap([
  [BRAIN.rightPrecentral, 'right'], [BRAIN.rightPostcentral, 'right'],
  [BRAIN.leftPrecentral, 'left'], [BRAIN.leftPostcentral, 'left']
]);

/** element id -> movement-map muscle_catalog key, or null when the mesh has no catalog muscle.
 * Covers all 51 arm muscle meshes of the accepted 142 manifest (girdle muscles map to null). */
export const MUSCLE_OF = frozenMap([
  ...MUSCLES.map(([id, , key]) => [id, key]),
  ...GIRDLE.filter(([, kind]) => kind === 'muscle').map(([id]) => [id, null])
]);

/** Catalog muscles whose mesh coverage is absent or partial in the acquired subset. */
export const MUSCLE_COVERAGE_GAPS = Object.freeze([
  Object.freeze({ muscle: 'FPB', status: 'partial', note: 'Only the superficial head FJ1514M is shown; the deep-head candidate FJ1469 is quarantined (its source label conflicts with its coordinates).' })
]);

/** Compartment members used by compartmentDirections (pooled vertex centroids). */
export const COMPARTMENTS = Object.freeze({
  flexors: Object.freeze(['FJ1475M', 'FJ1499M', 'FJ1497M', 'FJ1496M', 'FJ1473M', 'FJ1518M']), // FDS x2, FDP, FCR, FCU humeral + ulnar
  extensors: Object.freeze(['FJ1492M', 'FJ1490M', 'FJ1489M', 'FJ1472M', 'FJ1517M']), // ED, ECRL, ECRB, ECU x2
  anteriorUpper: Object.freeze(['FJ1478M', 'FJ1512M', 'FJ1486M']), // BIC long + short, BRA
  posteriorUpper: Object.freeze(['FJ1477M', 'FJ1479M', 'FJ1480M']) // TRI lateral, long, medial
});

/** Metacarpal 2-5 ids by digit, for deriveRig's `metacarpals` option. */
export const METACARPAL_IDS = Object.freeze({ index: 'FJ3243', middle: 'FJ3246', ring: 'FJ3249', little: 'FJ3252' });
/** Carpal ids deriveRig uses explicitly (`carpals` option): the capitate head carries the wrist flexion pivot. */
export const CARPAL_IDS = Object.freeze({ capitate: 'FJ3257' });

const ATTRIBUTION_TEXT = 'BodyParts3D, \u00a9 The Database Center for Life Science licensed under CC Attribution 4.0 International';

/** Attribution shown in the HUD: SCENE-ASSET-CONTRACT rights.attribution plus the legacy-header note. */
/** Licence and source links (round-2 fix SCI-6: CC BY 4.0 section 3(a)(1)(C) asks for a URI or hyperlink). */
export const LICENCE_LINKS = Object.freeze({
  licence: 'https://creativecommons.org/licenses/by/4.0/',
  licencePage: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html',
  source: 'https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html'
});
/** What this game changes (CC BY 4.0 section 3(a)(1)(B): indicate modifications). */
// R4-fix (review SL4-6): Picture quality Low (and Auto at its cheapest levels) draws vertex-clustered, simplified copies
// of the glass-brain and full-body meshes at run time; say so, like the muscle bending.
export const ATTRIBUTION_CHANGES = 'Changes: a subset of meshes was selected. At run time the bones are moved rigidly, the muscles are bent to follow them, and colours are added. On Picture quality Low, simplified copies of the meshes are drawn. The OBJ files themselves are unmodified.';

export const ATTRIBUTION = `${ATTRIBUTION_TEXT}. Licence: CC BY 4.0 (${LICENCE_LINKS.licence}); DBCLS licence page ${LICENCE_LINKS.licencePage}; source ${LICENCE_LINKS.source}. ${ATTRIBUTION_CHANGES} The OBJ comment headers retain the legacy CC BY-SA 2.1 Japan notice; the current official archive licence is CC BY 4.0. No endorsement by the database authors is implied.`;

export const ATTRIBUTION_DETAIL = Object.freeze({
  attribution: ATTRIBUTION_TEXT,
  licence: 'CC BY 4.0 (official archive licence page updated 2025-02-27)',
  licencePage: LICENCE_LINKS.licencePage,
  licenceUri: LICENCE_LINKS.licence,
  changes: ATTRIBUTION_CHANGES,
  legacyHeader: 'CC BY-SA 2.1 Japan, retained unmodified in every OBJ comment header',
  source: 'Official LSDB BodyParts3D 4.0 ISA OBJ99 archive (99 percent polygon-reduced)'
});

// ---------------------------------------------------------------------------------------
// Manifest validation
// ---------------------------------------------------------------------------------------

const GROUP_BONE = 'left_upper_limb_bone';
const GROUP_MUSCLE = 'left_upper_limb_muscle';
const GROUP_BRAIN = 'brain';
const ID_RE = /^FJ[0-9]{3,5}M?$/;
const HEX64_RE = /^[0-9a-fA-F]{64}$/;
const PATH_RE = /^meshes\/[A-Za-z0-9_-]+\.obj$/;

/** Validate one raw entry and return a frozen snapshot (the snapshot is what gets loaded). */
function snapshotEntry(raw, index) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) fail('asset_entry', `entry ${index} is not an object`);
  const id = raw.element_id;
  if (typeof id !== 'string' || !ID_RE.test(id)) fail('asset_entry', `entry ${index}: element_id must match FJ<digits>[M]`);
  // Quarantine first, so a quarantined id is reported as such whatever else is wrong with it.
  if (QUARANTINED.includes(id)) fail('asset_quarantined', `${id} is quarantined and is never loaded`);
  const path = raw.path;
  if (typeof path !== 'string') fail('asset_path', `${id}: path is missing`);
  const base = path.slice(path.lastIndexOf('/') + 1);
  for (const q of QUARANTINED) if (base === `${q}.obj`) fail('asset_quarantined', `${id}: path names quarantined ${q}`);
  if (path.includes('..') || path.includes('\\') || path.startsWith('/') || !PATH_RE.test(path)) {
    fail('asset_path', `${id}: path must be a relative meshes/<file>.obj path with no traversal: ${JSON.stringify(path)}`);
  }
  if (path !== `meshes/${id}.obj`) fail('asset_path', `${id}: path must be meshes/${id}.obj, got ${JSON.stringify(path)}`);
  if (!Number.isSafeInteger(raw.bytes) || raw.bytes <= 0) fail('asset_entry', `${id}: bytes must be a positive integer`);
  if (typeof raw.sha256 !== 'string' || !HEX64_RE.test(raw.sha256)) fail('asset_entry', `${id}: sha256 must be 64 hex characters`);
  // The accepted combined manifest binds two packets whose entries differ in shape: `groups` (array)
  // or `group` (string); `embedded_source_name` or `source_name`; laterality 'left' or prose.
  const groups = Array.isArray(raw.groups) ? raw.groups : typeof raw.group === 'string' ? [raw.group] : null;
  if (!groups || groups.length === 0 || !groups.every(g => typeof g === 'string')) {
    fail('asset_entry', `${id}: groups (or group) must name the entry's group`);
  }
  const packet = raw.source_packet === undefined ? 'pov-demo-assets' : raw.source_packet;
  if (!SOURCE_PACKETS.includes(packet)) fail('asset_path', `${id}: source_packet ${JSON.stringify(String(packet)).slice(0, 60)} is not an accepted packet`);
  const name = typeof raw.embedded_source_name === 'string' ? raw.embedded_source_name
    : typeof raw.source_name === 'string' ? raw.source_name : '';
  const lat = raw.laterality === 'left' || (typeof raw.laterality === 'string' && /^left\b/i.test(raw.laterality) && /\bleft\b/i.test(name))
    ? 'left' : raw.laterality;
  if (!isVec3(raw.bounds_min) || !isVec3(raw.bounds_max)) fail('asset_entry', `${id}: bounds_min and bounds_max must be 3 finite numbers`);
  if (raw.vertices !== undefined && !(Number.isSafeInteger(raw.vertices) && raw.vertices > 0)) {
    fail('asset_entry', `${id}: vertices, when present, must be a positive integer`);
  }
  return Object.freeze({
    ...raw,
    sha256: raw.sha256.toLowerCase(),
    groups: Object.freeze(groups.slice()),
    source_packet: packet,
    name,
    laterality: lat,
    bounds_min: Object.freeze(raw.bounds_min.slice()),
    bounds_max: Object.freeze(raw.bounds_max.slice())
  });
}

function checkBrainRoleSide(id, minX, maxX, what) {
  if (!has(BRAIN_SIDE, id)) return;
  if (BRAIN_SIDE[id] === 'right' && !(maxX < 0)) fail('asset_laterality', `${id}: ${what} max x ${maxX} must be < 0 (subject right is -x)`);
  if (BRAIN_SIDE[id] === 'left' && !(minX > 0)) fail('asset_laterality', `${id}: ${what} min x ${minX} must be > 0 (subject left is +x)`);
}

function validateInternal(manifest) {
  // Accepted current form: an object with assets[] (neurosurge-integration-r1); the original bare array is legacy.
  if (manifest !== null && typeof manifest === 'object' && !Array.isArray(manifest)) {
    if (!Array.isArray(manifest.assets)) fail('asset_manifest', 'manifest object must have an assets array');
    if (manifest.asset_count !== undefined && manifest.asset_count !== manifest.assets.length) {
      fail('asset_manifest', `asset_count ${manifest.asset_count} does not match ${manifest.assets.length} entries`);
    }
    manifest = manifest.assets;
  }
  if (!Array.isArray(manifest)) fail('asset_manifest', 'manifest must be an object with assets[] or an array of entries');
  const seenIds = new Set(), seenPaths = new Set();
  const arm = [], brain = [], excluded = [], order = [];
  manifest.forEach((raw, index) => {
    const e = snapshotEntry(raw, index);
    const id = e.element_id;
    if (seenIds.has(id)) fail('asset_duplicate', `duplicate element_id ${id}`);
    const where = `${e.source_packet}/${e.path}`;
    if (seenPaths.has(where)) fail('asset_duplicate', `duplicate path ${where}`);
    seenIds.add(id);
    seenPaths.add(where);
    const isBone = e.groups.includes(GROUP_BONE), isMuscle = e.groups.includes(GROUP_MUSCLE), isBrain = e.groups.includes(GROUP_BRAIN);
    if ((isBone ? 1 : 0) + (isMuscle ? 1 : 0) + (isBrain ? 1 : 0) !== 1) {
      fail('asset_group', `${id}: groups must contain exactly one of ${GROUP_BONE}, ${GROUP_MUSCLE}, ${GROUP_BRAIN}`);
    }
    const role = has(SEGMENT_OF, id) ? SEGMENT_OF[id] : has(SHOULDER_GIRDLE_INFO, id) ? SHOULDER_GIRDLE_INFO[id] : null;
    if (isBrain) {
      if (role) fail('asset_group', `${id}: an arm id cannot be in the brain group`);
      checkBrainRoleSide(id, e.bounds_min[0], e.bounds_max[0], 'manifest bounds');
      brain.push(e);
      order.push({ set: 'brain', entry: e });
      return;
    }
    const kind = isBone ? 'bone' : 'muscle';
    if (e.laterality !== 'left') fail('asset_laterality', `${id}: arm entries must have laterality "left", got ${JSON.stringify(e.laterality)}`);
    if (!(e.bounds_min[0] > 0)) fail('asset_laterality', `${id}: arm bounds min x ${e.bounds_min[0]} <= 0; arm meshes must sit at +x (subject left)`);
    if (!role) fail('asset_unknown', `${id}: arm id is in neither SEGMENT_OF nor SHOULDER_GIRDLE_EXCLUDED`);
    if (role.kind !== kind) fail('asset_group', `${id}: manifest group says ${kind}, the contract records ${role.kind}`);
    if (has(SHOULDER_GIRDLE_INFO, id)) {
      excluded.push(Object.freeze({ id, reason: SHOULDER_GIRDLE_INFO[id].reason }));
      return;
    }
    arm.push(e);
    order.push({ set: 'arm', entry: e });
  });
  const armIds = new Set(arm.map(e => e.element_id));
  for (const [id] of BONES) if (!armIds.has(id)) fail('asset_missing_bone', `${id} (${SEGMENT_OF[id].name}) is required by SEGMENT_OF`);
  const brainIds = new Set(brain.map(e => e.element_id));
  for (const [role, id] of Object.entries(BRAIN)) if (!brainIds.has(id)) fail('asset_missing_brain', `${id} (${role}) is required in the brain group`);
  return { arm: Object.freeze(arm), brain: Object.freeze(brain), excluded: Object.freeze(excluded), order };
}

/** Validate a parsed MESH-MANIFEST.json array.
 * Returns { arm: [entry...], brain: [entry...], excluded: [{id, reason}...] }, each in manifest
 * order; entries are frozen validated snapshots. Throws ns:asset_* on any violation. */
export function validateManifest(manifest) {
  const { arm, brain, excluded } = validateInternal(manifest);
  return { arm, brain, excluded };
}

// ---------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------

/** UTF-8 byte length of a JS string (lone surrogates count as U+FFFD, 3 bytes, as encoders emit).
 * R3-perf: pure-ASCII text (every pinned OBJ) is 1 byte per code unit; a native regex scan finds that about 4x faster
 * than the per-character loop, which still runs for any text with a non-ASCII character. */
export function utf8ByteLength(text) {
  if (!NON_ASCII_RE.test(text)) return text.length;
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { n += 4; i++; } else n += 3;
    } else n += 3;
  }
  return n;
}

// ---------------------------------------------------------------------------------------
// R4-load: byte path (the served bytes are checked; each file is decoded once)
// ---------------------------------------------------------------------------------------

let utf8Decoder = null;
/** Lossless UTF-8 decode of verified bytes: fatal (invalid UTF-8 is refused, never replaced) and BOM kept (as U+FEFF),
 * so the text's UTF-8 encoding is exactly these bytes. Throws ns:asset_parse for invalid UTF-8. */
export function decodeUtf8Exact(bytes, id = 'text') {
  if (!utf8Decoder) utf8Decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  try { return utf8Decoder.decode(bytes); } catch { return fail('asset_parse', `${id}: the file is not valid UTF-8 text`); }
}

/** Uint8Array view of what a readBytes reader returned (ArrayBuffer, any typed array or DataView), else null. */
function asBytes(raw) {
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (ArrayBuffer.isView(raw)) return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  return null;
}

/**
 * Read one manifest entry and check it before anything parses it. Text path (readText, sha256Hex): the text's UTF-8
 * byte count must equal entry.bytes (ns:asset_bytes), then sha256Hex(text) must equal entry.sha256 (ns:asset_hash). Byte
 * path (readBytes, sha256HexBytes; used when readBytes is given): the served byte count, then the sha256 of the served
 * bytes themselves, then a lossless UTF-8 decode. Returns { text, bytes } (bytes = the verified UTF-8 length).
 * For every file that passes both paths the text is the same string. The byte path is the stricter one: it refuses a
 * served file that differs from the pinned bytes in any way (for example an added byte-order mark, which a browser's
 * response.text() would silently strip before the text path sees it).
 */
async function readVerified(entry, io) {
  const id = entry.element_id;
  if (typeof io.readBytes === 'function') {
    let raw;
    try { raw = await io.readBytes(entry.path, entry); } catch (err) { fail('asset_read', `${id}: ${err && err.message ? err.message : String(err)}`); }
    const u8 = asBytes(raw);
    if (!u8) fail('asset_read', `${id}: readBytes must return an ArrayBuffer or a typed array`);
    if (u8.byteLength !== entry.bytes) fail('asset_bytes', `${id}: ${u8.byteLength} bytes, manifest says ${entry.bytes}`);
    const hex = await io.sha256HexBytes(u8);
    if (typeof hex !== 'string' || hex.toLowerCase() !== entry.sha256) fail('asset_hash', `${id}: sha256 does not match the manifest`);
    return { text: decodeUtf8Exact(u8, id), bytes: u8.byteLength };
  }
  let text;
  try { text = await io.readText(entry.path, entry); } catch (err) { fail('asset_read', `${id}: ${err && err.message ? err.message : String(err)}`); }
  if (typeof text !== 'string') fail('asset_read', `${id}: readText must return a string`);
  const bytes = utf8ByteLength(text);
  if (bytes !== entry.bytes) fail('asset_bytes', `${id}: ${bytes} UTF-8 bytes, manifest says ${entry.bytes}`);
  const hex = await io.sha256Hex(text);
  if (typeof hex !== 'string' || hex.toLowerCase() !== entry.sha256) fail('asset_hash', `${id}: sha256 does not match the manifest`);
  return { text, bytes };
}

/** Parse verified text with the injected parser (parseObjFast reuses the verified byte count for its maxBytes limit). */
function parseVerified(parse, text, bytes) {
  return parse === parseObjFast ? parseObjFast(text, { knownUtf8Bytes: bytes }) : parse(text);
}

/** The reader pair a loader uses: { readBytes, sha256HexBytes } when readBytes is a function, else { readText, sha256Hex };
 * returns null when neither pair is complete. */
function readerPair({ readText, sha256Hex, readBytes, sha256HexBytes }) {
  if (typeof readBytes === 'function') return typeof sha256HexBytes === 'function' ? { readBytes, sha256HexBytes } : null;
  return typeof readText === 'function' && typeof sha256Hex === 'function' ? { readText, sha256Hex } : null;
}

/** Post-parse checks against the actual geometry, not only the manifest's claims. */
function checkParsed(set, entry, mesh) {
  const id = entry.element_id;
  const p = mesh && mesh.positions;
  if (!p || typeof p.length !== 'number' || p.length === 0 || p.length % 3 !== 0) fail('asset_parse', `${id}: parser returned no vertex positions`);
  const n = p.length / 3;
  if (typeof entry.vertices === 'number' && n !== entry.vertices) fail('asset_vertices', `${id}: parsed ${n} vertices, manifest says ${entry.vertices}`);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i];
    if (!Number.isFinite(x)) fail('asset_parse', `${id}: non-finite vertex x`);
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  if (set === 'arm' && !(lo > 0)) fail('asset_laterality', `${id}: parsed geometry min x ${lo} <= 0; arm meshes must sit at +x (subject left)`);
  if (set === 'brain') checkBrainRoleSide(id, lo, hi, 'parsed geometry');
}

/** Load every allowlisted entry, in manifest order.
 * For each entry: readText(entry.path, entry) (entry.source_packet names the packet) -> UTF-8 byte length must equal entry.bytes (ns:asset_bytes)
 * -> sha256Hex(text) must equal entry.sha256 (ns:asset_hash) -> only then parse(text).
 * readText and sha256Hex may be sync or async. Excluded (girdle) entries are never read.
 * R4-load byte path: pass readBytes(path, entry) -> ArrayBuffer | Uint8Array and sha256HexBytes(bytes) instead; the served
 * byte count and the sha256 of the served bytes are checked, then the bytes are decoded once (losslessly) and parsed.
 * Returns { arm: Map(id -> {entry, mesh}), brain: Map(id -> {entry, mesh}), excluded }. */
export async function loadAssets({ manifest, readText, sha256Hex, readBytes = null, sha256HexBytes = null, parse = parseObjFast } = {}) {
  if (typeof readBytes === 'function') {
    if (typeof sha256HexBytes !== 'function') fail('asset_args', 'sha256HexBytes(bytes) must be injected with readBytes');
  } else {
    if (typeof readText !== 'function') fail('asset_args', 'readText(path) must be injected');
    if (typeof sha256Hex !== 'function') fail('asset_args', 'sha256Hex(text) must be injected');
  }
  if (typeof parse !== 'function') fail('asset_args', 'parse(text) must be a function');
  const v = validateInternal(manifest);
  const io = readerPair({ readText, sha256Hex, readBytes, sha256HexBytes });
  const arm = new Map(), brain = new Map();
  for (const { set, entry } of v.order) {
    // Byte count, then sha256, then (only then) parse: readVerified. R3-perf: the fast parser reuses the verified byte count.
    const { text, bytes } = await readVerified(entry, io);
    const mesh = await parseVerified(parse, text, bytes);
    checkParsed(set, entry, mesh);
    (set === 'arm' ? arm : brain).set(entry.element_id, Object.freeze({ entry, mesh }));
  }
  return { arm, brain, excluded: v.excluded };
}

// ---------------------------------------------------------------------------------------
// Rig inputs derived from the loaded anatomy
// ---------------------------------------------------------------------------------------

function positionsOf(armMap, id) {
  const v = armMap.get(id);
  const p = v ? (v.mesh ? v.mesh.positions : v.positions) : null;
  if (!p || typeof p.length !== 'number' || p.length < 3 || p.length % 3 !== 0) return null;
  return p;
}

function zRange(p) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 2; i < p.length; i += 3) {
    if (p[i] < lo) lo = p[i];
    if (p[i] > hi) hi = p[i];
  }
  return { lo, hi };
}

/** Centroid of the pooled vertices of several position arrays, optionally filtered by z. */
function pooledCentroid(parts, what) {
  let sx = 0, sy = 0, sz = 0, n = 0;
  for (const { p, keep } of parts) {
    for (let i = 0; i + 2 < p.length; i += 3) {
      const z = p[i + 2];
      if (keep && !keep(z)) continue;
      sx += p[i]; sy += p[i + 1]; sz += z; n++;
    }
  }
  if (n === 0) fail('asset_degenerate', `${what}: no vertices selected`);
  return [sx / n, sy / n, sz / n];
}

/** Unit vector from a raw mm difference; refuses a vanishing one (< 1e-3 mm). */
function unitOrFail(v, what) {
  const l = length(v);
  if (!(l > 1e-3)) fail('asset_degenerate', `${what}: vector length ${l} mm is too small to define a direction`);
  return scale(v, 1 / l);
}

function unitOption(v, what) {
  if (!isVec3(v)) fail('asset_args', `${what} must be [x, y, z] with finite numbers`);
  const l = length(v);
  if (!(l > 1e-9)) fail('asset_args', `${what} must be non-zero`);
  return scale(v, 1 / l);
}

/** Bone axes per the ns-rig pivot definitions (source mm, distal = low z), using the ns-rig constants:
 * shoulder = humerus z >= zmax - SHOULDER_CAP_MM, elbow = humerus z <= zmin + ELBOW_CAP_MM,
 * forearm end = pooled radius + ulna distal caps (lowest CAP_FRACTION of each bone's z extent). */
function boneAxes(armMap) {
  const need = id => {
    const p = positionsOf(armMap, id);
    if (!p) fail('asset_missing_bone', `${id} (${SEGMENT_OF[id].name}) is required`);
    return p;
  };
  const humerus = need('FJ3262'), radius = need('FJ3277'), ulna = need('FJ3286');
  const hz = zRange(humerus), rz = zRange(radius), uz = zRange(ulna);
  const shoulder = pooledCentroid([{ p: humerus, keep: z => z >= hz.hi - SHOULDER_CAP_MM }], 'shoulder');
  const elbow = pooledCentroid([{ p: humerus, keep: z => z <= hz.lo + ELBOW_CAP_MM }], 'elbow');
  const wrist = pooledCentroid([
    { p: radius, keep: z => z <= rz.lo + CAP_FRACTION * (rz.hi - rz.lo) },
    { p: ulna, keep: z => z <= uz.lo + CAP_FRACTION * (uz.hi - uz.lo) }
  ], 'wrist');
  return {
    humerusDir: unitOrFail(sub(elbow, shoulder), 'humerus direction'),
    forearmDir: unitOrFail(sub(wrist, elbow), 'forearm direction')
  };
}

/** Palmar and anterior-upper-arm directions from muscle vertex centroids (source frame, unit).
 * palmar = normalize(reject(centroid(FDS, FDP, FCR, FCU) - centroid(ED, ECRL, ECRB, ECU), forearmDir));
 * anteriorUpper = normalize(reject(centroid(BIC long + short, BRA) - centroid(TRI x3), humerusDir)).
 * Centroids pool every vertex of the member meshes. forearmDir/humerusDir default to the ns-rig
 * pivot definitions computed from the bones; pass them to reuse the rig's own directions.
 * These are approximate compartment directions, not validated joint axes. */
export function compartmentDirections(armMap, { forearmDir, humerusDir } = {}) {
  if (!(armMap instanceof Map)) fail('asset_args', 'armMap must be a Map(id -> {entry, mesh})');
  const muscles = ids => ids.map(id => {
    const p = positionsOf(armMap, id);
    if (!p) fail('asset_missing_muscle', `${id} (${SEGMENT_OF[id].name}) is required`);
    return { p, keep: null };
  });
  const flex = muscles(COMPARTMENTS.flexors), ext = muscles(COMPARTMENTS.extensors);
  const ant = muscles(COMPARTMENTS.anteriorUpper), post = muscles(COMPARTMENTS.posteriorUpper);
  let fDir = forearmDir === undefined ? null : unitOption(forearmDir, 'forearmDir');
  let hDir = humerusDir === undefined ? null : unitOption(humerusDir, 'humerusDir');
  if (!fDir || !hDir) {
    const axes = boneAxes(armMap);
    if (!fDir) fDir = axes.forearmDir;
    if (!hDir) hDir = axes.humerusDir;
  }
  const palmarRaw = sub(pooledCentroid(flex, 'flexors'), pooledCentroid(ext, 'extensors'));
  const anteriorRaw = sub(pooledCentroid(ant, 'anterior upper arm'), pooledCentroid(post, 'posterior upper arm'));
  const palmar = unitOrFail(reject(palmarRaw, fDir), 'palmar');
  const anteriorUpper = unitOrFail(reject(anteriorRaw, hDir), 'anteriorUpper');
  return Object.freeze({
    palmar,
    anteriorUpper,
    forearmDir: fDir,
    humerusDir: hDir,
    alongForearmRemovedMm: dot(palmarRaw, fDir),
    alongHumerusRemovedMm: dot(anteriorRaw, hDir),
    approximation: 'compartment-centroid directions from pooled muscle vertices; approximate, not validated joint axes'
  });
}

/** Bone positions grouped for deriveRig: { boneMeshes: Map(segment -> [positions...]), metacarpals }. */
export function boneInputs(armMap) {
  if (!(armMap instanceof Map)) fail('asset_args', 'armMap must be a Map(id -> {entry, mesh})');
  const boneMeshes = new Map();
  for (const [id, segment, name] of BONES) {
    const p = positionsOf(armMap, id);
    if (!p) fail('asset_missing_bone', `${id} (${name}) is required`);
    if (!boneMeshes.has(segment)) boneMeshes.set(segment, []);
    boneMeshes.get(segment).push(p);
  }
  const metacarpals = {};
  for (const [digit, id] of Object.entries(METACARPAL_IDS)) metacarpals[digit] = positionsOf(armMap, id);
  return { boneMeshes, metacarpals, carpals: carpalInputs(armMap) };
}

/** Carpal positions for deriveRig's `carpals` option: { capitate } (the wrist flexion pivot is its head centre). */
export function carpalInputs(armMap) {
  if (!(armMap instanceof Map)) fail('asset_args', 'armMap must be a Map(id -> {entry, mesh})');
  const capitate = positionsOf(armMap, CARPAL_IDS.capitate);
  if (!capitate) fail('asset_missing_bone', `${CARPAL_IDS.capitate} (Left capitate) is required`);
  return { capitate };
}

// ---------------------------------------------------------------------------------------
// U3a: optional full-body group (inputs/FULLBODY-MESH-MANIFEST.json, packet bodyparts3d-fullbody-r1)
// ---------------------------------------------------------------------------------------

/** The only packet a full-body entry may name (its files live under packets/<FULLBODY_PACKET>/meshes/). */
export const FULLBODY_PACKET = 'bodyparts3d-fullbody-r1';
/** Default number of full-body files fetched/hashed/parsed at once (bounded parallelism). */
export const FULLBODY_DEFAULT_CONCURRENCY = 4;
/** Upper bound on full-body entries accepted from one manifest. */
export const FULLBODY_MAX_ENTRIES = 2000;
const FULLBODY_KINDS = Object.freeze(['bone', 'muscle']);
const FULLBODY_SIDES = Object.freeze(['left', 'right', 'midline']);
/**
 * Ids the full-body group never loads: the deep flexor pollicis brevis pair whose labels conflict with their
 * coordinates (FJ1469 'left FPB' lies at -x, FJ1469M 'right FPB' at +x; Root found the first, U0 the mirror) and FJ2772
 * (a laryngeal-series hyoid whose geometry duplicates FJ3201). The arm list QUARANTINED also names FJ1406M, which is the
 * LEG's 'Left extensor digitorum longus' refused there as an arm candidate; in the full-body group it is the left-leg
 * EDL with a verified left laterality, so it is NOT refused here (open item for Root review).
 */
export const FULLBODY_QUARANTINED = Object.freeze(['FJ1469', 'FJ1469M', 'FJ2772']);
/** Midline tolerance (mm) for the laterality check of 'midline' entries (vertebrae, sternum, hyoid, ...). */
const MIDLINE_TOLERANCE_MM = 45;

/** Validate one raw full-body entry and return a frozen snapshot (the snapshot is what gets loaded). */
function snapshotFullbodyEntry(raw, index) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) fail('fullbody_entry', `entry ${index} is not an object`);
  const id = raw.element_id;
  if (typeof id !== 'string' || !ID_RE.test(id)) fail('fullbody_entry', `entry ${index}: element_id must match FJ<digits>[M]`);
  if (FULLBODY_QUARANTINED.includes(id)) fail('asset_quarantined', `${id} is quarantined and is never loaded`);
  const path = raw.path;
  if (typeof path !== 'string' || path.includes('..') || path.includes('\\') || path.startsWith('/') || !PATH_RE.test(path) || path !== `meshes/${id}.obj`) {
    fail('fullbody_path', `${id}: path must be meshes/${id}.obj, got ${JSON.stringify(String(path)).slice(0, 80)}`);
  }
  const packet = raw.source_packet === undefined ? FULLBODY_PACKET : raw.source_packet;
  if (packet !== FULLBODY_PACKET) fail('fullbody_path', `${id}: source_packet must be ${FULLBODY_PACKET}`);
  if (!Number.isSafeInteger(raw.bytes) || raw.bytes <= 0) fail('fullbody_entry', `${id}: bytes must be a positive integer`);
  if (typeof raw.sha256 !== 'string' || !HEX64_RE.test(raw.sha256)) fail('fullbody_entry', `${id}: sha256 must be 64 hex characters`);
  if (!Array.isArray(raw.groups) || raw.groups.length === 0 || !raw.groups.every(g => typeof g === 'string' && g.length > 0)) {
    fail('fullbody_entry', `${id}: groups must be a non-empty array of strings`);
  }
  if (!FULLBODY_KINDS.includes(raw.kind)) fail('fullbody_entry', `${id}: kind must be one of ${FULLBODY_KINDS.join(', ')}`);
  if (typeof raw.region !== 'string' || !raw.region) fail('fullbody_entry', `${id}: region must be a string`);
  if (!FULLBODY_SIDES.includes(raw.laterality)) fail('fullbody_laterality', `${id}: laterality must be one of ${FULLBODY_SIDES.join(', ')}`);
  if (!isVec3(raw.bounds_min) || !isVec3(raw.bounds_max)) fail('fullbody_entry', `${id}: bounds_min and bounds_max must be 3 finite numbers`);
  if (raw.vertices !== undefined && !(Number.isSafeInteger(raw.vertices) && raw.vertices > 0)) fail('fullbody_entry', `${id}: vertices, when present, must be a positive integer`);
  const hint = raw.rig_hint;
  if (hint !== undefined && !(typeof hint === 'string' || (Array.isArray(hint) && hint.length === 2 && hint.every(h => typeof h === 'string')))) {
    fail('fullbody_entry', `${id}: rig_hint must be a segment name or [proximal, distal]`);
  }
  const cx = isVec3(raw.centroid) ? raw.centroid[0] : 0.5 * (raw.bounds_min[0] + raw.bounds_max[0]);
  checkSide(id, raw.laterality, cx, 'manifest centroid');
  const concept = Array.isArray(raw.concepts) && raw.concepts[0] && typeof raw.concepts[0].en === 'string' ? raw.concepts[0].en : '';
  return Object.freeze({
    ...raw,
    sha256: raw.sha256.toLowerCase(),
    source_packet: packet,
    groups: Object.freeze(raw.groups.slice()),
    name: typeof raw.embedded_source_name === 'string' ? raw.embedded_source_name : concept,
    concept,
    rig_hint: Array.isArray(hint) ? Object.freeze(hint.slice()) : hint,
    bounds_min: Object.freeze(raw.bounds_min.slice()),
    bounds_max: Object.freeze(raw.bounds_max.slice())
  });
}

/** BodyParts3D: subject RIGHT is -x, LEFT is +x. */
function checkSide(id, side, cx, what) {
  if (side === 'right' && !(cx < 0)) fail('fullbody_laterality', `${id}: right-sided entry has ${what} x ${cx} >= 0 (subject right is -x)`);
  if (side === 'left' && !(cx > 0)) fail('fullbody_laterality', `${id}: left-sided entry has ${what} x ${cx} <= 0 (subject left is +x)`);
  if (side === 'midline' && !(Math.abs(cx) <= MIDLINE_TOLERANCE_MM)) fail('fullbody_laterality', `${id}: midline entry has ${what} x ${cx} beyond ${MIDLINE_TOLERANCE_MM} mm`);
}

/**
 * Validate a parsed FULLBODY-MESH-MANIFEST.json (object with assets[]; asset_count and packet checked when present).
 * excludeIds: ids already loaded from MESH-MANIFEST.json (the left arm and brain); a full-body entry naming one is
 * refused (nothing may be listed twice). Returns { entries (frozen snapshots, manifest order), counts }.
 */
export function validateFullbodyManifest(manifest, { excludeIds = [] } = {}) {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest) || !Array.isArray(manifest.assets)) {
    fail('fullbody_manifest', 'the full-body manifest must be an object with an assets array');
  }
  if (manifest.asset_count !== undefined && manifest.asset_count !== manifest.assets.length) {
    fail('fullbody_manifest', `asset_count ${manifest.asset_count} does not match ${manifest.assets.length} entries`);
  }
  if (manifest.packet !== undefined && manifest.packet !== FULLBODY_PACKET) fail('fullbody_manifest', `packet must be ${FULLBODY_PACKET}`);
  if (manifest.assets.length > FULLBODY_MAX_ENTRIES) fail('fullbody_manifest', `more than ${FULLBODY_MAX_ENTRIES} entries`);
  const exclude = new Set(excludeIds);
  const seen = new Set();
  const entries = [];
  const byRegion = Object.create(null), byKind = Object.create(null);
  manifest.assets.forEach((raw, i) => {
    const e = snapshotFullbodyEntry(raw, i);
    if (seen.has(e.element_id)) fail('asset_duplicate', `duplicate full-body element_id ${e.element_id}`);
    if (exclude.has(e.element_id)) fail('asset_duplicate', `${e.element_id} is already listed in MESH-MANIFEST.json`);
    seen.add(e.element_id);
    entries.push(e);
    byRegion[e.region] = (byRegion[e.region] || 0) + 1;
    byKind[e.kind] = (byKind[e.kind] || 0) + 1;
  });
  return { entries: Object.freeze(entries), counts: Object.freeze({ total: entries.length, byRegion: Object.freeze(byRegion), byKind: Object.freeze(byKind) }) };
}

/** Run fn over items with at most `limit` promises in flight; results in input order. */
async function mapBounded(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

const ABSENT = () => Object.freeze({ status: 'absent', meshes: new Map(), failed: Object.freeze([]), counts: null, error: null });
const INVALID = err => Object.freeze({ status: 'invalid', meshes: new Map(), failed: Object.freeze([]), counts: null, error: String(err && err.message ? err.message : err) });

/** R4-load: the bulk orders streamFullbodyAssets accepts. 'bytes': largest file first (on a bounded pool the long files
 * start early instead of ending the load); 'manifest': manifest order. The ORDER never changes what is loaded or the
 * result: results are always keyed and ordered by the manifest. */
export const FULLBODY_BULK_ORDERS = Object.freeze(['bytes', 'manifest']);

/**
 * R4-load: the ids of the full-body entries eyePosition's 'skull_orbits' source reads (every entry named a left or right
 * lacrimal bone, found by the same name test eyePosition uses), in manifest order. Loading only these first gives the same
 * eye, so the first view does not change when the rest of the body arrives (tests/unit/R4-load-progressive.test.mjs).
 * entries: raw manifest entries or validated snapshots.
 */
export function fullbodyEyeIds(entries) {
  if (!Array.isArray(entries)) fail('asset_args', 'entries must be an array');
  return Object.freeze(entries
    .filter(e => e && typeof e.element_id === 'string' && entryNames(e).some(s => EYE_SOURCE_NAME_RE.left.test(s) || EYE_SOURCE_NAME_RE.right.test(s)))
    .map(e => e.element_id));
}

/**
 * R4-load: split full-body entries into the PRIORITY part (priorityIds, default fullbodyEyeIds(entries); manifest order)
 * and the BULK (everything else, in `bulkOrder`). Unknown priority ids are reported in missingPriorityIds and ignored.
 * @returns frozen { priorityIds, missingPriorityIds, priority: [entry...], bulk: [entry...], bulkOrder }
 */
export function fullbodyLoadPlan(entries, { priorityIds, bulkOrder = 'bytes' } = {}) {
  if (!Array.isArray(entries)) fail('asset_args', 'entries must be an array');
  if (!FULLBODY_BULK_ORDERS.includes(bulkOrder)) fail('asset_args', `bulkOrder must be one of ${FULLBODY_BULK_ORDERS.join(', ')}`);
  const wanted = priorityIds === undefined || priorityIds === null ? fullbodyEyeIds(entries) : priorityIds;
  if (!Array.isArray(wanted) || !wanted.every(id => typeof id === 'string')) fail('asset_args', 'priorityIds must be an array of element ids');
  const want = new Set(wanted);
  const known = new Set(entries.map(e => e.element_id));
  const priority = entries.filter(e => want.has(e.element_id));
  const rest = entries.filter(e => !want.has(e.element_id));
  // Stable sort: equal sizes keep manifest order.
  const bulk = bulkOrder === 'bytes' ? rest.map((e, i) => [e, i]).sort((a, b) => (b[0].bytes - a[0].bytes) || (a[1] - b[1])).map(x => x[0]) : rest;
  return Object.freeze({
    priorityIds: Object.freeze(priority.map(e => e.element_id)),
    missingPriorityIds: Object.freeze([...want].filter(id => !known.has(id))),
    priority: Object.freeze(priority),
    bulk: Object.freeze(bulk),
    bulkOrder
  });
}

/** Read, check and parse one full-body entry (byte count, sha256, parse, vertex count, finite vertices, laterality from the
 * parsed centroid). `beforeParse` (optional, async) runs between the checks and the parse: the time-slicing point. */
async function verifyFullbody(entry, io, parse, beforeParse) {
  const id = entry.element_id;
  const { text, bytes } = await readVerified(entry, io);
  if (beforeParse) await beforeParse();
  const mesh = await parseVerified(parse, text, bytes);
  const p = mesh && mesh.positions;
  if (!p || typeof p.length !== 'number' || p.length === 0 || p.length % 3 !== 0) fail('asset_parse', `${id}: parser returned no vertex positions`);
  if (typeof entry.vertices === 'number' && p.length / 3 !== entry.vertices) fail('asset_vertices', `${id}: parsed ${p.length / 3} vertices, manifest says ${entry.vertices}`);
  let sx = 0;
  for (let i = 0; i < p.length; i += 3) { if (!Number.isFinite(p[i]) || !Number.isFinite(p[i + 1]) || !Number.isFinite(p[i + 2])) fail('asset_parse', `${id}: non-finite vertex`); sx += p[i]; }
  checkSide(id, entry.laterality, sx / (p.length / 3), 'parsed centroid');
  return Object.freeze({ entry, mesh });
}

const failureOf = (id, err) => {
  const message = String(err && err.message ? err.message : err);
  const m = /^ns:([a-z_]+):/.exec(message);
  return Object.freeze({ id, code: m ? m[1] : 'asset_read', message: message.slice(0, 300) });
};
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const defaultNow = () => (typeof performance !== 'undefined' && performance && typeof performance.now === 'function' ? performance.now() : Date.now());

/**
 * R4-load: PROGRESSIVE full-body loading. Never throws. Every file is checked exactly as loadFullbodyAssets does (byte
 * count, then sha256, then parse, then vertex count, finite vertices and laterality); the parsed geometry is identical.
 *
 * The load runs in two parts:
 *   1. PRIORITY (default: fullbodyEyeIds, the two lacrimal bones, about 84 kB): starts at once. `priority` resolves when
 *      each priority file is verified or has failed: { status, meshes: Map(id -> {entry, mesh}) in manifest order,
 *      failed, counts, error }. eyePosition({ fullbody: (await s.priority).meshes, ... }) gives exactly the eye the whole
 *      body gives, so the camera and the arm attachment of the first frame never change later.
 *   2. BULK (all other files, largest first by default): starts when the caller calls start() (call it once the first
 *      frame is on screen, so the bulk's parsing does not delay that frame) or at once with autoStart: true. It begins
 *      after the priority part has finished.
 * `done` resolves once with the loadFullbodyAssets result for ALL files: { status: 'complete' | 'partial' | 'rejected' |
 * 'cancelled' | 'absent' | 'invalid', meshes: Map in manifest order, failed (sorted by id), counts, error }.
 * Options:
 *   readText + sha256Hex (text path) or readBytes + sha256HexBytes (byte path: the served bytes are checked and decoded
 *   once; see readVerified); parse (default parseObjFast); concurrency (files in flight, 1-16); excludeIds;
 *   allOrNothing (any failure -> status 'rejected' with no meshes); priorityIds (array of ids; [] = no priority part);
 *   bulkOrder ('bytes' | 'manifest'); autoStart;
 *   sliceMs + yieldFn: time slicing. Before each parse, when more than sliceMs (ms, by now()) have passed since the
 *   last yield, `await yieldFn()` first (in a page: a macrotask yield such as a MessageChannel message or setTimeout 0,
 *   so frames are drawn between files). The slice clock restarts after each yield. Without yieldFn nothing yields;
 *   onMesh({ id, record, priority, done, total }) after each verified file (advisory; errors in it are ignored);
 *   onProgress({ done, total }) after each file, verified or failed (as loadFullbodyAssets).
 * Returns { plan, counts, priority: Promise, done: Promise, start(): Promise (= done), cancel(), progress() }.
 * cancel(): files not yet started are skipped; `done` then resolves with status 'cancelled' and what was verified.
 */
export function streamFullbodyAssets({
  manifest, readText, sha256Hex, readBytes = null, sha256HexBytes = null, parse = parseObjFast,
  concurrency = FULLBODY_DEFAULT_CONCURRENCY, excludeIds = [], allOrNothing = false,
  priorityIds, bulkOrder = 'bytes', autoStart = false,
  sliceMs = 0, yieldFn = null, now = defaultNow,
  onMesh = null, onProgress = null
} = {}) {
  const settled = r => {
    const p = Promise.resolve(r);
    return Object.freeze({ plan: null, counts: r.counts, priority: p, done: p, start: () => p, cancel: () => {}, progress: () => Object.freeze({ done: 0, total: 0, priorityTotal: 0, started: false, cancelled: false }) });
  };
  if (manifest === null || manifest === undefined) return settled(ABSENT());
  const io = readerPair({ readText, sha256Hex, readBytes, sha256HexBytes });
  if (!io || typeof parse !== 'function') {
    return settled(INVALID(typeof readBytes === 'function' ? 'readBytes, sha256HexBytes and parse must be functions' : 'readText, sha256Hex and parse must be functions'));
  }
  let v, plan;
  try {
    v = validateFullbodyManifest(manifest, { excludeIds });
    plan = fullbodyLoadPlan(v.entries, { priorityIds, bulkOrder });
  } catch (err) { return settled(INVALID(err)); }
  const limit = Number.isInteger(concurrency) && concurrency > 0 ? Math.min(concurrency, 16) : FULLBODY_DEFAULT_CONCURRENCY;
  const slicing = Number.isFinite(sliceMs) && sliceMs > 0 && typeof yieldFn === 'function' && typeof now === 'function';
  const total = v.entries.length;
  const priorityIdSet = new Set(plan.priorityIds);
  const records = new Map();
  const failed = [];
  let done = 0, cancelled = false, started = false, sliceStart = slicing ? now() : 0;
  const beforeParse = slicing ? async () => { if (now() - sliceStart >= sliceMs) { await yieldFn(); sliceStart = now(); } } : null;

  const runOne = async entry => {
    if (cancelled) return;
    const id = entry.element_id;
    try {
      const rec = await verifyFullbody(entry, io, parse, beforeParse);
      records.set(id, rec);
      if (typeof onMesh === 'function') { try { onMesh({ id, record: rec, priority: priorityIdSet.has(id), done: done + 1, total }); } catch { /* advisory */ } }
    } catch (err) {
      failed.push(failureOf(id, err));
    } finally {
      done++;
      if (typeof onProgress === 'function') { try { onProgress({ done, total }); } catch { /* progress is advisory */ } }
    }
  };
  /** Result over `list` (manifest-ordered meshes; failures of that list sorted by id). */
  const resultOver = (list, final) => {
    const ids = new Set(list.map(e => e.element_id));
    const fails = failed.filter(f => ids.has(f.id)).sort(byId);
    if (allOrNothing && fails.length) {
      return Object.freeze({ status: 'rejected', meshes: new Map(), failed: Object.freeze(fails), counts: v.counts, error: `${fails.length} full-body file(s) failed verification` });
    }
    const meshes = new Map();
    for (const e of v.entries) if (ids.has(e.element_id) && records.has(e.element_id)) meshes.set(e.element_id, records.get(e.element_id));
    const status = final && cancelled ? 'cancelled' : fails.length ? 'partial' : 'complete';
    return Object.freeze({ status, meshes, failed: Object.freeze(fails), counts: v.counts, error: null });
  };

  const priority = mapBounded(plan.priority, limit, runOne).then(() => resultOver(plan.priority, false));
  let resolveDone;
  const donePromise = new Promise(r => { resolveDone = r; });
  const start = () => {
    if (!started) {
      started = true;
      priority
        .then(() => (cancelled ? null : mapBounded(plan.bulk, limit, runOne)))
        .then(() => resolveDone(resultOver(v.entries, true)), err => resolveDone(INVALID(err)));
    }
    return donePromise;
  };
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    if (!started) priority.then(() => resolveDone(resultOver(v.entries, true)));
  };
  if (autoStart) start();
  return Object.freeze({
    plan, counts: v.counts, priority, done: donePromise, start, cancel,
    progress: () => Object.freeze({ done, total, priorityTotal: plan.priority.length, started, cancelled })
  });
}

/**
 * Load the OPTIONAL full-body group. It never throws and never blocks the arm game: call it after the arm scene is up
 * and add whatever it returns. With no manifest (null/undefined, e.g. the file is absent) it resolves to
 * { status: 'absent' } at once. Every file is checked exactly like the arm (UTF-8 byte count, then sha256, then parse,
 * then vertex count and laterality from the parsed geometry); a file that fails is never used and is listed in
 * `failed`. allOrNothing: true drops the whole group when any file fails ('rejected').
 * R4-load: this is streamFullbodyAssets in one go (no priority part, manifest order unless bulkOrder says otherwise); the
 * byte path (readBytes + sha256HexBytes) is accepted too.
 * @returns Promise<{ status: 'absent' | 'invalid' | 'complete' | 'partial' | 'rejected', meshes: Map(id -> {entry, mesh}),
 *   failed: [{ id, code, message }], counts, error }>
 */
export async function loadFullbodyAssets({
  manifest, readText, sha256Hex, readBytes = null, sha256HexBytes = null, parse = parseObjFast,
  concurrency = FULLBODY_DEFAULT_CONCURRENCY, excludeIds = [], allOrNothing = false, onProgress = null,
  bulkOrder = 'manifest', sliceMs = 0, yieldFn = null
} = {}) {
  return streamFullbodyAssets({
    manifest, readText, sha256Hex, readBytes, sha256HexBytes, parse, concurrency, excludeIds, allOrNothing, onProgress,
    bulkOrder, sliceMs, yieldFn, priorityIds: [], autoStart: true
  }).done;
}

/**
 * R4-load: the { manifest, entries, meshesById } shape ns-app's loadFullBodyInputs returns (for ns-body buildBodyRig and
 * scene.setBody), from a COMPLETE full-body result. entries are the manifest's own raw entry objects in manifest order
 * (exactly what ns-app passed before); meshesById maps each id to { positions, indices } of the verified mesh.
 * Throws ns:app_body unless result.status is 'complete' (ns-app's loader rejected on any failure; keep that meaning).
 */
export function fullbodyAppInputs(manifest, result) {
  if (!result || result.status !== 'complete') {
    const why = result ? (result.error || (result.failed && result.failed.length ? `${result.failed[0].id}: ${result.failed[0].message}` : result.status)) : 'no result';
    fail('app_body', `full body not loaded (${result ? result.status : 'none'}): ${why}`);
  }
  const entries = manifest.assets.filter(e => e && result.meshes.has(e.element_id));
  if (entries.length !== manifest.assets.length) fail('app_body', 'the result does not cover every manifest entry');
  const meshesById = new Map();
  for (const e of entries) { const m = result.meshes.get(e.element_id).mesh; meshesById.set(e.element_id, { positions: m.positions, indices: m.indices }); }
  return { manifest, entries, meshesById };
}

// ---------------------------------------------------------------------------------------
// U3a: eye (first-person camera) position from head anatomy
// ---------------------------------------------------------------------------------------

/** Globe centre behind the anterior end of the lacrimal bones (the medial orbital wall near the rim), mm. A display
 * construction: the corneal apex lies a few mm in front of the medial orbital rim and the globe (about 24 mm across)
 * has its centre about 12 mm behind the apex (typical adult magnitudes, cited from memory). */
export const EYE_BEHIND_LACRIMAL_MM = 7;
/** Brain-based fallback: globe centre below the orbital (inferior frontal) brain surface and behind the frontal pole. */
export const EYE_BELOW_ORBITAL_SURFACE_MM = 19;
export const EYE_BEHIND_FRONTAL_POLE_MM = 0;
/** Anthropometric fallback from the left glenohumeral centre (BodyParts3D frame, mm): eye = shoulder + offset. It equals
 * the brain-derived estimate for this anatomy (164 mm medial, 90 mm anterior, 214 mm superior), which agrees with
 * typical adult proportions (eye height about 0.94 and acromion height about 0.82 of stature; cited from memory). */
export const EYE_FROM_LEFT_SHOULDER_MM = Object.freeze([-164, -90, 214]);

function meshStats(p) {
  let n = 0, sx = 0, sy = 0, sz = 0;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < p.length; i += 3) {
    const v = [p[i], p[i + 1], p[i + 2]];
    sx += v[0]; sy += v[1]; sz += v[2]; n++;
    for (let k = 0; k < 3; k++) { if (v[k] < lo[k]) lo[k] = v[k]; if (v[k] > hi[k]) hi[k] = v[k]; }
  }
  return { n, centroid: [sx / n, sy / n, sz / n], lo, hi };
}

/** The names an entry is known by (validated snapshot or raw manifest entry): name, concept, embedded_source_name and
 * every concepts[].en. Used by eyePosition and fullbodyEyeIds, so both select exactly the same files. */
function entryNames(e) {
  if (!e || typeof e !== 'object') return [];
  return [e.name, e.concept, e.embedded_source_name, ...(Array.isArray(e.concepts) ? e.concepts.map(c => c && c.en) : [])].filter(s => typeof s === 'string');
}

/** Name tests of the 'skull_orbits' eye source (eyePosition) and of fullbodyEyeIds. */
export const EYE_SOURCE_NAME_RE = Object.freeze({ left: /\bleft lacrimal bone\b/i, right: /\bright lacrimal bone\b/i });

function findByName(map, re) {
  if (!(map instanceof Map)) return [];
  const out = [];
  for (const [id, v] of map) {
    if (entryNames(v && v.entry ? v.entry : {}).some(s => re.test(s))) out.push({ id, positions: positionsOf(map, id) });
  }
  return out.filter(x => x.positions);
}

/**
 * Estimate the cyclopean eye (the first-person camera position) in BodyParts3D mm, best source first:
 *  1. 'skull_orbits': the left and right lacrimal bones of the full-body group (medial orbital walls): x = their mean
 *     centroid x (the midline), z = the mean of their vertical mid-heights (the orbit centre height), y = their most
 *     anterior vertex + EYE_BEHIND_LACRIMAL_MM. Estimated uncertainty about 10 mm.
 *  2. 'brain': the brain meshes of MESH-MANIFEST.json: y = frontal pole + EYE_BEHIND_FRONTAL_POLE_MM, z = the lowest
 *     brain vertex 10-40 mm behind the pole (the orbital surface over the orbit roof) - EYE_BELOW_ORBITAL_SURFACE_MM,
 *     x = the brain's mid-width. About 15 mm.
 *  3. 'anthropometric': shoulderBp + EYE_FROM_LEFT_SHOULDER_MM. About 25 mm.
 * fullbody: Map(id -> {entry, mesh}) (loadFullbodyAssets().meshes); brain: Map(id -> {entry, mesh}) (loadAssets().brain).
 * @returns frozen { eyeBp, source, uncertaintyMm, detail, alternatives: {source: eyeBp} }
 */
export function eyePosition({ fullbody = null, brain = null, shoulderBp = null } = {}) {
  const alternatives = {};
  let chosen = null;
  const lacrimal = { left: findByName(fullbody, EYE_SOURCE_NAME_RE.left), right: findByName(fullbody, EYE_SOURCE_NAME_RE.right) };
  if (lacrimal.left.length && lacrimal.right.length) {
    const st = [...lacrimal.left, ...lacrimal.right].map(x => meshStats(x.positions));
    const L = meshStats(lacrimal.left[0].positions), R = meshStats(lacrimal.right[0].positions);
    const eye = [0.5 * (L.centroid[0] + R.centroid[0]), Math.min(...st.map(s => s.lo[1])) + EYE_BEHIND_LACRIMAL_MM,
      0.5 * (0.5 * (L.lo[2] + L.hi[2]) + 0.5 * (R.lo[2] + R.hi[2]))];
    alternatives.skull_orbits = eye;
    chosen = chosen || { eyeBp: eye, source: 'skull_orbits', uncertaintyMm: 10,
      detail: `lacrimal bones ${lacrimal.left[0].id} + ${lacrimal.right[0].id}: midline x, orbit mid-height z, anterior lacrimal edge + ${EYE_BEHIND_LACRIMAL_MM} mm` };
  }
  if (brain instanceof Map && brain.size) {
    let yMin = Infinity, xLo = Infinity, xHi = -Infinity;
    const arrays = [];
    for (const [id] of brain) { const p = positionsOf(brain, id); if (p) arrays.push(p); }
    for (const p of arrays) for (let i = 0; i + 2 < p.length; i += 3) { if (p[i + 1] < yMin) yMin = p[i + 1]; if (p[i] < xLo) xLo = p[i]; if (p[i] > xHi) xHi = p[i]; }
    let zOrb = Infinity;
    for (const p of arrays) for (let i = 0; i + 2 < p.length; i += 3) { const dy = p[i + 1] - yMin; if (dy >= 10 && dy <= 40 && p[i + 2] < zOrb) zOrb = p[i + 2]; }
    if (Number.isFinite(yMin) && Number.isFinite(zOrb)) {
      const eye = [0.5 * (xLo + xHi), yMin + EYE_BEHIND_FRONTAL_POLE_MM, zOrb - EYE_BELOW_ORBITAL_SURFACE_MM];
      alternatives.brain = eye;
      chosen = chosen || { eyeBp: eye, source: 'brain', uncertaintyMm: 15,
        detail: `frontal pole y ${yMin.toFixed(1)}, orbital brain surface z ${zOrb.toFixed(1)} - ${EYE_BELOW_ORBITAL_SURFACE_MM} mm` };
    }
  }
  if (isVec3(shoulderBp ? Array.from(shoulderBp) : null)) {
    const eye = [shoulderBp[0] + EYE_FROM_LEFT_SHOULDER_MM[0], shoulderBp[1] + EYE_FROM_LEFT_SHOULDER_MM[1], shoulderBp[2] + EYE_FROM_LEFT_SHOULDER_MM[2]];
    alternatives.anthropometric = eye;
    chosen = chosen || { eyeBp: eye, source: 'anthropometric', uncertaintyMm: 25, detail: 'left glenohumeral centre + EYE_FROM_LEFT_SHOULDER_MM' };
  }
  if (!chosen) fail('asset_args', 'eyePosition needs full-body skull bones, brain meshes or shoulderBp');
  return Object.freeze({ ...chosen, eyeBp: Object.freeze(chosen.eyeBp), alternatives: Object.freeze(alternatives),
    note: 'Display estimate of the first-person eye from head anatomy; not a measured eye position.' });
}
