# NeuroSurge

[Play the browser preview](https://neurosurge-public-preview-20261110.tr1-set.chatgpt.site/scene/example/preview.html) · [Get a desktop launcher](https://neurosurge-public-preview-20261110.tr1-set.chatgpt.site/START.html) · [Source on GitHub](https://github.com/eliminatenoise/NeuroSurge)

Look at a coloured area of the brain and watch the game's linked movement. Click a muscle and follow the link back. NeuroSurge puts that relationship on screen with human bones and muscles, a left arm you control, and a mirror body that shares the simulated pose and activity. Your browser runs the rendering, controls and simulation on your computer; the host supplies the files.

The brain and muscle activity values are **simulated and unitless**. The anatomy comes from human atlases. The movements come from game rules, not a person's neural recordings or a trained decoder. A muscle click selects a representative movement area and its muscle group; it does not locate a precise brain site for that muscle. Joint motion, muscle deformation and the links between body parts remain simplified.

This package is **experimental-2026-11-11-input-queue**. A refused movement frame can leave actions waiting for another attempt. The game now keeps the whole pending list, in its original order, within a combined limit of 64 game-event records. Above that limit it cancels the waiting input deliberately, asks you to release and press again, and marks a safety release at the time of cancellation. It does not silently keep the beginning of the queue and lose its end.

The count is checked before input records are copied into the frame, assigned simulation offsets or used to plan a view. The existing long-skip rescue also cancels old input explicitly. Neither cancellation recovers the original time of a missing release. Click recording has its own earlier limit, so this is not proof that every physical input was captured or delivered.

Pause and pointer-release repairs remain. Pausing clears queued clicks, turns and camera requests; a canceled carry keeps its saved placement. The earlier repair also ends a stale pointer gesture when the browser reports no buttons held. The exact movement, timing and scientific limits below remain open.

Browser testing exposed an unresolved input problem in both this repaired runtime and the preceding live build: shortly after pointer capture, one fast Space + W + D sequence unexpectedly released Space while W and D stayed held. Later staggered sequences worked. The cause is unknown; the queue-overflow handler did not fire. Full simultaneous-key behavior is therefore unverified. Release all keys and try again if the hand opens unexpectedly.

Other sampled observations included Space alone, arrow hold/release, E in both directions and a modifier-key safety release, with no reported game error. A running scene is not a pass of every control. The new overflow and long-skip rescue branches have not been captured in an ordinary browser run.

## Try the controls

Click the scene to capture the pointer, then use the mouse or trackpad to look. W/S move the left hand forward/back; A/D move it sideways. Hold Space to close all five digits and release to open. With the brain or unobstructed mirror body under your aim, Space also carries that item: look to move it, W farther away, S closer and A/D sideways, within near/far limits. Release leaves it in place.

Press and drag the brain or mirror to turn it about its centre; move the brain aside to reach the mirror. Click or hold a ribbon arrow for smaller turns. Double-tap Space to turn the forearms palm up or down; the accompanying hip turn is a simplified display choice, not a universal biological coupling. E changes view. I opens More detail. Esc pauses and shows the controls; Esc again resumes, with a click needed to capture the pointer again. [The player guide](PLAYER-GUIDE.md) covers resets, muscle picks and movement limits.

## What still needs work

The current pictures still show patchy, jagged muscles, crowded anatomy and a slow-render warning. Hardware frame rates have not been independently established. Small portrait windows can fail to start or crowd the controls; this release has no new portrait or touch-device acceptance.

Input recovery also has open edge cases. Input beyond the new bound is canceled rather than delivered; overflow and rescue still need native coverage. Some late failures can leave the simulation, calculated output and displayed scene out of step. Rare pause/focus/lifecycle orders and other missing-input cases need broader browser checks. Reload if the hand stays closed or the game stops responding. [Preview notes](PREVIEW-NOTES.html) explain these limits and the narrow checks behind this release.

Whole-arm visibility, the hand's upper-quarter screen position, normal joint mechanics, functional brain mapping, comparisons against a series of real anatomy and movement references, exact timing, accessibility and complete cross-platform behavior remain unfinished. This is a playable experiment with those gaps still open.

## Run a local copy

Download and extract the [repository source ZIP](https://github.com/eliminatenoise/NeuroSurge/archive/refs/heads/main.zip). In its folder, run `node serve-local.mjs` with Node.js 18 or later and open the printed HTTP address. Opening the HTML directly from disk does not load the modules correctly. JavaScript and WebGL are required. The desktop launchers open the online preview; they do not bundle an offline game or trained model.

## Check the controls

Run these from the repository folder:

- `node tests/deferred-input.test.mjs`: 11 named cases, including 25 capacity combinations and 64 keyboard/tail-order subcases.
- `node tests/cancel-epoch.test.mjs`: 13 named cases, including 128 keyboard-state combinations.
- `node tests/pointer-release.test.mjs`: 40 named cases for pointer-release and gesture behavior.

All 64 named cases passed with the repaired controller and helpers. The three suites use software event records and plain listener-container doubles for the public input adapter. They do not load the full application, renderer or physiological model. The large-count checks use a proxy that refuses record access; they do not allocate or process a billion real inputs. Syntax checks also passed for the application and text module. A later source correction changed three comments only; executable and test evidence was retained with exact hashes.

These checks establish bounded software behavior. They do not measure physical releases, displayed pixels or biological activity, and they do not resolve the browser chord failure above. The original timing and naturally missed mouse-up checks remain open.

Project-owned code is CC0. BodyParts3D assets retain CC BY 4.0, Z-Anatomy facial derivatives retain CC BY-SA 4.0, and Three.js retains MIT. [Full credits and licences](CREDITS-AND-LICENCES.md) preserve the source notices and runtime display changes; the code licence does not replace them. No atlas author endorses the game.

NeuroSurge belongs to the NeuroTranslation programme. NeuroTranslate 0.0 names its separate model under development; this game does not establish that model's training, decoding or biological accuracy.
