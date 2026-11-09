/** R287 OWNED UNRUN normal-page caller. One App instance; no QA/input/clock/renderer substitution, retry or restart.
 * Root must separately admit opening one exact case URL. Observations are actual normal API readbacks, not pixels.
 * This is a posterior-brain P1F90 engineering reproduction, not a selected default/normal eye/framing solution.
 */
import * as THREE from '../../vendor/three.module.js';
import { start, startFullBodyStream, startFaceStream } from '../src/ns-app.mjs';
import { PAGE } from '../src/ns-text.mjs';
import { DEG } from '../src/ns-math.mjs';

const viewGraph = Object.freeze({ reference: 'posterior-brain-bound', initialLook: Object.freeze({ yaw: 0, pitch: -35 * DEG }), fovYDeg: 90 });
// Initial brain placement is deliberately ABSENT/default0; no raw coordinate or query overrides.
export const CONFIGURED_R287_SIGNATURE = JSON.stringify(viewGraph);
const params = new URLSearchParams(window.location.search);
const mode = params.get('case') || 'boot';
if ([...params.keys()].some(k => k !== 'case') || !['boot', 'stop-during-body', 'missing-face'].includes(mode)) {
  throw new Error('R287 supports only the three declared case URLs; QA/quality/asset/config overrides are not permitted');
}
const app = document.getElementById('ns-app');
const canvas = document.getElementById('ns-canvas');
const hudRoot = document.getElementById('ns-hud');
const shellRoot = document.getElementById('ns-shell-root');
const ownedBodyJobs = [], ownedFaceJobs = [], ownedStreamBindings = [];
const observations = { mode, configurationSignature: CONFIGURED_R287_SIGNATURE, qa: false, placeholder: false,
  bodyFactoryCalls: 0, faceFactoryCalls: 0, bodyProgress: null, bodyProgressAtStop: null, ownedStreams: [], stopIssued: false, stopBefore: null,
  ready: null, firstView: null, firstReadyReadback: null, fatal: null };
let scene = null, bootError = null;
let storage = null;
try { storage = window.localStorage; } catch { storage = null; }
const copy = x => x == null ? null : JSON.parse(JSON.stringify(x));
const requireCase = (condition, message) => { if (!condition) throw new Error('R287 case assertion: ' + message); };
const messageOf = err => err && err.message ? err.message : String(err);
function showFatal(message) {
  const p = document.createElement('p'); p.className = 'ns-fatal'; p.setAttribute('role', 'alert');
  p.textContent = message; hudRoot.appendChild(p);
}
// SAME normal fetch/crypto interfaces: HTTP and actual served bytes are authoritative. No forged digest/model data.
async function fetchText(url) {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}
async function fetchBytes(url) {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}
async function sha256HexBytes(bytes) {
  const subtle = window.crypto && window.crypto.subtle;
  if (!subtle) throw new Error(PAGE.secureContext);
  const digest = await subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
async function sha256Hex(text) { return sha256HexBytes(new TextEncoder().encode(text)); }
// The existing normal macrotask yield only; no added timer, fake/native clock or model scheduling.
const yieldToFrame = () => window.scheduler && typeof window.scheduler.yield === 'function' ? window.scheduler.yield()
  : new Promise(resolve => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); c.port2.close(); resolve(); }; c.port2.postMessage(0); });
