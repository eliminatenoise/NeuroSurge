/** NeuroSurge scene: the PAINTED, WET look of the two bodies (18 November 2026).
 *
 * The owner's words (17 November): "a hyper-detailed hyper-real glossy fleshy but not gory or bloody yet still
 * somewhat viscerally disturbing telltale games art style rather than borderlands. The difference I guess can be
 * somewhat subtle." And (18 November): "Some rough patchy small-poxy muscles need work such as pelvis / hip flexors."
 * "I want flat depressed chest not booby pumped out chest."
 *
 * Until now the bodies were drawn Borderlands-style (ns-scene-three patchComicShaders, ns-colors BODY_CEL): four hard
 * tone bands, a flat highlight sticker with a hard edge, ink lines round every muscle, ink hatching in the shadow
 * bands and an ink stipple on bone. On a real, slightly bumpy anatomy mesh that gave the faults the owner names: the
 * band edges break into ragged patches wherever the surface is uneven (the hip flexors and the inside of the pelvis
 * most of all), the hatch strokes and the bone stipple read as pock marks, and each chest muscle carried one big
 * round highlight sticker, so it read as a rounded mound.
 *
 * What replaces it (the same single material pass, the same hooks, no new draw, no texture; pure strings here):
 *  - PAINT, not bands. The light factor L (lit luminance over albedo luminance, exactly as before) goes through ONE
 *    smooth curve from a deep shade to a light one (ramp, levels): deep shades and light lights stay (11 November:
 *    "deep deep shades to light light shades"), but there is no edge to break up. The shadow side turns WARM and
 *    more saturated (shadowTint: light that has passed through tissue is red), instead of the old cool neutral dark.
 *  - FIBRES. Each muscle carries a FIBRE FRAME per vertex (fibreFrame below, in place of the old ink's hatch frame
 *    in the same attribute nsHatch): which fibre passes through the vertex (its place across the muscle, measured
 *    in the muscle's own girth at that place) and how far along the muscle it lies. Three levels of bundles are
 *    drawn in that frame (groups of bundles, bundles, and fine strands close up): rounded bundles lying side by
 *    side, each with its own shade, a darker parting between two of them. They run the muscle's length and converge
 *    where it narrows (a fan such as the chest muscle fans from its broad origin to its tendon). The bundles are a
 *    change of colour AND a height (a bump of the normal BEFORE the lights are summed), so every bundle carries its
 *    own streak of the wet highlight instead of one round patch on the whole muscle. Each level fades out before its
 *    bundles would be under two pixels wide (the mirror body at its start distance shows none: no noise, no
 *    shimmer), and all of it fades out on a surface seen edge-on.
 *  - WET. The highlight is the real (GGX) highlight of the lights, compressed so that it can never blow out into a
 *    white patch (wet.max), plus small glints where it peaks. No hard-edged sticker any more.
 *  - TENDON AND BONE. Pearly tendon ends keep fine strands and a tighter gloss; bone is a smooth ivory with a warm
 *    shadow side, a faint large-scale mottling (no dots, no stipple) and a soft gloss.
 *  - RIM. A thin cool light on the silhouette on the side of the scene's rim light, in the tissue's own colour,
 *    instead of the crisp rim band. (A wet film at grazing angles all round was tried and taken out: it laid a
 *    grey-lilac veil over every muscle seen edge-on.)
 * The activation glow is emission. On a glowing muscle everything takes the glow's own hue (the lit surface, its
 * white tendon parts, the wet highlight), the glow follows the shading a little and shows the fibres (glowForm), and
 * no channel is allowed to clip: a lit muscle is its motor area's colour all over, in shade and in light, with form.
 *
 * Display choices only: nothing here says anything about real tissue optics.
 */

const f = x => (Number.isInteger(x) ? `${x}.0` : `${x}`);
const v3 = c => `vec3( ${c.map(f).join(', ')} )`;
const freeze = Object.freeze;

/** The numbers of the look (all unitless unless a unit is named).
 *  ramp: the light factor L (about 0.14 where only the flat fill reaches, about 1.0 to 1.25 facing the key light) is
 *    mapped by smoothstep(lo, hi, L) ^ curve from the deep level to the high level.
 *  muscle / white: deep and high levels (factors of the albedo) of a muscle belly and of white tissue (tendon parts
 *    and bone: a white digit must not end in a black point, so its deep level stays a light grey-tan), and the tint
 *    the shadow side takes (multiplied in fully at L <= lo, not at all at L >= hi).
 *  fibre: THREE LEVELS of fibres, each a row of rounded bundles lying side by side with a parting between them:
 *    groupMm (bundle groups), bundleMm (bundles) and strandMm (fine strands, seen only when a muscle is close) = their
 *    widths in millimetres at the muscle's typical girth; *RunMm = how far along the muscle one keeps its shade;
 *    amp = the colour change (+-) and shares = how much of it each level carries; partAmp = how much darker the
 *    parting between two bundles is, partShares per level; bumpMm = the height of a bundle of each level in
 *    millimetres; maxSlope = the steepest tilt the bump may give the normal (tangent of the angle); bumpViewFrom /
 *    bumpViewTo = |N.V| between which the bump fades in (it is at full height only on a surface seen from the front:
 *    on a slanted one its flanks turned in and out of the light and drew dark streaks); bumpVary = a bundle's height
 *    goes from the first to the second of these (x bumpMm) with its own shade, so no two neighbours stand equally
 *    proud; widthWaves = the bundles are of UNEVEN width: the fibre number is stretched and squeezed by `share`
 *    (+-, their sum under 1) over a wavelength of 2 pi x acrossMm across the muscle, drifting sideways once in
 *    2 pi x alongMm along it (this is also the fibres' gentle waviness) (third round: the checker saw very even
 *    parallel ridges on the big sheets, "like pleated cloth or corrugated card"); capFrom / capTo = the sine of the
 *    angle between the surface and the muscle's long axis between which the fibres fade in (none on an end cap, where
 *    lines would meet in a star or run in rings); crossFrom / crossTo = the sine of the angle between the fibre lines
 *    and the long axis between which they fade out (the frame cannot give lengthwise lines there: smooth wet muscle
 *    rather than lines that run across); tendonAmp = the share kept on a tendon part;
 *    glowKeep = the share kept on a glowing muscle; fadeFrom / fadeTo = bundles per pixel between which a level fades
 *    out (it is gone before a bundle is two pixels wide: nothing can shimmer); aaPx = the half-width of the edge
 *    between two bundles in pixels (never under edgeMin of a bundle); viewFrom / viewTo = |N.V| between which all of
 *    it fades out on a surface seen edge-on (checker's blocker, 18 November: at a grazing angle the bump broke into
 *    dark blocks that changed from frame to frame; an edge-on muscle is now one clean smooth piece).
 *  wet: gain x the summed highlight, compressed toward max (belly) or maxWhite (tendon, bone); glint = the extra a
 *    peak adds between glintLo and glintHi of the highlight's luminance; partKeep = the share of the highlight a
 *    parting between bundles keeps (the highlight sits on the bundles: a run of streaks, never one round patch);
 *    glowKeep = the share of the highlight a glowing muscle keeps, and it takes the GLOW'S OWN COLOUR there (third
 *    round, the checker: broad yellow and white bands lay over a lit green muscle; yellow share of the lit belly 4 %
 *    in the comic look, 25 % in the second painted build).
 *  rim: gain x a soft (1 - |N.V|) ^ power toward the silhouette on the rim light's side, in `colour`, tinted by the
 *    tissue's own colour (white = the share of plain white in it). film (a wet film at grazing angles all round) is
 *    0: it laid a grey-lilac veil over a muscle seen edge-on.
 *  glowForm: a glowing muscle keeps its form: its glow is multiplied by lo in its deepest shade and hi in full light
 *    (third round: lo 0.6 -> 1.3, and the warm shadow tint is left off a glowing muscle: a lit muscle in shade was a
 *    dull khaki strip, because a dark yellow IS khaki. A glowing thing makes its own light: in shade the glow now
 *    makes up for part of the light that is missing, so shade to light is about 0.45 to 0.9 of the glow colour
 *    instead of 0.2 to 0.9 (lo 2 was tried: the same brightness everywhere, a flat pale colour); the fibres show at
 *    full contrast in the glow, fibre.glowKeep 0.6 -> 1); tint = how far the lit surface itself takes the glow's
 *    hue at the same brightness (the white tendon parts of a glowing muscle become the lightest places of the same
 *    colour); glowTint = how far the glow itself takes that hue (the glow colour carries some white: a yellow
 *    area's muscle in shade was sand-coloured beside its saturated yellow area on the brain; half-way, so the
 *    white-hot moment of the flash stays whiter than the held glow); hueDeepen = the share of the glow colour's
 *    weakest channel taken out of the hue (the hue is the glow colour without most of its white); max = the brightest channel a glowing muscle
 *    may reach: above it the WHOLE colour is scaled down, so the brightest places keep the glow's hue instead of
 *    clipping toward yellow or white.
 *  bone: mottle = the +- shade change of the large-scale mottling, mottleMm = its size, warm = the tint its darker
 *    patches lean to.
 *  Second round, 18 November (the checker measured the first painted build LESS glossy and flatter than the comic
 *  one: tone spread down 9 to 19 %, the brightest muscle pixels almost gone): the curve is steeper and reaches
 *  higher (lo 0.14 -> 0.2, hi 1.35 -> 1.1, deep 0.13 -> 0.075, high 1.02 -> 1.14: the comic look's own lowest and
 *  highest levels were 0.08 and 1.1; white tissue's high level 0.9 -> 0.8, so that the gloss on bone and tendon
 *  has room to show), and the highlight may be far brighter (max 0.3 -> 0.62, maxWhite 0.2 -> 0.5,
 *  gain 1.4 -> 4, the glint from a highlight of 0.1 on): it cannot become a white patch again because the bundles
 *  break it into streaks. */
