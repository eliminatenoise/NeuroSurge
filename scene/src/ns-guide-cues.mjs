// The game supplies normalized points from the current visible scene. These cues
// annotate that scene; they neither pick a region nor generate a game input.
import { tutorialGoalIds } from './ns-guide.mjs';
import { GUIDE } from './ns-text.mjs';
import { CUE_WORDS, placeCueWords } from './ns-cue-place.mjs';

const AREA_STEPS = new Set(['lookStrip', 'pressArea']);
const LIMB_STEPS = new Set(['chooseLimb', 'moveHand', 'dragLimb']);
const ARM = new Set(['leftArm', 'rightArm']);
const LEG = new Set(['leftLeg', 'rightLeg']);
const KEYS = {
  chooseLimb: /\b[1-4]\b/g,
  moveHand: /\b[WASD]\b/g,
  dragBrain: /\bSpace\b/g,
  thirdPerson: /\bE\b/g,
  readInfo: /\bR\b/g
};
let nextId = 0;

function element(parent, tag, className, text) {
  const node = parent.ownerDocument.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  parent.appendChild(node);
  return node;
}

function validPoint(point) {
  return point && point.visible !== false && point.occluded !== true &&
    Number.isFinite(point.x) && point.x >= 0 && point.x <= 1 &&
    Number.isFinite(point.y) && point.y >= 0 && point.y <= 1 &&
    typeof point.label === 'string' && point.label.trim();
}

// Keep the original status text, reading order and owner intact. The keycaps
// have no event listeners or tab stops; the game's real controls keep focus.
function decorateKeys(prompt, step) {
  const text = prompt.textContent;
  const pattern = KEYS[step];
  const matches = pattern ? [...text.matchAll(pattern)] : [];
  if (!matches.length) return;
  const doc = prompt.ownerDocument;
  const fragment = doc.createDocumentFragment();
  let end = 0;
  for (const match of matches) {
    fragment.append(doc.createTextNode(text.slice(end, match.index)));
    const key = doc.createElement('kbd');
    key.className = 'ns-guide-key';
    key.textContent = match[0];
    fragment.append(key);
    end = match.index + match[0].length;
  }
  fragment.append(doc.createTextNode(text.slice(end)));
  prompt.replaceChildren(fragment);
}

