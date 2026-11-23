import {bindJointView} from './view.mjs';
import {isLocalModelMount} from './route.mjs';

if (isLocalModelMount(location)) {
  bindJointView({host:document.getElementById('joint-mount')});
  document.querySelector('[data-local-model-link]').hidden = false;
  document.querySelector('[data-start-local-model]').hidden = true;
}
