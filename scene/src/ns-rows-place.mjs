/** NeuroSurge: where the limb buttons and the hint stand in the outside view (25 November 2026, FIX76; a hunt of Body
 * update 74, finding 9).
 *
 * In the outside view (key E) the camera stands behind and above you, so your own head and trunk are at the bottom
 * middle of the picture: where the limb buttons (1 to 4) and the hint under them stand. At 800 by 600 the two rows
 * covered 61 % of your head and trunk; only the limbs showed beside them. The camera stays where the player puts it
 * (the owner: it never moves by itself, no zoom), so the rows move: while the view is outside and a strip of the
 * bottom of the picture beside your head and trunk is free of them and of the cards, both rows stand in that strip,
 * the left one first (the right corner is the information card's). Where no strip is wide enough they stay in the
 * middle, as before. The eye view is not changed.
 *
 * Pure maths: boxes are CSS px, { x0, y0, x1, y1 }. The app (ns-app) gives the head's and trunk's box from the balls
 * that fill them (TRUNK_KEEP_OUT) as the camera draws them, and the cards' boxes. Display rules; nothing is measured.
 */

/**
 *   bandPx     the strip at the bottom the two rows stand in (their own heights, the gap between them and the page's
 *              foot line under them): a card counts as in the way only where it reaches into it
 *   gapPx      the least distance kept from your head and trunk and from a card; edgePx: from the window's edge
 *   barPx      the buttons' row at its usual width (one line a button); tightPx: with two lines a button (the form
 *              narrow windows have, quiet.css .ns-limbs-tight). A strip narrower than tightPx takes no rows; one
 *              narrower than barPx takes the tight form.
 *   hintMaxPx  the hint's greatest width in the strip (it takes more lines where the strip is narrower)
 *   bottomPx   the hint's distance from the bottom edge (its usual one; the foot line's rule may raise it)
 *   everyMs    the strip is worked out again at most this often (the app; the rows need not follow every frame)
 */
export const ROWS_OUTSIDE = Object.freeze({ on: true, bandPx: 112, gapPx: 12, edgePx: 12, barPx: 412, tightPx: 276, hintMaxPx: 420, bottomPx: 14, everyMs: 200 });

/** The box round balls as drawn: balls [{ x, y, r }] (their middles and radii in px; one with no finite number is left
 * out), clipped to the window W by H. null when nothing of them is in the window. Pure. */
export function ballsBox(balls, W, H) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const b of Array.isArray(balls) ? balls : []) {
    if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y) || !(b.r >= 0)) continue;
    x0 = Math.min(x0, b.x - b.r); y0 = Math.min(y0, b.y - b.r); x1 = Math.max(x1, b.x + b.r); y1 = Math.max(y1, b.y + b.r);
  }
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1);
  return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
}

/** ROWS_OUTSIDE's rule. W, H: the window; body: your head's and trunk's box (null: not in the picture); taken: the
 * cards' boxes. Returns null (the rows keep their usual place: no body in the strip at the bottom, or no room beside
 * it) or { side: 'left' | 'right', x0, x1 (the strip's ends), tight (the buttons take two lines each), bar: { left |
 * right } (px from that edge of the window), hint: { left | right, bottom, maxWidth, align } (the shell's placeToast
 * spot) }. Pure. */
export function rowsBesideBody({ W, H, body, taken = [] } = {}, o = ROWS_OUTSIDE) {
  if (!o || o.on !== true || !(W > 0) || !(H > 0) || !body) return null;
  const top = H - o.bandPx;
  if (!(body.y1 > top) || !(body.x1 > body.x0)) return null; // (your head and trunk are not in the strip: nothing to keep off)
  const inBand = t => t && t.y1 > top && t.y0 < H && t.x1 > t.x0;
  let l0 = o.edgePx, r1 = W - o.edgePx;
  for (const t of taken) {
    if (!inBand(t)) continue;
    const mid = (t.x0 + t.x1) / 2;
    if (mid < (body.x0 + body.x1) / 2) l0 = Math.max(l0, Math.min(t.x1 + o.gapPx, body.x0)); else r1 = Math.min(r1, Math.max(t.x0 - o.gapPx, body.x1));
  }
  const l1 = body.x0 - o.gapPx, r0 = body.x1 + o.gapPx;
  const strip = (side, x0, x1) => {
    const w = x1 - x0;
    if (!(w >= o.tightPx)) return null;
    const hint = { bottom: o.bottomPx, maxWidth: Math.round(Math.min(w, o.hintMaxPx)), align: side };
    if (side === 'left') { hint.left = Math.round(x0); return { side, x0, x1, tight: w < o.barPx, bar: { left: Math.round(x0) }, hint }; }
    hint.right = Math.round(W - x1);
    return { side, x0, x1, tight: w < o.barPx, bar: { right: Math.round(W - x1) }, hint };
  };
  return strip('left', l0, l1) || strip('right', r0, r1);
}
