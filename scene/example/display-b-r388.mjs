/** R22 / R460 wide-view experimental preview: normal constructor/loading/input path, not production qualification.
 * Same posterior engineering reference, ordinary look0, explicit placement0.
 * Exact C353/R302 loading, validation, streams, ready/firstView/render and input paths are retained.
 * Fixed configuration assertions check these inputs only, not framing/anatomy/normal-mechanics/production acceptance.
 * Original P1F90 evidence remains historical; every new runtime/pixel/native gate is UNRUN. No QA setters or new APIs.
 */
import * as THREE from '../../vendor/three.module.js';
import { start, startFullBodyStream, startFaceStream } from '../src/ns-app.mjs';
import { PAGE } from '../src/ns-text.mjs';
import { DEG } from '../src/ns-math.mjs';

const viewGraph = Object.freeze({ reference: 'posterior-brain-bound', initialLook: Object.freeze({ yaw: 0, pitch: 0 }), fovYDeg: 110, initialBrainPlacement: Object.freeze({ yaw: 0, pitch: 0 }) });
// Fixed explicit constructor placement above; no raw coordinate or query overrides.
export const CONFIGURED_R302_SIGNATURE = JSON.stringify(viewGraph);
// Exact priority IDs in pinned294-entry full-body manifest order (right/left lacrimal bones), not a progress guess.
const PRIORITY_LACRIMAL_IDS = Object.freeze(['FJ3371', 'FJ3265']);
const MISSING_FACE_URL = '../../packets/face-muscles-r1/R287-INTENTIONALLY-ABSENT.json';
const FACE_COMPLETENESS_ERROR = 'ns:app_args: configured viewGraph requires the complete validated54-record face packet';
const FRIENDLY_FACE_ERROR = 'The face anatomy could not finish loading. Reload the page to try again.';
const params = new URLSearchParams(window.location.search);
const mode = params.get('case') || 'boot';
if ([...params.keys()].some(k => k !== 'case') || !['boot', 'stop-during-body', 'missing-face'].includes(mode)) {
  throw new Error('R302 supports only the three declared case URLs; QA/quality/asset/config overrides are not permitted');
}
const app = document.getElementById('ns-app');
const canvas = document.getElementById('ns-canvas');
const hudRoot = document.getElementById('ns-hud');
const shellRoot = document.getElementById('ns-shell-root');
const ownedBodyJobs = [], ownedFaceJobs = [], ownedStreamBindings = [];
const observations = { mode, configurationSignature: CONFIGURED_R302_SIGNATURE, qa: false, placeholder: false,
  bodyFactoryCalls: 0, faceFactoryCalls: 0, bodyProgress: null, bodyProgressAtStop: null, ownedStreams: [], stopIssued: false, stopBefore: null,
  ready: null, firstView: null, firstReadyReadback: null, fatal: null, httpFailures: [], b03Prefix: null };
