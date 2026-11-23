// Capture selections share a comparable bend target only on the same joint and side.
const joints = [
  {label: 'Left elbow', limbs: ['leftArm', 'bothArms', 'armsAndKnees'], read: pose => pose?.leftArm?.elbowDeg},
  {label: 'Right elbow', limbs: ['rightArm', 'bothArms', 'armsAndKnees'], read: pose => pose?.joints?.r_elbow_flex},
  {label: 'Left knee', limbs: ['leftLeg', 'bothKnees', 'armsAndKnees'], read: pose => pose?.joints?.knee_ext_L, sign: -1},
  {label: 'Right knee', limbs: ['rightLeg', 'bothKnees', 'armsAndKnees'], read: pose => pose?.joints?.knee_ext_R, sign: -1}
];
export function commonBends(first, second) {
  return joints.filter(joint => joint.limbs.includes(first.limb) && joint.limbs.includes(second.limb));
}

// The left reaching rig keeps the upper-arm direction in the plane of the
// picture. In its chest coordinates +Y points up. Use the unsigned angle from
// down, so reaching just past overhead never wraps from +180° to −180°.
function leftLift(pose) {
  const upper = pose?.leftArm?.upper;
  if (!Array.isArray(upper) || upper.length !== 3 || !upper.every(Number.isFinite) ||
      upper[2] !== 0 || (upper[0] === 0 && upper[1] === 0)) return null;
  return Math.atan2(Math.abs(upper[0]), -upper[1]) * 180 / Math.PI;
}

const lifts = [
  {label: 'Left upper-arm lift', limbs: ['leftArm', 'bothArms', 'armsAndKnees'], read: leftLift,
    description: 'Angle of the saved left upper-arm direction in the camera picture. The shoulder line sets the horizontal. Down is 0°, level is 90° and overhead is 180°. Inward and outward lifts of the same size share an angle.'},
  {label: 'Right shoulder lift', limbs: ['rightArm', 'bothArms', 'armsAndKnees'], read: pose => pose?.joints?.r_shoulder_abd,
    description: 'Sideways lift requested at the avatar’s right shoulder. The shoulder line in the picture sets the horizontal. Down is 0°, out to the side is 90° and overhead is 180°. The game limits the target to this range.'}
];

export function commonAngles(first, second) {
  return [...joints, ...lifts].filter(joint => [first, second].every(take =>
    joint.limbs.includes(take.limb) && take.frames.some(frame => !frame.expiry &&
      Number.isFinite(frame.time) && frame.time >= 0 && frame.time < take.duration && Number.isFinite(joint.read(frame.pose)))));
}

function savedAngle(frame, joint) {
  const raw = frame.expiry ? null : joint.read(frame.pose);
  return Number.isFinite(raw) ? raw * (joint.sign ?? 1) || 0 : null;
}

const windowMs = 500;
export function bendWindows(take, joint) {
  const windows = Array.from({length: Math.ceil(take.duration / windowMs)}, () => []);
  for (const frame of take.frames) {
    const {time, expiry} = frame;
    if (!Number.isFinite(time) || time < 0 || time >= take.duration) continue;
    windows[Math.floor(time / windowMs)].push({time, angle: savedAngle(frame, joint), expired: expiry === true});
  }
  return windows;
}

// Compare in capture order. Display bins can reorder a damaged clock and
// omit invalid timestamps, either of which could manufacture a rate.
export function angleRates(take, joint) {
  const intervals = [];
  let lastTime = -Infinity, previousAngle = null, coveredMs = 0;
  for (const frame of take.frames) {
    const {time} = frame;
    if (!Number.isFinite(time) || time < 0 || time >= take.duration) {
      previousAngle = null;
      continue;
    }
    if (time <= lastTime) return {clockConflict: true, intervals: [], coveredMs: 0};
    const angle = savedAngle(frame, joint);
    const elapsed = time - lastTime;
    // The camera waits 90 ms between worker responses and the next frame.
    // Ignore tiny intervals and gaps longer than a quarter second.
    if (angle !== null && previousAngle !== null && elapsed >= 50 && elapsed <= 250) {
      intervals.push({start: lastTime, end: time, rate: (angle - previousAngle) * 1000 / elapsed});
      coveredMs += elapsed;
    }
    previousAngle = angle;
    lastTime = time;
  }
  return {clockConflict: false, intervals, coveredMs};
}

const seconds = ms => (Math.floor(ms) / 1000).toFixed(3);
function signedRate(rate) {
  const rounded = Number(rate.toFixed(1));
  return (rounded > 0 ? '+' : '') + rounded.toFixed(1);
}

export function summarizeAngles(windows) {
  const observed = windows.flat().filter(point => !point.expired);
  const valid = observed.filter(point => Number.isFinite(point.angle));
  const angles = valid.map(point => point.angle);
  return {
    count: valid.length, total: observed.length,
    low: valid.length ? Math.min(...angles) : null, high: valid.length ? Math.max(...angles) : null,
    first: valid[0]?.time ?? null, last: valid.at(-1)?.time ?? null
  };
}

// A valid saved name can itself contain "with take named". Try all complete
// splits against actual names. The selectors resolve any genuine ambiguity.
export function comparisonNames(text) {
  if (typeof text !== 'string') return null;
  const words = text.normalize('NFC').trim().replace(/\s+/gu, ' ').replace(/[.!?]+$/, '');
  if (!/^(?:please )?compare (?:my |the )?takes?\b/i.test(words)) return null;
  const match = /^(?:please )?compare (?:my |the )?take named (.*)$/i.exec(words);
  if (!match) return [];
  const names = match[1];
  return Array.from(names.matchAll(/ with (?:my |the )?take named /gi), split =>
    [names.slice(0, split.index), names.slice(split.index + split[0].length)]);
}

