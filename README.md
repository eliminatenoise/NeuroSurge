# NeuroSurge

[Play NeuroSurge in your browser](https://eliminatenoise.github.io/NeuroSurge/). [Get a Windows, macOS or Linux launcher](https://eliminatenoise.github.io/NeuroSurge/START.html).

Look at a coloured area of the glass brain and watch its mapped movement on a skinless body. Click a muscle and follow the connection back to the brain. NeuroSurge makes that relationship visible in a 3D browser game: you look out from one body, while a mirror body faces you beyond a brain you can carry and turn. Your computer runs the rendering, controls and simulation; static hosting supplies the files.

This **interaction update**, prepared 10 November 2026, adds click-and-drag rotation, muscle clicks, broad translucent ribbon arrows, a higher brain position and smoother shading across the face, neck and torso. Double-tapping Space turns both forearms and adds a small rotation at both hips. The shoulder girdle follows the left arm on both bodies, and the startup and Esc pages show a keyboard diagram. The floating copy of your own face is disabled; the mirror body retains its face.

The game now tries less demanding views or reaches when a pose cannot fit on screen. That improves recovery, but it does not eliminate every failure: source review found unresolved Space-release, camera-timing and state-consistency paths. If the fist stays closed or the scene stops responding, reload. See [controls and known limits](PREVIEW-NOTES.html) before playing.

An independent review checked a saved 28-state browser tour of this selected build, including mirror carrying, releases and both camera views. All sampled states kept running without a reported error. That tour used desktop Chromium with software rendering and Low picture quality; it did not exercise the unresolved recovery paths or establish hardware frame rates. The author's reported speed gains have not been independently reproduced.

The displayed activity and movements are **simulated and unitless**. This preview does not decode a person's neural activity, stimulate a brain, estimate validated muscle force or establish a precise functional motor map. Clicking a muscle selects the game's representative movement area and its muscle group; it does not identify a stimulation site for that individual muscle. Joint mechanics, motor-area registration and whole-body coupling remain simplified and unvalidated.

The right upper arm still does not join the palm turn, hip rotation lacks matching muscle colour, and the mirror has not been verified to be physically closer. Some arrow positions, movement ranges and combinations of keys still need work. Firefox, Safari, native Windows/macOS opening, touch screens and screen readers remain untested. [Design decisions](DESIGN-DECISIONS.md) explain the choices and their limits.

To host the files locally, install Node.js, run `node serve-local.mjs` and open the printed HTTP address. Opening the HTML directly from disk does not load the modules correctly. JavaScript and WebGL are required. The desktop launchers open the current online preview; they do not contain an offline game or trained model.

Project-owned code is CC0. BodyParts3D assets remain CC BY 4.0, Z-Anatomy facial derivatives remain CC BY-SA 4.0, and Three.js remains MIT. [Credits and licences](CREDITS-AND-LICENCES.md) retain the source notices and changes. No dataset author endorses the game.

The broader NeuroTranslation programme aims to connect qualified neural, muscle and movement observations through explicit units, clocks, provenance and uncertainty. That research goal is distinct from this simulated game. Separate NeuroTranslation development remains paused.