export const BODY_FLESH = freeze({
  ramp: freeze({ lo: 0.2, hi: 1.1, curve: 1.25 }),
  muscle: freeze({ deep: 0.075, high: 1.14, shadowTint: freeze([1.0, 0.62, 0.55]), chroma: 1.2 }),
  white: freeze({ deep: 0.34, high: 0.8, shadowTint: freeze([1.0, 0.85, 0.74]) }),
  fibre: freeze({
    groupMm: 9, bundleMm: 3.2, strandMm: 1.1, groupRunMm: 160, bundleRunMm: 90, strandRunMm: 50,
    amp: 0.24, shares: freeze([0.4, 0.5, 0.3]), partAmp: 0.24, partShares: freeze([0.45, 0.8, 0.5]),
    bumpMm: freeze([0.3, 0.24, 0.1]), bumpVary: freeze([0.25, 1.35]), maxSlope: 0.34, bumpViewFrom: 0.3, bumpViewTo: 0.8,
    widthWaves: freeze([freeze({ acrossMm: 6.1, share: 0.36, alongMm: 23 }), freeze({ acrossMm: 1.7, share: 0.3, alongMm: -37 })]),
    capFrom: 0.3, capTo: 0.6, crossFrom: 0.8, crossTo: 0.94,
    tendonAmp: 0.45, glowKeep: 1, fadeFrom: 0.22, fadeTo: 0.5, aaPx: 0.9, edgeMin: 0.1, viewFrom: 0.2, viewTo: 0.55
  }),
  // 19 November 2026 (the owner: "Body is probably too glossy and it makes everything really hard to differentiate from
  // each other"): a satin surface. The highlight is under half of what it was (gain 4, max 0.62, maxWhite 0.5, glint
  // 0.34), so a muscle's own tone and its edge carry the picture, not the reflections lying across them.
  wet: freeze({ gain: 1.6, max: 0.26, maxWhite: 0.28, glint: 0.1, glintLo: 0.1, glintHi: 0.3, partKeep: 0.35, glowKeep: 0.3 }),
  rim: freeze({ gain: 0.42, power: 3.4, colour: freeze([0.8, 0.9, 1.0]), white: 0.15, film: 0 }),
  glowForm: freeze({ lo: 1.3, hi: 1.0, max: 0.97, tint: 0.85, glowTint: 0.5, hueDeepen: 0.8 }),
  bone: freeze({ mottle: 0.06, mottleMm: 18, warm: freeze([1.0, 0.94, 0.86]),
    // 18 November 2026 (package DETAIL; the brief: "bone with its smooth shafts, rougher ends ..., cartilage caps on the
    // joint surfaces in a bluish white"): from the per-vertex nsBoneEnd (ns-detail boneEndWeights; x cartilage, y end).
    // cart = the cartilage cap's tint over the bone's ivory (a cool, slightly lighter pearly white), cartMottle = the share
    // of the mottling left on it (hyaline cartilage is smooth), cartWet = its highlight's ceiling (wet and glassy: brighter
    // than the bone's maxWhite); endMottle = the mottling's strength on the ends against the shaft, endGrain / endGrainMm =
    // a faint finer grain there (thin cortex over spongy bone), never on the cap.
    cart: freeze([0.8, 0.9, 1.1]), cartMottle: 0.25, cartWet: 0.62, endMottle: 1.7, endGrain: 0.035, endGrainMm: 3.5 })
});

/** How the fibre frame is packed into the four numbers a vertex carries (fibreFrame writes them, fleshFibreGlsl
 * reads them): the `along` number also carries the muscle's roundness as a whole multiple of `roundStep` (in
 * `roundLevels` steps), after an offset `alongOffset` that keeps it positive; minRadiusShare = the least a slice's
 * radius counts for (share of the typical radius). The fourth number carries the cone's radius share (under
 * `radiusStep`) plus `radiusStep` x a whole CODE of the muscle's typical radius: radius = 2 ^ (code x radiusLog2 /
 * radiusCodes) millimetres (codes 0 .. radiusCodes: 1 mm to 256 mm in steps of a fifth; the same for every vertex of
 * a mesh, so it comes through the interpolation unchanged). centreDegree = the highest degree of the centre line's
 * polynomial, centreFloorDegree the lowest. Two faults pull opposite ways:
 *  - a centre line that does not follow the muscle (a parabola through an S-shaped or sharply bent muscle) draws the
 *    fibres along ITSELF, in arcs across the muscle (the checker's "rings like a contour map" on a head of
 *    gastrocnemius seen from the lifted thigh: the slice centres lay half a radius off the parabola);
 *  - a bent centre line is not a straight-line function of the position, so inside ONE triangle the frame is off by
 *    about (the line's second derivative) x (the triangle's length along the muscle) squared / 8, and the fibre lines
 *    kink by that much at the triangle's edges. On a fine mesh that is nothing; on a coarse one (the chest and the
 *    shoulder right under the eyes: triangles 30 mm long) a degree-4 line drew zigzags.
 * So: the parabola (the second round's line) unless it kinks by more than parabolaKinkMaxMm (then a straight line,
 * which never kinks); and degree 3 or 4 only where that brings the line at least centreGain typical radii closer to
 * the slice centres AND its kink is under kinkMaxMm, on all but kinkShare of the surface (the area of up to
 * kinkSamples triangles, when the triangle list is given).
 * insideShare / insideFrom / insideTo: see fibreFrame (the angle is used only where the centre line lies well inside
 * the muscle). */
