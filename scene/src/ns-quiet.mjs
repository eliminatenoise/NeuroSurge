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
    return { kind: 'hold', title, hint, rows: [], key: `hold|${title}|${hint}` };
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
  const right = x > width * 0.72 || (side === 'left' && x > width * 0.3) || (sized && x + 22 + tipW > width && x - 22 - tipW >= 0);
  const low = y > height * 0.7 || (sized && y + 18 + tipH > height && y - 18 - tipH >= 0);
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
  if (!hitsHard(b0)) return { right, low }; // only the hand is in the way and no side is clear of it: the usual one
  for (const [r, l] of others) { const b = box(r, l); if (!hitsHard(b) && inside(b)) return { right: r, low: l }; }
  const on = hard.find(a => hits(b0, a));
  for (const dy of [on.y1 + TIP_SLIDE_GAP - b0.y0, on.y0 - TIP_SLIDE_GAP - b0.y1]) {
    const b = { x0: b0.x0, x1: b0.x1, y0: b0.y0 + dy, y1: b0.y1 + dy };
    if (Math.abs(dy) <= TIP_SLIDE_MAX && inside(b) && !hitsHard(b)) return { right, low, dy: Math.round(dy) };
  }
  return { right, low };
}
/** The gap, in CSS px, between a slid tip and the card it was slid off, and the farthest a tip is slid (tipSides). */
export const TIP_SLIDE_GAP = 6, TIP_SLIDE_MAX = 64;

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
  // 22 November 2026 (LOOK2 second pass; a check's profile: reading the tip's offsetWidth / offsetHeight on every frame
  // while it avoids your hand forced a style and layout pass each frame, about 0.8 ms): the tip's size is measured once
  // per content (tipKey) and per window size, and kept
  let tipSize = null;
  // 24 November 2026 (section 207): the tutorial card's box in the layer's own CSS px, for the tip to keep off it
  let promptRect = null, promptRectKey = '';
  function promptBox(width, height) {
    const k = prompt.hidden ? '' : `${promptText}|${countText}|${skipText}|${Math.round(width)}x${Math.round(height)}`;
    if (k === promptRectKey) return promptRect;
    promptRectKey = k; promptRect = null;
    if (k === '' || typeof prompt.getBoundingClientRect !== 'function' || typeof layer.getBoundingClientRect !== 'function') return null;
    try {
      const r = prompt.getBoundingClientRect(), o = layer.getBoundingClientRect();
      if (r && o && r.width > 0 && r.height > 0) promptRect = { x0: r.left - o.left, y0: r.top - o.top, x1: r.right - o.left, y1: r.bottom - o.top };
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
      const { right, low, dy = 0 } = tipSides({ x, y, width, height, side, tipW, tipH, avoid, card: hard });
      const pk = `${Math.round(x)}|${Math.round(y)}|${right ? 1 : 0}${low ? 1 : 0}|${dy}`; // (dy follows the card's box: a card that grows moves the tip)
      if (pk !== placeKey) {
        placeKey = pk;
        tip.style.left = `${Math.round(x)}px`;
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
  function hideTip() { tipKey = null; placeKey = ''; tipSize = null; tip.hidden = true; }
  return { update, hideTip, dispose() { try { layer.remove(); } catch { /* gone */ } } };
}
