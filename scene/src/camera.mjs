// Opt-in control. No camera, worker, or model asset is opened during construction.
const choices = {
  rightArm: {name: 'Right arm', frame: 'Face the lens. Show both shoulders, your right elbow and wrist.', motion: 'Right shoulder and elbow'},
  leftArm: {name: 'Left arm', frame: 'Face the lens. Show both shoulders, your left elbow and wrist.', motion: 'Left arm reach and elbow'},
  leftLeg: {name: 'Left knee', frame: 'Turn partway sideways. Show shoulders, hips, your left knee and ankle. Bend in the picture plane.', motion: 'Left knee'},
  rightLeg: {name: 'Right knee', frame: 'Turn partway sideways. Show shoulders, hips, your right knee and ankle. Bend in the picture plane.', motion: 'Right knee'}
};

// Preserve the player's view calibration across a momentary low-confidence frame.
// No missing frame supplies a pose. A longer gap requires a new visible bend.
const BRIEF_KNEE_GAP_MS = 600;
export function createCameraCapture({ onPose, onArmPose, returnFocus = () => {}, host = document.body }) {
  let current = null, panel, video, status, button, select, disposed = false;
  let limb = 'rightArm', selection = 0;
  const emit = onPose || (result => onArmPose({joints: result?.joints ?? null}));
  const clearPose = () => emit(null);
  const knee = () => limb === 'leftLeg' || limb === 'rightLeg';
  const framing = () => choices[limb].frame + (knee() && !current?.kneeReady ? ' First show a clear bend.' : '');
  function resetTracking(session) {
    session.kneeBends = 0;
    session.kneeReady = false;
    session.missingSince = null;
    clearPose();
  }
  function choose(value) {
    if (!Object.hasOwn(choices, value) || value === limb || !current) return;
    limb = value;
    selection++;
    select.value = value;
    clearTimeout(current.watchdog);
    resetTracking(current);
    show(framing(), true);
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
      video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute('aria-label', 'Mirrored camera preview');
      Object.assign(video.style, {width: '100%', maxHeight: '18vh', objectFit: 'contain', transform: 'scaleX(-1)'});
      status = document.createElement('div');
      status.setAttribute('role', 'status');
      button = document.createElement('button');
      button.type = 'button';
      button.style.marginTop = '6px';
      button.addEventListener('click', () => {
        if (current) stop();
        else panel.hidden = true;
        returnFocus();
      });
      const label = document.createElement('label');
      label.append('Follow ');
      select = document.createElement('select');
      for (const [value, choice] of Object.entries(choices)) select.add(new Option(choice.name, value));
      select.value = limb;
      select.addEventListener('change', () => { choose(select.value); returnFocus(); });
      label.append(select);
      panel.append(label, video, status, button);
      host.appendChild(panel);
    }
    panel.hidden = false;
    video.hidden = !video.srcObject;
    if (status.textContent !== message) status.textContent = message;
    button.textContent = active ? 'Stop camera' : 'Dismiss';
    select.disabled = !active;
  }

  function stop(message = 'Camera off.') {
    const session = current;
    current = null;
    if (session) {
      clearTimeout(session.timer);
      clearTimeout(session.watchdog);
      clearTimeout(session.workerDeadline);
      session.worker?.terminate();
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

  async function sendFrame(session) {
    if (current !== session) return;
    const delay = () => { session.timer = setTimeout(() => sendFrame(session), 90); };
    if (video.readyState < 2 || video.videoWidth === 0 || video.currentTime === session.lastVideoTime ||
      session.stream.getVideoTracks()[0]?.muted) return delay();
    try {
      session.lastVideoTime = video.currentTime;
      const scale = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
      const frame = await createImageBitmap(video, {
        resizeWidth: Math.max(1, Math.round(video.videoWidth * scale)),
        resizeHeight: Math.max(1, Math.round(video.videoHeight * scale))
      });
      if (current !== session) return frame.close();
      try {
        session.worker.postMessage({type: 'frame', frame, timestamp: performance.now(), limb, selection}, [frame]);
        session.workerDeadline = setTimeout(() => failed(session, 'Camera off. The local pose tracker stopped responding.'), 15000);
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
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      show('Camera unavailable. Open the preview on localhost or HTTPS in a browser with camera access.', false);
      return;
    }
    if (!window.Worker || !window.OffscreenCanvas || typeof createImageBitmap !== 'function') {
      show('Camera unavailable. This browser lacks the local pose tracker’s video or worker support.', false);
      return;
    }
    const session = {lastVideoTime: -1, kneeReady: false, kneeBends: 0, missingSince: null};
    current = session;
    show('Allow video to move the selected limb. Video stays on this device.', true);
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
      track.addEventListener('mute', () => {
        if (current === session) { selection++; resetTracking(session); show('Camera on. Waiting for video.', true); }
      });
      video.srcObject = stream;
      show('Camera on. Loading the local pose tracker…', true);
      await video.play();
      if (current !== session) return;
      const worker = new Worker(new URL('./camera/pose-worker.js', import.meta.url));
      session.worker = worker;
      const trackerFailed = () => failed(session, 'Camera off. The local tracker could not run. Check browser WebGL support and the preview files.');
      worker.onerror = trackerFailed;
      worker.onmessageerror = trackerFailed;
      worker.onmessage = ({data}) => {
        if (current !== session) return;
        clearTimeout(session.workerDeadline);
        if (data.type === 'error') return trackerFailed();
        if (data.type === 'ready') {
          show(framing(), true);
          sendFrame(session);
        } else if (data.type === 'pose') {
          // A selection can change (and change back) while inference is in flight.
          if (data.selection === selection) {
            let result = track.muted ? null : data.result;
            const now = performance.now();
            if (session.missingSince !== null && now - session.missingSince >= BRIEF_KNEE_GAP_MS) session.kneeReady = false;
            if (result) session.missingSince = null;
            else {
              session.missingSince ??= now;
              session.kneeBends = 0;
              clearPose();
            }
            if (result && knee() && !session.kneeReady) {
              // A straight-looking projection alone cannot establish a usable view.
              const bend = -result.joints[limb === 'leftLeg' ? 'knee_ext_L' : 'knee_ext_R'];
              session.kneeBends = bend >= 45 ? session.kneeBends + 1 : 0;
              session.kneeReady = session.kneeBends >= 2;
              if (!session.kneeReady) result = null;
            }
            if (result) emit(result, limb);
            if (data.result) clearTimeout(session.watchdog);
            show(result ? choices[limb].motion + ' tracking.' : framing(), true);
            if (data.result) session.watchdog = setTimeout(() => {
              if (current === session) { resetTracking(session); show(framing(), true); }
            }, 1200);
          }
          session.timer = setTimeout(() => sendFrame(session), 90);
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

  function leave() { if (current) stop(); }
  function hide() { if (document.hidden) leave(); }
  window.addEventListener('pagehide', leave);
  document.addEventListener('visibilitychange', hide);
  return {
    toggle() { return current ? stop() : start(); },
    stop, choose, get active() { return !!current; },
    dispose() {
      disposed = true;
      leave();
      window.removeEventListener('pagehide', leave);
      document.removeEventListener('visibilitychange', hide);
      panel?.remove();
    }
  };
}
