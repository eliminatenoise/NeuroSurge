# Play NeuroSurge

Open https://eliminatenoise.github.io/NeuroSurge/. The page runs locally in your browser after downloading its files. See [preview notes](PREVIEW-NOTES.html) for controls, current limitations and credits. For offline local hosting, run `node serve-local.mjs` and open the printed address.

This experimental preview widens the view and adds brain and mirror-body carry. Click the scene, then hold Space while looking at either object. Move it with the mouse or trackpad; W moves it away, S brings it closer, and A/D move it sideways. Release Space to leave it there. Move the brain aside to reach the mirror body behind it.

Brain and muscle signals are simulated and unitless. Hand positioning has passed the tested camera switches and drags. Some sideways inputs lack matching muscle glow; movement limits, combined-key responses, physiological mappings and full movement mechanics still need checking.

Known stop bug: after sustained reaching near the arm’s limit, releasing Space can stop the game. Reload the page to restart.
