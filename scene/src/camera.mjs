// Opt-in control. No camera, worker, or model asset is opened during construction.
import {createLimbTake} from './camera/limb-take.mjs';
import {createCameraPreview} from './camera/preview.mjs';
import {trackedLimbs} from './camera/limb-pose.mjs';
const choices = {
  rightArm: {name: 'Right arm', frame: 'Face the lens. Show both shoulders, your right elbow and wrist.', motion: 'Right shoulder and elbow', parts: ['rightArm']},
  leftArm: {name: 'Left arm', frame: 'Face the lens. Show both shoulders, your left elbow and wrist.', motion: 'Left arm reach and elbow', parts: ['leftArm']},
  bothArms: {name: 'Both arms', frame: 'Face the lens with both shoulders, elbows and wrists in view.', motion: 'Both arms', parts: ['leftArm', 'rightArm']},
  leftLeg: {name: 'Left knee', frame: 'Turn partway sideways. Show shoulders, hips, your left knee and ankle.', motion: 'Left knee', parts: ['leftLeg']},
  rightLeg: {name: 'Right knee', frame: 'Turn partway sideways. Show shoulders, hips, your right knee and ankle.', motion: 'Right knee', parts: ['rightLeg']},
  armsAndKnees: {name: 'Both arms and knees', frame: 'Keep shoulders, elbows, wrists, hips and feet in view. Bend each knee where the lens can see it.', motion: 'Both arms and knees', parts: ['leftArm', 'rightArm', 'leftLeg', 'rightLeg']},
  bothKnees: {name: 'Both knees', frame: 'Turn partway sideways. Keep your shoulders, hips, knees and feet in view. Show a clear bend on each side.', motion: 'Both knees', parts: ['leftLeg', 'rightLeg']}
};

// Preserve the player's view calibration across a momentary low-confidence frame.
// No missing frame supplies a pose. A longer gap requires a new visible bend.
const BRIEF_KNEE_GAP_MS = 600;
const MAX_FRAME_AGE_MS = 1200;
const FRAME_TIMEOUT_MS = 15000;
const POLL_INTERVAL_MS = 90;
const MIN_FRAME_INTERVAL_MS = 50;
const WAITING_FOR_VIDEO = 'Camera on. Waiting for video.';
const kneeJoints = {leftLeg: ['knee_ext_L'], rightLeg: ['knee_ext_R'], bothKnees: ['knee_ext_L', 'knee_ext_R'], armsAndKnees: ['knee_ext_L', 'knee_ext_R']};

// Each knee must show two consecutive bends in the picture before its straight
// projection can drive the game. A missing frame withholds only that knee.
function calibratedPose(stored, selection, result, now) {
  const keys = kneeJoints[selection];
  if (!keys) return result;
  // In the mixed mode a knee can wait for its second clear bend while the
  // same frame already drives either arm. Copy only the surviving channels.
  const pose = {}, joints = {};
  if (selection === 'armsAndKnees') {
    if (result?.leftArm) pose.leftArm = result.leftArm;
    const rightArm = ['r_shoulder_abd', 'r_shoulder_flex', 'r_elbow_flex'];
    if (rightArm.every(key => Number.isFinite(result?.joints?.[key]))) {
      for (const key of rightArm) joints[key] = result.joints[key];
    }
  }
  for (const key of keys) {
    const state = stored[key] ??= {ready: false, bends: 0, missingSince: null};
    const angle = result?.joints?.[key];
    if (state.missingSince !== null && now - state.missingSince >= BRIEF_KNEE_GAP_MS) state.ready = false;
    if (!Number.isFinite(angle)) {
      state.missingSince ??= now;
      state.bends = 0;
      continue;
    }
    state.missingSince = null;
    if (!state.ready) {
      state.bends = -angle >= 45 ? state.bends + 1 : 0;
      state.ready = state.bends >= 2;
    }
    if (state.ready) joints[key] = angle;
  }
  if (Object.keys(joints).length) pose.joints = joints;
  return pose.leftArm || pose.joints ? pose : null;
}

