# NeuroSurge

NeuroSurge is a first-person motor-control game being developed alongside the **NeuroTranslate 0.0** model. It puts a visible anatomical left hand and arm beside a virtual motor-cortex display, so a player can explore the relationship between a control input, muscle activity, contraction and movement.

The body stays in place. The left arm has no skin: its bones and attached muscles are visible. Ahead is a large, glassy brain viewed from above, with the front toward the top of the screen. The motor-cortex parts relevant to the left hand and arm are enlarged, centred and clearly visible; the rest of the brain remains transparent context.

## What the player controls

The trackpad changes where you look. It does not move your body, and looking around does not drag the hand across your visual field. The hand stays halfway up the screen. Its horizontal position changes when you move the arm with A and D; W and S change reach depth. The entire hand, including every finger, must remain within the visible borders at every permitted pose and window size.

| Control | Intended response |
| --- | --- |
| Trackpad movement | Look up, down, left or right from a fixed position. |
| W / S | Extend or retract the left arm’s reach. |
| A / D | Move the hand and arm horizontally within the visual field. |
| Combined WASD keys | Reach diagonally, such as forward-right or backward-left. |
| Hold Space | Close all five fingers, including the thumb, into a fist. |
| Release Space | Open the hand promptly, with corresponding simulated motor activity. |
| Look at a new relevant motor area | Activate that area for one second. |
| Left or right trackpad click | Trigger another one-second activation at the valid region being viewed. |
| Look into empty space | No new gaze-triggered activation. |

A stationary gaze stops activating after its one-second pulse. A new qualifying look movement or another click triggers a new pulse. WASD and Space also produce linked activity in the motor display; their held-input state is distinct from the gaze timer.

## Specific movements, grounded in evidence

The intended actions include grasping, opening and spreading the fingers, wrist flexion and extension, and elbow flexion and extension. Finer actions belong in the game where functional evidence supports them. Contraction, opposing-muscle coordination and relaxation must agree with the joints and movement shown.

The left upper limb is predominantly controlled by contralateral motor pathways, so the right-hemisphere motor representation is central to this view. The display must still respect what a motor map can tell us: representations overlap, their arrangement varies between people, and a structural precentral-gyrus mesh is not a registered map of every movement. The game must not invent a universal exact point for one muscle merely to make a neat set of buttons.

Colour shows **simulated activation**. Gaze and keys are virtual inputs; they do not deliver real neural stimulation or establish a validated brain decoder. Anatomical geometry, muscle electrical activity, mechanical contraction, tracked movement and learned predictions are different parts of the programme and retain their own evidence.

## The larger purpose

NeuroSurge makes a difficult connection tangible: a selected neural-control representation, a muscular response, mechanical consequences and visible displacement. The wider NeuroTranslation programme is investigating how appropriately qualified neural, muscle, motion and mechanics datasets can support a movement model. The game is an interface for exploring these relationships, not proof that the full data-driven model has already been achieved.

“Hand” in the game brief includes the left hand and arm. Anatomical labels remain specific when a particular finger, wrist, elbow or muscle is meant.

## Current state

The game is under development. **This repository does not yet contain a completed playable build or an accepted trained model.** Anatomy assets, functional mapping, controls and model interfaces are being checked independently before integration. A selected release must carry an honest account of what works, what is simulated and what remains unvalidated.

## Related projects

- [NeuroTranslation](https://github.com/eliminatenoise/NeuroTranslation) is the research and model programme, including the NeuroTranslation and Brain2Body papers. **NeuroTranslate 0.0** is the model name; **NeuroSurge** is this game’s name.
- [Interoceptomics](https://github.com/eliminatenoise/Interoceptomics) develops the presentation and explanatory work around internal-body sensing and neural connectivity.

## Reuse

Project-owned contributions are dedicated under [CC0 1.0 Universal](LICENSE). Third-party anatomy and reference materials retain their own licences and credits. CC0 does not replace those terms or imply endorsement by an asset’s author.

[Terminology and project scope](PROJECT-CONTEXT.json).
