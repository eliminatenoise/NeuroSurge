/** NeuroSurge scene: bounded Wavefront OBJ parser (browser and Node, dependency-free).
 *
 * Reads only what the scene needs:
 *   - `v x y z` vertex positions (any extra components, such as w, are ignored);
 *   - `f a b c [d ...]` polygon faces; slash forms `a/b`, `a//c` and `a/b/c` take the first
 *     (position) index; polygons are fan-triangulated as (a, b, c), (a, c, d), ...
 * Coordinates are kept exactly as authored (BodyParts3D source millimetres). This parser never
 * centres, mirrors or rescales geometry; transforms are applied to whole groups elsewhere.
 * `#` comments are retained (the first MAX_COMMENTS, full-line and inline), so the legacy licence
 * header of each source file travels with the parsed mesh.
 *
 * Refusals throw Error('ns:<code>: message') with a stable code:
 *   ns:obj_input  - text is not a string, or a limit option is not a positive safe integer
 *   ns:obj_limit  - UTF-8 byte length, vertex count or triangle count exceeds its limit
 *   ns:obj_number - a vertex coordinate is missing, is not a plain decimal number, or is not
 *                   finite (including values that overflow 32-bit float storage)
 *   ns:obj_index  - a face index is malformed or 0, or is out of range; negative indices are
 *                   resolved relative to the vertices defined so far (OBJ rule: -1 is the most
 *                   recently defined vertex); positive indices are checked against the final count
 *   ns:obj_face   - a face has fewer than 3 vertex references
 *   ns:obj_syntax - a statement keyword that is not a known OBJ statement
 *   ns:obj_empty  - no vertices or no faces
 */

const MIB = 1024 * 1024;

/** Default bounds; callers may pass larger positive integers per asset class. */
export const OBJ_LIMITS = Object.freeze({ maxBytes: 8 * MIB, maxVertices: 200000, maxFaces: 400000 });

/** Maximum number of comment lines retained per file. */
export const MAX_COMMENTS = 64;

/** Statements that are recognised and deliberately ignored (never executed or followed). */
const IGNORED = new Set([
  // Listed in DESIGN.md.
  'vn', 'vt', 'g', 'o', 's', 'usemtl', 'mtllib',
  // Other standard Wavefront OBJ statements that carry nothing this scene renders.
  'vp', 'l', 'p', 'cstype', 'deg', 'bmat', 'step', 'curv', 'curv2', 'surf', 'parm', 'trim',
  'hole', 'scrv', 'sp', 'end', 'con', 'mg', 'bevel', 'c_interp', 'd_interp', 'lod',
  'shadow_obj', 'trace_obj', 'ctech', 'stech', 'maplib', 'usemap', 'call', 'csh'
]);

/** Plain decimal number: optional sign, digits with optional fraction (or a leading-dot fraction), optional exponent. */
const NUMBER_RE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
/** Face vertex reference: v, v/vt, v//vn or v/vt/vn; only v is used. */
const FACE_TOKEN_RE = /^(-?\d+)(?:\/(?:-?\d+)?){0,2}$/;
const WS_RE = /\s+/;
const LINE_RE = /\r\n|\n|\r/;

function fail(code, message) {
  throw new Error(`ns:${code}: ${message}`);
}

/** Quote a token for an error message: at most 32 code units, non-printable-ASCII escaped as \uXXXX. */
function show(token) {
  const cut = token.length > 32 ? token.slice(0, 32) + '...' : token;
  return '"' + cut.replace(/[^\x20-\x7e]/g, ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')) + '"';
}

function requireLimit(name, value) {
  if (!Number.isSafeInteger(value) || value <= 0) fail('obj_input', `${name} must be a positive integer`);
}

/** UTF-8 byte length of a JS string (lone surrogates count as U+FFFD, 3 bytes, as TextEncoder does).
 * Stops counting early once the count exceeds stopAbove. */
export function utf8ByteLength(text, stopAbove = Infinity) {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { n += 4; i++; } else n += 3;
    } else n += 3;
    if (n > stopAbove) return n;
  }
  return n;
}

/**
 * Parse OBJ text into triangle geometry.
 * @returns {{ positions: Float32Array, indices: Uint32Array, vertexCount: number, faceCount: number,
 *   polygonCount: number, bounds: { min: number[], max: number[] }, comments: string[] }}
 *   positions has 3*vertexCount entries; indices has 3*faceCount zero-based entries, where faceCount
 *   is the number of triangles after fan triangulation; polygonCount is the number of `f` statements.
 *   bounds are taken over the stored (32-bit) positions, so they contain every stored vertex.
 *   comments are the retained `#` texts with the leading `#` removed and surrounding whitespace trimmed.
 */
