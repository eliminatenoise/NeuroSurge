// Each take lives in this page's memory. The camera passes only its selected
// rig pose, frame time and projected arm points after side and tracking checks.
import {trackingChoices} from './limb-pose.mjs';

export const TAKE_LIMIT_MS = 8000;

export function pictureOffsetMs(time, startTime) {
  const offset = (time - startTime) * 1000;
  // Correct decimal roundoff without quantizing fractional milliseconds.
  const roundoff = Math.min(1e-6, Math.max(time, TAKE_LIMIT_MS / 1000) * Number.EPSILON * 1000);
  const wholeMs = Math.round(offset);
  return wholeMs > 0 && Math.abs(offset - wholeMs) <= roundoff ? wholeMs : offset;
}

const groupedLimbs = {
  bothArms: ['leftArm', 'rightArm'],
  bothKnees: ['leftLeg', 'rightLeg'],
  armsAndKnees: ['leftArm', 'rightArm', 'leftLeg', 'rightLeg']
};
const jointKeys = {
  rightArm: ['r_shoulder_abd', 'r_shoulder_flex', 'r_elbow_flex'],
  rightLeg: ['knee_ext_R'],
  leftLeg: ['knee_ext_L']
};

function canUseLimb(result, limb) {
  if (!result) return false;
  if (limb === 'leftArm') {
    const arm = result.leftArm;
    const direction = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
    return !!arm && direction(arm.bearing) && direction(arm.upper) && Number.isFinite(arm.elbowDeg);
  }
  return jointKeys[limb].every(key => Number.isFinite(result.joints?.[key]));
}

function hasEnoughSamples(limb, counts) {
  const enough = count => count >= 2;
  return limb === 'armsAndKnees' ? counts.some(enough) : counts.every(enough);
}

// Keep only the game channels named here if the worker gains new outputs.
function copyLimb(result, limb, pose) {
  if (!canUseLimb(result, limb)) return false;
  if (limb === 'leftArm') {
    const arm = result.leftArm;
    pose.leftArm = {bearing: [...arm.bearing], upper: [...arm.upper], elbowDeg: arm.elbowDeg};
    return true;
  }
  const joints = pose.joints ??= {};
  for (const key of jointKeys[limb]) joints[key] = result.joints[key];
  return true;
}

export function poseForFollow(result, selection) {
  const choice = Object.hasOwn(trackingChoices, selection) ? trackingChoices[selection] : null;
  if (!result || !choice) return null;
  const pose = {};
  for (const limb of choice.parts) copyLimb(result, limb, pose);
  return pose.leftArm || pose.joints ? pose : null;
}

// One timestamp covers both sides of a camera frame. A missing side contributes
// no channels. On playback the ordinary camera controller releases that side.
export function createTakeTimeline(limb, start, {includeEnd = false} = {}) {
  const sides = groupedLimbs[limb] || [limb];
  const counts = sides.map(() => 0);
  const frames = [];
  let count = 0, lastObservation = -Infinity;
  function observe(result, at, expiry = false, wrists, armGeometry) {
    const time = at - start;
    if (!Number.isFinite(time) || time < 0 || time > TAKE_LIMIT_MS || (!includeEnd && time === TAKE_LIMIT_MS)) return;
    if (!expiry) {
      if (time <= lastObservation) return;
      lastObservation = time;
    }
    // A frame may be grabbed before the previous pose expires and delivered
    // afterwards. On the capture clock that newer frame precedes the timeout.
    if (!expiry && frames.at(-1)?.expiry && time <= frames.at(-1).time) frames.pop();
    if (frames.length && time <= frames.at(-1).time) return;
    const pose = {}, frame = {time, pose};
    for (let i = 0; i < sides.length; i++) {
      const side = sides[i];
      if (!copyLimb(result, side, pose)) continue;
      counts[i]++;
      const point = wrists?.[side];
      if ((side === 'leftArm' || side === 'rightArm') && Array.isArray(point) &&
          point.length === 2 && point.every(Number.isFinite)) {
        (frame.wrists ??= {})[side] = [...point];
      }
    }
    if (armGeometry && frame.wrists) {
      const {aspect, shoulders} = armGeometry;
      const point = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
      if (Number.isFinite(aspect) && aspect > 0 && point(shoulders?.leftArm) && point(shoulders?.rightArm)) {
        const copy = {aspect, shoulders: {leftArm: [...shoulders.leftArm], rightArm: [...shoulders.rightArm]}};
        for (const side of Object.keys(frame.wrists)) {
          const arm = armGeometry[side];
          if (Array.isArray(arm) && arm.length === 2 && arm.every(point)) copy[side] = arm.map(p => [...p]);
        }
        if (copy.leftArm || copy.rightArm) frame.armGeometry = copy;
      }
    }
    if (pose.leftArm || pose.joints) {
      frames.push(frame);
      count++;
    } else if (frames.at(-1)?.pose) {
      frames.push({time, pose: null, expiry});
    }
  }
  function finish(at) {
    if (!hasEnoughSamples(limb, counts)) return null;
    return {limb, frames, count, counts, duration: Math.min(TAKE_LIMIT_MS, at - start)};
  }
  return {start, observe, finish};
}

