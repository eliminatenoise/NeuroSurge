import {viewerDocument} from './shared-motion/document.mjs';

const assets = new URL('./shared-motion/', import.meta.url).href.slice(0, -1);

// The server deliberately refuses framed HTTP documents. Give the game's own
// inline frame a local document with the viewer's exact external scripts.
export function mountSharedMotion(section, close) {
  const frame = section.ownerDocument.createElement('iframe');
  const status = section.querySelector('[role=status]');
  frame.title = 'Shared movement Transformer';
  frame.allow = "camera 'none'; microphone 'none'; geolocation 'none'";
  frame.referrerPolicy = 'no-referrer';
  const html = viewerDocument.replaceAll('@@ASSETS@@', assets);

  function load() {
    status.textContent = 'Opening the shared model…';
    frame.srcdoc = html;
  }
  frame.addEventListener('load', () => {
    const view = frame.contentDocument;
    if (!view?.getElementById('history-select')) return;
    status.textContent = '';
    // A relative fragment in srcdoc resolves against the outer playable page.
    view.querySelector('.skip').addEventListener('click', event => {
      event.preventDefault();
      view.getElementById('history-select').focus();
    });
    view.addEventListener('keydown', event => {
      const back = event.key === 'BrowserBack' || event.key === 'GoBack' ||
        (event.altKey && event.key === 'ArrowLeft');
      if (event.isComposing || event.ctrlKey || event.metaKey || (event.key !== 'Escape' && !back)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    }, true);
    // Reload just this viewer if its integrity check fails.
    view.addEventListener('click', event => {
      if (!event.target.closest?.('#retry')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      load();
    }, true);
    // A rejected UI script cannot display its own retry control. A healthy
    // script registers its listeners before asynchronously checking weights.
    if (!view.querySelector('script[src$="/panel.js"][data-started="true"]')) {
      view.getElementById('status').textContent = 'The viewer could not load its local scripts.';
      view.getElementById('retry').hidden = false;
    }
  });
  load();
  section.append(frame);
}
