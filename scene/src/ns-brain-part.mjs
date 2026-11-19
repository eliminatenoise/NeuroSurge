/** The two halves of the brain drawn apart (19 November 2026).
 *
 * The owner: "let's center the motor strip on either side of the head of the mirror body. So maybe we'll keep a bigger
 * gap between the hemispheres. So it looks like almost hair coming out of either side of the mirror body's head."
 *
 * WHAT THIS IS. A display choice with no anatomical meaning. Every mesh of a cerebral half is moved `eachMm` straight
 * away from the midline (the left half toward +x, the right half toward -x; BodyParts3D atlas millimetres), so the gap
 * between the two leg areas at the top of the n-shaped motor strip is wide enough for the mirror body's head to stand
 * in it. In the atlas the two halves lie about 2 mm apart. Nothing inside a half changes: the same meshes, the same
 * areas, the same distances within the half. The parts in the middle that belong to neither half (the brainstem, the
 * cerebellum, the hypothalamus, the ventricles of the midline: `middle`, words of their atlas names) stay where they
 * are and show at the bottom of the gap.
 *
 * The move is made ONCE, on the loaded positions, before anything is built from them (ns-app start; the loading
 * picture's worker does the same to the meshes it draws), so the areas, the picker, the labels, the light beams, the
 * turn arrows, the outline and the hidden-things picture all come from the parted brain and agree with what is drawn.
 * The eyeballs and the ends of their nerves follow their halves (ns-brain-eyes). eachMm 0 = the atlas brain as it is.
 *
 * Pure: no imports, no Three.js, no DOM (the loading picture's worker imports this file).
 */
export const HEMI_GAP = Object.freeze({
  eachMm: 6,
  middle: Object.freeze(['third ventricle', 'fourth ventricle', 'aqueduct', 'habenula', 'hypothalamus', 'colliculus', 'medulla', 'midbrain', 'pons', 'tuber cinereum', 'cerebellum', 'pineal'])
});

/** Which way a brain mesh moves when the halves are drawn apart: +1 (the left half, toward +x), -1 (the right half) or
 * 0 (a part of the middle, or a mesh that lies across the midline). From its atlas name where that says left or right,
 * else from where its points lie. mesh: { name?, positions }. Pure. */
export function hemisphereSideOf(mesh, { middle = HEMI_GAP.middle } = {}) {
  const name = String((mesh && mesh.name) || '').toLowerCase();
  if (middle.some(w => name.includes(w))) return 0;
  if (/\bleft\b/.test(name)) return 1;
  if (/\bright\b/.test(name)) return -1;
  const p = mesh && mesh.positions;
  if (!p || !p.length) return 0;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < p.length; i += 3) { if (p[i] < lo) lo = p[i]; if (p[i] > hi) hi = p[i]; }
  // (the atlas midline is at about x = -0.6 mm: the left half's meshes start at -0.5 or more, the right half's end at -0.6 or less)
  return lo >= -1 ? 1 : hi <= 0 ? -1 : 0;
}

/** A copy of `positions` (xyz triples, atlas mm) moved `side * eachMm` along x; the same array when nothing moves. Pure. */
export function partedPositions(positions, side, eachMm = HEMI_GAP.eachMm) {
  if (!side || !(eachMm > 0)) return positions;
  const out = new positions.constructor(positions.length), d = side * eachMm;
  for (let i = 0; i < positions.length; i += 3) { out[i] = positions[i] + d; out[i + 1] = positions[i + 1]; out[i + 2] = positions[i + 2]; }
  return out;
}