export const FIBRE_PACK = freeze({ roundStep: 2048, roundLevels: 8, alongOffset: 512, minRadiusShare: 0.3, radiusStep: 8, radiusCodes: 31, radiusLog2: 8, centreDegree: 4, centreFloorDegree: 1, kinkMaxMm: 1, parabolaKinkMaxMm: 2.5, centreGain: 0.15, kinkShare: 0.05, kinkSamples: 3000, insideShare: 0.03, insideFrom: 0.3, insideTo: 0.5 });
/** The whole code of a typical radius (mm) and the radius a code stands for (FIBRE_PACK). */
export function fibreRadiusCode(mm, pack = FIBRE_PACK) { return Math.min(pack.radiusCodes, Math.max(0, Math.round(Math.log2(Math.max(mm, 1e-6)) * pack.radiusCodes / pack.radiusLog2))); }
export function fibreRadiusOfCode(code, pack = FIBRE_PACK) { return 2 ** (code * pack.radiusLog2 / pack.radiusCodes); }

/** The FIBRE FRAME of a muscle mesh (pure): four numbers per vertex from which the shader works out, PER PIXEL, which
 * fibre passes through a point (its place ACROSS the muscle, in millimetres at the muscle's typical girth) and how
 * far ALONG the muscle it lies. Stripes drawn in the first of those run along the muscle as fibres do.
 *  - `axis`: the muscle's long axis (the principal direction of its vertices; ns-scene-three fibreAxis). The muscle
 *    is cut into `bins` slices between the 1st and 99th percentile along the axis; each slice has its centre and ONE
 *    radius (the rms distance of its vertices from the centre). Through the slices goes a smooth CENTRE LINE (a
 *    polynomial of degree 2 to 4, least squares: the highest the mesh is fine enough for, FIBRE_PACK; `indices`, the
 *    triangle list, says how fine; past the two ends the line goes on straight) and a
 *    straight-line RADIUS (a cone, least squares; never under minRadiusShare of the typical radius, the
 *    75th-percentile slice).
 *  - the cross-section, measured from the centre line in units of the radius, has a WIDTH direction and a THICKNESS
 *    direction (its two principal directions over all vertices) and a roundness (thickness over width, rms).
 *  - per vertex: [ Nw, Nt, along', D' ]: the offset from the centre line along the width and along the thickness
 *    (mm), the place along the axis (mm, packed with the roundness: FIBRE_PACK), and D = the cone's radius there over
 *    the typical radius (packed with the typical radius' code). Nw, Nt and D are (all but exactly) straight-line
 *    functions of the position, so they are exact at every pixel of a triangle however coarse the mesh is; the shader
 *    then takes
 *      on a broad thin SHEET (roundness up to sheetBelow):  across = Nw / D    (the place along the width, in the
 *        girth of that slice: the fibres of a fan such as the chest muscle converge on the cone's tip);
 *      on a ROUND belly (roundness from roundAbove):  across = R x atan2( Nw, |Nt| )   (R = the typical radius: the
 *        ANGLE round the centre line, the same on the front and the back, from one flank to the other; the fibres
 *        converge at both ends);
 *      in between, a mix of the two (both rise from one flank to the other, so the mix does too).
 *  Why this way (second round, 18 November): the first painted build drew its bundles in TWO cross coordinates worked
 *  out per vertex. Two coordinates: wherever the surface was not parallel to the long axis the two sets of cell
 *  borders crossed and a crisp pattern broke into tiles and stair steps. Per vertex: the frame followed every slice's
 *  own centre and radius, which is far from a straight-line function of the position, so on a coarse mesh (the chest
 *  right under the eyes) every line kinked at every triangle edge (chevrons). (The comic ink before that used
 *  an angle after scaling the two cross directions separately: on a thin sheet that angle swung with every small
 *  unevenness.)
 *  Third round (18 November, the checker: crosswise scalloped ridges like a row of chevrons on a strap muscle of the
 *  lifted thigh, concentric rings on a muscle at the knee, zigzags under the armpit). Two causes, both in the round
 *  belly's number, which was the ARC |N| / D x atan2( Nw, |Nt| ) round a PARABOLA centre line:
 *   1. a long curved strap (sartorius, gracilis) is not a parabola, so the centre line left the muscle; then |N|, the
 *      distance to that line, grew and shrank ALONG the muscle and the level lines of |N| x angle ran ACROSS it
 *      (with a kink where Nt changes sign: the chevrons); where the line came near the surface they were rings.
 *      The centre line is now a polynomial of up to degree 4, which follows an S-shaped strap;
 *   2. the number is now R x angle with R one number for the whole muscle. The level lines of an ANGLE round the
 *      centre line are the lines in which a half-plane hinged on that line cuts the surface: they run along the
 *      centre line wherever it lies, inside the muscle or beside it, and can never run across.
 *  The shader (fleshFibreGlsl) also checks every pixel: where the lines of the frame would still run across the
 *  muscle's length, or on an end cap, no fibres are drawn at all (smooth wet muscle).
 * Returns { attr: Float32Array(4 n), typicalRadiusMm, radiusMm (what the code stands for), roundness, round (0 sheet
 * .. 1 round belly, in steps), centreFit (rms distance of the slice centres from the centre line over the typical
 * radius), centreDegree, inside (how far from the centre line the surface stays, over the radius) } or null for a degenerate mesh. fibreAcross(attr, i) gives the shader's `across` for a vertex. */
