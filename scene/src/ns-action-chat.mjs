// Each phrase addresses one existing movement on the virtual body. Never discard
// negative words, multiple actions or the arm/leg side to force a match.
function normalize(phrase) {
  return phrase.toLowerCase().trim().replace(/[.!?]+$/, '').replace(/^please\s+/, '')
    .replace(/\b(?:my|your|the)\s+(?=left\b|right\b)/g, '').replace(/\s+/g, ' ');
}

const movementPhrases = [
  ['elbow', ['bend', 'flex'], 'elbow_flexion', 'lh_r_elbow_flex'],
  ['elbow', ['straighten', 'extend'], 'elbow_extension', 'lh_r_elbow_extend'],
  ['wrist', ['bend', 'flex'], 'wrist_flexion', 'lh_r_wrist_flex'],
  ['wrist', ['straighten', 'extend'], 'wrist_extension', 'lh_r_wrist_ext'],
  ['knee', ['bend', 'flex'], 'rh_knee_flex', 'lh_knee_flex'],
  ['knee', ['straighten', 'extend'], 'rh_knee_extend', 'lh_knee_extend'],
  ['hand', ['open'], 'open_hand', 'lh_r_open'],
  ['hand', ['close'], 'grasp_close', 'lh_r_grasp'],
  ['fingers', ['spread'], 'spread_fingers', 'lh_r_spread'],
];
const phrases = new Map();
for (const [part, verbs, left, right] of movementPhrases) {
  for (const [side, id] of [['left', left], ['right', right]]) {
    for (const verb of verbs) phrases.set(verb + ' ' + side + ' ' + part, id);
  }
}

export function resolveAction(phrase, bodyMap) {
  if (typeof phrase !== 'string' || phrase.length > 160) return null;
  const id = phrases.get(normalize(phrase));
  if (!id) return null;
  for (const region of bodyMap?.regions || []) {
    const action = region.actions.find(item => item.id === id);
    if (action) return { type: 'muscle', regionId: region.id, actionId: id };
  }
  return null;
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

export function bindActionChat({ dialog, trigger, canvas, canOpen, pause, resume, getBodyMap }) {
  const win = dialog.ownerDocument.defaultView;
  const field = dialog.querySelector('input');
  const message = dialog.querySelector('[role=status]');
  const form = dialog.querySelector('form');
  const speak = dialog.querySelector('[data-speak]');
  const close = dialog.querySelector('[data-close]');
  const Recognition = win.SpeechRecognition || win.webkitSpeechRecognition;
  const localSpeech = Boolean(Recognition && 'processLocally' in Recognition.prototype);
  const unavailable = 'Voice is unavailable on this device. Type your movement.';
  let recognition = null;

  function stopVoice() {
    if (!recognition) return;
    const active = recognition;
    recognition = null;
    active.onresult = active.onend = active.onerror = null;
    try { active.abort(); } catch { /* already ended */ }
    speak.disabled = !localSpeech;
  }

  function open() {
    if (dialog.open || !canOpen()) return;
    pause();
    dialog.showModal();
    field.value = '';
    message.textContent = localSpeech ? '' : unavailable;
    speak.disabled = !localSpeech;
    field.focus();
  }

  function dismiss(action = null, returnToGame = true) {
    if (!dialog.open) return;
    stopVoice();
    dialog.close();
    if (returnToGame) {
      resume(action);
      canvas.focus({ preventScroll: true });
    }
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
    const clipId = resolveReplay(field.value);
    if (clipId) {
      dismiss();
      dialog.ownerDocument.dispatchEvent(new win.CustomEvent('ns-open-spatial-replay', {bubbles:true, detail:{clipId}}));
      return;
    }
    const action = resolveAction(field.value, getBodyMap());
    if (!action) {
      message.textContent = 'Try one movement with a side, such as “Bend my right knee”.';
      field.focus();
      return;
    }
    dismiss(action);
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
        const transcript = event.results[0]?.[0]?.transcript;
        if (typeof transcript !== 'string' || !transcript.trim()) return;
        field.value = transcript;
        message.textContent = 'Check the words, then choose Move.';
        field.focus();
      };
      active.onerror = event => {
        const reasons = {
          'not-allowed': 'Microphone permission was denied. Type your movement.',
          'service-not-allowed': 'On-device dictation is unavailable. Type your movement.',
          'language-not-supported': 'English dictation is unavailable on this device. Type your movement.',
          'no-speech': 'No words heard. Type or try again.'
        };
        message.textContent = reasons[event.error] || 'Dictation stopped. Type your movement or try again.';
      };
      active.onend = () => {
        recognition = null;
        speak.disabled = false;
        if (message.textContent === 'Listening…') message.textContent = 'No words heard. Type or try again.';
      };
      recognition = active;
      speak.disabled = true;
      message.textContent = 'Listening…';
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
  on(speak, 'click', dictate);
  on(dialog, 'cancel', e => { e.preventDefault(); dismiss(); });
  // Editing keys keep their ordinary browser behavior and never reach game handlers on window.
  for (const type of ['keydown', 'keyup']) on(dialog, type, e => e.stopPropagation());
  on(win, 'blur', stopVoice);
  on(dialog.ownerDocument, 'visibilitychange', () => {
    if (dialog.ownerDocument.hidden) stopVoice();
  });
  return () => {
    dismiss(null, false);
    for (const remove of listeners) remove();
  };
}
