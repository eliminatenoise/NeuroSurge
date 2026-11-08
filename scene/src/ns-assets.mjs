/** NeuroSurge POV arm scene: asset I/O contract and loader orchestration (browser and Node).
 *
 * MESH-MANIFEST.json (Root's pov-demo-assets) is the only allowlist. No network I/O is built in:
 * callers inject readText(path) and sha256Hex(text). Paths handed to readText are the
 * manifest's relative 'meshes/<element_id>.obj' paths; the caller resolves them against
 * the hosted asset base. Geometry stays in the BodyParts3D source frame (millimetres,
 * +x subject LEFT, +y POSTERIOR, +z SUPERIOR; an inferred right-handed LPS frame).
 * Nothing here centres, mirrors, rotates or rescales an individual component.
 * See ASSET-IO-CONTRACT.md for the full contract.
 */
import { parseObj } from './ns-obj.mjs';
import { sub, dot, length, scale, reject } from './ns-math.mjs';
import { CAP_FRACTION, SHOULDER_CAP_MM, ELBOW_CAP_MM } from './ns-rig.mjs';

const fail = (code, message) => { throw new Error(`ns:${code}: ${message}`); };
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isVec3 = v => Array.isArray(v) && v.length === 3 && v.every(x => Number.isFinite(x));

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
export const ATTRIBUTION_CHANGES = 'Changes: a subset of meshes was selected, and the meshes are posed rigidly and tinted at run time; the OBJ files themselves are unmodified.';

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