export function fibreFrame(positions, axis, { bins = 16, minCount = 4, sheetBelow = 0.45, roundAbove = 0.7, pack = FIBRE_PACK, indices = null } = {}) {
  const n = positions ? Math.floor(positions.length / 3) : 0;
  const a = axis;
  if (n < 8 || !a || a.length !== 3 || !a.every(Number.isFinite)) return null;
  const ref = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u = [a[1] * ref[2] - a[2] * ref[1], a[2] * ref[0] - a[0] * ref[2], a[0] * ref[1] - a[1] * ref[0]];
  const ul = Math.hypot(u[0], u[1], u[2]);
  if (!(ul > 1e-9)) return null;
  u = [u[0] / ul, u[1] / ul, u[2] / ul];
  const v = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
  const t = new Float32Array(n), pu = new Float32Array(n), pv = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = positions[3 * i], y = positions[3 * i + 1], z = positions[3 * i + 2];
    t[i] = x * a[0] + y * a[1] + z * a[2]; pu[i] = x * u[0] + y * u[1] + z * u[2]; pv[i] = x * v[0] + y * v[1] + z * v[2];
  }
  const st = Float32Array.from(t).sort();
  const lo = st[Math.floor(0.01 * (n - 1))], hi = st[Math.ceil(0.99 * (n - 1))];
  if (!(hi - lo > 1e-6)) return null;
  const B = bins, cnt = new Float64Array(B), su = new Float64Array(B), sv = new Float64Array(B), srr = new Float64Array(B);
  const binOf = s => Math.min(B - 1, Math.max(0, Math.floor((s - lo) / (hi - lo) * B)));
  for (let i = 0; i < n; i++) { const k = binOf(t[i]); cnt[k]++; su[k] += pu[i]; sv[k] += pv[i]; }
  const cu = new Float64Array(B), cv = new Float64Array(B), rr = new Float64Array(B);
  for (let k = 0; k < B; k++) if (cnt[k] > 0) { cu[k] = su[k] / cnt[k]; cv[k] = sv[k] / cnt[k]; }
  for (let i = 0; i < n; i++) { const k = binOf(t[i]); srr[k] += (pu[i] - cu[k]) ** 2 + (pv[i] - cv[k]) ** 2; }
  for (let k = 0; k < B; k++) if (cnt[k] > 0) rr[k] = Math.sqrt(srr[k] / cnt[k]);
  // least squares through the slices that hold enough vertices (x = the slice's place along the axis, -1 .. 1)
  const xs = [], wu = [], wv = [], wr = [], ww = [];
  for (let k = 0; k < B; k++) if (cnt[k] >= minCount) { xs.push((k + 0.5) / B * 2 - 1); wu.push(cu[k]); wv.push(cv[k]); wr.push(rr[k]); ww.push(cnt[k]); }
  if (xs.length < 1) return null;
  const fit = (ys, degree) => {
    const m = Math.min(degree, xs.length - 1) + 1, A = Array.from({ length: m }, () => new Float64Array(m + 1));
    for (let j = 0; j < xs.length; j++) for (let r = 0; r < m; r++) { for (let c = 0; c < m; c++) A[r][c] += ww[j] * xs[j] ** (r + c); A[r][m] += ww[j] * ys[j] * xs[j] ** r; }
    for (let c = 0; c < m; c++) { // Gauss-Jordan with partial pivoting (at most 3 x 3)
      let pv = c; for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[pv][c])) pv = r;
      if (Math.abs(A[pv][c]) < 1e-12) return null;
      [A[c], A[pv]] = [A[pv], A[c]];
      for (let r = 0; r < m; r++) if (r !== c) { const k = A[r][c] / A[c][c]; for (let q = c; q <= m; q++) A[r][q] -= k * A[c][q]; }
    }
    const co = new Float64Array(pack.centreDegree + 1); for (let r = 0; r < m; r++) co[r] = A[r][m] / A[r][r];
    return co;
  };
  const xOf = s => (s - lo) / (hi - lo) * 2 - 1;
  // the share of the triangles inside which a centre line (cu, cv) bends by more than kinkMaxMm
  const tri = indices && indices.length >= 3 ? indices : null, triStep = tri ? 3 * Math.max(1, Math.ceil(tri.length / 3 / pack.kinkSamples)) : 0;
  const kinkShare = (cu, cv, maxMm) => {
    if (!tri) return 0;
    let over = 0, all = 0;
    for (let k = 0; k + 2 < tri.length; k += triStep) {
      const a = t[tri[k]], b = t[tri[k + 1]], c = t[tri[k + 2]], t0 = Math.min(a, b, c), t1 = Math.max(a, b, c);
      const dx = (t1 - t0) * 2 / (hi - lo), x = Math.min(1, Math.max(-1, xOf(0.5 * (t0 + t1))));
      let du = 0, dv = 0; // second derivatives of the two polynomials at x
      for (let r = cu.length - 1; r >= 2; r--) { du = du * x + r * (r - 1) * cu[r]; dv = dv * x + r * (r - 1) * cv[r]; }
      // weighted by the triangle's area: a few large triangles among many small ones are most of what is seen
      const i = 3 * tri[k], j = 3 * tri[k + 1], l = 3 * tri[k + 2];
      const e1x = positions[j] - positions[i], e1y = positions[j + 1] - positions[i + 1], e1z = positions[j + 2] - positions[i + 2];
      const e2x = positions[l] - positions[i], e2y = positions[l + 1] - positions[i + 1], e2z = positions[l + 2] - positions[i + 2];
      const area = Math.hypot(e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x);
      if (0.125 * Math.hypot(du, dv) * dx * dx > maxMm) over += area;
      all += area;
    }
    return all ? over / all : 0;
  };
  const fr = fit(wr, 1) || fit(wr, 0);
  if (!fr) return null;
  const radii = Float64Array.from({ length: B }, (_, k) => fr[0] + fr[1] * ((k + 0.5) / B * 2 - 1)).sort();
  const typical = radii[Math.floor(0.75 * (B - 1))];
  if (!(typical > 1e-6)) return null;
  // the centre line at x: the polynomial between the two ends, straight on past them (a polynomial of degree 4 must
  // not be followed outside the slices it was fitted to)
  const centre = (c, x) => {
    const xc = x < -1 ? -1 : x > 1 ? 1 : x;
    let val = 0, der = 0;
    for (let r = c.length - 1; r >= 0; r--) { der = der * xc + val; val = val * xc + c[r]; }
    return val + der * (x - xc);
  };
  // how far the slice centres lie from a centre line, over the typical radius
  let fitN = 0; for (let j = 0; j < xs.length; j++) fitN += ww[j];
  const misfit = (cu, cv) => { let q = 0; for (let j = 0; j < xs.length; j++) q += ww[j] * ((wu[j] - centre(cu, xs[j])) ** 2 + (wv[j] - centre(cv, xs[j])) ** 2); return Math.sqrt(q / Math.max(fitN, 1)) / typical; };
  // The degree of the centre line (FIBRE_PACK): the parabola unless it kinks too much on this mesh (then a straight
  // line); a higher degree only where it brings the line clearly closer to the muscle's middle AND the mesh is fine
  // enough for it (of those, the one that lies closest).
  let fu = null, fv = null, degree = -1, centreFit = Infinity;
  const take = (d, cu, cv, m) => { fu = cu; fv = cv; degree = d; centreFit = m; };
  for (let d = Math.min(2, pack.centreDegree); d >= 0 && !fu; d--) {
    const cu = fit(wu, d), cv = fit(wv, d);
    if (cu && cv && (d <= pack.centreFloorDegree || kinkShare(cu, cv, pack.parabolaKinkMaxMm) <= pack.kinkShare)) take(d, cu, cv, misfit(cu, cv));
  }
  if (!fu || !fv) return null;
  const base = centreFit;
  for (let d = 3; d <= pack.centreDegree; d++) {
    const cu = fit(wu, d), cv = fit(wv, d);
    if (!cu || !cv) continue;
    const m = misfit(cu, cv);
    if (m <= base - pack.centreGain && m < centreFit && kinkShare(cu, cv, pack.kinkMaxMm) <= pack.kinkShare) take(d, cu, cv, m);
  }
  const floor = pack.minRadiusShare * typical;
  const du = new Float32Array(n), dv = new Float32Array(n), dd = new Float32Array(n);
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const x = xOf(t[i]);
    du[i] = pu[i] - centre(fu, x); dv[i] = pv[i] - centre(fv, x);
    dd[i] = Math.max(0.5 * floor, fr[0] + fr[1] * x) / typical;
    const g = 1 / Math.max(pack.minRadiusShare, dd[i]);
    sxx += du[i] * du[i] * g * g; sxy += du[i] * dv[i] * g * g; syy += dv[i] * dv[i] * g * g;
  }
  // the width and thickness directions of the cross-section, and how round it is
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), cw = Math.cos(ang), sw = Math.sin(ang);
  const l1 = sxx * cw * cw + 2 * sxy * cw * sw + syy * sw * sw, l2 = sxx * sw * sw - 2 * sxy * cw * sw + syy * cw * cw;
  const roundness = l1 > 0 ? Math.sqrt(Math.max(0, l2) / l1) : 1;
  const e = Math.min(1, Math.max(0, (roundness - sheetBelow) / (roundAbove - sheetBelow)));
  // The angle is only used where the centre line lies WELL INSIDE the muscle. Where the surface comes close to the
  // line (a crescent-shaped cross-section such as a head of gastrocnemius, whose middle lies at its hollow face; a
  // lumpy or branched mesh) the angle turns quickly round that place and the lines run in arcs and rings round it.
  // `inside` = the distance from the centre line, over the radius of the vertex's own slice (so that a tapering end,
  // which converges on the line, does not count), that all but insideShare of the vertices keep; under insideFrom
  // the muscle is drawn as a sheet (lines straight along it), with the full angle from insideTo.
  const rho = new Float32Array(n);
  for (let i = 0; i < n; i++) { const k = binOf(t[i]); rho[i] = cnt[k] >= minCount && rr[k] > 1e-6 ? Math.hypot(du[i], dv[i]) / rr[k] : 1; }
  rho.sort();
  const inside = rho[Math.floor(pack.insideShare * (n - 1))];
  const wi = Math.min(1, Math.max(0, (inside - pack.insideFrom) / (pack.insideTo - pack.insideFrom)));
  const level = Math.round(e * e * (3 - 2 * e) * wi * pack.roundLevels);
  const attr = new Float32Array(4 * n), code = fibreRadiusCode(typical, pack);
  for (let i = 0; i < n; i++) {
    attr[4 * i] = du[i] * cw + dv[i] * sw; attr[4 * i + 1] = -du[i] * sw + dv[i] * cw;
    attr[4 * i + 2] = Math.max(-pack.alongOffset + 1, Math.min(pack.roundStep - pack.alongOffset - 1, t[i] - lo)) + pack.alongOffset + pack.roundStep * level;
    attr[4 * i + 3] = Math.min(dd[i], pack.radiusStep - 0.5) + pack.radiusStep * code;
  }
  return { attr, typicalRadiusMm: typical, radiusMm: fibreRadiusOfCode(code, pack), roundness, round: level / pack.roundLevels, centreFit, centreDegree: degree, inside };
}
/** What the shader makes of four numbers of the frame (pure; the same arithmetic as fleshFibreGlsl): { across (mm at
 * the typical girth), along (mm), round (0..1), radiusMm }. fibreAcross reads them from a vertex of an attribute. */
