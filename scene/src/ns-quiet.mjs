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

/**
 * What the tip says (pure). area: a body-map region ({ id, plainLabel, label, shortLabel, actions }) or null;
 * moves: its numbered movements (ns-app infoMoves: [{ n, id, label, atEnd, back }]); actionId: the movement a click
 * would do now; pick: the body part under the crosshair ({ name, kind }) or null; arrow: an arrow tip's words.
 * Returns { key, title, rows: [{ n, words, now, dim }], kind } or null when there is nothing to name.
 */
export function quietTipModel({ area = null, moves = null, actionId = null, pick = null, arrow = '' } = {}) {
  if (area && typeof area === 'object') {
    const title = str(area.plainLabel) || str(area.shortLabel) || str(area.label) || str(area.id);
    const rows = (Array.isArray(moves) ? moves : []).slice(0, TIP_MOVES_MAX).map(m => ({
      n: m.n, words: tipMoveWords(m.label, title), now: m.id === actionId, dim: m.atEnd === true
    }));
    return { kind: 'area', title, rows, key: `a|${str(area.id)}|${rows.map(r => `${r.n}${r.now ? '*' : ''}${r.dim ? '-' : ''}`).join('')}` };
  }
  if (str(arrow)) return { kind: 'arrow', title: arrow, rows: [], key: `r|${arrow}` };
  if (pick && str(pick.name)) return { kind: str(pick.kind) || 'part', title: pick.name.charAt(0).toUpperCase() + pick.name.slice(1), rows: [], key: `p|${pick.name}|${str(pick.kind)}` };
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
        tipRows.textContent = '';
        for (const r of model.rows) {
          const li = el('li', 'ns-tip-row' + (r.now ? ' ns-tip-now' : '') + (r.dim ? ' ns-tip-dim' : ''), tipRows);
          el('kbd', 'ns-tip-key', li).textContent = String(r.n);
          el('span', 'ns-tip-words', li).textContent = r.words;
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
