# NeuroSurge design decisions: interaction update, 10 November 2026

This file records what changed in this build, why, and what was actually observed. Where a decision replaces an earlier design instruction, it says which one. Nothing here is a claim about real brains: the signals and movements in the game are simulated and have no units.

## How things were checked

One desktop Chromium, driven by scripted mouse and key events (the same events a keyboard and trackpad send), with browser screenshots, a count of the intervals between animation frames, and the DevTools sampling profiler. The session was held to one processor core, so the browser, its graphics process and the game shared it; the graphics card was the machine's own. Each timing below compares this build with the preceding preview under the same script on the same setup. They are comparisons, not promises about other computers.

Two small programs checked new maths against a reference: the pick tree against testing every triangle with Three.js (4,200 rays, no disagreement, largest distance difference 2e-12), and the written-out matrix product against the earlier loop (3.5 million elements, identical bit for bit).

No independent review has been done. Firefox, Safari, touch screens, phones, screen readers and reduced-motion settings were not run.

## 1. A frame that cannot be shown no longer stops the game

**Before.** The game checks, every frame, that the whole left arm is in view with the hand exactly on its screen anchor. If a look or a reach asked for a pose that failed the check, the game stopped and asked for a reload. In our script, looking about 40 degrees to one side, or far up or down, stopped the preceding preview.

**Decision.** Keep every check exactly as strict, and change only what happens next. A refused frame is never drawn. The same frame is tried again with less: first without the key push, then with the previous look, then both, then with the arm pulled back toward its start. If nothing is accepted the frame is skipped and its key events wait, so a released Space is never lost. After ten skipped frames in a row the view is also turned back toward the start. Only after 45 does the game put the body, brain and mirror back itself, and only after 150 does it stop with the original error.

**Why.** A game that halts on ordinary input is unusable, and "hold at the edge" is what a player expects from a limit.

**Observed.** A scripted tour of extreme looks, all four reach directions held to their stops, grasp and release at each, the palm turn, and both camera views ran to the end without stopping. It logged 46 refused attempts: eleven frames were completed by one of the fallbacks, and in one place (pushing the arm forward at the sideways look limit) ten frames were skipped before the view turned part of the way back. A line in the status card says when the look or the reach is being held.

**Open.** The pause in that one case is visible. Other input orders may find cases the script did not.

## 2. Frame rate

| Scripted scene | Preceding preview | This build |
|---|---|---|
| Standing still, start view | 23 frames/s | 60 frames/s |
| Looking around gently | 12 | 35 |
| Reaching with W then S | 24 | 56 |
| Looking onto a motor area after reaching | 3 | 44 |

Figures for this build are the mean of two runs, rounded. Its slowest single frames were 33 to 50 ms standing still and 83 to 100 ms in the other three scenes; the preceding preview's were 117 to 433 ms.

**What was slow, by profile.** At rest, three quarters of each frame went to re-deciding where the camera may sit so the whole arm shows, and most of the rest to asking what is under the crosshair by testing every triangle of the brain and the mirror body. While looking around, a fifth went to re-planning the arrows on a 4-pixel grid.

**Decisions.**
- The whole-arm check returns its earlier answer when asked the identical question again (every number it reads is compared exactly), and reads its 84,347 points from a typed array. The predicates and their order are unchanged.
- Crosshair picks against rigid meshes use a box tree over each mesh's triangles. The skinned arm muscles keep the old test, because their points move.
- When the camera must move back, the search halves the gap three times instead of six. The camera settles up to an eighth of the gap farther back, and later frames usually pass at once. Each accepted distance is still fully checked.
- The arrows no longer re-plan (see 4). The "is this label over a motor area" test uses the areas' own projected points instead of a filled grid.

**Open.** Looking around still costs two full hand fits and a re-skin of the arm per frame.

## 3. Press and drag to turn; click a muscle

**Drag.** A press on the brain that then moves five pixels or more turns the brain about its centre, 0.3 degrees per pixel, within the brain's existing turn limits. The surface nearest you follows the pointer. The mirror body turns the same way. A press that does not move is a click, delivered when the button is let go. While Space is carrying something, a press never starts a turn. Pausing, losing the pointer or switching windows ends a drag with no click.

**Muscle click.** A click on a muscle switches on the motor-map area whose movement lists that muscle as a mover, for one second, exactly as looking at that area does. A muscle on one side goes to the brain half of the other side when both halves list it. A muscle that no movement lists switches on only its body part's area, with no made-up movement. A status line names the muscle and the area and says the area drives a group of muscles. A click on a bone says so and does nothing else.