export function fibreAcrossOf(nw, nt, z, w, pack = FIBRE_PACK) {
  const code = Math.floor(w / pack.radiusStep), d = Math.max(w - code * pack.radiusStep, pack.minRadiusShare), radiusMm = fibreRadiusOfCode(code, pack);
  const q = Math.floor(z / pack.roundStep), round = q / pack.roundLevels;
  const sheet = nw / d, belly = radiusMm * Math.atan2(nw, Math.abs(nt) + 1e-6);
  return { across: sheet + (belly - sheet) * round, along: z - q * pack.roundStep - pack.alongOffset, round, radiusMm };
}
export function fibreAcross(attr, i, pack = FIBRE_PACK) { return fibreAcrossOf(attr[4 * i], attr[4 * i + 1], attr[4 * i + 2], attr[4 * i + 3], pack); }

/** GLSL function (top level of the fragment shader, after nsHash3): ONE LEVEL of fibre bundles.
 * q: x = the place across the muscle in bundle widths, y = along it in runs; h = the half-width of the edge between
 * two bundles in bundle widths (at least about a pixel, at most 0.5); seed = the level's own number.
 * Returns x = the bundle's own shade (0..1; one value per bundle, changing slowly along it), y = 1 in the parting
 * between two bundles and 0 on a bundle, z = the slope across the muscle of a row of ROUNDED bundles of height 1
 * (a dome on every bundle, a groove in every parting; eased to nothing in the middle of the groove so that the
 * normal never flips from one pixel to the next). Four hashes. */
export const FLESH_FIBRE_FN_GLSL = `vec3 nsFibreLevel( vec2 q, float h, float seed ) {
	vec2 i = floor( q ), f = q - i;
	float t = smoothstep( 0.5 - h, 0.5 + h, f.x );
	float tz = f.y * f.y * ( 3.0 - 2.0 * f.y );
	float n = mix( mix( nsHash3( vec3( i, seed ) ), nsHash3( vec3( i.x + 1.0, i.y, seed ) ), t ),
		mix( nsHash3( vec3( i.x, i.y + 1.0, seed ) ), nsHash3( vec3( i + 1.0, seed ) ), t ), tz );
	float g = ( 1.0 - 2.0 * t ) * ( 1.0 - 2.0 * t );
	float d = 1.0 - abs( 2.0 * f.x - 1.0 );
	return vec3( n, 1.0 - g, 4.0 * d * sign( f.x - 0.5 ) * g );
}
`;

/** GLSL placed BEFORE the lights are summed (the normal is known, view space, name `normal`): the fibre bundles of a
 * muscle from its fibre frame (varying vNsHatch = fibreFrame's four numbers, unpacked here per pixel; nsHash3 and
 * nsFibreLevel in scope) and their bump. Declares, at the shader's main scope:
 *   nsFlFib   the fibres' shade, 0..1 around 0.5 (0.5 = no detail);
 *   nsFlPart  how much of a parting between two bundles this fragment is (0..1);
 *   nsFlK     how much of the detail is drawn (0..1);
 *   nsFlN0    the normal BEFORE the bump (fleshRestoreGlsl puts it back after the lights: the silhouette terms, the
 *             crease and the rim, must follow the smooth surface, or every bundle near an edge gets its own rim).
 * `on` is a GLSL bool expression (the detail is off at the coarse picture qualities). kind 'bone' draws no fibres. */
