import {trackingChoices} from './limb-pose.mjs';
import {TAKE_LIMIT_MS} from './limb-take.mjs';

export const MAX_TAKE_FILE_BYTES = 2 * 1024 * 1024;

const format = 'neurosurge.take';
const version = 1;
const sources = ['camera', 'video', 'pictures'];
const armSides = ['leftArm', 'rightArm'];
const jointRanges = {
  rightArm: {r_shoulder_abd: [0, 180], r_shoulder_flex: [0, 0], r_elbow_flex: [0, 145]},
  leftLeg: {knee_ext_L: [-135, 0]},
  rightLeg: {knee_ext_R: [-135, 0]}
};
// Both capture paths resize their tracking bitmap to at most 640 pixels per side.
const maxBitmapSide = 640;

export function tidyTakeName(text) {
  return text.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

export function validTakeName(name) {
  return typeof name === 'string' && name.length <= 40 && /^[\p{L}\p{N}][\p{L}\p{M}\p{N} ]*$/u.test(name) &&
    !/\b(?:or|then)\b/i.test(name);
}

function requireValue(ok, field) {
  if (!ok) throw new TypeError('Invalid take file ' + field + '.');
}

function fields(value, required, optional = [], label = 'fields') {
  requireValue(value && typeof value === 'object' && !Array.isArray(value) &&
    required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key)), label);
}

