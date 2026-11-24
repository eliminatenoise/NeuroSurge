import {parseGoal} from './joint/landmark.mjs';
import {bindGripPreview, gripCommand} from './grip-preview/panel.mjs';
import {bindWristForecast} from './camera/wrist-forecast/panel.mjs';
import {bindReachStudy} from './camera/reach-study/panel.mjs';
import {comparisonNames} from './camera/take-comparison.mjs';
import {bindNamedTakes, namedReplayRequest, namedIntervalRequest, resolveTakeInterval, resolveTakeSequence, takeSeconds} from './camera/named-takes.mjs';
import { actionFor } from './word-motion/inference.mjs';
import { bindWordMotion } from './word-motion/player.mjs';

// Each phrase addresses one existing movement on the virtual body. Never discard
// negative words, multiple actions or the arm/leg side to force a match.
function normalize(phrase) {
  return phrase.toLowerCase().trim().replace(/[.!?]+$/, '').replace(/^please\s+/, '')
    .replace(/\b(?:my|your|the)\s+(?=left\b|right\b)/g, '').replace(/\s+/g, ' ');
}

const walkingInstructions = new Map([
  ['forecast my usual walk', 4],
  ['forecast usual walking', 4],
  ['forecast walking as usual', 4],
  ['forecast as usual', 4],
  ['forecast fast walking without running', 5],
  ['forecast walking fast but not running', 5],
  ['forecast fast but not running', 5]
]);

const movementPhrases = [
  ['elbow', ['bend', 'flex'], 'elbow_flexion', 'lh_r_elbow_flex', 'flexion'],
  ['elbow', ['straighten', 'extend'], 'elbow_extension', 'lh_r_elbow_extend', 'extension'],
  ['forearm', ['pronate'], 'pronation', 'lh_r_pronate', 'pronation'],
  ['forearm', ['supinate'], 'supination', 'lh_r_supinate', 'supination'],
  ['wrist', ['bend', 'flex'], 'wrist_flexion', 'lh_r_wrist_flex'],
  ['wrist', ['straighten', 'extend'], 'wrist_extension', 'lh_r_wrist_ext'],
  ['knee', ['bend', 'flex'], 'rh_knee_flex', 'lh_knee_flex'],
  ['knee', ['straighten', 'extend'], 'rh_knee_extend', 'lh_knee_extend'],
  ['hand', ['open'], 'open_hand', 'lh_r_open', 'open'],
  ['hand', ['close'], 'grasp_close', 'lh_r_grasp', 'close'],
  ['fingers', ['spread'], 'spread_fingers', 'lh_r_spread'],
];
const phrases = new Map();
for (const [part, verbs, left, right, cue] of movementPhrases) {
  for (const [side, id] of [['left', left], ['right', right]]) {
    if (cue) phrases.set(side + ' ' + part + ' ' + cue, id);
    if (part === 'forearm') phrases.set('turn ' + side + ' palm ' + (cue === 'pronation' ? 'down' : 'up'), id);
    for (const verb of verbs) phrases.set(verb + ' ' + side + ' ' + part, id);
  }
}

export function resolveAction(phrase, bodyMap) {
  if (typeof phrase !== 'string' || phrase.length > 160) return null;
  const id = phrases.get(normalize(phrase));
  if (!id) return null;
  for (const region of bodyMap?.regions || []) {
    const action = region.actions.find(item => item.id === id);
    if (action) {
      const forearm = region.id === 'rh_forearm' || region.id === 'lh_forearm';
      return { type: 'muscle', regionId: region.id, actionId: id, ...(forearm ? { isolateForearm: true } : {}) };
    }
  }
  return null;
}

// Resolve the whole instruction against the same side-specific map before resuming play.
export function resolveActionSequence(phrase, bodyMap) {
  if (typeof phrase !== 'string' || !/\bthen\b/i.test(phrase)) return null;
  if (phrase.length > 500) return {error: 'Use up to four short movements, joined by “then”.'};
  const clauses = phrase.split(/\s*,?\s*\b(?:and\s+)?then\b\s*/i);
  if (clauses.length > 4) {
    return {error: 'Use up to four movements, joined by “then”.'};
  }
  const steps = [];
  for (const clause of clauses) {
    const action = resolveAction(clause, bodyMap);
    if (!action) return {error: `Step ${steps.length + 1} needs one supported movement and a side. No steps started.`};
    steps.push({action, label: normalize(clause)});
  }
  return {steps};
}

