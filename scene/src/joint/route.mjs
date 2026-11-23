/** The model launcher serves the game and its local API from one loopback origin. */
export function isLocalModelMount(location) {
  return (location?.protocol === 'http:' || location?.protocol === 'https:') &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname) &&
    location.pathname?.startsWith('/game/') === true;
}
