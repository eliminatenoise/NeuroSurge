/**
 * Shader terms that must never give "not a number" (ns-scene-three).
 *
 * The glass rim and the glow rim take the power of 1 - |N.V|. Rounding can put that a hair below zero where a surface
 * faces the eye exactly, and the power of a negative number is undefined in a shader. One such pixel in the
 * high-dynamic-range picture was spread by the bloom's blur chain into a white square about 280 px across (found
 * 12 November, at one exact look). Two things now stop it: each rim term is kept at or above zero, and the bloom's
 * first pass reads the picture clamped and drops a value that is not a number.
 *
 * These are checks on the shader text the pure patch functions return and on the bloom built with a stand-in for
 * three.js. Nothing is drawn, so they cannot show what a graphics driver does with the text.
 *
 * Run: node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { patchGlassShaders, patchGlassReadShaders, patchGlowRimShaders, createHdrBloom, HDR_BLOOM } from '../scene/src/ns-scene-three.mjs';

const VERTEX = 'void main() {\n#include <project_vertex>\n}';
const FRAGMENT = 'void main() {\nvec3 outgoingLight = vec3( 0.0 );\nvec3 totalEmissiveRadiance = vec3( 0.0 );\nvec3 vViewPosition;\n' +
  '#include <lights_fragment_begin>\n#include <opaque_fragment>\n}';

/** The first argument of every pow( ... ) call in a shader text. */
function powBases(src) {
  const out = [];
  let at = 0;
  for (;;) {
    const i = src.indexOf('pow(', at);
    if (i < 0) return out;
    let depth = 0, j = i + 4;
    for (; j < src.length; j++) {
      const ch = src[j];
      if (ch === '(') depth++;
      else if (ch === ')') { if (depth === 0) break; depth--; }
      else if (ch === ',' && depth === 0) break;
    }
    out.push(src.slice(i + 4, j).trim());
    at = j;
  }
}
/** A base that cannot be negative: clamped at zero where it is written, or a name that is clamped where it is set. */
const safeBase = (base, src) => /^(max|saturate|clamp)\(/.test(base) ||
  (/^[A-Za-z_]\w*$/.test(base) && new RegExp(`float ${base} = (max|saturate|clamp)\\(`).test(src));

test('the x-ray glass rim never takes the power of a negative number', () => {
  const p = patchGlassShaders(VERTEX, FRAGMENT);
  assert.ok(p, 'the patch applies to a shader with the hooks');
  assert.ok(p.fragmentShader.includes('pow( max( 1.0 - nsFacing, 0.0 ), nsRimPower )'));
  const bases = powBases(p.fragmentShader);
  assert.equal(bases.length, 1);
  for (const b of bases) assert.ok(safeBase(b, p.fragmentShader), `pow base "${b}"`);
});

test('the glass shell rim and its ink never take the power of a negative number', () => {
  const p = patchGlassReadShaders(VERTEX, FRAGMENT);
  assert.ok(p, 'the patch applies to a shader with the hooks');
  assert.ok(p.fragmentShader.includes('pow( max( 1.0 - nsFacing, 0.0 ), nsRimPower )'));
  const bases = powBases(p.fragmentShader);
  assert.ok(bases.length >= 2, 'the rim term and the highlight');
  for (const b of bases) assert.ok(safeBase(b, p.fragmentShader), `pow base "${b}"`);
});

test('the glow rim never takes the power of a negative number', () => {
  const p = patchGlowRimShaders(VERTEX, FRAGMENT);
  assert.ok(p, 'the patch applies to a shader with the hooks');
  const bases = powBases(p.fragmentShader);
  assert.deepEqual(bases, ['nsGf']);
  assert.ok(safeBase('nsGf', p.fragmentShader), 'nsGf is clamped at zero where it is set');
});

test('the checker itself tells a bare 1 - x from a clamped one', () => {
  assert.deepEqual(powBases('a = pow( 1.0 - f, p ); b = pow( max( dot( n, h ), 0.0 ), q );'), ['1.0 - f', 'max( dot( n, h ), 0.0 )']);
  assert.equal(safeBase('1.0 - f', ''), false);
  assert.equal(safeBase('max( dot( n, h ), 0.0 )', ''), true);
  assert.equal(safeBase('g', 'float g = 1.0 - abs( d );'), false);
  assert.equal(safeBase('g', 'float g = max( 1.0 - abs( d ), 0.0 );'), true);
});

test('the bloom reads the picture clamped and drops what is not a number', () => {
  const made = [];
  class Target { constructor(w, h, o) { this.width = w; this.height = h; this.options = o; this.texture = {}; } setSize(w, h) { this.width = w; this.height = h; } dispose() {} }
  class Material { constructor(p) { Object.assign(this, p); made.push(this); } dispose() {} }
  class Vector2 { constructor(x, y) { this.x = x; this.y = y; } set(x, y) { this.x = x; this.y = y; return this; } }
  class Geometry { setAttribute() {} dispose() {} }
  class Attribute { constructor(a, n) { this.array = a; this.itemSize = n; } }
  class Mesh { constructor(g, m) { this.geometry = g; this.material = m; } }
  class Scene { add() {} }
  class Camera {}
  const THREE = { WebGLRenderTarget: Target, ShaderMaterial: Material, HalfFloatType: 1016, LinearFilter: 1006, NoBlending: 0, AdditiveBlending: 2,
    SRGBColorSpace: 'srgb', Vector2, BufferGeometry: Geometry, BufferAttribute: Attribute, Mesh, Scene, Camera };
  const renderer = { extensions: { has: () => true }, capabilities: { isWebGL2: true } };
  const bloom = createHdrBloom({ THREE, renderer });
  assert.equal(bloom.state().supported, true);
  const first = made.filter(m => typeof m.fragmentShader === 'string' && m.fragmentShader.includes('vec3 pick('));
  assert.equal(first.length, 1, 'one first pass');
  const src = first[0].fragmentShader;
  const cap = Number.isInteger(HDR_BLOOM.safeMax) ? HDR_BLOOM.safeMax.toFixed(1) : String(HDR_BLOOM.safeMax);
  assert.ok(src.includes(`vec3 c = min( max( texture2D( tSrc, uv ).rgb, 0.0 ), ${cap} );`), 'every value read is clamped to 0..safeMax');
  assert.ok(src.includes(`return b <= ${cap} ? c * w : vec3( 0.0 );`), 'a value that is not a number adds nothing');
  assert.ok(!src.includes('undefined') && !src.includes('NaN'));
  // the cap is far above anything the picture really holds (a flash peaks near 3), so the bloom is unchanged
  assert.ok(Number.isFinite(HDR_BLOOM.safeMax) && HDR_BLOOM.safeMax >= 16 && HDR_BLOOM.safeMax < 60000);
  // only the first pass reads the picture itself; the composite keeps its own clamp to 0..1
  const comp = made.find(m => typeof m.fragmentShader === 'string' && m.fragmentShader.includes('tBase'));
  assert.ok(comp && comp.fragmentShader.includes('vec3 base = min( max( c, 0.0 ), 1.0 );'));
});