function inRange(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function pair(value, minX, maxX, minY, maxY) {
  requireValue(Array.isArray(value) && value.length === 2 && inRange(value[0], minX, maxX) &&
    inRange(value[1], minY, maxY), 'projected point');
  return [value[0], value[1]];
}

function direction(value) {
  requireValue(Array.isArray(value) && value.length === 3 && value[2] === 0 &&
    Number.isFinite(value[0]) && Number.isFinite(value[1]) &&
    Math.abs(Math.hypot(value[0], value[1]) - 1) <= 1e-12, 'arm direction');
  return [value[0], value[1], value[2]];
}

function readPose(value, parts, counts) {
  fields(value, [], ['leftArm', 'joints'], 'pose');
  const pose = {};
  if (Object.hasOwn(value, 'leftArm')) {
    requireValue(parts.includes('leftArm'), 'left arm selection');
    const arm = value.leftArm;
    fields(arm, ['bearing', 'upper', 'elbowDeg'], [], 'left arm');
    requireValue(inRange(arm.elbowDeg, 0, 145), 'left elbow angle');
    pose.leftArm = {bearing: direction(arm.bearing), upper: direction(arm.upper), elbowDeg: arm.elbowDeg};
    counts[parts.indexOf('leftArm')]++;
  }
  if (Object.hasOwn(value, 'joints')) {
    const allowed = parts.flatMap(part => Object.keys(jointRanges[part] ?? {}));
    const joints = value.joints;
    fields(joints, [], allowed, 'pose joints');
    pose.joints = {};
    for (const [index, part] of parts.entries()) {
      const ranges = Object.entries(jointRanges[part] ?? {});
      if (!ranges.some(([key]) => Object.hasOwn(joints, key))) continue;
      for (const [key, [min, max]] of ranges) {
        requireValue(Object.hasOwn(joints, key) && inRange(joints[key], min, max), 'joint angle');
        pose.joints[key] = joints[key];
      }
      counts[index]++;
    }
    requireValue(Object.keys(pose.joints).length > 0, 'pose joints');
  }
  requireValue(pose.leftArm || pose.joints, 'empty pose');
  return pose;
}

function readWrists(value, pose) {
  const supported = armSides.filter(side => side === 'leftArm' ? pose.leftArm : pose.joints?.r_elbow_flex !== undefined);
  fields(value, [], supported, 'wrist sides');
  const wrists = {};
  for (const side of supported) {
    if (Object.hasOwn(value, side)) wrists[side] = pair(value[side], -maxBitmapSide, maxBitmapSide, -1, 1);
  }
  requireValue(Object.keys(wrists).length > 0, 'empty wrists');
  return wrists;
}

function readGeometry(value, wrists) {
  const supported = Object.keys(wrists ?? {});
  fields(value, ['aspect', 'shoulders'], supported, 'arm geometry');
  const {aspect, shoulders} = value;
  requireValue(inRange(aspect, 1 / maxBitmapSide, maxBitmapSide), 'frame aspect ratio');
  fields(shoulders, armSides, [], 'shoulder points');
  const projected = point => pair(point, 0, aspect, 0, 1);
  const geometry = {aspect, shoulders: {leftArm: projected(shoulders.leftArm), rightArm: projected(shoulders.rightArm)}};
  for (const side of supported) {
    if (!Object.hasOwn(value, side)) continue;
    const arm = value[side];
    requireValue(Array.isArray(arm) && arm.length === 2, 'arm points');
    const wrist = projected(arm[0]);
    const shoulder = geometry.shoulders[side];
    const outward = (side === 'leftArm' ? 1 : -1) * (wrist[0] - shoulder[0]);
    // The worker calculates offsets and absolute positions separately.
    const roundoff = 8 * Number.EPSILON * Math.max(1, aspect);
    requireValue(Math.abs(wrists[side][0] - outward) <= roundoff &&
      Math.abs(wrists[side][1] - (shoulder[1] - wrist[1])) <= roundoff, 'wrist and arm points');
    geometry[side] = [wrist, projected(arm[1])];
  }
  requireValue(geometry.leftArm || geometry.rightArm, 'empty arm geometry');
  return geometry;
}

function readTake(value) {
  fields(value, ['limb', 'frames', 'count', 'counts', 'duration', 'name'], ['source']);
  const {limb, duration, name} = value;
  requireValue(typeof limb === 'string' && Object.hasOwn(trackingChoices, limb), 'limb selection');
  const choice = trackingChoices[limb];
  requireValue(name === choice.name, 'limb name');
  requireValue(inRange(duration, 0, TAKE_LIMIT_MS) && duration > 0, 'duration');
  const hasSource = Object.hasOwn(value, 'source');
  const source = hasSource ? value.source : undefined;
  requireValue(!hasSource || sources.includes(source), 'source');
  requireValue(Array.isArray(value.frames), 'frames');
  const counts = choice.parts.map(() => 0);
  const frames = [];
  let count = 0;
  for (const frame of value.frames) {
    fields(frame, ['time', 'pose'], ['expiry', 'wrists', 'armGeometry'], 'frame');
    const {time} = frame;
    const previous = frames.at(-1);
    requireValue(inRange(time, 0, duration) && time > (previous?.time ?? -1) &&
      (source === 'pictures' || time < TAKE_LIMIT_MS), 'frame time');
    if (frame.pose === null) {
      requireValue(previous?.pose && Object.hasOwn(frame, 'expiry') && typeof frame.expiry === 'boolean' &&
        !Object.hasOwn(frame, 'wrists') && !Object.hasOwn(frame, 'armGeometry'), 'tracking gap');
      frames.push({time, pose: null, expiry: frame.expiry});
    } else {
      requireValue(!Object.hasOwn(frame, 'expiry'), 'tracked frame expiry');
      const copied = {time, pose: readPose(frame.pose, choice.parts, counts)};
      if (Object.hasOwn(frame, 'wrists')) copied.wrists = readWrists(frame.wrists, copied.pose);
      if (Object.hasOwn(frame, 'armGeometry')) copied.armGeometry = readGeometry(frame.armGeometry, copied.wrists);
      frames.push(copied);
      count++;
    }
  }
  const enough = count => count >= 2;
  requireValue(limb === 'armsAndKnees' ? counts.some(enough) : counts.every(enough), 'sample support');
  requireValue(value.count === count && Array.isArray(value.counts) && value.counts.length === counts.length &&
    counts.every((n, i) => value.counts[i] === n), 'sample counts');
  const take = {limb, frames, count, counts, duration, name};
  if (hasSource) take.source = source;
  return take;
}

function readName(value) {
  requireValue(typeof value === 'string', 'name');
  const name = tidyTakeName(value);
  requireValue(validTakeName(name), 'name');
  return name;
}

function checkedText(text) {
  requireValue(typeof text === 'string', 'text');
  if (text.length > MAX_TAKE_FILE_BYTES || new TextEncoder().encode(text).byteLength > MAX_TAKE_FILE_BYTES) {
    throw new RangeError('Take files can be at most 2 MiB.');
  }
  return text;
}

export function encodeNamedTake(name, take) {
  const payload = {format, version, name: readName(name), take: readTake(take)};
  // Preserve signed zero in arm directions. Its sign can change a half-turn
  // interpolation. The validated labels and schema cannot contain this marker.
  const signedZero = '\0';
  const text = JSON.stringify(payload, (_key, value) => Object.is(value, -0) ? signedZero : value);
  return checkedText(text.replaceAll(JSON.stringify(signedZero), '-0'));
}

export function decodeNamedTake(text) {
  checkedText(text);
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new TypeError('Invalid take file JSON.');
  }
  fields(payload, ['format', 'version', 'name', 'take']);
  requireValue(payload.format === format && payload.version === version, 'format or version');
  return {name: readName(payload.name), take: readTake(payload.take)};
}
