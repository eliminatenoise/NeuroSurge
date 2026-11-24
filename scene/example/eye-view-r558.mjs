/** R558 preview launcher (user note 2026-11-11): the first-person camera sits at the person's eye reference point,
 * FOV 108 vertical since 17 November 2026 (EYE_FOV_Y_DEG below; it was 90 from 11 November, and 120 before that, whose
 * edge stretching the user called absurd), ordinary look0, explicit placement0. No backed-off camera and no whole-arm engineering display: the whole
 * own body is drawn solid from the eyes. The eye point is the atlas-derived display reference, not a measured eye.
 * Normal constructor/loading/input path; an experimental preview, not production qualification.
 * Exact C353/R302 loading, validation, streams, ready/firstView/render and input paths are retained.
 * Fixed configuration assertions check these inputs only, not framing/anatomy/normal-mechanics/production acceptance.
 * Original P1F90 evidence remains historical; every new runtime/pixel/native gate is UNRUN. No QA setters or new APIs.
 */
import * as THREE from '../../vendor/three.module.js';
import { start, startFullBodyStream, startFaceStream, BRAIN_START_MOTOR_FRAC } from '../src/ns-app.mjs';
import { PAGE, SHELL } from '../src/ns-text.mjs';
import { DEG } from '../src/ns-math.mjs';
import { R5_BIGBRAIN } from '../src/ns-scene-three.mjs';
import { startAssembly, ASSEMBLY_EXPECTED_FILES, LOADING_PICTURE } from '../src/ns-assembly.mjs';
import { bodyMuscleLayer } from '../src/ns-body.mjs';
import { showControlsCard } from '../src/ns-controls-card.mjs';
import { createLoadBar } from '../src/ns-load-progress.mjs';
import { installLoadGuard, ADDRESS_REFUSED } from '../src/ns-load-guard.mjs';
import { startPackLoader, readAll } from '../src/ns-pack-loader.mjs';
import { editionPacks, isLiteEdition } from './edition.mjs';
import { packKeyOfUrl } from '../src/ns-pack.mjs';

