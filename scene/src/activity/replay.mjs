const CLIP_HASH = 'e50331490f2f2f33208e89c9a5f2679f08349c1030b9e5d2424e6bce955db59d';
export const TRACES = Object.freeze([
  { key: 'scalpC3_uV', label: 'Scalp EEG · C3', unit: 'µV', color: '#dcbeff' },
  { key: 'forearmM3LminusM3R_uV', label: 'Forearm EMG · M3L − M3R', unit: 'µV', color: '#f6b985' },
  { key: 'wristExtension_deg', label: 'Wrist extension', unit: '°', color: '#6ee6c3', angle: true },
  { key: 'wristRadialDeviation_deg', label: 'Wrist radial deviation', unit: '°', color: '#92cfff', angle: true }
]);

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