// Public source results only. Never traverse mesh geometry, change a job/promise, sort IDs or infer success from progress.
function rejectionRecord(reason) {
  return { name: reason && typeof reason.name === 'string' ? reason.name : null,
    code: reason && typeof reason.code === 'string' ? reason.code : null, message: messageOf(reason) };
}
function progressRecord(job) {
  if (typeof job.progress !== 'function') return { supported: false, value: null,
    gap: 'App.startFullBodyStream exposes no progress() getter; do not infer cancelled/verified counts from onProgress.done' };
  try { return { supported: true, value: copy(job.progress()), error: null }; }
  catch (err) { return { supported: true, value: null, error: rejectionRecord(err) }; }
}
function streamValueRecord(value, kind, phase) {
  const order = 'IDs in actual returned Map/manifest order, NOT observed completion order';
  if (kind === 'body') {
    if (phase === 'priority') return { shape: 'App body priority Map-or-null', meshIds: value instanceof Map ? Array.from(value.keys()) : null,
      meshCount: value instanceof Map ? value.size : null, order, rawStatus: null, failed: null, error: null,
      gap: 'The normal App adapter exposes verified priority Map only on complete/nonempty priority, otherwise null; raw status/failed/error are not exposed' };
    const meshes = value && value.meshesById;
    return { shape: 'App fullbodyAppInputs', meshIds: meshes instanceof Map ? Array.from(meshes.keys()) : null,
      meshCount: meshes instanceof Map ? meshes.size : null, entryIds: value && Array.isArray(value.entries) ? value.entries.map(x => x.element_id) : null,
      order, rawStatus: null, failed: null, error: null,
      gap: 'Only fulfilled complete App inputs expose all verified IDs; cancelled/rejected raw results throw and their full failed[]/partial meshes are not exposed' };
  }
  const meshes = value && value.meshes;
  return { shape: 'actual packet stream result', status: value && value.status !== undefined ? value.status : null,
    meshIds: meshes instanceof Map ? Array.from(meshes.keys()) : null, meshCount: meshes instanceof Map ? meshes.size : null,
    failed: value && value.failed !== undefined ? copy(value.failed) : null,
    error: value && value.error !== undefined ? copy(value.error) : null, counts: value && value.counts !== undefined ? copy(value.counts) : null,
    order, failureOrder: 'Full actual failed array retained in returned order; streamCore sorts failures by ID, not completion chronology' };
}
function noteOwnedJob(job, kind) {
  const evidence = { kind, ordinal: ownedStreamBindings.length, priority: { settlement: 'pending' }, done: { settlement: 'pending' },
    progressAtStop: null, progressAfterSettlement: null,
    coverage: kind === 'body' ? 'PARTIAL_PUBLIC_APP_ADAPTER: complete raw failed[]/partial nonpriority meshes/progress unavailable; B03 valid nonpriority prefix remains unqualified'
      : 'PUBLIC_PACKET_RESULT: retain actual status/mesh IDs/all failed records/error/progress; not itself pass evidence' };
  ownedStreamBindings.push({ job, evidence }); observations.ownedStreams.push(evidence);
  for (const phase of ['priority', 'done']) {
    const promise = job[phase];
    if (!promise || typeof promise.then !== 'function') { evidence[phase] = { settlement: 'unsupported' }; continue; }
    promise.then(value => {
      try { evidence[phase] = { settlement: 'fulfilled', value: streamValueRecord(value, kind, phase) }; }
      catch (err) { evidence[phase] = { settlement: 'observation-error', error: rejectionRecord(err) }; }
      if (phase === 'done') evidence.progressAfterSettlement = progressRecord(job);
    }, reason => {
      evidence[phase] = { settlement: 'rejected', reason: rejectionRecord(reason),
        gap: kind === 'body' ? 'Original App done rejection does not expose all raw failure IDs/partial verified meshes; no fabricated empty failures' : null };
      if (phase === 'done') evidence.progressAfterSettlement = progressRecord(job);
    }); // observers only; original job[phase] identity returned to App unchanged
  }
}
function stop() {
  if (!scene) return null;
  if (!observations.stopIssued) {
    observations.stopBefore = copy(scene.status()); observations.bodyProgressAtStop = copy(observations.bodyProgress); observations.stopIssued = true;
    for (const { job, evidence } of ownedStreamBindings) evidence.progressAtStop = progressRecord(job);
  }
  scene.stop(); return copy(scene.status()); // actual public normal App API, idempotent; no process/controller code
}
const streamBody = ({ fetchText: ft, sha256Hex: sh, onProgress, expectedManifestSha256 }) => {
  observations.bodyFactoryCalls++;
  const job = startFullBodyStream({ fetchText: ft, sha256Hex: sh, fetchBytes, sha256HexBytes, expectedManifestSha256,
    yieldFn: yieldToFrame, sliceMs: 8,
    onProgress: (n, total) => {
      if (typeof onProgress === 'function') onProgress(n, total);
      observations.bodyProgress = { done: n, total };
      // Source priority is exactly the two lacrimal meshes. n>2 is actual normal nonpriority body completion work.
      if (mode === 'stop-during-body' && scene && !observations.stopIssued && n > 2) stop();
    } });
  ownedBodyJobs.push(job); noteOwnedJob(job, 'body'); return job; // exact real job, not a synthetic stream/proxy/replaced promise
};
const streamFace = opts => {
  observations.faceFactoryCalls++;
  // Negative case is an actual same-origin HTTP404 request, not a forged hash/manifest/OBJ or mocked reader.
  const job = startFaceStream({ ...opts, fetchBytes, sha256HexBytes, yieldFn: yieldToFrame, sliceMs: 8,
    ...(mode === 'missing-face' ? { manifestUrl: '../../packets/face-muscles-r1/R287-INTENTIONALLY-ABSENT.json' } : {}) });
  ownedFaceJobs.push(job); noteOwnedJob(job, 'face'); return job;
};
let ready;
try {
  scene = start({ THREE, canvas, hudRoot, shellRoot, manifestUrl: app.dataset.manifestUrl,
    packetBases: { 'pov-demo-assets': app.dataset.packetPovDemoAssets, 'pov-demo-assets-r2': app.dataset.packetPovDemoAssetsR2 },
    movementMapUrl: app.dataset.movementMapUrl, fetchText, sha256Hex, fetchBytes, sha256HexBytes,
    placeholder: false, qa: false, storage, streamBody, streamFace, viewGraph });
  ready = scene.ready.then(r => {
    observations.ready = copy(r); observations.firstReadyReadback = summarizeInspect(scene.inspect()); return r;
  });
  scene.firstView.then(r => { observations.firstView = copy(r); });
  canvas.focus({ preventScroll: true });
} catch (err) {
  bootError = messageOf(err); observations.fatal = bootError; showFatal(PAGE.fatalPrefix + bootError);
  ready = Promise.resolve({ ok: false, error: bootError });
}
function summarizeInspect(s) {
  if (!s) return null;
  const f = s.features || {}, b = s.state && s.state.referenceBrain;
  return { phase: s.phase, frames: s.frames, qa: s.qa, placeholder: s.placeholder, shell: s.shell,
    camera: s.camera, simulationViewport: s.state && s.state.viewport ? { aspect: s.state.viewport.aspect, fovYDeg: s.state.viewport.fovYDeg } : null, referenceBrain: b ? { translation: b.translation, pivotWorld: b.pivotWorld,
      initialPivotWorld: b.initialPivotWorld, heldAnchor: Boolean(b.anchor) } : null,
    features: { viewGraph: f.viewGraph || null, bodyRig: f.bodyRig, bodyNote: f.bodyNote, brainMode: f.brainMode,
      bodyAnchor: f.bodyAnchor, bodyBridge: f.bodyBridge,
      round5: f.round5 ? { faceMuscles: f.round5.faceMuscles, faceNote: f.round5.faceNote,
        streamCancellationErrors: f.round5.streamCancellationErrors, streamCancelErrorTotal: f.round5.streamCancelErrorTotal,
        streamCancelErrorDropped: f.round5.streamCancelErrorDropped } : null } };
}
function readback() {
  return { mode, configurationSignature: CONFIGURED_R287_SIGNATURE, observations: copy(observations),
    status: scene ? scene.status() : null, inspect: scene ? summarizeInspect(scene.inspect()) : null };
}
export async function assertConfiguredBoot() {
  requireCase(mode === 'boot', 'use the boot URL for the positive configured startup assertion');
  const result = await ready;
  requireCase(result && result.ok === true, 'actual configured App.ready must succeed: ' + (result && result.error));
  const s = scene.inspect(), f = s.features, g = f && f.viewGraph;
  requireCase(s.phase === 'running' && s.frames >= 1 && s.qa === false && s.placeholder === false, 'real normal first frame required');
  requireCase(g && g.kind === 'ns-reference-graph-r266' && g.reference === 'posterior-brain-bound', 'configured branch must bind actual graph');
  requireCase(g.rootAnchorBp && g.rootAnchorBp.length === 3 && g.rootAnchorBp.every(Number.isFinite), 'actual source pelvis reference must bind');
  requireCase(typeof g.rootAnchorMeaning === 'string' && g.rootAnchorMeaning.includes('Rig-derived'), 'root provenance must be explicit');
  requireCase(f.bodyRig === true && f.bodyNote === null && f.brainMode === 'region' && f.round5.faceMuscles === 54 && f.round5.faceNote === null, 'normal body/girdle/54face must complete');
  requireCase(s.state && s.state.referenceBrain && Array.isArray(s.state.referenceBrain.initialPivotWorld) && s.state.referenceBrain.initialPivotWorld.length === 3 && s.state.referenceBrain.initialPivotWorld.every(Number.isFinite), 'constructor world brain pivot must bind on actual frame');
  requireCase(s.camera && s.camera.pose && s.camera.pose.firstPerson === true && s.camera.pose.thirdPerson === false, 'actual camera must use configured FIRST-person route');
  requireCase(g.fovYDeg === 90 && g.initialLook.yaw === 0 && g.initialLook.pitch === -35 * DEG, 'actual constructor graph must resolve the declared P1F90 engineering inputs');
  requireCase(observations.firstReadyReadback.simulationViewport && observations.firstReadyReadback.simulationViewport.fovYDeg === 90, 'declared landscape reproduction must use actual simulation FOV90, not posthoc projection');
  requireCase(g.initialBrainPlacement.yaw === 0 && g.initialBrainPlacement.pitch === 0, 'absent initialBrainPlacement must retain source default0');
  requireCase(g.referenceBp[0] === g.originalEyeBp[0] && g.referenceBp[2] === g.originalEyeBp[2] && g.referenceBp[1] > g.originalEyeBp[1], 'normal source posterior plane must remain distinct from original E');
  const initialPose = observations.firstReadyReadback.camera && observations.firstReadyReadback.camera.pose;
  requireCase(initialPose && initialPose.firstPerson === true && initialPose.thirdPerson === false && initialPose.position.length === 3 && initialPose.position.every(Number.isFinite) && initialPose.position.some(v => v !== 0), 'actual first frame must retain a nonzero-origin FIRST-person pose');
  // Match the existing cameraSnapshot six-decimal representation, not a new numerical tolerance.
  requireCase(initialPose.yaw === 0 && initialPose.pitch === Math.round((-35 * DEG) * 1e6) / 1e6, 'first-frame reported look must equal the declared initial look in the existing snapshot format');
  requireCase(observations.bodyFactoryCalls === 1 && observations.faceFactoryCalls === 1, 'one real factory/job per normal body and face stage');
  requireCase(observations.firstReadyReadback.shell.mode === 'intro' && observations.firstReadyReadback.shell.introShown === true && Number.isFinite(observations.firstReadyReadback.shell.introHideAtMs), 'first ready must expose the ordinary timed intro; actual readable2000ms/pixels require native observation');
  return { status: 'configured-first-frame-observed', evidence: readback(), limitation: 'Root binding/source route, not measured pelvis mechanics, full-arm/motor pixels or whole-game acceptance' };
}
async function settledOwnedAssets() {
  // Await ORIGINAL priority/done identities. Their full public result summaries are retained, with explicit App adapter gaps.
  await Promise.allSettled(ownedStreamBindings.flatMap(({ job }) => [job.priority, job.done]));
  for (const { job, evidence } of ownedStreamBindings) evidence.progressAfterSettlement = progressRecord(job);
  return copy(observations.ownedStreams);
}
export async function assertStoppedUnchanged() {
  requireCase(scene && observations.stopIssued, 'an ordinary actual stop must already have occurred');
  const before = scene.status();
  const terminal = await Promise.all([scene.ready, scene.firstView]);
  const assets = await settledOwnedAssets();
  await Promise.resolve(); // allow already-registered App completion continuations; no timer/clock replacement
  const after = scene.status(), inspected = scene.inspect();
  requireCase(after.stopped === true && after.phase === 'stopped' && after.frames === before.frames, 'stopped frame count/phase must remain stable after actual assets settle');
  requireCase(terminal.every(x => x && typeof x.ok === 'boolean'), 'actual ready/firstView must settle');
  if (mode === 'stop-during-body') {
    requireCase(observations.stopBefore.phase === 'loading' && before.frames === 0 && after.frames === 0, 'stop must occur in genuine pre-first-frame completion');
    requireCase(terminal.every(x => x.ok === false), 'pre-first-frame stop must fail ready/firstView');
    requireCase(!inspected.features.viewGraph && inspected.features.bodyRig === false, 'no graph/body may install after pre-ready stop');
  }
  return { status: 'ordinary-stop-settled-no-later-App-install-observed', assets, evidence: readback(),
    limitation: 'Actual owned JS/App settlement only; no process/GPU termination or arbitrarily late external promise guarantee' };
}
export async function stopAfterConfiguredReady() {
  const boot = await assertConfiguredBoot(); stop(); const stopped = await assertStoppedUnchanged();
  return { boot, stopped }; // callable once; does not reopen/restart the page or create another App
}
export async function runDeclaredCase() {
  if (mode === 'boot') return assertConfiguredBoot();
  const result = await ready;
  if (mode === 'stop-during-body') {
    requireCase(observations.stopIssued === true, 'actual nonpriority body progress must trigger stop');
    return assertStoppedUnchanged();
  }
  requireCase(mode === 'missing-face', 'unsupported case');
  const first = await scene.firstView, assets = await settledOwnedAssets();
  const status = scene.status();
  requireCase(result && result.ok === false && first && first.ok === false && status.failed === true && status.frames === 0, 'actual missing-face startup must fail before first frame');
  requireCase(typeof status.error === 'string' && status.error.includes('complete validated54-record face packet'), 'missing-face error must reach the exact configured completeness gate, not an unrelated failure');
  requireCase(observations.faceFactoryCalls === 1 && observations.bodyFactoryCalls === 1, 'one actual body and face job');
  return { status: 'real-missing-face-configured-fatal-observed', assets, evidence: readback(),
    limitation: 'Requires an actual HTTP404 from this fixed absent URL. This is a negative source/loader case, not anatomy or normal GPU cleanup proof' };
}
window.__nsQA = Object.freeze({ ready, get firstView() { return scene ? scene.firstView : Promise.resolve({ ok: false, error: bootError }); }, inspect: options => scene ? scene.inspect(options) : null });
window.__nsFramingR287 = Object.freeze({ mode, configurationSignature: CONFIGURED_R287_SIGNATURE, ready,
  readback, runDeclaredCase, assertConfiguredBoot, stop, stopAfterConfiguredReady, assertStoppedUnchanged });
window.addEventListener('pagehide', () => stop()); // finite caller never auto-restarts a completed/stopped App
