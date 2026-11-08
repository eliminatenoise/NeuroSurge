# NeuroSurge

Look at a motor area of a virtual brain and watch the corresponding muscles contract. NeuroSurge is a first-person browser game in development, built to make the connection between neural activity, muscle activity and movement visible.

**NeuroSurge is the sole active project.** Work on the separate NeuroTranslate model, papers and Interoceptomics is paused. The game is still being built and checked: this repository does not yet offer a completed playable release or an accepted trained model.

## Planned view

In the intended scene, your body stays in one place. You can look around it with a trackpad or mouse. The body shows bones and muscles, without skin or genitalia: the left upper arm, forearm and hand, and the torso, legs, head and right arm when you turn toward them.

The left hand stays three quarters up the view, leaving room below it to see the arm. Looking around coordinates the shoulder and arm while keeping that screen position. A and D move the hand horizontally; W and S change how far it reaches. Every finger must stay inside the visible borders.

A large, translucent brain floats ahead, beyond the hand's reach. Its motor areas are easier to see than the surrounding brain. The view generally keeps the front of the brain toward the top and the back toward the bottom, with enough tilt and adjustable viewing angle to reach the relevant motor areas.

## Controls being implemented

| Control | Intended response |
| --- | --- |
| Trackpad or mouse movement | Look around from a fixed body position. |
| W / S | Reach forward / draw the left arm back. |
| A / D | Move the left arm left / right within the view. |
| Combined WASD keys | Move in both directions together, including diagonal reaches. |
| Hold Space | Close all five digits, including the thumb, into a fist. |
| Release Space | Open the hand promptly. |
| Hold Space while looking at the brain | Carry the distant brain to a new position; release leaves it there. The hand never has to touch it. |
| Double-tap Space | Turn the forearm between palm down and palm up: pronation and supination. |
| Look at a displayed brain area | Trigger one second of simulated activity; a mapped motor area also drives its supported body response. |
| Left or right click on an area | Trigger another one-second pulse. |
| Look into empty space | No new gaze-triggered activity. |
| Click a curved arrow outside the brain | Shift the viewing angle a little around the brain's current centre. Hold to continue; release to stop. |
| Esc | Show instructions and pause interaction; press again to resume. |
| Reset Body, in the Esc overlay | Return the body's joints to their starting pose. |

All instructions appear for two seconds when the scene is ready. Orbit arrows act only when clicked or held; hovering does nothing, and the brain never spins on its own. Changing its viewing angle keeps its centre fixed. Carrying it with Space changes its position.

Looking at any displayed brain area gives it a one-second visual pulse. Only areas with an evidence-supported movement map drive a body movement. A stationary gaze produces one pulse, then stops. A new qualifying look movement or click triggers another. WASD and Space also light the corresponding motor display. The brain and muscles share an activity colour scale, and previously activated brain areas retain a subtle change in shade and opacity, separate from the brief activity pulse.

## More than the left arm

Left-arm motor areas must be clearly distinguishable from those associated with the right arm, legs, torso and head or face. These other body parts respond to the brain display through looking and clicking; the keyboard controls only the left arm. Move the brain overview so you can see it and the responding body part together.

A panel on the far right explains the selected area, the movement and muscles involved, and the limits of the mapping in plain language. Rendering, controls, simulation and these explanations run on the local computer. Hosting supplies the application files; gameplay does not depend on cloud rendering or a cloud request for each movement.

## Specific movements, with their limits attached

The intended left-arm actions include grasping, opening and spreading the fingers, wrist bending and straightening, and elbow bending and straightening. Finer movements belong where functional evidence supports them. Forearm turning needs coordinated motion of the radius and ulna (the two forearm bones), wrist and hand; rotating a picture of an arm cannot establish that anatomy.

The left upper limb is predominantly controlled through pathways from the right side of the brain. Motor representations overlap and vary between people. A structural brain mesh alone cannot supply an exact movement map, and a region is not a universal button for one muscle. Each functional assignment needs evidence appropriate to its precision; missing mappings remain explicit.

Colour represents **simulated activity**. Looking and pressing keys are virtual inputs. They do not stimulate a real brain, record muscle electrical activity or establish a validated brain decoder. Neural recordings, muscle electrical activity, contraction, mechanical forces and tracked displacement are different observations with different tests.

## The larger project

NeuroSurge makes a proposed connection tangible: a motor-control representation, a muscular response and visible movement. The separate [NeuroTranslation programme](https://github.com/eliminatenoise/NeuroTranslation) investigates how qualified neural, muscle, motion and mechanics datasets could support **NeuroTranslate 0.0**, the model name. The game's name is **NeuroSurge**. A running game will not by itself validate that broader model.

[Interoceptomics](https://github.com/eliminatenoise/Interoceptomics) contains the presentation and explanatory work on internal-body sensing and neural connectivity. Its current selected draft remains available while development is paused.

## Reuse and releases

Each selected new release replaces the current files, with changes retained in Git history. Only reviewed drafts intended for production and qualified release materials belong here. Unreviewed working files, private account records and raw recordings are excluded.

Project-owned contributions are dedicated under [CC0 1.0 Universal](LICENSE). Third-party anatomy and reference materials retain their own licences and credits. CC0 does not replace those terms or imply endorsement by an asset's author.

[Terminology and project scope](PROJECT-CONTEXT.json).
