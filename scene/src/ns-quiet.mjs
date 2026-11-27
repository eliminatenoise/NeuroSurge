/** NeuroSurge quiet screen (user notes of 17 November 2026: "Way too much text now. The amount of text is completely
 * overwhelming"; "if you highlight any part of the brain, you see what it does, its function essentially, and the
 * brain turns into a bunch of buttons ... a control panel").
 *
 * The game now starts with the information cards off (R brings them back). What stays on screen is this small layer:
 *  - the TIP by the crosshair: the name of the motor area under it and its numbered movements (the number keys do
 *    them, a click does the marked one), or the name of the muscle or bone under it. While holding something,
 *    it names what Space holds and how to release it.
 *  - one short PROMPT at the top: the next thing to try, a few words.
 * Both are plain DOM text, written only when their words change. The words name game controls and atlas parts; the
 * signals in this game are simulated and unitless.
 */

/** The longest movement list the tip shows (the number keys 1 to 9). */
export const TIP_MOVES_MAX = 9;

const str = v => (typeof v === 'string' ? v : '');

/** A movement's words without the part it belongs to, where the area's title already says it (pure):
 * "Bend left elbow" under "Left elbow" -> "Bend"; "Turn left palm down" stays, the title is "Left forearm turn". */
export function tipMoveWords(label, title) {
  const l = str(label).trim(), t = str(title).trim().toLowerCase();
  if (!l || !t) return l;
  const lower = l.toLowerCase();
  const at = lower.indexOf(t);
  if (at <= 0) return l;
  const out = (l.slice(0, at) + l.slice(at + t.length)).replace(/\s+/g, ' ').trim();
  return out.length >= 3 ? out : l;
}

/** 18 November (MAP: "pair opposite movements visually (bend / straighten) instead of listing them as unrelated
 * rows"): whether two actions of one area are OPPOSITES (pure): both move the same first joint to different ends (the
 * body map's absolute end angles, e.g. elbow flex 145 / 0), or, for the game arm's actions (no joints of their own),
 * their arm action ids are a known pair (flexion / extension of one part, pronation / supination, ...). */
const ARM_PAIRS = [['flexion', 'extension'], ['pronation', 'supination'], ['opposition', 'reposition'], ['radial_deviation', 'ulnar_deviation'],
  ['spread_fingers', 'fingers_together'], ['grasp_close', 'open_hand']];
export function oppositeActions(a, b) {
  if (!a || !b || a === b) return false;
  const ja = a.joints && typeof a.joints === 'object' ? Object.keys(a.joints) : [], jb = b.joints && typeof b.joints === 'object' ? Object.keys(b.joints) : [];
  if (ja.length && jb.length) return ja[0] === jb[0] && Number.isFinite(a.joints[ja[0]]) && Number.isFinite(b.joints[jb[0]]) && a.joints[ja[0]] !== b.joints[jb[0]];
  const x = str(a.armActionId), y = str(b.armActionId);
  if (!x || !y) return false;
  for (const [p, q] of ARM_PAIRS) {
    for (const [u, v] of [[x, y], [y, x]]) {
      if (u === p && v === q) return true;
      if (u.endsWith(`_${p}`) && v.endsWith(`_${q}`) && u.slice(0, -p.length) === v.slice(0, -q.length)) return true;
    }
  }
  return false;
}

/** The tip's rows in GROUPS (pure): each movement row on its own, or with its opposite as one pair [a, b] (the first
 * row's opposite among the rows not yet grouped; at most two per group, in the card's order). rows: tip rows ({ n, id,
 * ... }); actionOf(id): the action record. */
export function pairTipRows(rows, actionOf) {
  const list = Array.isArray(rows) ? rows : [], used = new Set(), out = [];
  for (let i = 0; i < list.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const a = typeof actionOf === 'function' ? actionOf(list[i].id) : null;
    let j = -1;
    if (a) for (let k = i + 1; k < list.length; k++) { if (!used.has(k) && oppositeActions(a, actionOf(list[k].id))) { j = k; break; } }
    if (j >= 0) { used.add(j); out.push([list[i], list[j]]); } else out.push([list[i]]);
  }
  return out;
}

