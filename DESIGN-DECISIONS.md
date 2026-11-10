# NeuroSurge design decisions: interaction update, 10 November 2026

Decisions 13 to 15 were made later the same day, after the user looked at pictures of the build: the brain's outline, what the ordinary view shows of your own body, and upright windows. Where they change a number given earlier in this file, the earlier section says so.

This file records what changed in this build, why, and what was actually observed. Where a decision replaces an earlier design instruction, it says which one. Nothing here is a claim about real brains: the signals and movements in the game are simulated and have no units.

## How things were checked

One desktop Chromium, driven by scripted mouse and key events (the same events a keyboard and trackpad send), with browser screenshots, a count of the intervals between animation frames, and the DevTools sampling profiler. The session was held to one processor core, so the browser, its graphics process and the game shared it; the graphics card was the machine's own. Each timing below compares this build with the preceding preview under the same script on the same setup. They are comparisons, not promises about other computers.

Two small programs checked new maths against a reference: the pick tree against testing every triangle with Three.js (4,200 rays, no disagreement, largest distance difference 2e-12), and the written-out matrix product against the earlier loop (3.5 million elements, identical bit for bit).

For decisions 13 to 15 three more scripted checks were used, all with the same ordinary mouse and key events. A closed-loop sweep of the look, 1.5 degrees at a time over 50 degrees to each side and from 12 degrees down to 42 up, reading after every move what the crosshair rests on (so a look the game holds back is seen, not assumed). The game was started at nineteen window sizes. And the last commit before those decisions was served beside the new build and given the same scripts, so "before" figures in 13 to 15 are measured, not remembered.

No independent review has been done. Firefox, Safari, touch screens, phones, screen readers and reduced-motion settings were not run. Window sizes were set in desktop Chromium; no phone or tablet was used.

## 1. A frame that cannot be shown no longer stops the game

**Before.** The game checks, every frame, that the whole left arm is in view with the hand exactly on its screen anchor. If a look or a reach asked for a pose that failed the check, the game stopped and asked for a reload. In our script, looking about 40 degrees to one side, or far up or down, stopped the preceding preview.

**Decision.** Keep every check exactly as strict, and change only what happens next. A refused frame is never drawn. The same frame is tried again with less: first without the key push, then with the previous look, then both, then with the arm pulled back toward its start. If nothing is accepted the frame is skipped and its key events wait, so a released Space is never lost. After ten skipped frames in a row the view is also turned back toward the start. Only after 45 does the game put the body, brain and mirror back itself, and only after 150 does it stop with the original error.

**Why.** A game that halts on ordinary input is unusable, and "hold at the edge" is what a player expects from a limit.

**Observed.** A scripted tour of extreme looks, all four reach directions held to their stops, grasp and release at each, the palm turn, and both camera views ran to the end without stopping. It logged 46 refused attempts: eleven frames were completed by one of the fallbacks, and in one place (pushing the arm forward at the sideways look limit) ten frames were skipped before the view turned part of the way back. A line in the status card says when the look or the reach is being held.

**After decisions 13 to 15** (four runs, none stopped): three runs logged 62 to 65 refused attempts, 36 to 39 frames completed by a fallback and none skipped; the fourth logged 53, 10 and the same ten-frame pause as before. The same script on the commit before showed the pause in both of two runs (47 and 49 refused, ten skipped). Nothing in 13 to 15 changes the arm fit; the tour is sensitive to small timing differences, and the pause is still there.

**Open.** The pause in that one case is visible. Other input orders may find cases the script did not.

## 2. Frame rate

| Scripted scene | Preceding preview | This build |
|---|---|---|
| Standing still, start view | 23 frames/s | 60 frames/s |
| Looking around gently | 12 | 35 |
| Reaching with W then S | 24 | 56 |
| Looking onto a motor area after reaching | 3 | 44 |

Figures for this build are the mean of two runs, rounded. Its slowest single frames were 33 to 50 ms standing still and 83 to 100 ms in the other three scenes; the preceding preview's were 117 to 433 ms.

After decisions 13 to 15 the same script gave 60, 40, 56 and 40 (two runs; slowest single frames 17 to 50 ms standing still, 67 to 117 ms in the others). The commit before gave 60, 37, 56 and 46 in one run. The last scene moves the look by a fixed amount, which now ends on a different part of the redrawn brain, so its two figures are not the same test.

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

