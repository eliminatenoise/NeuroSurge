// Opt-in control. No camera, worker, or model asset is opened during construction.
export function createCameraCapture({ onArmPose, host = document.body }) {
  let current = null, panel, video, status, button, disposed = false;
  const clearPose = () => onArmPose({joints: null});

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
      button.addEventListener('click', () => current ? stop() : panel.hidden = true);
      panel.append(video, status, button);
      host.appendChild(panel);
    }
    panel.hidden = false;
    video.hidden = !video.srcObject;
    if (status.textContent !== message) status.textContent = message;
    button.textContent = active ? 'Stop camera' : 'Dismiss';
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
        session.worker.postMessage({type: 'frame', frame, timestamp: performance.now()}, [frame]);
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
    const session = {lastVideoTime: -1};
    current = session;
    show('Allow the camera to move your avatar’s right arm. Video stays on this device.', true);
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
        if (current === session) { clearPose(); show('Camera on. Waiting for video.', true); }
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
          show('Camera on. Face the camera with both shoulders and your right wrist in view.', true);
          sendFrame(session);
        } else if (data.type === 'pose') {
          const joints = track.muted ? null : data.joints;
          onArmPose({joints});
          clearTimeout(session.watchdog);
          show(joints ? 'Camera on. Your right arm controls the avatar’s right shoulder and elbow.' :
            'Camera on. Face the camera with both shoulders and your right wrist in view.', true);
          if (joints) session.watchdog = setTimeout(() => {
            if (current === session) { clearPose(); show('Camera on. Waiting for a fresh right-arm pose.', true); }
          }, 1200);
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
    stop, get active() { return !!current; },
    dispose() {
      disposed = true;
      leave();
      window.removeEventListener('pagehide', leave);
      document.removeEventListener('visibilitychange', hide);
      panel?.remove();
    }
  };
}