/**
 * What the tip says (pure). area: a body-map region ({ id, plainLabel, label, shortLabel, actions }) or null;
 * moves: its numbered movements (ns-app infoMoves: [{ n, id, label, atEnd, back }]); actionId: the movement a click
 * would do now; pick: the body part under the crosshair ({ name, kind }) or null; arrow: an arrow tip's words.
 * Returns { key, title, rows: [{ n, words, now, dim }], kind } or null when there is nothing to name.
 *
 * 19 November 2026 (EASE, the owner: "It's not clear what the numbers do"; "Things should be chunked together and
 * those chunks should be spaced away from each other"). The tip is drawn as CHUNKS: the name; then the choices, each a
 * key cap with its movement beside it (a key you can press), opposite movements together as one small group and the
 * groups apart; the row a click does is filled and carries a pointer mark. `teach` (ns-text TIP.teach: "Click, or
 * press a number") is one line under the choices for a newcomer.
 */
export function quietTipModel({ area = null, moves = null, actionId = null, pick = null, arrow = '', color = '', hint = '', teach = '', held = null } = {}) {
  if (held?.title) {
    const { title, hint } = held;
    // (hunt of update 74, finding 8, a second review: `teach` on a hold's tip is what a click at the resting pointer
    // presses, at a hold's start, ns-app carryPointerTip; drawn with the pointer sign, between the title and the hint)
    const out = { kind: 'hold', title, hint, rows: [], key: `hold|${title}|${hint}` };
    if (str(teach)) { out.teach = teach; out.key += `|t|${teach}`; }
    return out;
  }
  if (area && typeof area === 'object') {
    const title = str(area.plainLabel) || str(area.shortLabel) || str(area.label) || str(area.id);
    const list = (Array.isArray(moves) ? moves : []).slice(0, TIP_MOVES_MAX);
    const rows = list.map(m => ({
      n: m.n, words: tipMoveWords(m.label, title), now: m.id === actionId, dim: m.atEnd === true
    }));
    // 18 November (MAP): opposite movements share one line (groups of row indices); the title wears the area's colour.
    const acts = Array.isArray(area.actions) ? area.actions : [];
    const byId = id => acts.find(a => a && (a.id === id || a.armActionId === id)) || null;
    const groups = pairTipRows(list.map((m, i) => ({ id: m.id, i })), byId).map(g => g.map(r => r.i));
    const out = { kind: 'area', title, rows, groups, key: `a|${str(area.id)}|${rows.map(r => `${r.n}${r.now ? '*' : ''}${r.dim ? '-' : ''}`).join('')}|${groups.map(g => g.join('+')).join(',')}|${str(color)}` };
    if (str(color)) out.color = color;
    if (hint) { out.hint = hint; out.key += `|${hint}`; }
    // 19 November (EASE: "It's not clear what the numbers do"): one short line under the choices, the first times only
    // (the caller stops passing it once the player has pressed a few areas), and only when there is something to choose.
    if (str(teach) && rows.length) { out.teach = teach; out.key += '|t'; }
    return out;
  }
  if (str(arrow)) return { kind: 'arrow', title: arrow, rows: [], key: `r|${arrow}` };
  if (pick && str(pick.name)) {
    const out = { kind: str(pick.kind) || 'part', title: pick.name.charAt(0).toUpperCase() + pick.name.slice(1), rows: [], key: `p|${pick.name}|${str(pick.kind)}${str(color) ? `|${color}` : ''}` };
    if (str(color)) out.color = color; // 18 November (MAP): the colour of the area that moves this muscle
    return out;
  }
  return null;
}

/** How many presses of a motor area (a click, a number key, a tap on a muscle) the tip's newcomer line lasts. */
export const TIP_TEACH_PRESSES = 3;
/** Whether the tip still shows its newcomer line (pure). presses: how many times the player has pressed a motor area
 * so far (ns-app counts and stores them). After a few the player has seen what a click and a number do. */
export function tipTeachNow(presses) {
  return !(Number.isFinite(presses) && presses >= TIP_TEACH_PRESSES);
}

/** The prompt's words for a guide view (ns-guide guideView) and the short lines (ns-text GUIDE.short), or '' (pure). */
export function quietPromptText(guide, short) {
  if (!guide || guide.visible !== true || !short || typeof short !== 'object') return '';
  if (guide.finished) return str(short.finished);
  const partial = guide.text && short.byText && typeof short.byText === 'object' ? str(short.byText[guide.text]) : '';
  const words = partial || str(short[guide.goalId]);
  if (!words) return '';
  return guide.nice ? `${str(short.nice)} ${words}`.trim() : words;
}