**Replaces an earlier rule, on purpose.** The glass brain used to block every click on the mirror body behind it. Carrying and turning the mirror body still need the brain moved aside. A muscle click now passes through clear glass, because the mirror body is plainly visible inside the brain's U at the start, a click on clear glass did nothing before, and the request was to click the mirror body's chest and watch the brain. A motor area under the pointer still takes the click.

**Limit.** This is the game's rough whole-area map read from the muscle's end. It does not show a spot in a real brain for one muscle.

## 4. Ribbon arrows that stay put

**Decision.** Each arrow is a thin see-through ribbon: broad swallow-tailed back, narrow neck, pointed head, curling 68 degrees away from the player. A 100-degree curl was tried and rejected: the head turned edge-on and stopped reading as an arrow. Resting opacity is 0.3, rising to 0.72 under the pointer. The click target is the ribbon's own width plus 12 pixels.

**Stay in place.** The old layout followed the brain's drawn outline, so each turn and each look moved all four arrows. The brain's arrows are now fixed beside the two ends of the motor band and above and below its middle, as the band lay when first framed; the mirror body's are fixed at set distances from its centre. They move only when their target is carried.

**Never block a motor area.** The ribbons are drawn before the motor areas, so an area is always painted over an arrow that shares its pixels, and an area under the pointer takes the click.

**Open.** The brain's top arrow is partly above a wide screen at the start view. The left arrow can sit behind the player's arm, where a faint copy shows through.

## 5. The brain sits higher

The framing now centres the motor band 0.2 of the half height above the middle of the view, which puts the leg areas at about the middle of a 16:9 screen. The brain, its areas, labels, pick geometry and arrows all come from that one framing, so nothing moves inside the brain. The request gave no number; this one was chosen by looking.

## 6. Motor areas that read as tissue

Resting opacity went from 0.3 to 0.56 (a used area 0.68, at most 0.78, still only a little more than a resting one). The surface is a little moister, and a soft warm scatter is added to the lit colour, strongest toward the silhouette. Areas for other body parts changed from warm grey to pink; left-arm areas stay light blue. Geometry, folds, borders and the activity colours are untouched, and the rest of the brain stays glass. The instructions and the legend now say pink.

## 7. Patchy muscles and bones

**Cause found.** About a fifth of the body's points are repeated along seams in the anatomy files, the loader ignores the files' own surface directions, and directions were then computed per point. Each seam was lit as a hard crease. Welding the repeated points leaves no open edge anywhere, so the seams belong to the files, not to the anatomy.

**Decision.** Points that share a position now share their shading direction, unless the two differ by more than about 78 degrees (two surfaces back to back, or a real sharp edge). No point is added, moved or removed. The mirror body is drawn from the full meshes at full picture quality instead of a simplified copy that dropped thin triangles.

**Not changed.** Outer muscles are still lifted off the deeper ones on purpose, so real gaps between layers remain. No opening was filled.

## 8. Palms, forearms and legs turn together

The left forearm's own eased turn now also drives the right forearm's radius-on-ulna turn, and 10 degrees of outward rotation at each hip about the thigh's long axis, so the lower legs and feet swing with it. These are separate joints with their own axes; nothing turns as one block. At 28 and 14 degrees the feet crossed or met, so 10 was kept. The right upper arm has no rotation axis in this rig and does not turn. The hip muscles are not coloured for this. The angles are display choices, not measurements.

## 9. The shoulder girdle follows the arm on both bodies

The mirror body already drew the very same arm as your own, so the arm matched when you looked up or down. What stayed behind, on both bodies, was the left shoulder blade and collarbone: the arm solver lifts the shoulder joint a little when you look up and carries it forward when the hand crosses the body, but the body rig did not move those bones. They now slide by the same shift, at most 50 mm. It is a slide, not a solved shoulder-blade rotation, and it was checked only for running without error in the scripted tours, not against a reference.

## 10. Keyboard picture

The start page and the Esc page show Esc, W, E, I, A, S, D and Space where they sit on a keyboard, with a trackpad drawing and three lines for move, click, and press and drag. Only keys the game handles are lit.

## 11. No floating face

The see-through or boxed copy of the player's own face is gone, with its setting and captions. An old saved setting is read as off and rewritten. The mirror body's face and the in-place head seen from behind are unchanged.

## 12. Key reach: measured, not changed

Holding each key to its stop showed W ending at the arm's full length, S where the whole hand still fits in view, and A/D at the left edge of the view and at the information panel. Three looser settings were tried; they moved the stops by millimetres and took travel away from the start pose, so they were not kept. A visibly larger sweep needs the hand to leave its fixed height on screen, which is a different control design.

## Still not done

- Independent browser review, other browsers, touch, screen readers.
- The shoulder-girdle slide has not been compared with reference images.
- The switched-off floating-face code is still in the renderer.
- `SHA256SUMS` and `release-manifest.json` predate these changes.
