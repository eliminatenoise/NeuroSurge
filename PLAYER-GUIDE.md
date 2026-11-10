# Play NeuroSurge

Open https://eliminatenoise.github.io/NeuroSurge/. The page runs locally in your browser after downloading its files. See [preview notes](PREVIEW-NOTES.html) for every control, the current limitations and credits. For offline local hosting, run `node serve-local.mjs` and open the printed address.

Click the scene once so the mouse looks around. The start page shows a picture of the keys; Esc brings it back.

- **Look** at a coloured motor area of the brain: that body part moves for one second. Click to repeat.
- **Click a muscle** on your own body or on the mirror body: the motor area that moves it switches on. The mirror body's muscles can be clicked through the clear glass.
- **Press and drag** on the brain to turn it. The mirror body turns the same way once the brain is aside. The see-through ribbon arrows do the same in small steps.
- **W/A/S/D** move your left hand. **Hold Space** to make a fist, or to carry the brain or the mirror body you are looking at (W farther, S closer, A/D sideways).
- **Tap Space twice** to turn your palms: both forearms and both legs turn.
- **E** shows your back. **I** opens More detail.

Brain and muscle signals are simulated and unitless. A clicked muscle lights a whole motor area, not a spot for that one muscle. If your look or your reach stops, the arm has reached the edge of what can be shown; the game keeps running. Movement limits, physiological mappings and full movement mechanics are simplified and still need checking.
