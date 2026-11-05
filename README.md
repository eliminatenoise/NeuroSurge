# NeuroSurge

Look at a virtual motor cortex. See the corresponding movement in an anatomical left hand and arm. NeuroSurge is a first-person simulation being developed alongside the NeuroTranslate 0.0 model, connecting neural activity, muscle activity, contraction mechanics and displacement.

The body stays fixed. The hand stays halfway up the visual field and entirely inside its borders, including the fingers. Looking around preserves its horizontal position; arm controls move it within that view.

| Control | Intended action |
| --- | --- |
| Trackpad movement | Look up, down, left or right without moving the body. |
| W / S | Extend or retract the arm’s reach. |
| A / D | Move the hand and arm left or right within the visual field. |
| Combined WASD keys | Move diagonally. |
| Hold Space | Close all five fingers into a fist. |
| Release Space | Open the hand, with corresponding simulated motor activity. |
| Look at a new motor region | Activate it for one second. |
| Left or right trackpad click | Trigger another one-second activation at the region being viewed. |
| Look into empty space | No gaze-triggered activation. |

The enlarged left-hand/arm motor representation is the visual focus. Other brain regions remain glassy context. Specific actions include grasping, opening and spreading the fingers, wrist flexion and extension, and elbow flexion and extension, with finer actions where functional evidence supports them. Contraction, coordinated opposing-muscle activity and relaxation must agree with the movement shown.

The functional map must preserve overlapping motor representations and variation between people. The virtual gaze and keyboard controls do not deliver real neural stimulation or establish a validated decoder. Measured recordings, inferred quantities and simulated activity remain distinct.

## Development status

The game is under development. This repository does not yet contain a completed playable build or an accepted trained model. Anatomy assets, movement mapping, controls and model interfaces are being checked independently before integration.

Project-owned contributions are dedicated under CC0 1.0 Universal. Third-party anatomy and reference materials retain their own licences and credits; CC0 does not replace those terms.