export function createVideoTakeWindow(limb, maxGapMs, {pictureTimes = false} = {}) {
  const sides = groupedLimbs[limb] || [limb];
  const counts = sides.map(() => 0);
  const samples = [];
  let end = -1, first = null;
  const expired = at => pictureTimes ? at < end - TAKE_LIMIT_MS : at <= end - TAKE_LIMIT_MS;
  function advance(at) {
    if (!Number.isFinite(at) || at <= end) return;
    end = at;
    while (samples.length && expired(samples[0].at)) {
      const {seen} = samples.shift();
      for (let i = 0; i < counts.length; i++) counts[i] -= Number(seen[i]);
    }
  }
  return {
    advance,
    observe(pose, at, wrists, armGeometry) {
      if (!Number.isFinite(at) || at < 0 || expired(at) || at <= (samples.at(-1)?.at ?? -1)) return;
      first ??= at;
      const seen = sides.map(side => canUseLimb(pose, side));
      samples.push({pose, at, wrists, armGeometry, seen});
      for (let i = 0; i < counts.length; i++) counts[i] += Number(seen[i]);
      advance(at);
    },
    get hasSamples() { return hasEnoughSamples(limb, counts); },
    finish() {
      if (!hasEnoughSamples(limb, counts)) return null;
      const start = pictureTimes ? Math.max(first, end - TAKE_LIMIT_MS) : samples.find(sample => sample.seen.includes(true)).at;
      const timeline = createTakeTimeline(limb, start, {includeEnd: pictureTimes});
      let previous;
      for (const {pose, at, wrists, armGeometry} of samples) {
        if (at < start) continue;
        // A missing frame supplies no pose. Release the last pose across a
        // long gap even if no decoded image arrived to report the loss.
        if (previous?.pose && at - previous.at > maxGapMs) {
          timeline.observe(null, previous.at + maxGapMs);
        }
        timeline.observe(pose, at, false, wrists, armGeometry);
        previous = {pose, at};
      }
      if (previous.pose && end - previous.at > maxGapMs) timeline.observe(null, previous.at + maxGapMs);
      return timeline.finish(end);
    },
  };
}

function betweenPictures(from, to, fraction) {
  const blend = (a, b) => a + (b - a) * fraction;
  // The left-arm tracker returns directions in the avatar's chest plane.
  function direction(a, b) {
    const start = Math.atan2(a[1], a[0]);
    const delta = Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]);
    const angle = start + delta * fraction;
    return [Math.cos(angle), Math.sin(angle), 0];
  }
  const result = {};
  if (from.joints) {
    result.joints = {};
    for (const [key, value] of Object.entries(from.joints)) {
      const next = to.joints?.[key];
      result.joints[key] = Number.isFinite(next) ? blend(value, next) : value;
    }
  }
  if (from.leftArm) {
    const a = from.leftArm, b = to.leftArm;
    result.leftArm = b ? {bearing:direction(a.bearing, b.bearing), upper:direction(a.upper, b.upper),
      elbowDeg:blend(a.elbowDeg, b.elbowDeg)} : a;
  }
  return result;
}

