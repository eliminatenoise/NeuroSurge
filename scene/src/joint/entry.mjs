import {bindJointView} from './view.mjs';
import {movementMirrorBackend} from './route.mjs';

const backend = movementMirrorBackend(location);
if (backend) {
  bindJointView({host:document.getElementById('joint-mount'), backend});
  document.querySelector('[data-local-model-link]').hidden = backend !== 'local-model';
  document.querySelector('[data-start-local-model]').hidden = true;
}