export function bindTakeComparison(details, entries, lookup, options) {
  const controls = details.querySelector('[data-compare-controls]');
  const first = controls.querySelector('[data-first]');
  const second = controls.querySelector('[data-second]');
  const compare = controls.querySelector('button');
  const notice = controls.querySelector('[role=status]');
  const result = details.querySelector('[data-comparison]');
  const title = result.querySelector('h3');
  const select = result.querySelector('select');
  const description = result.querySelector('[data-angle-description]');
  const table = result.querySelector('table');
  const doc = details.ownerDocument;
  let selection;
  function element(tag, text) {
    const el = doc.createElement(tag);
    el.textContent = text;
    return el;
  }
  function clear() {
    selection = null;
    notice.textContent = '';
    table.replaceChildren();
    result.hidden = true;
  }
  function refresh() {
    clear();
    controls.hidden = entries.size < 2;
    const saved = [...entries.values()];
    for (const field of [first, second]) {
      const old = field.value;
      field.replaceChildren(...saved.map(entry => element('option', entry.name)));
      field.value = lookup(old)?.name ?? saved[field === first ? 0 : 1]?.name ?? '';
    }
  }
  function readings(cell, points) {
    if (!points?.length) {
      cell.textContent = points ? 'No saved sample' : 'Take ended';
      return;
    }
    for (const {time, angle, expired} of points) {
      const value = angle === null ? (expired ? 'Tracking expired' : 'No reading') : angle.toFixed(1) + '°';
      cell.append(element('div', seconds(time) + ' s · ' + value));
    }
  }
  function draw() {
    const {pair, shared} = selection;
    const joint = shared[select.selectedIndex];
    const tracks = pair.map(entry => bendWindows(entry.take, joint));
    description.textContent = joint.description ?? 'The avatar’s bend target in degrees. A straight elbow or knee reads 0°.';
    table.replaceChildren();
    table.createCaption().textContent = joint.label;
    const head = table.createTHead().insertRow();
    for (const label of ['Elapsed (s)', ...pair.map(entry => entry.name + ' (' + seconds(entry.take.duration) + ' s)')]) {
      const th = element('th', label);
      th.scope = 'col';
      head.append(th);
    }
    const summary = table.tHead.insertRow();
    const summaryTitle = element('th', 'Visible range');
    summaryTitle.scope = 'row';
    summary.append(summaryTitle);
    for (const track of tracks) {
      const {count, total, low, high, first, last} = summarizeAngles(track);
      const cell = summary.insertCell();
      cell.append(element('div', count ? low.toFixed(1) + '° to ' + high.toFixed(1) + '°' : 'No reading'),
        element('div', count + ' of ' + total + ' saved frames'));
      if (count) cell.append(element('div', seconds(first) + '–' + seconds(last) + ' s from first to last reading'));
    }
    const rateRow = table.tHead.insertRow();
    const rateTitle = element('th', 'Change per second');
    rateTitle.scope = 'row';
    rateRow.append(rateTitle);
    for (const {take, name} of pair) {
      const {clockConflict, intervals, coveredMs} = angleRates(take, joint);
      const cell = rateRow.insertCell();
      const rates = intervals.map(interval => interval.rate);
      const range = rates.length ? signedRate(Math.min(...rates)) + ' to ' + signedRate(Math.max(...rates)) + ' °/s' : 'No rate';
      cell.append(element('div', range), element('div', intervals.length + (intervals.length === 1 ? ' interval' : ' intervals') +
        ' · ' + (coveredMs / 1000).toFixed(3) + ' s covered'));
      if (clockConflict) cell.append(element('div', 'Capture times repeat or run backwards.'));
      if (!rates.length) continue;
      const list = doc.createElement('details');
      const toggle = element('summary', 'Show intervals');
      toggle.setAttribute('aria-label', 'Show intervals for ' + name);
      list.append(toggle);
      for (const {start, end, rate} of intervals) {
        list.append(element('div', seconds(start) + '–' + seconds(end) + ' s · ' + signedRate(rate) + ' °/s'));
      }
      cell.append(list);
    }
    const body = table.createTBody();
    for (let i = 0; i < Math.max(tracks[0].length, tracks[1].length); i++) {
      const row = body.insertRow();
      const time = element('th', i * windowMs / 1000 + '–' + (i + 1) * windowMs / 1000);
      time.scope = 'row';
      row.append(time);
      for (const track of tracks) readings(row.insertCell(), track[i]);
    }
  }
  function show(pair) {
    clear();
    if (pair[0].take === pair[1].take) return 'These names refer to the same recording. Choose two different takes.';
    const shared = commonAngles(pair[0].take, pair[1].take);
    if (!shared.length) return 'These takes share no recorded angle on the same side.';
    selection = {pair, shared};
    first.value = pair[0].name;
    second.value = pair[1].name;
    select.replaceChildren(...shared.map(joint => element('option', joint.label)));
    draw();
    details.open = true;
    result.hidden = false;
    title.focus();
    return '';
  }
  for (const field of [first, second]) field.addEventListener('change', clear, options);
  select.addEventListener('change', draw, options);
  compare.addEventListener('click', () => {
    notice.textContent = show([lookup(first.value), lookup(second.value)]);
  }, options);
  return {
    refresh,
    command(candidates) {
      clear();
      if (!candidates.length) return 'Use “compare take named warm up with take named second try”.';
      const matches = candidates.map(names => names.map(lookup)).filter(pair => pair.every(Boolean));
      if (!matches.length) return 'Both takes must be saved in this tab. Check the exact names under Named takes.';
      if (matches.length > 1) return 'More than one pair matches. Choose First take and Second take under Named takes.';
      return show(matches[0]);
    }
  };
}
