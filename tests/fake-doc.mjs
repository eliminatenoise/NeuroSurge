/** Test helper (not a test): a document just large enough to build overlay DOM into, and two finders. */

/** A document just large enough to build DOM into (createElement, className, textContent, children). */
export function fakeDoc() {
  const make = tag => {
    const e = { tagName: String(tag).toUpperCase(), className: '', textContent: '', children: [], attrs: {}, hidden: false, style: { props: {}, setProperty(k, v) { this.props[k] = v; }, removeProperty(k) { delete this.props[k]; } }, listeners: {},
      appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }, removeAttribute(k) { delete this.attrs[k]; },
      addEventListener(t, f) { this.listeners[t] = f; }, remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(x => x !== this); } };
    return e;
  };
  return { createElement: make };
}
export const all = (root, pred, out = []) => { for (const c of root.children) { if (pred(c)) out.push(c); all(c, pred, out); } return out; };
export const hasClass = (e, c) => ` ${e.className} `.includes(` ${c} `);
