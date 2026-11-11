# NeuroSurge

[Play the browser preview](https://neurosurge-public-preview-20261110.tr1-set.chatgpt.site/scene/example/preview.html) · [Get a desktop launcher](https://neurosurge-public-preview-20261110.tr1-set.chatgpt.site/START.html) · [Source on GitHub](https://github.com/eliminatenoise/NeuroSurge)

Look at a coloured area of the brain and watch the game's linked movement. Click a muscle and follow the link back. NeuroSurge puts that relationship on screen with human bones and muscles, a left arm you control, and a mirror body that shares the simulated pose and activity. Your browser runs the rendering, controls and simulation on your computer; the host supplies the files.

The brain and muscle activity values are **simulated and unitless**. The anatomy comes from human atlases. The movements come from game rules, not a person's neural recordings or a trained decoder. A muscle click selects a representative movement area and its muscle group; it does not locate a precise brain site for that muscle. Joint motion, muscle deformation and the links between body parts remain simplified.

This package is **experimental-2026-11-11-pointer-release**. If the browser misses a mouse-button release, the game now cancels the old gesture when it first reports that no buttons are held. The next press starts a fresh drag or arrow hold. Cancelling a gesture adds no click and leaves held Space/WASD keys alone. The game knows when it observed the buttons were up; it cannot recover the missing release time.

A desktop Chromium check of this package observed two right-arrow presses and releases, Esc pause/resume, Space held through a buttonless mouse movement and then released, and E in both directions. All ten sampled states stayed running without a reported error. The check did not produce a naturally missed mouse-up or measure input-to-display latency.

The previous camera, Esc and brain-framing work remains. Press E to see the body from behind; use the mirror to inspect its front. The first-person display hides the back of your own trunk, and the separate floating own-face view stays disabled.

In an earlier desktop Chromium check of the control build, seven sampled states kept running without a reported error: initial play, Esc pause/resume, Space hold/release and both E view changes. Rapid Esc resume was observed within about 212.9 ms of pointer unlock, with a commanded 50 ms gap between presses. That is a bounded observation, not a pass of the 100 ms input-to-displayed-frame requirement. Two right-arrow clicks also turned the brain while its recorded centre and four nominal arrow positions stayed unchanged; pixels, other arrows and other views still need checking.

## Try the controls

Click the scene to capture the pointer, then use the mouse or trackpad to look. W/S move the left hand forward/back; A/D move it sideways. Hold Space to close all five digits and release to open. With the brain or unobstructed mirror body under your aim, Space also carries that item: look to move it, W farther away, S closer and A/D sideways, within near/far limits. Release leaves it in place.

Press and drag the brain or mirror to turn it about its centre; move the brain aside to reach the mirror. Click or hold a ribbon arrow for smaller turns. Double-tap Space to turn the forearms palm up or down; the accompanying hip turn is a simplified display choice, not a universal biological coupling. E changes view. I opens More detail. Esc pauses and shows the controls; Esc again resumes, with a click needed to capture the pointer again. [The player guide](PLAYER-GUIDE.md) covers resets, muscle picks and movement limits.

## What still needs work

The current pictures still show patchy, jagged muscles, crowded anatomy and a slow-render warning. Hardware frame rates have not been independently established. Small portrait windows can fail to start or crowd the controls; this release has no new portrait or touch-device acceptance.

Input recovery also has open edge cases. A full waiting-input queue can lose a later release, and a pause between updates can leave events to replay. Some late failures can leave the simulation, calculated output and displayed scene out of step. Other missing-input cases need broader browser checks. Reload if the hand stays closed or the game stops responding. [Preview notes](PREVIEW-NOTES.html) explain these limits and the narrow checks behind this release.

Whole-arm visibility, the hand's upper-quarter screen position, normal joint mechanics, functional brain mapping, comparisons against a series of real anatomy and movement references, exact timing, accessibility and complete cross-platform behavior remain unfinished. This is a playable experiment with those gaps still open.

## Run a local copy

Download and extract the [repository source ZIP](https://github.com/eliminatenoise/NeuroSurge/archive/refs/heads/main.zip). In its folder, run `node serve-local.mjs` with Node.js 18 or later and open the printed HTTP address. Opening the HTML directly from disk does not load the modules correctly. JavaScript and WebGL are required. The desktop launchers open the online preview; they do not bundle an offline game or trained model.

## Check the pointer controls

Run `node tests/pointer-release.test.mjs` from the repository folder. The suite uses in-memory event records and the public controls API. Independent testing passed all 40 named cases with the repaired controller; 20 of those cases failed against the previous controller. The cases include all 32 Space/WASD key states across four pointer modes, ordinary taps after cancellation, arrow release, partial multi-button releases and focus/Esc callbacks.

These are software-state tests. They do not measure a physical release, displayed pixels or biological activity, and they do not establish the original timing requirements. A naturally missed mouse-up event still needs an ordinary browser capture.

Project-owned code is CC0. BodyParts3D assets retain CC BY 4.0, Z-Anatomy facial derivatives retain CC BY-SA 4.0, and Three.js retains MIT. [Full credits and licences](CREDITS-AND-LICENCES.md) preserve the source notices and runtime display changes; the code licence does not replace them. No atlas author endorses the game.

NeuroSurge belongs to the NeuroTranslation programme. NeuroTranslate 0.0 names its separate model under development; this game does not establish that model's training, decoding or biological accuracy.
