// Opt-in control. No camera, worker, or model asset is opened during construction.
import {createLimbTake, createTakeTimeline, createVideoTakeWindow, pictureOffsetMs, TAKE_LIMIT_MS} from './camera/limb-take.mjs';
import {createCameraPreview} from './camera/preview.mjs';
import {calibratedPose, kneeJoints, trackedLimbs, trackingChoices as choices} from './camera/limb-pose.mjs';
import {captureSource, readKeyframes, MAX_LOCAL_VIDEO_BYTES} from './joint/media.mjs';
const MAX_FRAME_AGE_MS = 1200;
const FRAME_TIMEOUT_MS = 15000;
const POLL_INTERVAL_MS = 90;
const MIN_FRAME_INTERVAL_MS = 50;
const WAITING_FOR_VIDEO = 'Camera on. Waiting for video.';
const WAITING_FOR_CLIP_FRAME = 'Waiting for a current video frame.';
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
    show(parts, observed, accepted, recorded = false) {
      const followed = trackedLimbs(accepted);
      const seen = trackedLimbs(observed);
      for (const [limb, {row, state}] of items) {
        const selected = parts.includes(limb);
        const display = selected ? 'flex' : 'none';
        if (row.style.display !== display) row.style.display = display;
        if (!selected) continue;
        const following = followed.includes(limb);
        const needBend = !following && seen.includes(limb) && kneeJoints[limb];
        let label = 'Following';
        if (!following) {
          if (needBend) label = recorded ? 'Waiting for a bend' : 'Show a bend';
          else label = recorded ? 'No usable pose' : 'Bring into view';
        }
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
  let sourceMode = 'camera', sourceSelect, fileWrap, fileInput, videoSave, videoSaveStatus, videoTake;
  let pictureWrap, pictureFiles, pictureTimes, pictureNames, pictureSave, pictureTake;
  let limb = 'rightArm', selection = 0;
  let take;
  const emit = onPose || (result => onArmPose({joints: result?.joints ?? null}));
  const clearPose = () => { preview?.clear(); feedback?.clear(); emit(null); };
  function clearVideoTake() {
    videoTake = null;
    if (videoSave) videoSave.disabled = true;
    if (videoSaveStatus) videoSaveStatus.textContent = '';
  }
  function clearPictureTake() {
    pictureTake = null;
    if (pictureSave) pictureSave.hidden = true;
  }
  function clearFiles() {
    clearVideoTake();
    clearPictureTake();
    fileInput.value = '';
    pictureFiles.value = '';
    pictureTimes.value = '';
    pictureNames.replaceChildren();
    pictureNames.hidden = true;
  }
  const framing = () => choices[limb].frame + (kneeJoints[limb]?.length === 1 &&
    !current?.knees[kneeJoints[limb][0]]?.ready ? ' First show a clear bend.' : '');
  function beforeStart() {
    if (sourceMode === 'stills') return 'Choose two or more pictures and set their times, then select Track pictures.';
    if (sourceMode === 'clip') return 'Choose a video file, then select Play video. The file stays on this device.';
    return framing() + ' Select Start camera when ready. Video stays on this device.';
  }
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
      if (session.kind === 'clip') show(WAITING_FOR_CLIP_FRAME, true);
      else show(waiting ? WAITING_FOR_VIDEO : framing(), true);
    }, Math.max(0, expiresAt - performance.now()));
  }
  function choose(value, fromChooser = false) {
    if (!Object.hasOwn(choices, value) || value === limb) return;
    take?.interrupt('Take cancelled on limb change.');
    if (!current && !fromChooser) return;
    limb = value;
    clearVideoTake();
    clearPictureTake();
    selection++;
    select.value = value;
    if (current) {
      if (current.kind === 'clip') {
        current.capture?.reset('Limb changed.');
        return;
      }
      if (current.kind === 'stills') {
        stop('Limb changed. Select Track pictures to start again.');
        return;
      }
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
      panel.setAttribute('aria-label', 'Motion recorder');
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
      startButton.addEventListener('click', startSelected);
      button = document.createElement('button');
      button.type = 'button';
      button.style.marginTop = '6px';
      button.addEventListener('click', () => {
        if (!current && sourceMode === 'camera') take.clear();
        if (current) stop();
        else {
          clearFiles();
          panel.hidden = true;
        }
        returnFocus();
      });
      const sourceLabel = document.createElement('label');
      sourceLabel.style.display = 'block';
      sourceLabel.append('Source ');
      sourceSelect = document.createElement('select');
      sourceSelect.add(new Option('Live camera', 'camera'));
      sourceSelect.add(new Option('Recorded video', 'clip'));
      sourceSelect.add(new Option('Timed pictures', 'stills'));
      sourceSelect.addEventListener('change', () => {
        if (current || take?.playing) stop();
        clearVideoTake();
        clearPictureTake();
        sourceMode = sourceSelect.value;
        show(beforeStart(), false);
      });
      sourceLabel.append(sourceSelect);
      fileWrap = document.createElement('label');
      fileWrap.append('Local video ');
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'video/*';
      fileInput.style.maxWidth = '100%';
      fileInput.addEventListener('change', () => {
        clearVideoTake();
        show(beforeStart(), false);
      });
      fileWrap.append(fileInput);
      pictureWrap = document.createElement('div');
      const pictureLabel = document.createElement('label');
      pictureLabel.append('Local pictures ');
      pictureFiles = document.createElement('input');
      pictureFiles.type = 'file';
      pictureFiles.accept = 'image/*';
      pictureFiles.multiple = true;
      pictureFiles.style.maxWidth = '100%';
      pictureLabel.append(pictureFiles);
      pictureNames = document.createElement('ol');
      pictureNames.setAttribute('aria-label', 'Selected pictures in time-entry order');
      Object.assign(pictureNames.style, {maxHeight:'6rem', overflowY:'auto', overflowWrap:'anywhere'});
      pictureNames.tabIndex = 0;
      pictureNames.hidden = true;
      const timeLabel = document.createElement('label');
      timeLabel.append('Picture times (seconds) ');
      pictureTimes = document.createElement('input');
      pictureTimes.type = 'text';
      pictureTimes.autocomplete = 'off';
      pictureTimes.placeholder = '0, 0.5, 1.25';
      pictureTimes.style.maxWidth = '100%';
      timeLabel.append(pictureTimes);
      const timeHelp = document.createElement('p');
      timeHelp.textContent = 'Enter one time per picture in the order above, or leave this blank and name each file with its time, such as 0.5.jpg.';
      timeHelp.id = 'ns-picture-times-help';
      pictureTimes.setAttribute('aria-describedby', timeHelp.id);
      pictureWrap.append(pictureLabel, pictureNames, timeLabel, timeHelp);
      function recheckPictures() {
        if (sourceMode !== 'stills') return;
        clearPictureTake();
        if (current?.kind === 'stills') stop();
        show(beforeStart(), false);
      }
      pictureFiles.addEventListener('change', () => {
        pictureNames.replaceChildren();
        pictureNames.hidden = !pictureFiles.files.length;
        for (const file of pictureFiles.files) {
          const name = document.createElement('li');
          name.textContent = file.name;
          pictureNames.append(name);
        }
        recheckPictures();
      });
      pictureTimes.addEventListener('input', recheckPictures);
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
      const videoTakeControls = document.createElement('div');
      videoSaveStatus = document.createElement('div');
      videoSaveStatus.setAttribute('role', 'status');
      videoSave = document.createElement('button');
      videoSave.type = 'button';
      videoSave.style.marginTop = '6px';
      videoSave.textContent = 'Save video take';
      videoSave.addEventListener('click', () => {
        if (current?.kind === 'clip' && !video.seeking) videoTake?.advance(video.currentTime * 1000);
        const movement = video.seeking ? null : videoTake?.finish();
        if (!movement) {
          videoSave.disabled = !videoTake?.hasSamples;
          videoSaveStatus.textContent = 'Play a section with at least two tracked frames for the selected limbs.';
          return;
        }
        take.save(movement, choices[limb].name, 'video');
        videoSaveStatus.textContent = 'Video take saved. Press F and type “replay my take”.';
        returnFocus();
      });
      videoTakeControls.append(videoSave, videoSaveStatus);
      pictureSave = document.createElement('button');
      pictureSave.type = 'button';
      pictureSave.textContent = 'Save picture take';
      pictureSave.addEventListener('click', () => {
        if (!pictureTake || current || sourceMode !== 'stills') return;
        take.save(pictureTake, choices[limb].name, 'pictures');
        show('Picture take saved. Press F and type “replay my take”.', false);
        returnFocus();
      });
      panel.append(sourceLabel, label, fileWrap, pictureWrap, preview.element, status, feedback.element, startButton, button,
        videoTakeControls, pictureSave);
      take = createLimbTake({
        panel, emit, returnFocus,
        onFinish: () => stop(),
        onReplay(side) { limb = side; select.value = side; }
      });
      host.appendChild(panel);
    }
    panel.hidden = false;
    const recorded = sourceMode === 'clip';
    const pictures = sourceMode === 'stills';
    preview.element.hidden = !video.srcObject && !video.getAttribute('src');
    fileWrap.hidden = !recorded;
    fileInput.disabled = active;
    pictureWrap.hidden = !pictures;
    pictureFiles.disabled = pictureTimes.disabled = active;
    if (status.textContent !== message) status.textContent = message;
    startButton.textContent = pictures ? 'Track pictures' : recorded ? 'Play video' : 'Start camera';
    startButton.hidden = active;
    startButton.disabled = active;
    button.textContent = active ? (pictures ? 'Stop tracking' : recorded ? 'Stop video' : 'Stop camera') : 'Dismiss';
    videoSave.hidden = !recorded || (!active && !videoTake?.hasSamples);
    videoSave.disabled = !videoTake?.hasSamples;
    videoSaveStatus.hidden = !recorded;
    pictureSave.hidden = !pictures || !pictureTake;
    take.setCamera(active && sourceMode === 'camera', limb, choices[limb].name, sourceMode !== 'camera');
  }

  function stop(message) {
    take?.interrupt('Take cancelled.');
    const session = current;
    current = null;
    if (session) {
      clearTimeout(session.timer);
      if (session.frameCallback !== undefined) video.cancelVideoFrameCallback(session.frameCallback);
      clearTimeout(session.watchdog);
      clearTimeout(session.workerDeadline);
      if (session.kind === 'clip') {
        if (!video.seeking) videoTake?.advance(video.currentTime * 1000);
        video.removeEventListener('pause', session.pause);
        video.removeEventListener('play', session.play);
        video.removeEventListener('seeking', session.seek);
        video.removeEventListener('timeupdate', session.timeupdate);
        session.capture?.stop();
      } else if (session.kind === 'stills') {
        session.capture?.stop();
      } else {
        session.worker?.terminate();
        session.frameTime = null;
        for (const track of session.stream?.getTracks() || []) track.stop();
        video.pause();
        video.srcObject = null;
      }
      clearPose();
    }
    if (panel) show(message ?? (session?.kind === 'stills' ? 'Picture tracking stopped.' :
      session?.kind === 'clip' ? 'Video stopped.' : 'Camera off.'), false);
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
    const session = {kind: 'camera', lastPolledFrame: -1, knees: {},
      usesPresentedFrames: typeof video.requestVideoFrameCallback === 'function' &&
        typeof video.cancelVideoFrameCallback === 'function'};
    video.controls = false;
    video.autoplay = true;
    video.setAttribute('aria-label', 'Mirrored camera preview');
    preview.setMirrored(true);
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

  function startClip() {
    if (disposed || current) return;
    const file = fileInput.files?.[0];
    if (!file) { show(beforeStart(), false); fileInput.focus(); return; }
    if (file.size > MAX_LOCAL_VIDEO_BYTES) {
      show('Choose a video no larger than 512 MiB.', false);
      return;
    }
    if (!window.Worker || !window.OffscreenCanvas || typeof createImageBitmap !== 'function' ||
        typeof video.requestVideoFrameCallback !== 'function') {
      show('Recorded video needs a browser with video frame and worker support.', false);
      return;
    }
    take?.interrupt('Replay stopped.');
    clearVideoTake();
    video.controls = true;
    video.autoplay = false;
    video.setAttribute('aria-label', 'Recorded video preview');
    preview.setMirrored(false);
    const session = {kind: 'clip', knees: {}};
    current = session;
    show('Opening the video on this device.', true);
    session.pause = () => session.capture?.reset('Video paused.');
    session.play = () => { if (current === session) show(WAITING_FOR_CLIP_FRAME, true); };
    session.seek = () => clearVideoTake();
    session.timeupdate = () => {
      if (video.seeking || !videoTake) return;
      videoTake.advance(video.currentTime * 1000);
      videoSave.disabled = !videoTake.hasSamples;
    };
    video.addEventListener('pause', session.pause);
    video.addEventListener('play', session.play);
    video.addEventListener('seeking', session.seek);
    video.addEventListener('timeupdate', session.timeupdate);
    session.capture = captureSource({
      kind: 'clip', video, clip: file, getLimb: () => limb, captureWrists: true,
      onStatus() { if (current === session && !video.paused) show(WAITING_FOR_CLIP_FRAME, true); },
      onReset() {
        if (current !== session) return;
        clearTimeout(session.watchdog);
        resetTracking(session);
        show(video.paused ? 'Video paused. Press Play to continue.' : WAITING_FOR_CLIP_FRAME, true);
      },
      onFrame(frame) {
        if (current !== session || video.paused || video.seeking) return;
        if ((video.currentTime - frame.t) * 1000 >= MAX_FRAME_AGE_MS) {
          resetTracking(session);
          show(WAITING_FOR_CLIP_FRAME, true);
          return;
        }
        const result = calibratedPose(session.knees, limb, frame.pose, frame.t * 1000);
        videoTake ??= createVideoTakeWindow(limb, MAX_FRAME_AGE_MS);
        videoTake.observe(result, frame.t * 1000, frame.wrists, frame.armGeometry);
        emit(result, limb);
        preview.draw(frame.limbPaths, result, frame.w, frame.h);
        feedback.show(choices[limb].parts, frame.pose, result, true);
        show(result ? 'Following the selected limb in the video.' : 'No usable pose in this frame.', true);
        session.lastFrameAt = performance.now();
        watchFrame(session, session.lastFrameAt);
      },
      onEnd() { failed(session, 'Video ended. Select Play video to replay it.'); },
      onError(message) { clearVideoTake(); failed(session, 'Video stopped. ' + message); },
    });
  }

  function startPictures() {
    if (disposed || current) return;
    clearPictureTake();
    let stills;
    try {
      stills = readKeyframes([...pictureFiles.files], pictureTimes.value, {minimum:2});
    } catch (error) {
      show(error.message, false);
      return;
    }
    const startTime = stills[0].t;
    const duration = pictureOffsetMs(stills.at(-1).t, startTime);
    if (duration > TAKE_LIMIT_MS) {
      show('Use picture times no more than eight seconds apart from first to last.', false);
      return;
    }
    if (!window.Worker || !window.OffscreenCanvas || typeof createImageBitmap !== 'function') {
      show('Timed pictures need a browser with image decoding and worker support.', false);
      return;
    }
    take.interrupt('Replay stopped.');
    const session = {kind: 'stills', limb, knees: {}};
    const timeline = createTakeTimeline(limb, 0, {includeEnd: true});
    current = session;
    show('Opening the picture tracker on this device.', true);
    session.capture = captureSource({
      kind: 'stills', video, stills, getLimb: () => session.limb, captureWrists: true,
      onStatus(message) { if (current === session) show(message, true); },
      onFrame(frame) {
        if (current !== session) return;
        const time = pictureOffsetMs(frame.t, startTime);
        const pose = calibratedPose(session.knees, session.limb, frame.pose, time);
        timeline.observe(pose, time, false, frame.wrists, frame.armGeometry);
        show('Read ' + frame.id + ' of ' + stills.length + ' pictures.', true);
      },
      onEnd() {
        if (current !== session) return;
        pictureTake = timeline.finish(duration);
        stop(pictureTake ? pictureTake.count + ' of ' + stills.length + ' pictures had a usable pose. Choose Save picture take.' :
          'Too few pictures showed the selected limbs. Choose clearer pictures or one limb.');
      },
      onError(message) { failed(session, 'Picture tracking stopped. ' + message); },
    });
  }

  function startSelected() {
    if (sourceMode === 'stills') return startPictures();
    return sourceMode === 'clip' ? startClip() : start();
  }

  function leave() { if (current || take?.playing) stop(); }
  function hide() { if (document.hidden) { clearVideoTake(); clearPictureTake(); leave(); } }
  function forget() {
    if (fileInput) clearFiles();
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
    close() { if (fileInput) clearFiles(); leave(); if (panel) panel.hidden = true; },
    toggle() { return current ? stop() : startSelected(); },
    stop, choose, get active() { return !!current || !!take?.playing; },
    get visible() { return panel?.hidden === false; },
    get hasTake() { return !!take?.hasTake; },
    get savedTakeName() { return take?.latest?.name; },
    get latestTake() { return take?.latest; },
    saveTake(movement, source) {
      if (disposed || current || !Object.hasOwn(choices, movement.limb)) return false;
      if (!take) {
        show(beforeStart(), false);
        panel.hidden = true;
      }
      take.save(movement, choices[movement.limb].name, source);
      return true;
    },
    replayTake(target, label, interval) {
      if (disposed || document.hidden || !take || current) return;
      if (sourceMode !== 'camera' || panel.hidden) {
        sourceMode = 'camera';
        sourceSelect.value = sourceMode;
        show('Camera off.', false);
      }
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
