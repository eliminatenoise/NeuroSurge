# NeuroSurge design decisions: interaction update, 10 November 2026

Decisions 13 to 17 were made later the same day, after the user looked at pictures of the build: the brain's outline, what the ordinary view shows of your own body, upright windows, the pause at a look limit, and six defects a second reader found. Decisions 18 and 19 followed: a change of view that froze the game, and sixteen findings from two more readers. Where a later decision changes a number or a statement given earlier in this file, the earlier section says so.

Decisions 20 onward were made on 11 November, after the user's newest notes (eye camera, field of view, start posture, held movements, the strip filling the view, and the work still in progress listed under "What is left").

Decisions 54 onward were made on 12 November, after the user played the build: Space as the one hand key, the R key for information, what each activation shows, a neon flash, gloss, slightly bent limbs, the mirror body in the view over the shoulder, and a second performance pass.

Decisions 59 onward were made later on 12 November, after two more notes from the user: the game has to be much easier to use, and it is a learning tool for people learning motor neuroanatomy. They cover the brain above the mirror body, numbered movements with number keys, the order of the “Try this” guide, legs that reach every hip and knee movement, a card that waits for the look to rest, arrow keys that step along the strip, a shorter Esc page with sentences that teach, the words that name an area, and the frame rates of that build.

This file records what changed in this build, why, and what was actually observed. Where a decision replaces an earlier design instruction, it says which one. Nothing here is a claim about real brains: the signals and movements in the game are simulated and have no units.

## How things were checked

One desktop Chromium, driven by scripted mouse and key events (the same events a keyboard and trackpad send), with browser screenshots, a count of the intervals between animation frames, and the DevTools sampling profiler. The session was held to one processor core, so the browser, its graphics process and the game shared it; the graphics card was the machine's own. Each timing below compares this build with the preceding preview under the same script on the same setup. They are comparisons, not promises about other computers.

Two small programs checked new maths against a reference: the pick tree against testing every triangle with Three.js (4,200 rays, no disagreement, largest distance difference 2e-12), and the written-out matrix product against the earlier loop (3.5 million elements, identical bit for bit).

For decisions 13 to 15 three more scripted checks were used, all with the same ordinary mouse and key events. A closed-loop sweep of the look, 1.5 degrees at a time over 50 degrees to each side and from 12 degrees down to 42 up, reading after every move what the crosshair rests on (so a look the game holds back is seen, not assumed). The game was started at nineteen window sizes. And the last commit before those decisions was served beside the new build and given the same scripts, so "before" figures in 13 to 15 are measured, not remembered.

A fourth check for 13 to 16 computes, outside the browser, which areas a crosshair ray can rest on for a grid of looks, using the game's own framing and gaze code; it gave the same four missing areas as the browser sweep.

The code for 13 to 15 was then read by a second reviewer: another instance of the same model, given only the commit and what it was meant to do, not the author's conclusions. It confirmed the brain maths, the shading uniform, the mirror bound and the shader patches, and reported six defects in the recovery paths and the first-person rule. All six are fixed (see 17). That reading is not the independent review this project requires, which is still to come.

For decisions 18 and 19 the code was read twice more, again by fresh instances of the same model given the code and its purpose but not the author's conclusions: one reading of the frame loop and the input handling, one of the scene, the arrows and the picking code. Their sixteen findings are listed in 19. Four more scripted checks were added. A two-and-a-half-minute run of mixed input. A script that repeats the one input order that froze the game. A free-pointer scan that moves the pointer over each arrow, asks the game which arrow is under it, and compares that with the colour of the same pixel in a screenshot. And a program that compares the pick tree with a test of every triangle for rays that run exactly along an axis from a point exactly on a box face (87,222 rays). These readings are not the independent review either.

Firefox, Safari, touch screens, phones, screen readers and reduced-motion settings were not run. Window sizes were set in desktop Chromium; no phone or tablet was used.

## 1. A frame that cannot be shown no longer stops the game

**Before.** The game checks, every frame, that the whole left arm is in view with the hand exactly on its screen anchor. If a look or a reach asked for a pose that failed the check, the game stopped and asked for a reload. In our script, looking about 40 degrees to one side, or far up or down, stopped the preceding preview.

**Decision.** Keep every check exactly as strict, and change only what happens next. A refused frame is never drawn. The same frame is tried again with less: first without the key push, then with the previous look, then both, then with the arm pulled back toward its start. If nothing is accepted the frame is skipped and its key events wait, so a released Space is never lost. After ten skipped frames in a row the view is also turned back toward the start (decision 16 later removed that wait). Only after 45 does the game put the body, brain and mirror back itself, and only after 150 does it stop with the original error.

**Why.** A game that halts on ordinary input is unusable, and "hold at the edge" is what a player expects from a limit.

**Observed.** A scripted tour of extreme looks, all four reach directions held to their stops, grasp and release at each, the palm turn, and both camera views ran to the end without stopping. It logged 46 refused attempts: eleven frames were completed by one of the fallbacks, and in one place ten frames were skipped before the view turned part of the way back. (This file first said that place was a forward push of the arm at the sideways look limit. Measured step by step for decision 16, it is the fast sweep of the look from the left limit to the right one just before that push.) A line in the status card says when the look or the reach is being held.

**After decisions 13 to 15** (four runs, none stopped): three runs logged 62 to 65 refused attempts, 36 to 39 frames completed by a fallback and none skipped; the fourth logged 53, 10 and the same ten-frame pause as before. The same script on the commit before showed the pause in both of two runs (47 and 49 refused, ten skipped). Nothing in 13 to 15 changes the arm fit; the tour is sensitive to small timing differences, and the pause was still there. Decision 16 removes it.

**Open.** Other input orders may find cases the script did not.

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

**Never block a motor area.** The ribbons are drawn before the motor areas, so an area is always painted over an arrow that shares its pixels, and an area under the pointer takes the click. (Two holes in this rule were found later and closed; see 19.)

**Open.** The left arrow can sit behind the player's arm. The part the arm covers is hidden; the faint copy that used to show through was removed in 19, because it also showed through motor areas. (An earlier version of this file said the top arrow was on screen at 1600 by 900. Measured for 19, its far end was 19 pixels above the top. It has been lowered and is now on screen there.)

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

**Which areas the crosshair can reach.** From straight above, the lowest areas on each side of the brain are seen nearly edge-on. In the look sweep the crosshair rested on 40 of the 44 areas without turning the brain; the tongue area and the lowest in-between area on each side were never under it. The same sweep on the commit before reached 36 (it also missed both lips areas, one eyelid area and one jaw area).

No single view from above shows those four. Computed with the game's own gaze test on a 1-degree grid of looks: forward tilts of 8 to 35 degrees still reach 40 or 41, and so does an eye half or twice as far; the four lie on the side of the brain below its widest outline. Turned 15 degrees to one side (one arrow click) the two on that side come under the crosshair, and at 30 degrees comfortably; in the browser, after a 100-pixel drag, the sweep rested on the right tongue area five times and the lowest right in-between area seven times. The game must not turn the brain by itself when you look (turning is click, hold or drag only, an earlier rule), so instead it says so: while the crosshair is on a face area and the brain has not been turned, a line in the status card says more face areas are round the side and how to turn the brain, and the start page says the same.

**Cost.** The picture has the brain's own proportions only at the start look. Look 40 degrees up or to one side and it is stretched, as any flat picture is when seen at an angle through a wide lens. Before, that stretch was in the start look instead. Carrying the brain with Space and the look keeps its picture square to you (viewed). The motor areas take up a little less of the look range than before, because the close-up had enlarged them: 25% of the sweep's stops were on an area, against 34%.

## 14. In the ordinary view you see only what is in front of your face

**The notes (10 November).** First: "the individual's head is entirely gone … I asked you to get rid of the floating head view on the ceiling when you looked up to the sky, not the whole individual's head and head/face muscles." Then: "Perhaps I'm mistaken. If that's the first person view, then the camera should really be sitting on top of the shoulder and not show the back of the body. Ultimately, your call on everything."

**What was there.** No head or face mesh had been removed: they are loaded, the mirror body shows them, and the view from behind (E) draws them on your own body. But the ordinary view's camera is not at your eyes. To keep the whole left arm in view it backs away along your line of sight: 0.30 m behind the eye point at the start, more for a long reach. From there it saw the back of your own neck, shoulders and trunk across the lower third of the screen, and a neck that ended in a stump, because the head is never drawn around the camera. The two previews before this one show the same picture. With the floating face gone there was no head left in it anywhere.

**Decision.** The ordinary view is a first-person view, so it now draws only what you could see of yourself. A point of your own body is drawn only in front of the upright plane through your eye point that faces the way your body faces. The trunk, neck and right arm fade in from 3 to 15 cm in front of that plane. The legs fade in from 16 to 4 cm behind it, so each thigh shows whole from the hip. The left arm you control is always drawn whole. Your head, neck, shoulders, chest and back lie behind the plane and are not drawn; what is left is your lap, knees and feet, and your right forearm and hand resting in front of you. A part that is not drawn cannot be clicked, and the glow from a motor area goes only to muscles that are drawn (it still goes to every muscle on the mirror body). The view from behind is unchanged: it is where you see your back and your head.

**Tried first and not kept.**
- The head drawn in place, see-through where it covered the motor areas. The camera looks through the back of your head at whatever the crosshair is on, so a grey-brown smudge sat over the mirror body and the leg areas in the middle of the screen.
- Hiding what is behind a plane square to the line of sight, with a ball around the eye. Looking down then showed the lower ribs, spine and pelvis from behind, as a cut-off trunk.
- Bringing the chest and belly in when you look down, by drawing only trunk surfaces that face the eye point. The test knows which way a surface faces but not what hides it, so with the back muscles gone the ribs, spine and shoulder blades under them were drawn: a flayed ribcage seen from behind. Even a perfect test would show little: from a camera above and behind the eyes the chest and belly face away, and only their upper slopes face both the eye and the camera. To see them as your eyes do, the camera has to be at the eyes, which the whole-arm view rules out.

**Limits.** The camera did not move. The fit that keeps the whole arm in view, with all its checks, is untouched; this is a drawing rule, not a new viewpoint, so it is not literally a camera on the shoulder. Looking down you see your thighs from above and behind, starting at the hip joints, with no pelvis or belly; from real eyes you would also see your chest and belly. The eye point is the atlas's eye reference, not a measured eye.

## 15. Upright windows start

**Found while checking 13 and 14.** In a window taller than it is wide the game did not start. The very first frame was refused (no camera distance shows the whole arm with the hand at its start place), and the page read "NeuroSurge stopped: ns:whole_arm_display: bounded_display_bracket_not_found". The two previews before this one do the same; it starts from a square window upward.

**Cause.** The hand's start place for upright windows, 0.13 of the half width left of the middle, was chosen in round 4, before the camera backed away to show the whole arm. With the whole arm to fit across a narrow view, the hand has to start right of the middle.

