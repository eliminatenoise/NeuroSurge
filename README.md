# NeuroSurge

[Play the experimental browser preview](https://eliminatenoise.github.io/NeuroSurge/).

Move an arm. Watch its muscles and movement-related brain regions light up together. NeuroSurge is a 3D browser game for exploring that connection: a skinless body, a movable brain overview, linked activation colours and keyboard, mouse and trackpad controls. Rendering, controls and simulation run on your computer. Static hosting supplies the files.

This is **experimental preview C410**, published 10 November 2026. The displayed signals and movement relationships are simulated and unitless. This build does not decode a person's neural activity, stimulate a brain, estimate validated muscle force or establish a precise functional motor map.

The current third-person view places the hand too low. Joint mechanics, whole-body coupling, motor-region registration, control coverage and timing remain incompletely validated. [Preview notes and controls](https://eliminatenoise.github.io/NeuroSurge/PREVIEW-NOTES.html) describe the current limits. Experimental publication is separate from passing the complete game's acceptance criteria.

To run locally, use Node.js and `node serve-local.mjs`, then open the printed HTTP address. Opening the HTML from disk does not load the modules correctly. WebGL and JavaScript are required.

Project code is CC0. BodyParts3D assets remain CC BY 4.0; Z-Anatomy facial derivatives remain CC BY-SA 4.0; Three.js remains MIT. [Credits and licences](CREDITS-AND-LICENCES.md) retain source notices and changes. No dataset author endorses the game.

The broader NeuroTranslation programme aims to connect qualified neural, muscle and movement observations with explicit units, clocks, provenance and uncertainty. That research goal is distinct from the simulated game shown here. Separate NeuroTranslation development remains paused.