**Open.** The left arrow can sit behind the player's arm, where a faint copy shows through. (The top arrow was partly above a wide screen; with the brain drawn as in 13 it is on screen at 1600 by 900.)

## 5. The brain sits higher

The framing now centres the motor band 0.2 of the half height above the middle of the view, which puts the leg areas at about the middle of a 16:9 screen. The brain, its areas, labels, pick geometry and arrows all come from that one framing, so nothing moves inside the brain. The request gave no number; this one was chosen by looking. Decision 13 later changed how the brain around the band is drawn; the band's place on screen stayed.

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

The see-through or boxed copy of the player's own face is gone, with its setting and captions. An old saved setting is read as off and rewritten. The mirror body's face and the in-place head seen from behind are unchanged. No head or face mesh was removed from the game; decision 14 covers what the ordinary view shows of your own body.

## 12. Key reach: measured, not changed

Holding each key to its stop showed W ending at the arm's full length, S where the whole hand still fits in view, and A/D at the left edge of the view and at the information panel. Three looser settings were tried; they moved the stops by millimetres and took travel away from the start pose, so they were not kept. A visibly larger sweep needs the hand to leave its fixed height on screen, which is a different control design.

## 13. The brain is drawn with its real outline

**The note (10 November).** "The highlighted motor areas look far too low in the brain to be anatomically realistic, the brain is probably too narrow."

**Cause found.** The areas had not moved. They are painted on the atlas's own precentral fold, which in the atlas files runs from 36% to 72% of the brain's length behind its front end. What was wrong was the picture of the brain around them. With the 110-degree view and the motor areas filling the screen, the eye sat 0.7 brain lengths from the brain's centre: about 65 mm above the top of a 180 mm brain, in the brain's own scale. From that close you see only the top of the dome. The back of the brain shrank to a rim under the motor band and the front ran off far above the screen. Measured at 1600 by 900 from the game's own framing readback: the middle of the band was drawn 84% of the way back along the outline, and the outline's box was half as wide as it was long. The atlas brain is 139 mm wide and 180 mm long, a ratio of 0.77.

**Decision.** Three changes to how the brain is drawn. Nothing inside the brain moves.
- It is drawn as an eye six times farther away would see it through a six times zoom. This is the round-4 method, which round 5 had switched off. The outline is then the brain's real outline.
- That picture is laid parallel to the screen at the start look. Round 4 laid it square to the line from the eye to the brain's centre. With the motor band on the crosshair that line points about 22 degrees above straight ahead, and on a 110-degree screen the tilt stretched the front half of the brain to several times the size of the back half (tried first, viewed, not kept).
- The 10-degree forward tilt is gone. The start view is straight down on the top of the brain, front up. A forward tilt hides the back of the brain and pushes the band toward the lower edge of the outline, which is the fault being fixed.

**Observed, same screen.** The middle of the band is 55% of the way back along the outline (atlas: 54%). The outline's box is 0.79 as wide as long. The back of the brain reaches about 190 pixels below the band; it was 27. The band is as wide on screen as before.

**Which areas the crosshair can reach.** From straight above, the lowest areas on each side of the brain are seen nearly edge-on. In the look sweep the crosshair rested on 40 of the 44 areas without turning the brain; the tongue area and the lowest in-between area on each side were never under it. The same sweep on the commit before reached 36 (it also missed both lips areas, one eyelid area and one jaw area). Turning the brain by dragging or with the arrows faces the rest, and a click on a muscle switches on its area without aiming at it.

**Cost.** The picture has the brain's own proportions only at the start look. Look 40 degrees up or to one side and it is stretched, as any flat picture is when seen at an angle through a wide lens. Before, that stretch was in the start look instead. Carrying the brain with Space and the look keeps its picture square to you (viewed). The motor areas take up a little less of the look range than before, because the close-up had enlarged them: 25% of the sweep's stops were on an area, against 34%.

## 14. In the ordinary view you see only what is in front of your face

**The notes (10 November).** First: "the individual's head is entirely gone … I asked you to get rid of the floating head view on the ceiling when you looked up to the sky, not the whole individual's head and head/face muscles." Then: "Perhaps I'm mistaken. If that's the first person view, then the camera should really be sitting on top of the shoulder and not show the back of the body. Ultimately, your call on everything."