function descriptionLink(prompt, id, add) {
  if (!prompt) return;
  const values = new Set((prompt.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
  if (add) values.add(id);
  else values.delete(id);
  if (values.size) prompt.setAttribute('aria-describedby', [...values].join(' '));
  else prompt.removeAttribute('aria-describedby');
}

// 24 November 2026 (round r33, UI5): the words' box as guide-cues.css draws it (font 600 12px/1.2, padding 2px 5px,
// at most min(13rem, 34vw) wide), from the font's own measure (a canvas: no layout of the page), or null.
const WORDS_FONT = Object.freeze({ font: '600 12px system-ui, sans-serif', lineHeight: 14.4, padX: 5, padY: 2, maxRem: 13, maxVw: 0.34 });
let measureCtx = null;
const wordsSizes = new Map();
function wordsSize(doc, text, viewWidth) {
  const key = text + '|' + viewWidth;
  const known = wordsSizes.get(key);
  if (known) return known;
  try {
    if (!measureCtx) { const c = doc && typeof doc.createElement === 'function' ? doc.createElement('canvas') : null; measureCtx = c && typeof c.getContext === 'function' ? c.getContext('2d') : null; }
    if (!measureCtx || typeof measureCtx.measureText !== 'function') return null;
    measureCtx.font = WORDS_FONT.font;
    const textW = measureCtx.measureText(text).width, maxW = Math.min(WORDS_FONT.maxRem * 16, WORDS_FONT.maxVw * viewWidth);
    if (!(textW > 0)) return null;
    const lines = Math.max(1, Math.ceil(textW / Math.max(1, maxW - 2 * WORDS_FONT.padX)));
    const size = { w: Math.ceil(Math.min(textW + 2 * WORDS_FONT.padX, maxW)), h: Math.ceil(lines * WORDS_FONT.lineHeight + 2 * WORDS_FONT.padY) };
    if (wordsSizes.size > 64) wordsSizes.clear();
    wordsSizes.set(key, size);
    return size;
  } catch { return null; }
}

// 24 November 2026 (round r33, UI5; ns-cue-place): with `place` ({ width, height, keepOut: { key, boxes } }, CSS px
// of the host) the words take the nearest clear place round the ring (placeCueWords) instead of the fixed place over
// or under it; the words' size is worked out when the caption or the host's width changes, the place is worked out
// again only when the ring, the words' size or a keep-out box moved. Without it, as before (data-vertical,
// data-anchor).
// (Pass 2, the check of pass 1: the words keep the place they have, as an offset from the ring, while it stays clear
// (CUE_WORDS.keepBonus); the place is chosen afresh when it is hit, or when the step or the host's size changes, or the
// cue was hidden. They keep to the ring's half of the brain: keepOut.half, CUE_WORDS.sameHalf. Pass 3, the check of
// pass 2: a hit place slides along its side first and otherwise goes to the nearest clear place (ns-cue-place slide,
// nearFirst); the side just left is passed back as `avoid` for CUE_WORDS.backFrames placements; a new caption keeps
// the place, its near edge where it was (CUE_WORDS.keepAcross; pass 2 chose it afresh on every caption).)
// 24 November 2026 (HUD74; the hunt of update 73, finding 3: in step 6 the word "Brain" lay on the words "Shoulder aim",
// 40 x 16 px at 1280x720, and at 1024x768 on that mark itself and its ring under the words): the marks' half sizes as
// guide-cues.css draws them (a mark that is not shown has no size on the page), and how much one mark's ring and words
// weigh for another mark's words (ns-cue-place keep-outs: a label weighs 1, an arrow 2, a card 8).
export const CUE_RINGS = Object.freeze({ motor: Object.freeze([15, 15]), limb: Object.freeze([7.5, 7.5]), brain: Object.freeze([13, 13]), joint: Object.freeze([14, 4]) });
export const CUE_APART = Object.freeze({ on: true, ringWeight: 4, wordsWeight: 8 });

function marker(layer, name) {
  const node = element(layer, 'span', 'ns-guide-mark ns-guide-mark-' + name);
  node.hidden = true;
  const label = element(node, 'span', 'ns-guide-mark-name');
  let lastX, lastY, lastColor, wordsW = 0, wordsH = 0, ringHalf = 0, ringHalfY = 0, ringEdge = 0, ringEdgeY = 0;
  // (HUD74) this mark's ring and its words as last placed, CSS px of the host, for the other marks' words
  const ringBox = { x0: 0, y0: 0, x1: 0, y1: 0, weight: CUE_APART.ringWeight, on: false }, wordsBox = { x0: 0, y0: 0, x1: 0, y1: 0, weight: CUE_APART.wordsWeight, on: false };
  // what the words' size was worked out for (separate fields, pass 3: no key string a frame)
  let sCaption = null, sWidth = NaN, sHeight = NaN, sStep = null;
  // the last inputs placed for (numbers: no key string a frame), the words' kept offset and the last values written
  let kx = NaN, ky = NaN, kKeep = NaN, kHalf = null, kW = 0, kH = 0, keepDx = NaN, keepDy = NaN, cssX = '', cssY = '';
  let prevX = NaN, prevY = NaN; // (the ring's place one update ago: how far the frame-behind keep-outs lag, ns-cue-place lagDx)
  // (pass 3) the side the words have, the side they last left and until which placement it is avoided
  let side = '', leftSide = '', avoidUntil = 0, placements = 0;
  const keep = { dx: NaN, dy: NaN }, placed = {};
  function forget() { kx = NaN; keepDx = NaN; keepDy = NaN; prevX = NaN; prevY = NaN; side = ''; leftSide = ''; avoidUntil = 0; }
  function unplace() {
    forget();
    if (!node.dataset.place) return;
    delete node.dataset.place;
    node.style.removeProperty('--ns-cue-x');
    node.style.removeProperty('--ns-cue-y');
    cssX = ''; cssY = '';
  }
  function placeWords(point, caption, place) {
    wordsBox.on = false;
    if (!(CUE_WORDS.on && place && place.width > 0 && place.height > 0 && place.keepOut && Array.isArray(place.keepOut.boxes))) { unplace(); return; }
    const step = place.step || '';
    if (caption !== sCaption || place.width !== sWidth || place.height !== sHeight || step !== sStep) {
      // (a new step or size: the words' place is chosen afresh; pass 3, CUE_WORDS.keepAcross: a new caption alone keeps
      // it, the edge nearer the ring where it was: beside the ring on the left, the right edge; otherwise the left edge
      // and, over the ring, the bottom edge)
      const across = CUE_WORDS.keepAcross && sCaption !== null && step === sStep && place.width === sWidth && place.height === sHeight && Number.isFinite(keepDx);
      const oldW = wordsW, oldH = wordsH, oldSide = side;
      sCaption = caption; sWidth = place.width; sHeight = place.height; sStep = step;
      if (!across) forget();
      // (the ring's size is read from the page once; the words' size is worked out from the font, not read from the
      // page: the caption changes as the look crosses the strip, and a read there laid the page out again in the middle
      // of the frame, which the frame table's look phase showed)
      if (!(ringHalf > 0)) { ringHalf = node.offsetWidth / 2; ringHalfY = node.offsetHeight / 2; ringEdge = node.clientLeft || 0; ringEdgeY = node.clientTop || 0; }
      const size = wordsSize(node.ownerDocument, caption, place.width);
      wordsW = size ? size.w : label.offsetWidth; wordsH = size ? size.h : label.offsetHeight;
      if (across && oldW > 0 && oldH > 0) {
        keepDx += (oldSide === 'left' ? -1 : 1) * (wordsW - oldW) / 2;
        keepDy += (oldSide === 'above' ? -1 : 1) * (wordsH - oldH) / 2;
      }
    }
    if (!(wordsW > 0 && wordsH > 0 && ringHalf > 0)) { unplace(); sCaption = null; return; }
    const x = point.x * place.width, y = point.y * place.height, rx = Math.round(x), ry = Math.round(y);
    const half = place.keepOut.half || null;
    const lagDx = Number.isFinite(prevX) ? x - prevX : 0, lagDy = Number.isFinite(prevY) ? y - prevY : 0;
    prevX = x; prevY = y;
    if (rx === kx && ry === ky && place.keepOut.key === kKeep && half === kHalf && wordsW === kW && wordsH === kH) { wordsBox.on = wordsBox.x1 > wordsBox.x0; return; }
    kx = rx; ky = ry; kKeep = place.keepOut.key; kHalf = half; kW = wordsW; kH = wordsH;
    keep.dx = keepDx; keep.dy = keepDy;
    placements++;
    const b = placeCueWords({ x, y, ringHalfPx: ringHalf, ringHalfYPx: ringHalfY, w: wordsW, h: wordsH, width: place.width, height: place.height,
      keepOut: place.keepOut.boxes, keep: Number.isFinite(keepDx) ? keep : null, half, out: placed, lagDx, lagDy,
      avoid: leftSide && placements <= avoidUntil ? leftSide : null });
    if (!b) { unplace(); return; }
    wordsBox.x0 = b.x0; wordsBox.y0 = b.y0; wordsBox.x1 = b.x1; wordsBox.y1 = b.y1; wordsBox.on = true;
    keepDx = b.dx; keepDy = b.dy; // (the place is remembered, clear or not: ns-cue-place keepBonus, keepBadFrac)
    if (side && b.side !== side) { leftSide = side; avoidUntil = placements + (CUE_WORDS.backFrames || 0); }
    side = b.side;
    // the words are a child of the ring: their place counts from the ring's padding box (inside its border)
    const ox = x - ringHalf + ringEdge, oy = y - ringHalfY + ringEdgeY;
    const sx = Math.round(b.x0 - ox) + 'px', sy = Math.round(b.y0 - oy) + 'px';
    if (sx !== cssX) { node.style.setProperty('--ns-cue-x', sx); cssX = sx; }
    if (sy !== cssY) { node.style.setProperty('--ns-cue-y', sy); cssY = sy; }
    if (node.dataset.place !== b.side) node.dataset.place = b.side;
    const cl = b.clear ? 'true' : 'false', kp = b.slid ? 'slid' : b.kept ? 'true' : 'false';
    if (node.dataset.placeClear !== cl) node.dataset.placeClear = cl;
    if (node.dataset.placeKept !== kp) node.dataset.placeKept = kp; // (readback: the place was kept, or slid (pass 3), not chosen afresh)
  }
  return {
    ringBox, wordsBox,
    /** (HUD74) Where this mark's ring will be for `point` in a host `width` x `height`: fills ringBox (on false: no mark). */
    ring(point, width, height) {
      const half = CUE_RINGS[name];
      ringBox.on = Boolean(half) && validPoint(point) && width > 0 && height > 0;
      if (!ringBox.on) { wordsBox.on = false; return ringBox; }
      const x = point.x * width, y = point.y * height;
      ringBox.x0 = x - half[0]; ringBox.x1 = x + half[0]; ringBox.y0 = y - half[1]; ringBox.y1 = y + half[1];
      return ringBox;
    },
    move(point, prefix = '', place = null) {
      if (!validPoint(point)) {
        if (!node.hidden) node.hidden = true;
        forget(); // (pass 2: shown again, the words' place is chosen afresh)
        wordsBox.on = false;
        return;
      }
      node.hidden = false;
      const x = Math.round(point.x * 10000) / 100;
      const y = Math.round(point.y * 10000) / 100;
      if (x !== lastX) {
        node.style.left = x + '%';
        node.dataset.anchor = x > 67 ? 'left' : x < 33 ? 'right' : 'centre';
        lastX = x;
      }
      if (y !== lastY) {
        node.style.top = y + '%';
        node.dataset.vertical = y < 16 ? 'below' : 'above';
        lastY = y;
      }
      const color = /^#[\da-f]{6}$/i.test(point.color || '') ? point.color : '';
      if (color !== lastColor) {
        if (color) node.style.setProperty('--ns-guide-mark-color', color);
        else node.style.removeProperty('--ns-guide-mark-color');
        lastColor = color;
      }
      const caption = prefix ? prefix + ' · ' + point.label : point.label;
      if (label.textContent !== caption) label.textContent = caption;
      placeWords(point, caption, place);
    }
  };
}

/**
 * Mount in a positioned, canvas-sized host. Give `motor` the actual visible
 * hit-tested effector and `limb` its matching visible limb, or null. For
 * choose/move/drag, limb instead refers to the selected visible limb. Optional
 * brain is a verified visible grip/drag point. No screen coordinates are guessed.
 * Call update AFTER the normal HUD prompt is drawn; null hides all cues.
 */
export function createGuideCues(host, { prompt: givenPrompt = null } = {}) {
  const layer = element(host, 'div', 'ns-guide-cues');
  layer.setAttribute('aria-hidden', 'true');
  layer.hidden = true;
  const motorMark = marker(layer, 'motor');
  const limbMark = marker(layer, 'limb');
  const jointMark = marker(layer, 'joint');
  const brainMark = marker(layer, 'brain');
  const description = element(host, 'span', 'ns-guide-sr');
  description.id = 'ns-guide-cue-description-' + ++nextId;
  let prompt = givenPrompt;
  let lastStep = null, lastChild = null, disposed = false;
  const place = { width: 0, height: 0, keepOut: null, step: '' };
  // (HUD74, CUE_APART) a mark's own list of keep-outs: the game's, then `others`: the other marks' rings and the words
  // of the marks placed before it (the marks' own boxes, filled in place). The lists and the place objects are made
  // once and refilled: nothing is made per frame.
  const apart = others => ({ others, keepOut: { key: 0, boxes: [], half: null }, place: { width: 0, height: 0, keepOut: null, step: '' } });
  const apartLimb = apart([motorMark.ringBox, jointMark.ringBox, brainMark.ringBox, motorMark.wordsBox]);
  const apartJoint = apart([motorMark.ringBox, limbMark.ringBox, brainMark.ringBox, motorMark.wordsBox, limbMark.wordsBox]);
  const apartBrain = apart([motorMark.ringBox, limbMark.ringBox, jointMark.ringBox, motorMark.wordsBox, limbMark.wordsBox, jointMark.wordsBox]);
  function placeFor(own, base) {
    if (!base || !CUE_APART.on) return base;
    const B = own.keepOut.boxes, src = base.keepOut.boxes, O = own.others;
    let n = 0, h = base.keepOut.key % 2147483629;
    for (let i = 0; i < src.length; i++) B[n++] = src[i];
    for (let i = 0; i < O.length; i++) {
      const b = O[i];
      if (!b.on) continue;
      B[n++] = b;
      h = (h * 31 + Math.round(b.x0) * 7 + Math.round(b.y0) * 13 + Math.round(b.x1) * 17 + Math.round(b.y1) * 19 + b.weight) % 2147483629;
    }
    B.length = n;
    own.keepOut.key = h * 64 + n; own.keepOut.half = base.keepOut.half || null;
    own.place.width = base.width; own.place.height = base.height; own.place.step = base.step; own.place.keepOut = own.keepOut;
    return own.place;
  }
  const scope = host.closest('.ns-app') || host;
  function clearPrompt() {
    if (prompt && prompt.querySelector('.ns-guide-key')) prompt.textContent = prompt.textContent;
    descriptionLink(prompt, description.id, false);
    lastStep = null;
    lastChild = null;
  }
  function update(input = {}) {
    if (disposed) return;
    const g = input?.guide;
    const active = input?.tutorial === true && g?.visible === true && !g.finished && !!g.goalId;
    const step = active ? g.goalId : null;
    const joint = input?.showJointAim === true ?
      (ARM.has(input.selectedLimb) ? GUIDE.cue.shoulder : LEG.has(input.selectedLimb) ? GUIDE.cue.hip : null) : null;
    if (!active && !joint) {
      if (!layer.hidden) {
        layer.hidden = true;
        description.textContent = '';
        clearPrompt();
      }
      return;
    }
    if (!prompt || !prompt.isConnected) prompt = givenPrompt?.isConnected ? givenPrompt : scope.querySelector('.ns-prompt-words');
    const first = layer.hidden;
    layer.hidden = false;
    if (!active) clearPrompt();
    else if (prompt && (first || lastStep !== step || lastChild !== prompt.firstChild)) {
      if (prompt.querySelector('.ns-guide-key')) prompt.textContent = prompt.textContent;
      decorateKeys(prompt, step);
      descriptionLink(prompt, description.id, true);
      lastChild = prompt.firstChild;
    }
    lastStep = step;
    const motor = AREA_STEPS.has(step) && validPoint(input.motor) ? input.motor : null;
    const limb = (motor || LIMB_STEPS.has(step)) && validPoint(input.limb) ? input.limb : null;
    const brain = (step === 'dragBrain' || step === 'orbit') && validPoint(input.brain) ? input.brain : null;
    // (24 November 2026, UI5: the host's size and what the words keep clear of, when the game hands them in)
    if (input.keepOut && Number.isFinite(input.width) && Number.isFinite(input.height)) { place.width = input.width; place.height = input.height; place.keepOut = input.keepOut; place.step = step || ''; }
    else place.keepOut = null;
    const at = place.keepOut ? place : null;
    // Two targets at the same place should leave the primary motor marker legible.
    const tooClose = limb && motor && Math.abs(limb.x - motor.x) < .10 && Math.abs(limb.y - motor.y) < .055;
    const limbPoint = tooClose ? null : limb, jointPoint = joint ? { x: .5, y: input.jointAimY ?? .25, label: joint } : null;
    // (HUD74, CUE_APART: the words of the limb's, the joint's and the brain's mark keep clear of every other mark's ring
    // and of the words placed before theirs: the limb's, then the joint's, then the brain's. In steps 1 and 2, where
    // the motor area's mark shows with its body part's, both are placed as they were: section 205 measured them.)
    const w = at ? at.width : 0, hh = at ? at.height : 0;
    motorMark.ring(motor, w, hh); limbMark.ring(limbPoint, w, hh); jointMark.ring(jointPoint, w, hh); brainMark.ring(brain, w, hh);
    motorMark.move(motor, GUIDE.cue.motor, at);
    limbMark.move(limbPoint, motor ? GUIDE.cue.limb : '', motor ? at : placeFor(apartLimb, at));
    jointMark.move(jointPoint, '', placeFor(apartJoint, at));
    brainMark.move(brain, '', placeFor(apartBrain, at));
    const words = [];
    if (motor) words.push(GUIDE.cue.motor + ': ' + motor.label);
    if (limb) words.push(GUIDE.cue.limb + ': ' + limb.label);
    if (joint) words.push(joint + '. ' + GUIDE.cue.jointHelp);
    if (brain) words.push(brain.label);
    const text = words.join('. ');
    if (description.textContent !== text) description.textContent = text;
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    clearPrompt();
    layer.remove();
    description.remove();
  }
  return { update, dispose };
}

/** User-initiated actions. The embedding shell supplies the existing show and
 * restart callbacks. Simply opening the instructions does not alter progress. */
export function mountGuideActions(host, { onShow, onRestart, features = {}, installed = {} } = {}) {
  const details = element(host, 'details', 'ns-guide-actions');
  const heading = element(details, 'summary', 'ns-guide-summary', GUIDE.cue.guide);
  element(details, 'h3', 'ns-guide-subheading', GUIDE.cue.simpleHeading);
  const list = element(details, 'ol', 'ns-guide-steps');
  for (const step of tutorialGoalIds(features)) {
    element(list, 'li', '', GUIDE.tutorialGoals[step] ?? GUIDE.goals[step]);
  }
  element(details, 'p', 'ns-guide-note', GUIDE.cue.limits);
  element(details, 'p', 'ns-guide-note', GUIDE.cue.progress);
  if (features.jointAim === true) element(details, 'p', 'ns-guide-note', GUIDE.cue.jointHelp);
  if (installed.directions === true) element(details, 'p', 'ns-guide-note', GUIDE.cue.directions);
  if (installed.camera === true) element(details, 'p', 'ns-guide-note', GUIDE.cue.camera);
  for (const [label, callback] of [[GUIDE.cue.resume, onShow], [GUIDE.cue.restart, onRestart]]) {
    if (typeof callback !== 'function') continue;
    const button = element(details, 'button', 'ns-guide-action', label);
    button.type = 'button';
    button.addEventListener('click', () => callback());
  }
  const technical = element(details, 'details', 'ns-guide-technical');
  element(technical, 'summary', 'ns-guide-summary', GUIDE.cue.technicalHeading);
  element(technical, 'p', 'ns-guide-note', GUIDE.cue.technical);
  return {
    open() { details.open = true; heading.focus(); },
    dispose() { details.remove(); }
  };
}