/** The step count beside the prompt, "2/8", for a guide view; '' when nothing shows or all is done (pure). */
export function quietPromptCount(guide) {
  if (!guide || guide.visible !== true || guide.finished || !Number.isFinite(guide.step) || !Number.isFinite(guide.total) || guide.total < 1) return '';
  return `${guide.step}/${guide.total}`;
}

/**
 * The layer's DOM. doc: the document; root: the element it is added to (over the canvas; takes no pointer events).
 * update({ tip, prompt, x, y, width, height, show }) writes the words that changed and places the tip beside the point
 * (x, y) in CSS pixels (the crosshair, or the free pointer), kept inside the view.
 */
/**
 * 22 November 2026 (SEEMOVE, section 189; an independent check: the tip beside the crosshair covered the palm and thumb
 * of your own left hand at the hand's areas). Which side of the point the tip opens to: `right` (the tip to the LEFT
 * of the point, as before: near the right edge, or on the left half of the picture for an area of the brain's right
 * half) and `low` (above the point, near the bottom edge). With `avoid` (a box in CSS px: your own left hand) and the
 * tip's size, a placement whose box would cover it is changed for the next of: the other height, the other side, both,
 * the first that stays clear of the box and inside the picture; when none does, the usual one. Offsets as drawn (22 px
 * across, 18 px down). Pure.
 */
