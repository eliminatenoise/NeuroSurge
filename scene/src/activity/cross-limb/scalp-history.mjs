/** Generate twenty mathematical mean/RMS pairs per site in the selected study's units. */
export function exampleScalpHistory(domain) {
  const scale = domain === 0 ? 1.5 : 35;
  const scalp_values = Array.from({length:20}, (_,t) => Array.from({length:3}, (_,j) => {
    const mean = scale * Math.cos(0.38*t + 0.7*j);
    return [mean, Math.hypot(mean, 1.4*(j+1))];
  }));
  return {scalp_mask:[true,true,true], scalp_values};
}

/** Derive one invented scalp history without altering the muscle or motion input. */
export function editScalpHistory(example, gain, reverse, sites) {
  if (!Number.isFinite(gain) || gain <= 0 || ![true,false].includes(reverse) ||
      !['all','sides','middle'].includes(sites)) throw Error('Invalid scalp comparison');
  const scalp_mask = example.scalp_mask.map((present,j) =>
    present && (sites === 'all' || (sites === 'middle' ? j === 1 : j !== 1)));
  if (!scalp_mask.some(Boolean)) throw Error('The selected example has no usable site in this set');
  const sequence = reverse ? example.scalp_values.slice().reverse() : example.scalp_values;
  const scalp_values = sequence.map(bin => bin.map(([mean,rms],j) =>
    scalp_mask[j] ? [gain * mean, gain * rms] : [0,0]));
  return {scalp_mask,scalp_values};
}