export function parseObj(text, { maxBytes = OBJ_LIMITS.maxBytes, maxVertices = OBJ_LIMITS.maxVertices, maxFaces = OBJ_LIMITS.maxFaces } = {}) {
  if (typeof text !== 'string') fail('obj_input', 'OBJ text must be a string');
  requireLimit('maxBytes', maxBytes);
  requireLimit('maxVertices', maxVertices);
  requireLimit('maxFaces', maxFaces);
  // Every UTF-16 code unit encodes to at least one UTF-8 byte, so the length test bounds work first.
  if (text.length > maxBytes || utf8ByteLength(text, maxBytes) > maxBytes) {
    fail('obj_limit', `OBJ text exceeds maxBytes (${maxBytes} UTF-8 bytes)`);
  }

  const coords = [];
  const tris = [];
  const comments = [];
  const keepComment = s => { if (comments.length < MAX_COMMENTS) comments.push(s.trim()); };
  let vertexCount = 0;
  let faceCount = 0;
  let polygonCount = 0;
  let maxPositive = 0;
  let maxPositiveLine = 0;

  const lines = text.split(LINE_RE);
  for (let li = 0; li < lines.length; li++) {
    // trim() also removes a leading U+FEFF byte-order mark.
    const line = lines[li].trim();
    if (line === '') continue;
    const lineNo = li + 1;
    if (line.charCodeAt(0) === 0x23) { keepComment(line.slice(1)); continue; }

    const kwEnd = line.search(WS_RE);
    const keyword = kwEnd < 0 ? line : line.slice(0, kwEnd);
    if (keyword !== 'v' && keyword !== 'f') {
      if (IGNORED.has(keyword)) continue;
      fail('obj_syntax', `line ${lineNo}: unsupported statement ${show(keyword)}`);
    }

    let body = kwEnd < 0 ? '' : line.slice(kwEnd);
    const hashAt = body.indexOf('#');
    if (hashAt >= 0) { keepComment(body.slice(hashAt + 1)); body = body.slice(0, hashAt); }
    body = body.trim();
    const args = body === '' ? [] : body.split(WS_RE);

    if (keyword === 'v') {
      if (args.length < 3) fail('obj_number', `line ${lineNo}: vertex needs x y z coordinates`);
      if (vertexCount >= maxVertices) fail('obj_limit', `more than maxVertices (${maxVertices}) vertices`);
      for (let k = 0; k < 3; k++) {
        const t = args[k];
        const value = NUMBER_RE.test(t) ? Number(t) : NaN;
        if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value))) {
          fail('obj_number', `line ${lineNo}: coordinate ${show(t)} is not a finite decimal number`);
        }
        coords.push(value);
      }
      vertexCount++;
    } else {
      const n = args.length;
      if (n < 3) fail('obj_face', `line ${lineNo}: face has ${n} vertex reference(s); at least 3 are required`);
      if (faceCount + (n - 2) > maxFaces) fail('obj_limit', `more than maxFaces (${maxFaces}) triangles`);
      const refs = new Array(n);
      for (let k = 0; k < n; k++) {
        const t = args[k];
        const m = FACE_TOKEN_RE.exec(t);
        const r = m ? Number(m[1]) : NaN;
        if (!Number.isSafeInteger(r) || r === 0) {
          fail('obj_index', `line ${lineNo}: vertex reference ${show(t)} is not a nonzero integer index`);
        }
        if (r > 0) {
          if (r > maxPositive) { maxPositive = r; maxPositiveLine = lineNo; }
          refs[k] = r - 1;
        } else {
          const zeroBased = vertexCount + r;
          if (zeroBased < 0) {
            fail('obj_index', `line ${lineNo}: relative index ${r} reaches before the first vertex (${vertexCount} defined so far)`);
          }
          refs[k] = zeroBased;
        }
      }
      for (let k = 1; k + 1 < n; k++) tris.push(refs[0], refs[k], refs[k + 1]);
      faceCount += n - 2;
      polygonCount++;
    }
  }

  if (maxPositive > vertexCount) {
    fail('obj_index', `line ${maxPositiveLine}: index ${maxPositive} exceeds the vertex count (${vertexCount})`);
  }
  if (vertexCount === 0 || faceCount === 0) {
    fail('obj_empty', `OBJ has ${vertexCount} vertices and ${faceCount} faces; both must be nonzero`);
  }

  const positions = new Float32Array(coords);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const value = positions[i + k];
      if (value < min[k]) min[k] = value;
      if (value > max[k]) max[k] = value;
    }
  }

  return {
    positions,
    indices: new Uint32Array(tris),
    vertexCount,
    faceCount,
    polygonCount,
    bounds: { min, max },
    comments
  };
}
