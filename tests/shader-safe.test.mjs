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
import {
  patchGlassShaders, patchGlassReadShaders, patchGlowRimShaders, createHdrBloom, HDR_BLOOM,
  patchMuscleLookShaders, patchPowerUpShaders, patchComicShaders, patchBehindGlassShaders, patchMuscleShareShaders, MUSCLE_SHARE
} from '../scene/src/ns-scene-three.mjs';
import * as THREE from '../vendor/three.module.js';

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

// R558 (performance): one material per class of muscle. The rewrite must apply to the REAL patch chains (the ones
// createScene composes for your own muscles and for the mirror's), change nothing but the seven declarations and the
// two lines it adds, and refuse (null: the caller keeps one material per muscle) whenever it cannot be sure.
test('the one-material-per-class rewrite moves a muscle\'s seven values from uniforms to per-mesh attributes, and nothing else', () => {
  const lib = THREE.ShaderLib.physical;
  const count = (s, t) => s.split(t).length - 1;
  const chain = steps => {
    let v = lib.vertexShader, f = lib.fragmentShader;
    for (const fn of steps) {
      const p = fn(v, f);
      assert.ok(p, 'every patch of the chain applies');
      if (p.vertexShader) v = p.vertexShader;
      if (p.fragmentShader) f = p.fragmentShader;
    }
    return { v, f };
  };
  const power = (v, f) => patchPowerUpShaders(v, f, 'muscle'), comic = (v, f) => patchComicShaders(v, f, 'muscle');
  const own = chain([patchGlowRimShaders, patchMuscleLookShaders, power, comic]);
  const mirror = chain([patchGlowRimShaders, patchBehindGlassShaders, patchMuscleLookShaders, power, comic]);
  assert.equal(MUSCLE_SHARE.uniforms.length, 7);
  assert.equal(MUSCLE_SHARE.rowFloats, 24); // a mat4 and two vec4
  for (const [c, set] of [[own, 'o'], [mirror, 'm'], [own, 'p']]) {
    const p = patchMuscleShareShaders(c.v, c.f, set);
    assert.ok(p && typeof p.vertexShader === 'string' && typeof p.fragmentShader === 'string');
    for (const d of MUSCLE_SHARE.uniforms) {
      assert.equal(count(c.f, `uniform ${d};`), 1, `the chain declares ${d} once`);
      assert.equal(count(p.fragmentShader, `uniform ${d};`), 0);
      assert.equal(count(c.f, `\n${d};`), 0);
      assert.equal(count(p.fragmentShader, `\n${d};`), 1, `${d} is a plain global now`);
    }
    assert.ok(p.vertexShader.startsWith(`attribute mat4 nsS${set}A;\nattribute vec4 nsS${set}B;\nattribute vec4 nsS${set}C;\n`));
    for (let i = 0; i < 6; i++) for (const s of [p.vertexShader, p.fragmentShader]) assert.equal(count(s, `flat varying vec4 vNsS${i};`), 1);
    // 18 November (MAP): the shudder (patchShudderVertex) reads the charge in the vertex shader too: the same row fills it.
    assert.ok(c.v.includes('uniform vec4 nsCharge;') && c.v.includes('nsShudder('), 'the chain carries the shudder');
    assert.ok(p.vertexShader.includes(`void main() {\n\tvNsS0 = nsS${set}A[ 0 ]; vNsS1 = nsS${set}A[ 1 ]; vNsS2 = nsS${set}A[ 2 ]; vNsS3 = nsS${set}A[ 3 ]; vNsS4 = nsS${set}B; vNsS5 = nsS${set}C; nsCharge = nsS${set}A[ 3 ];\n`));
    assert.ok(p.fragmentShader.includes('void main() {\n\tdiffuse = vNsS0.rgb; emissive = vNsS1.rgb; nsSweep = vec2( vNsS0.a, vNsS1.a ); nsGlowRim = vNsS2; nsCharge = vNsS3; nsChargeRest = vNsS4.rgb; nsFibre = vNsS5;\n'));
    for (const other of 'omp') if (other !== set) assert.ok(!p.vertexShader.includes(`nsS${other}A`));
    // take the added lines away again: the vertex shader is the chain's, the fragment shader differs only in the seven declarations
    assert.equal(p.vertexShader.split('\n').filter(l => !/vNsS[0-5]|nsS[a-z][ABC]/.test(l)).join('\n').replace('\nvec4 nsCharge;', '\nuniform vec4 nsCharge;').replace(/^vec4 nsCharge;/, 'uniform vec4 nsCharge;'), c.v);
    assert.equal(p.fragmentShader.split('\n').filter(l => !/vNsS[0-5]/.test(l)).join('\n'), MUSCLE_SHARE.uniforms.reduce((s, d) => s.replace(`uniform ${d};`, `${d};`), c.f));
    assert.ok(!(p.vertexShader + p.fragmentShader).includes('undefined') && !(p.vertexShader + p.fragmentShader).includes('NaN'));
    // refusals
    assert.equal(patchMuscleShareShaders(p.vertexShader, p.fragmentShader, set), null, 'not twice');
    assert.equal(patchMuscleShareShaders(p.vertexShader, p.fragmentShader, set === 'o' ? 'm' : 'o'), null, 'not twice under another letter either');
    assert.equal(patchMuscleShareShaders(c.v + '\nvoid main() {}', c.f, set), null, 'two mains (vertex)');
    assert.equal(patchMuscleShareShaders(c.v, c.f + '\nvoid main() {}', set), null, 'two mains (fragment)');
    assert.equal(patchMuscleShareShaders(c.v.replace('void main() {', 'void main(){'), c.f, set), null, 'no main it knows');
    for (const d of MUSCLE_SHARE.uniforms) {
      // 19 November 2026 (the plain look): a look patch that is not applied leaves its uniform out; the rewrite then
      // declares a plain global for the row's value. Only the standard material's own two must be there.
      const gone = patchMuscleShareShaders(c.v, c.f.replace(`uniform ${d};`, ''), set);
      if (/^vec3 (?:diffuse|emissive)$/.test(d)) assert.equal(gone, null, `${d} missing`);
      else assert.ok(gone && gone.fragmentShader.includes(`${d};`) && !gone.fragmentShader.includes(`uniform ${d};`), `${d} left out: a plain global`);
      assert.equal(patchMuscleShareShaders(c.v, c.f.replace(`uniform ${d};`, `uniform ${d};\nuniform ${d};`), set), null, `${d} doubled`);
    }
    assert.equal(patchMuscleShareShaders(c.v.replace('void main() {', 'uniform vec4 nsFibre;\nvoid main() {'), c.f, set), null, 'the vertex shader reads one of the seven');
  }
  for (const bad of ['O', 'ab', '', '1', 5, null]) assert.equal(patchMuscleShareShaders(own.v, own.f, bad), null);
  assert.ok(patchMuscleShareShaders(own.v, own.f), 'the set letter has a default');
  // 19 November 2026 (the plain look): a plain standard shader is rewritten too (its colour and glow come from the row)
  { const plain = patchMuscleShareShaders(lib.vertexShader, lib.fragmentShader, 'o'); assert.ok(plain && plain.fragmentShader.includes('diffuse = vNsS0.rgb'), 'a plain standard shader takes its colour and glow from the row'); }
  assert.equal(patchMuscleShareShaders(null, own.f, 'o'), null);
  assert.equal(patchMuscleShareShaders(own.v, undefined, 'o'), null);
});
