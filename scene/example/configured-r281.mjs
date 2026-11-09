/** R281 OWNED UNRUN normal-page caller. One App instance; no QA/input/clock/renderer substitution, retry or restart.
 * Root must separately admit opening one exact case URL. Observations are actual normal API readbacks, not pixels.
 * This is a configured legacy-eye/default-values STARTUP control, not a selected framing solution.
 */
import * as THREE from '../../vendor/three.module.js';
import { start, startFullBodyStream, startFaceStream } from '../src/ns-app.mjs';
import { PAGE } from '../src/ns-text.mjs';

export const CONFIGURED_R281_SIGNATURE = '{"reference":"eye"}';
const viewGraph = Object.freeze({ reference: 'eye' }); // leave actual source FOV/look/brain-placement defaults absent
const params = new URLSearchParams(window.location.search);
const mode = params.get('case') || 'boot';
if ([...params.keys()].some(k => k !== 'case') || !['boot', 'stop-during-body', 'missing-face'].includes(mode)) {
  throw new Error('R281 supports only the three declared case URLs; QA/quality/asset/config overrides are not permitted');
}
const app = document.getElementById('ns-app');
const canvas = document.getElementById('ns-canvas');
const hudRoot = document.getElementById('ns-hud');
const shellRoot = document.getElementById('ns-shell-root');
const ownedBodyJobs = [], ownedFaceJobs = [];
const observations = { mode, configurationSignature: CONFIGURED_R281_SIGNATURE, qa: false, placeholder: false,
  bodyFactoryCalls: 0, faceFactoryCalls: 0, bodyProgress: null, stopIssued: false, stopBefore: null,
  ready: null, firstView: null, firstReadyReadback: null, fatal: null };
let scene = null, bootError = null;
let storage = null;
try { storage = window.localStorage; } catch { storage = null; }
const copy = x => x == null ? null : JSON.parse(JSON.stringify(x));
const requireCase = (condition, message) => { if (!condition) throw new Error('R281 case assertion: ' + message); };
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
function stop() {
  if (!scene) return null;
  if (!observations.stopIssued) { observations.stopBefore = copy(scene.status()); observations.stopIssued = true; }
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
  ownedBodyJobs.push(job); return job; // exact real job, not a synthetic stream/proxy/replaced promise
};
const streamFace = opts => {
  observations.faceFactoryCalls++;
  // Negative case is an actual same-origin HTTP404 request, not a forged hash/manifest/OBJ or mocked reader.
  const job = startFaceStream({ ...opts, fetchBytes, sha256HexBytes, yieldFn: yieldToFrame, sliceMs: 8,
    ...(mode === 'missing-face' ? { manifestUrl: '../../packets/face-muscles-r1/R281-INTENTIONALLY-ABSENT.json' } : {}) });
  ownedFaceJobs.push(job); return job;
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
    camera: s.camera, referenceBrain: b ? { translation: b.translation, pivotWorld: b.pivotWorld,
      initialPivotWorld: b.initialPivotWorld, heldAnchor: Boolean(b.anchor) } : null,
    features: { viewGraph: f.viewGraph || null, bodyRig: f.bodyRig, bodyNote: f.bodyNote, brainMode: f.brainMode,
      bodyAnchor: f.bodyAnchor, bodyBridge: f.bodyBridge,
      round5: f.round5 ? { faceMuscles: f.round5.faceMuscles, faceNote: f.round5.faceNote,
        streamCancellationErrors: f.round5.streamCancellationErrors, streamCancelErrorTotal: f.round5.streamCancelErrorTotal,
        streamCancelErrorDropped: f.round5.streamCancelErrorDropped } : null } };
}
function readback() {
  return { mode, configurationSignature: CONFIGURED_R281_SIGNATURE, observations: copy(observations),
    status: scene ? scene.status() : null, inspect: scene ? summarizeInspect(scene.inspect()) : null };
}
export async function assertConfiguredBoot() {
  requireCase(mode === 'boot', 'use the boot URL for the positive configured startup assertion');
  const result = await ready;
  requireCase(result && result.ok === true, 'actual configured App.ready must succeed: ' + (result && result.error));
  const s = scene.inspect(), f = s.features, g = f && f.viewGraph;
  requireCase(s.phase === 'running' && s.frames >= 1 && s.qa === false && s.placeholder === false, 'real normal first frame required');
  requireCase(g && g.kind === 'ns-reference-graph-r266' && g.reference === 'eye', 'configured branch must bind actual graph');
  requireCase(g.rootAnchorBp && g.rootAnchorBp.length === 3 && g.rootAnchorBp.every(Number.isFinite), 'actual source pelvis reference must bind');
  requireCase(typeof g.rootAnchorMeaning === 'string' && g.rootAnchorMeaning.includes('Rig-derived'), 'root provenance must be explicit');
  requireCase(f.bodyRig === true && f.bodyNote === null && f.brainMode === 'region' && f.round5.faceMuscles === 54 && f.round5.faceNote === null, 'normal body/girdle/54face must complete');
  requireCase(s.state && s.state.referenceBrain && Array.isArray(s.state.referenceBrain.initialPivotWorld) && s.state.referenceBrain.initialPivotWorld.length === 3 && s.state.referenceBrain.initialPivotWorld.every(Number.isFinite), 'constructor world brain pivot must bind on actual frame');
  requireCase(s.camera && s.camera.pose && s.camera.pose.firstPerson === true && s.camera.pose.thirdPerson === false, 'actual camera must use configured FIRST-person route');
  requireCase(observations.bodyFactoryCalls === 1 && observations.faceFactoryCalls === 1, 'one real factory/job per normal body and face stage');
  requireCase(observations.firstReadyReadback.shell.mode === 'intro' && observations.firstReadyReadback.shell.introShown === true && Number.isFinite(observations.firstReadyReadback.shell.introHideAtMs), 'first ready must expose the ordinary timed intro; actual readable2000ms/pixels require native observation');
  return { status: 'configured-first-frame-observed', evidence: readback(), limitation: 'Root binding/source route, not measured pelvis mechanics, full-arm/motor pixels or whole-game acceptance' };
}
async function settledOwnedAssets() {
  const jobs = [...ownedBodyJobs, ...ownedFaceJobs];
  return Promise.allSettled(jobs.map(job => job.done)); // actual owned stream completion; no extra start/retry
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
  return { status: 'ordinary-stop-settled-no-later-App-install-observed', assets: assets.map(x => ({ status: x.status })), evidence: readback(),
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
  return { status: 'real-missing-face-configured-fatal-observed', assets: assets.map(x => ({ status: x.status })), evidence: readback(),
    limitation: 'Requires an actual HTTP404 from this fixed absent URL. This is a negative source/loader case, not anatomy or normal GPU cleanup proof' };
}
window.__nsQA = Object.freeze({ ready, get firstView() { return scene ? scene.firstView : Promise.resolve({ ok: false, error: bootError }); }, inspect: options => scene ? scene.inspect(options) : null });
window.__nsConfiguredR281 = Object.freeze({ mode, configurationSignature: CONFIGURED_R281_SIGNATURE, ready,
  readback, runDeclaredCase, assertConfiguredBoot, stop, stopAfterConfiguredReady, assertStoppedUnchanged });
window.addEventListener('pagehide', () => stop()); // finite caller never auto-restarts a completed/stopped App