export function createLimbTake({panel, emit, onFinish, onReplay, returnFocus}) {
  const box = document.createElement('div');
  const hint = document.createElement('div');
  const recordHint = 'Record up to 8 s in this tab. Arm takes keep projected shoulder, elbow and wrist positions. Press F to name a take or match a reach. No images or audio are saved.';
  const info = document.createElement('div');
  info.setAttribute('role', 'status');
  const clock = document.createElement('span');
  clock.setAttribute('aria-hidden', 'true');
  function button(label, action) {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = label;
    el.addEventListener('click', () => { action(); returnFocus(); });
    return el;
  }
  const record = button('Record take', () => recording ? finish() : begin());
  const replay = button('Replay take', () => playing ? stopReplay() : play());
  const controls = document.createElement('div');
  controls.style.cssText = 'display:flex; flex-wrap:wrap; align-items:center; gap:4px';
  controls.append(record, replay, clock);
  box.append(hint, controls, info);
  panel.append(box);

  let live = false, valid = false, limb, name, recording, saved, playing;
  let playable = true;
  let deadline, progress, animation;
  const seconds = ms => (ms / 1000).toFixed(1) + ' s';

  function refresh() {
    record.textContent = recording ? 'Finish take' : 'Record take';
    record.disabled = !recording && (!live || !valid);
    replay.textContent = playing ? 'Stop replay' : 'Replay take';
    replay.disabled = box.hidden || !playable || live || (!saved && !playing);
    clock.hidden = !recording && !playing;
  }
  function stopClock() {
    clearTimeout(deadline);
    clearInterval(progress);
    cancelAnimationFrame(animation);
  }
  function begin() {
    if (!live || !valid || recording) return;
    recording = createTakeTimeline(limb, performance.now());
    info.textContent = 'Recording ' + name.toLowerCase() + '. Finish take keeps it and stops the camera. Stop camera cancels it.';
    const showTime = () => { clock.textContent = seconds(Math.min(TAKE_LIMIT_MS, performance.now() - recording.start)); };
    showTime();
    progress = setInterval(showTime, 100);
    deadline = setTimeout(finish, TAKE_LIMIT_MS);
    refresh();
  }
  function finish() {
    if (!recording) return;
    const take = recording.finish(performance.now());
    recording = null;
    stopClock();
    if (take) {
      saved = {...take, name};
      info.textContent = summary();
    } else {
      const reason = limb === 'armsAndKnees' ? 'Show at least one limb for two frames to keep a take.' : groupedLimbs[limb] ? 'A paired take needs two visible samples from each side.' : 'Too few visible samples for a take.';
      info.textContent = reason + (saved ? ' Previous take available.' : '');
    }
    refresh();
    onFinish();
  }
  function summary() {
    const title = saved.source === 'pictures' ? 'Picture take · ' + saved.name :
      saved.source === 'video' ? 'Video take · ' + saved.name : saved.name;
    if (saved.limb === 'armsAndKnees') {
      const counts = ['left arm', 'right arm', 'left knee', 'right knee'].map((side, i) => saved.counts[i] + ' ' + side);
      return title + ' · ' + seconds(saved.duration) + ' · ' + saved.count + ' pose samples (' + counts.join(', ') + ').';
    }
    const sides = saved.counts.length === 2 ? ' (' + saved.counts[0] + ' left, ' + saved.counts[1] + ' right)' : '';
    return title + ' · ' + seconds(saved.duration) + ' · ' + saved.count + ' pose samples' + sides + '.';
  }
  function stopReplay() {
    if (!playing) return;
    const label = playing.label;
    playing = null;
    stopClock();
    emit(null);
    const last = saved ? summary() : '';
    info.textContent = label ? 'Replay ended · “' + label + '”.' + (last ? ' Last take · ' + last : '') : last || 'Replay ended.';
    refresh();
  }
  function play(take = saved, label = '', interval) {
    if (!playable || live || !take || playing) return;
    const start = interval?.start ?? 0, end = interval?.end ?? take.duration;
    if (!(0 <= start && start < end && end <= take.duration)) return;
    const frames = take.frames;
    let next = 0;
    while (next < frames.length && frames[next].time < start) next++;
    onReplay(take.limb);
    playing = {start: performance.now(), next, label};
    const span = interval ? ' · ' + (Math.floor(start) / 1000) + '–' + (Math.floor(end) / 1000) + ' s' : '';
    info.textContent = 'Replaying ' + (label ? '“' + label + '” · ' : '') + take.name.toLowerCase() + span + ' with the camera off.';
    refresh();
    function tick() {
      const elapsed = start + Math.max(0, performance.now() - playing.start);
      clock.textContent = seconds(Math.min(elapsed, end));
      // Use only acquired frames in [start, end). No previously held pose
      // supplies an artificial sample at start, even during a tracking gap.
      if (interval && elapsed >= end) { stopReplay(); return; }
      let last;
      while (playing.next < frames.length && frames[playing.next].time <= elapsed) {
        last = frames[playing.next++];
      }
      // Only the animated body receives in-between poses. The stored samples
      // used for comparisons and forecasts remain tied to actual pictures.
      const before = frames[playing.next - 1], after = frames[playing.next];
      if (take.source === 'pictures' && before?.pose && after?.pose && before.time >= start &&
          elapsed > before.time && after.time <= end) {
        emit(betweenPictures(before.pose, after.pose, (elapsed - before.time) / (after.time - before.time)), take.limb);
      } else if (last) emit(last.pose, take.limb);
      if (elapsed >= take.duration && !last) stopReplay();
      else animation = requestAnimationFrame(tick);
    }
    tick();
  }
  function interrupt(reason) {
    if (recording) {
      recording = null;
      stopClock();
      info.textContent = reason + (saved ? ' Previous take available.' : '');
      refresh();
    }
    stopReplay();
  }
  function observe(pose, at = performance.now(), expiry = false, wrists, armGeometry) {
    const previous = valid;
    valid = !!pose;
    recording?.observe(pose, at, expiry, wrists, armGeometry);
    if (valid !== previous) refresh();
  }
  refresh();
  return {
    observe, interrupt, play,
    save(take, displayName, source) {
      saved = {...take, name: displayName, source};
      info.textContent = summary();
      refresh();
    },
    get recording() { return !!recording; },
    get hasTake() { return !!saved; },
    get latest() { return saved; },
    get savedName() { return saved?.name; },
    setPlayable(value) { playable = value; refresh(); },
    setCamera(active, side, displayName, hideTakeControls = false) {
      if (active === live && side === limb && box.hidden === hideTakeControls) return;
      box.hidden = hideTakeControls;
      if (!active || limb !== side) valid = false;
      live = active;
      limb = side;
      name = displayName;
      hint.textContent = recordHint + (limb === 'armsAndKnees' ? ' Only visible movements enter the take.' : groupedLimbs[limb] ? ' Show each side at least twice.' : '');
      refresh();
    },
    clear() {
      interrupt('Take cancelled.');
      saved = null;
      info.textContent = '';
      refresh();
    },
    get playing() { return !!playing; }
  };
}