function createTrackingFeedback(document) {
  const list = document.createElement('ul');
  list.setAttribute('role', 'list');
  list.setAttribute('aria-label', 'Tracking by limb');
  list.style.cssText = 'margin:6px 0;padding:0;list-style:none';
  const items = new Map();
  for (const limb of choices.armsAndKnees.parts) {
    const row = document.createElement('li');
    const name = document.createElement('span');
    const state = document.createElement('strong');
    name.textContent = choices[limb].name;
    state.style.textAlign = 'right';
    row.style.cssText = 'display:none;justify-content:space-between;gap:5px;padding:2px 0;border-bottom:1px solid #40586a';
    row.append(name, state);
    list.appendChild(row);
    items.set(limb, {row, state});
  }
  list.hidden = true;
  return {
    element: list,
    clear() { list.hidden = true; },
    show(parts, observed, accepted) {
      const followed = trackedLimbs(accepted);
      const seen = trackedLimbs(observed);
      for (const [limb, {row, state}] of items) {
        const selected = parts.includes(limb);
        const display = selected ? 'flex' : 'none';
        if (row.style.display !== display) row.style.display = display;
        if (!selected) continue;
        const following = followed.includes(limb);
        const needBend = !following && seen.includes(limb) && kneeJoints[limb];
        const label = following ? 'Following' : needBend ? 'Show a bend' : 'Bring into view';
        if (state.textContent !== label) {
          state.textContent = label;
          state.style.color = following ? '#a5f3db' : needBend ? '#ffe0a1' : '#d9e6ef';
        }
      }
      list.hidden = false;
    }
  };
}

