# Play NeuroSurge

[Open the preview](https://neurosurge-public-preview-20261110.tr1-set.chatgpt.site/scene/example/preview.html) or [save a desktop launcher](START.html). You need a keyboard and a mouse or trackpad, JavaScript and WebGL. The browser downloads the anatomy and code, then your computer runs the game. This edition is experimental-2026-11-11-input-queue.

## Get your bearings

The startup instructions show a keyboard picture and are set to close two seconds after the body loads. Press Esc to pause and read them for longer. Press Esc again to resume. Resuming with Esc leaves the mouse free until you click the scene; the visible Resume button can also request pointer capture. Follow your browser's normal permission behavior.

You control a skinless left arm attached to a body that stays in place. The front-facing body beyond the glass brain mirrors the game's pose and activity. Look down for your lap and legs. The first-person display hides the back of your own trunk; inspect the front on the mirror and press E for the view from behind, including the head. There is no separate floating face.

## Move, grasp and carry

| Input | What to do |
| --- | --- |
| Mouse / trackpad | Move to look; the left shoulder follows the view. With a free pointer, press and drag empty scene space to look. |
| W / S | Move the left hand farther forward / back toward the body. |
| A / D | Move the hand left / right. You can combine movement keys. These keys do not walk the body or control the other limbs. |
| Hold Space | Close all five digits. Let go to open. Look at empty space first if you want only the fist. |
| Space on brain or mirror | Hold the item under your aim. Look to carry it; W moves it farther away, S closer, A/D sideways. Mouse movement and keys can work together. Let go to leave it there. |
| Double-tap Space | Turn the forearms palm down or palm up: pronation and supination. The game adds a small hip turn; the right upper-arm turn and matching hip-muscle colours are incomplete. |
| E | Switch between first person and a view from behind; press again to return. |

The brain remains a distant object rather than something the hand touches. Brain and mirror carry use finite near/far limits. Combined-key travel, endpoint behavior and clearance across all poses have not been fully checked. Move the brain aside before carrying the mirror; clear glass still blocks that carry selection when the brain is in front.

If the view refuses an E change, return your look toward the middle or move the hand forward a little and try again. The game can hold or retreat a look/reach when the whole arm cannot fit. It can still fail in other input orders.

## Turn the view of an object

Press on the brain and drag to turn it about its centre. Do the same on the unobstructed mirror body, or click a ribbon arrow for a small turn. Hold an arrow to keep turning; release stops it. Hovering is not a turn command. Space carrying takes precedence over a drag-to-turn gesture.

If a release event goes missing, the game cancels the old mouse gesture when the browser next reports that all buttons are up. A new press starts a fresh gesture. That cancellation adds no click and leaves Space/WASD keys alone; Esc and focus loss release held controls.

Some areas lie around the brain's sides. Turn it to expose them. Your arm can hide an arrow, and brain/mirror arrows can overlap; drag the object when an arrow is hard to reach. The intended stable arrow placement has only a narrow recorded check, not complete coverage at every angle and window size.

## Follow the simulated signal

Move onto a new coloured motor area to start a one-second game pulse; click to repeat it. Linked muscle colours and movement show the game's response. Holding a fist can take precedence over some hand-area responses.

Click a muscle on either body to select the game's representative movement area and group of muscles. A muscle pick may pass through clear brain glass; a motor area under the pointer takes priority. A bone does not trigger muscle activity. Some muscles have no mapped movement and only select a body-area display. A lit area is not a measured stimulation site for one muscle.

The panel explains the area under your aim; I opens More detail. A persistent activation mark is separate from the brief pulse. Pulse values have no biological units, and the exact one-second display timing is still under review.

## Pause, reset or recover

Esc shows instructions, the keyboard diagram and settings. Pausing cancels queued clicks, turns and camera requests; resuming starts with those queues clear. A canceled carry leaves the object at its saved location. Press again after resuming to begin a new gesture. Reset body requests the starting body/hand pose and clears activation marks while leaving the brain's placement. Reset brain view brings the brain back and turns the mirror to face you again. Picture quality: Low may help on a slow machine, with rougher surfaces as a tradeoff.

If too many game actions are waiting, they are canceled and the game asks you to release and press again. A fast Space + W + D sequence also unexpectedly opened the hand in browser checks of both this runtime and the preceding build; later sequences worked, and the cause is unknown. Release all keys and try again if this happens.

A rapid second Esc worked in the earlier control-build check. Overflow/rescue, rare focus/lifecycle orders, missing key releases and movement failures still have open edge cases; if a hand stays closed, a press is lost or the scene stops responding, reload. Narrow portrait windows can fail before play begins: use a wider desktop window. Touch controls, native Windows/macOS opening, other browsers and screen readers remain unverified. [Preview notes](PREVIEW-NOTES.html) give the evidence and remaining limits.
