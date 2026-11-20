/** NeuroSurge: the main controls, shown for the first five seconds of the page (user notes: "for the first 5 seconds,
 * I want you to have an overlay of the main controls. WASD, ER, space, and trackpad with click"; 18 November: "WASD is
 * in a sort of pyramid structure, whilst ER are by themselves chunked together, but away from the pyramid slightly";
 * 19 November: "Things should be chunked together and those chunks should be spaced away from each other").
 *
 * The card is FOUR chunks, each in its own frame with its own word, and clearly more room between the chunks than
 * inside them (scene/example/quiet.css, .ns-ctl-*):
 *   1. W over A S D, a pyramid: move
 *   2. E and R, a pair set apart from the pyramid: view, info
 *   3. Space on its own: grip (20 November 2026, evening, Message 204: Space grips with both hands and both feet and
 *      takes hold; a click never grips, it presses)
 *   4. the trackpad with its three actions: move = look, click = press, drag = turn
 * The words name game controls only. DOM by createElement and textContent (the page's content security policy needs
 * nothing new). The card fades by itself after its time (a CSS animation on .ns-keys, assembly.css: it goes on time
 * even while the page is busy loading, and at once under reduced motion). */

/** How long the card stays (ms). */
export const CONTROLS_CARD_MS = 5000;
const CONTROLS_HELP = 'Esc for controls and settings';

/** The card's chunks, in reading order (pure; the test and the Esc page read the same grouping). keys: rows of key
 * names, top to bottom; words: one short word for the chunk, or one per key (same order as the keys read left to
 * right); acts: [gesture, what it does] rows of the trackpad. */
export const CONTROLS_CARD_CHUNKS = Object.freeze([
  Object.freeze({ id: 'wasd', keys: Object.freeze([Object.freeze(['W']), Object.freeze(['A', 'S', 'D'])]), words: Object.freeze(['move']) }),
  Object.freeze({ id: 'er', keys: Object.freeze([Object.freeze(['E', 'R'])]), words: Object.freeze(['view', 'info']) }),
  Object.freeze({ id: 'space', keys: Object.freeze([Object.freeze(['Space'])]), words: Object.freeze(['grip']) }),
  Object.freeze({ id: 'pad', acts: Object.freeze([Object.freeze(['Move', 'look']), Object.freeze(['Click', 'press']), Object.freeze(['Drag', 'turn'])]) })
]);

/** What a screen reader hears instead of the picture (pure). */
export function controlsCardLabel(chunks = CONTROLS_CARD_CHUNKS) {
  const parts = [];
  for (const c of chunks) {
    if (c.acts) { parts.push(`trackpad: ${c.acts.map(([g, w]) => `${g.toLowerCase()} to ${w}`).join(', ')}`); continue; }
    const keys = c.keys.flat();
    if (c.words.length === keys.length) keys.forEach((k, i) => parts.push(`${k} ${c.words[i]}`));
    else parts.push(`${keys.join(' ')} ${c.words[0]}`);
  }
  return `Main controls: ${parts.join('; ')}. ${CONTROLS_HELP}.`;
}

/** Draw the card into `host` for `ms`. Returns the element (null when the document cannot build it). */
export function showControlsCard({ host, doc = globalThis.document, ms = CONTROLS_CARD_MS } = {}) {
  try {
    const el = (tag, cls, parent, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; if (parent) parent.appendChild(e); return e; };
    const card = el('div', 'ns-keys ns-ctl', host);
    card.setAttribute('role', 'note');
    card.setAttribute('aria-label', controlsCardLabel());
    card.style.setProperty('--ns-keys-ms', `${ms}ms`);
    // Left: the three key chunks, laid out as they lie on a keyboard (E and R right of W, Space under them).
    // Right: the trackpad. The middle of the picture, where the body is, stays free.
    const keysSide = el('div', 'ns-ctl-side ns-ctl-side-keys', card);
    const padSide = el('div', 'ns-ctl-side ns-ctl-side-pad', card);
    for (const c of CONTROLS_CARD_CHUNKS) {
      const chunk = el('div', `ns-ctl-chunk ns-ctl-${c.id}`, c.acts ? padSide : keysSide);
      chunk.setAttribute('aria-hidden', 'true');
      if (c.acts) {
        const plate = el('div', 'ns-pad-plate', chunk);
        el('span', 'ns-pad-finger', plate);
        el('span', 'ns-pad-click', plate);
        const acts = el('dl', 'ns-ctl-acts', chunk);
        for (const [g, w] of c.acts) { el('dt', '', acts, g); el('dd', '', acts, w); }
        continue;
      }
      const perKey = c.words.length === c.keys.flat().length && c.words.length > 1;
      let n = 0;
      for (const row of c.keys) {
        const r = el('div', 'ns-ctl-row', chunk);
        for (const k of row) {
          const cell = perKey ? el('div', 'ns-ctl-cell', r) : r;
          el('kbd', k === 'Space' ? 'ns-key ns-key-space' : 'ns-key', cell, k);
          if (perKey) el('span', 'ns-ctl-word', cell, c.words[n]);
          n++;
        }
      }
      if (!perKey) el('span', 'ns-ctl-word', chunk, c.words[0]);
    }
    const help = el('p', 'ns-ctl-help', keysSide, CONTROLS_HELP);
    help.setAttribute('aria-hidden', 'true');
    card.addEventListener('animationend', ev => { if (ev.animationName === 'ns-keys-out') { try { card.remove(); } catch { /* gone */ } } });
    return card;
  } catch { return null; }
}