export function tipSides({ x = 0, y = 0, width = 0, height = 0, side = null, tipW = 0, tipH = 0, avoid = null, card = null } = {}) {
  const sized = tipW > 0 && tipH > 0;
  // 25 November 2026 (section 209, hunt of update 73, finding 9): with the tip's size known, a tip that would run past
  // the right or bottom edge opens to the other side (at 800x600 the tips of the right half's in-between areas, with the
  // pointer at x 544 to 576, ran up to 22 px past the right edge: the 0.72 rule alone knows nothing of the tip's width).
  let right = x > width * 0.72 || (side === 'left' && x > width * 0.3) || (sized && x + 22 + tipW > width && x - 22 - tipW >= 0);
  let low = y > height * 0.7 || (sized && y + 18 + tipH > height && y - 18 - tipH >= 0);
  // 25 November 2026 (section 211): the same toward the left and the top. A tip that opens to the left of its point (an
  // area of the brain's right half, from 0.3 of the width on) ran up to 12 px past the left edge of an 800 px window
  // with the pointer at x 188 to 244; it opens to the right where it fits there and not to the left.
  if (sized && right && x - 22 - tipW < 0 && x + 22 + tipW <= width) right = false;
  if (sized && low && y - 18 - tipH < 0 && y + 18 + tipH <= height) low = false;
  const box = (r, l) => ({ x0: r ? x - 22 - tipW : x + 22, y0: l ? y - 18 - tipH : y + 18, x1: r ? x - 22 : x + 22 + tipW, y1: l ? y - 18 : y + 18 + tipH });
  // 24 November 2026 (FREE_AIM, DESIGN-DECISIONS section 207): `card` is a box drawn OVER the tip (the tutorial's card:
  // with the pointer as the aim the tip can open anywhere, and at 800x600 the tip of an area near the top left corner
  // lay partly under that card, 24 of 228 pointer places). A side clear of both boxes is taken first, as before for
  // the hand alone; else a side clear of the card; else the usual box is slid down, or up, just past the card (`dy`, CSS
  // px, at most TIP_SLIDE_MAX; left out when 0). The hand's box never slides the tip: it can be large, and a tip far
  // from its point names nothing.
  // (25 November 2026, section 209, finding 5: `card` may be several boxes, the tutorial's card and the information
  // card; the slide is off the first one the usual box lies on.)
  const good = a => a && [a.x0, a.y0, a.x1, a.y1].every(Number.isFinite) && a.x1 > a.x0 && a.y1 > a.y0;
  const soft = good(avoid) ? avoid : null, hard = (Array.isArray(card) ? card : [card]).filter(good);
  const hits = (b, a) => Boolean(a) && b.x0 < a.x1 && b.x1 > a.x0 && b.y0 < a.y1 && b.y1 > a.y0;
  const hitsHard = b => hard.some(a => hits(b, a));
  const inside = b => b.x0 >= 0 && b.y0 >= 0 && b.x1 <= width && b.y1 <= height;
  const b0 = box(right, low);
  if ((!soft && !hard.length) || !sized || (!hits(b0, soft) && !hitsHard(b0))) return { right, low };
  const others = [[right, !low], [!right, low], [!right, !low]];
  for (const [r, l] of others) { const b = box(r, l); if (!hits(b, soft) && !hitsHard(b) && inside(b)) return { right: r, low: l }; }
  // (a review: the usual place on your own hand and no side clear of everything: a side clear of the hand where only
  // region labels lie, which give way to the tip (TIP_KEEP_OFF, weight 1); the hand does not. With the labels among the
  // boxes, W raised the hand onto the tip and it stayed there at 8 of 38 pointer places at 700x900 where update 80, with
  // no labels among them, put it above the pointer.)
  if (hits(b0, soft)) {
    const firm = hard.filter(a => !(Number.isFinite(a.weight) && a.weight <= 1));
    for (const [r, l] of others) { const b = box(r, l); if (!hits(b, soft) && !firm.some(a => hits(b, a)) && inside(b)) return { right: r, low: l }; }
  }
  if (!hitsHard(b0)) return { right, low }; // only the hand is in the way and no side is clear of it: the usual one
  for (const [r, l] of others) { const b = box(r, l); if (!hitsHard(b) && inside(b)) return { right: r, low: l }; }
  const on = hard.find(a => hits(b0, a));
  // (a review: a slide that lands on your own hand is kept only where no clear place off the hand is found, below: the
  // hand's box never slides the tip, but when the tip is slid for the other boxes it goes where the hand is not)
  let firstSlide = null;
  for (const dy of [on.y1 + TIP_SLIDE_GAP - b0.y0, on.y0 - TIP_SLIDE_GAP - b0.y1]) {
    const b = { x0: b0.x0, x1: b0.x1, y0: b0.y0 + dy, y1: b0.y1 + dy };
    if (Math.abs(dy) <= TIP_SLIDE_MAX && inside(b) && !hitsHard(b)) {
      if (!hits(b, soft)) return { right, low, dy: Math.round(dy) };
      if (!firstSlide) firstSlide = { right, low, dy: Math.round(dy) };
    }
  }
  // 25 November 2026 (hunt of update 78, finding 9): with the tutorial's rings, the aim mark and the region labels among
  // the boxes (TIP_KEEP_OFF), the middle of a narrow picture often has no clear corner and no clear slide off the first
  // box: on grids over the strip at 700x900, 720x800 and 800x600, 101, 95 and 75 of 379, 355 and 326 tips had no clear
  // corner, and 4, 15 and 10 of them no clear corner slid up or down past a box. Each corner, the usual one first, is
  // now also slid up or down and to the left or right to TIP_SLIDE_GAP past any box near it or off the window's edge, by
  // at most TIP_SLIDE_MAX each way and never onto the pointer's arrow, and the clear place moved least is taken; where
  // none is clear, the same with TIP_NEAR_GAP (on those grids every tip found a place but 1 at 720x800). Where none is
  // clear either, those places are also among the ones the least covering place is chosen from (below).
  // 25 November 2026 (section 211): no place is clear of every box: the place inside the picture that covers least. A
  // box may carry a `weight` (default 1): a card drawn over the tip hides it (4, given by the callers), a few words the
  // tip is drawn over only lose those words. Before, the usual place was kept whatever it lay under: with the words of
  // the tutorial's marks among the boxes, a tip at the top left of an 800x600 picture went back under the tutorial's
  // card. Ties keep the earlier candidate, the usual place first.
  const cost = b => { let c = 0; for (const a of hard) { const ox = Math.min(b.x1, a.x1) - Math.max(b.x0, a.x0), oy = Math.min(b.y1, a.y1) - Math.max(b.y0, a.y0); if (ox > 0 && oy > 0) c += ox * oy * (Number.isFinite(a.weight) && a.weight > 0 ? a.weight : 1); } return c; };
  const ptr = { x0: x - 4, y0: y - 4, x1: x + 16, y1: y + 24 };
  const reach = (c, a) => a.x0 < c.x1 + TIP_SLIDE_MAX && a.x1 > c.x0 - TIP_SLIDE_MAX && a.y0 < c.y1 + TIP_SLIDE_MAX && a.y1 > c.y0 - TIP_SLIDE_MAX;
  const place = (r, l, dx, dy) => { const o = { right: r, low: l }; if (Math.round(dy)) o.dy = Math.round(dy); if (Math.round(dx)) o.dx = Math.round(dx); return o; };
  // (A review: the hand's box never slides the tip, but a slide made for the other boxes kept off it only by chance: 2 of
  // 23 tips at 700x900 lay on the hand's box right after a pointer move. A clear place off the hand is taken first, at
  // either gap; one on the hand only where no clear place is off it: the slide above, `firstSlide`, else `onHand`, the
  // first gap's.)
  let moved = null, leastMove = Infinity, cheap = null, cheapCost = Infinity, cheapMove = Infinity, onHand = null;
  for (const gap of [TIP_SLIDE_GAP, TIP_NEAR_GAP]) {
    let onHandHere = null, leastOnHand = Infinity;
    for (const [r, l] of [[right, low], ...others]) {
      const c = box(r, l), dxs = [0, gap - c.x0, width - gap - c.x1], dys = [0, gap - c.y0, height - gap - c.y1]; // (and off the window's edges)
      for (const a of hard) if (reach(c, a)) { dxs.push(a.x1 + gap - c.x0, a.x0 - gap - c.x1); dys.push(a.y1 + gap - c.y0, a.y0 - gap - c.y1); }
      for (const dy of dys) for (const dx of dxs) {
        const m = Math.abs(dx) + Math.abs(dy);
        if (m === 0 || Math.abs(dx) > TIP_SLIDE_MAX || Math.abs(dy) > TIP_SLIDE_MAX || m >= leastMove) continue;
        const b = { x0: c.x0 + dx, x1: c.x1 + dx, y0: c.y0 + dy, y1: c.y1 + dy };
        if (!inside(b) || hits(b, ptr)) continue;
        if (!hitsHard(b)) {
          if (!hits(b, soft)) { leastMove = m; moved = place(r, l, dx, dy); } else if (m < leastOnHand) { leastOnHand = m; onHandHere = place(r, l, dx, dy); }
          continue;
        }
        if (moved || onHandHere || onHand) continue;
        const k = cost(b);
        if (k < cheapCost || (k === cheapCost && m < cheapMove)) { cheapCost = k; cheapMove = m; cheap = place(r, l, dx, dy); }
      }
    }
    if (moved) return moved;
    if (!onHand) onHand = onHandHere;
  }
  if (firstSlide) return firstSlide;
  if (onHand) return onHand;
  let best = { right, low }, least = cost(b0);
  for (const [r, l] of others) { const b = box(r, l); if (!inside(b)) continue; const c = cost(b); if (c < least) { least = c; best = { right: r, low: l }; } }
  for (const a of hard) {
    if (!hits(b0, a)) continue;
    for (const dy of [a.y1 + TIP_SLIDE_GAP - b0.y0, a.y0 - TIP_SLIDE_GAP - b0.y1]) {
      const b = { x0: b0.x0, x1: b0.x1, y0: b0.y0 + dy, y1: b0.y1 + dy };
      if (Math.abs(dy) > TIP_SLIDE_MAX || !inside(b)) continue;
      const c = cost(b);
      if (c < least) { least = c; best = { right, low, dy: Math.round(dy) }; }
    }
  }
  if (cheap && cheapCost < least) return cheap;
  return best;
}
/** The gap, in CSS px, between a slid tip and the card it was slid off, and the farthest a tip is slid (tipSides). */
export const TIP_SLIDE_GAP = 6, TIP_SLIDE_MAX = 64;
/**
 * 25 November 2026 (hunt of update 78, finding 9): whether a tip placed at `place` (tipSides' answer) for the point (x,
 * y) is still inside the picture and clear of every `card` box. The tip keeps such a place while its point, its words
 * and its size stay as they are (createQuietUi): the region labels give way to the tip, and a tip that went back toward
 * its usual place each time a label moved off followed the label, 3 moves in 0.4 s at 700x900. Pure.
 * (A review: and clear of `avoid`, your own left hand's box, when it is given. The caller gives it for a place that was
 * clear of the hand when chosen, so the tip moves off the hand when the hand comes onto it with the pointer still, as
 * before places were kept; with the arrow keys turning the look the hand moves under a still pointer more often.)
 */