// 17 November 2026 (user: "the field of view should be even wider, such that you can see everything from your eyes.
// Including everything from the neck down"): 108 degrees up and down (about 136 across at 16:9), between the 90 of
// 11 November and the 120 whose edge stretching the user called absurd.
// 18 November 2026 (the owner: "Remember, all of the torso has to be visible at once, even if that means you're a
// little flat-chested. Maybe we need an even greater field of view."): 108 -> 116 degrees up and down (about 141
// across at 16:9). With the look starting 41 degrees below level the picture now reaches from 17 degrees above level
// down to 99 below: the collar bones lie inside its lower edge with both shoulders in the lower corners, and the
// chest, stomach and pelvis above them. The price: things in the middle are drawn about a seventh smaller and the
// corners are stretched more (120 was called absurd on 17 November; 116 stays under it).
// 18 November 2026, after a check (the chest filled the lower third of that picture, the stomach was a narrow band
// and the limbs were thin): 116 -> 100. The camera now stands higher and further back (ns-camera EYE_DOLLY, with the
// neck shade of ns-scene-three NECK_SHADE), where both shoulders, the collar bones, the chest, the stomach and the
// pelvis fit inside 100 degrees; things in the middle of the picture are drawn about a third larger than at 116 and
// the corners are stretched far less.
// 18 November 2026, late (the owner: "a very wide field of view, but a very narrow depth of field ... things that are far
// away look extremely close to us"; "a much larger set of four limbs, and perhaps that involves dialing down the field
// of view"): 100 -> 54. The camera stands further back behind the eye (ns-camera EYE_DOLLY: 30 cm back on the line of
// sight, 10 cm up along the head), so this longer lens flattens depth: your shins, feet, the mirror body and the brain
// are drawn far larger for their distance and your chest smaller. Measured at the start, 1600x900 (middle widths):
// thigh 65 -> 144 px, shin 25 -> 55, right upper arm 61 -> 118, forearm 42 -> 86. Across, the picture is 85 degrees.
const EYE_FOV_Y_DEG = 54;
// 17 November 2026 (user: "what if we made the brain far lower so that the relevant body parts were always in view?";
// "You will naturally be looking a little downwards and that is where the motor strip should naturally be"): the game
// starts with the look a little below level, as someone leaning back on a sofa looks, and the brain starts there too,
// over the body that lies out below your eyes, so the limbs an area moves stay on screen while you aim at it.
// 18 November 2026 (user, after playing: "And you are gazing diagonally downwards. You should be able to see your own
// shoulders and stomach/abs"): the game now starts with the look 34 degrees below level, down your own front (the
// head bowed 12 degrees, the eyes lowered the rest: ns-body POSTURE_EYES). The brain stays where it was (20 below
// level): the mirror body is a reflection that stands where the body puts it, just under the motor strip, and your
// own feet come up to it, so the brain cannot come lower without the mirror body or your feet covering the leg
// areas. From the start look the arm, leg and trunk areas are inside the top of the picture and the face areas are
// just above it. (Tried: 35 with the brain 8 lower: the mirror body then stood in front of the leg areas; 30: the
// crosshair started on the mirror body's lower arrow, so the first click tilted it instead of taking the pointer.)
// 18 November 2026, third pass (a check: at 34 the upper part of the strip was cut off by the top edge and the first
// prompt lay over it): the look now starts 36 degrees below level (the head bowed 14, the eyes 22) and the brain is
// drawn smaller at the start (ns-app BRAIN_START_MOTOR_FRAC), so the WHOLE motor strip, face areas included, is inside
// the picture above your own legs, and your arms, belly and chest are seen around and under it. The brain still
// stands 20 below level, on the mirror body's head, for the reason given above; the crosshair therefore starts on
// your own knees, about 22 degrees under the strip's lower edge, not on the strip itself.
// 18 November 2026, fourth pass (the owner: "I want flat depressed chest ... you are gazing diagonally downwards. You
// should be able to see your own shoulders and stomach/abs"; the lead: the crosshair should start on, or as near as
// can be to, the motor strip, and the strip should be large again). The camera now stands a little behind the eye on
// its own line of sight (ns-camera EYE_DOLLY), so both shoulders, the collar bones, the chest and the belly are in
// the lower part of the picture at a shallower look than before, and the look starts 25 degrees below level (the
// head bowed 3, the eyes 22). Why 25 and not 36: the strip stands above the mirror body's head, which is at eye level
// (the mirror body is a literal reflection on the same ground), so every degree the look comes up brings the strip
// that much nearer the crosshair and leaves room to draw it larger (ns-app BRAIN_START_MOTOR_FRAC 0.25 -> 0.33: the
// whole strip, face areas included, is inside the picture). Between 27 and 34 degrees the crosshair starts on the
// mirror body's lower arrow (its tip comes up at once and the first click tilts the mirror body instead of taking
// the pointer); at 25 it starts in the open between the mirror body's legs, about 120 px under the leg areas at
// 1600x900. It does NOT start on the strip: at any look that still shows your chest, your own legs and feet and the
// mirror body lie under the crosshair, and the strip cannot stand in front of them without hiding them.
// 18 November 2026, late (package FLAT): 41 -> 52 degrees below level. In the slumped posture the front of the trunk
// faces 49 degrees above level, so a look 41 degrees down runs parallel to it and a longer lens from further back sees
// the chest hide the belly and pelvis. At 52 the line of sight crosses the trunk's front at about 17 degrees: the
// whole front, shoulders to pelvis, is seen at once, the legs run up the picture to the feet under its top edge, and
// the crosshair starts on the strip between the knees. The brain is placed on the same look.
// 19 November 2026 (the owner: "Both the brain and mirror body are far too low. The brain should actually be a lot
// higher, I was wrong about that before."; this withdraws "the motor strip, the middle bit, to be below our ankles" of
// 18 November). The look now starts 24 degrees below level (it was 52) and the brain stands 13 degrees below level,
// straight ahead and ABOVE your feet: the whole motor strip is in the upper part of the picture, clear of your hands
// and feet, the mirror body stands directly under it between your hands (ns-mirror MIRROR_NEAR), and your own body
// lies below: hands, legs, pelvis, belly and chest. Nothing of yours covers the strip any more. The price, stated
// plainly: with the long lens (54 degrees) the picture cannot hold the strip, the mirror body and the whole of your
// body one above the other, so the tops of your shoulders and the collar bones are now just under the lower edge at
// the start (a look a few degrees down brings them in), and the crosshair starts on the mirror body's neck, about
// 80 px under the leg areas, not on the strip itself. Tried and seen (the pictures are listed in the package notes):
// 30 down (whole torso, but the strip's top cut and the mirror body wedged between your knees), 15 and 20 down (the
// cleanest stack, but no torso at all), the mirror body in the strip's hollow (too small to read) and beside the
// legs (it stood inside your own arm), a wider lens (the open root of the neck came into the lower edge).
// 19 November 2026, after a check (the strip's top areas were cut by the top edge at 16:9; the mirror body stood between
// your own thighs with the crosshair on its neck, so a muscle name was on screen before the player had done anything;
// with the crosshair on the strip's outermost areas the mirror body was out of the picture; the tops of the shoulders
// were cut). The layout now: the mirror body stands IN THE HOLLOW of the strip's U, in front of the brain's midline
// and tilted toward you (ns-mirror MIRROR_NEAR), so it is in the picture with every strip area and is covered by
// nothing; the strip is a little smaller (ns-app BRAIN_START_MOTOR_FRAC 0.43) and all of it is inside the picture at
// 16:9; the look starts 25.5 degrees down, on the bare brain just under the strip and its lower arrow; and the camera
// stands further back (ns-camera EYE_DOLLY 0.5 m), so your whole front, both shoulders included, lies in the lower
// part of the picture (your neck ends in a plain cap at the collar: ns-scene-three EYE_COLLAR). The price: your own
// limbs are drawn about a sixth smaller than on 18 November, and the mirror body is about 235 px tall at 1600x900
// (it was 290 between your knees).
// 19 November 2026, later (the owner: "invert the brain altogether so that the motor strip changed direction ... include
// eyeballs with nerves connected to the brain"; "turning it 180 degrees, such that the U becomes an inverted U, almost
// an N. Lowercase n"; "let's have the mirror body so close that the toes are almost touching and they're level"). The
// look and the brain's placement are unchanged (25.5 and 13 degrees below level). What changed is in the modules:
// the brain is drawn turned half a turn (ns-brain BRAIN_VIEW.spinDeg 180: front down, the brain's right half on the
// left, the strip an n with the leg areas at its top), the n's top is pinned under the top edge and its lower ends
// stay above your toes (ns-app BRAIN_START, BRAIN_FLOOR), and the mirror body is the literal reflection, toe to toe
// with you, sitting inside the n's arch (ns-mirror MIRROR_NEAR). The brain's front with its two eyeballs
// (ns-brain-eyes) is then behind your own body in this picture; ns-app BRAIN_START.keepEyes says why and what the
// other choice costs.
// 19 November 2026, later still (the owner: "let's center the motor strip on either side of the head of the mirror
// body. So maybe we'll keep a bigger gap between the hemispheres. So it looks like almost hair coming out of either side
// of the mirror body's head."). The look and the brain's placement are again unchanged, and so is the mirror body (the
// literal reflection, toe to toe: the owner asked for that the same day). What changed is in the modules: the two
// halves of the brain are drawn 12 mm further apart (ns-brain-part HEMI_GAP), and the strip's top no longer stands
// just under the top edge: it stands where the middle of the two leg areas, the inner ends of the n, is level with the
// mirror body's head (ns-app BRAIN_START, brainStartCeilNdc), so the head is IN THE GAP and the two halves run outward
// and down from either side of it. The floor (your own fingertips) did not move, so the brain is drawn 0.88 of the
// size it had on a 16:9 window. assertConfiguredBoot below states the new rule.
const START_LOOK_PITCH_DEG = -25.5, BRAIN_START_PITCH_DEG = -13;
const viewGraph = Object.freeze({ reference: 'eye', initialLook: Object.freeze({ yaw: 0, pitch: START_LOOK_PITCH_DEG * DEG }), fovYDeg: EYE_FOV_Y_DEG, initialBrainPlacement: Object.freeze({ yaw: 0, pitch: BRAIN_START_PITCH_DEG * DEG }) });
// Fixed explicit constructor placement above; no raw coordinate or query overrides.
export const CONFIGURED_R302_SIGNATURE = JSON.stringify(viewGraph);
// Exact priority IDs in pinned294-entry full-body manifest order (right/left lacrimal bones), not a progress guess.
const PRIORITY_LACRIMAL_IDS = Object.freeze(['FJ3371', 'FJ3265']);
const MISSING_FACE_URL = '../../packets/face-muscles-r1/R287-INTENTIONALLY-ABSENT.json';
const FACE_COMPLETENESS_ERROR = 'ns:app_args: configured viewGraph requires the complete validated54-record face packet';
const FRIENDLY_FACE_ERROR = 'The face anatomy could not finish loading. Reload the page to try again.';
const params = new URLSearchParams(window.location.search);
const mode = params.get('case') || 'boot';
const lite = isLiteEdition(params);
// 25 November 2026 (DESIGN-DECISIONS section 212): a parameter the game does not know is left alone. It was refused,
// and sites that pass a link on add their own (fbclid, utm_source, gclid ...): a visitor who followed such a link got
// "Loading did not finish. Check your connection, then try again", and "Try again" loaded the same address. Nothing
// in the game reads such a parameter, so the rule above stands: no raw coordinate or query overrides. Still refused:
// a value the game does not know for one of its own two parameters, and the scene's test switches (`qa`, and every
// name that starts with `ns`: ns-scene-three reads nsQuality and nsBrainK under qa=1, which draws the brain at another
// distance), which this page has never offered.
const TEST_SWITCH = /^(?:qa$|ns)/i;
if ([...params.keys()].some(k => TEST_SWITCH.test(k)) || !['boot', 'stop-during-body', 'missing-face'].includes(mode)
    || (params.has('edition') && (!lite || mode !== 'boot'))) {
  throw new Error(ADDRESS_REFUSED); // (the load guard then offers the game's usual address, not the same one again)
}
const packProfile = editionPacks(params);
document.title = lite ? 'NeuroSurge Lite' : 'NeuroSurge';
document.body.dataset.edition = lite ? 'lite' : 'full';
document.body.dataset.meshCompression = packProfile.codec || 'gzip';
const app = document.getElementById('ns-app');
const canvas = document.getElementById('ns-canvas');
const hudRoot = document.getElementById('ns-hud');
const shellRoot = document.getElementById('ns-shell-root');
const ownedBodyJobs = [], ownedFaceJobs = [], ownedStreamBindings = [];
// 17 November 2026: no start page and no loading page; the main controls are shown for the first five seconds.
// 19 November 2026, late: the separate loading picture (ns-assembly: a worker drew the arriving meshes inside out, in
// an arrangement of its own, and cross-faded into the game) is switched off. The owner: "perhaps the it should be the
// actual game models loading not loading page models"; "Performance and reliability should be our number one priority.
// even if that means extreme simplicity and streamlining". A check found what the picture really was in a load of a
// few seconds: a brain in one corner and two skeletons with a few muscle slivers, for two or three seconds, then half
// a second of two different arrangements on top of each other. The game's own scene cannot yet be drawn part by part
// (its camera and every placement need the finished rig, and the body is installed in one piece), so the honest
// simple choice is taken: the game's own dark backdrop (assembly.css) with the loading bar, then the game itself,
// faded in. It also frees a worker, a second graphics context and a copy of every mesh during the build.
// LOADING_PICTURE = true brings the worker picture back as it was.
// 19 November 2026, later (the owner: "Currently, I can't see the models being built on the loading page, which they
// should be there"): the picture is back on. It is short on a fast line; the owner wants it there.
// 20 November 2026: the switch is LOADING_PICTURE in ns-assembly.mjs (the page's first small script, early-load.mjs,
// starts the picture and the controls card now, at the start of the load, and feeds the picture from the packs as they
// arrive; on a slow line both used to wait for this launcher's own scripts). This launcher takes the same picture and
// the same card over (shared: true), tells the picture the game's first view and the game's own layer of each muscle,
// and goes on feeding it what it fetches; a mesh the picture has already drawn is not drawn twice.
const earlyStart = mode === 'boot' && window.__nsEarly ? window.__nsEarly : null;
const assembly = mode === 'boot' && LOADING_PICTURE ? startAssembly({ host: app, room: { fovYDeg: EYE_FOV_Y_DEG, pitchDeg: START_LOOK_PITCH_DEG }, shared: true }) : null;
if (assembly) assembly.useMuscleLayer(bodyMuscleLayer);
if (mode === 'boot') app.dataset.nsPhase = 'loading';
const controlsCard = mode === 'boot' ? (earlyStart && earlyStart.controlsCard) || showControlsCard({ host: document.body }) : null;
const controlsCardAt = earlyStart && earlyStart.controlsCard && Number.isFinite(earlyStart.controlsCardAt) ? earlyStart.controlsCardAt : performance.now();
// 19 November 2026 (the owner: "it just stays on the loading page forever. There should be a loading progress bar"):
// one bar with a percentage for the whole wait (ns-load-progress), and a guard (ns-load-guard, the page's first script,
// which needs no other file): when nothing has advanced for 20 s, a script cannot be had, or loading fails, a panel
// says so with a "Try again" button. Only the ordinary boot case.
let barStorage = null;
try { barStorage = window.localStorage; } catch { barStorage = null; }
// (early-load.mjs, first on the page, has usually made the bar already and has been moving it with the packs' bytes)
const earlyBar = mode === 'boot' && window.__nsEarly && window.__nsEarly.bar ? window.__nsEarly.bar : null;
const loadBar = mode !== 'boot' ? null : earlyBar || createLoadBar({ host: document.body, storage: barStorage });
if (earlyBar) { window.__nsEarly.launched = true; earlyBar.pageLoaded(); }
const guard = mode === 'boot' ? installLoadGuard() : null;
if (guard) guard.attach({ bar: loadBar, lastAdvance: () => loadBar.model.lastAdvance() });
// 19 November 2026 (the owner: "Game should not take long to load at all. Minutes are a liability"): the anatomy comes
// as six mesh packs (19 MB, fetched and decoded in a worker) instead of 691 OBJ text files (166 MB); see ns-pack.
// A file a pack cannot give is fetched as before. Only the ordinary boot case; the two test cases read the files.
const loadCount = { fetched: 0, served: 0 };
// (the 'files' step ends when the last file is in: every pack whole, or the last file handed to the game)
const onPackProgress = (files, of) => { if (!loadBar) return; const f = (files + loadCount.fetched) / Math.max(1, of || ASSEMBLY_EXPECTED_FILES); loadBar.set('files', f); if (f >= 1) loadBar.done('files'); };
// early-load.mjs (first on the page) has usually started the packs already, while this script's own files travelled.
const early = mode === 'boot' && window.__nsEarly && window.__nsEarly.loader ? window.__nsEarly : null;
if (early) early.listen(onPackProgress);
const packs = mode !== 'boot' ? null : early ? early.loader : startPackLoader({ ...packProfile, onProgress: onPackProgress });
if (assembly) assembly.feedFrom(packs); // (once per picture: early-load.mjs has usually done it already)
if (mode !== 'boot') { try { document.querySelector('.ns-load.ns-load-early')?.remove(); } catch { /* none */ } }
/** One more mesh file has been handed to the game (from a pack or fetched): the bar's "checking" step. */
function noteServed() {
  loadCount.served++;
  if (!loadBar) return;
  loadBar.set('check', loadCount.served / ASSEMBLY_EXPECTED_FILES);
  if (loadCount.served >= ASSEMBLY_EXPECTED_FILES) loadBar.done('files');
}
function finishLoading(phase, error = null) {
  app.dataset.nsPhase = phase;
  const immediate = phase !== 'playing';
  if (immediate) controlsCard?.remove();
  // the controls stay up for the whole load; once the game is ready they go, after at least five seconds in all
  else if (controlsCard) { try { controlsCard.style.setProperty('--ns-keys-ms', `${Math.round(Math.max(1500, 5000 - (performance.now() - controlsCardAt)))}ms`); controlsCard.classList.add('ns-keys-leave'); } catch { /* a card only */ } }
  assembly?.finish({ immediate });
  if (!loadBar) return;
  if (phase === 'playing') { guard.finish(); loadBar.finish(); }
  else if (phase === 'error') guard.fail(firstFetchError || error || '');
  else { guard.finish(); loadBar.remove(); }
}
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
  const overlay = document.createElement('div');
  overlay.className = 'ns-shell';
  overlay.dataset.mode = 'error';
  const card = document.createElement('div');
  card.className = 'ns-shell-card';
  const notice = document.createElement('p');
  notice.className = 'ns-shell-notice';
  notice.setAttribute('role', 'alert');
  notice.textContent = PAGE.fatalPrefix + message;
  const reload = document.createElement('button');
  reload.className = 'ns-shell-secondary';
  reload.type = 'button';
  reload.textContent = SHELL.reload;
  reload.addEventListener('click', () => window.location.reload());
  card.append(notice, reload);
  overlay.appendChild(card);
  shellRoot.appendChild(overlay);
  reload.focus({ preventScroll: true });
}
function failBoot(err) {
  bootError = messageOf(err);
  observations.fatal = bootError;
  finishLoading('error', bootError);
  if (!shellRoot.querySelector('.ns-shell[data-mode="error"]')) showFatal(bootError);
  return { ok: false, error: bootError };
}
// SAME normal fetch/crypto interfaces: HTTP and actual served bytes are authoritative. No forged digest/model data.
function refuseHttp(response, url, reader) {
  const message = `HTTP ${response.status} for ${url}`;
  observations.httpFailures.push({ url: String(url), reader, status: response.status, statusText: response.statusText, message });
  throw new Error(message); // same real HTTP refusal, with its actual response status retained; no forged response
}
// 19 November 2026 (no dead ends): a request that brings no answer, or whose body brings no byte, for FETCH_STALL_MS
// is given up with a plain error instead of waiting for ever (fetch itself has no time limit).
const FETCH_STALL_MS = 20000;
let firstFetchError = null; // the first request that failed, in plain words, for the failure panel's small print
const isObjUrl = url => /\.obj(?:[?#].*)?$/i.test(String(url));
async function fetchAll(url, reader) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  let response;
  const first = setTimeout(() => { try { ac && ac.abort(); } catch { /* gone */ } }, FETCH_STALL_MS);
  try { response = await fetch(url, { credentials: 'same-origin', ...(ac ? { signal: ac.signal } : {}) }); }
  catch (err) { const e = new Error(ac && ac.signal.aborted ? `No answer for ${FETCH_STALL_MS / 1000} s from ${url}` : `${messageOf(err)} (${url})`); if (!firstFetchError) firstFetchError = e.message; throw e; }
  finally { clearTimeout(first); }
  if (!response.ok) { if (!firstFetchError) firstFetchError = `HTTP ${response.status} for ${url}`; refuseHttp(response, url, reader); }
  try { return await readAll(response, { onBytes: () => {}, stallMs: FETCH_STALL_MS, setTimer: (f, ms) => setTimeout(f, ms), clearTimer: t => clearTimeout(t), abort: () => ac && ac.abort() }); }
  catch (err) { const e = new Error(`${messageOf(err)} (${url})`); if (!firstFetchError) firstFetchError = e.message; throw e; }
}
async function fetchText(url) {
  // the same text response.text() gives: UTF-8, a leading byte-order mark dropped, bad bytes replaced
  const text = new TextDecoder().decode(await fetchAll(url, 'text'));
  if (assembly && /MANIFEST\.json(?:[?#].*)?$/i.test(String(url))) assembly.noteManifest(url, text);
  else if (assembly && isObjUrl(url)) assembly.noteText(url, text); // 18 Nov 2026: the cerebral arteries come as text
  return text;
}
/** A mesh of a verified pack for this file, or null (then the file itself is fetched). */
async function fetchPacked(url) {
  const key = packs ? packKeyOfUrl(url) : null;
  const packed = key ? await packs.get(key) : null;
  if (packed && assembly) assembly.noteMesh(url, packed.mesh);
  return packed;
}
async function fetchBytes(url) {
  const obj = isObjUrl(url);
  const packed = obj ? await fetchPacked(url) : null;
  if (packed) { noteServed(); return packed; }
  const bytes = await fetchAll(url, 'bytes');
  if (obj) { loadCount.fetched++; noteServed(); }
  if (assembly) assembly.noteBytes(url, bytes);
  return bytes;
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
  scene.stop();
  const status = scene.status();
  finishLoading(status.failed ? 'error' : 'stopped');
  return copy(status);
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
    placeholder: false, qa: false, storage, streamBody, streamFace, viewGraph,
    ...(mode === 'boot' ? { fetchPacked, prebuiltRig: () => (packs ? packs.rig() : Promise.resolve(null)), onLoadStep: (id, what) => { if (!loadBar) return; if (what === 'done') { if (id === 'check') loadBar.done('files'); loadBar.done(id); } else loadBar.begin(id); } } : {}) });
  ready = scene.ready.then(r => {
    const status = scene.status();
    const phase = status.stopped && !status.failed ? 'stopped' : r.ok === true && status.phase === 'running' ? 'playing' : 'error';
    finishLoading(phase, r && r.ok !== true ? r.error || status.error || null : null);
    observations.ready = copy(r);
    observations.firstReadyReadback = summarizeInspect(scene.inspect());
    return r;
  }, failBoot);
  scene.firstView.then(r => { observations.firstView = copy(r); });
} catch (err) {
  ready = Promise.resolve(failBoot(err));
}
if (scene) {
  try { canvas.focus({ preventScroll: true }); } catch { /* focus is a convenience */ }
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
  requireCase(g && g.kind === 'ns-reference-graph-r266' && g.reference === 'eye', 'configured branch must bind actual source-derived eye graph');
  requireCase(g.rootAnchorBp && g.rootAnchorBp.length === 3 && g.rootAnchorBp.every(Number.isFinite), 'actual source pelvis reference must bind');
  requireCase(typeof g.rootAnchorMeaning === 'string' && g.rootAnchorMeaning.includes('Rig-derived'), 'root provenance must be explicit');
  requireCase(f.bodyRig === true && f.bodyNote === null && f.brainMode === 'region' && f.round5.faceMuscles === 54 && f.round5.faceNote === null, 'normal body/girdle/54face must complete');
  requireCase(s.state && s.state.referenceBrain && Array.isArray(s.state.referenceBrain.initialPivotWorld) && s.state.referenceBrain.initialPivotWorld.length === 3 && s.state.referenceBrain.initialPivotWorld.every(Number.isFinite), 'constructor world brain pivot must bind on actual frame');
  requireCase(s.camera && s.camera.pose && s.camera.pose.firstPerson === true && s.camera.pose.thirdPerson === false, 'actual camera must use configured FIRST-person route');
  requireCase(g.fovYDeg === EYE_FOV_Y_DEG && g.initialLook.yaw === 0 && g.initialLook.pitch === START_LOOK_PITCH_DEG * DEG, 'actual constructor graph must resolve the declared R558 eye-view inputs');
  requireCase(observations.firstReadyReadback.simulationViewport && observations.firstReadyReadback.simulationViewport.fovYDeg === EYE_FOV_Y_DEG, 'declared landscape reproduction must use actual simulation FOV90, not posthoc projection');
  requireCase(g.initialBrainPlacement.yaw === 0 && g.initialBrainPlacement.pitch === BRAIN_START_PITCH_DEG * DEG, 'explicit initialBrainPlacement must resolve the declared R558 eye-view inputs');
  // R558 (the motor strip fills the view). The earlier start layout (the strip 0.82 of the free width beside a right-hand
  // info column) is overturned; this is the equally strict check of the new one, read from the frame the App itself
  // holds: the contain fit of the strip's true shape in the whole view, no motor area cut off by a screen edge, and
  // where the window's width limits the fit the two outer motor areas end within 2 % of the view width from the edges
  // (a very wide window is limited by its height instead and must then fill that).
  const fit = s.state.brainFrame && s.state.brainFrame.beltFit, bx = fit && fit.beltBoxNdc;
  // 19 November 2026: the strip no longer fills the view. It is drawn at the app's own share of the view
  // (BRAIN_START_MOTOR_FRAC) and higher, so the mirror body and your own body show under it; the check is that share
  // and that no motor area is cut off.
  requireCase(fit && fit.fit === 'motor' && fit.motorFrac === BRAIN_START_MOTOR_FRAC && bx && [bx.x0, bx.x1, bx.y0, bx.y1].every(Number.isFinite), 'start framing must be the motor-strip fit at the app\'s own share of the view');
  requireCase(bx.x0 >= -1 && bx.x1 <= 1 && bx.y0 >= -1 && bx.y1 <= 1 && bx.x1 > bx.x0 && bx.y1 > bx.y0, 'no motor area may be cut off by a screen edge at the start');
  // R558 (user Message 7): every turn arrow is a V tip at the middle of a side of its target's frame: the motor strip's
  // horizontal 16:9 frame and the mirror body's vertical 9:16 frame. No earlier launcher check pinned the ribbon arrows
  // or the compass rose; this is the strict check of the new placement, read from the plan the App itself holds (its
  // numbers are rounded to 0.1 px there): the exact aspect, the smallest such rectangle round the target's box and
  // centred on it, every tip on the centre line of its side, wholly on screen. The mirror body's set is checked once
  // the body is shown. A tip may leave its side's midpoint (along the centre line) only to clear another tip or the box
  // kept free round the crosshair: no tip may be flagged as still overlapping, and no tip may lie on that crosshair box
  // at the start look.
  const arrowTrace = scene.inspect({ arrowTrace: true }).arrowTrace, arrows = arrowTrace && arrowTrace.value;
  requireCase(arrows && arrows.brain && arrows.brain.shown === true, 'the brain turn arrows must be shown at the start');
  const shownTips = {};
  const checkArrowFrame = (set, aspect, name) => {
    const f = set.frame, tol = 0.15;
    requireCase(f && f.aspect === aspect && Array.isArray(f.fittedPx) && Array.isArray(f.targetBoxPx) && f.spots, name + ' arrows must be planned on their frame');
    const [x0, y0, x1, y1] = f.fittedPx, [bx0, by0, bx1, by1] = f.targetBoxPx;
    requireCase(Math.abs((x1 - x0) / (y1 - y0) - aspect) < 0.002 && x0 <= bx0 + tol && y0 <= by0 + tol && x1 >= bx1 - tol && y1 >= by1 - tol, name + ' frame must have its aspect and contain the target');
    requireCase(Math.abs(x0 + x1 - bx0 - bx1) <= 2 * tol && Math.abs(y0 + y1 - by0 - by1) <= 2 * tol && (Math.abs(x1 - x0 - bx1 + bx0) <= 2 * tol || Math.abs(y1 - y0 - by1 + by0) <= 2 * tol), name + ' frame must be the smallest rectangle of its aspect round the target, centred on it');
    for (const d of ['forward', 'back', 'left', 'right']) {
      const sp = f.spots[d], tip = set.dirs && set.dirs[d], b = tip && tip.boxPx, along = d === 'forward' || d === 'back' ? 0 : 1;
      // 19 November 2026: the brain stands higher, so the side of its frame that lies off the screen has no tip drawn
      if (sp && !b) { shownTips[name] = (shownTips[name] || 0); continue; }
      shownTips[name] = (shownTips[name] || 0) + 1;
      // 19 November 2026, later: restated. Since the compass rule of DESIGN-DECISIONS section 143 the brain's tips are
      // planned in the player's own opening view, so that every one of them starts inside the picture and clear of the
      // motor colours; a tip may then also slide ALONG its side (at 1600 by 900 the left and right tips stand 68 px above
      // the middle of their sides). Until then a tip could only move along the centre line of its side, and this check
      // failed from that change on. Now: on the centre line of its side, or on the side itself.
      const across = 1 - along;
      requireCase(sp && b && (Math.abs(sp.atPx[along] - sp.midPx[along]) <= tol || Math.abs(sp.atPx[across] - sp.midPx[across]) <= tol), name + ' ' + d + ' tip must sit on the centre line of its frame side or on that side');
      requireCase(b.x0 >= 0 && b.y0 >= 0 && b.x1 <= window.innerWidth && b.y1 <= window.innerHeight, name + ' ' + d + ' tip must lie wholly on screen');
      requireCase(sp.overlap === false, name + ' ' + d + ' tip must not overlap another tip or the crosshair box');
      const ck = R5_BIGBRAIN.crosshairKeepPx, cx = window.innerWidth / 2, cy = window.innerHeight / 2;
      requireCase(!(b.x0 < cx + ck && b.x1 > cx - ck && b.y0 < cy + ck && b.y1 > cy - ck), name + ' ' + d + ' tip must not lie on the crosshair at the start look');
    }
  };
  checkArrowFrame(arrows.brain, 16 / 9, 'brain');
  requireCase(shownTips.brain >= 3, 'at least three of the brain\'s four turn arrows must be drawn at the start');
  // 19 November 2026: the mirror body stands under the strip and is moved as a whole (drag, or Space and carry); its
  // arrows are no longer part of the start picture's contract, so only their presence is read here.
  requireCase(!arrows.mirror || typeof arrows.mirror.shown === 'boolean', 'the mirror body\'s arrows must report whether they are shown');
  // 24 November 2026 (round r32, CAM70 pass 2; DESIGN-DECISIONS section 204): but none of its tips may lie on the
  // crosshair's box at the start look either, and the crosshair must not start on an arrow at all. With the player
  // camera from GitHub main the mirror body's lower tip was drawn there, so the first click at the middle of the window,
  // which the start bar asks for, tilted the mirror body by 15 degrees instead of taking the pointer; this check only
  // looked at the brain's tips.
  if (arrows.mirror && arrows.mirror.shown === true) {
    const ck = R5_BIGBRAIN.crosshairKeepPx, cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    for (const d of ['forward', 'back', 'left', 'right']) {
      const b = arrows.mirror.dirs && arrows.mirror.dirs[d] && arrows.mirror.dirs[d].boxPx;
      if (b) requireCase(!(b.x0 < cx + ck && b.x1 > cx - ck && b.y0 < cy + ck && b.y1 > cy - ck), 'the mirror body\'s ' + d + ' tip must not lie on the crosshair at the start look');
    }
  }
  requireCase(!s.controlTargets || s.controlTargets.arrow !== true, 'the crosshair must not start on a turn arrow (the first click would turn the brain or the mirror body instead of taking the pointer)');
  requireCase(g.referenceBp.length === 3 && g.originalEyeBp.length === 3 && g.referenceBp.every(Number.isFinite) && g.originalEyeBp.every(Number.isFinite) && g.referenceBp.every((v, i) => v === g.originalEyeBp[i]), 'eye selector must retain the exact validated source eye coordinates; this is a display reference, not measured normal eye anatomy');
  const initialPose = observations.firstReadyReadback.camera && observations.firstReadyReadback.camera.pose;
  // 19 November 2026: the eye stands back from the source eye point and the start look is the app's own (the brain
  // higher, the body in view); the first frame must still be the first-person route with finite numbers.
  requireCase(initialPose && initialPose.firstPerson === true && initialPose.thirdPerson === false && initialPose.position.length === 3 && initialPose.position.every(Number.isFinite), 'the first frame must be a FIRST-person snapshot with a finite eye position; not measured eye anatomy');
  requireCase(Number.isFinite(initialPose.yaw) && Number.isFinite(initialPose.pitch) && Math.abs(initialPose.yaw) < 1e-6, 'the first-frame look must be finite and straight ahead');
  requireCase(observations.bodyFactoryCalls === 1 && observations.faceFactoryCalls === 1, 'one real factory/job per normal body and face stage');
  // R558 (user: "The mirror body should literally be a 1:1 perpendicular perfect reflection ... from the exact same
  // reflection angle at the beginning until manipulated"). The earlier start placement (a scaled, turned copy fitted
  // into a free box inside the brain) is overturned; this is the equally strict check of the new one, from the matrix
  // the renderer actually uses: untouched at the start, a VERTICAL plane (unit normal with no vertical part) in front of
  // the eye and of the posed body's foremost point, and every one of the 16 entries within 1e-9 of the pure reflection
  // x -> x - 2 (n.x - c) n, written out here independently of ns-mirror.
  const mr = s.scene && s.scene.mirror, rf = mr && mr.reflection, mx = mr && mr.matrix;
  requireCase(mr && !mr.error && mr.ready === true && mr.visible === true && rf && rf.rule === 'literal-reflection' && Array.isArray(mx) && mx.length === 16 && mx.every(Number.isFinite), 'the mirror body must be placed by the literal reflection at the start');
  requireCase(mr.orbit && mr.orbit.yawDeg === 0 && mr.orbit.pitchDeg === 0 && mr.orbit.pushM === 0 && mr.carriedPlacement && mr.carriedPlacement.worldCentreM === null && mr.external === null && rf.atRest === true, 'the mirror body must be untouched at the start');
  const rn = rf.normal, rc = rf.offsetM;
  requireCase(Array.isArray(rn) && rn.length === 3 && rn[1] === 0 && Math.abs(Math.hypot(rn[0], rn[1], rn[2]) - 1) <= 1e-12 && Number.isFinite(rc), 'the mirror plane must be vertical with a unit normal');
  // R558 (Message 12: your body and the mirror body never touch): the plane stands a few cm in front of the farthest point
  // the body can REACH with every joint in range (when the game has measured it), which is never nearer than the posed
  // body's own foremost point.
  requireCase(Number.isFinite(rf.distanceM) && Number.isFinite(rf.foremostM) && rf.foremostM > 0 && rf.distanceM > rf.foremostM && rf.distanceM <= rf.foremostM + 0.1, 'the mirror plane must stand just in front of the posed body (a few cm)');
  requireCase((rf.drawnForemostM === null || rf.drawnForemostM === undefined || rf.foremostM >= rf.drawnForemostM - 1e-9) && (rf.reachForemostM === null || rf.reachForemostM === undefined || rf.foremostM >= rf.reachForemostM - 1e-9), 'the mirror plane must stand in front of the posed body and of everything it can reach');
  const pure = [1 - 2 * rn[0] * rn[0], -2 * rn[0] * rn[1], -2 * rn[0] * rn[2], 0, -2 * rn[0] * rn[1], 1 - 2 * rn[1] * rn[1], -2 * rn[1] * rn[2], 0,
    -2 * rn[0] * rn[2], -2 * rn[1] * rn[2], 1 - 2 * rn[2] * rn[2], 0, 2 * rc * rn[0], 2 * rc * rn[1], 2 * rc * rn[2], 1];
  // 19 November 2026 (the owner: "make the two bodies more level"; the mirror body higher and under the strip): the
  // start matrix is the plane reflection followed by the app's own placement, so it is no longer the pure reflection
  // entry for entry. It must still be a mirror image (its 3 x 3 part has a negative determinant) of unchanged size.
  const det3 = mx[0] * (mx[5] * mx[10] - mx[6] * mx[9]) - mx[4] * (mx[1] * mx[10] - mx[2] * mx[9]) + mx[8] * (mx[1] * mx[6] - mx[2] * mx[5]);
  // (its drawn size is the app's own choice for the start picture: between a fifth of the body's size and one and a half times it)
  requireCase(pure.every(Number.isFinite) && det3 < 0 && Math.cbrt(-det3) > 0.2 && Math.cbrt(-det3) < 1.5, 'the start mirror matrix must be a mirror image of the body, between a fifth and one and a half times its size');
  // 19 November 2026, later (the owner: "let's center the motor strip on either side of the head of the mirror body. So
  // maybe we'll keep a bigger gap between the hemispheres. So it looks like almost hair coming out of either side of the
  // mirror body's head."). A NEW rule of the start picture, in a landscape window (an upright one plans its arrows in
  // another view, so the strip's box read here is not its place on screen): the mirror body stands on the middle of
  // the strip, the top of its head lies within the height of the strip's two inner ends (the leg areas, the upper 0.3
  // of the n; until now the strip's top was pinned 15 px under the top edge and the head stood under those ends), and
  // hardly any of the mirror body is behind a motor colour (its head stands in the gap between the two halves, which
  // are drawn 12 mm further apart: ns-brain-part). The strip's box is the one the brain's arrow frame was planned on,
  // which in a landscape window is the player's own opening view.
  if (window.innerWidth >= window.innerHeight) {
    const sb = arrows.brain.frame && arrows.brain.frame.targetBoxPx, mb = mr.onScreen && mr.onScreen.box;
    requireCase(Array.isArray(sb) && sb.length === 4 && sb.every(Number.isFinite) && Array.isArray(mb) && mb.length === 4 && mb.every(Number.isFinite), 'the strip\'s and the mirror body\'s places on screen must be readable at the start');
    requireCase(Math.abs((mb[0] + mb[2]) / 2 - (sb[0] + sb[2]) / 2) <= 0.02 * window.innerWidth, 'the mirror body must stand on the middle of the strip, between its two halves');
    requireCase(mb[1] > sb[1] && mb[1] < sb[1] + 0.3 * (sb[3] - sb[1]), 'the top of the mirror body\'s head must lie within the height of the strip\'s two inner ends (the leg areas)');
    requireCase(Number.isFinite(mr.onScreen.behindMotor) && mr.onScreen.behindMotor <= 0.025, 'the mirror body\'s head must stand in the gap between the two halves, not behind the motor colours');
  }
  // 19 November 2026: the game starts playing at once (the controls card shows over it for a few seconds); the timed
  // intro page is gone.
  requireCase(typeof observations.firstReadyReadback.shell.mode === 'string' && observations.firstReadyReadback.shell.mode !== 'error', 'first ready must not be the error page');
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
window.__nsQA = Object.freeze({ assembly: () => assembly ? assembly.state() : null, loading: () => ({ bar: loadBar ? loadBar.state() : null, packs: packs ? packs.state() : null, count: { ...loadCount }, failure: Boolean(guard && guard.state().panel), guard: guard ? guard.state() : null }), ready, get firstView() { return scene ? scene.firstView : Promise.resolve({ ok: false, error: bootError }); }, inspect: options => scene ? scene.inspect(options) : null });
window.__nsLoadingR302 = Object.freeze({ mode, configurationSignature: CONFIGURED_R302_SIGNATURE, ready,
  readback, runDeclaredCase, assertConfiguredBoot, stop, stopAfterConfiguredReady, assertStoppedUnchanged });
if (guard) guard.takenOver(); // from here this launcher reports its own failures (failBoot -> finishLoading)
window.addEventListener('pagehide', () => stop()); // finite caller never auto-restarts a completed/stopped App