// These commands open named recordings from the CMU catalogue. They share the
// input box with avatar commands and go to the recording viewer's own clock.
const recordings = new Map([
  ['bend, scoop and lift', '02_06'], ['bend scoop and lift', '02_06'], ['scoop and lift', '02_06'],
  ['forward jump', '13_11'], ['jump forward', '13_11'],
  ['left-foot hop', '132_23'], ['left foot hop', '132_23'], ['hop on left foot', '132_23']
]);

export function resolveReplay(phrase) {
  if (typeof phrase !== 'string' || phrase.length > 160) return null;
  const match = /^replay (?:a |the )?(.+)$/.exec(normalize(phrase));
  return match ? recordings.get(match[1]) || null : null;
}

const wordForms = new Map([
  ['bends', 'bend'], ['bending', 'bend'], ['bent', 'bend'],
  ['scoops', 'scoop'], ['scooping', 'scoop'], ['scooped', 'scoop'],
  ['lifts', 'lift'], ['lifting', 'lift'], ['lifted', 'lift'],
  ['rises', 'rise'], ['rising', 'rise'], ['rose', 'rise'],
  ['jumps', 'jump'], ['jumping', 'jump'], ['jumped', 'jump'],
  ['hops', 'hop'], ['hopping', 'hop'], ['hopped', 'hop'], ['forwards', 'forward']
]);
const linkingWords = new Set(['a', 'an', 'the', 'my', 'your', 'on', 'and', 'then']);
const movements = new Set(['bend', 'scoop', 'lift', 'rise', 'jump', 'hop']);

function catalogueWords(text) {
  return text.toLowerCase().trim().replace(/[.!?]+$/, '')
    .replace(/([a-z])[-,](?=[a-z ]|$)/g, '$1 ')
    .split(/\s+/).filter(word => word && !linkingWords.has(word))
    .map(word => wordForms.get(word) || word);
}

// Match words against a single catalogue label or description. An unfamiliar
// qualifier (e.g. "right", "backwards" or "not") must survive this comparison.
export function findBodyRecordings(phrase, clips) {
  if (typeof phrase !== 'string' || phrase.length > 500) return [];
  if (!phrase.trim()) return clips;
  const description = phrase.trim().replace(/^please\s+/i, '').replace(/^(?:show me|replay)\s+/i, '');
  const words = catalogueWords(description);
  if (!words.length) return [];
  const actions = words.filter(word => movements.has(word));
  return clips.filter(clip => [clip.label, clip.description].some(text => {
    if (typeof text !== 'string') return false;
    const terms = catalogueWords(text);
    if (!words.every(word => terms.includes(word))) return false;
    let index = 0;
    for (const term of terms) if (term === actions[index]) index++;
    return index === actions.length;
  }));
}

import {isTouchQuestion} from './joint/touch.mjs';