let scene = null, bootError = null;
let storage = null;
try { storage = window.localStorage; } catch { storage = null; }
const copy = x => x == null ? null : JSON.parse(JSON.stringify(x));
const requireCase = (condition, message) => { if (!condition) throw new Error('R302 case assertion: ' + message); };
const messageOf = err => err && err.message ? err.message : String(err);
function showFatal(message) {
  const p = document.createElement('p'); p.className = 'ns-fatal'; p.setAttribute('role', 'alert');
  p.textContent = message; hudRoot.appendChild(p);
}
// SAME normal fetch/crypto interfaces: HTTP and actual served bytes are authoritative. No forged digest/model data.
function refuseHttp(response, url, reader) {
  const message = `HTTP ${response.status} for ${url}`;
  observations.httpFailures.push({ url: String(url), reader, status: response.status, statusText: response.statusText, message });
  throw new Error(message); // same real HTTP refusal, with its actual response status retained; no forged response
}
async function fetchText(url) {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) refuseHttp(response, url, 'text');
  return response.text();
}
async function fetchBytes(url) {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) refuseHttp(response, url, 'bytes');
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
    gap: 'This actual job does not expose progress(); absence is not a zero/verified/cancelled result' };
  try { return { supported: true, value: copy(job.progress()), error: null }; }
  catch (err) { return { supported: true, value: null, error: rejectionRecord(err) }; }
}
function appEvidenceRecord(job) {
  if (typeof job.evidence !== 'function') return { supported: false, value: null, error: null,
    gap: 'Actual App evidence() unavailable; no raw status/failure/prefix may be fabricated' };
  try { return { supported: true, value: copy(job.evidence()), error: null }; }
  catch (err) { return { supported: true, value: null, error: rejectionRecord(err) }; }
}
function streamValueRecord(value, kind, phase) {
  const order = 'IDs in actual returned Map/manifest order, NOT completion order';
  if (kind === 'body') {
    if (phase === 'priority') return { shape: 'App body priority Map-or-null', meshIds: value instanceof Map ? Array.from(value.keys()) : null,
      meshCount: value instanceof Map ? value.size : null, order,
      rawMetadata: 'Complete raw App metadata retained separately in atStop.app / appAfterSettlement, not inferred from this Map' };
    const meshes = value && value.meshesById;
    return { shape: 'App fullbodyAppInputs', meshIds: meshes instanceof Map ? Array.from(meshes.keys()) : null,
      meshCount: meshes instanceof Map ? meshes.size : null, entryIds: value && Array.isArray(value.entries) ? value.entries.map(x => x.element_id) : null,
      order, rawMetadata: 'Complete raw App metadata retained in appAfterSettlement; no geometry copied' };
  }
  const meshes = value && value.meshes;
  return { shape: 'actual packet stream result', status: value && value.status !== undefined ? value.status : null,
    meshIds: meshes instanceof Map ? Array.from(meshes.keys()) : null, meshCount: meshes instanceof Map ? meshes.size : null,
    failed: value && value.failed !== undefined ? copy(value.failed) : null,
    error: value && value.error !== undefined ? copy(value.error) : null, counts: value && value.counts !== undefined ? copy(value.counts) : null,
    order, failureOrder: 'Full actual failed array retained in returned ID order, not completion chronology' };
}
function noteOwnedJob(job, kind, notifications = null) {
  const evidence = { kind, ordinal: ownedStreamBindings.length, priority: { settlement: 'pending' }, done: { settlement: 'pending' },
    notifications, atStop: null, progressAfterSettlement: null, appAfterSettlement: null,
    coverage: kind === 'body' ? 'ACTUAL_APP_METADATA: complete copied raw status/IDs/failures/progress and synchronous verified notifications; observations alone are not PASS'
      : 'ACTUAL_PACKET_RESULT: all public status/IDs/failures/error/progress retained; not itself acceptance' };
  ownedStreamBindings.push({ job, evidence }); observations.ownedStreams.push(evidence);
  for (const phase of ['priority', 'done']) {
    const promise = job[phase];
    if (!promise || typeof promise.then !== 'function') { evidence[phase] = { settlement: 'unsupported' }; continue; }
    promise.then(value => {
      try { evidence[phase] = { settlement: 'fulfilled', value: streamValueRecord(value, kind, phase) }; }
      catch (err) { evidence[phase] = { settlement: 'observation-error', error: rejectionRecord(err) }; }
      if (phase === 'done') {
        evidence.progressAfterSettlement = progressRecord(job);
        if (kind === 'body') evidence.appAfterSettlement = appEvidenceRecord(job);
      }
    }, reason => {
      evidence[phase] = { settlement: 'rejected', reason: rejectionRecord(reason) };
      if (phase === 'done') {
        evidence.progressAfterSettlement = progressRecord(job);
        if (kind === 'body') evidence.appAfterSettlement = appEvidenceRecord(job);
      }
    }); // observe ORIGINAL promises only; exact job returned unchanged to App
  }
}
const sameIds = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((id, i) => id === b[i]);
function qualifyPrefix(snapshot, callbackProgress) {
  const a = snapshot && snapshot.app && snapshot.app.supported && !snapshot.app.error ? snapshot.app.value : null;
  const p = snapshot && snapshot.progress && snapshot.progress.supported && !snapshot.progress.error ? snapshot.progress.value : null;
  const rows = snapshot && snapshot.notificationsAtStop, rawPriority = a && a.priority;
  const ids = Array.isArray(rows) ? rows.map(x => x.id) : [];
  const legacy = snapshot && snapshot.legacyPriority;
  const checks = {
    realMetadataAvailable: Boolean(a && p && Array.isArray(rows)),
    actualTwoLacrimals: Boolean(rawPriority && rawPriority.status === 'complete' && rawPriority.error === null &&
      Array.isArray(rawPriority.failed) && rawPriority.failed.length === 0 && sameIds(rawPriority.meshIds, PRIORITY_LACRIMAL_IDS)),
    originalPriorityMap: Boolean(legacy && legacy.settlement === 'fulfilled' && legacy.value && sameIds(legacy.value.meshIds, PRIORITY_LACRIMAL_IDS)),
    firstTwoActualPriorityCallbacks: Boolean(rows && rows.length >= 3 && rows[0].priority === true && rows[1].priority === true &&
      new Set(ids.slice(0, 2)).size === 2 && ids.slice(0, 2).every(id => PRIORITY_LACRIMAL_IDS.includes(id))),
    nonpriorityVerified: Boolean(rows && rows.slice(2).some(x => x.priority === false && !PRIORITY_LACRIMAL_IDS.includes(x.id))),
    exactNotificationPrefix: Boolean(a && Array.isArray(rows) && sameIds(a.verifiedIds, ids) && new Set(ids).size === ids.length && rows.every(x => x.afterStop === false)),
    noCompletedFailure: Boolean(a && p && callbackProgress && callbackProgress.done > 2 && p.done === callbackProgress.done &&
      p.total === callbackProgress.total && ids.length === p.done && a.progress && a.progress.done === p.done &&
      (a.done === null || (a.done && Array.isArray(a.done.failed) && a.done.failed.length === 0))),
    beforeCancelRequest: Boolean(a && p && a.cancelRequested === false && p.cancelled === false)
  };
  return { established: Object.values(checks).every(Boolean), checks,
    scope: 'Actual completed verified prefix only. Equal completed counts corroborate real callbacks; n>2 alone never qualifies. In-flight later failures remain possible.' };
}
function stop() {
  if (!scene) return null;
  if (!observations.stopIssued) {
    observations.stopBefore = copy(scene.status()); observations.bodyProgressAtStop = copy(observations.bodyProgress);
    for (const { job, evidence } of ownedStreamBindings) {
      evidence.atStop = { progress: progressRecord(job), legacyPriority: copy(evidence.priority),
        app: evidence.kind === 'body' ? appEvidenceRecord(job) : null,
        notificationCount: Array.isArray(evidence.notifications) ? evidence.notifications.length : null,
        notificationsAtStop: mode === 'stop-during-body' && evidence.kind === 'body' ? copy(evidence.notifications) : null };
    }
    if (mode === 'stop-during-body') {
      const bodies = ownedStreamBindings.filter(x => x.evidence.kind === 'body');
      observations.b03Prefix = bodies.length === 1 ? qualifyPrefix(bodies[0].evidence.atStop, observations.bodyProgressAtStop)
        : { established: false, reason: 'Exactly one original body job required; no verified prefix established' };
    }
    observations.stopIssued = true; // snapshots above precede the ordinary stop; later callback records get afterStop:true
  }
  scene.stop(); return copy(scene.status());
}
const streamBody = ({ fetchText: ft, sha256Hex: sh, onProgress, expectedManifestSha256 }) => {
  observations.bodyFactoryCalls++;
  const notifications = [];
  const job = startFullBodyStream({ fetchText: ft, sha256Hex: sh, fetchBytes, sha256HexBytes, expectedManifestSha256,
    yieldFn: yieldToFrame, sliceMs: 8,
    onMesh: p => { notifications.push(Object.freeze({ ...p, afterStop: observations.stopIssued })); }, // synchronous, metadata only
    onProgress: (n, total) => {
      if (typeof onProgress === 'function') onProgress(n, total);
      observations.bodyProgress = { done: n, total };
      // SAME first n>2 ordinary stop trigger. Prefix qualification uses actual callbacks/results, including failures.
      if (mode === 'stop-during-body' && scene && !observations.stopIssued && n > 2) stop();
    } });
  ownedBodyJobs.push(job); noteOwnedJob(job, 'body', notifications); return job;
};
const streamFace = opts => {
  observations.faceFactoryCalls++;
  // Negative case is an actual same-origin HTTP404 request, not a forged hash/manifest/OBJ or mocked reader.
  const job = startFaceStream({ ...opts, fetchBytes, sha256HexBytes, yieldFn: yieldToFrame, sliceMs: 8,
    ...(mode === 'missing-face' ? { manifestUrl: MISSING_FACE_URL } : {}) });
  ownedFaceJobs.push(job); noteOwnedJob(job, 'face'); return job;
};
let ready;
try {
  scene = start({ THREE, canvas, hudRoot, shellRoot, manifestUrl: app.dataset.manifestUrl,
    packetBases: { 'pov-demo-assets': app.dataset.packetPovDemoAssets, 'pov-demo-assets-r2': app.dataset.packetPovDemoAssetsR2 },
    movementMapUrl: app.dataset.movementMapUrl, fetchText, sha256Hex, fetchBytes, sha256HexBytes,
    placeholder: false, qa: false, storage, streamBody, streamFace, viewGraph, wholeArmDisplay: { mode: 'whole-posed-arm-r378' } });
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
    camera: s.camera ? { view: s.camera.view, pose: copy(s.camera.pose) } : null, simulationViewport: s.state && s.state.viewport ? { aspect: s.state.viewport.aspect, fovYDeg: s.state.viewport.fovYDeg } : null, referenceBrain: b ? { translation: b.translation, pivotWorld: b.pivotWorld,
      initialPivotWorld: b.initialPivotWorld, heldAnchor: Boolean(b.anchor) } : null,
    features: { viewGraph: f.viewGraph || null, bodyRig: f.bodyRig, bodyNote: f.bodyNote, brainMode: f.brainMode,
      bodyAnchor: f.bodyAnchor, bodyBridge: f.bodyBridge ? { state: f.bodyBridge.state, current: f.bodyBridge.current,
        normalMechanics: f.bodyBridge.normalMechanics } : null,
      round5: f.round5 ? { faceMuscles: f.round5.faceMuscles, faceNote: f.round5.faceNote,
        streamCancellationErrors: f.round5.streamCancellationErrors, streamCancelErrorTotal: f.round5.streamCancelErrorTotal,
        streamCancelErrorDropped: f.round5.streamCancelErrorDropped } : null } };
}
function visibleErrorRecord(root, selector) {
  const node = root.querySelector(selector);
  if (!node) return { present: false, text: null, visibleBox: false };
  const style = window.getComputedStyle(node);
  return { present: true, text: node.textContent, hidden: node.hidden, visibleBox: !node.hidden && node.getClientRects().length > 0 &&
    style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && style.opacity !== '0' };
}
function visibleErrors() {
  return { hud: visibleErrorRecord(hudRoot, '.ns-error'), shell: visibleErrorRecord(shellRoot, '.ns-shell-notice') };
}
function readback() {
  return { mode, configurationSignature: CONFIGURED_R302_SIGNATURE, observations: copy(observations),
    status: scene ? scene.status() : null, inspect: scene ? summarizeInspect(scene.inspect()) : null,
    visibleErrors: mode === 'missing-face' ? visibleErrors() : null,
    scope: 'Selected declared-case App fields plus complete owned public stream metadata/notifications, not a full Scene capture or pixels. No geometry dump.' };
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
  requireCase(g.fovYDeg === 110 && g.initialLook.yaw === 0 && g.initialLook.pitch === 0, 'actual constructor graph must resolve the declared R356 B engineering inputs');
  requireCase(observations.firstReadyReadback.simulationViewport && observations.firstReadyReadback.simulationViewport.fovYDeg === 110, 'declared landscape reproduction must use actual simulation FOV110, not posthoc projection');
  requireCase(g.initialBrainPlacement.yaw === 0 && g.initialBrainPlacement.pitch === 0, 'explicit initialBrainPlacement must resolve the declared R356 B engineering inputs');
  requireCase(g.referenceBp[0] === g.originalEyeBp[0] && g.referenceBp[2] === g.originalEyeBp[2] && g.referenceBp[1] > g.originalEyeBp[1], 'normal source posterior plane must remain distinct from original E');
  const initialPose = observations.firstReadyReadback.camera && observations.firstReadyReadback.camera.pose;
  requireCase(initialPose && initialPose.firstPerson === true && initialPose.thirdPerson === false && initialPose.position.length === 3 && initialPose.position.every(Number.isFinite) && initialPose.position.some(v => v !== 0), 'actual first frame must retain a nonzero-origin FIRST-person pose');
  // Match the existing cameraSnapshot six-decimal representation, not a new numerical tolerance.
  requireCase(initialPose.yaw === 0 && initialPose.pitch === 0, 'first-frame reported look must equal the declared initial look in the existing snapshot format');
  requireCase(observations.bodyFactoryCalls === 1 && observations.faceFactoryCalls === 1, 'one real factory/job per normal body and face stage');
  requireCase(observations.firstReadyReadback.shell.mode === 'intro' && observations.firstReadyReadback.shell.introShown === true && Number.isFinite(observations.firstReadyReadback.shell.introHideAtMs), 'first ready must expose the ordinary timed intro; actual readable2000ms/pixels require native observation');
  return { status: 'configured-first-frame-observed', evidence: readback(), limitation: 'Root binding/source route, not measured pelvis mechanics, full-arm/motor pixels or whole-game acceptance' };
}
async function settledOwnedAssets() {
  // Await ORIGINAL priority/done identities; no start, retry, proxy or replaced promise.
  await Promise.allSettled(ownedStreamBindings.flatMap(({ job }) => [job.priority, job.done]));
  for (const { job, evidence } of ownedStreamBindings) {
    evidence.progressAfterSettlement = progressRecord(job);
    if (evidence.kind === 'body') evidence.appAfterSettlement = appEvidenceRecord(job);
  }
  // Owned metadata is already in readback().observations exactly once; do not return a duplicate assets collection.
}
export async function assertStoppedUnchanged() {
  requireCase(scene && observations.stopIssued, 'an ordinary actual stop must already have occurred');
  const before = scene.status();
  const terminal = await Promise.all([scene.ready, scene.firstView]);
  await settledOwnedAssets();
  await Promise.resolve(); // allow already-registered App completion continuations; no timer/clock replacement
  const after = scene.status(), inspected = scene.inspect();
  requireCase(after.stopped === true && after.phase === 'stopped' && after.frames === before.frames, 'stopped frame count/phase must remain stable after actual assets settle');
  requireCase(terminal.every(x => x && typeof x.ok === 'boolean'), 'actual ready/firstView must settle');
  if (mode === 'stop-during-body') {
    requireCase(observations.stopBefore.phase === 'loading' && before.frames === 0 && after.frames === 0, 'stop must occur in genuine pre-first-frame completion');
    requireCase(terminal.every(x => x.ok === false), 'pre-first-frame stop must fail ready/firstView');
    requireCase(!inspected.features.viewGraph && inspected.features.bodyRig === false, 'no graph/body may install after pre-ready stop');
    requireCase(observations.bodyFactoryCalls === 1 && ownedBodyJobs.length === 1 && observations.b03Prefix && observations.b03Prefix.established === true,
      'B03 REFUSED: actual two lacrimal callbacks plus a no-failure nonpriority verified prefix were not established before stop');
    const body = observations.ownedStreams.find(x => x.kind === 'body'), settledApp = body.appAfterSettlement;
    requireCase(settledApp && settledApp.supported === true && settledApp.error === null && settledApp.value && settledApp.value.done && Array.isArray(settledApp.value.done.failed),
      'B03 requires complete actual settled raw failure/status metadata, not an App rejection alone');
    requireCase(settledApp.value.cancelRequested === true && settledApp.value.progress && settledApp.value.progress.cancelled === true &&
      ['cancelled', 'rejected'].includes(settledApp.value.done.status), 'actual settled cancel/result status required; real failures may take rejected precedence');
    requireCase(body.done.settlement === 'rejected', 'legacy body done must retain its non-complete rejection');
    requireCase(sameIds(settledApp.value.verifiedIds, body.notifications.map(x => x.id)) &&
      body.notifications.slice(body.atStop.notificationCount).every(x => x.afterStop === true),
      'all actual post-stop completion notifications must remain in completion order, distinct from manifest result order');
  }
  return { status: 'ordinary-stop-settled-no-later-App-install-observed', evidence: readback(),
    limitation: 'Actual owned JS/App settlement only; no process/GPU termination or arbitrarily late external promise guarantee' };
}
export async function stopAfterConfiguredReady() {
  const boot = await assertConfiguredBoot(); stop(); const stopped = await assertStoppedUnchanged();
  return { boot: { status: boot.status, limitation: boot.limitation }, stopped }; // retain firstReadyReadback in one canonical evidence, no duplicate large boot dump
}
export async function runDeclaredCase() {
  if (mode === 'boot') return assertConfiguredBoot();
  const result = await ready;
  if (mode === 'stop-during-body') {
    requireCase(observations.stopIssued === true, 'actual nonpriority body progress must trigger stop');
    return assertStoppedUnchanged();
  }
  requireCase(mode === 'missing-face', 'unsupported case');
  const first = await scene.firstView; await settledOwnedAssets();
  const status = scene.status();
  requireCase(result && result.ok === false && first && first.ok === false && status.failed === true && status.frames === 0, 'actual missing-face startup must fail before first frame');
  requireCase(status.error === FACE_COMPLETENESS_ERROR && status.shell && status.shell.error === FACE_COMPLETENESS_ERROR &&
    result.error === FACE_COMPLETENESS_ERROR && first.error === FACE_COMPLETENESS_ERROR,
    'exact raw configured completeness diagnostics must remain unchanged');
  requireCase(observations.faceFactoryCalls === 1 && observations.bodyFactoryCalls === 1, 'one actual body and face job');
  const missingPath = new URL(MISSING_FACE_URL, window.location.href).pathname;
  requireCase(observations.httpFailures.some(x => x.status === 404 && x.reader === 'bytes' && new URL(x.url, window.location.href).pathname === missingPath),
    'the exact fixed missing face URL must actually respond HTTP404 on the normal byte path');
  const face = observations.ownedStreams.find(x => x.kind === 'face'), raw = face && face.done.settlement === 'fulfilled' ? face.done.value : null;
  requireCase(raw && raw.status !== 'complete' && typeof raw.error === 'string' && raw.error.includes('HTTP 404') && raw.error.includes(MISSING_FACE_URL),
    'the actual raw face result must retain the same404cause and all actual failed records');
  const faceNote = scene.inspect().features.round5.faceNote;
  requireCase(typeof faceNote === 'string' && faceNote.includes('HTTP 404') && faceNote.includes(MISSING_FACE_URL), 'raw faceNote must retain the actual loader cause');
  const visible = visibleErrors();
  requireCase(visible.hud.present && visible.hud.visibleBox && visible.hud.text === FRIENDLY_FACE_ERROR &&
    visible.shell.present && visible.shell.visibleBox && visible.shell.text === FRIENDLY_FACE_ERROR,
    'both actual HUD and shell DOM error boxes must show the exact plain face-loading sentence');
  return { status: 'real-missing-face-configured-fatal-and-friendly-DOM-observed', evidence: readback(),
    limitation: 'Requires an actual HTTP404 from this fixed absent URL. This is a negative source/loader case, not anatomy or normal GPU cleanup proof' };
}
window.__nsQA = Object.freeze({ ready, get firstView() { return scene ? scene.firstView : Promise.resolve({ ok: false, error: bootError }); }, inspect: options => scene ? scene.inspect(options) : null });
window.__nsLoadingR302 = Object.freeze({ mode, configurationSignature: CONFIGURED_R302_SIGNATURE, ready,
  readback, runDeclaredCase, assertConfiguredBoot, stop, stopAfterConfiguredReady, assertStoppedUnchanged });
window.addEventListener('pagehide', () => stop()); // finite caller never auto-restarts a completed/stopped App