export function fleshFibreGlsl(kind = 'muscle', on = 'true', o = BODY_FLESH, P = FIBRE_PACK) {
  const F = o.fibre;
  if (kind !== 'muscle') return 'float nsFlFib = 0.5, nsFlK = 0.0, nsFlPart = 0.0;\n\tvec3 nsFlN0 = normal;';
  const fade = mm => `( 1.0 - smoothstep( ${f(F.fadeFrom)}, ${f(F.fadeTo)}, nsZp * ${f(1 / mm)} ) ) * nsZv`;
  const edge = mm => `clamp( nsZp * ${f(F.aaPx / mm)}, ${f(F.edgeMin)}, 0.5 )`;
  const level = (name, k, mm, runMm, seed, phase) => `vec3 ${name} = nsFibreLevel( vec2( nsZq * ${f(1 / mm)}, nsZal * ${f(1 / runMm)}${phase} ), ${edge(mm)}, ${f(seed)} );`;
  const add = (name, k, i, mm) => `nsZsh += ( ${name}.x - 0.5 ) * ${f(F.shares[i])} * ${k};
				nsZpt = max( nsZpt, ${name}.y * ${f(F.partShares[i])} * ${k} );
				nsZsl += ${name}.z * mix( ${f(F.bumpVary[0])}, ${f(F.bumpVary[1])}, ${name}.x ) * ${f(F.bumpMm[i] / mm)} * ${k};`;
  const W = F.widthWaves, minWarp = 1 - W.reduce((t, w) => t + w.share, 0);
  const phase = (w, i) => `nsZs * ${f(1 / w.acrossMm)} + nsZal * ${f(1 / w.alongMm)}${i ? ` + ${f(1.9 * i)}` : ''}`;
  return `float nsFlFib = 0.5, nsFlK = 0.0, nsFlPart = 0.0;
	vec3 nsFlN0 = normal;
	{
		// which fibre passes through this pixel (millimetres across the muscle at its typical girth) and how far along
		// the muscle it lies, from the four numbers of the fibre frame (ns-flesh fibreFrame, FIBRE_PACK): on a sheet the
		// place along its width, on a round belly the ANGLE round its centre line x the muscle's typical radius
		float nsZc = floor( vNsHatch.w * ${f(1 / P.radiusStep)} );
		float nsZD = max( vNsHatch.w - nsZc * ${f(P.radiusStep)}, ${f(P.minRadiusShare)} );
		float nsZrq = floor( vNsHatch.z * ${f(1 / P.roundStep)} );
		float nsZal = vNsHatch.z - nsZrq * ${f(P.roundStep)} - ${f(P.alongOffset)};
		float nsZs = mix( vNsHatch.x / nsZD, exp2( nsZc * ${f(P.radiusLog2 / P.radiusCodes)} ) * atan( vNsHatch.x, abs( vNsHatch.y ) + 1e-6 ), nsZrq * ${f(1 / P.roundLevels)} );
		// millimetres across and along the muscle per pixel (outside the branch: derivatives are defined in every lane)
		vec2 nsZd = vec2( dFdx( nsZs ), dFdy( nsZs ) );
		vec2 nsZa = vec2( dFdx( nsZal ), dFdy( nsZal ) );
		float nsZp = abs( nsZd.x ) + abs( nsZd.y );
		vec3 nsZsx = dFdx( - vViewPosition ), nsZsy = dFdy( - vViewPosition );
		// a surface seen edge-on carries no detail: it stays one smooth piece
		float nsZnv = abs( dot( normal, normalize( vViewPosition ) ) );
		float nsZv = smoothstep( ${f(F.viewFrom)}, ${f(F.viewTo)}, nsZnv );
		if ( ${on} && vNsHatch.w > 0.0 && nsZv > 0.0 && nsZp * ${f(minWarp / F.groupMm)} < ${f(F.fadeTo)} ) {
			// the two numbers' slopes ON THE SURFACE (per metre), from their screen derivatives and the surface's own
			vec3 nsZr1 = cross( nsZsy, normal ), nsZr2 = cross( normal, nsZsx );
			float nsZdet = dot( nsZsx, nsZr1 );
			float nsZid = sign( nsZdet ) / max( abs( nsZdet ), 1e-12 );
			vec3 nsZgs = ( nsZd.x * nsZr1 + nsZd.y * nsZr2 ) * nsZid, nsZga = ( nsZa.x * nsZr1 + nsZa.y * nsZr2 ) * nsZid;
			float nsZls = length( nsZgs ), nsZla = length( nsZga );
			// no fibres where the frame cannot give lengthwise lines: on an end cap (the surface faces along the muscle:
			// lines would meet in a star or run in rings) and where the lines would run across the muscle's length
			nsZv *= smoothstep( ${f(F.capFrom)}, ${f(F.capTo)}, nsZla * 0.001 ) * ( 1.0 - smoothstep( ${f(F.crossFrom)}, ${f(F.crossTo)}, abs( dot( nsZgs, nsZga ) ) / max( nsZls * nsZla, 1e-9 ) ) );
			// bundles of uneven width, gently wavy: the fibre number is stretched and squeezed (never turned back)
			float nsZq = nsZs, nsZw = 1.0;
			${W.map((w, i) => `{ float nsZph = ${phase(w, i)}; nsZq += ${f(w.share * Math.abs(w.acrossMm))} * sin( nsZph ); nsZw += ${f(w.share)} * cos( nsZph ); }`).join('\n\t\t\t')}
			nsZp *= nsZw;
			float nsZkA = ${fade(F.groupMm)};
			if ( nsZkA > 0.0 ) {
				float nsZkB = ${fade(F.bundleMm)}, nsZkC = ${fade(F.strandMm)};
				${level('nsZA', 'nsZkA', F.groupMm, F.groupRunMm, 3, '')}
				float nsZsh = 0.0, nsZpt = 0.0, nsZsl = 0.0;
				${add('nsZA', 'nsZkA', 0, F.groupMm)}
				if ( nsZkB > 0.0 ) {
					${level('nsZB', 'nsZkB', F.bundleMm, F.bundleRunMm, 17, ' + nsZA.x * 5.0')}
					${add('nsZB', 'nsZkB', 1, F.bundleMm)}
				}
				if ( nsZkC > 0.0 ) {
					${level('nsZC', 'nsZkC', F.strandMm, F.strandRunMm, 41, ' + nsZA.x * 9.0')}
					${add('nsZC', 'nsZkC', 2, F.strandMm)}
				}
				nsFlFib = clamp( 0.5 + nsZsh, 0.0, 1.0 );
				nsFlPart = nsZpt;
				nsFlK = nsZkA;
				// the bundles stand a little proud: a bump of the normal before the lights, so each bundle carries its own
				// streak of the wet highlight. The slope across the fibres is known in closed form (no screen derivative of a
				// height: those come in 2 x 2 pixel blocks). The tilt is LIMITED (maxSlope): where the screen derivatives of
				// the surface are unreliable (a triangle seen nearly edge-on) the normal can no longer be thrown over.
				vec3 nsZg = nsZgs * ( nsZsl * nsZw * 0.001 * smoothstep( ${f(F.bumpViewFrom)}, ${f(F.bumpViewTo)}, nsZnv ) );
				nsZg *= min( 1.0, ${f(F.maxSlope)} / max( length( nsZg ), 1e-6 ) );
				normal = normalize( normal - nsZg );
			}
		}
	}`;
}

/** GLSL placed right AFTER the lights are summed and before every silhouette term (the muscle look's crease, the
 * rim): the smooth normal is put back. */
export function fleshRestoreGlsl() {
  return 'normal = nsFlN0;';
}

/** GLSL placed AFTER the lights are summed (in place of the comic patch's bands): the painted tone curve, the warm
 * shadow, the fibre shade, the soft rim and the wet highlight. In scope: reflectedLight, diffuseColor, normal (the
 * smooth one again), vViewPosition, emissive and totalEmissiveRadiance (muscle), vNsTendon (when `tendon`), vNsObj
 * (bone: the position in source mm), the uniform nsCelRimDir (xy: the rim light's side in view space) and the names
 * of fleshFibreGlsl. */
