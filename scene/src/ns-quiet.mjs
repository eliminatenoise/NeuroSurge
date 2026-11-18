/** NeuroSurge quiet screen (user notes of 17 November 2026: "Way too much text now. The amount of text is completely
 * overwhelming"; "if you highlight any part of the brain, you see what it does, its function essentially, and the
 * brain turns into a bunch of buttons ... a control panel").
 *
 * The game now starts with the information cards off (R brings them back). What stays on screen is this small layer:
 *  - the TIP by the crosshair: the name of the motor area under it and its numbered movements (the number keys do
 *    them, a click does the marked one), or the name of the muscle or bone under it. Nothing else.
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
 */
export function quietTipModel({ area = null, moves = null, actionId = null, pick = null, arrow = '', color = '' } = {}) {
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

/** The prompt's words for a guide view (ns-guide guideView) and the short lines (ns-text GUIDE.short), or '' (pure). */
export function quietPromptText(guide, short) {
  if (!guide || guide.visible !== true || !short || typeof short !== 'object') return '';
  if (guide.finished) return str(short.finished);
  const partial = guide.text && short.byText && typeof short.byText === 'object' ? str(short.byText[guide.text]) : '';
  const words = partial || str(short[guide.goalId]);
  if (!words) return '';
  return guide.nice ? `${str(short.nice)} ${words}`.trim() : words;
}

/**
 * The layer's DOM. doc: the document; root: the element it is added to (over the canvas; takes no pointer events).
 * update({ tip, prompt, x, y, width, height, show }) writes the words that changed and places the tip beside the point
 * (x, y) in CSS pixels (the crosshair, or the free pointer), kept inside the view.
 */
export function createQuietUi({ doc, root }) {
  const el = (tag, cls, parent) => { const e = doc.createElement(tag); e.className = cls; parent.appendChild(e); return e; };
  const layer = el('div', 'ns-quiet', root);
  const tip = el('div', 'ns-tip', layer);
  tip.hidden = true;
  const tipTitle = el('div', 'ns-tip-title', tip);
  const tipRows = el('ol', 'ns-tip-rows', tip);
  const prompt = el('div', 'ns-prompt', layer);
  prompt.setAttribute('role', 'status');
  prompt.hidden = true;
  let tipKey = null, promptText = '', placeKey = '', shown = true;
  function update({ tip: model = null, prompt: words = '', x = 0, y = 0, width = 0, height = 0, show = true } = {}) {
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
          const li = el('li', 'ns-tip-row' + (g.length > 1 ? ' ns-tip-pair' : ''), tipRows);
          g.forEach((i, k) => {
            const r = model.rows[i];
            if (!r) return;
            // a pair: "[1] Bend <-> [2] Straighten" on one line (a drawn arrow, no word)
            if (k > 0) el('span', 'ns-tip-swap', li).setAttribute('aria-hidden', 'true');
            const part = el('span', 'ns-tip-move' + (r.now ? ' ns-tip-now' : '') + (r.dim ? ' ns-tip-dim' : ''), li);
            el('kbd', 'ns-tip-key', part).textContent = String(r.n);
            el('span', 'ns-tip-words', part).textContent = r.words;
          });
        }
        tipRows.hidden = model.rows.length === 0;
      }
      placeKey = '';
    }
    if (model) {
      // Below and to the right of the point; flipped to the other side near the right or bottom edge.
      const right = x > width * 0.72, low = y > height * 0.7;
      const pk = `${Math.round(x)}|${Math.round(y)}|${right ? 1 : 0}${low ? 1 : 0}`;
      if (pk !== placeKey) {
        placeKey = pk;
        tip.style.left = `${Math.round(x)}px`;
        tip.style.top = `${Math.round(y)}px`;
        tip.style.transform = `translate(${right ? 'calc(-100% - 22px)' : '22px'}, ${low ? 'calc(-100% - 18px)' : '18px'})`;
      }
    }
    const w = str(words);
    if (w !== promptText) { promptText = w; prompt.textContent = w; prompt.hidden = w === ''; }
  }
  return { update, dispose() { try { layer.remove(); } catch { /* gone */ } } };
}