**What was there.** No head or face mesh had been removed: they are loaded, the mirror body shows them, and the view from behind (E) draws them on your own body. But the ordinary view's camera is not at your eyes. To keep the whole left arm in view it backs away along your line of sight: 0.30 m behind the eye point at the start, more for a long reach. From there it saw the back of your own neck, shoulders and trunk across the lower third of the screen, and a neck that ended in a stump, because the head is never drawn around the camera. The two previews before this one show the same picture. With the floating face gone there was no head left in it anywhere.

**Decision.** The ordinary view is a first-person view, so it now draws only what you could see of yourself. A point of your own body is drawn only in front of the upright plane through your eye point that faces the way your body faces. The trunk, neck and right arm fade in from 3 to 15 cm in front of that plane. The legs fade in from 16 to 4 cm behind it, so each thigh shows whole from the hip. The left arm you control is always drawn whole. Your head, neck, shoulders, chest and back lie behind the plane and are not drawn; what is left is your lap, knees and feet, and your right forearm and hand resting in front of you. A part that is not drawn cannot be clicked, and the glow from a motor area goes only to muscles that are drawn (it still goes to every muscle on the mirror body). The view from behind is unchanged: it is where you see your back and your head.

**Tried first and not kept.**
- The head drawn in place, see-through where it covered the motor areas. The camera looks through the back of your head at whatever the crosshair is on, so a grey-brown smudge sat over the mirror body and the leg areas in the middle of the screen.
- Hiding what is behind a plane square to the line of sight, with a ball around the eye. Looking down then showed the lower ribs, spine and pelvis from behind, as a cut-off trunk.

**Limits.** The camera did not move. The fit that keeps the whole arm in view, with all its checks, is untouched; this is a drawing rule, not a new viewpoint, so it is not literally a camera on the shoulder. Looking down you see your thighs from above and behind, starting at the hip joints, with no pelvis or belly; from real eyes you would also see your chest and belly. The eye point is the atlas's eye reference, not a measured eye.

## 15. Upright windows start

**Found while checking 13 and 14.** In a window taller than it is wide the game did not start. The very first frame was refused (no camera distance shows the whole arm with the hand at its start place), and the page read "NeuroSurge stopped: ns:whole_arm_display: bounded_display_bracket_not_found". The two previews before this one do the same; it starts from a square window upward.

**Cause.** The hand's start place for upright windows, 0.13 of the half width left of the middle, was chosen in round 4, before the camera backed away to show the whole arm. With the whole arm to fit across a narrow view, the hand has to start right of the middle.

**Decision.** The start place is now read from a short table by window shape. The table comes from starting the game at six shapes with six start places each: every shape starts only inside a band (for example 0.15 to 0.20 right of the middle just below square, 0.30 to 0.35 at a phone's 0.46 wide per high), and the table runs through the middle of the bands. If the first frame is still refused, the same frame is offered again with eleven other start places before giving up; this only ever happens before anything has been drawn. If nothing fits, the page now says so in plain words (make the window wider, or turn the phone sideways) and loads again by itself when the window becomes wider than it is tall. Only where the hand starts changed. The fit and every check are untouched.

**Observed.** Of nineteen window sizes, fifteen start: all five wide ones (2560 by 1080 down to 667 by 375) and ten upright ones (360 by 800, 340 by 900, 390 by 844, 412 by 915, 540 by 960, 600 by 1000, 720 by 1280, 768 by 1024, 900 by 1000, 990 by 1000). Four small upright sizes (375 by 667, 320 by 720, 320 by 568, 280 by 653) are refused for every start place and show the message; 375 by 667 turned sideways reloaded by itself and started. The table alone was enough for every size that starts; the second search found nothing more and is kept for shapes not tried. At 720 by 1280 and 390 by 844 a scripted look, reach in all four directions and both views ran without a stop.

**Limits.** An upright window gives a small arm (the camera backs away about 0.7 m) that crosses the middle of the brain, and on a phone-sized upright window the panels cover much of the brain; that layout was not worked on. Touch input is unchanged and unchecked: the game still needs a keyboard and a mouse or trackpad.

## Still not done

- Independent browser review, other browsers, touch, screen readers.
- The shoulder-girdle slide has not been compared with reference images.
- The switched-off floating-face code is still in the renderer.
- Small upright windows (narrower than about 340 pixels or shorter than about 800) cannot start; panels crowd a phone-sized screen in either direction.
- Decisions 13 to 15 were checked by their author only, like the rest.
- `SHA256SUMS` and `release-manifest.json` predate these changes.