export function tipStays({ x = 0, y = 0, width = 0, height = 0, tipW = 0, tipH = 0, card = null, place = null, avoid = null } = {}) {
  if (!place || !(tipW > 0 && tipH > 0)) return false;
  const x0 = (place.right ? x - 22 - tipW : x + 22) + (place.dx || 0), y0 = (place.low ? y - 18 - tipH : y + 18) + (place.dy || 0);
  const x1 = x0 + tipW, y1 = y0 + tipH;
  if (x0 < 0 || y0 < 0 || x1 > width || y1 > height) return false;
  for (const a of [...(Array.isArray(card) ? card : [card]), avoid]) {
    if (a && [a.x0, a.y0, a.x1, a.y1].every(Number.isFinite) && x0 < a.x1 && x1 > a.x0 && y0 < a.y1 && y1 > a.y0) return false;
  }
  return true;
}
/** The gap, in CSS px, between a tip slid past a box near it and that box where TIP_SLIDE_GAP leaves no room (tipSides;
 * hunt of update 78, finding 9: with 6 px the 55 px between "Right arm" and "Hip aim" at 700x900 held no 44 px tip). */
export const TIP_NEAR_GAP = 2;

/**
 * 25 November 2026 (hunt of update 78, finding 9): what the pointer's tip keeps off besides the tutorial's card, with
 * how much covering each costs where no place is clear (tipSides `weight`, per px2). `cards` are drawn over the tip (4:
 * the information card, the limb buttons, the map's card; the first of each). `marks` are drawn under it and stay where
 * they are (2: the tutorial's rings on an area, a limb or the brain, the aim mark of "Shoulder aim" / "Hip aim", and
 * their words). `labels` are drawn under it and give way to it where they can (1: the region labels, "Left arm", "Face and
 * neck", which ns-scene-three keeps off the tip's box).
 * Section 211 had only the marks' words: in tutorial step 1, 11 of 122 tips at 700x900 lay on the area's ring, at the
 * look step 11 of 122 on the aim mark, and at 720x800 with the map on 8 of 63 on "Left arm" and "Right arm", which stay,
 * faded, under the tip where the map's card leaves them no other room. The same happened in wide windows (800x600,
 * step 1: 21 of 102), where no check had looked at rings or labels.
 */