**Decision.** The start place is now read from a short table by window shape. The table comes from starting the game at six shapes with six start places each: every shape starts only inside a band (for example 0.15 to 0.20 right of the middle just below square, 0.30 to 0.35 at a phone's 0.46 wide per high), and the table runs through the middle of the bands. If the first frame is still refused, the same frame is offered again with eleven other start places before giving up; this only ever happens before anything has been drawn. If nothing fits, the page now says so in plain words (make the window wider, or turn the phone sideways) and loads again by itself when the window becomes wider than it is tall. Only where the hand starts changed. The fit and every check are untouched.

**Observed.** Of nineteen window sizes, fifteen start: all five wide ones (2560 by 1080 down to 667 by 375) and ten upright ones (360 by 800, 340 by 900, 390 by 844, 412 by 915, 540 by 960, 600 by 1000, 720 by 1280, 768 by 1024, 900 by 1000, 990 by 1000). Four small upright sizes (375 by 667, 320 by 720, 320 by 568, 280 by 653) are refused for every start place and show the message; 375 by 667 turned sideways reloaded by itself and started. The table alone was enough for every size that starts; the second search found nothing more and is kept for shapes not tried. At 720 by 1280 and 390 by 844 a scripted look, reach in all four directions and both views ran without a stop.

**Limits.** An upright window gives a small arm (the camera backs away about 0.7 m) that crosses the middle of the brain, and on a phone-sized upright window the panels cover much of the brain; that layout was not worked on. Touch input is unchanged and unchecked: the game still needs a keyboard and a mouse or trackpad.

## 16. No pause when even the last good view cannot be drawn

**What was there.** When a frame was refused and every smaller request was refused too, including the last look that had been shown with the reach back at its start, the game skipped frames: nothing was drawn. Only after ten skipped frames in a row did it turn the view half-way back to the start look. In the stress tour this happened in one place, a fast sweep of the look from the left limit to the right one, and showed as a short freeze.

**Decision.** Do not wait. If the last good view cannot be drawn, turn the view toward the start look in the same frame: a quarter of the way, then half, then all of it, using the first that is accepted.

**Observed.** On a copy of the previous commit, which shows the case in every run: ten skipped frames and 45 refused attempts became no skipped frame and 12 refused attempts, and the view ended a quarter of the way back instead of half. On this build, three more runs of the whole tour skipped no frame; one of them met the case and turned the view a quarter of the way back.

**Limit.** The view still moves without being asked in that case, by less than before. The single frame that works through all the fallbacks is slow (about 0.15 s in the single-core test).

## 17. Six defects found by a second reader, fixed

1. **Pulling the arm back in an upright window.** The recovery pulled the hand toward the wide-window start place, which an upright window cannot show, so those steps would have been refused too. It now pulls toward the start place of the window's own shape.
2. **The reload listener.** The listener that reloads a too-narrow window once it is widened was not registered with the page's other listeners, so stopping the game did not remove it. It is now, and it does nothing after a stop.
3. **Changing the window size before touching the keys.** A start place found by the second search was dropped on any size change, and the search could not run again. The first picture of a new size may now search again, trying the old place first; after a picture has been shown at a size there is no further search, so the hand never jumps during play. Checked by resizing 720 by 1280 to 700 by 1280, 420 by 900, 1280 by 720 and back during play: no refused frame.
4. **The first-person rule in builds without the whole-arm camera.** Pressing E there switched the rule on for the first frames of the change of view, so the trunk vanished and faded back. The rule now fades from what it was in the ordinary view; where it was off it stays off. (The preview always has the whole-arm camera, so this could not be seen in it.)
5. **Clicking a muscle that wraps round the body.** The fast pick returns only the nearest hit of each mesh. If that hit was on a hidden part, a drawn part of the same mesh farther along the ray was missed. For such a mesh every hit is now asked for, and the first drawn one is used.
6. **The wrong message.** Every stop of the whole-arm display said the window was too narrow, including a stop in the middle of a game in a wide window. Only the first picture of an upright window refused for want of a camera distance says so now; other stops say the arm could not be shown and to reload. The second search also runs only for that reason.

Not acted on: where your own body fades in (a band of about 12 cm), a half-faded surface still hides whatever of your body lies behind it, so the background shows through instead. It is at the edge of the lap and was left.

## 18. A change of view that cannot be drawn is undone, not waited for

**What was there.** E moves the camera between your own eyes and the view from behind. On the way, the camera backs off along the line from eye to hand, and an existing check refuses a path that passes too close to your own body. With the look about 15 degrees to the right and 18 up and the hand pulled back toward the body, every step of the move was refused. The recovery in 1 could not help: it offers a smaller look or reach, and neither was the cause. The game skipped 45 frames, about three quarters of a second of frozen picture, then reset the body, the brain view and the look by itself. A two-and-a-half-minute run of mixed input met this once: one press of E, 270 refused attempts.

**Decision.** When a change of view is under way and its next camera place is refused, the first thing tried is to undo the change: draw from the last camera that was shown and head back to the view it came from. A line in the status card says so for six seconds and says what to do: push the hand forward a little or look back toward the middle, then press E again. The check itself is unchanged.

**Observed.** The script that repeats the failing input, on this build: one refused attempt, no skipped frame, no reset, the longest frame 33 ms, and the line shown. From that pose a short tap of W (hand depth 0.22 to 0.25) lets E through, and so does looking down by about 11 degrees. E works from the start pose, with that look alone, and with the hand pulled back alone; only the two together were refused. The long run on this build: 8,706 frames, 72 refused attempts, no skipped frame.

**Limit.** From that pose the view from behind is still not available until you move. Other poses with the same refusal may exist; they get the same line.

## 19. Sixteen findings from two more readers

**Frame loop and input: ten findings, all acted on.**
1. **Skipped frames sped up a change of view.** A skipped frame kept the camera's progress toward the other view, and each skip added a longer time step. The camera now goes back to where the frame found it, and the press of E is asked again on the next frame.
2. **Drag movement was lost on a skipped frame.** It is carried to the next frame.
3. **Presses replayed after a pause.** Clicks and Space presses waiting from skipped frames were delivered at once on resume: a stray click mark, or two presses read as a double tap. A pause now drops them. A waiting Space release is kept, so a fist is never left closed.
4. **The rescue could be missed.** The reset after a long run of skipped frames was tied to one exact count, in one of the two places that count. It now runs once per run from either place, and it also keeps a waiting Space release.
5. **One check stopped the game.** Giving the scene the brain's new place runs a camera-range check. Its refusal was not caught and ended the game. It is now handled like the other refusals that come after the step.
6. **The wrong "last good look".** After a frozen frame the stored look was the controls' look, not the one drawn. It is now the look that was drawn.
7. **"Look held" shown without cause.** A frame saved by pulling the arm back, with no turn and no key pressed, was recorded as a look or reach limit. A limit is now learned only where the player was turning or pushing.
8. **A muscle-click line that was not true.** With the fist closed, a click on a finger muscle said its area was switched on although the fist held it back. The line is shown only if that step switched the area on.
9. **Two drag faults.** A second mouse button pressed during a drag started the gesture again, so letting go gave a click on top of the turn. A release outside the page left the drag armed, so the next press was delivered twice or turned the brain instead of the look. A second button is now ignored, and a move with no button down ends the drag.
10. **Every error was treated as a display limit.** The recovery caught all errors, so a defect in the code would have shown as a held look and a two-and-a-half-second freeze before the game stopped. A TypeError, ReferenceError or RangeError now stops the game at once with its own message, as every error did before this update. None occurred in the runs listed below.

**Scene, arrows and picking: six findings and one borderline case, all acted on.**
1. **An arrow could take the click over a motor area.** The test for "a motor area is under the pointer" looked for a corner point of the area's mesh near the pointer. Inside a large triangle there is none. The exact question is now asked as well: does the ray through the pointer hit a drawn motor-area triangle? @@B1@@
2. **The faint copy of an arrow showed through motor areas.** The copy was drawn wherever anything nearer hid the arrow. It was meant for your arm, but a motor area in front of an arrow is nearer too, so the copy laid a faint veil over it. The copy is gone. Where your arm covers an arrow, that part of the arrow is now hidden.
3. **Arrows in the wrong place after resizing a turned brain.** The arrows are placed round the motor band as it lies when the brain is not turned, and that box was measured only while the brain was not turned. Resize the window with the brain turned and the old box was kept. It is now measured through the brain's un-turned placement, which is known at every turn. @@B3@@
4. **The pick tree could miss a hit.** For a ray running exactly along an axis from a point exactly on a box face, the box test multiplied zero by infinity and could skip the box that held the hit. Such a ray is now handled on its own. On 87,222 such rays over a test mesh the earlier code disagreed with a test of every triangle 19,929 times; this build never does. In play a ray almost never lies exactly on an axis.
5. **A hidden memory in the shading maths.** The function that computes surface directions remembered, per list of triangles, which points share a position. Two meshes with the same triangle list would have shared that memory. The caller now passes the memory in; the game keeps one per arm muscle.
6. **A stored answer could be returned for a different question.** The whole-arm check stores answers under every number it reads. A missing number was stored as minus infinity, the same as a real minus infinity. Which numbers are present is now part of the key, and a number that is not finite is never stored.
7. **The top arrow ran off the top of the screen** (borderline). Its far end was 19 pixels above the top at 1600 by 900. Seen from the reference eye at the start look, the arrow is now lowered by what it overshoots, but never nearer the motor areas than the one gap the other three arrows keep. Measured at nine window sizes from 800 by 600 to 2560 by 1080 and two upright ones: all four brain arrows are wholly on screen at every one. The top arrow's tail now overlaps the mirror body's small top arrow more than before; that arrow cannot be used until the brain is moved aside in any case, and then the brain's arrows move away with it.

**Checked after these changes.** The stress tour twice (13 and 60 refused attempts, none skipped, no stop). The long run in 18. The drag, muscle-click, resize, rotate and first-person scripts, with the same results as before. Frame rates 60, 40, 56 and 41 in the four scenes of 2, so the two extra tests per pick cost nothing measurable.

**Limit.** These are again readings by the same model that wrote the code, and scripted checks by the author.

## 20. The camera sits at your eyes; your own body is always solid (11 November)

**The note.** "Transparency effects should not be applied to your body when the glass brain is overlapping or near, it makes no sense. ... It's still weird how there's a floating arm with invisible body parts. No invisible or transparent body parts. Our solution is for the first person camera view to be from the person's eyes / between them (though the eyes will be locked to always looking forward."

**Decision.** This replaces decision 14's camera. The preview page now loads its own launcher, `scene/example/eye-view-r558.mjs`, whose camera sits at the atlas-derived eye point, with no backed-off camera and no whole-arm display rule. `OWN_BODY_SOLID` in the renderer switches off every see-through effect on your own body: the window at the crosshair, the look-down translucency, the window over the brain outline and the first-person plane rule. The body is opaque; the glass brain blends over it where the brain is nearer.

**Limit.** Meshes within 0.12 m of the eye (the head and face) are not drawn around the camera in first person, because the camera is inside them. They are on the mirror body and on your own body in the view from behind (E). The earlier launcher, `display-b-r388`, is unchanged on its own page.

## 21. Field of view: 120, then 90 degrees

**The notes.** "1st person view should have extremely wide field of view." Later: "Yes there is a very high fov, but ensure it is not absurd, leading to absurd optical perspective effects."

**Decision.** First 120 degrees vertical (about 144 across at 16:9), the widest the source bounds allow. After the second note: 90 degrees vertical, about 121 across at 16:9. That is at the top of ordinary game settings. At the edge of a 144-degree picture a small object is drawn about ten times wider than at the centre; at 121 degrees about four times. The launcher's boot checks name the new value.

## 22. Start posture: sitting, every limb straight forward like a stick

**The notes, in order.** "Let's also start with the limbs fully straight out at the start." Then: "when I said the limbs should be out straight I meant out straight forward front facing." "If we imagine an invisible ground, the mirror body should be touching the same ground. The ground is flat and has no incline or decline whatsoever." "The knees/thighs of the legs should not be so close together." Last: "Let's have all the limbs straight out like a stick (perpendicular from the torso), instead of the suggestive spread eagle pose you currently have them it."

**What was tried.** First a standing star: legs 20 degrees apart, the right arm out to the side (commit be2308f). After "forward": sitting, legs forward and 30 degrees apart (3204d5b). After "like a stick": the posture below (3d49cc9).

**Decision.** `BODY_POSTURES.open` (the default): you sit upright on an invisible flat ground. Both legs lie straight out in front, at right angles to the trunk (hips flexed 90 degrees, knees straight). Both arms point straight forward at shoulder height. The right shoulder is flexed 90 degrees with the elbow straight and the palm down, the same palm-down turn as the left game arm. The left game arm reaches forward toward the look point. Each hip is abducted only 6 degrees. In the source pose the thighs slope inward to the knees; 6 degrees makes them run parallel, so the knees stay about a hip width apart without any spread. No chair or floor is drawn.

**Limits.** Hip flexion of 90 degrees with a straight knee is at the end of the usual straight-leg range. Pushing a thigh back or bending a knee swings that leg down through the invisible ground; the ground is not a collision surface for your own limbs.

## 23. A movement stays until the opposing movement or a reset; the opposing area glows faintly

**The note.** "Limbs do not return to previous position are muscle or brain activation to be clear, they need to be activated back into previous position or the whole thing reset. Maybe faintly highlight the opposing area on the brain to reset after brain activation. Same for (opposing) muscle as well? Agonist vs antagonist principles for brain and body?"

**Decision (ns-actions, ns-bodymap, ns-body, ns-app, ns-scene-three).**
- An activation moves its joints to the end of their range, and they stay there. Before this they eased back to rest after the one-second pulse. A joint comes back only when the opposing action is activated (knee straighten after knee bend) or Reset body is pressed. This applies to every body joint with an opposing pair of actions and to the left arm's opposing actions (`ARM_OPPOSITES`, for example elbow flexion and extension). Face display actions (brow, eyes, lips, smile) have no opposing pair and stay momentary. A weaker action on the same side never eases a held joint back.
- The joints jump with a quick spring (`JOINT_LATCH`: omega 26 per second, damping 0.55, so with a small overshoot). Under prefers-reduced-motion the spring has no overshoot and the arm eases more slowly.
- **The look rests before it moves anything.** The strip now fills the view, so the crosshair crosses many areas while you look around. A look therefore moves joints only after resting 0.3 seconds on an area (`GAZE_DWELL.latchS`). The glow starts at once, and a click moves at once. Without this, one sweep of the look latched every area it crossed (measured in the first test: ten held actions from one sweep).
- **Hints.** While a joint is held, the opposing action's own part of its area on the brain glows faintly: pale additive light (`REGION_HINT`). That part is chosen by the same rule the look uses to pick an action inside an area. When the action has no part of its own, or its part is under eight triangles, the whole area glows. The opposing action's muscles glow faintly on your own body and on the mirror body (hint level 0.22). A hint is never picked; the area under it keeps its picking.
- Each action's end angle is now an absolute angle, not an offset from the posture. The pose is the activity's held angles laid over the start posture, so Reset returns exactly to the start.
- When the trunk bends, the chest, head (and so the eye camera) and both shoulders stay where they are, and the pelvis and legs swing instead (`holdChest`), so a trunk bend does not throw the view.
- The right shoulder turns about its sideways axis after the forward axis. With the arm straight forward, "swing out to the side" is then a horizontal swing, not a twist about the arm's own length. Right-shoulder actions: raise up (flexion 160), swing down and back (-45), swing out to the side (horizontal abduction 120, about 30 degrees behind the side line), swing in to the front (0). Lifting a thigh ends at the joint's 100-degree limit.

**Checked.** In the browser, rest the look on the right-knee area: the knee bent to -135 degrees and stayed bent after the look moved away. The straighten part of the knee area glowed faintly (57 triangles), and so did the thigh muscles that straighten it. The straighten action brought the knee back. Reset body cleared every held joint and every hint. 60 frames per second with hints shown.

**Limits.** This rule belongs to the game, not to physiology. With the neck held turned, the view stays turned; how the look and a held neck combine is being reworked with the head-and-neck look. Pushing a thigh back or bending a knee from the sitting posture moves the leg through the invisible ground (22).

## 24. The motor strip fills the view; the labels match on both sides

*Changed on 12 November: the strip now spans about half the width of the view (section 55).*

**The notes.** "The primary motor cortex strip / motor homunculus should take up the entire view from top to bottom of screen and left to right of screen." "Motor strip again should take up entire panorama left to right so there is more cursor area for fine motor control." "Brain labels should be a little more transparent and match on both sides."

**Decision.** At the start, the whole brain is brought nearer and scaled uniformly, so the strip's true shape fits the whole view with a 1.5 % side margin. The strip is never moved or reshaped on the brain. The far-eye picture is flatter: perspective factor 20, after 6, 12 and 16 were tried and cut off or hid the lateral areas. At 1600 by 900 (at 120 degrees) the strip covered 97 % of the width and 90 % of the height; before, 27 % by 24 %. Very wide windows (2560 by 1080) are limited by height. Labels are lighter (fill 0.62 to 0.46, edge 0.32 to 0.26, arm labels 0.92 to 0.72) and come in mirrored pairs about the strip's middle; a pair is dropped together, never one side alone. The info panel became a corner card, and the colour key folds behind key I in landscape.

**Look-angle gain (at 120 degrees).** The median area grew from about 4.8 to about 7.3 degrees on its smaller side. The narrowest slivers at the outer lower ends stay under 1 degree wide. The field of view is now 90 degrees (21); the strip still fills the view.

**Limits.** The four brain turn arrows were placed by a compact "rose" rule; that is being replaced (Message 7: V-shaped tips at the centres of the strip's 16:9 frame).

## 25. Issue hunt fixes: the look really moves the body; legs stay on the ground; both arms start forward

**How found.** Three fresh reviewers (what the player sees, controls and text, code) went over the committed build. They are other instances of the same model, given the build and the user's notes but not the author's conclusions.

**Fixed.**
- **The look delay was cancelled by any small mouse movement.** A tiny movement inside an area counted as a restart and dropped the waiting movement, so in real play a look almost never moved the body. A small movement now keeps the delay running. A waiting look is dropped while paused or while the brain is held.
- **Legs went through the invisible ground.** `groundLegAngles` in ns-body now keeps each leg on or above the ground. A knee bend slides the heel along the ground and the thigh rises: the heel's height is T sin(t) + L sin(t - k), solved for the thigh rise t. That goes up to the hip's 110-degree display cap, where the knee stops at about 41 degrees. Hip extension now ends at the ground (90) instead of swinging the leg into it. *Replaced on 12 November: section 61 retires this ground rule, because it left knee bends and hip extension out of reach.*
- **The left game arm pointed up and inward.** The hand was pinned three quarters up the screen (the older R10 design). It now sits where a straight, level, forward arm puts it at the start look (screen position -0.17, -0.28 at 90 degrees). Both arms start straight forward as mirror images, and the arm no longer hides the right-arm motor areas.
- **An area's actions were split over its wider display extent.** Some actions lay almost entirely in the neighbouring areas: "Raise right arm up" could never be picked by looking, and "Bend head forward" had 3 % of its area. The split is now over each area's own core (its non-overlapping control cell), so each action gets an equal share.
- The hint now fades softly at its edge instead of showing a sawtooth of triangles. The words say a look must rest about a third of a second, and that a movement stays until the opposite area or Reset. An info line says "already there, so nothing moves now". The Esc-page notice no longer pushes the buttons out from under the pointer. Texts that described the old arm and the old field of view were corrected.

## 26. The motor strip on the atlas's own hand knob

**The note.** "Make sure your primary motor cortex strip / motor cortex is as accurately placed as possible."

**What was checked.** The strip is the atlas's own precentral gyrus in both hemispheres (BodyParts3D FJ1801 and FJ1800). It is drawn with exactly the glass brain's transform, with no offset or scale. In every 1 mm column seen from above, it lies behind the frontal gyri and in front of the postcentral gyrus. It continues onto the medial wall for the foot areas. Left and right are correct, and each hemisphere drives the opposite side.

**Fixed.** The hand areas sat about 8.5 mm to the side of the hand knob, the backward bulge of the central sulcus, at a lateral distance of 29 mm on the right and 28 mm on the left. A monotone remap of the area centres now puts the hand centre on the knob, and the face areas run down the side of the brain. An independent checker found the knob with a different method and agreed within 1 mm.

**Open.** The lowest 9 to 15 mm next to the Sylvian fissure folds back, so the order there is reversed. An along-the-gyrus coordinate to fix this is being built.

## 27. The mirror body is a literal reflection on the same ground

**The notes.** "The mirror body should literally be a 1:1 perpendicular perfect reflection and it needs to be coming from the exact same reflection angle at the beginning until manipulated." "If we imagine an invisible ground, the mirror body should be touching the same ground. The ground is flat and has no incline or decline whatsoever. The arm placement and shoulder extension from the mirror often does not match your own, with the mirror's arm being much much higher."

**Decision.** At the start, and after a reset, the mirror body is the exact image of the own body in a vertical plane 5 cm beyond the foremost drawn point (0.85 m from the eye). The largest matrix difference from a pure reflection is 0; the determinant is -1 and the scale exactly 1. The lowest points of both bodies are at the same height to 0.0 mm through turns, pushes and carries, and the mirror is never tilted. Its top and bottom arrows and up/down drags slide it along the ground rather than tipping it. Its placement no longer depends on the brain. (Changed in 73: the top and bottom arrows and up/down drags now tilt it, and only when the player asks.)

**The arm.** The mirror arm matched the drawn arm to 0.0 mm. The "much higher" arm was the drawn left arm itself, pinned high on the screen; that is fixed in 25.

**Limits.** A literal reflection has its head at eye level, so it fills about 45 % of the view height when looking straight ahead; looking down about 17 degrees centres it. At the start it covers the strip's leg and foot areas; the start arrangement is being reworked (Message 12).

## 28. Muscle layers: the radial stack, chosen by three judges

**The notes.** Message 1 (a Body Worlds stack, no transparency on muscles and bones), 7 (all groups, not weird), 8 (translucent outer layers if the stack cannot be made to look good), 9 (full muscles), and later 18 (anatomical realism, not a bodybuilder look).

**What was compared.** Two builders made competing designs. One was the radial lift with anchored ends plus a display fill, covering all 181 body and face muscles and all 45 arm muscles. The other had no lift and a translucent outer layer. Three independent judges (the user's words, anatomy, game art) scored both from the same six views and their own close-ups. They agreed on the lift: 47, 44 and 47 points of 70, against 33, 30 and 43. The translucent layer showed the ribs through the chest, against "no transparency effects to muscles and bones", and read thinner.

**Kept from the alternative.** Its classification of all 226 muscles as outer or deeper, and a slightly darker solid shade for deeper muscles. Both are being added.

**Limits.** The packet has no latissimus dorsi, erector spinae, rectus abdominis, gracilis, adductor longus, tensor fasciae latae or fibularis longus. The lower back and the inner thigh therefore have no stack. Nothing is invented for them. Muscle shape realism and the muscle look are being reworked after Message 18.

## 29. One colour per motor area; a vivid glow, the same on all three

**The notes.** "We want to make the glow look like an optogenetic glow activation but with different colors/shades for each are with the same corresponding color/shade across all 3 items for clarity." "All the connective lines might get a little confusing, you'll need a fix." "We want clear fluorescent glow correspondence across all 3 systems during activation."

**Decision.**
- **Colours.** Each of the 44 areas has its own colour: blues for the left arm, oranges for the right arm, purples for the left leg, yellows for the right leg, greens for the trunk, pinks for the face and neck, and grey for the in-between areas. Neighbours alternate light and dark shades. Separation was checked under simulated colour blindness: mirrored limb areas are at least 0.168 apart in OKLab, neighbours at least 0.052.
- **Glow.** An active area and the muscles it drives glow in that colour on the own body and the mirror body; on a shared muscle the stronger drive wins. The glow colour is made vivid (60 % of its white removed), resting tints are calm (half the identity colour in the tissue pink), and the lit area is brighter, so the active one stands out at a glance.
- **Lines.** The fan of connecting lines is replaced by at most one short line per newly lit area, in its colour, fading after about a second.

## 30. Arrows: V tips at the middle of each side of two frames

**The note.** "Let's just make all the arrows basic v-shaped arrow tips ... think of the motor strip as a horizontal 16:9 frame and the mirror as a vertical 9:16 frame, the arrows will be at the centered edges of each frame perimeter side."

**Decision.** Each arrow is a chevron: grey-white for the brain, green for the mirror body. The brain's four sit at the middle of each side of the smallest 16:9 rectangle around the strip at rest. The mirror's four sit at the middle of each side of the smallest 9:16 rectangle around its on-screen box. A tip wins the click wherever it is drawn, the tips stay put when tapped, and the click that captures the mouse does nothing else. The ribbon arrows and the compass rose are gone. They are being made solid 3D chevrons, tilted with the point away and the tails near (Message 19).

## 31. The Space dance of all four limbs

*Changed on 12 November: Space is the hand key again, and the dance is the limb turn on a double tap (section 54).*

**The note.** "Holding the space bar now more slowly shifts pronation/supination / external/internal rotation and between continuously like in a dance (think opening and closing up the body/limbs) simultaneously among all 4 limbs (though not coordinatively ...). The current rotational direction of each limb's rotation depends on previous actions. Same for double space bar which more quickly affects all limbs again ... Make sure feet are spread far enough that they do not overlap during simultaneous internal rotation."

**Decision.**
- **Hold Space.** Each limb opens and closes between pronation with internal rotation and supination with external rotation, all of its joints together. The limbs are the forearm turns, the shoulder rotations (a new right-shoulder joint) and the hip rotations (new joints).
- **History and tempo.** A limb carries on the way it last moved, whatever moved it, and turns at its range ends. Each limb has its own tempo (1.00, 1.27, 0.86, 1.13), so the limbs are not coordinated.
- **Speed and release.** A full stroke takes 2.6 s held and 1.0 s after a double-tap and hold. Released, the limbs stay where they are.
- **Ranges.** Forearm 80 each way from thumb-up; shoulder 70 internal and 90 external; hip 40 internal and 45 external.
- **Feet.** With the legs side by side the feet never come close (82.6 mm at full internal rotation). With the knees bent, external rotation is limited at run time to keep a 20 mm bone gap. The legs are never spread.
- **Space's old roles.** Space no longer makes a fist, flips the palm or grabs; the grab moves to F. (Changed again on 12 November: section 54.)
- **Start posture.** The right forearm now starts fully palm down, like the left.

**Limit.** Shoulder and hip rotation have no area of their own yet, so after a dance only another dance or Reset brings them back.

## 32. The mouse turns your head; violent jerks; the same in third person

**The notes.** "The cursor now will control head/neck movement with corresponding activity on the brain and mirror body ... if you look towards the head/neck motor areas of the glass brain, the head/neck will jerk accordingly ... a violent jerking movement, not a graceful shift." Also the third-person questions in Message 2, and "Ensure things are consistently sized across 1st/3rd person."

**Decision.**
- **Range.** The look drives the neck: 70 degrees of turn, 45 of nod either way. Past that, the chest turns up to 40 and the trunk bends from the pelvis up to 35 forward and 25 back. Overall that is 110 degrees to either side, 80 down and 70 up, with the legs on the ground.
- **Camera.** The camera rides at the posed eye, with the eyes fixed forward in the head (head roll 0.000).
- **Glow.** The neck and trunk areas and their muscles glow in proportion to the turn and bend.
- **Held neck or trunk actions.** They add to the look, clamped to the range, with any overflow passed on to the chest or trunk. Reset body also turns the head back.
- **The jerk.** The joint spring went from 26 to 50 per second, with damping 0.35 and a 0.4 rebound off the end stop that never passes it. It reaches a 70-degree end in 3 frames at 60 Hz (before: 6 frames) and recoils about 5 degrees. The left arm's ease went from 0.045 to 0.022 s. Under reduced motion there is no overshoot.
- **Third person.** It uses the same mapping and only moves the camera, behind and above the head. Brain, mirror and own body keep exactly the same size and place.

**Limit.** From behind, the inside of the facial skull shows: the packet has no parietal or occipital bones and no muscles at the back of the neck.

## 33. Grasp with F, move, click your own body, drag to turn; nothing passes through anything

*Changed on 12 November: the F key is gone; Space takes hold (section 54).*

**The notes.** Message 2 asks for all three items to be handled with all the control keys: W/A/S/D move a grasped limb, brain or mirror body, clicking activates whatever it hits including your own body, and click-and-drag "shifts orbit or external/internal rotation". Message 12: "Ensure that your body, the brain and the mirror do not touch or collide ... they can be moved to and around each other but not through."

**Decision (control scheme).**
- **Hold F** grasps the item under the crosshair: one of your limbs, the brain or the mirror body. While F is held, W/A/S/D move it and the look carries it; the mirror body stays on the ground. Letting go of F leaves it where it is.
- **A held limb** moves its end (hand or foot) with a small solve over its joints, inside their ranges. The matching brain areas light, and the mirror body copies it.
- **Click** activates what is under the crosshair: a motor area, a mirror-body muscle, or now one of your own muscles.
- **Press and drag** turns the brain or the mirror about its centre. On one of your limbs it turns the limb about its long axis (hip or shoulder rotation, forearm turn).
- **Space** no longer grabs.

**Collisions.** Each item is covered by spheres built from its drawn meshes (20 mm cells, 4 mm for the brain). Every move or turn of an item stops 2 cm short of contact, and so do joint-driven body moves: held, latched and danced. The mirror's reflection plane also clears the left hand's full reach and that reach's image.

**Measured.** Pulling the mirror with F and S stopped its feet 0.020 m from yours. Pulling the brain in brought it from 4.7 m to 2.3 m without contact.

**Performance.** The checks first cost the Space dance half its frame rate (60 to 27 fps). Rewriting the gap search into exact squared comparisons with pair pruning, and reusing unchanged collision entries, brought it back to about 47 fps. The gap search returned identical results on 900 random cases. More work toward 60 is under way.

**Limits.** At the start the literal mirror image covers two of the strip's foot and ankle areas from the look; sliding the mirror back (since 73: carrying it back) or turning the brain reveals them. Moving either by default would break the literal reflection or the full-width strip. The fixes from the second issue hunt are listed in 39.

## 34. More activation points, symmetric, with full ranges

**The notes.** Message 14: "Ensure there are as many activation points across the motor strip and muscles as possible and that they are as detailed as possible." Message 15: "Ensure anatomical symmetry across systems except where inappropriate." Message 2: every movement to its maximum anatomically feasible range, never beyond.

**Decision.**
- **Areas.** Each hemisphere now carries the same 27 areas, 54 in all (before: 44). There are separate little, ring, middle, index and thumb areas for both hands, plus nose and throat areas.
- **Actions.** Each action has absolute end angles, agonists and antagonists, and an opposite for the latch. New ones: big toe and small toes separately, ankle inversion and eversion, hip abduction, trunk side bend and turn, neck side bend, wrist radial and ulnar deviation, each finger, thumb opposition, finger spread, and face actions (brow, eyelids, nose, lips, mouth corners, jaw shift, swallow). The face joints are signed, so each has an opposite.
- **Ranges** follow adult active norms: shoulder flexion 180, extension 60, horizontal abduction 135; hip flexion up to 120 with the knee bent, coupled to the knee; trunk flexion 80; neck 50 / 60 / 80; wrist deviation 20 / 30; finger MCP 90. The only display cap kept is the documented 110-degree thigh/belly limit.
- **Right hand.** It is skinned per vertex, so a bent finger's tendons follow it.
- **Muscles.** 171 of 175 body and face muscles are the mover of at least one action.

**Limits.**
- The left game arm stops short of the norms in places (finger extension, DIP, wrist), and its side bends are display only.
- The left shoulder and the tongue have no actions.
- The marker dots exist only for the movement map's 12 left-arm actions.

## 35. The strip's areas follow the gyrus

**The note.** "Make sure your primary motor cortex strip / motor cortex is as accurately placed as possible."

**Decision.** The main strip of each hemisphere uses an along-the-gyrus coordinate instead of the medial-lateral fraction. It is a harmonic field on the welded precentral mesh: 0 at the medial-wall edge, 1 at the tip next to the Sylvian fissure. It is solved by conjugate gradients at load, in about 30 to 120 ms per hemisphere.

**Result.**
- Seen from either side, the face areas run in Penfield order to the bottom: neck, brow, eyelid, lower face, lips, jaw, tongue, swallowing. Before, the bottom 15 mm folded back. Out-of-order pixels from 14 viewing directions are now 0 % (before: up to 40 %).
- The bands cross the gyrus.
- The hand stays on the hand knob.
- Picking for the left-arm dots now uses the map's own action positions.

**Crest.** Pinning the coordinate on the medial wall pushed the toes band onto the dorsal crest (824 mm2). On the outer strip, values below the trunk end are now squeezed into the ankle-to-trunk range with a power curve (exponent 0.56). The toes are back on the medial wall (5 to 8 mm2 left on the crest). Ankle, knee and hip share the crest at about 470, 390 and 280 mm2 per hemisphere.

## 36. Clean motor-area bands, clean glass

**The notes.** Message 18: "Transparency effects too. We should be able to easily differentiate each brain node and muscle node from each other."

**Decision.**
- **Bands.** More than half of the strip's triangles span two or more areas, which gave sawtooth borders and a patchwork of flat triangles. Each area is now drawn per pixel from the interpolated strip coordinate against the segmentation's own owner rule. A thin seam separates areas of one body part, a light line separates body parts, and the hovered and switched-on areas have inner outlines.
- **Shading.** Normals are smoothed over the whole strip, and the areas darken softly into their sulci.
- **Picking.** It follows the same per-point rule: 19,993 of 19,993 test rays pick the area that is drawn, against 86.9 % before.
- **Hint.** The opposite-area hint is drawn by the area itself.
- **Glass.** The glass clears next to the strip (zero at 7 mm), so the area colours are not veiled.

## 37. Muscle shapes and the muscle look: anatomical realism

**The note.** Message 18: "The muscles still need considerable work. We are going for anatomical realism and accuracy. It doesn't necessarily have to have a bodybuilder look ... visceral and fleshy but never disgusting."

**Shapes.**
- **Gaps and fill.** Lift gaps (trunk 16, thigh 20, upper arm 12, forearm 8 mm and so on) and the display fill (about 1 mm) are reduced to natural proportions. Tissue over bone is now near the atlas: chest 42 mm against the atlas's 35 (was 55), deltoid 33 against 29 (was 47).
- **Per-muscle rules.** The deltoid lifts gently. The pectoralis major is hinged off the sternum and highest at its lower outer border. The external oblique's sculpted six-pack relief is shaved, since the packet has no rectus abdominis. The sternocleidomastoid is held to the neck gap.
- **No poke-through.** Deeper muscles never push out through the muscle lying on them.
- **Classification.** All 226 muscles are classified outer, intermediate or deep, from the catalogue plus the merged supplement tables, each row with its basis.

**Look.**
- **Tones.** Six natural muscle tones, warm rose to brownish red, are assigned so that touching muscles differ.
- **Ends.** Pearly white tendon and aponeurosis ends appear where the stack pins muscles to bone. This is a geometric estimate.
- **Surface.** Faint fibre streaks run along each muscle in near views, with a warm tissue scatter and a soft crease toward each muscle's outline.
- **Shades.** Deeper muscles are drawn slightly darker (x0.78 deep, x0.9 intermediate), and bones are ivory.
- **Glow.** The activation glow is unchanged.

**Limits.** The packet has no latissimus dorsi, erector spinae, rectus abdominis, gracilis, adductor longus, tensor fasciae latae or fibularis longus. The lower back and inner thigh have no stack, and the Escape page says so. The left forearm's skinning at the elbow is being fixed.

## 38. Arrows: solid 3D chevrons, point away, tails near

**The note.** Message 19: "Let's make the arrows 3d and slightly chunky, with their vertex heads turning (further) away and their tail ends towards (closer)."

**Decision.** Each arrow is the same V, extruded to about 0.6 of its stroke width with soft bevels and tilted 40 degrees, so its point is farther than its open ends. It is lit with a key light and a rim, and its far point is slightly dimmer. Inside a tip, back faces are culled and triangles are drawn far to near, so a tip never blends over itself. The hit shapes are re-fitted. The arrows stay at the frame side midpoints and stay put on taps, and the click that captures the mouse acts on nothing.

**Limit.** The smaller mirror tips show only about 3 px of wall.

## 39. Game engine: stay on Three.js and add free tools

**The note.** Message 20: "Strongly strongly strongly consider downloading a free game engine to help. The final game will be an open source demo that will not be monetized. You whatever free tools open to you." Message 23: "Continue downloading and using whatever free software that can benefit."

**Decision.** The game stays on Three.js r170. It is already a free, MIT-licensed web engine, and every part of the game is built on it. Moving to another engine would mean rebuilding the scene, picking, skinning, collisions and interface before any visible gain. Instead, free tools are added where they help:
- Three.js's own add-ons from the same version.
- MIT, BSD or Apache JavaScript libraries.
- Freely licensed anatomy (CC0, CC BY, or CC BY-SA with share-alike kept).
- GPL tools such as Blender, used offline only.

**Rules.** Each tool is pinned to an exact version and vendored under `vendor/` with its licence. It gets a line in the credits, and nothing loads from a CDN at run time, so the game stays static-hostable and the launchers keep working offline. Any processed anatomy mesh is a documented derivative, and raw packets are never edited.

## 40. Forearms turn without plates at the elbow

**The note.** Message 20: "The arm and face muscles look the most wrong and disgusting." Message 21: "The arm especially has bits coming out at the elbow joint."

**Cause.** Each forearm muscle followed one of three rigid frames (upper arm, forearm, hand). When the forearm turned, neighbouring triangles took different frames, so plates stuck out at the elbow, worst with the palm down. That is the start pose.

**Decision.** Both forearms are now skinned per vertex: each point blends the three frames along the forearm, so the twist spreads over its length. The left game arm and the right body arm use the same rule. Simplified copies at Low quality no longer show dark flecks.

**Check.** An offline measure that does not use the skin weights compares the old and new arms at poses captured from the game. At the start pose the stretched edges go from 123 to 0, and the flipped area from 9711 to 2831 mm². Palm up and palm down, straight and bent, and the dance were also compared in pictures.

**Limits.**
- The inner-elbow crease still folds at strong flexion (above about 120 degrees). That fold is a bending problem, not a twist problem.
- The extra per-vertex work slowed the Space dance. The performance work in section 42 covers it.

## 41. Second issue hunt: third person over the shoulder, status lines that tell the truth

**The note.** The user's standing order is to find and fix issues without asking. A second hunt by three fresh readers (controls and words, look, code) listed 9 control and wording faults. A separate fixer and checker pair then made 12 changes.

**Decisions.**
- **Third person.** The camera now sits over your right shoulder, so the mirror body is in view beside your head. Before, it hid behind your back while its arrows sat on your body and caught the first click.
- **Arrow tips.** A tip is drawn and clickable only where its target can be seen and your body is not in front of it. In a portrait window the mirror's tips frame the part of it that shows.
- **Looking-at line.** The line names what a click would do: an area, a muscle or bone on either body, or an arrow tip. Muscle and bone names are the atlas names.
- **Info card.** The card marks an area as the last one you looked at once you look away, with its current signal. The card for an area whose movement is already at its end says so ("already there, so nothing moves now").
- **Notes and the guide.** A note about a tapped bone clears on the next click. The guide counts a carry of the brain with W/A/S/D, and counts a left-arm move only when the arm really moved.
- **Lean trunk back.** As a stopgap this movement drove the buttock muscles (its list also named the latissimus dorsi, which the packet then lacked); since section 53 it drives the real erector spinae.
- **Hints and tendons.** Muscle hints are a thin clean rim. Tendon white fades on small muscles.
- **Right shoulder.** Two held right-shoulder movements in different planes keep their labels true.
- **Words.** The brain arrows turn the brain in place, the mirror body sits, and your right arm is already in view.

**Limits.**
- At 16:9 the mirror's left tip partly sits under the "Right leg" label.
- In portrait third person the panels cover the lower bodies.
- In third person, an area hidden behind your own body can still be looked at and switched on.
- Four face and neck movements (two for the eyes, two for the hyoid) have no drawn muscle in the packet. A load-time check names them.

## 42. Carrying and stop-at-contact fixed; cheaper checks every frame

**The note.** The second hunt found five carry and contact faults (Message 12: the three items "can be moved to and around each other but not through").

**Decisions.**
- **Mirror re-grab.** A carry held back at contact now becomes the mirror's new placement, so grasping it again with F no longer freezes.
- **The brain cannot swallow a body.** W/A/S/D move a held brain level with the ground. Each move is checked along its whole path, and the brain counts as a solid: a 2 mm grid built once at load.
- **Trunk bends.** A trunk bend held from a neck area is tested before it is drawn. A bend that would collide stops where it is still clear, and your left hand's reach is carried with the shoulder.
- **F holds what you aimed at.** The F press carries the target it was aimed at, so the carry and the activity agree.
- **Mirror carry stays in view.** A carried mirror body stays within 35 degrees of straight ahead, so it is never stretched at the edge of the wide view.
- **E while holding.** Pressing E while F holds something says "Let go of F first, then press E."

**Speed.** The mirror no longer builds a full check report on every frame, and an ordinary look skips the body guard. The guards also reuse a gap they measured, so they do less work while things move slowly. Sphere tables, picks and normals give identical results, faster. On the builder's own branch the Space dance went from about 45 to about 52 frames a second, and carrying the mirror from 15 to 39. After merging with the forearm skinning (section 40), the outlines (44) and the glow (43), the dance measured about 31 and a look sweep about 30 in the same test. A further performance pass is under way.

## 43. Clinical colours and a power-up charge, then black again with more contrast

*Changed on 12 November: the power-up charge is now a neon flash (section 56).*

**The notes.** Message 22: "Make them clinical instead. Everything should look clinical and surgical. And the fluorescent glow up should almost look like a video game power up charge." Message 24: "I liked the space black background." Message 25: "Let's not make things bland. Contrast and high dynamic range are still visually key."

**Decisions.**
- **Muscles.** Muscles take six anatomy-model tones from salmon rose to clay rose instead of raw red. They are no closer to each other than before, so touching muscles still differ. The finish is satin, with pearly tendons and ivory-white bone.
- **Power-up charge.** Each activation runs a charge in the area's own colour from one shared start on the brain area and on its muscles on both bodies. An energy front runs from origin to insertion in about 0.26 s, a bright flash peaks at about 0.3 s, then a calm pulsing hold and a 0.25 s power-down. A second click on a glowing area charges it again, at most 1.7 times a second. Opposing-movement hints stay calm, and reduced motion gets one gentle ramp.
- **Neck glow.** The neck and trunk glow that follows the mouse look starts in its calm hold, without the flash. The head is turned almost all the time, so a flash at each turn was a stream of small flashes.
- **Background and contrast.** After Messages 24 and 25 the slate background went back to space black. The flat fill light was lowered and the key and rim lights strengthened, so the bodies have depth again.

**What is next.** Message 29 asks for a Borderlands-style look throughout (section 46).

## 44. Outlines where limbs and bodies overlap

**The note.** Message 20: "If limbs are overlapping, make sure their clearly defined with outlines so they don't merge into each other."

**Decision.** One hidden pass records, per pixel, which limb and which muscle is drawn and how far away it is. A screen pass then draws a dark line on the near side of each boundary:
- **Strong:** between the two bodies, and between limbs that do not join.
- **Medium:** silhouettes against the brain or the black, and depth steps inside a limb.
- **Faint:** between touching muscles. The medium and faint lines fade out on small figures.

All meshes go into one batched draw, so the pass costs about 0.1–0.8 ms a frame and is skipped when nothing moved. The lines are drawn before the glass, motor areas and arrows, which stay on top. Soft crease shading uses the same depths and is drawn at full quality only.

**Limit.** The hidden pass has no edge smoothing, so long shallow diagonals show small steps. Message 27 asks for lines that do not hurt the eyes, and Message 28 asks to keep them black. Section 46 covers both.

## 45. What is picked is what is drawn: a body in front blocks the look

*Changed on 11 November: the look now reaches a motor area behind a body, and Shift reaches the body in front (section 54).*

**The fault.** The look picked motor areas straight through your own body. Looking down, your feet switched on the leg areas behind them. In third person, your back could do the same.

**Decision.** While the crosshair is on the brain, the game also asks whether a body part is nearer than every motor area on the same ray, using the same pick a click uses. If one is (your own body or the mirror body), no area is looked at, the line names that muscle or bone, and a click taps it. The mirror body was already handled this way, through the glass pick.

**Check.** The same grid of 90 looks over the feet was run in an older build and the new one. Looks that landed on a motor area fell from 26 to 14. Looks that named a toe, foot bone or toe muscle rose from 2 to 14: these are the knee, hip and ankle areas the older build switched on through your feet. The older build also lacked the merges since then, so the counts are close but not exact.

## 46. A Borderlands-style look throughout (in progress)

**The notes.** Message 26: "Introduce some degree of visual segmentation for differentiation." Message 27: "Ensure the outline is not so harsh that it hurts the viewer's eyes. Well still want deep deep shades to light light shades." Message 28: "I'm referring to the black outlines just to be clear. I quite like the borderlands look." Message 29: "Perhaps the borderlands aesthetic should be applied throughout." Message 30: "The bone tips probably shouldn't be so spikey."

**Decision.** The 3D scene takes a cel-shaded comic look in the spirit of Borderlands, applied to clean, accurate anatomy:
- **Ink outlines.** Near-black lines in a weight hierarchy: bold silhouettes, finer inner lines, and the finest partings between muscles. They are smoothed and stable while you look around, so they are not harsh.
- **Light.** Three to four tone bands run from deep shadow to bright highlight.
- **Hatching.** Ink hatching sits in the shadows and follows the form.
- **Textures.** Muscles get fibre striation, tendons long strokes, and bones a fine grain. The motor areas show their gyri and sulci, taken from the atlas geometry.
- **Glow.** The glow blooms on the black.

The content stays clinical: no blood, gore or grime. Every ink line follows the atlas geometry. The HUD stays sans-serif. Two builders share one style guide: one for the bodies, lights and bloom, one for the brain, the arrows and the outline pass. What was built and measured is in sections 48 (the bodies) and 52 (the brain, arrows and outlines).

## 47. A closed skull and real eyes; the muscle lift works again

**The note.** Message 20: "The arm and face muscles look the most wrong and disgusting."

**Cause in the face.** The muscle meshes were sound: none of the 186 face, neck and arm muscle meshes has a hole or a flipped face. The skull was open. The full-body packet has the frontal, temporal and facial bones but no parietal or occipital bone and no eyes. So from the front the scalp muscles stood up like horns over a white cap with empty eye sockets, and from behind you saw the inside of the face.

**Decision.** Ten more BodyParts3D 4.0 meshes were fetched byte-exact from the official archive (CC BY 4.0) into a new packet, `packets/bodyparts3d-head-r1`:
- **Bones:** both parietal bones, the occipital bone and the sphenoid.
- **Eyes:** the sclera, iris and lens of each eye.

Each file was checked against the archive's own records, and the packet has a pinned manifest, an acquisition record and its licence notice. The two atlases' skulls differ at the back, so where a Z-Anatomy scalp muscle lay inside the new bone it is lifted onto it, by at most 8.5 mm. This is a display change; the packet files are unchanged. The cornea was left out (drawn opaque it would hide the iris), and so were the teeth.

**Cause in the arms.** Since the forearm twist (section 40), the scene had refused the whole Body Worlds lift and fill of section 28. The lifted copy was still baked with the forearm's old, untwisted frame, so 14 right forearm muscles landed 41–70 mm from where the stack rule allows. Both bodies were therefore drawn as raw, unfilled atlas meshes, which is why the forearms looked thin and stringy. The bake now uses the same twist map, the lift applies again (largest lift 21.3 mm), and the arms are full.

**Cost.** About 0.45 s more loading: 9.4 MB more anatomy, plus the lift's set-up, which runs again now. Frame rates are unchanged.

**Limits.**
- The top of the head is bare bone, because neither atlas has the scalp's tendon sheet.
- The occipital muscles are flat rectangles in the source.
- The lips are parted over white bone.
- With the lift on, the outline pass draws tiny rings along the partings between lifted muscles. The outline work in section 46 handles them.

## 48. The bodies in the Borderlands style, still clinical

**The notes.** Messages 24, 25, 27, 28 and 29 (section 46), and Message 30: "The bone tips probably shouldn't be so spikey."

**Decisions for the bodies.** These apply to your body, the left arm and the mirror body:
- **Light.** Four tone bands with narrow, smoothed steps. Deep shadows are a cool neutral dark, never brown-red. A cool rim on one side and crisp highlight spots on tendon and bone.
- **Ink.** Fine near-black lines run along each muscle, with denser hatching in the shadows. Tendons get a few long strokes and bones a fine grain. The ink is fixed to the meshes, so it does not swim when you look around. It thins on small figures, fades between 1.0 and 1.35 m from the eye (the mirror body at its start distance stays clean), and is off at Low quality.
- **Colour.** Muscle tones are 1.2 times more saturated; touching muscles stay as distinguishable as before.
- **Glow.** The scene is drawn into a high-dynamic-range target that holds the same values the screen would get, so everything at or below white is unchanged. Only light above white blooms, and muscle power-up peaks are pushed past white so their cores bloom. A flash keeps its colour: an orange area's core goes yellow-orange, not white. Bloom is lighter at the reduced render scales and off at the coarser quality levels.

**Bone tips (Message 30).** There were three causes, two of them fixed:
- **Fixed: coarse source meshes.** The finger and toe bones of the reduced anatomy files end in coarse cones; the left thumb was a 25 mm cone. Every phalanx is now drawn from a smoothed copy, and the end bones get a rounded tip about 1.1 times the shaft's radius. Bones are only pushed outward, never lengthened, by at most 2.5 mm. This is a documented display change; the anatomy files are unchanged.
- **Fixed: the lift on fingers and toes.** It floated tendons off the thin bones and hooked them back to their insertions. There is now no lift within about 4 mm of a phalanx.
- **Fixed by the checker: dark talons.** The comic shading turned digit tips facing away from the light near-black. Bone and tendon now keep light grey shadows.

**Limits.**
- At a distance the bare, slightly curled fingers can still read as claws. The rest pose's curl and the outline weight on thin digits are other owners' work.
- Each muscle's lines follow its one long axis, which is wrong on fan-shaped muscles.
- Your own chest, right in front of the eyes, shows irregular bands on its bumpy surface.
- The bloom target relies on a detail of three.js r170 and must be rechecked on any upgrade.
- Cost: about 1 fps in a burst of clicks; idle stays at 60.

## 49. Faster without drawing or deciding anything differently

**The note.** The task asks for real smoothness repairs that keep the quality. After the merges, the Space dance ran at about 29 frames a second and a look sweep at about 26.

**Decision.** Only changes that leave what is drawn and decided exactly as before:
- **Picks.** Three's own ray test for moving buffers, rewritten as a typed loop with the same arithmetic, which skips rays that miss the current box.
- **Bounds and envelopes.** The arm muscles' bounding spheres are recomputed only when their buffer changes; mirror bounds and envelopes are refilled in place, and third-person keep-out radii are cached.
- **Fewer allocations.** The arm's A/D range search runs without allocations, and collision tables skip work that cannot change a maximum.

Eight node test suites compare the old and new code and show 0 mismatches, bit for bit. Pictures at fixed High quality differ only where something animates.

**Result.** These numbers come from the builder's own branch: High quality, the builder's standard test suite at 1600x900, alone on one processor core, two runs each.

| Scenario | Before (fps) | After (fps) |
|---|---|---|
| Space dance | 29.7 / 30.0 | 38.0 / 38.6 |
| Look sweep | 29.9 / 30.0 | 40.4 / 40.7 |
| Click burst | 47.6 / 49.4 | 52.3 / 50.4 |

Idle stays at 60. At Auto quality, frames longer than 33 ms fell from about 30 to 13 in the dance and from about 95 to 30 in the look. On the merged main, with the comic look (section 48) included, the same suite gave 36.9 in the dance, 39.4 in the look sweep and 52.3 in the click burst.

**Limits.** Neither the 60-fps target nor 95% of frames under 20 ms is met yet. Drawing about 1000 objects takes 32–40% of each frame, and cutting that means fewer, merged draws. Arm skinning, the stop-at-contact guard and the crosshair pick take most of the rest. GPU skinning, coarser collision shapes or fewer picks would change what is drawn or decided, so they were not used.

## 50. Paired controls placed symmetrically

**The note.** Message 31: "There are clear issues with the symmetry of button placement in some places. For example left/right arrows of mirror body do not match in height level. Fix this across the board."

**Cause.** Each arrow tip was slid along its own side to clear a hand, a label or a body. At 1600x900, the mirror body's left tip sat 120 px lower than its right tip.

**Decision.**
- **Tips in pairs.** The four tips of each frame are two pairs, placed as units. The side tips share one horizontal line, and the top and bottom tips share the frame's vertical line. When something is in the way, the pair moves together, or the tips move in by the same amount; a tip is never slid alone. Unequal side insets are a last resort, because people compare left with right far more than top with bottom.
- **Labels.** Label twins take the height halfway between their anchors, and "Your left" and "Your right" are level and shown together.
- **Chip, buttons and cards.** The guide chip is centred under the brain's top arrow. The start and Esc buttons are centred. The two corner cards are equally wide.

Measured at the start: the mirror's side tips are 0 px apart in height at 1024x768, 1280x720, 1600x900 and 1920x1080, in Low quality, in third person and in portrait. They were 96–144 px apart before. No tip sits under a label at the start any more.

**Limits.**
- **Mirror side tips.** At the start they sit above the frame's centre line (116 px at 1600x900), because the centre line is under your left hand.
- **Fixed points.** The tips are fixed points in the scene, so the crosshair can reach them by looking. Looking 25 degrees aside tilts a pair by about 5 px.
- **After a pose change.** After the Space dance, your hand or feet can hide one tip of a pair. Re-planning would make tips jump whenever your hand passes over one.
- **Portrait.** The brain's top and bottom pair sits left of the centre, because the mirror body fills the bottom of the frame.
- **Turned brain.** The chip leaves the centre when the turned brain covers that place.

## 51. Third issue hunt: what the code review found, fixed

**The note.** The standing order to look for issues. Two code readers went through tonight's merged changes, one on the rendering and one on the logic and collisions. Each claimed defect went to a second reader who tried to refute it. Fifteen survived.

**Rendering, fixed.**
- **Picks at Low quality.** Simplified body copies kept stale pick trees after skinning or the lift, so the crosshair could miss the drawn forearm.
- **Head-turn flash.** The far-side neck muscle still flashed during head turns.
- **Charge-to-flash seam.** (The charge itself was removed on 12 November: section 56.) The power-up's hand-off from charge to flash dropped about 40% for one frame. It is now continuous in both copies, the main program and the shader, which agree to within 3e-8.
- **Labels.** A label could be forced and faded in the mirror-tip fallback.
- **QA trace.** A QA trace counted the outline pass as a surface.

**Logic and collisions, fixed.**
- **Covered areas.** An area your body had covered stayed dead after the body moved away, and the next mouse twitch then switched it on and held it. The raw look result is now kept apart from the cover rule, and a change of cover under a still look is silent.
- **Head-look muscles.** They now glow in the colour of the area they light, and without a flash.
- **Card text.** The card says honestly when a body is in front.
- **Arrow tips.** The HUD no longer names a muscle behind a muted arrow tip.
- **Mirror carry.** S can no longer push a carried mirror past 35 degrees.
- **Collisions.** Head moves, brain moves and long carries that start in contact, or travel far, are no longer stopped short or reported as contact by mistake. No move can pass through an item.

**Left for later.**
- The crease shading also darkens the glow.
- A one-way look lock near a resting item.
- One- to two-second frames on fast flicks while carrying the brain.

The last two are being fixed.

## 52. The brain, the arrows and the outlines in the comic style

**The notes.** Messages 24 and 26–29 (section 46).

**Folds from the atlas.** The motor strip is the atlas's own precentral gyrus, a closed volume of crown, banks and cut faces. Its own mesh does not say where the sulci are, but its neighbours do. Each strip vertex's fold depth is how far it lies below a 10 mm ball rolled over the outside of all 59 atlas brain meshes. That depth sets four light bands, dark banks, an ink line low on each bank (the central and precentral sulci) and hatching across the gyrus in shadow. No fold is invented; only the hatching is a procedural display choice.

**Rest of the brain.** Area seams and body-part borders are ink lines. The glass has inked contours and a highlight with real size. The arrows have cel tones and an ink edge. Area colours, bands, picking and the strip's place are unchanged, checked on 65 fixed looks.

**Outlines (Messages 27 and 28).**
- **Black and smooth.** They stay black. The hidden pass is drawn at twice the resolution and smoothed, so there are no stair-steps, and two frames a few degrees apart show no crawling.
- **Weights.** 2.4 CSS px at silhouettes and overlaps, 1.2 for steps inside a limb and 0.8 for partings between muscles, all thinning with distance.
- **Small features.** No rings of ink round specks or pinholes, and lines thinner than a pixel fade instead of breaking up.
- **Cost.** About 92 MB more of GPU memory at High. No frame-rate cost shows on this CPU-bound machine.

**Limit.** The checker found the relief modest at the start view: from above, most of what you see is crown. A follow-up makes the gyri and sulci clearly visible, including the glass brain's own folds.

## 53. The missing muscles, from the same two atlases

**The notes.** Message 1, "No invisible ... body parts"; Message 18, anatomical realism. Several movements named muscles the anatomy set did not have: the lower back, the middle of the belly, the inner thigh and the outer shin were bare.

**Decision.** Add 111 muscle meshes as a new packet, `packets/missing-muscles-r1`, under the Message 20 and 23 rules:
- **From BodyParts3D 4.0:** 93 byte-exact files from the official archive (CC BY 4.0).
- **From Z-Anatomy:** 18 derivatives (CC BY-SA 4.0, share-alike kept) for muscles BodyParts3D lacks: latissimus dorsi, rectus abdominis, internal oblique, transversus abdominis, quadratus lumborum, longus colli, extensor digitorum brevis and flexor hallucis brevis. They are converted the same way as the face packet, so the conversion reproduces all 54 face files exactly. The feet get one rigid correction per foot, about 14 degrees, fitted to the BodyParts3D foot muscles. Multifidus is left out, because the two atlases are 8–11 mm apart in the deep upper back.

Every new muscle has a stack level and a colour shared by both sides. Every movement's movers now match a drawn muscle: 108 actions, none unmatched.

**Opened rectus sheath (display choice).** The BodyParts3D outer oblique includes the tendon sheet over the belly, which hid the new rectus completely. That part of the sheets is not drawn, as on an atlas plate with the sheath opened. The strip between the two recti is kept, so the midline slit stays at the atlas's own 7 mm. The files are unchanged.

**Cost.** About 1.8 s more loading (36 MB more anatomy). More meshes to draw, skin and test slow the Space dance; a performance pass for them follows.

**Limits.**
- Quadratus lumborum and the inner edge of the latissimus are 5–12 mm off the bone they attach to, in the deep back, where they are covered.
- A click exactly on the belly's midline still selects a vertebra.

## 54. Space is the one hand key; R reads the information (12 November)

**The notes.** Message 40: "I see now I gave confusing instructions. So holding the spacebar, get rid of F. Holding the spacebar should again be grasping. And so should one tap spacebar. But double tapping causes rotation, and double tapping and holding continues that rotation, but slowly." Message 48: "the grasping action, you can't see the grasping action at all", and "maybe R should, the letter R, the key R should replace the I key for information ... make sure the information isn't such an eyesore as it is now, and make sure that it starts off in that mode so you can see the information on the sides."

**Decision.** This replaces section 31 (the Space dance) and the F key of section 33.
- **Hold Space:** take hold of what you look at for as long as the key is down.
- **Tap Space:** take hold and keep holding; the next tap lets go.
- **Tap twice:** all four limbs turn once (forearms palm up or down, upper arms and hips inward or outward). Each limb carries on the way it last turned.
- **Tap twice and hold:** the turn carries on slowly until the key is released.
- **What a press acts on** (Messages 33 and 34, 11 November: "You should be able to grasp-move items even if they are behind another item." "Same for the other controls of course."). The look reaches a motor area even when your own body or the mirror body is in front of it. The “Looking at” card names the area and says what is in front, and every control acts on what the card names. Shift reaches the other thing on the line of sight: where an area is named, the body part in front of it (Shift + click taps its muscle, Shift + Space holds that limb or the mirror body, Shift + drag dials the limb or turns the mirror body); away from the strip, the thing behind what you see. This replaces the rule of section 45 that a body in front blocks the look.
- **The hold is visible.** The left hand closes while Space holds and opens when the hold ends. The hand part of the left-arm strip lights, the information card names the key, the strip part, the movement and the muscles, and the crosshair shows a ring: white while the hand is closed on nothing, the accent colour while something is held.
- **R reads the information.** R replaces I and steps through three states: the side cards (the start), the cards with More detail and the colour key, and everything hidden, with a small chip that says how to bring it back. The status card has shorter wording. Ctrl+R stays the browser's reload.

**How it is built.** The Space gesture is one small state machine in `ns-controls.mjs` (press, release, tick) that emits hold and turn events. Losing focus, losing the pointer and every input cancel of 11 November release a hold and stop a slow turn exactly once. A unit test covers the tap limit, the double-tap window, a press that waits while a turn runs and the safety releases.

**Limits.**
- The closed hand is a sign of the hold only. The fingers do not wrap round what is carried.
- A hold or a tap takes hold at the press itself, with no wait for a possible second tap. A double tap on an item therefore takes hold of it for a moment; it is let go before the limbs turn.
- Message 46 also asks that the look swings a held item round you with the same face toward you, and that a press and drag turns it about itself. The first half is not built yet: the look still carries a held item up and down.

## 55. Each activation names its strip part, movement and muscles; the strip spans about half the view

**The notes.** Message 43: "The brain is far too big, it should only take up 50% of the width of the panorama screen view." Message 48: "it's not clear which brain part is being activated by each body movement at all. So maybe you need to reintroduce linking lines ... The entire left arm region activates, where only small regions should be activating." Message 50: "it's not even showing which muscles are activating when we're using the D key and we're using the A key." Message 56: "the game is a educational game, essentially. It's a learning tool for people learning motor neuroanatomy."

**Decision.**
- **Reach keys light only what moves.** W, A, S and D light the shoulder part of the left-arm strip, with the elbow part for W and S. The wrist and hand parts stay dark. This replaces the whole-arm display of the reach.
- **Their muscles light too.** A table, `REACH_MUSCLES` in `ns-actions.mjs`, lists the usual textbook movers of the shoulder for each direction. They light at a made-up level, like every signal in the game.
- **One line per lit area.** While an area is lit, one line in its colour joins it to the body part it moves on the mirror body (on your own body only when no mirror body is shown). This brings back the linking lines in a quieter form: one line, held, instead of one short line for a second.
- **The information card says it in words.** For a reach it names the key, the strip part, the movement and the muscles. With the crosshair off the strip it shows the area that is on now.
- **The strip spans about half the width of the view** (0.475 of it), which replaces "fills the view" in section 24 and leaves room for both bodies beside the brain. *Section 59 moves the brain above the mirror body and draws the strip a little smaller: 42 % of the width at 1920 by 1080.*

**Limits.**
- The left teres major, infraspinatus and teres minor lie on the shoulder blade, which the left game arm leaves out. The card names them and nothing lights for them.
- Which muscle does how much of a reach is not modelled. The list is the textbook one, the level is made up, and nothing is measured.
- With the smaller brain the mirror body and your own feet sit in front of the leg end of the strip. The look still reaches those areas (section 45), but they are harder to see. How many areas the crosshair can rest on from the start has not been counted again. *Section 59 moves the brain above the mirror body, so nothing stands in front of the leg end at the start. The count is still not redone.*
- The grey and green arrows can lie over strip areas near the middle of the view. This is on the list for the ease-of-use pass.

## 56. A neon flash, gloss, and lighter ink

**The notes.** Message 53: "instead of making it a glowing power up, level up, let's make it more of a neon fluorescent flash." Message 54: "it's very ugly and matte. Maybe we should add a bit of shine, a bit of glossiness." Message 49: "Maybe you've overdone it with the borderlands style?"

**Decision.**
- **Neon flash.** An area and its muscles come on at once, flash once like a neon tube being switched on, and then glow steadily. The 0.26 s front that ran along each muscle, the slow pulse and the ripples of section 43 are gone, so the glow answers within 0.05 s. There is one flash for each activation and no flicker. The reduced-motion rule and the faint hint on the opposing area are unchanged.
- **Gloss.** Muscles and bones were matte because the muscle highlight sat under the comic highlight's threshold, so none was drawn. They are now more polished, and the comic highlight has a second, brighter core. A rule keeps small far parts from sparkling. Motor areas carry a soft sheen along the gyrus crowns, and the glass has a larger soft highlight.
- **Lighter ink.** Outlines are thinner and lighter, and the bodies carry much less hatching and stipple. The contour and hatch lines on the brain are lighter too. This tones down sections 46, 48 and 52 without removing the comic look.

**Limit.** These are choices of look, checked by eye in screenshots. No reader other than the author has compared the before and after.

## 57. Slightly bent limbs; the mirror body backs away in the view over the shoulder

**The notes.** Message 51: "let's have the extended arm and legs, you know, slightly bent. Not perfectly straight." Message 52: "if when you press E to go into third person, that your body gets further away, then the mirror body should also get further away equally. Otherwise, then it's just getting far too close."

**Decision.**
- **Soft extension.** A fully stretched right elbow is drawn with about 12 degrees of bend and each knee with about 10. The drawn bend is the square root of (the joint's bend squared plus that minimum squared), so it joins the joint's own angle smoothly and never passes the joint's limit. Only the drawing changes: the game's joint angles, the limits and the body map still count from straight. The bend is applied before the ground rule of section 25, so the heels stay on the ground. *Section 61 retires the ground rule; the bent knee now lowers the heel a few centimetres.* The left game arm needs none, because its reach already stops at about 16 degrees of elbow bend. This replaces "like a stick" in section 22.
- **The mirror body keeps its distance.** E moves the camera 1.4 m behind you. The mirror body now slides away from your body by the same 1.4 m, with the same easing, and returns exactly when you press E again. It is a slide for the view only: it is not part of the mirror body's orbit and is not saved.

**Limit.** The 12 and 10 degrees are display values chosen by eye, not measured resting angles.

## 58. Performance, second pass: less work in each frame, and the picture is kept

**The notes.** Message 42: "Do everything you can do to fix game performance. It is horrible at the moment." Message 48: "there are serious performance issues here, so do what you've got to do." Message 50: "You may also have to simplify certain elements ... to maximize performance."

**What was slow.** On the user's screen size (1920 by 1080) the frame time was the game's own work on the main thread, not the graphics card. Carrying an item stalled, and the automatic picture quality answered slow frames by lowering the picture, which made the picture rough and the frames no faster.

**Decision.** Each change gives the same picture and the same answers, and each was checked against the computation it replaces.
- **Carrying no longer stalls.** A held item's own arrows rest while it is carried and are planned once when it is let go; before, they were hidden and planned again on every frame. The information panel writes only the parts that changed, so a moving number no longer makes the browser measure the whole layout again.
- **The carry guard does its work once.** The guard that keeps a carried mirror body clear of your body and the brain built the same mirror image four times a frame. It is built once and shared. Checked over 260 guarded frames against the previous computation: no difference in how far the item moved or why it stopped.
- **Body pose reuses what did not move.** A mesh's matrix is recomputed only when one of its segments moved. Checked against a fresh computation for 655,398 matrices over 1,374 poses: no element differed.
- **Left arm skinning skips unused blend slots.** Nineteen in twenty of the arm's vertices use one or two of three slots; terms with a weight of exactly zero are left out.
- **The brain's glass is drawn in three draws instead of 145.** The merged mesh shares memory with the pieces, which stay for picking and collision. Draw calls at the start went from 1,137 to 995. Five views were pixel-identical at Low quality.
- **Picture quality is given up only when that helps.** With Picture quality: Auto, slow frames that are mostly the game's own work now leave the picture alone. Every step down is measured for about a second; without a gain of at least a tenth the next kind of step is tried, and when none helps the starting level comes back and is held (20 s, longer each time, 5 minutes at most). A renderer limited by triangle count still reaches the simpler meshes. Seven unit tests cover the rules with made-up frame times.

**Measured.** Scripted runs in one desktop Chromium at 1920 by 1080 on the machine's own graphics card, with eight processor cores for the browser (the earlier sections used one core, so these numbers do not compare with theirs). Frames a second; "before" is the build of section 57, one run; "after" is three runs. Runs differ by several frames a second, and the frame times are locked to the 60 Hz screen.

| What the script does | Before | After |
|---|---|---|
| Sitting still | 60 | 60 |
| Looking around | 56.5 | 52.7 to 58.5 |
| Reaching with the keys | 60 | 60 |
| Holding the mirror body and looking around | 33.9 | 46 to 48.8 |
| Carrying it with the keys into contact | 42.6, with one frame of 233 ms | 48.6 to 49.5, longest frame 50 ms |
| The slow limb turn | 54.2 | 51.6 to 53.6 |
| Looking around again at the end of the run | 53.7 | 56.3 to 60 |
| Looking around in the view over the shoulder | 47.8 | 47.2 to 54.8 |
| Picture at the end of the run | the roughest level (simplified meshes, 0.7 million triangles) | full (3.2 million triangles) |

**Limits.**
- The target of 60 frames a second is met only when sitting still and when reaching. Holding, carrying, the limb turn and the view over the shoulder still drop frames, and some frames take longer than a thirtieth of a second.
- Looking around and the limb turn are about as fast as before. What changed there is that the full picture is kept; before, the same speed was reached only with the roughest picture.
- The game's own work per frame is still the limit: re-skinning both bodies when the look moves, about a thousand draw calls, and one material per muscle. Sharing materials between resting muscles and merging the draws of the mirror body's bones are the next candidates. They change more code and have not been tried.
- One machine, one browser. Nothing was measured on a laptop or on integrated graphics of another make.

## 59. The brain above, the mirror body below; numbered movements with number keys

**The notes.** Message 55: "The game has to be a lot easier to use and play and more intuitive." Message 56: "And remember, the game is a educational game, essentially. It's a learning tool for people learning motor neuroanatomy." Message 43: "The brain is far too big, it should only take up 50% of the width of the panorama screen view." Message 7: "think of the motor strip as a horizontal 16:9 frame and the mirror as a vertical 9:16 frame, the arrows will be at the centered edges of each frame perimeter side". Message 47: "And the limbs should be manipulatable to any position by brain activation."

**What was hard.** The mirror body and your own feet stood in front of the middle of the strip, where the leg and foot areas are (a limit noted in section 55). And an area with several movements gave no way to choose one: which movement a look took depended on where inside a small area the crosshair rested.

**Decision.**
- **Brain above, body below.** The glass brain sits in the upper part of the view and the mirror body below it. `BRAIN_VIEW.motorFloorNdc` in ns-brain keeps the strip's box above a set height of the view, and `brainFloorNdc(size)` in ns-app gives that height for each window size.
- **The strip is a little under half the width.** To stay above that height the strip is drawn at 0.88 of the size section 55 gave it in a 1920 by 1080 window: 801 pixels, 42 % of the width, with the whole brain about 45 %. That is less than the 50 % of Message 43 and is recorded here as a departure from it.
- **Numbered movements.** The information card lists the movements of the area you look at, or looked at last, with numbers. Keys 1 to 9, on the top row or the number pad, do the movement with that number through the same activity event as a tap on one of its muscles, so one rule serves both. The list stays while you look down at the body. That is the loop the game teaches: look at the area, look at the body, press a number, watch the part move.
- **The chosen movement stays on the card** until the look moves to another area or another movement of the same area is switched on.
- **“Already there”.** A movement that would not move the body from where it is now is marked. The mark is read from the activity's own latch rule (`latchView().still`), not from a second copy of it.
- **Latch rule.** A joint that a movement merely wants at its start angle now goes there with the rest of the movement, in the same activation: Purse the lips with the upper lip lifted is one example. Before, that counted as an opposing movement and needed an activation of its own. A truly opposing movement still takes its own activation (section 23).
- **The brain's bottom arrow moved.** With the body below the brain, the middle of the lower side of the brain's frame is where the mirror body's top arrow sits. The brain's bottom arrow therefore moves up its own centre line into the hollow of the strip's U (`BRAIN_TIP_RULES` in ns-scene-three): 196 pixels up at 1920 by 1080 and 170 at 1600 by 900. This is a known departure from "the centered edges of each frame" for that one arrow. The other three brain arrows are on the middles of their sides or a few pixels out.
- **The clear space kept round the crosshair** went from 40 to 8 pixels (`R5_BIGBRAIN.crosshairKeepPx`). The mirror body's top arrow is 60 pixels above the crosshair at 1920 by 1080, 50 at 1600 by 900 and 43 at 1366 by 768.
- **The keyboard picture** has a number row.

**Checked.** `tests/move-key.test.mjs`, 13 cases: which movement a number picks, the “already there” mark and the latch rule. The strip's size and the arrow places were read in the browser at the three window sizes named above.

**Limits.**
- A number key does the whole movement, as a click does. Stopping a part half-way, or moving it by degrees while a key is held, is not built, so Message 47 is still open in that respect.
- The left shoulder, the tongue and the three in-between areas have no movements, so their cards list none.
- The scene has to draw the list for the number keys to be offered. Where it does not, the keys do nothing and the guide leaves out the two goals that use them (section 60).
- While the look is on the leg end of the strip the mirror body's legs are below the picture. You look down to watch them, and the card keeps the area.
- With the crosshair on the brain's glass between areas, the card of the last area stays instead of a card about the glass.
- In a window about 800 pixels high the lower rows of the card fade out at its edge.
- The labels on the brain hide near the crosshair, so the label of the area you aim at is not on the brain while you aim. The “Looking at” card names it (section 65).

## 60. The guide starts with the learning loop

**The notes.** Messages 55 and 56, quoted in section 59.

**Decision.**
- The “Try this” guide has 12 goals. The first four are what the game teaches: look at a left-arm area, press a number from the card, look at another body part's area, then look down at the body and press a number to watch the leg. The hand, Space and arrow goals come after.
- Two goals are new: press a number, and watch the body while you do. They are asked only when the card draws its numbered list and the number keys are connected.
- Progress saved by the older guide still loads. Only the new goals are asked of a player who had finished the others.
- A number that moves nothing gets its own line: “That movement is already there. Press another number from the card.”

**Checked.** `tests/guide-order.test.mjs`, 10 cases, and one browser pass at 1920 by 1080 through the first four goals and the lines that replace them.

**Limit.** Whether the new order is easier to learn from has not been tried with a person.

## 61. Legs: every hip and knee movement can be reached

**The notes.** Message 48: "it's really hard to get the legs to, you know, to extend the hip and such, and to lower the arm. These should all be achievable". Message 47, quoted in section 59. Message 10: "If we imagine an invisible ground, the mirror body should be touching the same ground."

**What was wrong.** The ground rule of section 25 kept each heel on or above an invisible ground. From the sitting start a knee bend went only to about 41 degrees, and hip extension did nothing, because the thigh already lay on the ground.

**Decision.**
- **The ground rule is retired** (`groundLegAngles`). The invisible ground is where the two bodies sit at the start and after a reset, which is what Message 10 asks. It no longer stops a leg that moves.
- **A knee bends all the way** with the thigh level.
- **Hip extension is a real movement.** The hip area's “swing down and back” takes the thigh down past the line of the trunk to 20 degrees behind it. The joint's own limit is 30 degrees, a textbook figure for an adult hip; ns-body names the source.
- **The knee gives way under a high thigh.** With a straight knee the muscles at the back of the thigh stop a thigh lift at 100 degrees (`HIP_KNEE_COUPLING`). Instead of holding the thigh back there, the drawn knee bends just far enough for the lift to reach what was asked: at least (hip − 100) / 20 × 90 degrees of knee bend (`passiveKneeAngles` in ns-body). Only the drawn knee changes. This is a display rule for a muscle group that crosses two joints, not a measured muscle length.
- **A thigh lift still stops at 110 degrees,** where the rigid thigh and belly shapes would start to pass into each other (section 34).
- **A held limb has no floor.** Space can carry a foot or a hand below the level the bodies sit on.

**Follows from this.** Section 57 said the slight knee bend was applied before the ground rule, so the heels stayed on the ground. With the rule gone, the 10 degrees of drawn bend lower each heel a few centimetres below the level you sit on. No floor is drawn, so nothing shows this except the height of the feet.

**Limits.**
- A leg that swings down or back can leave your own view. The mirror body shows it.
- Below the level the bodies sit on there is nothing: no floor is drawn and nothing stops a limb there.
- Your own limbs still pass through each other (section 33). The adduction movement stops at the middle so that the two legs do not cross.
- “Lower the arm” in the same note is not done for the left arm: its shoulder follows the look and the keys and has no movements of its own on the strip. It is on the list at the end of this file.

## 62. The information card takes an area when the look rests on it

**The notes.** Messages 55 and 56, quoted in section 59.

**What was wrong.** The motor areas are small and lie side by side. A look that left a chosen area for the body crossed others on the way, and the card, with the area the number keys act on, ended on whichever area was crossed last.

**Decision.**
- The card takes a newly looked-at area after the look has rested on it for 0.3 seconds, the same time a look needs to move the part.
- Taken at once: the first card, the area whose card is already shown, a click, a tap on a muscle and a number key.
- Areas the look only crossed stay out of the “switched on now” card while their glow lasts.
- The “Looking at” card and the glow on the brain still answer at once, so the game does not feel slower to respond.

**Checked.** `tests/info-settle.test.mjs`, 10 cases, and one browser run at 1920 by 1080: the card was kept after looking down from the knee area and after a sweep across the strip, the number keys acted on the kept area, a rest on the hip area took the card, and a tap on a mirror-body muscle opened its area's card with the number keys following it.

**Limit.** A held neck or trunk movement turns the head, so the crosshair leaves the area that was rested on: after the trunk area it ends on the brain's glass and after the neck area in empty space. The card keeps the area.

## 63. The left and right arrow keys step the look along the strip

**The notes.** Messages 55 and 56, quoted in section 59.

**Decision.**
- ← and → put the look on the next motor area toward that side of the screen, in the order of the body map along the strip. The information card follows at once.
- A held key repeats at most once every 180 milliseconds.
- Areas hidden in the current view are passed over. At the end of the strip a line says so: “No more motor areas that way from here. Press the other arrow key, or turn the brain to bring more areas into view.”
- While Space holds something the keys wait and a line says: “Let go of what you hold first, then press the arrow key.”
- With no area chosen yet, the first press takes the area nearest the crosshair.
- When a held neck or trunk movement has carried the view off the area, the next step goes on from that area, not from where the crosshair ended.
- On the start page and the Esc page the arrow keys still scroll the page.

**How it is built.** ns-controls reports the key as a request. ns-app holds the walk order (`areaChain`), the areas a step tries (`areaStepCandidates`), the look that lands on the area (`areaStep`) and the area the walk goes on from (`areaWalkStep`).

**Checked.** `tests/area-step.test.mjs`, 11 cases.

**Limits.**
- A step is an ordinary look. Resting where it lands takes that area's movement, as any look does.
- Left and right follow the screen at an ordinary view of the brain. In a view exactly from the side the direction is arbitrary.

## 64. A shorter Esc page, and sentences that teach what the strip is

**The notes.** Messages 55 and 56, quoted in section 59. Message 44: "Text is hard to read as it's all clumped together."

**What was wrong.** The Esc page opened 3.7 screens tall at 1920 by 1080, and its trackpad text broke after every word.

**Decision.**
- The Esc page opens with the short instructions, 2.2 screens tall at 1920 by 1080. **Show the full instructions** has the rest, and **Show the short instructions** goes back. That button never resumes the game.
- The trackpad block is one column. The two keyboard notes and the help lines under the settings are shorter. The list of limits runs in two columns in wide windows, with every line still shown.
- Steps 3 and 4 now teach: the coloured band is the motor strip, drawn as a simplified map; each half of the brain mainly moves the opposite side of the body; and the order of the body along the strip. Step 4 is named “A map of the body.”
- The words are held to what the game can stand behind: “mainly” for the opposite side, “a simplified map” for the strip, and no claim that the band is a measured map of anyone's brain.

**Checked.** A browser tour of the start page and the Esc page at 1920 by 1080 and 1280 by 720: the button works both ways, the game stays paused, no errors.

**Limits.**
- 2.2 screens is still more than one. The start page also scrolls: it is about 1.8 screens tall at 1920 by 1080.
- The sentence about outlines and crease shading at each picture quality moved from the Esc page to the player guide.

## 65. The look line names the area, then its movement; the card names the strip part

**The notes.** Message 56, quoted in section 59. Message 48: "it's not clear which brain part is being activated by each body movement at all."

**Decision.**
- The “Looking at” card reads “Looking at (motor area): Left knee · Bend left knee” for every motor area: the area first, then the movement the crosshair is on. The left arm no longer has a different opening.
- The line under the card's title used to say “Motor area for another body part” for everything but the left arm. It now names the part of the strip, in the words of the labels on the brain, and the half the area is drawn on: “Right-leg motor area (brain’s left half)”, “Face-and-neck motor area (brain’s right half)”, “Belly-and-back motor area (brain’s left half)”.
- That half is where the area is drawn. It is not a claim that only that half drives the part.
- The left-arm and in-between tags are unchanged.

**Checked.** `tests/area-words.test.mjs`, 8 cases over every mapped area.

**Limit.** In the bottom-left card a long line wraps after the “·”.

## 66. Frame rates of the second revision

**Measured.** The script of section 58, on the same machine and setup: one desktop Chromium at 1920 by 1080, the machine's own graphics card, eight processor cores for the browser. Three runs of the build of sections 59 to 65, in frames a second. The script also read what the crosshair was on before three of its steps, which does not change what is drawn.

| What the script does | Three runs |
|---|---|
| Sitting still | 60 |
| Looking around | 59.1 to 59.6 |
| Reaching with the keys | 59.6 |
| Holding the mirror body and looking around | 51.7 to 53 |
| Carrying it with the keys into contact | 49.7 to 53.4, longest frame 50 ms |
| The slow limb turn | 51.9 to 59 |
| Looking around again at the end of the run | 59.4 to 60 |
| Looking around in the view over the shoulder | 52.3 to 58.2 |
| Picture at the end of the run | full (3.2 million triangles, 996 draw calls) |

**What this does and does not show.**
- The script sends the same mouse and key input as in section 58, but the layout changed in section 59, so the views it passes are not the same pictures. The higher numbers for looking around are not a like-for-like gain and no speed-up is claimed for these sections.
- No performance work was done in sections 59 to 65. The table shows that the changes did not make the game slower in this script.
- Holding, carrying, the limb turn and the view over the shoulder still drop frames, and some frames take longer than a thirtieth of a second. Message 42 stays open.
- One machine, one browser, three runs.

## 67. The card says when a press only brings a part back

**The notes.** Messages 55 and 56, quoted in section 59. Message 6: "Limbs do not return to previous position are muscle or brain activation to be clear, they need to be activated back into previous position or the whole thing reset."

**What was wrong.** By the rule of section 23, a movement switched on while its part is held the other way only brings the part back to where it started. The movement itself takes one more activation. Nothing on the screen said so. With the thigh swung down and back, key 1 for “Lift left thigh” stopped the thigh level, and it looked as if the key had failed.

**Decision.**
- The numbered list marks such a movement “first press brings it back”. The card's Movement row adds “(the part is held the other way, so the first time only brings it back)”.
- After a number key that only brought the part back, the bottom-left card says for five seconds: “Key 1 brought the part back to where it started. Press 1 again for the movement itself.”
- After a number key that moved nothing it says: “Key 2: that movement is already there, so nothing moved. Try another number on the card.” The line is left out while the “Try this” line says the same thing.
- The rule is asked in one place. `opposedJoints` (body) and `armOpposedLatch` (game arm) in `ns-actions.mjs` decide what an activation does, and the same two answer `latchView().back` and the card (`infoActionBack` in `ns-app.mjs`). The mark cannot disagree with what the key does.
- On the left arm, “Straighten left elbow” is never marked: letting go of a held bend is the straightening that was asked for. The two forearm turns are not marked either; they have their own state and words.
- No new colour or shape. The mark is plain text in the place of “already there”, and a movement never carries both marks.

**Checked.** `tests/move-key.test.mjs`, now 16 cases: the trunk, the hip, the knee, the lips and the game arm, and the words of the card and the status line. All 17 node tests pass. One browser run at 1920 by 1080: the hand (open, then key 1 for close), the hip (thigh down and back, then keys 1, 2 and 2 again) and the knee showed the marks and the two lines as written above, and the lines went away after about five seconds.

**Limit.** In the browser run for this section the look did not stay on the trunk area, because leaning the trunk back carried the view up with it; the trunk case was checked in the node tests only. Section 68 changes that, and its browser run covers the trunk.

## 68. A held trunk bend keeps the view; a head movement says how to bring the head back

**The notes.** Messages 55 and 56, quoted in section 59. Message 1: "The cursor now will control head/neck movement with corresponding activity on the brain and mirror body. And of course if you look towards the head/neck motor areas of the glass brain, the head/neck will jerk accordingly."

**What was wrong.** A held trunk bend was added to the look. Resting the look on “Belly and back” leaned the trunk back and threw the view 25 degrees up, off the area that had just been chosen. “Bend forward” threw it down. The brain left the view for a movement that is not about the head, and the numbered movements of the card could not be tried while watching the area. A held neck movement moves the view too. That is asked for in Message 1, but nothing on the screen said why the view had jumped or how to get it back.

**Decision.**
- A held trunk bend moves the trunk under the head. The neck takes up the difference as far as its range goes, so the head, and with it the view, stays where the look put it (`headPoseForLook` and `headLookRange` in `ns-app.mjs`). The trunk bends on your body and on the mirror body as before.
- A held neck movement still moves the view. The camera is in the head, and Message 1 asks for the jerk.
- When a neck movement that moves the view has just been taken, the bottom-left card says for five seconds: “Your head moved, so your view moved with it. Press 1 to bring your head back.” The number is the key of the opposite movement on the card that is shown (`headGoalTaken` and `headBackKey` in `ns-app.mjs`).
- A turn of the head has no opposite on the same card: in this game the opposite turn belongs to the neck area on the other half of the brain. The line then says: “Your head turned, so your view turned with it. In this game the neck area on the other half of the brain turns it back; so does Reset body on the Esc page.”
- When the card shown is not the neck card, no key is named: “Your head moved, so your view moved with it. The opposite neck movement brings it back; so does Reset body on the Esc page.”
- The line goes away at once when the head is back where it started.

**A fault found on the way.** The card that is kept after the look has left its area (“Last area shown”) had lost the mark “first press brings it back” of section 67. The kept card was built without the list of movements that would only bring a part back. It now gets the same lists as the card under the look. The fault came in with section 67 and was in no uploaded version: the second revision as uploaded had no such mark, and its kept card did show “already there”.

**What follows from the decision.**
- The neck can make up 60 degrees backward and 50 forward. “Bend forward” asks for 80 degrees. While you look up at the brain, the trunk is therefore drawn bent forward by less than that: about 40 degrees with the look at the height of the trunk area, 60 with a level look, and the whole 80 only with the look 20 degrees below level or lower. The held bend stays 80 and shows more as the look comes down. “Lean back” is 25 degrees and is drawn whole unless the look is more than 25 degrees below level.
- After “Tilt head back” and then the key that brings the head back, the view ends 10 degrees above level, below the neck area, not on it. While the head was held back the look could not go higher, and the look stays where that limit left it. This was left as it is: putting the look back on the neck area would rest on it and tilt the head back again.

**Checked.** `tests/head-hold.test.mjs`, 12 cases: the head's direction and the drawn trunk bend with a held trunk bend, the look range, a held neck movement still moving the view, when the line is due, the key it names, its words, and the kept card's mark. One browser run at 1920 by 1080. With the look resting on “Belly and back” the view stayed in one direction (9.5 degrees right, 20.3 up) through lean back, key 1 (back to the start), key 1 again (bend forward) and a later reading of each; the held trunk angle read −25, 0 and 80. On the neck area the view went to 70 degrees up and the line named key 1; key 1 brought the view to 10 degrees up and the card said that the key had brought the part back. A head turn sent the view 80 degrees to the left and showed the line for a turn.

**Limit.** One browser, one window size, scripted input. How much of a forward bend is drawn at each look is worked out from the two ranges above and was not measured on the picture.

**Earlier sections this changes.** Section 32 says that held neck or trunk actions add to the look; since this section only held neck actions do. The limit of section 62, and the point of section 63 about the arrow keys going on from the area, speak of a held trunk movement carrying the view off the area. A held trunk movement no longer does that; a held neck movement still does.

## 69. The short card shows each part whole or leaves it out

**The notes.** Message 44: "Text is hard to read as it's all clumped together." Message 48: "you have to make sure the information isn't such an eyesore as it is now". Message 55, quoted in section 59.

**What was wrong.** The short information card has a greatest height, 48 % of the height of the view. On a card with many lines the lead sentence gave way a pixel at a time and ended as a sliver of one line. In a window of 1280 by 720 every card ran over, and its last rows were cut through the middle of the letters. The mark beside a numbered movement (“already there”, “first press brings it back”) broke in two when the row was too narrow.

**Decision.**
- The short card is tried with every part. While it runs over, one more part is left out, in this order: the lead sentence, the signal path, the muscles that work the other way, the muscles that pull (`fitInfoCard` in `ns-scene-three.mjs`; the mark `data-ns-trim` on the card, read by `neurosurge.css`).
- The title, the strip part, the signal bar and the numbered movements always stay. The lead sentence goes first because the numbered movements say the same thing.
- The opened card (key R) always has every part, with its own scroll bar.
- The card is tried again only when its content, the size of the view or its mode changed, not every frame.
- A mark beside a numbered movement stays in one piece: it sits beside a short name and goes whole onto the next line under a long one.

**Checked.** One scripted browser run at each size, with the look put on eight areas in turn. At 1920 by 1080 the knee, hip, trunk, left shoulder and both hand cards showed every part and the neck card left out its lead sentence; none ran over. (The look meant for the elbow landed on the left shoulder at that size, so the elbow card was seen at the smaller size only.) At 1280 by 720, the left shoulder card left out its lead sentence, the knee and elbow cards kept the muscles that pull, and the hip, trunk, hand and neck cards kept the title, the signal bar and the numbered movements only; none ran over, and the “More detail” line was whole on every card. Key R opened the card with every part at both sizes, and the short card came back with the same parts left out.

**Limit.** In a window of 1280 by 720 most short cards do not name the muscles; key R does. Other sizes, larger text settings and other browsers were not tried. The picture was looked at by the author only.

## 70. The card takes an area in the frame its movement is taken

**The notes.** Messages 55 and 56, quoted in section 59.

**What was wrong.** By section 62 the card takes an area when the look has rested on it for about a third of a second, the same time after which the area's movement is taken. The two counted from different moments: the movement from the time before the first frame on the area, the card from the time after it. So the card took the area one frame after the movement. For most areas that cannot be seen. A neck movement moves the view, and in that one frame the look had often left the small neck area. Then the head jerked while the card still showed the area before, its number keys still acted there, and the line of section 68 could not name a key. It showed in one of the author's scripted runs and not in the others, with the same input.

**Decision.**
- The activity records the area whose movement the rest of a look has taken, and counts them (`lookTaken` in `ns-actions.mjs`).
- The card treats that area as meant, the way it treats a click or a number key, in the frame of the movement (`infoTookId` in `ns-app.mjs`, given to `infoSettleStep`). It no longer depends on the two counts agreeing.

**Checked.** `tests/look-taken.test.mjs`, 8 cases: the record appears in the frame the movement is taken and only once; a look that leaves early and a click record nothing; with the record the card takes the area in that frame, and without it the same frame still counts the area as only crossed. All 19 node tests (13 files) pass. Two browser runs at 1920 by 1080 after the change: both showed the neck card and the line naming key 1, and the picture of one showed “Tilt head back” marked “already there” and “Bend head forward” marked “first press brings it back”. The full scripted run of the game ended without an error.

**Limit.** Two browser runs do not show that the fault cannot come back by another way; the node cases cover the way that was found.

## 71. Frame rates of the third revision

**Measured.** The script of sections 58 and 66, on the same machine and setup. Seven runs of the build of sections 67 to 70, in frames a second, and between them four runs of the second revision as uploaded. In two runs of each, the test harness also timed the game's own script in every frame: the time the frame's code takes on the main thread, before the graphics card draws. That timing is done from outside the game's files.

| What the script does | Third revision, seven runs | Second revision, four runs in the same session |
|---|---|---|
| Sitting still | 60 | 60 |
| Looking around | 58 to 59.7 | 59.3 to 59.7 |
| Reaching with the keys | 59.6 to 60 | 59.6 to 60 |
| Holding the mirror body and looking around | 45.8 to 52.6 | 51.3 to 53.4 |
| Carrying it with the keys into contact | 49.6 to 54.1, longest frame 67 ms | 52.2 to 53.9, longest frame 50 ms |
| The slow limb turn | 54.8 to 59.7 | 56.5 to 59.7 |
| Looking around again at the end of the run | 59.5 to 60 | 59.1 to 60 |
| Looking around in the view over the shoulder | 57.2 to 58.2 | 53.8 to 58.2 |
| Picture at the end of the run | full (3.2 million triangles, 996 draw calls) | the same |

**What this does and does not show.**
- No performance work was done in sections 67 to 70.
- The three lowest holding runs are the third revision's: 45.8, 48.8 and 49.3, against a lowest of 51.3 for the second. That could be a slowdown of a few frames a second, so it was looked into. The script time per frame while holding was the same in both: 16.4 and 17.0 ms for the third revision, 16.6 and 16.7 ms for the second. A sampling profile of that step shows the same work in both, with one difference: the layout of the side cards is now worked out in the card fit of section 69 instead of where the cards' positions are read, at the same cost. No cause of a slowdown was found. The lower runs are put down to the difference between runs; a small slowdown is not ruled out.
- The script time shows why holding drops frames. A frame at 60 a second has 16.7 ms, and while the mirror body is held the game's script alone takes about 16.5 ms of it. Looking around takes about 12 ms.
- In the profiled run, a holding frame's script time went to: drawing the picture, 37 %; the check that keeps the held body out of the other things, 14 %; moving the skin of the two bodies, 14 %; fitting the left hand into the view, 7 %; finding what the look is on, 6 %; working out the space the held body takes up, 4 %; the rest in smaller parts. The profiler slows the script, so these are shares, not times.
- Holding, carrying, the limb turn and the view over the shoulder still drop frames. One carrying frame in one run took 67 ms. Message 42 stays open.
- One machine, one browser.

## 72. The left shoulder's muscles stay on the shoulder

**The notes.** Message 36: "Now there seems to be a problem with the shoulder muscle jutting out." and, after it, "It looks to me the shoulder problem is should problem is on the left shoulder." Message 48: "And the shoulder literally detaches when you look to the far left, and the socket rips open and dislocates."

**What was wrong.** Your left arm is its own model. The hand is held at a place in the view and the arm is worked out from there back to the shoulder. Every muscle of that arm moved with one or two of its bones, and the muscles round the shoulder (the three parts of the deltoid and the short muscles under them) moved rigidly with the upper-arm bone. On a body those muscles begin on the collarbone and the shoulder blade, which stay with the chest. So when the upper arm swung far from its rest direction, the top of the shoulder muscle swung away with it. Over 61 looks, each held still and measured, the place where the deltoid begins moved between 0.7 and 9.5 cm against the chest. At a far-left look that showed as a shoulder standing off the trunk with an open end. At a look to the left and down it showed as a pointed fin of muscle beside the view, at rest and during the limb turn.

**Decision.**
- The pose of the arm now also carries the frame of the chest: the trunk's orientation, placed so that the shoulder joint is where the arm has it (`chestMatrix` in ns-arm).
- Each point of an arm muscle that moved with the upper-arm bone gets a place along the upper arm (`SHOULDER_SKIN` and `skinWeights` in ns-rig). From 35 mm above the centre of the shoulder joint upward it follows the chest. From 130 mm below the centre, about where the deltoid ends on the bone, it follows the upper-arm bone as before.
- Between those two, the upper arm's rotation against the chest is taken up step by step (`shoulderFrames`): the swing of the arm about the centre of the joint, and the turn of the arm about its own length. Both are eased at the two ends. Every step keeps the centre of the joint in place, so the muscle is spread round the joint and not pulled off it.
- Past 150 degrees of swing the rule fades out, and from 170 degrees the muscles are rigid with the bone again, because a swing that large has no one shortest way round. None of the 61 looks reaches it.
- Only the muscles of the left arm model change. Its bones move as before. The mirror body draws the same arm, so it has the same shoulder. The right arm is part of the body model, whose skin is not changed.
- The numbers are display constants. They are not measured muscle paths, attachments or the way a real shoulder blade moves with the arm.

**Tried and not kept.** For looks to the left and down, where the arm is folded close beside the head, two changes to the arm's pose were tried on the measured looks outside the game: a different rule for where the elbow points, and holding the hand further from the shoulder. The first gave poses with the elbow high behind the back. Both together laid the upper arm nearly level, pointing backward, which looked worse from the side than the pose the game has. The arm's pose is unchanged.

**Checked.**
- Measured on the same 61 looks with the new skin: the place where each part of the deltoid begins moves at most 0.6 cm against the chest. No edge of the three parts is stretched beyond 2.4 times its rest length or shortened below 0.3 of it, and at most 17 triangles of a part are turned over at any look. The upper ends of the other arm muscles that begin on the shoulder blade (both heads of the biceps, the coracobrachialis and the long head of the triceps) move at most 1.9 cm against the chest. The lateral and medial heads of the triceps begin on the upper-arm bone and still move with it. These are measurements of the model's surface, worked out from the game's arm code outside the browser.
- Pictures before and after at 14 looks, and of the mirror body at 8: the shoulder no longer stands off the trunk at far-left looks. Pictures of the limb turn at three looks, before and after: at the look to the left and down the fin is gone.
- `tests/shoulder-skin.test.mjs`, 14 cases on supplied frames: the top of the zone follows the chest and the lower end the upper arm; every step keeps the joint centre and is a plain rotation; the steps follow the eased profile; the fade; a pose without a chest frame, a mirrored chest frame, or weights without places give the skin from before. Each of four deliberate faults put into a copy of the code failed a case. All 20 node tests (14 files) pass.
- The full scripted run of the game ended without an error. Two runs of the frame-rate script gave rates inside or above the ranges of section 71 for every step except the view over the shoulder in one run (56.2; the other run 57.5; the range is 57.2 to 58.2).

**Limit.**
- At looks far to the left and down, the eye is 4 to 7 cm from the left shoulder muscle. From that close the front part of the deltoid shows the ragged border it has in the source model, and the upper-arm bone shows past it. During the limb turn at such a look a small gap opens between two parts of the muscle, with bone under it. Before the change those looks showed the fin instead.
- The pictures were looked at by the author only. One machine, one browser.

## 73. The mirror body turns all the way round, and its top and bottom arrows tilt it

**The notes.** Message 45: "The body arrows for the body should also be for orbit not back and forth." Message 46: "But then if you click on that item and you move it around using the cursor, you are rotating it in relation to itself. So by doing that, you are orbiting it, as we would say." Message 10, earlier: "If we imagine an invisible ground, the mirror body should be touching the same ground. The ground is flat and has no incline or decline whatsoever."

**What was wrong.**
- The top and bottom arrows by the mirror body, and a drag up or down on it, slid it away and back along the ground (27). The brain's top and bottom arrows turn the brain. Two sets of arrows that look alike did different things.
- The side arrows did turn the body, but not all the way. The mirror body carries, unseen, the mirror image of everything your left hand can reach, so that your hand never meets it. Turned about the body's centre, that image swung through the mirror plane toward you, and the rule that stops a move at contact (33) held the turn: at 171.5 degrees one way and 123.2 degrees the other, measured in the browser, in this build and in the third revision as uploaded. The back of the body could not be brought fully round.

**Decision.**
- All four arrows by the mirror body turn it about its own centre, as the brain's do. The side arrows and a sideways drag turn it about the upright axis, with no limit. The top and bottom arrows and a drag up or down tilt it about the level axis across the screen: the top arrow shows it more from above, the bottom one more from below, and a drag down shows it more from above, the same way round as a drag on the brain. One click is 15 degrees, a held arrow goes on at 12 degrees a second, and a drag turns 0.3 degrees for each pixel (`MIRROR_ORBIT` and `MIRROR_ORBIT_DIRECTIONS` in ns-mirror, `DRAG_TURN` in ns-app).
- The tilt ends at the view from straight above and from straight below, 90 degrees each way. Past that the body would only be upside down. Its back is reached with the side arrows.
- Message 10 and Message 45 pull against each other, because a body tilted about its centre lifts its feet. The rule kept: at the start and after Reset brain view the tilt is 0 and the body is the exact reflection, upright, on the same ground. Only a tilt the player asks for lifts the feet, and tilting back or the reset puts them down. A turn about the upright axis and a carry keep every point at its height.
- A turned or tilted body stands back along the ground by just what it needs, and comes forward again as it is turned back. Two things can need the room: the tilted body's box reaching nearer than the upright one (`mirrorTiltAwayM`), and the image of your hand's reach passing the mirror plane (`mirrorReachAwayM`). The body stands back by the larger of the two, not their sum. Both are 0 at the start, so the reflection is unchanged, and both depend on the angles only, so the same turn always gives the same place.
- Nothing slides the mirror body away and back any more. To move it, carry it with Space. The view over the shoulder still moves it away by as much as your own body (Message 52) and keeps the stand-back.
- Reset brain view also puts the mirror body back: no turn and no tilt.

**Checked.**
- In the browser at 1920 by 1080: at the start the body is the reflection exactly (largest difference 0). A full turn by clicks on the right arrow, and one by clicks on the left, pass every angle with no stop. After 24 clicks one way (360 degrees) it is the exact reflection again, and so it is after a tilt to the view from straight above and back.
- Stand-back, measured: none for the first part of a turn (0 at 15, 60, 75 and 105 degrees one way, 0 at 30 and 60 the other). With the back toward you it is 0.38 m. It is most, about 0.41 m, at 150 to 165 degrees the other way. A tilt alone needs up to 0.19 m. The most seen, turned 150 degrees and tilted 30, is 0.45 m.
- Drags, with the pointer captured and the crosshair on the body: 100 pixels down tilt it 30 degrees toward the view from above, 300 pixels to the left turn it 90 degrees, and a long drag up ends at the view from straight below.
- 31 readings (the start, then six turns 60 degrees apart, each upright and at 45 and 90 degrees of tilt each way), taken at the start look: no move was stopped and nothing touches. Your body and the mirror body are never nearer than 0.28 m, which is their distance at the start. Your left arm and the mirror body are never nearer than 0.66 m. The image of your hand's reach and your own body are never nearer than 0.19 m.
- `tests/mirror-orbit.test.mjs`, 19 cases: the four directions and their signs, the same as the brain's; one step and the tilt's end; the full turn; the stand-back for the tilt and for the reach, each 0 at the start and never more than is needed; the reflection after a turn and back; the drag; the words. Of 21 deliberate faults put into copies of the code, 20 failed a case. The one that did not, the sign of the tilt inside the body box's reach, gives the same numbers as the code: the box's own axes are level, and such a box reaches equally far toward you tilted either way.
- The full scripted run of the game ended without an error, and its eight pictures show the same views as the run before the change.

**Limit.**
- The four arrows stay on the frame round the upright body, where section 30 put them. A tilted body can reach past that frame, and at a downward look your own left arm can hide the left arrow.
- Seen from straight above or below, the mirror body fills much of the lower view, and in a picture it can look as if it touched your knees. The measured gaps say it does not. They were measured at the start look and with the limbs at their start only.
- One machine, one browser, and the author's own reading of the pictures.

## 74. A white square at one exact look

**What was seen.** While the mirror body's tilt was being checked at 1920 by 1080, one look, straight ahead and 8.02 degrees down, showed a pure-white square 278 pixels on a side a little right of the middle of the view (from x 997 to 1275, from y 229 to 507). One step of the look away it was gone. The third revision as uploaded shows the same square at the same look: 71,375 pure-white pixels, against a few hundred in the views next to it. No user note reports it.

**Cause.** The scene is drawn into a picture with a wide range of brightness, and the glow of section 48 is made from a chain of smaller and smaller copies of it. The see-through layer of the glass brain brightens toward its rim by a power of one less the share of the surface that faces the eye. Where a surface faces the eye exactly, rounding in the graphics card can put that a hair below zero. The power of a negative number is not defined in a shader, and the pixel came out as a value that is not a number. At that look there was one such pixel, at (1133, 354). Every copy in the chain that took it in became such a value too, and the square is the smallest copy's footprint, drawn white.

**Decision.**
- The three rim terms of that form are kept at or above zero before the power is taken: the see-through glass (`GLASS_RIM_GLSL`), the glass shell (`glassReadGlsl`) and the glow rim (`patchGlowRimShaders`), all in ns-scene-three. Only the first was shown to give the bad pixel. The other two have the same form.
- The glow's first step reads the picture clamped to the range 0 to 64, and adds nothing for a value that is not a number (`HDR_BLOOM.safeMax`). The brightest values the picture holds are a few units (a flash peaks near 3), so the glow is as it was. The step is there so that one bad pixel, from any material, stays one pixel.

**Checked.**
- At the exact look, with only the glow's step changed: 318 pure-white pixels and no square. With only the rim terms changed: the bad pixel is gone. With both, at nine looks round the exact one: between 304 and 378 pure-white pixels and no square.
- The full scripted run ended without an error. Each of its eight pictures has the same count of pure-white pixels as before the change, to within 3.
- Frame rates, one run of the script of section 71 with the changes of sections 73 and 74: sitting still 60, looking around 59.5, reaching 59.6, holding the mirror body 51.1, carrying it 51.9 (longest frame 50 ms), the slow limb turn 58.7, looking around again 60, the view over the shoulder 57.5. Each is inside the range of section 71.
- `tests/shader-safe.test.mjs`, 5 cases on the shader text: every power in the three changed shaders has a base that cannot be negative, and the glow's first step has the clamp and drops what is not a number. Each of seven deliberate faults put into a copy of the code failed a case. All 26 node tests (16 files) pass.

**Limit.**
- The cases read shader text. They cannot show what a graphics card does with it. That was checked by pictures only, in headless Chromium on one machine.
- The shaders of three.js itself were not gone through for other terms of this kind. The glow's first step is what would hold one of those to a single pixel.

## 75. No start page: the parts come together while they load (17 November)

The user: "I don't want a start page anymore. Instead, don't have a loading page. Instead, have a visual of all the parts and components coming together. When they're loading, because obviously it takes time to load. So you can physically see the muscles and the bones and the parts of the brain and the mirror body load."

What the game did: it opened on a page with the instructions, a keyboard picture and a "Start now" button, and that page stayed until every file was in and for two seconds after.

What it does now. There is no start page and no loading page. While the files load, a picture covers the canvas: the atlas body stands in the lower part, facing you like the mirror body will, and the brain is above it, six times larger than in the head and tipped 48 degrees toward you so the motor strip shows. Each bone, muscle and brain part flies in from a little way out and settles in its place when its file arrives, with a short flash; a thin bar at the bottom shows the share of the 611 files that are in, and pulses once nearly all are in and the page is building the body. When the game has drawn its first view the picture fades out over it in 0.8 seconds and play begins at once. Esc still shows the instructions.

How it is made. The picture has its own canvas and is drawn by a worker (`ns-assembly-worker.mjs`, `ns-assembly-core.mjs`), so it keeps moving while the page's own thread is busy. The launcher hands the worker a copy of each file's bytes from its ordinary fetch function, and the kinds of part (bone, muscle, eye, brain, strip) from the packet manifests; the game receives exactly what it received before. The worker reads the triangles with a small reader of its own. Where a worker canvas is not available the same picture is drawn on the page, and then pauses while the page is busy; if that fails too there is no picture and the game loads as before.

What it is not. A picture of the loading only. It shows the files in the atlas's standing posture and plain colours, not the game's seated body, and it verifies nothing: the game's loader still checks every file's hash and shape, and a part shown in the picture could still be refused there.

Measured on the test machine (one desktop browser, files from the same computer). Before: the files were in after about 6 seconds and the page then built the body for about 6 more, with one stretch of 4.3 seconds in which the page could draw nothing. Now the worker drew about 30 pictures a second through the whole load, including those stretches (15 one-second samples, 30 or 31 frames each). The game was ready after 15 to 17 seconds instead of 12 in that test browser, which had a single processor core for the page and the worker together; on a computer with several cores the difference has not been measured. The worker is held to about 30 pictures a second to leave the processor to the loading.

Tried and rejected: drawing the real game scene as it loads. The game builds its rig, posture and muscle layers from the complete set of files, before its first frame, so nothing of the real scene exists to draw until the end.

Not done: the picture does not show your own seated body or the mirror body in its game posture; the change from the standing atlas figure to the game's first view is a cross-fade, not a movement.

## 76. The main controls for the first five seconds

The user: "for the first 5 seconds, I want you to have an overlay of the main controls. WASD, ER, space, and trackpad with click."

Two small panels stand either side of the loading picture for the first five seconds of the page, then fade: on the left the keys W, A, S, D, E, R and Space with one word each (move, grab, view, info); on the right a trackpad with a moving finger and a click mark, and three pairs of words (move: look, click: press, drag: turn). The fade is a CSS animation, so it happens on time even while the page is busy. In a narrow or upright window the panels sit side by side along the bottom. On a computer that loads everything in under five seconds the panels stay over the first moments of play and take no input.

## 77. A quiet screen, and a tip that says what an area does

The user: "Way too much text now. The amount of text is completely overwhelming." and "bring back the feature where if you highlight any part of the brain, you see what it does, its function essentially, and the brain turns into a bunch of buttons ... a control panel."

Before, the first view carried about 25 pieces of text: a line of limits across the top, a preview note, a "Try this" card, a "Looking at" card with a second line of controls and a note about the model's name, an information card, a hint line, the words "Your left" and "Your right", and ten two-line names on the brain.

Now the game starts with the cards off (the state the R key already had as "off"). What is left:
- a tip beside the crosshair: on a motor area, the area's name and its movements with their number keys ("Left thumb: 1 Bend at the knuckle, 2 Straighten at the knuckle ..."), the way a key shows its legend; a movement that would move nothing now is dimmed. On a body, the name of the muscle or bone. It follows the free pointer when the pointer is not captured. It changes at once, without the third of a second the information card waits;
- one short line at the top: the guide's current goal in at most 48 characters ("Look at a blue area on the brain", "Press 1 or 2");
- the ten names on the brain, one line each;
- at the bottom left, in small grey type, "Simulated activity · experimental preview · notes and credits"; at the bottom right "R info".

R brings the cards back as they were (R: cards, R: More detail and the colour key, R: off). The long limits line across the top shows with the cards; with the cards off the small line at the bottom left says that the activity is simulated, and links to the notes.

This overturns two earlier decisions: the cards on at the start (Message 48, section 54) and no name next to the crosshair (Message 37, section 51). The reason for Message 37 was a caption that changed with every pixel of movement; the tip names areas and parts only, and the number keys need their list somewhere once the card is off.

Not done here: the look of the areas as buttons, and a stronger activation on the strip, are being built separately. The Esc page is still long.

## 78. The limb turn is led by the wrists and ankles

The user: "with pronation, supination, / internal rotation, external rotation, you've gone way too far. What I really want is for the wrist / ankle to be the main moving element instead of the massive movements you're doing at the moment, where really the hip or the shoulder with the elbow and the knee are leading the movement ... any elbow or knee movement and minimal shoulder and hip movement follows from there. And really we're showing the overside muscles and then the underside muscles. That's the whole point of it."

Before (section 31), a Space double tap turned each forearm through its whole range and each upper arm from 70 degrees inward to 90 outward, and each hip from 40 inward to 45 outward; the legs had no other joint in the turn.

Now the far end of each limb leads and makes the whole turn: the forearm turns the palm up and down (80 degrees each way from thumb-up on the left arm, 0 to 160 on the right), which shows the front and then the back of the forearm and hand; the ankle turns the sole outward 15 degrees and inward 35, the range of the map's own "Turn sole" movements. The upper arm and the thigh only follow: for a whole stroke of the leader the upper arm turns 14 degrees and the thigh 10, the same way, from wherever they are and inside their own ranges, and less for a shorter stroke. Elbows and knees are not moved by the turn. The ankle's own motor area and its muscles (the fibularis group outward, tibialis posterior and anterior inward) light with it; a follower's glow is about a third of its leader's.

Measured in the game: after one double tap the right forearm went from 160 to 0, the right upper arm from 0 to 14, both ankles from 0 to 35 and both hips from 0 to -7; after the next, 160, 0, -15 and 3.

The rule "each limb keeps the direction it last moved in" and the two speeds are unchanged. The numbers 14 and 10 are a display choice, not a measurement of how much a shoulder or hip turns with the hand or foot.

## 79. A wider view from the eyes, and a look that reaches further

The user: "the field of view should be even wider, such that you can see everything from your eyes. Including everything from the neck down, essentially." and "you should be able to move the head around much more and see other parts of the body, just as you would in real life, because often limbs become out of view and you can't control them anymore."

The view from the eyes is 108 degrees from top to bottom, about 136 across a 16:9 window. It was 90 since 11 November (section 23) and 120 before that, which the user then called absurd at the edges. At the start both arms and the legs down to the knees are now in view, where only the hands and feet were; looking 60 degrees down shows the chest, both arms and the legs together. A flat picture this wide stretches what is near its edges: your right arm, close to the eye at the side of a downward look, is drawn clearly too large. A view of everything from the neck down in one level look would need about 170 degrees, which a flat picture cannot show; a curved (fisheye) picture could, and has not been built.

The head's range was not the limit: it was already the neck's and trunk's whole range, 120 degrees to each side, 80 down and 70 up, and no look was being refused. But one pixel of pointer travel turned the look 0.0025 radian, so the end of the turn was about 840 pixels away, several swipes on a trackpad. It is now 0.0038 radian, about 550 pixels. The dead band that keeps one pixel of jitter from restarting an area grew with it, from 0.2 to 0.31 degrees. The Esc page's look speed still scales it.

## 80. Hold with Space, move with the pointer (17 November)

The user: "I want trackpad drag to move items essentially within the XY dimension, whilst WASD moves things in the XZ dimension. And click cursor to move things in the orbital rotation direction. So one of the main issues is when you grasp cursor, you're not actually moving things. When it comes to the mirror body, up and down, you need to be able to move up and down." and "ensure that you can control limbs if you're, say, grasping or clicking, even if the cursor moves away, as long as you're continuing those functions."

Before (section 54, Message 46): while Space held a thing, the look carried it, so the camera turned and the thing stayed under the crosshair; on screen nothing seemed to move. The mirror body was carried along the ground only.

Now: while Space holds the brain, the mirror body or one of your limbs, the pointer moves THAT THING across the view, left, right, up and down, about a pixel of thing for a pixel of pointer, and the view stays where it is. The mirror body lifts off the ground and comes down again; its centre stays between about one body length below where it starts and two above, so it cannot be lost under the floor. Pushing a held thing past the comfortable part of the view turns the look, which carries it on. W, A, S and D stay level: A and D sideways, W farther, S nearer. A press and drag with the pointer button still turns a thing about itself. A hold or a drag keeps the thing it started on until it is let go, wherever the crosshair is meanwhile. The held thing also follows a free, uncaptured pointer.

This replaces the swing-around-you reading of Message 46 for the pointer.

## 81. The mirror body: its trunk takes the whole body, its limbs are yours; both hands close

The user: "if you grab the mirror body by the torso, you're controlling the whole body. But then if you target, grasp, or click specific limbs, then you're controlling those limbs such as you would your own." and "when you grasp-cursor, for the right hand to also grasp."

Space or a press on the mirror body's head, neck or trunk takes the whole mirror body, as before. On one of its arms or legs it now holds or turns YOUR matching limb, since the mirror body is your reflection: your limb moves and the reflection shows it. Directions are the ones seen on the mirror body: the pointer to the left moves the drawn limb to the left.

While Space holds anything, the right hand closes like the left, and its finger-bending muscles and the right-hand part of the strip light on your body and on the mirror body.

Considered and withdrawn by the user the same day: the right arm following the cursor all the time ("the cursor is already controlling the left arm, so it's quite confusing"). The right arm follows the pointer only while Space holds it.

## 82. Moving lights what moves

The user: "when you're moving the cursor around. That's naturally going to activate muscles of the shoulder, etc., muscles of the neck, etc."

Turning or nodding the head with the pointer lights the neck muscles of that direction, the trunk's when the trunk turns or bends, and the neck part of the strip; the left shoulder's muscles light as the left arm follows the look; every joint of a limb that is held or turned lights its own muscles and its area. The glow follows the speed of the movement and fades when it stops (`ns-move-glow.mjs`). The muscle lists are the body map's own, for the direction moved. These are simulated display values, like every glow in the game.

## 83. A living brain, and motor areas as keys

The user: "The brain area looks awful, by the way. Maybe it should be far more fleshy and with far more colorful areas."; "neural activation should be much more obvious on the motor strip"; "the brain turns into a bunch of buttons essentially. So the brain turns into a control panel essentially."

Before: a dark grey glass shell with pastel, half see-through motor areas.

Now the shell is shaded as cortex in the same single draw: a pink-grey surface with lit folds, dark sulci and a wet sheen, on the space-black background. The motor strip cuts it exactly (a stencil mark written by the strip's own first pass), so the areas stay whole and crisp from every side.

Every area keeps its body part's colour family (blues for the left arm, oranges for the right arm, purples and yellows for the legs, greens for the trunk, pinks for the face), in saturated shades that alternate along the strip so that no two neighbours look alike; the two halves match.

Each area is drawn as a separate raised key with a dark gap to its neighbours. The key under the crosshair lights in its own colour inside a white frame, and the tip beside the crosshair (section 77) names it and lists what it does. A new activation pushes the key down for a moment and it springs back. While an area is switched on, only that key sends out its colour far above white, so it has a halo, inside a white-hot frame, with a slow pulse and a ring running from its middle to its edges; every other key dims. A glow that only shows how the head is held stays a calm background light.

Not built yet: the brain beating and reacting as an exposed brain does in surgery (asked for on 17 November). The loading picture's brain already beats (section 75).

## 84. The look reaches all the way round

The user: "make sure the neck has extreme range of motion, so any part of the body is available from first person view", in the same note as "does not result in impossible ranges of motions and dislocations".

The look now reaches 180 degrees to either side, 88 down and 85 up (it was 120, 80 and 70). The drawn neck and chest are not turned further than before: past the end of their turn (the neck's 80 degrees and the chest's 40) the EYES turn the rest of the way, up to 60 degrees, so the camera turns in the head while the head stays at its end. Down and up, the neck and trunk already had the range; only the camera's own stops were nearer. Looking back over a shoulder and down now shows that shoulder and the back behind it.

This replaces "the eyes never turn in the head" (section 32) for the part of a look the head cannot reach. A wrung neck would have been the other way to do it, and the same note asks for no impossible positions. The 60 degrees is a display choice, not a measured range of eye movement.

## 85. Small things of 17 November

- The short Esc page shows its buttons, the settings, the keyboard picture and the list of controls; its paragraphs are under "Show the full instructions". About 1300 pixels tall instead of 2250.
- The loading picture's brain swells a little with a heartbeat shape on a slow breathing rise and fall.

## 86. Lying back as on a declined sofa; a look a little downward; the brain lower

The user, in a run of notes on 17 November: "the field of view should be even wider, such that you can see everything from your eyes. Including everything from the neck down"; "Think about someone who is leaning laid back in a really leaning laid back chair, they can see everything at the front of their body from the chin down all at once, shoulders, chest and everything"; "Torso should be declining back in an invisible imaginary decline sofa"; "the shoulders rolled forward and the back convexly curved"; "see all of the front of the torso at once without the chest pumping out but depressed down/inwards"; "full neutral hip extension. The bend is from the back and not the hips"; "Almost full kyphosis/flexion of the spine for full view"; "what if we made the brain far lower so that the relevant body parts were always in view?"; "You will naturally be looking a little downwards and that is where the motor strip should naturally be."

Before: the body sat upright on the ground with the hips bent 90 degrees and the legs out in front (section 22). From the eyes an upright trunk is straight below the chin, so a level look showed the hands and feet only, and the brain was above eye level, so aiming at it took the body out of view.

Now the body lies back as on a declined sofa (none is drawn). The hips are straight: the pelvis and legs lie level and in line. All of the bend is in the back and neck: the trunk is rounded forward 68 of its 80 degrees and the neck 22 more, which brings the head upright. The right arm is raised 68 degrees from the trunk so that it still points level forward. The game starts with the look 20 degrees below level, and the brain starts 20 degrees lower than it did. The first view now holds, from top to bottom: the whole motor strip, the mirror body under it, your feet, legs and pelvis, both arms, and your chest at the bottom edge.

How it was reached. The posture is the neck and trunk bend of `BODY_POSTURES.open` (the bake keeps the skull in place, so bending the neck and trunk forward lays the body out ahead of the head). Five distributions were drawn and looked at: 30 + 12 with hips 48, 15 + 40 with hips 35, 40 + 25 with hips 25, then, after "full neutral hip extension", 40 + 50, 30 + 60 and 18 + 72 with straight hips; 22 + 68 is "almost full" flexion of the trunk and leaves the neck 28 degrees for the downward look.

What had to change with it. The look's ranges are now counted from the posture's own neck and trunk bend (`headLookLimits` takes the rest angles), the head joints handed to the rig and the camera add that bend back, and the bend is no longer read as a held neck movement. Before these three fixes the camera stood behind the neck stump and looked down into the chest.

Limits. The rig bends the trunk at two joints below a rigid rib cage, so the rounding shows at the waist, not between the shoulder blades, and the rig has no joint that rolls the shoulder blades forward. The chest still hides most of the belly from the eyes. With the trunk already rounded, the look reaches 40 degrees below level instead of 88; up and sideways are unchanged. The mirror body lies back too, since it is your reflection, and its head and shoulders stand in front of the leg areas at the lowest part of the strip. The view over the shoulder (E) was not re-framed for the lying body.

## 87. Muscles stay on their bones

The user: "fix it when muscles essentially become detached, which is still a problem when they're moved into certain ranges of motion"; "Make sure clicking of the muscles does not result in impossible ranges of motions and dislocations and detachments of muscles, as currently happens"; "No muscles or joints should be pointy (unless naturally so), detached, dislocated"; "test all major ranges of motions for plausibility".

The cause. A muscle that crosses a joint was drawn as ONE rigid piece, a least-squares fit between the bones it attaches to (226 of the 232 muscles of the body cross a joint: 819 thousand of 844 thousand vertices). Near the start posture the fit is close. With a joint far from it, both ends of the muscle stand off their bones: the hamstrings and the calf at a bent knee, the hip flexors at a lifted thigh, the deltoid and the chest muscle at a raised arm, and, with the new posture, the belly muscles on the rounded trunk. Only the right hand's, the right forearm's and the neck's muscles were skinned per vertex (sections 40 and 53).

The change. The neck's rule now holds for every muscle that crosses a joint: each vertex follows the two bones nearest to it, with the continuous weights that avoid a jump where a third bone becomes the second nearest, in the baked start posture and in every pose. A muscle's ends therefore stay on their bones and its belly bends with the joint. The five deep neck pairs that were kept rigid for speed stay rigid.

Cost, and how it is held. The scene re-skins a muscle only when its bones have moved against each other since its last skin: now by a third of a degree or half a millimetre (the comparison is with the pose of the last skin, so small steps add up), and it writes at most 60,000 vertices per frame; muscles that wait keep their rigid matrix, so they still move with their bones, and are skinned on the following frames. In one scripted run on the test machine's single processor core, with the script itself competing for it: looking around 32.4 frames a second (32.1 before the change), bending the trunk with the look 34.1 (32.8), the slow limb turn 32.0 (34.4), still 60 (60). Without the budget the same run gave 29.5, 28.7 and 30.3.

Checked: a bent knee, a lifted thigh, a raised right arm and a bent right elbow, alone and stacked, on your own body and on the mirror body brought close, in pictures. Muscles followed their bones in each.

The sweep (`node tools/rom-sweep.mjs`, added with this change). Every movement of the body map (108) and six stacks of movements (thigh lifted + swung out + knee bent; right arm up + across + elbow bent; lean back + turn + head back; bend forward + head forward + head turned; both knees bent + both thighs lifted; right arm back + out + elbow bent + palm up) is posed with the game's own rig and skin, and two things are measured as the change from the start posture: how much farther from its bone each attachment vertex of a muscle is (206 of the 232 muscles; a vertex within 6 mm of a bone the muscle attaches to counts), and how much the closest approach of two bones that meet at a joint has grown (99 bone-to-segment pairs).

Muscle ends, 114 poses:

| | poses with an end over 8 mm | ends over 8 mm | over 20 mm | over 40 mm | largest |
|---|---|---|---|---|---|
| one rigid piece per muscle (before) | 60 | 1158 | 393 | 153 | beyond 60 mm (gluteus maximus 72 mm off the thigh at a lifted thigh; external oblique 58 mm off the pelvis at a side bend) |
| skinned per vertex (now) | 26 | 96 | 10 | 0 | 34 mm |

What is left over 20 mm now: the right rhomboid and serratus anterior, 24 to 34 mm, which lie ON the ribs and slide over them when the shoulder blade moves with a raised arm (they are not torn from an attachment); and the lower end of rectus femoris, 31 to 32 mm from the shin at a fully bent knee, because it follows the thigh bone and the kneecap is not one of its bones.

Joints: no hip, knee, elbow, ankle, wrist or finger joint opens by more than 4 mm in any pose. Over 5 mm: the right shoulder girdle lifts off the rib cage by 22 mm with the arm raised 180 degrees and by 36 to 37 mm with the arm back, out and bent; the kneecap ends 21 mm farther from the tibia at a fully bent knee (it stays on the thigh bone; 0.8 and 0.9 of the knee's turn were tried and left the thigh bone by 13 to 15 mm instead); the jaw joint 10 mm at a side shift of the jaw; the spine up to 7 mm at a full turn of the trunk.

The sweep measures geometry in the game's own model. It does not see one part passing through another, it leaves out the right forearm's twisted muscles and the left game arm, and it does not judge whether joint angles are believable in combination: every angle stays inside its own single-axis range (the rig clamps it), and no rule yet limits combinations.

Still open from the user's notes: the shoulder girdle's lift, the kneecap and the lower end of rectus femoris; a combined-range rule; pointed shapes (the sweep does not look for them). Linear blending also thins a muscle at a sharply bent joint. The left game arm has its own skinning and was not changed.

## 88. Number keys with the cards off

With the cards off (the start, section 77) the number keys did nothing, because they took their list from the information card. They now do the movements the tip by the crosshair lists, at once, without the third of a second the card waits, and keep the list of the last area the tip showed, so they still work while you look down at your body.

## 89. A brain that beats and reacts (18 November)

The user: "Perhaps let's also get a beating reacting brain as you would see in neurosurgery."

Before, only the brain in the loading picture moved. Now the game's brain beats: a quick rise and a slower fall about once a second, on a slow swell like breathing, with the same wave and the same clock as the loading picture. The wet highlights slide over the folds with it, the tissue flushes a little at the top of a beat, and fine red vessels with twigs and blue-violet veins along the groove lips lie on the surface.

How the beat is drawn. The brain's group, its picking, labels, arrows and contact spheres are not touched. Every brain material moves its vertices by one shared rule (`ns-brain-live.mjs`, `nsLiveMove`), so the surface, the keys, the outline and the small markers never separate. The beat is a plain scale about the point of the crosshair's line of sight that is nearest the brain's centre. A scale about a point of that line leaves the line where it is, so what is under the crosshair stays under it through the whole beat, and aiming, which uses the rest shape, agrees with the picture there.

It reacts in three ways.
- To the look and to activity. An area the look rests on shows a faint flush of its key's colour and dips slightly. A movement switched on gives the full bloom: the tissue round the key swells a little, flushes and takes the key's hue while keeping its own folds and shine, and one ring of the key's colour runs outward for 0.8 s. The beat picks up 14 % for each area that is on, to at most 1.45 times, and settles back over a few seconds. The grey in-between areas do not bloom. The hand area of a Space grip shows a fifth of a bloom while it holds.
- To being handled. While the brain is carried or turned the tissue trails behind and swings into place when it stops, like firm jelly: a damped spring at 3 Hz, at most about 4 mm of lag, at rest about half a second after the stop. Nothing moves at rest.
- Under `prefers-reduced-motion` there is no beat, no wobble, no swell and no ring; an area that is on shows its colour steadily.

Measured, in the builder's worktree with the brain at its former size: one beat moves the brain's outline about 6 px on a 1600 by 900 canvas, and 2.2 % of the pixels change by more than 5 %. Since section 90 the brain is drawn about half as wide at the start, so the beat moves about half as many pixels there. Frame rates were equal to the build before within scatter. Twelve tests hold the rules.

An independent checker tested the first version and found the beat too small to notice, the bloom washing the tissue out while something was held, and no wobble for W/A/S/D and the arrows; the numbers above are after those were fixed.

Limits. Nothing was watched in motion by anyone: the beat, the wobble and the ring were judged from single frames, edge records and state numbers. The vessels are drawn by a rule, not from anatomy: forks are few, and in places a vein follows both lips of a groove and reads as a soft violet outline. While the brain is carried, the picture and the aim differ by up to about 4 mm for half a second. The labels do not move with the tissue. The key under the crosshair dips by 0.8 mm, which is hard to see from straight on. At low quality levels the brain's surface shows ragged dark holes at edge-on views; that was there before and is not fixed.

## 90. A back that bends at every vertebra; a diagonal downward gaze (18 November)

The user on 17 November: "Think about the shoulders rolled forward and the back convexly curved"; "see all of the front of the torso at once without the chest pumping out but depressed down/inwards"; "Almost full kyphosis/flexion of the spine for full view". On 18 November, on the ninth upload: "I want flat depressed chest not booby pumped out chest. And you are gazing diagonally downwards. You should be able to see your own shoulders and stomach/abs."

Before, the trunk bent at two joints under a rigid rib cage (section 86), the eyes looked 20 degrees below level, and the chest hid the belly.

What is built.
- The spine bends at every lumbar and thoracic vertebra (the rig has 93 segments instead of 41). About two thirds of the forward bend is taken in the low back, where the hollow flattens and reverses, and one third between the rib-bearing vertebrae. Each rib goes with its vertebra and the breastbone hangs on the ribs as a linkage, so the front of the chest closes up and drops as the back rounds.
- The shoulder girdles roll forward with the bend (0.2 degrees per degree, at most 16), each collar bone working as a strut between breastbone and shoulder blade, and the head is carried forward by the same share.
- The start posture is trunk 80, neck 10 (the pelvis and legs stay level; the limit of the forward bend is now 90 so that "Bend forward" still moves). The right arm rests beside the trunk with the forearm on the right thigh.
- The eyes are lowered 22 degrees in the head while the head is level or bowed. The game starts with the look 36 degrees below level: the head bowed 14, the eyes the rest. The look goes on down to about 70 degrees.
- The brain is drawn about half as wide at the start (`BRAIN_START_MOTOR_FRAC` in `ns-app.mjs`), so that the whole strip is inside the top of the picture above the mirror body and your feet.
- The view from outside (E) orbits a centre fixed over the body with its own 60 degree view, so the body is seen whole and in true proportions.

From the eyes at the start, the chest now lies in about the lower fifth of the picture, with the belly, pelvis, both thighs, knees, shins and feet above it and both forearms on the thighs.

Three builders worked on this in turn, each after an independent checker had tested the one before. The checkers found, and the later builders fixed: two trunk movements stacked pulled the chest apart; any trunk turn tore the chest open from the eyes (the eyes now ride on the body as drawn); "Lean back" stopped the game; the shoulder blade stood off the ribs when the right arm was raised.

Not achieved, and still asked for.
- Neither shoulder is in the start picture. The shoulder joints lie 7 cm behind the eyes and 15 cm below them, and no gaze of 36 to 45 degrees with this field of view reaches them. They come into the lower corners past about 55 degrees down.
- The chest is not flat. It is lower and smaller, but it is the same deep chest of the source model: two rounded mounds from the eyes, a dome that fills the lower half when you look straight down.
- The crosshair does not start on the motor strip. It starts on your own knees, about 22 degrees under the strip, and every area is smaller to aim at than before.
- The trunk's turn and side bend are taken mostly in the low back, more than a real spine gives there, because the ribs are rigid pieces.
- Looking up and far round to the right is closed off from 155 degrees: the look reaches only 30 degrees up there, where the left arm was drawn torn.
- Looking down to the left, the left shoulder is drawn as broken pieces with the arm bone showing. A white strip of spine shows between the two straight belly muscles.
- The sweep on the merged build (117 poses): a muscle end more than 8 mm farther from its bone than at the start in 26 poses, a joint more than 5 mm farther apart in 12; the largest are still the lower end of rectus femoris (32 mm) and the kneecap from the tibia (21 mm) at a fully bent knee. Counted from the start posture the right shoulder girdle now moves at most 7 mm from the ribs when the arm is raised (before: 22 to 37). But the start posture itself, against the source pose, is less clean than before: 18 of the 827 muscle ends the sweep now measures are more than 8 mm from their bone, the largest 16 mm (by the earlier count of 436 ends: 10, before: 2), and the right shoulder girdle stands 14 to 23 mm farther from three ribs than in the source pose, which the builder reads as the blade sliding outward with the shoulder roll. Single rows are worse than before: "Bend head forward" 11 to 13 mm, "Lean back" joint 1 to 6 mm, "Swing right arm down and back" 10 to 13 mm.
- From outside, the brain is cut off at the right edge at the start. Loading takes about a second longer.

A next package is given the two things the three builders did not allow themselves: a camera set back from the anatomical eye, and a thinner chest muscle.

## 91. Slumped back, the whole torso in view, the motor strip under the ankles (18 November)

The user, after the tenth upload with its rounded back, in a run of notes: "maybe I was wrong about the spinal flexion. I think we need to go into spinal extension, quite frankly. while still leaning quite a bit back"; "we want maximum posterior pelvic tilt with some degree of neck flexion so that you can look down upon your body. And then we want the motor strip, the middle bit, to be below our ankles, essentially, so that the body is actually above the motor strip, even if that means parts of the body occlude parts of the motor strip. And perhaps we do want a slightly wider and larger motor strip, which will probably also mean a larger brain"; "there's essentially minimal elbow and knee flexion initially, although they must still look naturalistic, but yet be fully extended out"; "all of the torso has to be visible at once, even if that means you're a little flat-chested. Maybe we need an even greater field of view."

Before (section 90): the whole back was rounded, the chest lay as two mounds under the chin, neither shoulder was in the start picture, the crosshair started on your knees and the brain was drawn at half size above your feet.

Now the body is slumped back as on a sofa.
- The pelvis is rolled under by 55 degrees, a bend of the low back only (a new posture term, `pelvic_tilt`). The upper back is straight, 5 degrees into extension, and leans back. The neck is bent 40 degrees. The hips are neutral and the legs level, spread 7 degrees each, with the knees 6 degrees soft. (The eleventh upload had them 12 degrees apart; the user: "I'm not sure that the ankles should be so wide apart ... as long as when we're showing the overside, the toes and the front of the feet don't merge into each other, it's really no problem". At 7 the feet stay clear of each other on the overside, checked in a picture; narrower leaves no room for the feet to turn toward each other.) The right arm is stretched toward the knee with the elbow at 8 degrees. The trunk's own forward bend stops at 30 degrees from this posture.
- The picture is taken from 12 cm above the eyes, on the head's own upward line, and 1 cm back, with a field of view of 116 degrees (it was 108). The look starts 41 degrees below level and goes down to 75. For upward and far sideways looks the view point eases back to the eye.
- The chest muscles are drawn at about two thirds of the source model's depth (13 mm where the source has 21 in the part from the breastbone); their hold on collar bone and breastbone is kept. The two straight belly muscles are closed at the midline, where the source meshes left a slot through which the spine showed.
- The brain stands beyond and below the feet, larger than it has been: the strip is about 800 px wide on a 1600 px picture (640 before the tenth upload, about 400 in it). The middle of the strip is just under your ankles and shows between your legs; the crosshair starts there. The mirror body stands in the hollow of the strip, above your feet.

The start picture, from the bottom up: the collar bones along the lower edge, both shoulders in the corners, the flat chest, the stomach, the pelvis, both legs running up to the feet, the motor strip behind and round them, and the mirror body above. Your legs hide part of the strip's middle; an area behind a leg is still taken by the crosshair (the tip names it), and Shift takes the leg in front.

How it was reached. Three builders had kept the camera at the anatomical eye and the chest muscle's shape, and could not get the shoulders or a flat chest (section 90). Both limits were lifted by decision. The view point was first set back along the line of sight; that showed the open root of the neck at steep downward looks, and the head-mounted point above the eyes replaced it. The crosshair's line is therefore parallel to the eye's own, 12 cm above it, not the same line. Looks of 31 to 39 degrees put the start crosshair on the mirror body's lower arrow, so that the first click tilted the mirror body; 41 clears it.

What it costs and what is not right.
- With the wider view, things in the middle are about a seventh smaller and the corners stretch more.
- The stomach is a narrow band, about 50 px of 900, and the legs are seen at a flat angle: with a straight upper back the eyes sit low over the chest.
- The brain is not tilted to face the eyes; it is the same upright picture, lower and larger. From outside (E) the brain is a very large shape under and round the body, and it hides the pelvis and legs from most sides. Whether the legs clear the brain everywhere was not measured.
- The left game arm still reaches level into the picture instead of lying along the thigh like the right one.
- A full trunk turn now moves the view point about 120 mm (45 before), because it sits above the eyes.
- At the start posture, against the source pose, the largest muscle-end distance is 23 mm in the neck and upper back (16 before), with 13 of 829 ends over 8 mm (18 before).
- Not checked by the builder on the final build: the trunk movements from the strip, the look extremes as pictures, reduced motion, frames per second. An independent check of this package was still running when this version was published; its findings go into the next one.

## 92. A double tap is a quick switch between the underside and the overside (18 November)

The user: "we start the game in an underside view of the limbs. And of course, if you double tap, you'll get the overside. And then if you double tap and hold, you will continuously slowly switch between the two. But if you just double tap, it will be a quick switch."

Before (section 78): a double tap turned each limb to its own next end in about a second, each limb by its own history, so limbs could end on different sides; the game started with the right palm down, the left thumb up and the soles level.

Now the limb turn has two named sides. The underside is palms up and soles turned outward (the "open" ends of `ns-dance.mjs`, `DANCE_UNDERSIDE`); the overside is palms down and soles inward. The game starts on the underside: the start posture holds the right forearm and both ankles there, and the left forearm's default is palm up. A double tap switches all four limbs together to the other side in 0.4 s, every limb at the same speed. The side they go to is the one most of them are not on, judged by the four leading joints, so limbs that an activation has left on different sides are brought together. A limb already there stays. A second double tap during the switch turns it round. A double tap held goes on as before, slowly, limb by limb, between the two sides, and stops where it is when the key is let go.

Checked in the browser: from the underside a double tap had both ankles at their other end within 0.3 s; a second brought the forearm and ankles back; held, the right forearm ran from one end to the other about every 2.5 s. Four tests hold the rule. The left forearm's palm-up start was not looked at in a picture.

## 93. The bodies are painted, not banded (18 November)

The user on 17 November: "we want a hyper-detailed hyper-real glossy fleshy but not gory or bloody yet still somewhat viscerally disturbing telltale games art style rather than borderlands". On 18 November: "Some rough patchy small-poxy muscles need work such as pelvis / hip flexors."

Before, muscle was shaded in two or three hard bands with hatching and bold black outlines. Now (`ns-flesh.mjs`) the light runs smoothly from a warm deep shadow to the lit side; each muscle carries fibre bundles that run along it and fan where it narrows, each bundle with a streak of wet highlight; a muscle seen edge-on stays one smooth piece. Contours are thin and of even weight; the bold loops round the fingers resting on the thighs are gone. The lower belly is clean: rectus abdominis has its own smooth border where it crosses the oblique sheet, without the saw-tooth edge, the islands and the row of specks. A lit muscle keeps its area's colour under the highlight.

It was built by one helper, checked twice by independent checkers and fixed twice. The first check found a new shimmering, pock-marked patch on the left shoulder at grazing angles, less gloss and a narrower range of tone than before (measured on paired pictures), and the lower belly only partly cleaned; the second found that a lit belly lost its colour under yellow and white bands and that fibres ran crosswise on some strap muscles of a lifted thigh. Those are fixed.

Limits. Fibres follow each mesh's long line, not the anatomy: on oblique sheets (external oblique, parts of trapezius, gluteus maximus) and on meshes that hold several muscles the lines run along the mesh. Very coarse meshes show flat facets close up (under the armpit). A dotted dark line along rectus abdominis' tendinous lines and a dark strip at the costal margin remain. Bones have no warmer ends and there is no cartilage tint; arrows and eyes were not restyled. Iliacus and psoas themselves, the feet, the face and the mirror body near were not seen close up. Frame rates were measured on a loaded machine and are not shown clean.

## 94. Joints: a kneecap that stays on the knee, a rule for angles in combination, feet that turn 90 degrees, and the skinning that was off (18 November)

The user: "Make sure clicking of the muscles does not result in impossible ranges of motions and dislocations and detachments of muscles"; "test all major ranges of motions for plausibility"; "when we mean underside, overside for the legs, really, the ankles and the feet should be traveling the full 90 degrees either way"; "make sure limbs can't be put into impossible positions"; "introduce subtle, natural, physiological details during movements, such as joint varus/valgus during rotation".

A fault found on the way, and its reach. From the tenth upload to the twelfth the game drew EVERY muscle as one rigid piece: the per-vertex skinning of section 87 did not run. The right forearm's twisted skin kept its map numbers in 8 bits; when section 90 took the rig from 41 to 93 segments the numbers no longer fitted, the first skin call failed, and the game fell back to rigid muscles from the first frame without saying so. The checks of sections 90 and 91 measured the skinning in software and in tests, where it ran, and did not catch it; an independent checker of this package saw it in the game (finger tendons standing straight beside a bent wrist, a needle at the top of the shoulder). The slots are 16-bit now and the game reports the skin as running. The price is real: while things move, the game is about a fifth slower than those three uploads, which skinned nothing.

What else is built.
- The kneecap turns with the shin and sinks between the condyles (0.1 to 0.9 mm from the thigh bone at every angle); the front thigh muscles wrap round the end of the thigh bone with it.
- A combined-range rule in the joint clamp (`COMBINED_RANGE`): the knee by the hip, the hip's turn and spread by its bend, a lifted thigh against a bent trunk and a rolled pelvis, neck tilt by turn, trunk side bend by turn, wrist side bend by bend, foot turn-in, finger spread in a fist, the shoulder's raise against its lift to the side. Each number carries its textbook source or says it is a display choice. A single movement's goal is now the end that is drawn: "Bend knee" from the start posture goes to 120 degrees, not 135, because the hips are straight there.
- The leg turn (`leg_turn_L`, `leg_turn_R`): a graded twist of the whole leg led by its far end, the foot first, then the shank at the soft knee, then the thigh in the hip. The joint reaches 90 degrees either way (outward: foot 15 + shank 20 + thigh 35 degrees; inward: foot 40 + shank 30 + thigh 40), and the thighs part just enough for two inward feet not to meet. The Space double tap uses 45 degrees of it either way: the user first asked for "the full 90 degrees either way" and then, the same day, "Maybe let's make the foot turn 45 degrees and to have feet that are, you know, completely flat when they're turned outward would be an extreme amount of flexibility. So just imagine a V followed by an A when they're turned inward." So the game starts with the feet 45 degrees outward, a V (the underside), and a double tap turns them 45 degrees inward, an A (the overside) (`ns-dance.mjs` `LEG_TURN_ENDS`).
- Small coupled movements in the pose only, zero again when the movement is undone: the shank turns inward 6 degrees over the first 30 of knee bend; a little varus or valgus with the leg turn; the sole turns in with pointing the foot and out with pulling it up; the wrist drifts to the little-finger side as it bends and to the thumb side as it bends back; a high thigh lift brings 6 degrees of outward turn and 3 of spread.
- "Shift the jaw" turns the jaw about the joint head of that side (joint opening 9.9 to 0.7 mm). The belly wall no longer tears into shards when the trunk straightens, arches or turns. The deep hip muscles stay on the pelvis when the thigh lifts. The right shoulder's muscles wrap through a half-way frame instead of pinching to a point.
- The sweep (`tools/rom-sweep.mjs`) now poses the muscles as the game draws them and also measures stretched edges, blades, bone through muscle and part through part, over 47 more poses and, with `--combos`, 313 pairs.

Not right or not done. The joint's own inward end (90 degrees) asks foot, knee and hip for their whole textbook range at once; the limb switch no longer goes there. With the right arm fully raised the armpit is drawn as large flat sheets and the top of the shoulder still narrows to a point; latissimus is untouched there. Right subscapularis is still 17 to 23 mm off the shoulder blade; neck muscles stretch at a tilt. Stacked movements still have a dead stretch where the activity's angle runs past what the rule draws. Couplings not built: the elbow's carrying angle, shoulder, spine and neck, breathing, fingers following, the thumb's rotation. Hiding places not closed: the right forearm behind the trunk, a shank folded under its thigh. The number of poses in which some muscle end is loose has hardly moved.

## 95. A room instead of the black void (18 November)

The user: "And perhaps something should be done about the endless black space." Earlier: "Everything should look clinical and surgical"; and on 11 November, "I liked the space black background".

The brain, your body and the mirror body now hang in a very large, round, dark operating theatre seen out of focus (`ns-room.mjs`): a tiled floor far below with a soft blue-green pool of light under the brain, a dark curtain wall for a horizon all the way round, three lamp heads overhead, a few motes of dust, and soft shadows on the floor under the brain and the mirror body. It stays a dark picture: looking away from the light the room is the old space black. The light is 5 % brighter at the top of each beat of the brain and 12 % brighter while a movement is switched on; with reduced motion it does neither and the dust stands still. The loading picture shows the same room, so the backdrop does not jump at the hand-over. Nothing in it carries words or symbols. It is drawn first, in one pass of its own; frame rates were within the run-to-run spread of the build before.

An independent checker found that the three lamp heads read as a face and that an area merely looked at brightened the room; both were changed.

## 96. The view after a second round: narrower, from higher and further back (18 November)

After an independent check of section 91's view (it found the stomach a 50 px band, the body cut off at the waist by the brain from outside, a third fewer frames while looking around, and no way to put the crosshair on your own chest), a second builder changed it: the picture is taken from higher and further back through a field of view of 100 degrees (it was 116), the chest muscles are drawn at a quarter of their height above their own rib side, the left arm starts stretched along the left thigh as the pair of the right arm, and where your own neck leaves the chest a dark shape closes the opening that showed ragged muscle ends. The view point moves with the look, up to about 30 cm.

Not right, as a second check found: the dark shape at the neck's root reads as a black hole at the bottom of the picture and is not anatomy; far to a side and down the trunk shows opened from above; the stomach and pelvis are still a narrow band; the limbs are still thin and small; from outside (E) the brain is so large that the body is a small figure on it; the left hand keeps its place on the screen and rides up when the look turns; the mirror body is not nearer or larger and the brain's down arrow is not in the picture. The user has since described the view they want (a very wide but very flat picture, in which far things look near) and a new package rebuilds the projection on that; this section records the state published in the meantime.

## 97. Bulkier limbs, wider far ends, chunky fingers and toes, a thicker neck, muscles that swell (18 November)

The user: "Undeveloped muscles need work, such as the abdomen. And if we're going with such an extreme POV, point of view, perhaps we should go bulkier with the muscles, especially for the limbs. So indeed, more of a bodybuilder aesthetic."; "We actually want wider wrists, wider ankles, wider feet, wider hands, wider forearms, wider forelegs."; "Again, fingers and toes should never be spiky like knives, but potentially even chunky."; "Maybe you also need a thicker neck too."; "ensure naturalistic stacking deformation during muscle contraction."; "changing the proportions of your own body also changes that of the mirror body."

All of it is done on the shapes at load, so your body, the mirror body and the left game arm get the same proportions. The model is deliberately moved away from the source body; the amounts are these.
- Limb muscles move straight out from their bone in proportion to their height above it, most at the belly and nothing at the joints (upper arm by 0.42 of that height, with extra at the biceps and triceps; the deltoid cap 1.55 times its thickness).
- The far ends are wider, bones included: forearm 1.15 rising to 1.17 at the wrist, hand 1.20 wide and 1.12 thick, shin 1.14 rising to 1.16 at the ankle, foot 1.16 wide and 1.06 thick. Joint centres are recomputed from the widened bones.
- The neck muscles move out from the cervical spine, mostly at the back and sides; the descending trapezius is twice as thick.
- Rectus abdominis is about 1.65 times thicker, so its segments stand out; the chest is left as flat as section 96 made it.
- Every finger and toe has a closed, rounded sleeve of soft tissue round each bone with a blunt tip, in the white tendon tone, skinned so the knuckles bend. The crosshair names them as pads; those names are the only words added.
- A muscle that is active and shortening fills out at its belly by up to about 0.4 of its thickness; what lies over it is lifted with it and a stretched muscle goes flatter.

Not right or not done. The swell was not seen working in the game: the views are too small, and software pictures show it only subtly. The left game arm has no swell. A muscle's shortening is taken as the straight distance between its ends and is sometimes wrong in sign; the quadriceps swell by activity only. Parts lie 5 to 10 mm further inside each other where they already overlapped (an arm resting on a thigh, shins crossing), because the flesh is thicker and nothing stops limbs yet. The fingers read as full but sausage-like and white; palm and sole pads are not filled. The hip flexors, the obliques' slips and the serratus fingers were not worked on. The swell's bake causes some long frames in the first seconds. Proportions were compared against a reference physique by eye only. This package was merged and published before its independent check.

## 98. Vessels that are anatomy, and a brain that is not the colour of muscle (18 November)

The user: "And let's get the vascularity right, especially with the cerebral veins and etc. and for all other items as well."; "And make sure the brain and the body are noticeably different, or at least noticeably different shades."

The brain's surface is now a pale, cool pearl-grey rose and the muscles a deeper, warmer red-brown: at the start view their lightness (L*) was 3.3 apart and is 13.9 apart.

The rule-drawn vessel lines of section 89 are switched off. In their place:
- Arteries on the brain from the anatomy source itself: 80 unchanged BodyParts3D files in a new packet (`packets/bodyparts3d-cerebral-arteries-r1`), the cortical branches of the middle, anterior and posterior cerebral arteries.
- Veins and sinuses on the brain laid by hand along this brain's own landmarks, because BodyParts3D has none: the superior cerebral veins into the superior sagittal sinus, the central vein, the anastomotic veins of Trolard and Labbe, the superficial middle cerebral vein, the inferior cerebral veins. Their courses follow textbook descriptions (Rhoton; Gray's Anatomy) and are a typical arrangement, not this brain's own.
- On both bodies, 30 named vessels of both legs and the right arm (great and small saphenous, femoral, popliteal, tibial arteries, dorsalis pedis; axillary, brachial, radial, ulnar, cephalic, basilic). Their courses are centre lines worked out once from the BodyParts3D meshes (`packets/bodyparts3d-body-vessels-r1`); they are drawn as thin tubes pinned to the nearest muscle and bone, so they follow every pose.
No vessel is drawn over a visible motor area, and aiming is unchanged. Credits and licence entries for both packets are in `CREDITS-AND-LICENCES.md` and `ASSET-ATTRIBUTION-INDEX.md`.

Not right or not done. The arteries are a saturated red and outline the brain at the start view; this may read as bloody rather than clinical (one colour value changes it). From the start view the veins at the back can read as rungs of a ladder. The left game arm and the neck have no vessels; there are no intercostal vessels and no tibial veins. At the end of a joint's range a body vessel still stretches into a straight bridge. Vessels have no outline, cannot be aimed at, and are not in the loading picture. This package was merged and published before its independent check.

## 99. The limb switch turns the whole arm over (18 November)

The user: "But again, with the upper limbs, there should be quite a dramatic change in which muscles are visible between the overside and underside. Because of the turnover or turn under of the limbs, including the forelimbs and upper limbs. That's the whole point of limb rotation."

Before, the forearm turned 160 degrees and the upper arm only followed by 14. Now the upper arm has two ends of its own: 35 degrees outward on the underside and 65 degrees inward on the overside (the right arm; the game arm turns as far as keeps its elbow within 12 cm of where it lies, about 39 degrees inward at its start bend). The forearm turns over the first 70 % of a stroke and the upper arm over the last 70 %, so the hand leads. The game starts on the underside with both upper arms outward. Raised straight up, the upper arm's turn narrows by the combined-range rule. Seen from the eyes, the underside shows the palms, the forearm flexors and the front and inner side of the upper arm; the overside shows the backs of the hands, the forearm extensors and the outer side of the upper arm.

Not right or not done. On the overside the right hand swings about 15 cm inward onto the right thigh, and with the elbow fully bent it goes into the chest: nothing stops limbs yet. The game arm starts with its elbow bent 66 degrees against 8 for the right arm and is not yet its exact pair. The muscle lists could not be read from the tip, because the look stops before the crosshair reaches the upper arms; they come from a depth estimate. On the legs the thigh shows the same muscles on the V and on the A (rectus femoris, sartorius and the vasti in nearly the same shares): at 45 degrees the leg turn does not change what is seen on the thigh. This package was merged and published before its independent check.

## 100. A flatter view through a longer lens (18 November)

The user: "What we want is a very wide field of view, but a very narrow depth of field. So things that are far away look extremely close to us, but things we can still see a very wide pan, side to side ... a very wide view, but a very flat view as well, where things that are very far away still are very close within reach, despite being far away. That's the visual illusion that we're going for."; "we essentially want a much larger set of four limbs, and perhaps that involves dialing down the field of view to some extent."

The eye view is now taken from 0.30 m back on the line of sight and 0.10 m up, through a lens of 54 degrees (it was 100), with the look starting 52 degrees down. Far things shrink much less than before: at the start, on a 1600 by 900 picture, a thigh measures 143 px across (65 before), a shin 56 (25), the right upper arm 117 (61). The whole torso is in the picture, both shoulder caps in the lower corners; the legs run up over the middle of the strip and the crosshair starts on the strip between the knees. Your own neck muscles and vertebrae are drawn in place of the black plug at the neck's root. The mirror body stands above your feet, 313 px tall (223 before), and stays in the picture with the crosshair on the outermost area of either side. Every arrow can be reached: a covered arrow slides to a free place on its side, and the brain's down arrow is visible and works. From outside (E) the whole strip is in the picture beside the body. The left arm starts along the left thigh. The head sits back over the shoulders (carried 4 degrees forward, not 11).

What this is and is not. It is a longer lens from further back, which flattens depth; the wide sweep from side to side comes from turning the look, not from the lens. A true dolly-zoom option is built and switched off. The camera is not at the eyes.

Not right or not done. Looking around was measured at 13 frames a second against 22 before, cause not found. A dark soft patch remains at the bottom centre where the neck leaves the chest. The collar bones and shoulder caps are partly cut by the bottom edge. The mirror body is drawn at 0.68 of a true reflection's size and 1.0 m lower: it is larger on screen only because the lens enlarges far things, it is not magnified as asked, and it no longer stands on the same ground as your body (earlier notes asked for an exact reflection on the same ground). The brain's side arrows sit outside the brain on the backdrop. The game arm still follows the look on the screen and rides up when you look up. Reduced motion and the first prompt with the crosshair already on the strip were not checked. Published before its independent check.

## 101. A colour code from scratch, links between an area and its part, and what activity looks like (18 November)

The user: "Let's essentially redo the entire corresponding color coding of the motor strip and its corresponding areas from scratch ... And the wiring or clarity or indications in between the items, such that things are as easy to understand and as obvious as possible."; "let's introduce a neon glowing blinking effect, shuddering effect upon activity and corresponding activity".

The colours follow three rules. Every key in the brain's right half, which moves your left side, is a cool colour, and every key in the left half is warm. Each body chunk has its own family: leg, trunk, arm, hand, neck, face, mouth. Inside a chunk the keys step from light to deep. A wide dark gap separates chunks on the strip and a thin seam separates keys inside one. Group labels wear their chunk's colour and match on both halves.

Links. While the look rests on an area, a soft line in its colour runs from the key to the part it moves, on the mirror body and on your own body where it is in the picture, and those muscles get a thin rim of the colour. A line from a key crosses the brain's midline to the part on the other side, with a small bright knot at the crossing: that crossing is how the picture says that each half moves the opposite side. With the crosshair on a muscle of either body, the area that moves it shows, with a line from its key.

Activity. When an area switches on, its key, its muscles on both bodies and its line blink together like a neon tube striking (three pulses in the first quarter second, then a shallow flicker), and the active tissue shudders: a fine quiver with a short kick at the start, drawn in the vertex stage, with no change to joints, camera or aiming. With reduced motion the glow is steady.

Not right or not done. Areas hidden behind your legs have no marker. During the first flash the key's centre still reads whitish. The muscles an area drives are often on the far side of the limb from the eyes, so the flash on your own body is hard to see. The shudder is under a pixel plus a short kick and could not be judged in still pictures. Inside a chunk neighbouring keys differ little in lightness; under simulated protanopia the right half's face keys look as blue as its arm keys. The body parts carry no colour at rest. Published before its independent check.

## 102. Detail: the layered stack again, smoother shading, cartilage (18 November)

The user: "notice some muscles have become detached and are sticking out, such as around the hips. This needs to be fixed for all muscles, and everything should be in as much detail as possible without destabilizing the game".

A second fault that had gone unnoticed: the layered stack of muscles (outer muscles floating slightly over deep ones, asked for on 11 November) had been silently off since the reclined posture of 17 November. The rule that smooths the belly sheet's relief read "forward" in the drawn frame, pushed the oblique muscles past the cap, and the game refused the lift for the whole body. It is drawn again; outer muscles float 4 to 20 mm and anchored muscle ends turn tendon-white. Round the hips, gluteus maximus no longer hangs off as a shell with a flap under the buttock. Shading normals of the coarse meshes are evened out at load (real creases kept, no vertex moved), so highlights no longer break at triangle edges. Joint surfaces carry bluish-white, glossier cartilage caps, and the costal cartilages are bluish white.

Not right or not done. The shoulder girdle and back are not fixed: serratus anterior, latissimus, rhomboid major, the ascending trapezius and sternocleidomastoid are torn or stretched in the start posture. Gluteus maximus still shows a jagged free edge from below. Finer geometry was tried and taken out: it added hundreds of thousands of triangles and seconds of loading for no visible gain. Not done: tendon glisten, pearly aponeuroses, smooth joins of tendon and bone, nails. The cartilage caps are a geometric estimate. Published before its independent check.

## 103. Small fixes from an audit of every earlier note (18 November)

The user: "and go over the previous messages as well. Regarding the small fixes and small improvements."

Seven readers went through every note since 11 November against the game and listed 26 small, 9 medium and 2 large things still open. Done from that list so far:
- Looking at a motor area no longer moves the body: the look arms the key (it lights, the tip and the hint show); a click or a number key does the movement. This is the author's decision on a point the audit raised; before, resting the look for a moment pressed the key, so reading the tip moved the body.
- Number keys act on the area the look rested on, also after the look has passed other areas on its way down.
- The first press of a movement does it (a joint a few degrees off its start no longer swallows the press). Holding a number key moves the limb part-way and it stops there when the key is let go.
- A Space grip lights both hand areas alike. A brain held away from its middle moves with the pointer instead of swinging the view. Dragging a forearm that is already fully turned carries the turn into the upper arm. An arrow's words show once. Arrows are glossier and chunkier.

Left from the list: the left shoulder area still has no movements; holding the mirror body's left arm swings the view; the right elbow knots when bent with the palm down; the sweep does not measure the left game arm; the first prompt and the Esc page still describe the old behaviour ("Look at a blue area ... watch your arm move", "You sit on an invisible flat ground") until the overlays package lands; performance and the face. Published before its independent check.

## 104. Keep the keyboard's chosen area behind an orbit arrow (19 November)

From the view over your shoulder, the keyboard could put the crosshair on the left toes and leave you looking at a mirror-body arrow. The movement list went blank. A number could still run the last area's movement.

The step now keeps the motor area if the view's ray still hits the area it chose. The numbered list follows the step. Click to use the orbit arrow, or hold Shift and click to press the area behind it. Moving the pointer to look, pressing a mouse button or changing views ends that keyboard priority. The walk still follows the strip and stops at either end. Some views still put arrows over parts of the strip.

## 105. See the strip through the orbit arrows (19 November)

From outside, the green arrow that tilts the mirror body can cross the left toes and hide the seam along the area. The arrows keep their places around each object as you look. Where their outlines cross the strip in the picture, the fill and the ink fade together, so the seam shows through. The same part of the arrow takes the click. Away from the strip the arrow keeps its usual shading.

At 1600 by 900 in Chromium on AMD Vulkan, the hovered arrow over the left toes was visibly fainter. At 1280 by 800 with reduced motion, the four affected mirror tips in the outside view changed the sampled pixels about a third as much as before. The comparison used the same camera and a copy with clear arrows as a pixel reference. The 74 keyboard steps matched the previous build, covering 47 areas and both ends of the walk. Click, Shift-click and the number key still take their separate paths.

The overlap check uses the outline's screen box, so a tip can fade a little before its stroke reaches the strip. A tip may still cross an area. The two window sizes and one desktop browser cover only part of the game.

## What is left, and whose it is

**For the project's independent review and release, not for the author of these changes.**
- Independent browser review of the whole build, including other browsers, touch and screen readers. The author's scripted checks and three readings by other instances of the same model do not replace it.
- `SHA256SUMS` and `release-manifest.json` in this working copy predate these changes. They are regenerated over the published files at each upload.
- Publication. Since 12 November the user asks for each finished version to be uploaded to the project's GitHub repository, and that is done. An upload is not an independent review.

**Limits of this build that were looked at and left, each with its reason in the section named.**
- Some motor areas cannot be aimed at until the brain is turned to one side; no view from above shows them. Section 13 counted four of the 44 areas the map had then. The map now has 54, and the count has not been redone (13, 55, 59).
- The brain has its own proportions at the start look and stretches at steep looks (13).
- The start picture holds your whole torso since section 91; the stomach is a narrow band in it (14, 79, 90, 91).
- In a window of 1280 by 720 most short information cards leave out the muscle lines to fit; key R opens the card that has them (69).
- After “Tilt head back” and the key that brings the head back, the view ends 10 degrees above level, below the neck area, not on it (68).
- While you look up at the brain, a held forward trunk bend is drawn smaller than the 80 degrees it holds (68).
- Small upright windows, narrower than about 340 pixels or shorter than about 800, cannot start and say so; on a phone-sized screen the panels crowd the brain. The game needs a keyboard and a mouse or trackpad in any case (15).
- When even the last good view cannot be drawn, the view turns part of the way back by itself (16).
- From one measured pose the view from behind cannot be shown until the hand or the look moves; the game says so (18).
- Your own arm can hide part of the brain's left arrow (19). The overlap of the brain's top arrow with the mirror body's top arrow noted there is gone since section 59, which puts the brain above the mirror body.
- The shoulder-girdle slide has not been compared with reference images (9).
- At looks far to the left and down the eye is 4 to 7 cm from the left shoulder muscle: its front part shows a ragged border, the upper-arm bone shows past it, and during the limb turn a small gap can open between two of its parts (72).
- The mirror body's four arrows stay on the frame of the upright body: a tilted body can reach past them, and at a downward look your left arm can hide its left arrow (73).
- The switched-off floating-face code is still in the renderer (11). It draws nothing and was left to keep this change small.

**Asked for in the user's notes and not done yet.** These stay with the author of these changes.
- Performance (Messages 42, 48 and 50). Holding and carrying the mirror body, the slow limb turn and the view over the shoulder still fall below 60 frames a second on the test machine (66, 71).
- The strip spans 42 % of the width of the view, not the 50 % of Message 43 (59).
- Part-way positions from the brain (Message 47). An activation takes a part to the end of its movement (59).
- Lowering the left arm from the strip (Message 48). The left shoulder area has no movements of its own (61).
- Controls (Message 46). Replaced on 17 November: a held thing follows the pointer across the view (80). The mirror body's top and bottom arrows turn it (73).
- Limbs knocking each other about (Message 39). Your own limbs are not checked against each other and can pass through one another (33).
- From the notes of 17 and 18 November, not done yet: limbs that do not look small in the start picture, with bulkier muscles, wider far ends of the limbs and chunky fingers and toes; a thicker neck; the mirror body magnified and nearer; a down arrow for the brain that is always reachable; vessels laid out as anatomy and a brain plainly different in shade from muscle; a neon blinking, shuddering effect on activity; muscles that swell as they contract; the colour code of the strip and the body redone from scratch with visible links between an area and its part; grouping ("chunking") of every overlay; a pass over all earlier notes for small fixes; collision effects and one limb pushing another; a limb hidden behind another limb staying visible; what the sweep of 87 still shows (the kneecap and the lower end of rectus femoris at a fully bent knee) and a rule for joint angles in combination; the move from the Borderlands look toward a more detailed, glossy, fleshy graphic-novel look.
- Arrow places (Messages 7 and 31). The brain's bottom arrow is off the middle of its side (59).
- The graphics as a whole (Message 41), and the review of earlier notes and versions asked for in Message 48, are done in part only.
