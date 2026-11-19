/** The loading picture from the start of the load (20 November 2026; the owner: "Currently, I can't see the models being
 * built on the loading page, which they should be there"). The picture is started by the page's first small script and
 * fed from the packs as they arrive, placed by a table made beforehand from the manifests (ns-assembly-parts); the
 * launcher takes the same picture over, and nothing is drawn twice. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assemblyPartsOfManifest, assemblyPartsTable, startAssembly, ASSEMBLY_PART_MANIFESTS, ASSEMBLY_EXPECTED_FILES } from '../scene/src/ns-assembly.mjs';
import { ASSEMBLY_PARTS_COUNT } from '../scene/src/ns-assembly-parts.mjs';
import { ASSEMBLY_TIERS } from '../scene/src/ns-assembly-order.mjs';
import { startPackLoader } from '../scene/src/ns-pack-loader.mjs';
import { bodyMuscleLayer } from '../scene/src/ns-body.mjs';
import { buildAssemblyPartsSource } from '../tools/build-assembly-parts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const TABLE = assemblyPartsTable();
const INDEX = readJson('packs/PACK-INDEX.json');

test('the table of parts is what the tool makes from the manifests and ns-body today (run tools/build-assembly-parts.mjs when they change)', () => {
  assert.equal(fs.readFileSync(path.join(root, 'scene/src/ns-assembly-parts.mjs'), 'utf8'), buildAssemblyPartsSource());
  assert.equal(TABLE.size, ASSEMBLY_PARTS_COUNT);
  assert.equal(TABLE.size, ASSEMBLY_EXPECTED_FILES, 'every file the game waits for');
});

test('the table places every mesh of the start packs exactly as the manifests and the game\'s muscle layers do', () => {
  const byId = new Map(ASSEMBLY_PART_MANIFESTS.flatMap(rel => [...assemblyPartsOfManifest(readJson(rel), bodyMuscleLayer)]));
  const packets = new Set();
  for (const rel of ASSEMBLY_PART_MANIFESTS) { const m = readJson(rel); for (const e of m.assets) packets.add(e.source_packet || m.packet); }
  let n = 0;
  for (const p of INDEX.packs) for (const key of p.keys) {
    const packet = key.split('/')[0];
    if (!packets.has(packet)) continue; // (a packet that is not in the table is drawn from its manifest, later)
    const t = TABLE.get(key), m = byId.get(key.replace(/^.*\/|\.obj$/g, ''));
    assert.ok(t && m, `${key} is in the table and a manifest`);
    assert.equal(t.kind, m.kind, key); assert.equal(t.track, m.track, key); assert.equal(t.tier, m.tier, key);
    assert.ok(Math.abs(t.frac - m.frac) <= 5e-5, `${key}: frac ${t.frac} for ${m.frac}`);
    if (t.track === 'brain') assert.equal(t.name, m.name, `${key}: a brain part keeps its name (it says which half)`);
    n++;
  }
  assert.equal(n, ASSEMBLY_EXPECTED_FILES);
  const counts = { body: ASSEMBLY_TIERS.body.map(() => 0), brain: ASSEMBLY_TIERS.brain.map(() => 0) };
  for (const t of TABLE.values()) counts[t.track][t.tier]++;
  assert.ok(counts.body.every(c => c > 0) && counts.brain.slice(0, -1).every(c => c > 0), 'every tier but the arteries (they come after ready) has parts');
});

function fixture({ reducedMotion = false } = {}) {
  const workers = [];
  class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.attributes = new Map(); this.classList = new Set(); if (tag === 'canvas') this.transferControlToOffscreen = () => new ArrayBuffer(0); }
    append(...c) { for (const x of c) this.appendChild(x); }
    appendChild(c) { c.parent = this; this.children.push(c); }
    setAttribute(k, v) { this.attributes.set(k, v); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  }
  const host = new Element('main'), doc = { createElement: tag => new Element(tag) };
  const win = { matchMedia: () => ({ matches: reducedMotion }), innerWidth: 1024, innerHeight: 768, performance: { now: () => 5 }, addEventListener() {}, removeEventListener() {}, setTimeout() {},
    Worker: class { constructor() { this.messages = []; workers.push(this); } postMessage(m, transfer) { this.messages.push(structuredClone(m, { transfer })); } terminate() {} } };
  return { host, doc, win, workers };
}
const mesh = (n = 3) => ({ positions: new Float32Array(3 * n).map((_, i) => i), indices: new Uint32Array([0, 1, 2]) });
const keys = [...TABLE.keys()];

test('one picture for the page: the first script starts it, the launcher takes the same one over; after it finishes a new one may start', () => {
  const f = fixture();
  const a = startAssembly({ host: f.host, doc: f.doc, win: f.win, shared: true });
  const b = startAssembly({ host: f.host, doc: f.doc, win: f.win, shared: true, room: { fovYDeg: 54, pitchDeg: -25.5 } });
  assert.equal(a, b, 'the launcher gets the picture already on the page');
  assert.equal(f.workers.length, 1, 'one worker, one canvas');
  assert.equal(f.host.children.length, 1);
  assert.deepEqual(f.workers[0].messages.at(-1), { type: 'room', room: { fovYDeg: 54, pitchDeg: -25.5 } }, 'the game\'s first view is passed on');
  // the table's parts are known from the start: the tiers wait for exactly the files the game waits for
  const known = f.workers[0].messages.find(m => m.type === 'known');
  assert.equal(known.counts.body.reduce((x, y) => x + y, 0) + known.counts.brain.reduce((x, y) => x + y, 0), ASSEMBLY_EXPECTED_FILES);
  a.finish({ immediate: true });
  const c = startAssembly({ host: f.host, doc: f.doc, win: f.win, shared: true });
  assert.notEqual(c, a, 'a finished picture is not handed out again');
  c.finish({ immediate: true });
  const d = startAssembly({ host: f.host, doc: f.doc, win: f.win }), e = startAssembly({ host: f.host, doc: f.doc, win: f.win });
  assert.notEqual(d, e, 'without shared, each call is its own picture');
  d.finish({ immediate: true }); e.finish({ immediate: true });
});

test('a pack\'s meshes are drawn as it arrives (one message, copies), placed by the table; the launcher\'s later hand-over does not draw them twice', () => {
  const f = fixture();
  const a = startAssembly({ host: f.host, doc: f.doc, win: f.win });
  const w = f.workers[0];
  const known = mesh(), unknown = mesh();
  const base = w.messages.length;
  a.notePack([{ key: keys[0], mesh: known }, { key: keys[1], mesh: mesh() }, { key: 'some-new-packet/meshes/X1.obj', mesh: unknown }]);
  const batch = w.messages.slice(base);
  assert.deepEqual(batch.map(m => m.type), ['meshes', 'progress']);
  assert.equal(batch[0].list.length, 2, 'a mesh the table does not know is left for the launcher (it brings its manifest)');
  const t0 = TABLE.get(keys[0]);
  assert.deepEqual({ kind: batch[0].list[0].kind, track: batch[0].list[0].place.track, tier: batch[0].list[0].place.tier, frac: batch[0].list[0].place.frac }, { kind: t0.kind, track: t0.track, tier: t0.tier, frac: t0.frac });
  assert.deepEqual(Array.from(new Float32Array(batch[0].list[0].positions)), Array.from(known.positions));
  assert.equal(known.positions.length, 9, 'the game\'s own arrays stay as they were (the picture has copies)');
  // the launcher hands the same meshes over when the game takes them: nothing more is drawn
  const before = w.messages.length;
  a.noteMesh(`../../packets/${keys[0]}`, known);
  a.noteBytes(`../../packets/${keys[1]}`, new Uint8Array([118, 32]));
  assert.equal(w.messages.length, before, 'each file is drawn once');
  assert.equal(a.state().again, 2);
  // the one the table did not know comes with the launcher, placed from its manifest and the game's own muscle layer
  a.useMuscleLayer(id => (id === 'X1' ? 'deep' : 'unclassified'));
  a.noteManifest('../../packets/some-new-packet/NEW-MANIFEST.json', JSON.stringify({ packet: 'some-new-packet', assets: [{ element_id: 'X1', path: 'meshes/X1.obj', kind: 'muscle', groups: ['torso_muscle'], bounds_min: [0, -40, 1000], bounds_max: [20, -20, 1100] }] }));
  a.noteMesh('../../packets/some-new-packet/meshes/X1.obj', unknown);
  const late = w.messages.slice(before);
  assert.deepEqual(late.map(m => m.type), ['known', 'mesh', 'progress']);
  assert.equal(late[1].kind, 'muscle');
  assert.equal(ASSEMBLY_TIERS.body[late[1].place.tier], 'deep muscles', 'the launcher\'s muscle layer is used for a manifest the table does not cover');
  assert.equal(a.state().drawn, 3);
  assert.equal(a.state().early, 2);
  a.finish({ immediate: true });
});

test('under reduced motion the packs count on the still bar once each, and nothing is drawn', () => {
  const f = fixture({ reducedMotion: true });
  const a = startAssembly({ host: f.host, doc: f.doc, win: f.win });
  assert.equal(a.state().mode, 'static');
  assert.equal(f.workers.length, 0);
  a.notePack(keys.slice(0, 5).map(key => ({ key, mesh: mesh() })));
  a.noteMesh(`../../packets/${keys[0]}`, mesh());
  const progress = f.host.children[0].children[1];
  assert.equal(progress.value, 5);
  a.finish();
  assert.equal(f.host.children.length, 0);
});

// The real pack loader, on the page (no worker), reading the committed packs, feeding a picture.
function pageWindow() {
  const fetch = async url => new Response(new Uint8Array(fs.readFileSync(path.join(root, 'packs', String(url).split('/').pop()))), { status: 200 });
  return { location: { href: 'http://x/scene/example/preview.html' }, fetch, crypto: { subtle: webcrypto.subtle }, DecompressionStream, Response, Blob, AbortController, setTimeout, clearTimeout };
}
const loaderOn = win => startPackLoader({ win, useWorker: false, moduleUrl: 'http://x/scene/src/ns-pack-loader.mjs', indexUrl: '../../packs/PACK-INDEX.json', base: '../../packs/' });
const settled = async loader => { for (let i = 0; i < 1000; i++) { const s = loader.state(); if (s.index !== 'pending' && Object.keys(s.packs).length && !Object.values(s.packs).some(p => p.status === 'loading')) break; await new Promise(r => setTimeout(r, 10)); } await new Promise(r => setTimeout(r, 10)); };

test('fed from the pack loader: every mesh of every start pack is drawn as its pack arrives, before the game asks for it', async () => {
  const f = fixture();
  const a = startAssembly({ host: f.host, doc: f.doc, win: f.win });
  const loader = loaderOn(pageWindow());
  a.feedFrom(loader); a.feedFrom(loader); // (once, however often it is asked)
  await settled(loader);
  const w = f.workers[0], drawn = w.messages.filter(m => m.type === 'meshes');
  assert.equal(drawn.length, INDEX.packs.length, 'one message per pack');
  assert.equal(drawn.reduce((n, m) => n + m.list.length, 0), ASSEMBLY_EXPECTED_FILES);
  assert.equal(a.state().early, ASSEMBLY_EXPECTED_FILES);
  // the game then takes its meshes, whole and unchanged, and the launcher's hand-over draws nothing more
  const key = INDEX.packs[0].keys[0], got = await loader.get(key);
  assert.ok(got && got.mesh.positions.length > 0 && got.mesh.indices.length > 0);
  const n = w.messages.length;
  a.noteMesh(`../../packets/${key}`, got.mesh);
  assert.equal(w.messages.length, n);
  a.finish({ immediate: true });
});

test('a picture that starts after some packs have come is given those packs at once, less the meshes the game has already taken', async () => {
  const loader = loaderOn(pageWindow());
  await settled(loader);
  const taken = INDEX.packs[0].keys[0];
  assert.ok(await loader.get(taken));
  const f = fixture();
  const a = startAssembly({ host: f.host, doc: f.doc, win: f.win });
  a.feedFrom(loader);
  const drawn = f.workers[0].messages.filter(m => m.type === 'meshes');
  assert.equal(drawn.reduce((s, m) => s + m.list.length, 0), ASSEMBLY_EXPECTED_FILES - 1, 'the taken mesh is left to the launcher, which shows it as it hands it over');
  a.finish({ immediate: true });
});