export const TIP_KEEP_OFF = Object.freeze({
  cards: Object.freeze(['.ns-infopanel', '.ns-limbs', '.ns-emap-card']),
  marks: '.ns-guide-cues .ns-guide-mark, .ns-guide-cues .ns-guide-mark-name',
  labels: '.ns-region-label',
  weight: Object.freeze({ card: 4, mark: 2, label: 1 })
});

/** The boxes of TIP_KEEP_OFF as drawn, in CSS px from `origin` (the canvas's client box): { x0, y0, x1, y1, weight }.
 * A hidden element, or one drawn at no size (a hidden cue or label), is left out. */
export function tipKeepOffBoxes(doc, origin) {
  const out = [];
  if (!doc || !origin) return out;
  const ox = Number(origin.left) || 0, oy = Number(origin.top) || 0;
  const add = (e, weight) => {
    if (!e || e.hidden || typeof e.getBoundingClientRect !== 'function') return;
    const r = e.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0) out.push({ x0: r.left - ox, y0: r.top - oy, x1: r.right - ox, y1: r.bottom - oy, weight });
  };
  const W = TIP_KEEP_OFF.weight;
  if (typeof doc.querySelector === 'function') for (const sel of TIP_KEEP_OFF.cards) add(doc.querySelector(sel), W.card);
  if (typeof doc.querySelectorAll === 'function') {
    for (const e of doc.querySelectorAll(TIP_KEEP_OFF.marks)) add(e, W.mark);
    for (const e of doc.querySelectorAll(TIP_KEEP_OFF.labels)) add(e, W.label);
  }
  return out;
}

