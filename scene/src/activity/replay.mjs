const CLIP_HASH = '578184a108d7682c37a4f409ce4cd7535b33d203007f39ca0f5d28831ffde41f';
// Nominal 10–10 positions for the diagram. The archive supplies no digitized coordinates.
export const SCALP = [
  ['C3', 72, 94], ['C1', 111, 94], ['Cz', 150, 94], ['C2', 189, 94], ['C4', 228, 94],
  ['CP3', 76, 148], ['CPz', 150, 151], ['CP4', 224, 148]
];
export const FOREARM = [
  ['M1', 'Extensor carpi radialis longus'], ['M2', 'Extensor carpi ulnaris'],
  ['M3', 'Flexor carpi radialis'], ['M4', 'Palmaris longus']
];
const voltage = (key, label, color) => ({ key, label, unit:'µV', color });
export const SCALP_TRACES = SCALP.map(([site]) => voltage('scalp' + site + '_uV', 'Scalp EEG · ' + site, '#dcbeff'));
export const FOREARM_TRACES = FOREARM.flatMap(([pair]) => [
  voltage('forearm' + pair + 'Lminus' + pair + 'R_uV', 'Forearm EMG · ' + pair + 'L − ' + pair + 'R', '#f6b985'),
  ...['L', 'R'].map(side => voltage('forearm' + pair + side + '_uV', 'Forearm EMG · ' + pair + side, '#f6b985'))
]);
export const TRACES = Object.freeze([
  SCALP_TRACES[0], FOREARM_TRACES.find(t => t.key === 'forearmM3LminusM3R_uV'),
  { key: 'wristExtension_deg', label: 'Wrist extension', unit: '°', color: '#6ee6c3', angle: true },
  { key: 'wristRadialDeviation_deg', label: 'Wrist radial deviation', unit: '°', color: '#92cfff', angle: true }
]);

// Every time and channel uses the same fixed microvolt scale. White is zero.
export const EEG_LIMIT_UV = 60;
export function scalpColour(value) {
  const endpoint = value < 0 ? [27,112,161] : [180,76,18];
  const neutral = [238,240,239];
  const fraction = Math.min(1, Math.abs(value) / EEG_LIMIT_UV);
  return 'rgb(' + neutral.map((v, i) => Math.round(v + fraction * (endpoint[i] - v))).join(',') + ')';
}

// Equal degrees per pixel for both axes. The origin and bounds are shared with the SVG axes.
export function wristPoint(extension, radialDeviation) {
  return [126 + extension * 1.45, 110 - radialDeviation * 1.45];
}

export async function loadClip() {
  const url = new URL('../../../inputs/activity/wrist-pointing.json', import.meta.url);
  const response = await fetch(url);
  if (!response.ok) throw new Error('Recording unavailable');
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  if (hex !== CLIP_HASH) throw new Error('Recording checksum differs');
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function cueSeconds(clip, index) {
  return (clip.firstSourceRow + index - clip.cueSourceRow) / clip.sourceSampleRateHz;
}

export async function loadForecast(clip) {
  await import('./temporal-r1.js');
  const forecast = await window.WristRecorded.forecastRecordedTrial(clip.forecastInput);
  for (const row of forecast.rows) {
    const i = clip.cueSourceRow - clip.firstSourceRow + Math.round(row.timeSeconds * clip.sourceSampleRateHz);
    const axes = [clip.series.wristExtension_deg[i], clip.series.wristRadialDeviation_deg[i]];
    if (!axes.every((v, axis) => Math.abs(row.measuredDegrees[axis] - v) < 1e-6)) {
      throw new Error('Forecast target and recording disagree.');
    }
  }
  return forecast.rows;
}

// SVG geometry is built once for each measured signal. Every stored row appears
// in the line, including short voltage excursions that a stride could skip.
export function tracePath(values, limit) {
  const width = 600, half = 23, last = values.length - 1;
  return values.map((v, i) => (i ? 'L' : 'M') + (width * i / last).toFixed(2) +
    ',' + (half - half * v / limit).toFixed(2)).join(' ');
}
