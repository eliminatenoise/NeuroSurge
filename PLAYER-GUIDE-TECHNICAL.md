# NeuroSurge player guide (technical)

[Play Full](https://eliminatenoise.github.io/NeuroSurge/scene/example/preview.html) · [Play Lite](https://eliminatenoise.github.io/NeuroSurge/scene/example/preview.html?edition=lite) · [Simple guide](PLAYER-GUIDE.md)

## Input and movement

- The central aiming mark picks a motor area. Aim to trigger a movement or click to repeat it. Left and Right Arrow step across motor areas.
- During play, 1 selects the left arm, 2 the left leg, 3 the right leg and 4 the right arm. W, A, S and D move that limb. In the eye view, a small deliberate pitch change commands shoulder or hip movement within the current joint limits. The aiming cue stays 25% from the top of the screen. The actual wrist or ankle can move away from the cue when the camera moves or the joint reaches its limit.
- Space grips or carries the targeted object. Drag an object to turn it or a limb to move its joint. Shift selects the item behind the default target.
- E switches modes. The eye view rotates about a fixed position. The outside view orbits a fixed point at a constant distance. Each mode has a fixed field of view for the current window size. The camera does not follow the simulated body.
- R changes the information shown. M toggles the detailed electrical map. The normal view has a separate, lower-opacity electrical effect on the cortex and motor strip, with an off switch in Escape settings.
- Press Escape and open **View tutorial** to review its steps or resume or restart the sequence. Markers identify game regions or joints in view.
- After limb selection, a vertical look in the eye view starts a measurement. Within 0.35 seconds of game time after that look, the virtual wrist or ankle must move at least 2.5 cm from its position relative to the shoulder or hip just before the look. Move the pointer in capture mode or press **Escape** twice and drag empty space with a free pointer. Dragging keeps the pointer free. Click **Resume** in the controls to capture it. Press **E** to return from the outside view.

## Command box and camera

- **F** opens the Command box. Enter a supported movement or a sequence of up to four movements joined by `then`. Choose **Move** or press **Enter**. Where supported, **Use voice** fills the field through on-device dictation. A new command or a direct movement input ends the queued sequence.
- **C** opens the recorder in the standalone game and the **Movement mirror** through the local model launcher. **Start camera** requests video only. The local tracker estimates visible arm and knee positions in the image and drives the selected joints while the renderer continues to use the player's camera input. Use **Stop** in the Movement mirror or **Stop camera** in the recorder to release video. **Close** or **Escape** closes the Movement mirror.
- A take retains time-stamped pose samples in the current tab. Open **Record a limb take** when playing through the local model launcher. Select **Record take** and **Finish take** in the recorder. Use **F** and **replay my take** to replay the saved poses with video off.
- The local model route accepts point histories and game requests. It returns a forecast separately from the measured pose of the virtual rig. An image-plane estimate does not establish physical joint angle or nerve activity.

## Shared engine and assets

Both editions use the same simulation, region picking, body rig, materials, tutorial and camera. Lite’s compressed files reduce transfer by 996,262 bytes across the five mesh packs, index and rig. The separate decoder adds 142,385 bytes when the browser lacks built-in support. The decoded bytes are identical. [Pack checks and local launchers](lite/README.md).

Joint and muscle behaviour approximates the displayed anatomy. The electrical activity is illustrative and unitless. It comes from the simulation and is not a recorded brain signal. [Credits and licences](CREDITS-AND-LICENCES.md).