export function createCameraCapture({ onPose, onArmPose, returnFocus = () => {}, host = document.body }) {
  let current = null, panel, video, preview, feedback, status, startButton, button, select, disposed = false;
  let limb = 'rightArm', selection = 0;
  let take;
  const emit = onPose || (result => onArmPose({joints: result?.joints ?? null}));
  const clearPose = () => { preview?.clear(); feedback?.clear(); emit(null); };
  const framing = () => choices[limb].frame + (kneeJoints[limb]?.length === 1 &&
    !current?.knees[kneeJoints[limb][0]]?.ready ? ' First show a clear bend.' : '');
  const beforeStart = () => framing() + ' Select Start camera when ready. Video stays on this device.';
  function trackingMessage(result) {
    if (!result) return framing();
    if (limb === 'armsAndKnees') {
      const visible = trackedLimbs(result).map(side => choices[side].name.toLowerCase());
      if (visible.length < 4) return 'Following ' + visible.join(', ') + '. ' + framing();
    }
    if (limb === 'bothArms' && !result.leftArm) return 'Right arm tracking. Bring your left elbow and wrist into view.';
    if (limb === 'bothArms' && !result.joints) return 'Left arm tracking. Bring your right elbow and wrist into view.';
    if (limb === 'bothKnees' && !Object.hasOwn(result.joints, 'knee_ext_L')) return 'Right knee tracking. Show a clear bend with your left knee and ankle in view.';
    if (limb === 'bothKnees' && !Object.hasOwn(result.joints, 'knee_ext_R')) return 'Left knee tracking. Show a clear bend with your right knee and ankle in view.';
    return choices[limb].motion + ' tracking.';
  }
  function resetTracking(session, expiresAt) {
    take?.observe(null, expiresAt, expiresAt !== undefined);
    session.knees = {};
    clearPose();
  }
  function watchFrame(session, capturedAt) {
    clearTimeout(session.watchdog);
    const expiresAt = capturedAt + MAX_FRAME_AGE_MS;
    session.watchdog = setTimeout(() => {
      if (current !== session) return;
      const waiting = session.lastFrameAt === capturedAt;
      resetTracking(session, expiresAt);
      show(waiting ? WAITING_FOR_VIDEO : framing(), true);
    }, Math.max(0, expiresAt - performance.now()));
  }
  function choose(value, fromChooser = false) {
    if (!Object.hasOwn(choices, value) || value === limb) return;
    take?.interrupt('Take cancelled on limb change.');
    if (!current && !fromChooser) return;
    limb = value;
    selection++;
    select.value = value;
    if (current) {
      resetTracking(current);
      const waiting = current.stream?.getVideoTracks()[0]?.muted ||
        performance.now() - current.lastFrameAt >= MAX_FRAME_AGE_MS;
      show(waiting ? WAITING_FOR_VIDEO : framing(), true);
    } else show(beforeStart(), false);
  }

  function show(message, active) {
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'ns-motion-camera';
      panel.setAttribute('aria-label', 'Camera motion control');
      Object.assign(panel.style, {
        position: 'fixed', right: '12px', top: '12px', zIndex: '20000', width: 'min(230px, 84vw)',
        padding: '10px', borderRadius: '6px', border: '1px solid #8296aa', background: '#152430',
        color: '#fff', font: '14px/1.4 system-ui, sans-serif', pointerEvents: 'auto'
      });
      panel.style.maxHeight = 'calc(100dvh - 46px)';
      panel.style.overflowY = 'auto';
      video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('aria-label', 'Mirrored camera preview');
      preview = createCameraPreview(video);
      feedback = createTrackingFeedback(document);
      status = document.createElement('div');
      status.setAttribute('role', 'status');
      startButton = document.createElement('button');
      startButton.type = 'button';
      startButton.textContent = 'Start camera';
      startButton.addEventListener('click', start);
      button = document.createElement('button');
      button.type = 'button';
      button.style.marginTop = '6px';
      button.addEventListener('click', () => {
        if (!current) take.clear();
        if (current) stop();
        else panel.hidden = true;
        returnFocus();
      });
      const label = document.createElement('label');
      label.append('Follow ');
      select = document.createElement('select');
      for (const [value, choice] of Object.entries(choices)) select.add(new Option(choice.name, value));
      select.value = limb;
      let pointerChoice = false;
      select.addEventListener('pointerdown', () => { pointerChoice = true; });
      select.addEventListener('keydown', () => { pointerChoice = false; });
      select.addEventListener('blur', () => { pointerChoice = false; });
      select.addEventListener('change', () => {
        const sendFocusBack = current && (pointerChoice || document.activeElement !== select);
        choose(select.value, true);
        if (sendFocusBack) returnFocus();
      });
      label.append(select);
      panel.append(label, preview.element, status, feedback.element, startButton, button);
      take = createLimbTake({
        panel, emit, returnFocus,
        onFinish: () => stop(),
        onReplay(side) { limb = side; select.value = side; }
      });
      host.appendChild(panel);
    }
    panel.hidden = false;
    preview.element.hidden = !video.srcObject;
    if (status.textContent !== message) status.textContent = message;
    startButton.hidden = active;
    startButton.disabled = active;
    button.textContent = active ? 'Stop camera' : 'Dismiss';
    take.setCamera(active, limb, choices[limb].name);
  }

  function stop(message = 'Camera off.') {
    take?.interrupt('Take cancelled.');
    const session = current;
    current = null;
    if (session) {
      clearTimeout(session.timer);
      if (session.frameCallback !== undefined) video.cancelVideoFrameCallback(session.frameCallback);
      clearTimeout(session.watchdog);
      clearTimeout(session.workerDeadline);
      session.worker?.terminate();
      session.frameTime = null;
      for (const track of session.stream?.getTracks() || []) track.stop();
      video.pause();
      video.srcObject = null;
      clearPose();
    }
    if (panel) show(message, false);
  }

  function failed(session, message) {
    if (current === session) stop(message);
  }

  function canReadVideo(session) {
    return video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 &&
      !session.stream.getVideoTracks()[0]?.muted;
  }

  function noVideo(session) {
    failed(session, 'Camera off. The video stream stopped delivering frames.');
  }

  function pollFrame(session) {
    if (current !== session) return;
    if (canReadVideo(session)) {
      const quality = video.getVideoPlaybackQuality?.();
      const displayed = quality ? quality.totalVideoFrames - quality.droppedVideoFrames : null;
      // The playback clock can advance even while the image is frozen.
      const frame = displayed ?? video.currentTime;
      if ((displayed === null || displayed > 0) && frame !== session.lastPolledFrame) {
        session.lastPolledFrame = frame;
        sendFrame(session);
        return;
      }
    }
    if (performance.now() - session.lastFrameAt >= FRAME_TIMEOUT_MS) noVideo(session);
    else waitForFrame(session);
  }

  function waitForFrame(session) {
    if (current !== session) return;
    if (!session.usesPresentedFrames) {
      session.timer = setTimeout(() => pollFrame(session), POLL_INTERVAL_MS);
      return;
    }
    // Request a new video frame only when the previous inference is finished.
    // Keep a separate deadline because a frozen stream may never call back.
    const nextFrame = (_now, {presentedFrames}) => {
      session.frameCallback = undefined;
      if (current !== session) return;
      if (!canReadVideo(session) || (session.presentedFrames !== undefined &&
          (presentedFrames <= session.presentedFrames || performance.now() - session.lastFrameAt < MIN_FRAME_INTERVAL_MS))) {
        session.frameCallback = video.requestVideoFrameCallback(nextFrame);
        return;
      }
      session.presentedFrames = presentedFrames;
      clearTimeout(session.timer);
      sendFrame(session);
    };
    const remaining = Math.max(0, FRAME_TIMEOUT_MS - (performance.now() - session.lastFrameAt));
    session.timer = setTimeout(() => noVideo(session), remaining);
    session.frameCallback = video.requestVideoFrameCallback(nextFrame);
  }

  async function sendFrame(session) {
    try {
      const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
      // Bind the grab to its consent interval and side before bitmap creation yields.
      const frameTime = performance.now(), frameLimb = limb, frameSelection = selection;
      const captureWrists = take?.recording && (frameLimb === 'rightArm' || frameLimb === 'leftArm' ||
        frameLimb === 'bothArms' || frameLimb === 'armsAndKnees');
      session.lastFrameAt = frameTime;
      session.workerDeadline = setTimeout(() => failed(session, 'Camera off. The video frame could not be read in time.'), FRAME_TIMEOUT_MS);
      const frame = await createImageBitmap(video, {
        resizeWidth: Math.max(1, Math.round(video.videoWidth * scale)),
        resizeHeight: Math.max(1, Math.round(video.videoHeight * scale))
      });
      if (current !== session) return frame.close();
      try {
        clearTimeout(session.workerDeadline);
        session.frameTime = frameTime;
        session.frameSize = [frame.width, frame.height];
        const message = {type: 'frame', frame, timestamp: frameTime, limb: frameLimb,
          selection: frameSelection, limbPaths: true};
        if (captureWrists) message.captureWrists = true;
        session.worker.postMessage(message, [frame]);
        session.workerDeadline = setTimeout(() => failed(session, 'Camera off. The local pose tracker stopped responding.'), FRAME_TIMEOUT_MS);
      } catch (error) {
        frame.close();
        throw error;
      }
    } catch {
      failed(session, 'Camera off. The browser could not read a video frame.');
    }
  }

  async function start() {
    if (disposed || current) return;
    if (take?.playing) { stop(); return; }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      show('Camera unavailable. Open the preview on localhost or HTTPS in a browser with camera access.', false);
      return;
    }
    if (!window.Worker || !window.OffscreenCanvas || typeof createImageBitmap !== 'function') {
      show('Camera unavailable. This browser lacks the local pose tracker’s video or worker support.', false);
      return;
    }
    const session = {lastPolledFrame: -1, knees: {},
      usesPresentedFrames: typeof video.requestVideoFrameCallback === 'function' &&
        typeof video.cancelVideoFrameCallback === 'function'};
    current = session;
    show('Allow video to move the avatar. Video stays on this device.', true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({video: {
        width: {ideal: 640}, height: {ideal: 480}, frameRate: {ideal: 15, max: 30}, facingMode: {ideal: 'user'}
      }, audio: false});
      if (current !== session) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      session.stream = stream;
      const track = stream.getVideoTracks()[0];
      if (!track || track.readyState === 'ended') throw new DOMException('No camera track', 'NotFoundError');
      track.addEventListener('ended', () => failed(session, 'Camera off. The camera was disconnected.'), {once: true});
      stream.addEventListener('inactive', () => failed(session, 'Camera off. The video stream ended.'), {once: true});
      track.addEventListener('mute', () => {
        if (current !== session) return;
        selection++;
        resetTracking(session);
        show(WAITING_FOR_VIDEO, true);
      });
      video.srcObject = stream;
      show('Camera on. Loading the local pose tracker…', true);
      session.workerDeadline = setTimeout(() => noVideo(session), FRAME_TIMEOUT_MS);
      await video.play();
      if (current !== session) return;
      clearTimeout(session.workerDeadline);
      const worker = new Worker(new URL('./camera/pose-worker.js', import.meta.url));
      session.worker = worker;
      const trackerFailed = () => failed(session, 'Camera off. The local tracker could not run. Check browser WebGL support and the preview files.');
      worker.onerror = trackerFailed;
      worker.onmessageerror = trackerFailed;
      worker.onmessage = ({data}) => {
        if (current !== session) return;
        if (data.type === 'pose' && (session.frameTime == null || data.timestamp !== session.frameTime)) return;
        clearTimeout(session.workerDeadline);
        if (data.type === 'error') return trackerFailed();
        if (data.type === 'ready') {
          session.lastFrameAt = performance.now();
          show(framing(), true);
          watchFrame(session, session.lastFrameAt);
          if (session.usesPresentedFrames) waitForFrame(session);
          else pollFrame(session);
        } else if (data.type === 'pose') {
          // A selection can change (and change back) while inference is in flight.
          const capturedAt = session.frameTime;
          session.frameTime = null;
          if (data.selection === selection) {
            const now = performance.now();
            const age = now - capturedAt;
            const fresh = !track.muted && age < MAX_FRAME_AGE_MS;
            const observed = fresh ? data.result : null;
            const result = calibratedPose(session.knees, limb, observed, now);
            emit(result, limb);
            preview.draw(data.limbPaths, result, ...session.frameSize);
            if (fresh) feedback.show(choices[limb].parts, observed, result);
            else feedback.clear();
            if (take.recording && data.wrists) take.observe(result, capturedAt, false, data.wrists, data.armGeometry);
            else take.observe(result, capturedAt);
            show(fresh ? trackingMessage(result) : WAITING_FOR_VIDEO, true);
            if (fresh) watchFrame(session, capturedAt);
            else clearTimeout(session.watchdog);
          }
          waitForFrame(session);
        }
      };
      worker.postMessage({type: 'init'});
      session.workerDeadline = setTimeout(trackerFailed, 45000);
    } catch (error) {
      const reason = {
        NotAllowedError: 'Camera off. The camera permission was denied or blocked by the browser.',
        NotFoundError: 'Camera off. No video camera was found.',
        NotReadableError: 'Camera off. The device is busy or unavailable.'
      }[error.name];
      failed(session, reason || 'Camera off. The browser could not start the camera or local tracker.');
    }
  }

  function leave() { if (current || take?.playing) stop(); }
  function hide() { if (document.hidden) leave(); }
  function forget() {
    leave();
    take?.clear();
  }
  window.addEventListener('pagehide', forget);
  document.addEventListener('visibilitychange', hide);
  return {
    open() {
      if (disposed) return;
      if (current) return;
      show(beforeStart(), false);
      select.focus({ preventScroll: true });
    },
    close() { leave(); if (panel) panel.hidden = true; },
    toggle() { return current ? stop() : start(); },
    stop, choose, get active() { return !!current || !!take?.playing; },
    get visible() { return panel?.hidden === false; },
    get hasTake() { return !!take?.hasTake; },
    get savedTakeName() { return take?.latest?.name; },
    get latestTake() { return take?.latest; },
    replayTake(target, label, interval) {
      if (disposed || document.hidden || !take || current) return;
      if (panel.hidden) show('Camera off.', false);
      take.play(target, label, interval);
    },
    setPlayable(value) { take?.setPlayable(value); },
    dispose() {
      disposed = true;
      forget();
      window.removeEventListener('pagehide', forget);
      document.removeEventListener('visibilitychange', hide);
      panel?.remove();
    }
  };
}
