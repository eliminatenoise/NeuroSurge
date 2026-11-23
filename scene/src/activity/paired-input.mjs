// The clip's byte identity is verified before parsing by parsePairedClip or the
// game's existing loadClip. The synchronous functions below consume that object.
export const CLIP_SHA256 = '578184a108d7682c37a4f409ce4cd7535b33d203007f39ca0f5d28831ffde41f';
export const TARGET_OFFSETS = Object.freeze([384, 512, 640, 768, 896, 1024]);
const SCALP = ['C3', 'C1', 'Cz', 'C2', 'C4', 'CP3', 'CPz', 'CP4'];
const FOREARM = ['M1L','M1R','M2L','M2R','M3L','M3R','M4L','M4R'];
const AXES = ['wristExtension_deg', 'wristRadialDeviation_deg'];
const LEAD = 128;
const BIN_COUNT = 16;
const BIN_WIDTH = 16;

export async function parsePairedClip(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
  if (hash !== CLIP_SHA256) throw new Error('The wrist clip checksum differs from the published example.');
  return JSON.parse(new TextDecoder().decode(bytes));
}

function sameOrder(labels, expected) {
  return Array.isArray(labels) && labels.length === expected.length &&
    expected.every((name, i) => labels[i] === name);
}

function targetIndex(clip, offset) {
  if (!TARGET_OFFSETS.includes(offset)) throw new RangeError('Choose a supported integer target offset.');
  if (clip?.format !== 'neurosurge-wrist-replay-v2' || clip.subject !== 'sub-41' ||
      clip.run !== '03' || clip.trial !== 1 || clip.sourceSampleRateHz !== 512 ||
      clip.encoderUpdateRateHz !== 100 || clip.cueSourceRow !== 2587 ||
      clip.firstSourceRow !== 2331 || clip.lastSourceRow !== 3867 ||
      clip.members?.sourceRunSha256 !== '1673b46a2cd206b533e57b2540980f36ec5f90a8612e361238e2bf264ea5a23a' ||
      !sameOrder(clip.montage?.scalp, SCALP) || !sameOrder(clip.montage?.rightForearm, FOREARM)) {
    throw new Error('The clip, stored clock or electrode order differs from the published wrist trial.');
  }
  return clip.cueSourceRow - clip.firstSourceRow + offset;
}

function series(clip, key) {
  const values = clip.series?.[key];
  if (!Array.isArray(values) || values.length !== clip.lastSourceRow - clip.firstSourceRow + 1) {
    throw new Error('Incomplete wrist channel: ' + key);
  }
  return values;
}

function angle(value) {
  if (!Number.isFinite(value) || Math.abs(value) > 180) throw new Error('Invalid encoder angle.');
  return value;
}

function microvolts(value) {
  if (!Number.isInteger(value) || value < -32768 || value > 32767) {
    throw new Error('Invalid recorded electrode sample.');
  }
  return value;
}

export function pairedInput(clip, offset) {
  const cutoff = targetIndex(clip, offset) - LEAD;
  const angles = AXES.map(key => series(clip, key));
  const scalp = SCALP.map(name => series(clip, 'scalp' + name + '_uV'));
  const forearm = FOREARM.map(name => series(clip, 'forearm' + name + '_uV'));
  const anchor_deg = angles.map(channel => angle(channel[cutoff]));
  const mean_angles_deg = [], emg_rms_uv = [], eeg_mean_uv = [];
  const first = cutoff - BIN_COUNT * BIN_WIDTH + 1;
  for (let bin = 0; bin < BIN_COUNT; bin++) {
    const angleSums = [0, 0], squares = [0, 0, 0, 0], scalpSums = Array(8).fill(0);
    const start = first + bin * BIN_WIDTH;
    for (let i = start; i < start + BIN_WIDTH; i++) {
      for (let axis = 0; axis < angles.length; axis++) angleSums[axis] += angle(angles[axis][i]);
      for (let p = 0; p < squares.length; p++) {
        const difference = microvolts(forearm[2*p][i]) - microvolts(forearm[2*p + 1][i]);
        squares[p] += difference * difference;
      }
      for (let e = 0; e < scalp.length; e++) scalpSums[e] += microvolts(scalp[e][i]);
    }
    // Keep absolute bin means here. The published predictor subtracts the single
    // cutoff anchor from every angle bin before converting to float32.
    mean_angles_deg.push(angleSums.map(value => value / BIN_WIDTH));
    emg_rms_uv.push(squares.map(value => Math.sqrt(value / BIN_WIDTH)));
    eeg_mean_uv.push(scalpSums.map(value => value / BIN_WIDTH));
  }
  return { target_offset_after_cue_ticks: offset, anchor_deg, mean_angles_deg, emg_rms_uv, eeg_mean_uv };
}

export function pairedMeasurement(clip, offset) {
  const target = targetIndex(clip, offset);
  return AXES.map(key => angle(series(clip, key)[target]));
}