export function createQuietUi({ doc, root }) {
  const el = (tag, cls, parent) => { const e = doc.createElement(tag); e.className = cls; parent.appendChild(e); return e; };
  const layer = el('div', 'ns-quiet', root);
  const tip = el('div', 'ns-tip', layer);
  tip.hidden = true;
  const tipTitle = el('div', 'ns-tip-title', tip);
  const tipRows = el('ol', 'ns-tip-rows', tip);
  const tipTeach = el('div', 'ns-tip-teach', tip);
  tipTeach.hidden = true;
  const tipHint = el('div', 'ns-tip-hint', tip);
  tipHint.hidden = true;
  // 19 November 2026 (the playable tutorial): the prompt is three chunks in one pill: the step count, the one line,
  // and how to skip. The count and the skip words are not read out with each step (aria-hidden): the line is.
  const prompt = el('div', 'ns-prompt', layer);
  prompt.hidden = true;
  const promptCount = el('span', 'ns-prompt-count', prompt);
  promptCount.setAttribute('aria-hidden', 'true');
  promptCount.hidden = true;
  const promptWords = el('span', 'ns-prompt-words', prompt);
  promptWords.setAttribute('role', 'status');
  const promptSkip = el('span', 'ns-prompt-skip', prompt);
  promptSkip.setAttribute('aria-hidden', 'true');
  promptSkip.hidden = true;
  let tipKey = null, promptText = '', countText = '', skipText = '', placeKey = '', shown = true;
  let kept = null, covering = false; // (hunt of update 78, finding 9: the tip's place and what it was chosen for, tipStays; and whether it lies on a box)
  // 22 November 2026 (LOOK2 second pass; a check's profile: reading the tip's offsetWidth / offsetHeight on every frame
  // while it avoids your hand forced a style and layout pass each frame, about 0.8 ms): the tip's size is measured once
  // per content (tipKey) and per window size, and kept
  let tipSize = null;
  // 24 November 2026 (section 207): the tutorial card's box in the layer's own CSS px, for the tip to keep off it
  let promptRect = null, promptRectKey = '';
  function promptBox(width, height) {
    // (25 November 2026, section 213: and the step's hand picture, ns-guide-cues GESTURES, which the card grows for)
    const k = prompt.hidden ? '' : `${promptText}|${countText}|${skipText}|${Math.round(width)}x${Math.round(height)}|${(prompt.dataset && prompt.dataset.nsGesture) || ''}`;
    if (k === promptRectKey) return promptRect;
    promptRectKey = k; promptRect = null;
    if (k === '' || typeof prompt.getBoundingClientRect !== 'function' || typeof layer.getBoundingClientRect !== 'function') return null;
    try {
      const r = prompt.getBoundingClientRect(), o = layer.getBoundingClientRect();
      if (r && o && r.width > 0 && r.height > 0) promptRect = { x0: r.left - o.left, y0: r.top - o.top, x1: r.right - o.left, y1: r.bottom - o.top, weight: 4 }; // (weight: tipSides, a card drawn over the tip)
    } catch { promptRect = null; }
    return promptRect;
  }
  function update({ tip: model = null, prompt: words = '', count = '', skip = '', x = 0, y = 0, width = 0, height = 0, show = true, side = null, avoid = null, cards = null } = {}) {
    if (show !== shown) { shown = show; layer.hidden = !show; }
    if (!show) return;
    const key = model ? model.key : null;
    if (key !== tipKey) {
      tipKey = key;
      tip.hidden = !model;
      if (model) {
        tip.setAttribute('data-kind', model.kind);
        tipTitle.textContent = model.title;
        // 18 November (MAP): the area's colour on the tip (a dot and a rim), the same as its key and its muscles
        if (str(model.color)) { tip.style.setProperty('--ns-tip-color', model.color); tip.setAttribute('data-colored', 'true'); }
        else { tip.style.removeProperty('--ns-tip-color'); tip.removeAttribute('data-colored'); }
        tipRows.textContent = '';
        const groups = Array.isArray(model.groups) && model.groups.length ? model.groups : model.rows.map((_, i) => [i]);
        for (const g of groups) {
          // one group: a movement alone, or two opposite movements one under the other (close together, one rule
          // down their left side); the groups stand apart
          const li = el('li', 'ns-tip-row' + (g.length > 1 ? ' ns-tip-pair' : ''), tipRows);
          g.forEach(i => {
            const r = model.rows[i];
            if (!r) return;
            const part = el('span', 'ns-tip-move' + (r.now ? ' ns-tip-now' : '') + (r.dim ? ' ns-tip-dim' : ''), li);
            el('kbd', 'ns-tip-key', part).textContent = String(r.n);
            el('span', 'ns-tip-words', part).textContent = r.words;
            // the row a click does: a drawn pointer, no word
            if (r.now) el('span', 'ns-tip-click', part).setAttribute('aria-hidden', 'true');
          });
        }
        tipRows.hidden = model.rows.length === 0;
        tipTeach.hidden = !model.teach;
        tipTeach.textContent = model.teach || '';
        tipHint.hidden = !model.hint;
        tipHint.textContent = model.hint || '';
      }
      placeKey = '';
    }
    if (model) {
      // Below and to the right of the point; flipped to the other side near the right or bottom edge.
      // 19 November 2026 (side 'left'): the tip of an area on the LEFT half of the picture opens to the LEFT of the point,
      // away from the mirror body, which stands between the strip's two halves (it used to cover it). (Since the brain
      // was turned half a turn the left half of the picture is the brain's right half; the caller says which.)
      // (22 November 2026: and off your own left hand's box, tipSides)
      let tipW = 0, tipH = 0;
      // (24 November 2026, section 207: the tip also keeps off the tutorial's card, whose box is measured once per its
      // words and window size)
      const card = promptBox(width, height);
      // (25 November 2026, section 209: the tip's size is always known, once per content and window size, so that a tip
      // near the right or bottom edge opens the other way; `cards`: more boxes drawn over the tip, the information card)
      {
        const sk = `${tipKey}|${Math.round(width)}x${Math.round(height)}`;
        if (!tipSize || tipSize.key !== sk) { const w0 = tip.offsetWidth, h0 = tip.offsetHeight; tipSize = { key: sk, w: Number.isFinite(w0) ? w0 : 0, h: Number.isFinite(h0) ? h0 : 0 }; }
        tipW = tipSize.w; tipH = tipSize.h;
      }
      const hard = [card, ...(Array.isArray(cards) ? cards : [])].filter(Boolean);
      const kx = Math.round(x), ky = Math.round(y);
      // (a review: and off your own hand's box, `avoid`, when the place was clear of it as chosen; a place chosen on it, where
      // no side was clear, stays there)
      const stays = Boolean(kept) && kept.x === kx && kept.y === ky && kept.key === tipKey && kept.w === tipW && kept.h === tipH && kept.width === width && kept.height === height &&
        tipStays({ x, y, width, height, tipW, tipH, card: hard, place: kept.place, avoid: kept.handClear ? avoid : null });
      if (!stays) {
        const place = tipSides({ x, y, width, height, side, tipW, tipH, avoid, card: hard });
        kept = { x: kx, y: ky, key: tipKey, w: tipW, h: tipH, width, height, place, handClear: tipStays({ x, y, width, height, tipW, tipH, place, avoid }) };
        covering = !tipStays({ x, y, width, height, tipW, tipH, card: hard, place: kept.place });
      } else covering = false;
      const { right, low, dy = 0, dx = 0 } = kept.place;
      const pk = `${Math.round(x)}|${Math.round(y)}|${right ? 1 : 0}${low ? 1 : 0}|${dy}|${dx}`; // (dy follows the card's box: a card that grows moves the tip)
      if (pk !== placeKey) {
        placeKey = pk;
        tip.style.left = `${Math.round(x + dx)}px`;
        tip.style.top = `${Math.round(y + dy)}px`;
        tip.style.transform = `translate(${right ? 'calc(-100% - 22px)' : '22px'}, ${low ? 'calc(-100% - 18px)' : '18px'})`;
      }
    }
    const w = str(words);
    if (w !== promptText) { promptText = w; promptWords.textContent = w; prompt.hidden = w === ''; }
    const c = w === '' ? '' : str(count), k = w === '' ? '' : str(skip);
    if (c !== countText) { countText = c; promptCount.textContent = c; promptCount.hidden = c === ''; }
    if (k !== skipText) { skipText = k; promptSkip.textContent = k; promptSkip.hidden = k === ''; }
  }
  /** The tip goes away until the next update (the game was left for the Esc page: no frame, so no update, comes while
   * it shows, and the tip of the moment stayed drawn under the page). */
  function hideTip() { tipKey = null; placeKey = ''; tipSize = null; kept = null; covering = false; tip.hidden = true; }
  /** (hunt of update 78, finding 9) Whether the tip as last placed lies on one of the boxes it keeps off: no place was
   * clear of them, or they were read before they moved (the caller then reads them again sooner). */
  const tipCovers = () => Boolean(kept) && covering && !tip.hidden;
  return { update, hideTip, tipCovers, dispose() { try { layer.remove(); } catch { /* gone */ } } };
}
