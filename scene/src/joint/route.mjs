const loopback = ['127.0.0.1', 'localhost', '[::1]'];

/** The model launcher serves the game and its local API from one loopback origin. */
export function isLocalModelMount(location) {
  return (location?.protocol === 'http:' || location?.protocol === 'https:') &&
    loopback.includes(location.hostname) &&
    location.pathname?.startsWith('/game/') === true;
}

export function movementMirrorBackend(location) {
  if (isLocalModelMount(location)) return 'local-model';
  if (location?.protocol === 'https:' || (location?.protocol === 'http:' && loopback.includes(location.hostname))) return 'browser';
  return null;
}