/** UTF-8 byte length of a JS string (lone surrogates count as U+FFFD, 3 bytes, as encoders emit). */
export function utf8ByteLength(text) {
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
 * Returns { arm: Map(id -> {entry, mesh}), brain: Map(id -> {entry, mesh}), excluded }. */
export async function loadAssets({ manifest, readText, sha256Hex, parse = parseObj } = {}) {
  if (typeof readText !== 'function') fail('asset_args', 'readText(path) must be injected');
  if (typeof sha256Hex !== 'function') fail('asset_args', 'sha256Hex(text) must be injected');
  if (typeof parse !== 'function') fail('asset_args', 'parse(text) must be a function');
  const v = validateInternal(manifest);
  const arm = new Map(), brain = new Map();
  for (const { set, entry } of v.order) {
    const id = entry.element_id;
    let text;
    try {
      text = await readText(entry.path, entry);
    } catch (err) {
      fail('asset_read', `${id}: ${err && err.message ? err.message : String(err)}`);
    }
    if (typeof text !== 'string') fail('asset_read', `${id}: readText must return a string`);
    const bytes = utf8ByteLength(text);
    if (bytes !== entry.bytes) fail('asset_bytes', `${id}: ${bytes} UTF-8 bytes, manifest says ${entry.bytes}`);
    const hex = await sha256Hex(text);
    if (typeof hex !== 'string' || hex.toLowerCase() !== entry.sha256) fail('asset_hash', `${id}: sha256 does not match the manifest`);
    const mesh = await parse(text);
    checkParsed(set, entry, mesh);
    (set === 'arm' ? arm : brain).set(id, Object.freeze({ entry, mesh }));
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

/**
 * Load the OPTIONAL full-body group. It never throws and never blocks the arm game: call it after the arm scene is up
 * and add whatever it returns. With no manifest (null/undefined, e.g. the file is absent) it resolves to
 * { status: 'absent' } at once. Every file is checked exactly like the arm (UTF-8 byte count, then sha256, then parse,
 * then vertex count and laterality from the parsed geometry); a file that fails is never used and is listed in
 * `failed`. allOrNothing: true drops the whole group when any file fails ('rejected').
 * @returns Promise<{ status: 'absent' | 'invalid' | 'complete' | 'partial' | 'rejected', meshes: Map(id -> {entry, mesh}),
 *   failed: [{ id, code, message }], counts, error }>
 */
export async function loadFullbodyAssets({
  manifest, readText, sha256Hex, parse = parseObj, concurrency = FULLBODY_DEFAULT_CONCURRENCY, excludeIds = [],
  allOrNothing = false, onProgress = null
} = {}) {
  if (manifest === null || manifest === undefined) return ABSENT();
  const invalid = err => Object.freeze({ status: 'invalid', meshes: new Map(), failed: Object.freeze([]), counts: null, error: String(err && err.message ? err.message : err) });
  if (typeof readText !== 'function' || typeof sha256Hex !== 'function' || typeof parse !== 'function') return invalid('readText, sha256Hex and parse must be functions');
  let v;
  try { v = validateFullbodyManifest(manifest, { excludeIds }); } catch (err) { return invalid(err); }
  const limit = Number.isInteger(concurrency) && concurrency > 0 ? Math.min(concurrency, 16) : FULLBODY_DEFAULT_CONCURRENCY;
  const failed = [];
  let done = 0;
  const results = await mapBounded(v.entries, limit, async entry => {
    const id = entry.element_id;
    try {
      const text = await readText(entry.path, entry);
      if (typeof text !== 'string') fail('asset_read', `${id}: readText must return a string`);
      const bytes = utf8ByteLength(text);
      if (bytes !== entry.bytes) fail('asset_bytes', `${id}: ${bytes} UTF-8 bytes, manifest says ${entry.bytes}`);
      const hex = await sha256Hex(text);
      if (typeof hex !== 'string' || hex.toLowerCase() !== entry.sha256) fail('asset_hash', `${id}: sha256 does not match the manifest`);
      const mesh = await parse(text);
      const p = mesh && mesh.positions;
      if (!p || typeof p.length !== 'number' || p.length === 0 || p.length % 3 !== 0) fail('asset_parse', `${id}: parser returned no vertex positions`);
      if (typeof entry.vertices === 'number' && p.length / 3 !== entry.vertices) fail('asset_vertices', `${id}: parsed ${p.length / 3} vertices, manifest says ${entry.vertices}`);
      let sx = 0;
      for (let i = 0; i < p.length; i += 3) { if (!Number.isFinite(p[i]) || !Number.isFinite(p[i + 1]) || !Number.isFinite(p[i + 2])) fail('asset_parse', `${id}: non-finite vertex`); sx += p[i]; }
      checkSide(id, entry.laterality, sx / (p.length / 3), 'parsed centroid');
      return Object.freeze({ entry, mesh });
    } catch (err) {
      const message = String(err && err.message ? err.message : err);
      const m = /^ns:([a-z_]+):/.exec(message);
      failed.push(Object.freeze({ id, code: m ? m[1] : 'asset_read', message: message.slice(0, 300) }));
      return null;
    } finally {
      done++;
      if (typeof onProgress === 'function') { try { onProgress({ done, total: v.entries.length }); } catch { /* progress is advisory */ } }
    }
  });
  const meshes = new Map();
  for (const r of results) if (r) meshes.set(r.entry.element_id, r);
  failed.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (allOrNothing && failed.length) {
    return Object.freeze({ status: 'rejected', meshes: new Map(), failed: Object.freeze(failed), counts: v.counts, error: `${failed.length} full-body file(s) failed verification` });
  }
  return Object.freeze({ status: failed.length ? 'partial' : 'complete', meshes, failed: Object.freeze(failed), counts: v.counts, error: null });
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

function findByName(map, re) {
  if (!(map instanceof Map)) return [];
  const out = [];
  for (const [id, v] of map) {
    const e = v && v.entry ? v.entry : {};
    const names = [e.name, e.concept, e.embedded_source_name, ...(Array.isArray(e.concepts) ? e.concepts.map(c => c && c.en) : [])].filter(s => typeof s === 'string');
    if (names.some(s => re.test(s))) out.push({ id, positions: positionsOf(map, id) });
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
  const lacrimal = { left: findByName(fullbody, /\bleft lacrimal bone\b/i), right: findByName(fullbody, /\bright lacrimal bone\b/i) };
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