export function bindActionChat({ dialog, trigger, canvas, canOpen, pause, resume, getBodyMap, hasAvatarRig, getLatestTake, replayTake, replayTakes, runJointGoal, askTouch, takeRecorderInstruction = 'Press C to open the recorder.' }) {
  const win = dialog.ownerDocument.defaultView;
  const field = dialog.querySelector('input');
  const message = dialog.querySelector('[role=status]');
  const form = dialog.querySelector('form');
  const results = dialog.querySelector('[data-body-results]');
  const speak = dialog.querySelector('[data-speak]');
  const close = dialog.querySelector('[data-close]');
  const Recognition = win.SpeechRecognition || win.webkitSpeechRecognition;
  const localSpeech = Boolean(Recognition && 'processLocally' in Recognition.prototype);
  const unavailable = 'Voice is unavailable on this device. Type your movement.';
  const stoppedMessage = 'Dictation stopped. Type your movement or try again.';
  const localGoalHelp = 'Open the game over HTTPS or use the local NeuroTranslate launcher for movement goals.';
  const localTouchHelp = 'This forecast uses the local fingertip touch launcher. Open that launcher to run it.';
  for (const tip of dialog.querySelectorAll('[data-checkpoint-required]')) tip.hidden = !runJointGoal;
  const localModelLink = dialog.querySelector('[data-start-local-model]');
  if (localModelLink) localModelLink.hidden = Boolean(askTouch);
  const named = bindNamedTakes(dialog.querySelector('[data-named-takes]'), getLatestTake);
  let recognition = null;
  let manifestRequest;
  let searchVersion = 0;
  const generated = bindWordMotion(dialog.querySelector('[data-word-motion]'), () => dismiss());

  const reachStudy = bindReachStudy(dialog.querySelector('[data-reach-study]'), getLatestTake, () => dismiss(), takeRecorderInstruction);

  const gripPanel = dialog.querySelector('[data-grip-preview]');
  const grip = bindGripPreview(gripPanel, () => dismiss());
  const wristPanel = dialog.querySelector('[data-wrist-forecast]');
  const wristForecast = bindWristForecast(wristPanel, getLatestTake, () => dismiss(), takeRecorderInstruction);

  function clearSearch() {
    searchVersion++;
    results.replaceChildren();
    results.hidden = true;
  }

  async function findRecordings(browse) {
    clearSearch();
    const version = searchVersion;
    const words = field.value;
    if (!browse && !words.trim()) {
      message.textContent = 'Type a movement, or choose Find body recording to browse the catalogue.';
      return;
    }
    message.textContent = 'Checking the recording catalogue…';
    try {
      manifestRequest ??= import('./activity/spatial-recording.mjs').then(module => module.readManifest())
        .catch(error => { manifestRequest = null; throw error; });
      const manifest = await manifestRequest;
      if (version !== searchVersion || !dialog.open) return;
      const matches = findBodyRecordings(words, manifest.clips);
      if (!matches.length) {
        message.textContent = browse
          ? 'No matching whole-body recording. Clear the words and choose Find body recording to see all the titles.'
          : 'Try one movement with a side, such as “Bend my right knee”. No whole-body recording matches these words. For the printer task, choose Find hand recording.';
        field.focus();
        return;
      }
      for (const clip of matches) {
        const button = dialog.ownerDocument.createElement('button');
        button.type = 'button';
        button.textContent = clip.label;
        button.dataset.clipId = clip.id;
        results.append(button);
      }
      message.textContent = 'Choose a lab recording to see the tracked body markers.';
      results.hidden = false;
      results.firstElementChild.focus();
    } catch {
      if (version === searchVersion && dialog.open)
        message.textContent = 'The recording catalogue could not open. Choose Find body recording to retry.';
    }
  }

  function stopVoice() {
    if (!recognition) return;
    const active = recognition;
    recognition = null;
    active.onresult = active.onend = active.onerror = null;
    try { active.abort(); } catch { /* already ended */ }
    speak.disabled = !localSpeech;
    if (message.textContent === 'Listening…') message.textContent = stoppedMessage;
  }

  function open() {
    if (dialog.open || !canOpen()) return;
    pause();
    named.reset();
    dialog.showModal();
    clearSearch();
    field.value = '';
    message.textContent = localSpeech ? '' : unavailable;
    speak.disabled = !localSpeech;
    field.focus();
  }

  function dismiss(action = null, returnToGame = true) {
    if (!dialog.open) return;
    stopVoice();
    clearSearch();
    dialog.close();
    generated.reset();
    reachStudy.reset();
    wristForecast.reset();
    if (!gripPanel.hidden) {
      grip.reset();
      field.value = '';
    }
    form.hidden = false;
    dialog.setAttribute('aria-labelledby', 'ns-chat-label');
    dialog.setAttribute('aria-describedby', 'ns-chat-help');
    if (returnToGame) {
      canvas.focus({ preventScroll: true });
      resume(action);
    }
  }

  function openPanel(eventType, options) {
    dismiss(() => dialog.ownerDocument.dispatchEvent(new win.CustomEvent(eventType, options)));
  }

  function shortcut(event) {
    if (event.isComposing) return;
    if (dialog.open) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        dismiss();
      }
      return;
    }
    if (event.code !== 'KeyF' || event.repeat || event.ctrlKey || event.altKey || event.metaKey ||
        event.target?.isContentEditable || event.target?.closest?.('input, textarea, select, button, a[href]') || !canOpen()) return;
    event.preventDefault();
    open();
  }

  function submit(event) {
    event.preventDefault();
    if (event.submitter?.hasAttribute('data-find-body')) {
      findRecordings(true);
      return;
    }
    if (event.submitter?.hasAttribute('data-find-hand')) {
      const text = field.value.trim();
      openPanel('ns-open-hand-search', {bubbles:true, detail:{text}});
      return;
    }
    if (!event.submitter || event.submitter === form.querySelector('button[type=submit]')) {
      const words = field.value;
      if (isTouchQuestion(words)) {
        if (askTouch) dismiss(() => askTouch(words));
        else { message.textContent = localTouchHelp; field.focus(); }
        return;
      }
      const goal = parseGoal(words);
      if (goal) {
        if (runJointGoal) dismiss(() => runJointGoal(goal, words));
        else { message.textContent = localGoalHelp; field.focus(); }
        return;
      }
    }
    const gripText = gripCommand(field.value);
    if (gripText !== null || event.submitter?.hasAttribute('data-grip-command')) {
      clearSearch();
      stopVoice();
      form.hidden = true;
      dialog.setAttribute('aria-labelledby', 'ns-grip-title');
      dialog.setAttribute('aria-describedby', 'ns-grip-help');
      grip.open(gripText ?? field.value.trim());
      return;
    }
    if (event.submitter?.hasAttribute('data-wrist-command') ||
        /^(?:forecast|predict) (?:my (?:wrist movement|wrist paths?|wrists)|both wrists)$/.test(normalize(field.value))) {
      clearSearch();
      stopVoice();
      form.hidden = true;
      dialog.setAttribute('aria-labelledby', 'ns-wrist-title');
      dialog.setAttribute('aria-describedby', 'ns-wrist-help');
      wristForecast.open();
      return;
    }
    if (event.submitter?.hasAttribute('data-match-reach') || normalize(field.value) === 'match my arm reach') {
      clearSearch();
      stopVoice();
      form.hidden = true;
      dialog.setAttribute('aria-labelledby', 'ns-study-title');
      dialog.setAttribute('aria-describedby', 'ns-study-help');
      reachStudy.open();
      return;
    }
    const pairNames = comparisonNames(field.value);
    if (pairNames !== null) {
      clearSearch();
      stopVoice();
      message.textContent = named.compare(pairNames);
      if (message.textContent) field.focus();
      return;
    }
    const takeSequence = resolveTakeSequence(field.value, named.lookup);
    if (takeSequence) {
      clearSearch();
      stopVoice();
      if (takeSequence.error) {
        message.textContent = takeSequence.error;
        field.focus();
        return;
      }
      dismiss(() => replayTakes(takeSequence.steps));
      return;
    }
    const wholeName = namedReplayRequest(field.value);
    const selection = wholeName === null ? namedIntervalRequest(field.value) : null;
    const requestedName = wholeName ?? selection?.name ?? null;
    if (requestedName !== null) {
      clearSearch();
      stopVoice();
      const entry = named.lookup(requestedName);
      if (!entry) {
        message.textContent = named.size
          ? 'No saved take has that exact name. Check the list under Named takes.'
          : 'No saved take has that exact name. Return to the game. ' + takeRecorderInstruction +
            ' Save a take in the recorder, then name it under Named takes.';
        field.focus();
        return;
      }
      const interval = selection ? resolveTakeInterval(selection.range, entry.take.duration) : undefined;
      if (interval === null) {
        const limit = takeSeconds(entry.take.duration);
        message.textContent = 'Choose increasing times between 0 and ' + limit + ' s, with up to three decimal places. ' +
          'Try “replay 0 to ' + limit + ' seconds of take named ' + entry.name + '”.';
        field.focus();
        return;
      }
      if (interval && !entry.take.frames.some(frame => frame.time >= interval.start && frame.time < interval.end && frame.pose)) {
        message.textContent = 'No visible pose samples in that interval. Widen the range or choose another part of “' + entry.name + '”.';
        field.focus();
        return;
      }
      dismiss(() => replayTake(entry.take, entry.name, interval));
      return;
    }
    const command = normalize(field.value);
    const transport = command.match(/^(?:move|carry|transport) (?:the |a |an )?(?:cylinder|object) to target (\d+)(?: (?:with|using) (?:the |my )?(left|right) hand)?$/);
    if (transport) {
      const goal = Number(transport[1]);
      if (goal < 1 || goal > 9) {
        message.textContent = 'The experiment has nine destinations. Choose target 1 through 9.';
        return;
      }
      openPanel('ns-open-target-reach', {detail:{goal, hand:transport[2] || 'right'}});
      return;
    }
    const contactPhase = ['forecast brain activity after a push', 'forecast brain activity after a reach cue', 'forecast brain activity during an unbumped reach'].indexOf(command);
    if (contactPhase !== -1) {
      openPanel('ns-open-contact-forecast', {detail:{phase:contactPhase}});
      return;
    }
    if (command === 'forecast a reach and its sensory feedback') {
      openPanel('ns-open-reach-feedback');
      return;
    }
    if (command === 'replay a perturbed reach' || command === 'forecast a cued reach') {
      openPanel('ns-open-cortical-reach', {
        detail:{phase:command === 'forecast a cued reach' ? 1 : 0}
      });
      return;
    }
    if (command === 'replay a muscle stretch' || command === 'forecast sensory spikes') {
      openPanel('ns-open-spindle');
      return;
    }
    const limbForecast = /^forecast (?:my )?(wrist lift|pelvis path)( with scalp)?$/.exec(command);
    if (limbForecast) {
      openPanel('ns-open-limb-forecast', {
        detail:{domain:limbForecast[1] === 'wrist lift' ? 'upper' : 'lower', scalp:!!limbForecast[2]}
      });
      return;
    }
    if (/\bforecast (?:my )?(?:wrist lift|pelvis path)\b/.test(command)) {
      clearSearch();
      message.textContent = 'Enter “forecast my wrist lift” or “forecast my pelvis path” on its own.';
      field.focus();
      return;
    }
    const muscleQuery = /^forecast (?:muscle and movement|leg muscle activity and movement)(?: while (standing|walking))?$/.exec(command);
    if (muscleQuery) {
      openPanel('ns-open-muscle-motion', {
        detail:{posture:muscleQuery[1] === 'walking' ? 1 : 0}
      });
      return;
    }
    if (/\bforecast (?:muscle and movement|leg muscle activity and movement)\b/.test(command)) {
      clearSearch();
      message.textContent = 'Enter “forecast muscle and movement” on its own. You can add “while standing” or “while walking”.';
      field.focus();
      return;
    }
    if (command === 'forecast my balance') {
      openPanel('ns-open-visual-balance');
      return;
    }
    if (/\bforecast my balance\b/.test(command)) {
      clearSearch();
      message.textContent = 'Type “forecast my balance” on its own to open the visual rotation study.';
      field.focus();
      return;
    }
    const instruction = walkingInstructions.get(command);
    if (instruction !== undefined) {
      openPanel('ns-open-walking-instruction', {detail:{instruction}});
      return;
    }
    const bodyMap = getBodyMap();
    const sequence = resolveActionSequence(field.value, bodyMap);
    if (sequence?.steps) {
      if (!hasAvatarRig()) {
        message.textContent = 'The full avatar must be loaded before a sequence can start.';
        field.focus();
        return;
      }
      dismiss({type: 'sequence', steps: sequence.steps});
      return;
    }
    // Keep free catalogue searches such as “scooping then lifting”. A typed
    // limb or device instruction never falls through to a recording request.
    const limbOrControl = /\b(?:elbows?|forearms?|palms?|pronat(?:e|ion)|supinat(?:e|ion)|wrists?|knees?|hands?|fingers?|camera|microphone|take|generate|recorded|record)\b/.test(command);
    if (sequence && (limbOrControl || !catalogueWords(command).some(word => movements.has(word)))) {
      clearSearch();
      message.textContent = sequence.error;
      field.focus();
      return;
    }
    if (/^(?:forecast (?:right )?heel movement|show (?:the )?walking forecast)$/.test(command)) {
      openPanel('ns-open-walking-forecast');
      return;
    }
    if (/^(?:show|compare) (?:me )?(?:the )?recorded (?:brain|cortical) activity$/.test(command)) {
      openPanel('ns-open-recorded-cortex');
      return;
    }
    if (/\b(?:brain activity|cortical activity)\b/.test(command)) {
      clearSearch();
      message.textContent = 'To compare the finger cues from the Stanford recording, type “show recorded brain activity”.';
      field.focus();
      return;
    }
    const take = /^replay (?:(?:my|the) )?(?:take(?: of (.+))?|(.+) take)$/.exec(command);
    if (take) {
      clearSearch();
      stopVoice();
      const latest = getLatestTake();
      const name = latest?.name;
      if (!name) {
        message.textContent = 'No finished take in this tab. Return to the game. ' + takeRecorderInstruction +
          ' Use Record take and Finish take for a live camera, Save video take for a video, or Track pictures and Save picture take for timed pictures.';
        field.focus();
        return;
      }
      const requested = take[1] || take[2];
      const selection = /^whole[ -]body$/.test(requested) ? 'both arms and knees' : requested;
      if (selection && selection !== name.toLowerCase()) {
        message.textContent = 'The finished take in this tab is “' + name + '”. Choose that take or return to the game. ' +
          takeRecorderInstruction;
        field.focus();
        return;
      }
      dismiss(() => replayTake(latest));
      return;
    }
    if (/^generate(?:\s|$)/.test(command)) {
      clearSearch();
      stopVoice();
      const token = actionFor(command.replace(/^generate\s*(?:a\s+)?/, ''));
      if (!token) {
        message.textContent = 'The model knows two actions. Type “generate walk” or “generate run”.';
        field.focus();
        return;
      }
      form.hidden = true;
      dialog.setAttribute('aria-labelledby', 'ns-word-title');
      dialog.removeAttribute('aria-describedby');
      generated.show(token);
      return;
    }
    const clipId = resolveReplay(field.value);
    if (clipId) {
      openRecording(clipId);
      return;
    }
    const action = resolveAction(field.value, bodyMap);
    if (!action) {
      if (limbOrControl) {
        clearSearch();
        message.textContent = 'Try one movement with a side, such as “bend my right knee”. Join steps with “then”.';
        field.focus();
        return;
      }
      findRecordings(false);
      return;
    }
    dismiss(action);
  }

  function openRecording(clipId) {
    openPanel('ns-open-spatial-replay', {bubbles:true, detail:{clipId}});
  }

  function dictate() {
    if (!dialog.open || recognition || !localSpeech) return;
    try {
      const active = new Recognition();
      active.processLocally = true;
      if (active.processLocally !== true) throw new Error('On-device speech unavailable');
      active.lang = 'en-US';
      active.continuous = false;
      active.interimResults = false;
      active.onresult = event => {
        if (recognition !== active || !dialog.open) return;
        const transcript = event.results[0]?.[0]?.transcript;
        if (typeof transcript !== 'string' || !transcript.trim()) return;
        clearSearch();
        field.value = transcript;
        message.textContent = 'Check the words, then move or find a recording.';
        field.focus();
      };
      active.onerror = event => {
        if (recognition !== active) return;
        const reasons = {
          'not-allowed': 'Microphone permission was denied. Type your movement.',
          'service-not-allowed': 'On-device dictation is unavailable. Type your movement.',
          'language-not-supported': 'English dictation is unavailable on this device. Type your movement.',
          'no-speech': 'No words heard. Type or try again.'
        };
        message.textContent = reasons[event.error] || stoppedMessage;
      };
      active.onend = () => {
        if (recognition !== active) return;
        recognition = null;
        speak.disabled = false;
        if (message.textContent === 'Listening…') message.textContent = 'No words heard. Type or try again.';
      };
      recognition = active;
      speak.disabled = true;
      message.textContent = 'Listening…';
      field.focus({ preventScroll: true });
      active.start();
    } catch {
      stopVoice();
      message.textContent = unavailable;
    }
  }

  const listeners = [];
  function on(target, type, fn, capture = false) {
    target.addEventListener(type, fn, capture);
    listeners.push(() => target.removeEventListener(type, fn, capture));
  }
  on(win, 'keydown', shortcut, true);
  on(trigger, 'click', open);
  on(close, 'click', () => dismiss());
  on(form, 'submit', submit);
  on(field, 'input', () => {
    // A typed edit owns the draft, even if the browser still has a voice result queued.
    stopVoice();
    clearSearch();
    const steps = resolveActionSequence(field.value, getBodyMap())?.steps;
    message.textContent = steps ? steps.map(({label}, i) => `${i + 1}. ${label}`).join(' → ') : '';
  });
  on(results, 'click', event => {
    const button = event.target.closest('button[data-clip-id]');
    if (button && results.contains(button)) openRecording(button.dataset.clipId);
  });
  on(speak, 'click', dictate);
  on(dialog, 'cancel', e => { e.preventDefault(); dismiss(); });
  // Editing keys keep their ordinary browser behavior and never reach game handlers on window.
  for (const type of ['keydown', 'keyup']) on(dialog, type, e => e.stopPropagation());
  function forgetNames() {
    stopVoice();
    field.value = '';
    message.textContent = '';
    if (dialog.open && (!gripPanel.hidden || !wristPanel.hidden || !dialog.querySelector('[data-reach-study]').hidden)) dismiss(null, false);
    named.clear();
  }
  on(win, 'pagehide', forgetNames);
  on(win, 'blur', stopVoice);
  on(dialog.ownerDocument, 'visibilitychange', () => {
    if (dialog.ownerDocument.hidden) stopVoice();
  });
  return () => {
    dismiss(null, false);
    forgetNames();
    named.dispose();
    generated.dispose();
    reachStudy.dispose();
    wristForecast.dispose();
    grip.dispose();
    for (const remove of listeners) remove();
  };
}
