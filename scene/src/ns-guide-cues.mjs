// The game supplies normalized points from the current visible scene. These cues
// annotate that scene; they neither pick a region nor generate a game input.
import { tutorialGoalIds } from './ns-guide.mjs';
import { GUIDE } from './ns-text.mjs';

const AREA_STEPS = new Set(['lookStrip', 'pressArea']);
const LIMB_STEPS = new Set(['chooseLimb', 'aimJoint', 'moveHand', 'dragLimb']);
const ARM = new Set(['leftArm', 'rightArm']);
const LEG = new Set(['leftLeg', 'rightLeg']);
const KEYS = {
  chooseLimb: /\b[1-4]\b/g,
  aimJoint: /\bE\b/g,
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

function marker(layer, name) {
  const node = element(layer, 'span', 'ns-guide-mark ns-guide-mark-' + name);
  node.hidden = true;
  const label = element(node, 'span', 'ns-guide-mark-name');
  let lastX, lastY, lastColor;
  return {
    move(point, prefix = '') {
      if (!validPoint(point)) {
        if (!node.hidden) node.hidden = true;
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
    motorMark.move(motor, GUIDE.cue.motor);
    // Two targets at the same place should leave the primary motor marker legible.
    const tooClose = limb && motor && Math.abs(limb.x - motor.x) < .10 && Math.abs(limb.y - motor.y) < .055;
    limbMark.move(tooClose ? null : limb, motor ? GUIDE.cue.limb : '');
    brainMark.move(brain);
    jointMark.move(joint ? { x: .5, y: input.jointAimY ?? .25, label: joint } : null);
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
