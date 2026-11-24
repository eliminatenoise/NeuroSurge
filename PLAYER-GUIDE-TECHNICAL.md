# NeuroSurge player guide (technical)

[Play Full](https://eliminatenoise.github.io/NeuroSurge/scene/example/preview.html) · [Play Lite](https://eliminatenoise.github.io/NeuroSurge/scene/example/preview.html?edition=lite) · [Simple guide](PLAYER-GUIDE.md)

## Input and movement

- Start and **Resume** use a free pointer. Drag on empty space to turn the view. **Capture mouse** in the Escape menu enables browser pointer lock, so each mouse movement turns the view. Escape releases it. If the browser declines capture, drag on empty space to keep playing.

- With a free pointer, the pointer picks a motor area. An area the pointer rests on for a tenth of a second triggers its movement, and a click repeats it. A pointer that only crosses an area triggers nothing. The central aiming mark picks instead while the mouse is captured, while the view is dragged, during a hold with Space, and after an arrow key until the pointer next moves. Left and Right Arrow step across motor areas.
- During play, 1 selects the left arm, 2 the left leg, 3 the right leg and 4 the right arm. W, A, S and D move that limb. In the eye view, a small deliberate pitch change commands shoulder or hip movement within the current joint limits. The aiming cue stays 25% from the top of the screen. The actual wrist or ankle can move away from the cue when the camera moves or the joint reaches its limit.
- Space grips or carries the targeted object. Drag an object to turn it or a limb to move its joint. Shift selects the item behind the default target.
- E switches modes. The eye view rotates about a fixed position. The outside view orbits a fixed point at a constant distance. Each mode has a fixed field of view for the current window size. The camera does not follow the simulated body.
- R changes the information shown. M toggles the detailed electrical map. The normal view has a separate, lower-opacity electrical effect on the cortex and motor strip, with an off switch in Escape settings.
- Press Escape and open **View tutorial** to review its steps or resume or restart the sequence. Markers identify game regions or joints in view.
- In step 4, a vertical look in the eye view starts the measurement. The tutorial advances if the simulated wrist or ankle moves at least 2.5 cm relative to its shoulder or hip within 0.35 seconds of game time. The reference is its position just before the look. Drag on empty space or move the captured pointer. Press **E** to return from the outside view.

When the scene is out of view, the recovery hint offers drag, arrow-key aiming and Escape → Reset brain view. With the brain out of view, the reset restores the initial look. Tutorial and information panels take pointer input, and the Brain ring marks a valid Space pickup.

Extra sharing parameters leave the selected edition intact. The address error panel opens the default game address through **Start the game**. Camera drag suppresses motor-area activation by the aiming mark. With the information visible, the ring in the limb drag step appears when a press at its centre can select the chosen limb. The view recovery message is available at every information level.

In Full and Lite, a finger drag on empty canvas uses the same yaw and pitch controls as a mouse drag. Lift to stop turning. A short tap on a coloured motor area activates on release. Touch cancellation produces no motor activation. A keyboard is still needed for key commands.

## Shared engine and assets

Both editions use the same simulation, region picking, body rig, materials, tutorial and camera. Lite’s compressed files reduce transfer by 996,262 bytes across the five mesh packs, index and rig. The separate decoder adds 142,385 bytes when the browser lacks built-in support. The decoded bytes are identical. [Pack checks and local launchers](lite/README.md).

Joint and muscle behaviour approximates the displayed anatomy. The electrical activity is illustrative and unitless. It comes from the simulation and is not a recorded brain signal. [Credits and licences](CREDITS-AND-LICENCES.md).