export function fleshLightGlsl(kind = 'muscle', tendon = false, o = BODY_FLESH) {
  const muscle = kind === 'muscle';
  const R = o.ramp, M = o.muscle, W = o.white, F = o.fibre, S = o.wet, I = o.rim, B = o.bone, G = o.glowForm;
  return `{
		const vec3 nsLw = vec3( 0.2126, 0.7152, 0.0722 );
		float nsTd = ${tendon ? 'clamp( vNsTendon, 0.0, 1.0 )' : muscle ? '0.0' : '1.0'};
		${muscle ? `// a glowing muscle: how much it glows, and the glow's own hue (its brightest channel = 1)
		float nsEm = max( emissive.r, max( emissive.g, emissive.b ) );
		float nsGl = smoothstep( 0.02, 0.2, nsEm );
		vec3 nsHue = emissive - ${f(G.hueDeepen)} * min( emissive.r, min( emissive.g, emissive.b ) );
		nsHue = nsEm > 1e-4 ? nsHue / max( nsHue.r, max( nsHue.g, nsHue.b ) ) : vec3( 1.0 );` : 'float nsGl = 0.0;'}
		vec3 nsDif = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
		float nsAlb = max( dot( diffuseColor.rgb, nsLw ), 1e-4 );
		float nsL = dot( nsDif, nsLw ) / nsAlb;
		// one smooth curve from the deep shade to the light one (no bands, so nothing breaks up on an uneven surface)
		float nsT = smoothstep( ${f(R.lo)}, ${f(R.hi)}, nsL );
		float nsLv = mix( mix( ${f(M.deep)}, ${f(W.deep)}, nsTd ), mix( ${f(M.high)}, ${f(W.high)}, nsTd ), ${R.curve === 1 ? 'nsT' : `pow( max( nsT, 0.0 ), ${f(R.curve)} )`} );
		vec3 nsCol = nsL > 1e-3 ? nsDif * ( nsLv / nsL ) : diffuseColor.rgb * nsLv;
		// the shadow side is warm and saturated (light that went through the tissue), never grey; not on a glowing
		// muscle (its colour is its area's: a warm tint turned a green or yellow glow in shade to khaki)
		nsCol *= mix( mix( ${v3(M.shadowTint)}, ${v3(W.shadowTint)}, nsTd ), vec3( 1.0 ), max( nsT, nsGl ) );
		${muscle ? `// fibre bundles: each its own shade along the muscle, a darker warm parting between two of them
		float nsFam = mix( 1.0, ${f(F.tendonAmp)}, nsTd ) * mix( 1.0, ${f(F.glowKeep)}, nsGl );
		float nsFsh = ( 1.0 + ${f(2 * F.amp)} * ( nsFlFib - 0.5 ) * nsFam ) * ( 1.0 - ${f(F.partAmp)} * nsFlPart * nsFam );
		nsCol *= nsFsh;
		// a little more colour in the flesh (not on the white tendon part)
		nsCol = mix( vec3( dot( nsCol, nsLw ) ), nsCol, mix( ${f(M.chroma)}, 1.0, nsTd ) );
		// a glowing muscle keeps its form and its fibres: the glow follows the shading a little
		totalEmissiveRadiance *= mix( 1.0, mix( ${f(G.lo)}, ${f(G.hi)}, nsT ) * nsFsh, nsGl );` : `// bone: a faint large-scale mottling, warmer where it is darker (no dots); stronger, with a faint finer grain, on the
		// ends; a smooth, cool, pearly cartilage cap on a joint surface (nsBe: x cartilage, y end; ns-detail boneEndWeights)
		vec2 nsBe = clamp( vNsBoneEnd, 0.0, 1.0 );
		float nsBm = nsVNoise( vNsObj * ${f(1 / B.mottleMm)} ) * 0.65 + nsVNoise( vNsObj * ${f(2.7 / B.mottleMm)} + 7.3 ) * 0.35;
		float nsBg = nsVNoise( vNsObj * ${f(1 / B.endGrainMm)} + 3.1 );
		float nsBa = ${f(2 * B.mottle)} * mix( 1.0, ${f(B.endMottle)}, nsBe.y ) * mix( 1.0, ${f(B.cartMottle)}, nsBe.x );
		nsCol *= ( 1.0 + nsBa * ( nsBm - 0.5 ) + ${f(2 * B.endGrain)} * nsBe.y * ( 1.0 - nsBe.x ) * ( nsBg - 0.5 ) ) * mix( mix( ${v3(B.warm)}, vec3( 1.0 ), nsBm ), ${v3(B.cart)}, nsBe.x );`}
		vec3 nsN = normalize( normal ), nsV = normalize( vViewPosition );
		float nsF = max( 1.0 - abs( dot( nsN, nsV ) ), 0.0 );
		// a thin cool light on the silhouette on the rim light's side, in the tissue's own colour (never a grey veil)
		float nsRimSide = smoothstep( -0.3, 0.6, dot( normalize( nsN.xy + vec2( 1e-5 ) ), nsCelRimDir.xy ) );
		float nsRim = pow( nsF, ${f(I.power)} );
		nsCol += mix( diffuseColor.rgb, vec3( 1.0 ), ${f(I.white)} ) * ${v3(I.colour)} * ( ${f(I.gain)} * nsRim * nsRimSide${I.film > 0 ? ` + ${f(I.film)} * nsRim` : ''} );
		// the wet highlight: the lights' own highlight on the bumped surface (a streak on every bundle), compressed so
		// that it cannot blow out, and small glints at its peaks; a parting between bundles does not shine
		vec3 nsSp = reflectedLight.directSpecular;
		float nsS = dot( nsSp, nsLw );
		float nsSmax = mix( ${f(S.max)}, ${f(S.maxWhite)}, nsTd );
		${muscle ? '' : `nsSmax = mix( nsSmax, ${f(B.cartWet)}, nsBe.x );`}
		float nsWet = ( nsSmax * ( 1.0 - exp( - nsS * ${f(S.gain)} / nsSmax ) ) + ${f(S.glint)} * smoothstep( ${f(S.glintLo)}, ${f(S.glintHi)}, nsS ) * mix( 1.0, 0.5, nsTd ) )${muscle ? ` * ( 1.0 - ${f(1 - S.partKeep)} * nsFlPart ) * mix( 1.0, ${f(S.glowKeep)}, nsGl )` : ''};
		vec3 nsSpec = ( nsS > 1e-5 ? nsSp / nsS : vec3( 1.0 ) ) * nsWet;
		${muscle ? `// a glowing muscle stays in its area's colour ALL OVER: its highlight takes the glow's hue, and where the sum
		// would pass the brightest a channel can show, the whole colour is scaled down (a clipped channel shifts the
		// hue: green went yellow and white under the highlight)
		nsSpec = mix( nsSpec, nsHue * nsWet, nsGl );
		nsCol = mix( nsCol, nsHue * max( nsCol.r, max( nsCol.g, nsCol.b ) ), ${f(G.tint)} * nsGl );
		totalEmissiveRadiance = mix( totalEmissiveRadiance, nsHue * max( totalEmissiveRadiance.r, max( totalEmissiveRadiance.g, totalEmissiveRadiance.b ) ), ${f(G.glowTint)} * nsGl );
		vec3 nsSum = nsCol + nsSpec + totalEmissiveRadiance;
		float nsKeep = mix( 1.0, min( 1.0, ${f(G.max)} / max( max( nsSum.r, max( nsSum.g, nsSum.b ) ), 1e-4 ) ), nsGl );
		nsCol *= nsKeep; nsSpec *= nsKeep; totalEmissiveRadiance *= nsKeep;` : ''}
		reflectedLight.directDiffuse = nsCol;
		reflectedLight.indirectDiffuse = vec3( 0.0 );
		reflectedLight.directSpecular = nsSpec;
	}`;
}

