/** NeuroSurge: the electrical map's legend (21 November 2026, section 192; the map itself is ns-emap.mjs).
 *
 * One small chunk, away from the other cards (top right), shown while the map is on (the app root's
 * data-ns-emap="on") and following the reading levels of the R key (data-ns-read): the short card at the start (a
 * title and three short lines: the command going down, the report coming up, one line of honesty), More detail under
 * it at "more" (the route of the area under the look in plain words, then what kind of picture this is), nothing at
 * "off" (scene/example/quiet.css, .ns-emap-*). Little text; every word comes from ns-text (EMAP, emapRouteLines,
 * emapSlowLine) and is written with textContent.
 *
 * DOM by createElement only (the page's content security policy needs nothing new). No three.js.
 */

/** Build the card into `root`. text: ns-text EMAP. Returns { el, setRoute(title, lines), setNotes(lines), setColour(css),
 * dispose() }, or null when the document cannot build it. setRoute and setNotes write only what changed. */
export function createEmapCard({ doc, root, text } = {}) {
  if (!doc || typeof doc.createElement !== 'function' || !root || typeof root.appendChild !== 'function' || !text) return null;
  const el = (tag, cls, parent, words) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (words !== undefined) e.textContent = words; if (parent) parent.appendChild(e); return e; };
  const card = el('aside', 'ns-emap-card', root);
  card.setAttribute('aria-label', text.title);
  const head = el('div', 'ns-emap-head', card);
  el('span', 'ns-emap-title', head, text.title);
  el('span', 'ns-emap-key', head, text.keyHint);
  const rows = el('ul', 'ns-emap-rows', card);
  // (22 November 2026, part 3: the scan's colour bar first, when the words have it)
  for (const [cls, words] of [...(text.scan ? [['ns-emap-scan', text.scan]] : []), ['ns-emap-down', text.down], ['ns-emap-up', text.up]]) {
    const li = el('li', `ns-emap-row ${cls}`, rows);
    el('span', 'ns-emap-mark', li).setAttribute('aria-hidden', 'true');
    el('span', 'ns-emap-words', li, words);
  }
  el('p', 'ns-emap-honest', card, text.honest);
  const more = el('div', 'ns-emap-more', card);
  const areaTitle = el('p', 'ns-emap-area', more, '');
  const route = el('ul', 'ns-emap-route', more);
  const notes = el('ul', 'ns-emap-notes', more);
  let routeKey = null, notesKey = null;
  // (a list's own lines are kept and removed one by one: Element.remove() is all it needs of the document)
  const kept = new Map();
  const fill = (list, lines) => {
    for (const li of kept.get(list) || []) { if (typeof li.remove === 'function') li.remove(); else if (li.parentNode && typeof li.parentNode.removeChild === 'function') li.parentNode.removeChild(li); }
    const now = [];
    for (const s of lines) if (typeof s === 'string' && s) now.push(el('li', '', list, s));
    kept.set(list, now);
  };
  return {
    el: card,
    /** The area under the look: its plain name and its route's lines. */
    setRoute(title, lines) {
      const key = `${title || ''}|${Array.isArray(lines) ? lines.join('|') : ''}`;
      if (key === routeKey) return false;
      routeKey = key;
      areaTitle.textContent = title || '';
      areaTitle.hidden = !title;
      fill(route, Array.isArray(lines) ? lines : []);
      return true;
    },
    /** What kind of picture this is (the bridge, typical and simplified, slowed by how much). */
    setNotes(lines) {
      const key = Array.isArray(lines) ? lines.join('|') : '';
      if (key === notesKey) return false;
      notesKey = key;
      fill(notes, Array.isArray(lines) ? lines : []);
      return true;
    },
    /** The colour of the command's mark: the area under the look (a CSS colour), or none for the card's own. */
    setColour(css) { if (card.style && typeof card.style.setProperty === 'function') { if (css) card.style.setProperty('--ns-emap-color', css); else if (typeof card.style.removeProperty === 'function') card.style.removeProperty('--ns-emap-color'); } },
    dispose() { try { if (card.parentNode) card.parentNode.removeChild(card); } catch { /* gone */ } }
  };
}