/** DEPTH PREFERENCE round rectus abdominis (18 November; the owner: "Some rough patchy small-poxy muscles need work
 * such as pelvis / hip flexors"; the checker: ragged saw-tooth borders round the lower rectus abdominis, islands of
 * another muscle at its lower corners, rows of specks along its edges).
 * The cause is not shading. The sheets that wrap rectus abdominis (the external oblique's sheath, the laminae of the
 * internal oblique and transversus abdominis) are drawn OPENED over it: their triangles in front of the muscle are
 * left out, triangle by triangle, so the opening has a toothed edge, and bits of a sheet that lie up to 13 mm in
 * front of the muscle still show as teeth, specks and islands over it.
 * The fix moves NO vertex and changes no place on the screen. The part of each sheet that lies over the muscle and
 * just beside it is drawn, in the depth buffer only, `pushM` further from the eye along the line of sight, in the main
 * picture and in the outline's ID pass alike (both read the per-vertex attribute nsLift, metres, negative = away). So
 * wherever the muscle lies behind such a bit of sheet it now wins: its own smooth outline replaces the toothed edge,
 * and the specks and islands go under it.
 *  - WHERE, and why it is worked out the way it is: the push is one function of the place on the FRONT of the body
 *    (across, source x, and up, source z; the front-to-back coordinate is not used), the same for every sheet, so
 *    the sheets keep their order among themselves; and it is built from straight ramps, which are exact at every
 *    pixel of a triangle for every mesh, however differently the sheets are cut into triangles. Across: full over
 *    the muscle (the pair's half-width at that height, from the muscle's own vertices) and `fullBesideMm` beside it,
 *    gone `noneBesideMm` beside it. A DEEPER sheet keeps its full push to beyond where the sheet in front of it has
 *    lost much of its own (external oblique 2 -> 14 mm, internal oblique 8 -> 22 mm, transversus 16 -> 30 mm): at
 *    every place a deeper sheet is pushed at least as far as the one in front, so the bend of a ramp inside one
 *    triangle can never bring a deeper sheet through (with one ramp for all three, a seam of blotches ran beside the
 *    muscle where the ramp ended). The wider zones of the deeper sheets lie under the whole outer sheet.
 *    Up: also none below `noneToShare` and full only from `fullFromShare`: at the pubic end the deeper sheets are
 *    the outer surface beside the muscle and the hip muscles lie close behind them (pushed there, a hip muscle came
 *    through them with a toothed edge). Up: full from the lower (pubic) end to `fullToShare` of the muscle's height, gone
 *    at `noneFromShare`: its upper end runs up under the chest muscle, where the sheet is whole.
 *    (First try: the 3D distance of each sheet vertex to the muscle, through a smooth step. Each sheet then had its
 *    own push at one place and the deeper sheets came through the outer one in blotches beside the muscle.)
 *  - Why the sheets go back and the muscle does not come forward: anything in FRONT of the belly (a hand moved over
 *    it) must stay in front. Pulling the muscle forward by enough to win at a grazing angle (from the eyes the belly
 *    is seen at about 70 degrees, where a 13 mm gap is 40 mm along the line of sight) would have put it in front of
 *    a hand lying on the belly.
 *  - Tried and rejected: adding P22 x metres to clip z (wrong by a factor of distance / (2 x near): 15 mm acted
 *    like a third of a metre and pieces of the muscle's upper end showed through the chest), and a true 15 mm toward
 *    the eye (too little at the grazing angle the belly is seen at).
 * muscles: the element ids of the muscle (both sides count as one); sheets: element id -> its ramp beside the muscle. */
export const BODY_DEPTH_PREFERENCE = freeze({
  pushM: 0.028, acrossAxis: 0, upAxis: 2, noneToShare: 0.06, fullFromShare: 0.16, fullToShare: 0.62, noneFromShare: 0.8, bins: 16,
  muscles: freeze(['zm-rectus-abdominis-r', 'zm-rectus-abdominis-l']),
  sheets: freeze({
    FJ1452: freeze({ fullBesideMm: -4, noneBesideMm: 5 }), FJ1452M: freeze({ fullBesideMm: -4, noneBesideMm: 5 }),
    'zm-internal-oblique-r': freeze({ fullBesideMm: 3, noneBesideMm: 14 }), 'zm-internal-oblique-l': freeze({ fullBesideMm: 3, noneBesideMm: 14 }),
    'zm-transversus-abdominis-r': freeze({ fullBesideMm: 10, noneBesideMm: 22 }), 'zm-transversus-abdominis-l': freeze({ fullBesideMm: 10, noneBesideMm: 22 })
  })
});
/** The muscle's FOOTPRINT on the front of the body (pure): { mid (across, mm), lo, hi (up, mm), half: Float64Array(bins)
 * = its half-width about `mid` in each of `bins` slices of its height (empty slices take their neighbours') } from
 * the rest positions `muscles` (arrays, source mm); null when there is none. */
export function depthPreferenceFootprint(muscles, o = BODY_DEPTH_PREFERENCE) {
  const ms = (Array.isArray(muscles) ? muscles : []).filter(m => m && m.length >= 3);
  let lo = Infinity, hi = -Infinity, sx = 0, n = 0;
  for (const m of ms) for (let i = 0; i + 2 < m.length; i += 3) { const z = m[i + o.upAxis]; if (z < lo) lo = z; if (z > hi) hi = z; sx += m[i + o.acrossAxis]; n++; }
  if (!n || !(hi - lo > 1e-6)) return null;
  const mid = sx / n, B = o.bins, half = new Float64Array(B).fill(-1);
  for (const m of ms) for (let i = 0; i + 2 < m.length; i += 3) {
    const k = Math.min(B - 1, Math.floor((m[i + o.upAxis] - lo) / (hi - lo) * B)), d = Math.abs(m[i + o.acrossAxis] - mid);
    if (d > half[k]) half[k] = d;
  }
  for (let k = 0; k < B; k++) if (half[k] < 0) { let j = 1; while (j < B && !((k - j >= 0 && half[k - j] >= 0) || (k + j < B && half[k + j] >= 0))) j++; half[k] = k - j >= 0 && half[k - j] >= 0 ? half[k - j] : half[Math.min(B - 1, k + j)]; }
  return { mid, lo, hi, half };
}
/** The per-vertex depth preference (metres along the line of sight; negative = away from the eye) of one sheet with
 * rest positions `sheet` (source mm) round the muscle with the footprint `fp` (depthPreferenceFootprint) and the
 * sheet's own ramp beside the muscle ({ fullBesideMm, noneBesideMm }), pure. null when nothing of the sheet lies over
 * or beside the muscle. */
export function depthPreferenceAttr(sheet, fp, ramp, o = BODY_DEPTH_PREFERENCE) {
  const n = sheet ? Math.floor(sheet.length / 3) : 0;
  if (n < 1 || !fp || !ramp || !(ramp.noneBesideMm > ramp.fullBesideMm)) return null;
  const B = fp.half.length, out = new Float32Array(n);
  let any = false;
  for (let v = 0; v < n; v++) {
    const h = (sheet[3 * v + o.upAxis] - fp.lo) / (fp.hi - fp.lo);
    const wh = Math.min(1, Math.max(0, Math.min((o.noneFromShare - h) / (o.noneFromShare - o.fullToShare), (h - o.noneToShare) / (o.fullFromShare - o.noneToShare))));
    if (!(wh > 0)) continue;
    // the muscle's half-width at this height (straight between the slices' middles)
    const f = Math.min(B - 1, Math.max(0, h * B - 0.5)), k0 = Math.floor(f), k1 = Math.min(B - 1, k0 + 1);
    const hw = fp.half[k0] + (fp.half[k1] - fp.half[k0]) * (f - k0);
    const beside = Math.abs(sheet[3 * v + o.acrossAxis] - fp.mid) - hw;
    const wd = Math.min(1, Math.max(0, (ramp.noneBesideMm - beside) / (ramp.noneBesideMm - ramp.fullBesideMm)));
    if (!(wd > 0)) continue;
    out[v] = -o.pushM * wd * wh;
    any = true;
  }
  return any ? out : null;
}
/** GLSL of the depth preference: FLESH_DEPTH_LIFT_PARS_GLSL at the top of the vertex shader, FLESH_DEPTH_LIFT_GLSL
 * right after the vertex is projected (gl_Position known). Only a material that defines NS_DEPTH_LIFT reads the
 * attribute (its meshes carry it). Depth only: x, y and w are untouched. */
export const FLESH_DEPTH_LIFT_PARS_GLSL = `#ifdef NS_DEPTH_LIFT
attribute float nsLift;
#endif
`;
export const FLESH_DEPTH_LIFT_GLSL = `#ifdef NS_DEPTH_LIFT
	// the depth this point would have nsLift metres nearer the eye along its own line of sight (perspective: w is the
	// distance in front of the eye, depth = P32 / distance - P22)
	if ( nsLift != 0.0 && projectionMatrix[ 3 ][ 3 ] == 0.0 ) gl_Position.z = ( projectionMatrix[ 3 ][ 2 ] / max( gl_Position.w - nsLift, 1e-4 ) - projectionMatrix[ 2 ][ 2 ] ) * gl_Position.w;
#endif`;
