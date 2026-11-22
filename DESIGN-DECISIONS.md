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

**Limit.** Meshes within 0.12 m of the eye (the head and face) are not drawn around the camera in first person, because the camera is inside them. They are on the mirror body and on your own body in the view from behind (E). At the time, the earlier launcher, [`display-b-r388`](https://github.com/eliminatenoise/NeuroSurge/blob/b92902515d705470801e034651d82c2b37dc3f4f/scene/example/display-b-r388.html), stayed unchanged on its own page. Its playable page has since been retired.

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

## 106. Keep the outside camera’s lens when the picture resizes (19 November)

In the outside view, changing the resolution of the picture could narrow the view from 66 to 54 degrees without moving the camera. In a 1600 by 900 window, changing display scale moved the forward mirror arrow about 27 CSS pixels. A click at its former point missed it.

The renderer now selects the lens from the current camera pose whenever it resizes. The eye view still adjusts for the shape of the window, and the two lenses blend when you press E. In Chromium on AMD Vulkan, the outside lens held at 66 degrees through changes to display scale, window size and Picture quality. The forward mirror arrow still took a click at the same point after a display-scale change with the window dimensions held fixed.

## 107. Look to see the movement, press to do it (19 November)

The opening guide, the Esc instructions and parts of the preview notes still said that resting the crosshair on a motor area moved the body. The game changed that rule in section 103. Looking now shows the choice. A click or a number does the movement.

In the ordinary first-person preview in Chromium on AMD Vulkan, looking at Left wrist held the hand where it started. Pressing 1 bent the left wrist toward the palm. Pressing 2 returned it to rest. Pressing 2 again bent it back, and pressing 1 returned it to rest. These are movements of the game’s rig.

## 108. Lift the mirror body with Space and the pointer (19 November)

The status card said the mirror body had to stay on the ground. In the game, moving the pointer up while Space held the torso lifted the entire mirror body. Pressing W moved it farther while it stayed raised. Letting go left it there. The left fingers and thumb closed during the hold and returned to rest after release. The same Space and pointer gesture carried the brain.

The status card, Esc page and guide now name the pointer motion. The last guide step asks for a turn of the mirror body, which is the action that finishes the step. The game’s pose and carry rules are the same.

## 109. A right elbow that bends without the big spikes (19 November)

Turn your right palm down, then bend your elbow. In the game, small patches of muscle could stretch into long triangles. One edge in palmaris longus went from 1.30 mm to 52.14 mm in the model. The ulna and radius could take both of a vertex’s weight slots even though the two were already using one twisting frame. An adjacent vertex could still follow the upper arm. The two vertices pulled apart as the elbow bent.

For muscles that cross the right elbow and already use the twisting frame, the weight search now treats those two forearm bones as a pair. The same weight rule draws both bodies and builds the start pose. In the palm-down pose at 145 degrees of flexion, edges within 100 mm of the elbow that stretched over three times their source length and by more than 2 mm fell from 581 to 104. The sweep counted source edges at least 0.7 mm long. Some triangles still fold or stretch at full bend.

The human reference series covers bones turning and bending in living volunteers, and the BodyParts3D atlas supplies the game’s surfaces. The weight rule and the stretch counts describe the render mesh. Human muscle deformation at the combined end pose remains untested. [Goto et al. (2004)](https://pubmed.ncbi.nlm.nih.gov/15220886/), [Matsuki et al. (2010)](https://pubmed.ncbi.nlm.nih.gov/20696507/), [Fu et al. (2009)](https://pubmed.ncbi.nlm.nih.gov/19576700/).

## 110. The whole mirror body, whatever part you take (19 November)

The user: “Forget about controlling individual elements of the mirror, just allow full control of the mirror body.” Since 17 November a hold or a drag on an arm or leg of the mirror body moved your own matching limb. Now any part of the mirror body is the mirror body: Space on it carries all of it and a drag turns all of it. The older rule's code stays behind one switch (`MIRROR_LIMBS_ARE_YOURS` in `ns-app.mjs`).

## 111. Calmer to look at (19 November)

The user: “The game currently physically hurts to look at with your eyes”; “Body is probably too glossy and it makes everything really hard to differentiate from each other”; “the beating of the brain is way too obvious. It should be far more subtle”; “when you look up and down, the pelvis pops out”. A first pass that changes numbers only:

- A switched-on area gives a steady light. The three strike pulses and the flicker of section 102 are gone, and the standing quiver of the tissue with them; a small settle at the moment an area switches on is kept.
- The brain's beat, slide and flush are about a third of what they were.
- The bodies' wet highlight is under half as strong (a satin surface), so a muscle's own tone and edge carry the picture.
- A look down the body only tints the muscles that turn the head and bend the trunk (level 0.22, was 0.75). Before, it lit the whole belly and pelvis in full colour, which is what popped out. The tint is now counted from where the head and trunk are when play begins, so the belly is no longer lit from the first frame.
- The cerebral arteries are a muted red with less shine and a third of the pulse; the floor's tile lines are barely there.

A fuller redesign of the look (few clean tones, strong light and dark, one saturated colour for activity) is still to come.

## 112. What came in from the last round, and what stays switched off (19 November)

Merged from the round of 18 November: a limb hidden behind another limb or the trunk shows through as a ghost in its own colour and can be aimed at (`ns-see.mjs`); the loading picture builds from the inside out, bones from the spine outward and then deep to outer muscle, the brain from its stem outward (`ns-assembly-order.mjs`), next to the stationary progress bar another maintainer added for reduced motion.

Limb-pushes-limb (`ns-contact.mjs`) was merged and then switched off (`SELF_CONTACT_ON = false` in `ns-app.mjs`). In the browser a reach key swept the left arm through the legs, and the push threw both legs and the right arm to the ends of their ranges, where they stayed; a look alone did the same more slowly, because the left arm follows the look. Its code and tests stay for a gentler rebuild. Your own limbs therefore still pass through each other.

## 113. A smoother shallow bend at the right elbow (19 November)

At the back of the elbow, neighbouring anconeus vertices can sit close to both the humerus and the ulna but follow them by very different amounts. The inverse-square weights change steeply there, which can turn a short edge into a sharp triangle as the elbow bends.

The rendering weights now change more gradually over the outside of the hinge. The effect eases in from 12 to 25 degrees and out again from 60 to 67 degrees. A wider trial compressed too many edges and triangles at full bend, so the correction ends before that pose. At 62 degrees it removed both severe anconeus edge stretches, defined as growth greater than 2 mm to more than three times the source length. The measured counts of edges below half their length and triangles below half their area also fell at that pose. The same rule follows the real-time render and the offline bake.

This changes one atlas muscle. The unchanged deep bend still has 104 severe edge stretches around the elbow across the measured right-arm meshes. Ultrasound measures the fibres inside the living anconeus. The game measures edges on the atlas surface. A lifelike full-bend deformation still needs a suitable measured surface reference. [Stevens et al. (2014)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4292751/).

## 114. The plain look of the loading picture, and a lighter game (19 November)

The user: “Performance and reliability should be our number one priority. even if that means extreme simplicity and streamlining. And perhaps visually, there should be a major visual overhaul and everything should look a lot more like the loading screen models instead of what you have right now, which is overkill and overcomplicates everything.” And: “Let's go back to far more black of a background, but with a little bit of a gradient.”

The game is now drawn the way its loading picture draws its models. One switch, `SIMPLE_LOOK` in `ns-scene-three.mjs`, leaves out the comic bands, painted fibres, wet highlights and ink of the bodies, the ink outline pass, the hidden-limb ghost pass and the bloom; `PLAIN_GAME` in `ns-app.mjs` leaves out the vessels (the cerebral arteries were 80 files and about 9 MB to fetch), the contraction swell and the limb-contact model. The muscles take the loading picture's reds in six steps of lightness, so that neighbours still part; bone stays pale. The backdrop is nearly black with a faint pool of light that fades with distance: no tile lines, no lamps, and its light no longer swells with the beat or a movement. The older look's code stays behind the two switches.

With it came the performance work begun on 18 November: the muscles of your body, the mirror body and the left arm are skinned on the graphics card (they follow their bones on every frame and no vertex buffers are re-sent), the game reports its frame time by part (`inspect().perf`), and what is under the crosshair is asked every third frame while no input arrives.

Measured in one headless desktop Chromium at 1600 by 900 on one computer's own graphics card, before and after: looking around 36 to about 50 frames a second, looking down and up 35 to about 56, the limb turn 33 to about 54; standing still 60 in both. The main thread's work per frame while the look moves fell from about 25 ms to about 17 ms. These are one machine's figures and say nothing certain about a weaker one. A frame still makes about 1,240 draws of 4.6 million triangles; fewer draws, coarser meshes and a look that does not bend the whole trunk are the next steps.

## 115. Chunked overlays, plain movement lists, reading on at the start, a playable tutorial (19 November)

The user: “You didn't take my visual chunking feedback seriously. Things should be chunked together and those chunks should be spaced away from each other.” “It's not clear what the numbers do and it just adds to confusion on the menu. And reader should be on by default.” “And there should be a playable tutorial to learn how to use the game ... and to master the controls quickly.”

- **Chunks.** The five-second controls card is four framed groups set well apart: W over A S D, the E R pair, Space, and the trackpad with its three actions. The Esc page is four titled groups side by side (look and press, move, hold and carry, views and reading) and Settings as a fifth; it fits without scrolling at 1280 by 720. The tip and the card show the name, what it does and the choices as separate groups.
- **The numbers.** A movement is a key cap with its word beside it; opposite movements sit together; the row a click does is filled and carries a pointer. A newcomer sees one line, “Click, or press a number”, for the first three presses. A list of movements is never on screen twice: the tip has it while you look at an area, the card when you look away.
- **Reading on.** The short reading level is on from the start: the tip, the tutorial line and one small card at the bottom right once an area has been looked at. R cycles short, full, off.
- **Tutorial.** Eight steps in a small card at the top left, each one action and done the moment you do it (look at an area, click it, hold a number, carry the brain with Space, drag to turn it, W A S D, E and back, R), with a count, Enter to skip a step, and Hide / Start again on the Esc page. It starts by itself.

Built by one helper and looked at by the author in its pictures and in the merged game; its independent check was not run.

## 116. A coarser mirror body (19 November)

The mirror body, a figure about 300 px tall, cost 2.0 of a frame's 4.6 million triangles. It is drawn again from index-only copies of its meshes with 5 mm cells: 0.58 million. Brought very near, thin sheets of the face and neck can show small holes.

## 117. A wait of seconds, not minutes: mesh packs and a plain loading bar (19 November)

The user: “The game is currently broken as it just stays on the loading page forever. There should be a loading progress bar as well”; “Game should not take long to load at all. Minutes are a liability”; “the loading bar should be much more obvious, and it shouldn't fully load the whole bar until the game's ready to go.”

Measured first: before it was ready the game fetched 667 OBJ text files, 166.9 MB, in 721 requests. At 20 Mbit/s that is over a minute of download alone, at 10 Mbit/s over two: the user's “minutes” and “forever”.

- **Mesh packs.** The game now loads six files, 19 MB for what it waits for, from `packs/` (`tools/build-mesh-packs.mjs`, format in `scene/src/ns-pack.mjs`). A pack is a lossless compact copy of what the game reads from each OBJ file: for every file the decoded mesh is bit for bit what the parser reads from the source. Each mesh records the size and SHA-256 of its source file and the game checks both against its pinned manifests, as it did for a fetched file. The source packets, their hashes and licence records stay unchanged; a pack keeps the licence of its sources. If a pack is missing or cannot be read, that packet's OBJ files are fetched as before.
- **The bar.** A large bar with a word and a percentage is on the page before any script arrives. It covers the whole wait, the download and then every build step, keeps moving while a step holds the page's thread, and reaches 100 % only as the game appears.
- **No dead ends.** Every request has a 20 s limit without an answer or a byte; when nothing has advanced for 20 s the page says so with a “Try again” button, and a failed load names the first request that failed.

On the author's computer, with files from the local disk, the game is ready in about 10 s as before: that time is the page building the bodies, which the packs do not change. Coarser meshes and a shorter build are the next steps. Built by one helper; its independent check has not finished.

## 118. The brain a lot higher, and a look that is never held (19 November)

The user: “Both the brain and mirror body are far too low. The brain should actually be a lot higher, I was wrong about that before.” “After I move the brain up, the camera view to locked down. The camera view should be free to move wherever it wants.” “The head should not be locked.” “whenever you look to the far side of any screen, everything gets super magnified and is unusable.” “For third-person view, the head should not be shifted to the right.”

This withdraws the strip below the ankles of section 92. The game starts with the look 24 degrees below level (it was 52): the whole motor strip stands clear above your hands and feet, the mirror body directly under it between your hands, your own body below. The look goes all the way up, down and round; where the neck and trunk stop the eyes carry on, and nothing holds the look after the brain or the mirror body has been moved. While Space holds a thing the pointer still turns the head and the held thing goes with the look. The camera keeps one distance behind the eyes at every look, so nothing changes size in a turn. From outside (E) the camera stands straight behind the head. Built by one helper, whose work on carrying with W / A / S / D continues; the author looked at the start picture, far looks and the view from outside in the merged game.

## 119. A look turns the head and the eyes, not the trunk; no last-resort search for the hand (19 November)

The user: “when you look up and down, the pelvis pops out”; “Performance and reliability should be our number one priority.”

Two things made looking around the most expensive thing in the game, and one of them was new in body update 28.

- **The trunk.** A look past the neck's range bent and turned the trunk. That re-posed the whole body, re-fitted the left arm and ran the contact tests on every frame of the look, and it is what moved the belly and pelvis under a look down the body. Now a look turns the head on the neck (70 degrees to a side, 45 up and down) and the eyes carry the view on from there (`LOOK_BENDS_TRUNK = false` in `ns-app.mjs`). A trunk bend held by its own motor area is drawn as before.
- **The hand's last-resort search.** With the camera of section 118 standing back at every look, a look 45 degrees or more to the right left the left hand no place in the picture, and the arm's fit then searched for one by posing the hand up to several hundred times in a frame: 12 ms a frame, with hitches of 100 ms. That search is off (`LAST_RESORT_SEARCH = false` in `ns-arm.mjs`): the hand reaches as far as it can toward where it was asked and may leave the picture.

In the author's headless test browser (two runs) the main thread's work per frame while looking down and up fell from about 13 ms to 6 to 8 ms, and while looking around from about 23 ms (with the hitches) to about 10 ms; all four test cases (still, looking around, looking down and up, the limb turn) now hold 60 frames a second there.

## 120. The back of the elbow at a deep bend (19 November)

The anconeus runs from the outer knob of the humerus to the upper back of the ulna. At a deep bend, short edges between vertices that follow different amounts of humerus and ulna can stretch into ridges. The atlas surface now hands that motion from one bone to the other more gradually, with equal weights at split seams. The bone shares at the 407 attachment candidates stay as they were. The change eases in between 112 and 120 degrees of flexion. [Coriolano et al. (2009)](https://www.scielo.cl/scielo.php?pid=S0717-95022009000400008&script=sci_arttext), [McGee et al. (2026)](https://doi.org/10.1111/joa.70154).

At 145 degrees of elbow flexion and 160 degrees of forearm turn from palm up, 11 severe edge stretches become 4 in this muscle. Severe means more than triple the source edge length and more than 2 mm of growth. Triangles below a quarter of their source area drop from 14 to 2. The rest of the right arm still has 93 severe stretches in the same sample. Switched poses are tests of the game rig. Ultrasound measures living fascicles, which are different from the edges of the atlas surface. [Stevens et al. (2014)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4292751/).

## 121. Coarser meshes: 3.2 MB and about a quarter of the triangles (19 November)

The user: “Game should not take long to load at all. Minutes are a liability. Perhaps game is way too big at the moment leading to performance problems.” “We want the game to be as light load on the machine as possible.”

The packs of section 117 now hold coarser copies of the source meshes: 652,084 triangles in place of 2,395,434 (27 %), 3.2 MB in five files in place of 19 MB (and of 157 MB of OBJ text). `packs/README.md` states how a coarse mesh is made (`tools/simplify-mesh.mjs`): vertices are removed one at a time by sliding each onto a neighbour, so every kept vertex is a vertex of the source file; a removal is refused when it would change how the surface is connected, turn a triangle over, make an edge longer than 10 mm, or leave any source vertex more than 0.5 mm from the coarse surface (measured, not estimated). The source packets, their hashes and licence records are untouched; the tests measure every pack against its sources on every run. The cerebral arteries are no longer packed or loaded (section 114).

On the author's computer the game is now ready about 4 to 5 seconds after the page opens (about 10 before), and a frame draws about 1.1 million triangles (4.6 million on the morning of 19 November).

## 122. A dark edge on every limb, and pale fingertips and toes again (19 November)

The user: “There should be clear outline / contrast between limbs so that they don't merge and mush into each other, and surely there should be still exposed white bone, such as for fingertips and toes.”

The plain look of section 114 gets one small shader patch (`patchPlainShaders` in `ns-scene-three.mjs`), with no extra pass. The lit colour of every muscle and bone falls to about a third toward its silhouette, where the surface turns away from the eye, so each limb and muscle has a dark edge of its own and two overlapping limbs part. And the per-vertex tendon value the meshes already carry turns a surface toward bone white: tendon ends, and the sleeves round the finger and toe bones, are pale again (the plain look had drawn them in the muscles' red).

## 123. One fast carry for the brain and the mirror body; a cleaner start picture (19 November)

The user: “XZ plane with grasp WASD should be consistent between the mirror body and the brain should move much faster.” While Space holds the brain or the mirror body, W / S carry it away and nearer and A / D sideways by one rule and much faster than before, and the look goes on turning the head and view, with the held thing going with it (section 118). The older hold-and-move mode, in which the pointer moved the held thing and the view stood still, is removed. Also from the same helper: no dark hollow at the bottom of the start picture and no ragged neck stumps when the head is turned far; the left hand starts beside the left knee at the height of the right hand.

## 124. Matte, flat-toned and outlined again; a larger, brighter strip; one hand per control (19 November)

The user, after body update 31: “Maybe we were much better off with the matte look that we had from the original Telltale Borderlands look, similar to that.” “And we have to make the [motor] strip far more obvious, probably a good deal larger and far brighter and more colorful.” “And the spacebar only grasps the left hand, whilst clicking grasps the right hand.” “And again, let's make blood flow and brain beating far less noticeable. But there, if you really, really pay attention.”

- **Matte comic look, still one cheap patch.** The plain look's patch (section 122) now leaves the specular light out altogether, steps the lit colour into four flat tones with a soft join, and draws a thin dark line where a surface turns away from the eye, inside the wider edge shade. That is the look of the earlier comic style, bands and outlines on matte tissue, without its outline pass, hatching, fibres or gloss. The brain's wet sheen and glint are off as well.
- **The strip.** A resting motor area shows its whole colour and lights itself strongly (`AREA_LOOK.restValue` 0.72 to 1, `restLift` 0.06 to 0.5), so the strip is the brightest, most colourful thing in the picture before anything is pressed; and it is drawn larger (`BRAIN_START_MOTOR_FRAC` 0.46 to 0.58, about 930 px across at 1600 by 900). Its outermost face areas now start above the top edge of the picture; a look upward brings them in.
- **Hands.** Space closes the left hand only; the right hand closes while the mouse or trackpad button is down. (Since 17 November a Space hold had closed both.)
- **Beat.** The brain's beat, slide and flush are about a third of the morning's again: there if looked for.

## 125. Drag a limb to turn and bend it; turn a held thing while carrying it (19 November)

The user: “when we click on a limb and go left and right, that gives us rotation of the limb. But if we go up and down with the cursor, that gives us extension / flexion of the limb. And we're talking about full range of motion here, according to how far we push it on the trackpad or mouse.” And: “simultaneous controls where we might be moving something in the horizontal plane ... or the vertical plane ... And then if we click whilst ... grasping, then we can do orbital shift at the same time.”

- **A limb.** Press on one of your limbs and drag (`LIMB_DRAG` in `ns-app.mjs`). Left and right turn it about its own length, half a degree a pixel. Up bends it and down straightens it, 0.55 degrees a pixel: a press on the upper arm or the thigh moves the shoulder or the hip, a press anywhere below moves the elbow or the knee. The joint goes as far as the drag goes, through its whole range, and stays there; its muscles and its strip area light as for a movement switched on from the brain. (Before, a drag only rolled the limb, by a rule that mixed both directions.) The left arm, which has its own rig, turns as before and comes nearer or reaches farther with up and down, inside the short reach its fit still allows.
- **A held thing.** While Space holds the brain or the mirror body, the pointer carries it with the look, W / A / S / D carry it away, nearer and sideways, and a press-and-drag now turns it about itself at the same time; while the button is down the view stays, and when it comes up the pointer carries the thing with the look again. (Before, a press during a hold did nothing.)

Checked by the author in the browser: the right thigh raised to 110 degrees by a 200 px drag up, turned to the end of its range by a drag right, and lowered to its full extension by a drag down; the held brain turned by a drag while D went on moving it.

## 126. A strip without its lines; every muscle its own shade; what has been tried stays marked; bony fingertips (19 November)

The user: “the motor strip is just very, very hard to look at right now because it's so liney ... There has to be a better solution, an overhaul.” “Make sure every single muscle is differentiated from each other in shade, and that upon activation of any brain region or any body part, the shade changes. So everything gets marked out upon activation, so you can see what's still left ... to activate. And for the fingertips, make sure the fingertips are still bony, so they actually should be skinnier when they're away from the finger joints and chunkier towards the joints, and including the tip.”

- **The strip.** Its inked relief lines are gone (the gyrus contour nearly, the sulcus and bank lines wholly), the seam between two areas of one body part is a hairline, the keys' bevels are barely there and the strip has no gloss: each area is one clean block of its own bright colour, and only the gaps between body parts stay dark.
- **Every muscle its own shade.** On top of its tone a muscle takes one of nine lightness steps and a small warm or cool shift from its own name (`muscleOwnShadeInto` in `ns-colors.mjs`), the same on its left and right side, so two neighbours of one tone still differ.
- **Tried or not.** A muscle that has been switched on (activity 0.5 or more; a look's faint tint does not count) keeps a darker resting shade for the rest of the session, and a motor area switched on earlier rests at under a third of its brightness (`VISITED`). What is still bright and saturated has not been tried.
- **Fingers and toes.** The sleeves round the finger and toe bones are no longer made (`DIGIT_PADS.on` false): the bones show with their own shape, a thin shaft between a thick base and head and the tuft at the tip.

- **Blacks, not greys.** The user: “Let's have much darker blacks instead of ugly grays.” The backdrop is about a third as bright again and neutral, the strip's in-between areas are near black instead of mid grey, the ink edge is nearly black, and a tried muscle is darker in its own hue rather than greyer.

Not in this version, from the same notes: the chest still stands in front of the belly in the eye view (the user: “a smaller and much flatter chest ... and a more observable bottom torso”; three quick tries with posture and camera numbers each pushed the whole torso out of the picture, so it needs a change of the trunk's shape), and the leg turn still shows the front of the legs on both of its sides (the user: flexors on the underside, extensors on the overside).

## 127. The whole drag reaches the game (19 November)

A quick flick could leave the mirror body right where it started. When the pointer moved and the button came up between two frames, the game dropped the movement it had yet to draw. A real release now keeps those pixels and the part picked at the press. A click still presses. Losing the pointer or pausing still cancels the gesture.

In Chromium on AMD Vulkan, a 100-pixel drag between frames turned the mirror body by 30 degrees, the same as when the drag straddled two frames. Shift took the brain behind the mirror body. A drag up from the left foot bent the left knee, and the mirror body turned while D carried it sideways.

## 128. Back to the early comic look, with little gloss; a pinker brain; blacker blacks (19 November)

The user, of the plain look of updates 26 to 35: “Muscles and bones look awful. Extremely low quality. Can we please go back to the art style before the overhaul a while ago. Back when it was borderlands-telltale.” Then: “Yes, more of the early Borderlands look without very much gloss at all.” And: “surely the brain should be a little more pinkish, fleshy.”

- **The look.** The body is drawn by the comic shader the game had before the painted look of 18 November: flat tone bands, a hatch in the shade, ink outlines (`BODY_STYLE` is `'cel'`; the shader is `patchComicShadersCel`, the old function word for word). The plain look is off (`SIMPLE_LOOK` false) and stays in the code as an option. The gloss of that early look is nearly gone (`BODY_CEL_EARLY`: the glint core is zero and the highlight strength 0.02 on a muscle belly, 0.05 on tendon and bone), because the user asked for it and because gloss was what made neighbouring muscles run together.
- **Kept from the plain look**, because the user asked for each: every muscle has its own shade, a muscle or area that has been switched on rests darker, the finger and toe bones are bare, the strip has no ink lines, vessels and swelling stay off.
- **Tones.** The six salmon and rose muscle tones of 18 November are back under the per-muscle shades.
- **The brain** is pinker: crown `[0.93, 0.74, 0.73]`, grooves `[0.6, 0.33, 0.36]`, still matte.
- **Black.** The darkest the room gets is now nearly black and neutral (`ROOM.black` 0.0008, 0.0009, 0.0011; it was the blue-black 0x05070b), and the lit air round the brain and the bodies is halved. What is left of the gradient is the floor's pool of light, brightest under you.

Measured on this machine (Chromium, AMD Vulkan, 1600 × 900, each case 3 s): standing still 60 frames a second, looking around 59, down and up 60, slow limb turn 58 to 60. The outlines and the hidden-limb ghost are drawn again; they cost about 1 ms a frame.

## 129. A look switches an area on; a press drives hard, eases back a little, and repeats (19 November)

The user: “Let's also go back to activation simply by cursor highlight. The number overview is very confusing and creates feedback delay. Let's make it activates heavily relaxes slightly and repeats that process with each further click from highlight.” And: “we want the movements from the neural correlates to be as exaggerated and obvious as possible within reason, such that they're still realistic. But imagine an extremely intense electroshock that causes a fierce contraction with acceleration and inertia. As if moving something heavy.”

- **Look.** Resting the look on a motor area does its movement (`LOOK_ARMS.on` false; the arming rule of 18 November stays as an option of the activity and is still tested). The tip names the area and the one movement under the look; the numbered lists are gone from the tip and the card (`NUMBER_LISTS` false). The number keys still work for whoever knows them, and the Esc page says so in one row.
- **The jerk.** `JOINT_LATCH`: a slower, heavier spring with far less damping (omega 50 → 21, zeta 0.35 → 0.26) and a harder rebound off the joint's end (0.4 → 0.55). The part gathers speed over four or five frames, hits its end, is thrown back about a quarter of its travel and swings in again two or three times.
- **Drive, ease, repeat.** A press holds the joint at its full end angle for 0.55 s (`driveS`), then the joint eases back by 16 % of its swing on a soft, critically damped spring (`relax`, `relaxOmega`) and waits there. A further click drives it in again: a joint that is already near its end is given a speed toward it (`kick` × swing × omega), so it slams into the end and rebounds. The first version of this threw the part back on a click, a jump in the picture and the wrong way round; it is gone.
- **Small movements show.** Straightening a knee that starts 6 degrees from straight moved nothing anyone could see. A movement with little travel is given a swing of up to 70 degrees for the kick and the ease (`minSwingDeg`, never more than 0.6 of the joint's range, so a lip does not rattle between its ends): the knee is knocked straight and rebounds about 14 degrees.
- **Reduced motion** has none of it: no kick, no ease back, no rebound.
- **Head movements do not move the view.** With look activation back, the neck area threw the view about. The view is now the look alone (`headPoseForLook`): a neck or trunk movement held by its area moves the drawn head and the mirror body, and the eyes take up the difference; the place the picture is taken from is the head of the look alone (`eyeJoints`).
- **Tutorial.** The step that held a number key gave way to “press on an arm or leg and drag it” (`dragLimb`, done when one drag has turned and bent a limb by 12 degrees); the first two steps read “Look at a colour on the brain: a part moves” and “Click it: it jerks again, harder”. A click, not the arm moving under a look, finishes the second step.

These are display rules of this game. The spring, the rebound and the kick are not measured movement speeds, forces or nerve signals, and nothing here says how a muscle answers a real stimulus.

Not done from the same notes: the left arm (its own rig) still eases into its movements without the heavy jerk; “hands and feet far more forward and far more back”, “limbs longer”, “the two bodies more level”, the brain turned to face the player with eyeballs and their nerves, and the smaller, flatter chest are open.

## 130. Loading: finer coarse meshes by kind, the rig from the source meshes, and no dead ends (19 November)

The loading lane's second half, merged here.

- **Coarse meshes by kind.** The brain is kept finer (every source point within 0.3 mm of the coarse surface), the meshes the game reshapes within 0.4 mm, the rest within 0.5 mm; the game arm's bones, the motor strip and the finger and toe bones are the source meshes. Small thin muscles keep their bulk (every closed mesh at least 93 % of its volume). 878 440 triangles in place of 2 395 434; 4.57 MB of packs.
- **The rig comes from the source meshes.** Built from coarse meshes, 53 joint centres moved by more than 1 mm and 40 muscles rode another bone. `packs/BODY-RIG.json` is built offline from the source meshes and the game checks its rig against it; a test fails when the body code changes and the file is not rebuilt (`node tools/build-mesh-packs.mjs`).
- **No dead ends.** A guard that needs no other file is the page's first script: a missing or silent script, pack or mesh ends in a panel with “Try again”, and a pack that fails is asked for once more past the browser's cache before the game falls back to the source files.
- **The bar** is on the page before any script arrives, moves from the first moment with the packs' bytes, and says “Waiting” after five silent seconds.
- **The loading picture is off** (`LOADING_PICTURE` false): with a load of about four seconds there was no time to read it (switching it off did not change the load time). The user asked for the game's own models, innards first, as the loading picture; the game has no organ meshes, and building the real scene piece by piece needs the finished rig first. That request is open.

Measured on this machine from the local server, cache off: ready in 3.7 to 4.0 s (9.3 s from the source files).

## 131. Cones of light between a movement's key and its muscles (19 November)

The user: “Instead of making the corresponding connection a curved light beam, let's make it a direct sort of conical light stream beam, almost angelic in nature, and like the light beam of the Isaac Newton glass triangle prism from one to many light beam, but I guess the corresponding color ... make it direct and make it match the relevant surface area of both brain and muscle. So that's the shape of the cone.” “like a sort of halo ... or in any UFO movie where there's a massive light beam.” “Ensure it's precise to its correlates.” “Of course, the beam should be focused and not touch any irrelevant areas.” “It's basically an Iron Man pulse going both ways, but fitting those areas.” And, on seeing the first build: “way too bright at the moment, and there should be some transparency involved so that you can still see which muscle is being activated and which brain part is being activated.”

- **One to many.** The single curved line from an area to the middle of a muscle group is gone. From the part of the area that does the movement (its key) a straight cone of light goes to each muscle that movement drives, up to ten a body, on the mirror body and, where the muscle is in the picture, on your own (`LIGHT_BEAM` in `ns-links.mjs`; `emitBeam`, `emitAreaBeams` in `ns-scene-three.mjs`).
- **Precise ends.** The key is found with the picker's own rule (`regionActionAt`, asked for every vertex of the area when the brain is built), so the beam of “Bend right knee” leaves the part of the knee area that a look takes for that movement. Its width at the brain is the width of that key as seen across the beam, and at the body the width of that muscle, both measured each frame from sample points of the key and of the muscle's own mesh in its present pose. The beam is drawn at 85 % of those widths and fades to nothing at its edge, so its light stays inside both. It starts at the middle of the key (light laid over the whole key spilled onto the areas beside it).
- **Light.** The area's colour with a whiter middle, a faint brighter edge, fine streaks that drift slowly, and a brighter band that runs from the brain to the muscle while a second one comes back. It is see-through: the first build was about twice as bright and hid the limb it pointed at. Light alone does not show on the pale brain, so the beam also covers 30 % of its own light's worth of what is behind it; on black that reads as light, on the brain as a tint. Beams of one movement share their light where they leave the key together and stay shared where their muscles lie side by side.
- **Calm.** No beam from the grip's area while Space carries the brain or the mirror body (it stood across the picture for the whole carry). No streaks or running bands under reduced motion.
- **Cost.** Two meshes of at most 48 beams each, written on the processor only while a link shows; no new screen pass. The frame table is unchanged (60 / 59 / 60 / 60).

The beam is a picture of this game's own rule “this key drives these muscles”. It is not a nerve, a recording or a measured pathway, and its width says nothing about how much cortex or muscle is involved.

## 132. Lit areas almost white; a glossy brain; carried things pass through everything (19 November)

- **White.** The user: “let's make brain activation almost bright white.” A lit area's light is 80 % white (`AREA_LOOK.areaWhite`) with its gain lowered from 1.8 to 1.3, because white carries all three channels and at 1.8 its bloom hid the key's shape and its neighbours.
- **A brain like food.** The user: “let's make the rest of the brain look a little yummy, like food. So it's actually okay for the brain to be a little glossy and slimy.” The cortex has its wet sheen and glint back, a little stronger and broader than on 18 November (`BRAIN_FLESH` sheen 0.34 at power 16, glint 0.6, grooves 0.75 drier). The body and the strip's keys stay matte.
- **Through anything.** The user: “we can move both the mirror body and the brain into ourselves. And basically through ourselves and through anything.” `CARRY_THROUGH` in `ns-reference-graph.mjs`: the brain's key range is twice its start distance (to you, through you and as far again behind), the mirror body has no near limit and can be taken at any distance, and the stop-at-contact guards of the brain and the mirror body are off. This withdraws the rule of 11 November that things stop where they would touch. The collision code stays in place behind the constant.

## 133. The view package's second half (19 November)

Merged from the view lane, built and checked by helpers: a click on one of your limbs (right arm, right leg, left leg) takes control of it, and W/A/S/D then move its end while the look stays free (`LIMB_CLICK` in `ns-grasp.mjs`); the mirror body stands in the hollow of the motor strip at the start; the outside view (E) stands nearer; the root of the neck is closed by a small cap, so a look straight down no longer shows the inside of the neck; a Space hold captures the pointer. The user has since described new limb controls (keys 1 to 4 and a double click choose the limb): the click rule is the base for those and will be replaced by them.

Not done from the notes of this day: the brain turned half a turn with eyeballs and their nerves (done later the same day, section 136); the limb keys 1 to 4, the double click, the number view, a highlight for every control, the whole natural range for every limb and the faster slow turn; the roll gesture; longer limbs and the two bodies more level; a smaller, flatter chest.

## 134. Keys 1 to 4 choose the limb; a double click steps on; the chosen limb lights up; a faster slow turn (19 November)

The user: “You can now switch between which of the four limbs you want to control ... your left arm using 1, your left leg using 2, your right leg using 3, your right arm using 4 ... that becomes the main limb you're controlling with all the control keys ... double clicking will shift you from left to right, and when you get all the way to right, then right to left ... there should be a number view that's active ... you start off on 1.” “if you do double click and then hold, it will slowly shift between 1, 2, 3, 4, 4, 3, 2, 1.” “let's have the whole limb highlight when we're switching between them, just so it's obvious.” And of the limb turn of a held double tap of Space: “it's far too slow. It needs to be quite a bit faster than that, but not as fast as would happen when you just double tap the spacebar.”

A first build, by the lead, on top of the view package's click-a-limb control:

- **The choice** (`LIMB_KEYS` in `ns-app.mjs`). Keys 1 to 4 choose the left arm, left leg, right leg or right arm; the game starts on 1. W/A/S/D move the chosen limb's hand or foot: the left arm by its own rig as before, the other three through the solver of `ns-grasp.mjs`. One limb is always chosen: E, looking away and a click on nothing no longer end it. A click on one of your limbs chooses it.
- **The numbers' older meaning is gone.** They no longer do the movements of the area looked at (those lists left the screen this morning).
- **Double click.** The second of two clicks within 340 ms steps the choice on: 1, 2, 3, 4, 3, 2, 1 (`nextLimbChoice`). Held, it steps again after 0.45 s and then every 0.7 s while the button is down and the pointer has not started a drag.
- **The number view.** Four chips at the bottom middle of the picture, each a key cap and the limb's name, the chosen one in yellow.
- **The highlight.** For 1.1 s after a change the whole limb carries a band of warm light on your body and on the mirror body (`setLimbFlash`, `LIMB_FLASH` in `ns-scene-three.mjs`), drawn with the light beams' own strips: no new pass. The band lies along the limb's middle line, lifted toward the eye by a little more than the limb's half width so the limb does not hide it. It marks a control; it says nothing about activity.
- **The slow turn** is 1.0 s a stroke (2.6 s before); the sudden switch of a plain double tap stays 0.4 s.

- **The view turns to the chosen limb** (added an hour later, `LIMB_KEYS.view`, `lookFramingPoint`). When a leg or the right arm is chosen the look eases over about a third of a second (at once under reduced motion) so that its foot or hand stands in the middle of the picture left to right and 0.6 of the way up it. The pointer takes the look back the moment it moves. The left arm's hand already keeps its place in the view, so choosing it turns nothing.

Not in this build, from the same notes: the view does not yet keep the limb's end at one height in the frame while the keys move it; the left arm still moves inside its window of the view, so its range still depends on the look (the user: “Any limited range of motion that's unnatural needs to be fixed”); hands and feet do not yet travel “far more forward and far more back”; the other controls have no new highlight of their own; the roll gesture is not built. The band is a flat overlay and looks it.

## 135. Toes that grip with the hands, fingers and toes that close as you look down, and a smaller inward arm turn (19 November)

The user: “small details like when we grasp our left hand, our left toes and foot also grasp and flex, and same with the right.” “as we look down, the fingers close and the toes close more and more. And as we look up, they expand, for whether it's underside or overside ... for all fingers and toes at once, collectively.” “You probably overdid it with the internal or medial rotation with the arms.” “probably less elbow varus / valgus for external / internal rotation.”

- **Toes with the grip** (`GRIP_FEET` in `ns-app.mjs`). While Space closes the left hand the left foot's small toes curl 40 degrees, its big toe 45, and the foot points 14 degrees, by the grip's own eased share; a held click does the same on the right.
- **The look closes and opens them.** From 8 to 75 degrees of look below level all the toes curl, more and more, and the right hand closes to 85 % of a fist; from 8 to 60 degrees above level the toes lift (25 and 30 degrees) and the right hand opens and spreads. The same on either side of the limb turn. The left hand, which has its own rig, does not follow the look yet.
- These are added to the drawn pose only. Nothing is latched, the activity's own joint angles do not change, and they are gone with the grip or the look. `inspect().bodyDrawnJoints` shows the angles as drawn.
- **The arm turn.** The overside end of the upper arm's turn is 25 degrees inward (`ARM_TURN.shoulder.closed`; 65 before), so the upper arm turns 60 degrees between the two sides instead of 100 and the forearm no longer swings far out and back about the slightly bent elbow, which read as the elbow going varus and valgus. The forearm still turns the palm right over.

Measured in the game (drawn angles): at the start look, 25 degrees down, the toes are curled 7 degrees and the right hand closed 13; looking fully down 40, 45 and 77; looking up -25, -30 and the hand open 25; Space held: left toes 40, left ankle -14.

Not done from the same notes: the flexors lighting up when the limbs arrive at the underside and the extensors at the overside; the mirror body toe to toe with you and level (done with the brain's new start picture, section 136); limbs pushing limbs out of the way (the model of 18 November is still switched off).

## 136. The brain turned half a turn, with two eyeballs; the mirror body toe to toe (19 November)

The user: “it would be much better from a control standpoint, ease of use standpoint, and learning standpoint if we were to invert the brain altogether so that the motor strip changed direction. But to make clear the direction of the body, let's also include eyeballs with nerves connected to the brain.” Then: “turning it 180 degrees, such that the U becomes an inverted U, almost an N. Lowercase n, that is.” and “the eyeballs will be at the bottom.” And, the same day: “let's have the mirror body so close that the toes are almost touching and they're level, of course.”

- **The turn.** The brain is drawn turned half a turn about the axis from its top toward you (`BRAIN_VIEW.spinDeg` 180 in `ns-brain.mjs`). Its top still faces you. Its front is at the bottom of the picture and its right half is on your left, as on someone who faces you. The strip is an n: the leg areas at the top in the middle, the arms down each side, the face areas at the lower ends. The areas for your left arm and leg are now on your left, over your own left side, and those for your right side on your right. Nothing inside the brain moved: the same meshes, areas and picking, turned as one. **The crossing is unchanged**: the brain's right half still moves the left side of the body. The game says so in one place, the Esc page's paragraph on the brain, and on every area's card (“This spot in your brain's right half tells your left elbow …”).
- **What had to follow.** The left and right arrow keys still step to the area on that side of the screen; the step reads, at each press, on which side each half of the brain is drawn, so the walk's own order did not change. The brain's upper turn arrow still brings round the side it stands on, which is now the brain's back, and its words say “back” (the lower one “front”); the side arrows say “the side on your left / right”. In the fuller reading level the side labels name the brain's own half (“Brain's right half” on the left) and no longer carry an arrow. A link from an area to its limb no longer crosses the brain's midline in the picture, so the bright knot that marked the crossing no longer appears; the rule itself is unchanged.
- **The start picture.** The look and the brain's placement are as before (25.5 and 13 degrees below level). The top of the n is pinned just under the top edge and its lower ends stay above your own toes (`BRAIN_START`, `BRAIN_FLOOR` in `ns-app.mjs`), so the whole strip is in the picture, face areas included: about 780 px across at 1600 by 900 and 850 px at 1600 by 1000 (before, about 860 px with the outer face areas above the top edge).
- **The mirror body** is the literal reflection again (`MIRROR_NEAR` in `ns-mirror.mjs`): your own size, on your own level, its toes 10 cm from yours. It sits facing you inside the arch of the n, its head just under the leg areas, and covers no arm or face area. From outside (E) it keeps its size and height; it still slides away with the camera there, as asked on 12 November.
- **The eyeballs and their nerves** (`ns-brain-eyes.mjs`) are **an illustration that shows which way the brain faces**. They are built in code, in the brain's own frame, and drawn in its group, so they are placed, turned and carried with it. They are **not a traced anatomy and not part of the game's signal**: no motor area, no activity, no link; the tip names them “Eyeball” and “Optic nerve” and Space on one takes the brain. Taken from the atlas: how far each eye is from the midline (29.8 mm), how high it is, and its size (24.4 mm across; the atlas's scleras are 24.6 to 26.3). Not from the atlas: each eyeball is moved 30 mm straight forward, because in the atlas the eyes lie under the frontal lobes and would be hidden from above; the nerves, the chiasm and the short tracts, which no packet holds, are smooth tubes through hand-placed points under the brain; and the eyes look forward and 40 degrees up, toward whoever looks at the brain from above, because looking straight forward each iris would be a thin edge. About 2 950 triangles in two meshes; no work of their own each frame.
- **What does not hold, said plainly.** At the start the eyeballs are **not in view**. From the top of the strip to the eyeballs the turned brain is 1.2 times as tall as the strip is wide, so at a strip of this size its front is about 950 px below the top of the picture, behind your own body. With the mirror body toe to toe with you there is no brain size at which the whole strip and both eyeballs are in the start picture clear of the two bodies. They are seen from outside (E), when you look down or to a side (as two white balls partly behind your own arms), and whenever the brain is lifted or carried. `BRAIN_START.keepEyes` keeps them in the start picture instead and costs about 40 % of the strip's size; it is off.

These are display choices judged on pictures. The eyeballs say nothing about vision, and the game still simulates every signal.

## 137. Eyeballs that follow your look, a brain that takes the picked colour, the loading picture back, controls shown for the whole load (19 November)

The user: “when we move our head around, the eyes also move ... The eyes attached to the brain, of course. And they move in accordance to our head direction. Even if that isn't necessarily accurate.” “can we also please have the whole brain light up slightly, faintly, with whatever color area is being picked?” “Currently, I can't see the models being built on the loading page, which they should be there, and the controls switch off halfway through. And the controls should stay visible the entire time while loading.” “the wrist/ankle being 3/4 up the height of the frame.”

- **The brain's eyeballs turn with your look** (`updateBrainEyes`, `BRAIN_EYE_TURN` in `ns-scene-three.mjs`). Each eyeball is now its own mesh about its own centre. It turns by 0.7 of the look's turn from where the look started, at most 38 degrees either way, meant as a mirror would: look down and they look down (seen in pictures); look left and they should look to the left of the screen (the sign is set by reasoning: no picture confirmed it, because a look far enough to show it carries the eyeballs out of the frame). Written only when the look has changed. A picture of which way you are looking; not eye anatomy.
- **The whole brain takes the picked colour, faintly** (`BRAIN_PICK_TINT`). While an area is looked at or switched on the cortex gets 6 % of that area's glow colour added, a little more on its lit side, eased in and out over about a fifth of a second. One uniform in the cortex shader; no new pass. (Since section 187 a gain on the cortex's own colour: the added light turned the matte cortex lilac or grey-blue.)
- **The loading picture is back on** (`LOADING_PICTURE` true in the launcher). On a fast line it is short. It does not yet show the eyeballs joining the brain, which the user also asked for.
- **The controls card stays for the whole load.** It no longer fades after five seconds whatever happens: it stays until the game is ready, then fades 1.5 s later, or later still so that it has been up for at least five seconds in all.
- **The chosen limb's end stands three quarters of the way up the frame** when the view turns to it (`LIMB_KEYS.view.frameUp` 0.75; 0.6 this morning). The view still turns once and does not yet hold the limb there while the keys move it.

Not done from the same notes: the strip centred on either side of the mirror body's head “like hair”, with a wider gap between the halves; the patchy muscles of the mirror body's head; its eyes; more detail on the optic nerves; the eyeballs in the loading picture; the right arm crossing the body.

## 138. The head: whole eyes and face muscles that cover the skull (19 November)

The user: “let's fix the mirror body's head because the muscles are very patchy at the moment and smallpoxy. And let's fix the eyes of the mirror body. And of course, that also means your own body to some extent.”

- **Cause.** The coarse meshes. The face's 54 muscles are sheets a millimetre or two thick lying on the skull, and the head's eyes are three thin shells one inside the other (sclera, iris, lens). Their coarse copies dipped under the bone in patches, and one eye came out as a dark hole and the other as a grey ball.
- **The face muscles and the eyes are their source files again** (`coarseKinds` in `tools/build-mesh-packs.mjs`): 138 meshes are now kept exactly as the source, 78 before. The download grows from 4.6 to 5.7 MB and the scene from 878 thousand to 1.05 million triangles.
- **A depth offset for the face muscles of the mirror body** (`FACE_MUSCLE_OFFSET`): even as source meshes the frontalis let specks of the coarse skull through. They are drawn a hair nearer the eye than they lie; nothing moves.

Seen in a picture of the mirror body's head at the start (1600 × 1000 at pixel ratio 2): both eyes whole with iris and pupil, the forehead covered by its two muscle bellies. The frame table is unchanged (60 / 59 / 60 / 60) and the game is ready about 0.3 s later (4.2 s here).

Not done: the same offset for the head of your own body seen from outside (E); the neck's thin muscles still show some speckle.

## 139. The view holds the chosen limb; every limb moves through its whole range; every control lights what it moves (19 November)

The user: “that becomes the main limb you're controlling with all the control keys and the camera view ... just like you do for your left arm currently with shoulder control ... with the wrist staying in the same view, which is roughly 3/4 up”; “Any limited range of motion that's unnatural needs to be fixed”; “the wrist/ankle being 3/4 up the height of the frame and staying there basically”; “the right arm ... when you go left all the way and it's unable to cross the body”. Built by the limbs package on top of section 134.

**One rule for all four limbs** (`LIMB_KEYS.view` in `ns-app.mjs`, `hold: true`).
- The look carries the chosen limb. Its hand or foot keeps its place in the picture: it goes to where the line of sight through that place meets the ball its end can move on with the elbow or knee left as it is (the ball round the shoulder or hip). So a look up or down is flexion and extension at the shoulder or hip, and a look to a side swings the limb out or across. Where the joints end the limb waits; its place in the picture is remembered and it is picked up again when the look comes back. `lookCarries: false` turns this half off (the pointer then never moves a limb).
- W / S move the end away from you / toward you and A / D left / right, level, at 0.6 m/s. The view follows so that the wrist or ankle stays 0.75 of the way up the picture (eased over 0.12 s, at once under reduced motion); it turns sideways only when the end would pass 0.55 of the half width.
- Choosing a limb (1 to 4, the double click, a click or Space on a limb) turns the view to it for all four limbs, the left arm too. A limb taken by a press-and-drag becomes the chosen one without a turn of the view.
- Nothing is carried while Space holds the brain or the mirror body, during a press-and-drag, or in the view from behind (E). In the E view the keys still move the chosen limb.
- The start is unchanged: the look starts on the brain and the hold takes the left arm up where it lies (its wrist about 40 % up the picture). The first key or number brings the 0.75 framing. At 0.75 the middle of the picture lies about 14 degrees under the wrist, on your own lap, and the brain is out of the picture; starting there would hide the brain from a newcomer.

**The left arm is free of its window** (`FREE_HAND`, `fitHandAt` in `ns-arm.mjs`). It keeps its own rig and its closed-form two-bone solve. In the game the hand is no longer asked for at a place in the picture: it is asked for at a place beside the shoulder in the chest's own axes (`state.hand.rel`, metres), so nothing in its reach reads the look or the window. `fitHand`, the window fit, stays in the file for the pure tests.
- Range, as display rules after textbook figures (not measured on anyone): elbow 0 to 145 degrees; the direction shoulder to hand may rise 180 degrees forward or sideways, cross the body to 135 degrees of plane, and go behind the side line by 60 degrees with the arm down, 40 at shoulder height and 0 straight up. A bent elbow opens the reach across the body further (the hand to the other shoulder), never the reach behind.
- The elbow's side: down and out for a forward reach, out overhead, back when the arm hangs or reaches back. It swings at most 240 degrees a second, so the elbow does not snap round when the hand passes under the shoulder.
- The shoulder girdle rises with the arm's own elevation and comes forward as the hand crosses the body; it no longer reads the look.

**The other three limbs.**
- `LIMB_HOLD_LIMITS` is empty. It held the right shoulder to 0 to 80 degrees sideways and -25 to 105 forward so that held poses drew whole.
- The right arm crosses the body: `r_shoulder_abd` is -45 to 180 (was 0 to 180), and `COMBINED_RANGE.shoulder` gives that room with the forward raise: none with the arm at the side (the trunk is there), all of it at shoulder height, none again from 135 degrees of raise up (`acrossEndDeg`), where the arm would pass through the place of the head. The rig file is rebuilt.
- `solveLimb` (`ns-grasp.mjs`) takes three optional things: `project` (the combined-range rule applied inside the solve, so the angles returned are the angles drawn), damping in proportion to the lever arm (`LIMB_HOLD_TRACK.lambdaShare`; with the fixed value a folded arm turned a twentieth of what a frame asked and the hand sank), and `folded` in its result (the place asked is nearer the root than the folded limb reaches: nothing moves, so a heel pulled in stops at the buttock instead of the folded leg swinging on under the hip). The solve poses the limb as it is drawn (soft extension, the passive knee); solved on the plain angles a straightened knee came out 10 degrees short on screen.
- `LIMBS_PASS_ITEMS`: your limbs no longer stop at the brain or the mirror body. With the mirror body toe to toe the right leg could not be brought inward at all.
- A hand does not sink into your own trunk (`TRUNK_KEEP_OUT`, 14 balls along chest, belly, pelvis, neck and head; `HEAD_COLUMN` in the eye view). A key that would push it in moves nothing; a look that would carry it in slides it over the surface.
- Legs moved by the hold cost less: the hip's clear range for the limb turn is taken every third interval while a leg moves and once for posture and goal together.

**Every control lights what it moves.**
- The chosen limb's mark is the limb itself: its muscles glow and take a warm rim for 1.1 s on your body and on the mirror body (`PART_GLOW`, `setPartGlows` in `ns-scene-three.mjs`), steady under reduced motion. The band of section 134 is no longer drawn.
- `CONTROL_GLOW`: W / A / S / D light the hand or foot and, less, the forearm or shin while a key is down; Space lights the left hand as it closes; the mouse button lights the right hand; a press-and-drag lights the whole limb it turns.
- A keyed or carried leg or right arm lights the motor area and the muscles of every joint that moved, as a held limb did.
- The second click of a double click only steps the limb. It no longer presses the area under the look a second time.

**Small things from the same notes.**
- The limb turn lights the flexors as the underside comes up and the extensors as the overside does (`TURN_SIDES`): held 0.9 s after the turn and faded over 0.7 s (under reduced motion held for both and then off, with no fade). Which muscles count is a word list over the muscle names, a display choice.
- The left hand closes as the look goes down and opens as it goes up, with the toes and the right hand (`digitsForLook`).
- The arm's overside is turned 10 degrees less far in at the shoulder (`ARM_TURN.shoulder.closed` -15).
- Limbs push limbs gently (`LIMB_PUSH`): each limb is two rods; where the chosen limb's rod meets another limb's, the other limb's end is moved aside by at most 12 mm a frame. A limb that cannot give way is passed through.

**The tutorial** has nine steps. The new third step asks for 2, 3 or 4, or a double click; the W A S D step counts a leg or the right arm.

**What the limbs reach.** Read off the game on the test machine (1600 × 900, each key held 2.5 s, each limb from a fresh start). These are the simulation's own display values; nothing here was measured on a body.

| limb | travel of the end: sideways / up-down / forward-back (m) | S, toward you | W, away | A, left | D, right |
| --- | --- | --- | --- | --- | --- |
| left arm | 0.72 / 0.01 / 0.75 | elbow 134, hand at the chest | elbow 0 | raised 95 to the side, 37 behind the side line | across, 100 of plane |
| left leg | 0.99 / 0.01 / 0.42 | hip 45, knee 120 | knee 0 | 44 out | 30 in |
| right leg | 0.98 / 0.01 / 0.42 | hip 46, knee 120 | knee 0 | 30 in | 45 out |
| right arm | 0.73 / 0.04 / 0.45 | elbow 145, 44 behind | elbow 0 | 31 across the midline | 60 behind, 65 out |

Carried by the look alone: up, the left arm rises to 140 degrees (154 with S), a hip to 101, the right arm to 138 (166 with D); down, the left hand comes beside the hip, a hip goes 30 back and the right arm hangs; far to a side, the left arm goes from 38 behind the side line to 141 across, a leg waits at 45 out or 30 in, and the right arm goes from 44 across to 58 out. After a double tap of Space the travel is the same within a few centimetres. While a key moves a limb its wrist or ankle stays 0.73 to 0.77 up the picture, except with a hand pulled in to the chest: the look is then at its lower end, 88 degrees down, and the wrist stands 0.36 to 0.61 up.

- Where the look carries the place beyond the joints, the limb waits (`waitMm`, `waitShare`). Without that rule a look far to one side raised the thigh instead of waiting, and the leg swung up beside the head.

Frame rate on the test machine, quiet: the timed frame table reads 60 / 59 / 59 / 60 (still, look, look up and down, limb turn) against 60 / 59 / 60 / 60 for the build before; keys held 60 / 60 / 59 / 59 for limbs 1 to 4; the look carrying the limb 60 / 58 / 57 / 55.

**Not done, or not right.**
- **Not a first-person picture when a limb is framed.** With the wrist or ankle 0.75 up, the look is 50 to 59 degrees down. The eye view's camera stands half a metre behind the eye and above the head, at one distance for every look (`EYE_DOLLY` in `ns-camera.mjs`), so at that look it sees your own shoulders and collar bones from above, with the cap that closes the root of the neck as a red disc at the lower edge. The build of section 134 draws the same picture after 1 to 4. An earlier rule brought the camera to the eye for steep downward looks; it went when the stand-off became one distance, after far side looks magnified everything. Left as it is here: it is a decision on the camera, with its own test (`tests/flat-view.test.mjs`), not on the limbs.
- **The roll gesture** (two keys at once roll the held thing) is not built.
- No arrow or trail shows which way a key moves the limb; the answer is the glow, the lit area with its beam, and the view following.
- The start card of controls is unchanged (its four chunks were asked for as they are); 1 to 4 are shown by the number chips in the game.
- While you look at the brain the chosen limb is carried up in front of the strip. `lookCarries` is the switch.
- The game does not start framed at 0.75 (see above).
- On a limb at full stretch W does little, and a level move sideways bends the elbow or knee because the end stays level. With a hip at its back end (30 degrees) W and S move the foot 6 cm.
- With the right arm fully across, the front of the right shoulder shows a creased, jagged patch.
- The look carrying a leg or the right arm runs at 55 to 58 frames a second on the test machine.
- Legs can go below where a floor would be (hip 30 degrees back); there is no floor.
- A pushed limb that cannot give way is passed through.
- The glow on a hand or foot alone is faint against the bone colour.
- The right arm on the overside still reads a little turned in.

## 140. Looking down at your own body, you look out of your own eyes (19 November)

The user: “a proper first person view.” The limb work (section 139) holds the chosen limb's hand or foot three quarters of the way up the picture, which puts the look 50 to 60 degrees below level. From the eye camera's stand-off, half a metre behind and above the head at every look (set this morning so that a turn to the side magnifies nothing), that was a view of your own shoulders and collar from above with the neck's cap at the lower edge: not out of your eyes.

- **The stand-off closes as the look goes down** (`EYE_DOLLY` `downFromDeg` 27, `downToDeg` 60, `downShare` 0.12 in `ns-camera.mjs`). At the start look and above, and to every side, the camera stands where it stood. From 27 degrees below level it comes forward, eased, and from 60 degrees down it stands at 12 % of the stand-off: 6 cm behind the eye. Looking down your body you see your chest, belly and legs from your own eyes.
- **The price.** The camera travels about 2 cm for each degree of look in that range (up to 8 mm a quarter of a degree; elsewhere the bound stays 3 mm). The morning's rule “one stand-off at every look” now holds from the start look upward; three tests that pinned it everywhere are restated.

Seen in pictures at 1600 × 900: the start picture is unchanged; with a leg chosen and pulled in, the view is down the chest and belly to the thighs. Still not right: between about 30 and 50 degrees down the camera is part of the way and your collar and the neck's cap are still in the lower edge of the picture; straight down (88 degrees) the picture is your own upper chest and ribs from very near; and the chest fills the lower half of every downward look, which the user has asked to be smaller and flatter.

## 141. Bones where the head was; sharper pictures on slow machines; a look that is never pinned; areas that answer a passing look; a jerk that comes half way back (19 November)

The user's notes of the evening, in their words: “get rid of the red plate where the head used to be. If we're not going to have a head, let's just have bones then.” “Resolution for the body and the mirror body are far, far too low ... sharp and not blurry or extremely pixelated. Or rough or patchy.” “The muscle color tone is far too dark initially.” “problems with the camera view getting locked to a downward angle, especially when the neck is activated from the brain.” “highlighting specific areas of the brain with our cursor just by running over, those body parts not activating ... They have to activate at least once.” “They jerk one way and then they partially return back.” “I like the zoom ... dolly effect, but you've definitely gone overkill with it.” Then: “there should essentially be no zoom effect when moving ... the camera view up and down.”

- **The neck's cap is gone** (`EYE_COLLAR.cap.on` false). The root of the neck is open and shows the top of the rib cage, the spine and the collar bones.
- **Resolution.** The cause was the automatic quality controller: on slow frames it halved the picture's resolution and then swapped the bodies for copies clustered at 4 to 7 mm. Its steps are now 1, 0.9, 0.8, 0.7, then 0.7 and 0.6 without the outline passes, and none of them touches a mesh (`QUALITY_LEVELS`). A slow machine gets a slower frame, not a rough body. The mirror body's own copy is unchanged (5 mm cells): drawn from the full meshes, or from a 3 mm copy, looking around fell from 59 to between 47 and 49 frames a second here, so that is open.
- **Lighter muscles.** The two shade bands of the comic look are lifted (0.08 and 0.34 to 0.3 and 0.56) and the six muscle tones are 0.07 lighter.
- **The look is never pinned** (`headLookRange`). The view is the look alone since this morning, but its range still moved with a neck angle held by the neck area, and the look was kept inside what was left. The range is now the view's own, whatever the neck holds.
- **A passing look switches an area on** (`GAZE_DWELL.latchS` 0.3 s to 0.07 s).
- **Jerk and come half way back** (`JOINT_LATCH` driveS 0.3, relax 0.5): the part is driven to its end, held there for 0.3 s and comes back half of its swing; each click does it again.
- **No zoom with the look.** The camera's closing on the eye for a look down (section 140) is switched off again (`EYE_DOLLY.downShare` 1): the stand-off is one length at every look. The price is section 140's fault back: with a limb framed, the look is steep and the picture is your own shoulders from above. A zoom tied to W/A/S/D, which the user allows, is not built.

Frame table after these, four runs: standing still 60; looking around 45, 49, 59 and 59; looking down and up 50 to 57; limb turn 55 to 60. The two looking cases are slower and less steady than this morning's 59 and 60. Now that a passing look switches areas on, a sweep of the look across the strip sets parts jerking, and that work is in every such frame; the cause was not traced further.

Not done from the same notes: organs inside the opened chest and a clean, smooth end for the neck's muscles; the light-blue glass outline for everything that is hidden behind something; W and S moving a limb's end along the straight line between its proximal and distal joints with A and D as pure abduction and adduction; extreme neck movements from the look showing on the mirror body.

## 142. A slight punch-in while a movement is switched on (19 November)

The user: “Maybe let's get rid of all zoom, pan, dolly effects and just have slight punch-in effects. And punch out as soon as activation stops.”

`PUNCH_IN` in `ns-app.mjs`: for the first 0.3 s of a movement being switched on (the time its joints are driven, `JOINT_LATCH.driveS`) the lens is 4 % tighter, eased in over about 0.05 s and out over about 0.1 s. Nothing else moves the camera's lens or place by itself: the look-down dolly is off (section 141). Not under reduced motion. The first Body update 48 applied the effect to the eye lens, then blended to the outside lens. That left a settled outside view at its rest angle throughout an activation. The repair applies the same scale after blending the two lenses. Rendering and pointer picks share the resulting projection. The crosshair ray stays centred. Pausing restores the resting lens, while the simulation saves its pulse and pose. The next movement can still punch in. The lens effect requires an arm, body or rotation action in the active pulse. A highlight-only pulse still lights its marker and keeps the lens steady.

The view's turn to a newly chosen limb and its hold on that limb's hand or foot (sections 134 and 139) are left as they are: the user asked for those by name the same day. If “all pan effects” was meant to include them, they are one switch each (`LIMB_KEYS.view`).

## 143. The brain's up arrow in the opening picture

The brain points higher than the player's opening look. In a wide window, planning its compass from the brain's direction placed the up arrow above the player's picture. At the resting landscape placement, the compass now takes its world positions from the player's opening view. The brain keeps those positions during a turn. Carry the brain to a new place and its compass follows the existing carry rule. The portrait layout still uses its wider opening lens and its previous compass plan.

At 1600 × 900 the motor strip spans about 49% of the opening view. Section 59's 42% is a measurement from an earlier layout. The larger arch and the later framing in section 136 still apply.

## 144. No set height for the chosen limb; sharp bodies that keep the frame rate steady (19 November)

The user: “Perhaps the problem with the zoom in, zoom out fixes we look up and down is the 3/4 height rule. Disregard that rule. And also find a way for it, the bodies to be high resolution, yet not destabilize performance.”

**The rule is gone.** `LIMB_KEYS.view.frameUp` is `null`. Until now the view put a newly chosen limb's wrist or ankle in the middle of the picture, three quarters of the way up, and kept it at that height while W, A, S and D moved it. To do that the look pitched 50 to 60 degrees down by itself, and went on pitching with every key. The eye view's camera stands half a metre behind the eye on the line of sight, so each of those pitches swung the camera up over your head and back: a camera move nobody had asked for. Now the view turns only to keep the limb's end in the picture (`keepInFrameTurn`): when a limb is chosen and while the keys move it, the look turns just far enough to bring the end inside 0.55 of the half width and `bandUp` 0.6 of the half height, and not at all when it is there already. At the start look all four ends are, so choosing a limb there moves nothing but its highlight. The end is no longer brought to the middle left to right either; that turned the view half away from your body for an arm held out to the side. Your look still carries the chosen limb, and the keys still move it.

**What still changes when you look up and down, and why it was left.** Measured on the game's own numbers at a run of looks. Below the start look the camera still swings about your eye at half a metre: from the start look to straight down it travels about 0.6 m, and the mirror body is drawn 8 % larger at 56 degrees down and 23 % larger at straight down; your own body is then seen from above your shoulders. A camera that only turned where it stands would look down at your own back, and one at the eye itself is the view the user called “super magnified” on 18 November, so the stand-off stays. Above the start look the camera only turns, and the mirror body's size changes by about 2 % up to 20 degrees above level. The swing was not changed without the user's word.

**Why the game stuttered when a movement switched on.** A profile of the script while the look passed over the strip found two faults, both in the lead's own recent work.
- The punch-in of section 142 changes the lens on every frame for a third of a second, and the arrows round the brain and the mirror body were planned again whenever the lens changed: the motor areas' whole screen grid, about 10 ms of script a frame. The arrows are now planned for the lens without the punch (`planLensFov`, `fovScaleBase`).
- The touch-free range of the hips (`hipRotationClearRange`) was taken on nearly every frame while a leg movement from the strip was under way, at 4 ms or more each. A range now poses the body twice instead of up to 36 times: a hip turn moves the shank, foot and toes as one rigid piece about one line, so the other turns are a rotation of the points already found. It is checked on every call and against the old way in `tests/hip-range.test.mjs`. A goal that changes frame after frame is taken every six frames, and no range is taken within six frames of the last. The nearest-distance search over every pair of points is an exact grid search.

Frame rates on the lead's machine at 1600 by 900, before and after: standing still 60 and 60; looking sideways across the strip 49 and 58 to 60; looking up and down 32 and 56 to 60; the limb turn 60 and 57 to 60. On a double-density screen (3200 by 1800 drawn), after: 60 standing still and 52 to 60 in the three moving cases over two runs.

**The mirror body's meshes follow its size on the screen** (`MIRROR_DETAIL`). One copy for every case was wrong both ways. The 5 mm copy is under two drawn pixels at the usual distance on a plain screen, but over three on a double-density screen and many when the body is carried near: rough edges and small holes in thin sheets. The full meshes are right when it is near and waste when it is far. The copy is now chosen from what one source millimetre measures in the drawn picture: full meshes, a 2.5 mm copy or the 5 mm copy, whichever is the coarsest whose cell is at most 1.3 pixels, with a 12 % margin so a slowly carried body does not swap back and forth. At the start that is the 2.5 mm copy on a plain screen and the full meshes on a double-density one. With the two faults above removed, neither costs a measurable frame on the lead's machine. Your own body is always drawn from its full meshes.

**Resolution is the last thing given up, not the first** (`QUALITY_LEVELS`). The first cheaper level used to be a resolution step. It is now `lite-1`: full resolution without the two passes that only decorate, the glass x-ray of the deep brain and the bloom of light above white. Measured on a drawing buffer too large for the lead's graphics card (5120 by 2880): 24.1 ms a frame with everything, 21.8 ms without the x-ray, under 16.7 ms without the bloom as well. That is as much as going down to about 0.8 of the resolution would save, and every pixel is kept. Without the bloom a glow ends at white instead of spreading; colours at or under white are the same. Resolution steps come only after that, by tenths, never under 0.6.

**The controller sees frames that are every second one late** (`frameStat`, `QUALITY_AUTO.slowMs` 1000 / 45). On that large buffer the game ran at 40 to 43 frames a second and never left the full level, because the median of its frame times was one screen refresh. Slow and fast are now judged on the window's mean with each sample held to twice its median: frames that miss every second or third refresh count as slow, and one hitch among steady frames still moves nothing. On the same buffer the game now steps to `lite-1` after about five seconds and holds 60 frames a second at the full 5120 by 2880.

Not measured: a slow graphics card. The lead's machine is not one, so the large buffer stands in for it. Supersampling the picture on a plain screen was tried on pictures (double resolution, scaled down) and left out: at four times the pixels the bodies were only slightly smoother.

## 145. W and S move a limb along its own line; A and D swing it sideways (19 November)

The user: “when we're doing WS or SW controls, we want the limbs to move in a straight line from between proximal and distal joints, so wrist and shoulder and ankle and hip. They're moving in a straight line, and they're not rotating internally or externally while moving. They're just moving in a straight line. We only introduce some rotation if we're combining key functions, I suppose, like forward and back whilst doing left and right at the very same time. Whilst A and D functions, left and right functions, are really moving between medial and lateral, so abduction, adduction.”

Until now the keys moved the chosen limb's hand or foot level over the ground: W away from the view, S toward it, A and D across it, whichever way the limb pointed. Now (`LIMB_KEYS.view.keys` is `'limb'`, `limbKeyMove` in `ns-app.mjs`):
- **W and S** move the end along the straight line from the shoulder or hip through it: W out, S in. Only the elbow or knee and the shoulder's or hip's own flexion change.
- **A and D** swing the whole limb about the shoulder or hip toward your left or right, with its bend unchanged. The swing ends where the limb points straight to that side.
- The limb's own turn (inward or outward) is not one of the joints the keys move, with either key pair or both together; the double tap of Space turns it, as before.

While keys are held, the place asked of the end is kept as a direction from the root and a length along it, not as a free point. A first version took the line afresh from the end's own place each frame, and the line drifted by whatever the joint solve missed: the right hand came in 37 degrees off the line it started on and went back out 27 degrees off.

Measured on the game's own numbers, each limb alone from the start: both legs and the left arm stay within 0.1 degrees of their line through S then W and come back within 1 to 7 mm of where they began; A and D leave their reach unchanged to within 2 mm. The right arm, whose joints for this are only two at the shoulder and the elbow, cannot fold along its line exactly: its hand is up to 13 degrees off the line when half folded and more when folded right in, but it returns to the line (0.1 degrees) when it is let out again. Both keys together were tried and not measured beyond “the limb swings and reaches at once”.

## 146. The mirror body’s up arrow in the opening picture

The green up arrow could start above the picture. The usual mirror frame uses an older reference look. Planning from the opening look alone brought the arrow in over a coloured motor area. When the usual arrow starts too high, the game picks a clear spot by the top of the mirror body in the opening view. The green arrow keeps its size and shape. It sits to the side where the motor strip fills the space above the head. The other green arrows keep their places. A tap tilts the mirror body one step.

## 147. Whatever is hidden behind something shows through it as light-blue glass (19 November)

The user: “The under torso or under any body of flesh outline is great. That sort of bluish transparent outline is great. We actually want that for everything now. Whenever anything is occluded behind something, we want to see it through as well with a highlighted outline, light bluish glass thing.”

Until now only a limb hidden behind another limb or the trunk of the same body showed through, in its limb's colour (section 112; `ns-see.mjs`). The look the user liked was the left arm's, which was blue.

- **One look.** Every ghost is a light-blue line round the hidden part, a thin dark keyline just inside it, and for some things a faint cool fill (`SEE.glass`). The ghosts no longer carry a limb's colour; the strip, the beams and the muscles keep theirs. The colour stays under the level at which the bloom starts, so a ghost does not glow.
- **Things.** The pass works on things: on each body its four limbs and its trunk with the neck and head; the brain's surface; the eyeballs with their nerves; and the motor strip, by the groups its own labels name (the left arm's areas, the face and neck's, and so on; each half of the brain its own). A thing never shows through itself, and a part joined at a joint to the part in front is not hidden.
- **Within a body** the trunk now shows through a forearm, hand, shank or foot in front of it (`SEE.rules.trunk`). **Across the bodies** your limb or trunk shows through the mirror body and the mirror body through you (`SEE.rules.across`). **The brain** (`SEE.rules.brain`): a body behind the brain shows through it; the brain's own edge, the groups of its motor strip and its eyeballs show through a body part in front of them; the eyeballs and nerves show through the brain's own surface. Each of the three can be switched off by itself.
- **Where the line is.** Round the hidden thing's own outline, never round the thing in front. So a big thing behind a small one, the trunk behind a hand or the brain behind a leg, gets a line only where its own edge passes behind the small one. Where two hidden things meet there is one line, on the side of the smaller kind.
- **What keeps it from becoming a tangle.** A trunk that mostly shows gets lines and no fill; the brain's surface never gets a fill (it is behind almost everything). A hidden piece narrower than 3 cm gets nothing, which also drops whatever lies behind a finger. The strip shows by its groups, about seven a side, not by its 54 areas: with every area outlined, an arm in front of the strip was covered in contour lines. A body that is hidden and hardly seen anywhere, the mirror body behind a carried brain, is filled as one glass figure, trunk and limbs alike.
- **Aiming is unchanged.** The crosshair takes a ghost only when it is the strongly filled ghost of a limb that is hidden and hardly seen, and only where a part of that limb's own body covers it. Everywhere else it takes what is in front, and Shift reaches behind. No trunk, brain, strip or eyeball ghost takes the crosshair, and a motor area the look names stays the default behind any body part (`controlTargets` in `ns-app.mjs` was not changed; tests pin this).
- **How.** The brain was not in the picture the outline pass keeps of the bodies. It now has a small picture of its own, a quarter of that one's size: its surface in one draw, the strip in one draw with the same per-fragment owner table the strip itself is drawn by, the eyeballs and nerves in three small draws; drawn only on frames where the camera or the brain moved. The ghosts are drawn after the brain's surface and under the beams, links and arrows (they were drawn before the brain and so could never show through it). The pass that draws the lines, and the pass that lays them over the picture, are drawn as a grid of 48 cells across, and only the cells that hold a ghost that can show.

Measured here (Chromium, AMD Vulkan), by the graphics card's own timer round the pass, per frame on which the camera or a body moved: 1.4 ms at 1600 × 900 and 1.6 ms at 3200 × 2000, against 0.95 and 1.1 ms with the three new rules switched off. (The pass as it was before this work, timed the same way on its own branch earlier in the day: 1.0 to 1.15 ms and 1.3 to 1.5 ms.) On the main thread the pass takes 0.2 to 0.4 ms. With a limb moved by a held key and with the brain carried through the body the frame rate is the same with the pass on, with only the old rules, and with the pass off. The frame table on this branch, three runs: standing still 60, looking around 59, down and up 60, limb turn 57 to 60; the same script on the lead branch in the same hour gave 60, 45 to 59, 59 to 60 and 58 to 60. Under reduced motion six pictures of a picture at rest, 0.2 s apart, are the same pixel for pixel.

Not done, or not as good as it should be:
- The nerves and eyeballs behind the brain are always in the opening picture: an X of light-blue line in the middle of the brain and two circles over your chest. They are what was asked for, and they are the first thing a newcomer sees. One number (`SEE.fillEyes`) or one switch (`SEE.rules.brain` takes the rest of the brain's ghosts with it) changes that; a switch for the eyeballs alone was not added.
- The strip behind your limb shows as group outlines and a faint tint, not in its colours. Which area is under the crosshair is said by the tip, as before.
- A motor area hidden behind the brain's own surface (the strip seen from underneath) gets no ghost: the strip is one piece with the brain here.
- Where the trunk is behind the root of its own limb (an upper arm or thigh), it is not a ghost, so a trunk's ghost under a forearm stops at the elbow without a closing line.
- At a screen density of 1 the ghost lines are smoothed from 2 × 2 samples as before; at density 2 they have one sample a pixel, as before.
- Toes and fingers seen through the brain come out ragged: each is near the 3 cm limit, so parts of them are dropped.

## 148. No loose lines over the open neck; the start check follows the compass rule (19 November)

The user: “make sure the occluding muscles, neck muscles are gone, and the transition between is smooth. So you don't just have, part of a muscle ripped off and detached.”

In the eye view your own body ends at the collar: a box over it is not drawn (`EYE_COLLAR`, section 141 took its cap away, so the bones show). The outline pass keeps its own picture of the bodies, and that picture did not know about the box: the pieces of neck and shoulder muscle the game leaves out were still in it, and their outlines were inked over the open neck as loose dark lines. The outline's picture is now cut by the same box (`setClip` in `ns-outline.mjs`; Three's clipping chunks in its three vertex shaders and its fragment shader), for your own trunk and head only. A limb is never cut there, so a hand in front of your face keeps its line. Seen in pictures at the start look and at 71 degrees down: the lines are gone. The muscles that run up to the skull still end at the box's level plane, a straight cut, not a modelled end. Organs inside the chest, which the same note asks for “for fun”, are not built: the project's packets hold no organ meshes.

The launcher's start check (`?case=boot`, `assertConfiguredBoot` in `eye-view-r558.mjs`) required every arrow tip of the brain to sit on the centre line of its frame side. Section 143 (the other maintainer's) plans the tips in the player's own opening view so that all of them start inside the picture and clear of the motor colours; a tip may then slide along its side, and the check failed from that change on (the left and right tips stand 68 px above the middle of their sides at 1600 by 900). It went unnoticed in two uploads because the lead read only the first 240 characters of the check's output. The check now accepts a tip on the centre line of its side or on the side itself, and passes.

## 149. Separate places for the arrows seen from behind

At 640 by 450, the grey up arrow could land above the top of the picture after you pressed E. In a wide window, the green up arrow sat on the motor strip. A change of window shape could also put a green stroke across a grey one. The opening eye view already had its own correction.

When the outside camera settles, the game checks each arrow's full picking and hover area in that view. A clear tip keeps its place. An obstructed tip moves to a free world position at its original depth, on its side of the object. The mirror body's visible edge guides the search for its arrows. The game uses the resulting 3D frame for drawing and picking. The frames stay in the world as you look around or tilt the mirror body back upright. Carrying an object still lets you choose its place.

## 150. A wheel turn can no longer throw you out of the game (19 November)

Found by the author's own hunt for faults (the user's standing word of 11 November: look for them and fix them), with sessions of random input: keys, clicks, drags and wheel turns for a minute or so each, checked for script errors, numbers that are not numbers, a camera that is not finite, and a game that is no longer there.

One session ended on a blank page. The browser had gone back in its history, to the page before the game, and everything in the game was gone. It took three inputs: Shift held, a move of the pointer, one turn of the wheel. In Chromium on Linux a wheel turn with Shift held that the page does not use is the browser's “back”; the game asks you to hold Shift (to reach the thing behind another), and it used the wheel for nothing. On other systems a sideways two-finger swipe on a trackpad does the same.

- The page now takes every wheel event (`wheelStays` in `ns-app.mjs`, a listener on the window) except one that scrolls a panel of the game's own that can still scroll that way, without Shift. The Esc page still scrolls with the wheel; checked. Ctrl or Command with the wheel, the browser's own zoom, is left to the browser.
- `overscroll-behavior: none` on the page (`neurosurge.css`), so a swipe past the page's edge is not a browser gesture.

Two of the first seven sessions left the game this way; in one the same gesture the other way brought the game back, started afresh. After the change the three inputs were replayed with and without Space and W held, and both of those sessions were run again: the game stays. Eleven sessions of 50 to 75 seconds in all, four of them after the change, found no script error and no bad number. Not tried: a real trackpad, a mouse with a tilting wheel, other browsers, macOS.

## 151. The motor strip either side of the mirror body's head; the two halves of the brain drawn apart (19 November)

The user: “let's center the motor strip on either side of the head of the mirror body. So maybe we'll keep a bigger gap between the hemispheres. So it looks like almost hair coming out of either side of the mirror body's head.”

- **The picture.** At the start the mirror body's head stands **in the gap between the two halves of the strip**, level with the middle of their inner ends (the two leg areas, at the top of the n). The two halves run outward and down from either side of it: left leg and right leg beside the head, the arms beyond, the face areas at the lower ends. Until now the head stood under the leg areas and touched their inner edges.
- **A gap between the halves.** The two halves of the brain are drawn 6 mm further from the midline each (`HEMI_GAP` in `ns-brain-part.mjs`), so the gap between the two leg areas is 14 mm where the atlas has 2 mm: about 90 px for a head 56 px wide at 1600 by 900. **This is a display choice and not anatomy.** Nothing inside a half changes: the same meshes, the same areas of the same sizes. The parts in the middle that belong to neither half stay where they are and show at the bottom of the gap: the brainstem, the cerebellum, the hypothalamus and the ventricles of the midline (21 of the 59 brain meshes; the other 38 move, 19 a side). The move is made once, on the loaded points, before anything is built from them (`partedBrainAssets` in `ns-app.mjs`), so the areas, the picker, the labels, the light beams, the turn arrows, the outline and the hidden-things picture all come from the parted brain and agree with what is drawn. The eyeballs go out with their halves; the chiasm stays on the midline and can now be seen from above, through the gap, a little under the crosshair.
- **What moved, and what did not.** The look (25.5 degrees down) and the mirror body (the literal reflection, toe to toe, asked for the same day) are untouched. The brain moved: the strip's top no longer stands 15 px under the top edge but 67 px under it at 1600 by 900, where the middle of the leg areas is level with the head (`BRAIN_START.headUpDeg`, `legShare` and `brainStartCeilNdc` in `ns-app.mjs`; the head's height was read off the start picture). The rule holds for every window shape: where the width decides the strip's size (4:3 and upright windows) the strip is shorter and its top comes further down to the head. `BRAIN_START_MOTOR_FRAC` 0.58 became 0.64 because that share now counts the gap.
- **The price, said plainly.** The floor did not move (your own fingertips and toes), so on a 16:9 window **the whole brain is drawn 0.88 of the size it had**: the strip spans 757 px with its gap (it was 780 without one), and each half is 12 % smaller than before. The head cannot be level with the middle of the strip's whole height: the n is 375 px tall and the head is 130 px under the top edge, so the strip would be cut or less than half its size; and at that height the hollow of the arch is 320 px wide, which is the picture this note replaces.
- **The arrows.** With the strip lower, the band above the arm areas is free: the brain's own up arrow stands above the left arm areas, clear of the colours (on the lead it lay faint over the mirror body's head at 1280 by 720 and 1024 by 768), and the mirror body's up arrow stands in the gap above its own head.
- **The start check** (`?case=boot`) has a new rule for a landscape window: the mirror body on the middle of the strip, the top of its head within the height of the leg areas, and hardly any of it behind a motor colour.

**The optic nerves read as nerves** (`ns-brain-eyes.mjs`, `nerveParts` / `buildNerves`). They were one plain tube each. Now each leaves its eyeball in a sheath, thick at the eyeball and tapering, that ends in a small step; beyond it the nerve is striped along its length and two fine red vessels run along its upper side. At the chiasm, which now lies in the gap between the halves where it can be seen from above, each nerve parts in two: a thicker strand crosses the midline, one passing over the other (the lower one darkened where they cross), and a thinner strand stays on its own side. Behind the chiasm each tract runs back and outward and fans into three thin bundles where it ends in the brain. That about half the fibres cross is textbook anatomy; which strand passes over, their thicknesses and the open X are choices made so that the crossing shows. An illustration, not a traced anatomy: 2 800 triangles for the nerves, built once. Seen in the start picture (the X shows through the gap, under the mirror body's legs), from outside (E) and with the brain carried near. Built by the helper; the lead finished it when the helper stopped and looked at those three pictures.

The eyeballs and nerves in the loading picture (Message 176) are NOT done: the helper stopped before that part.

Not right, or not done:
- At 1280 by 720 the labels “Belly and back” and “Face and neck” are placed in the hollow of the arch, over the mirror body's arms (on the lead only “Belly and back” sat there).
- In an upright window the mirror body's left and right arrows now lie over the face areas and are drawn faint.
- In a 4:3 window the crosshair starts on the chiasm seen through the gap, so the tip “Optic nerve” is on screen before the player has done anything.
- From outside (E) the gap ends in a dark notch between the two back ends of the brain, and the mirror body's head is not in the gap there (the rule is for the picture you start in).

## 152. The eyes come together and join the brain in the loading picture (20 November)

The user (19 November): “And this also means on the loading page, you'll also see the eyes come together and connect to the brain.”

The loading picture (`ns-assembly-core.mjs`) builds your body, the mirror body and a larger brain as their files arrive. Once the brain's strip has lit (or could not be lit), the two eyeballs and the optic nerves now come in last (`ASSEMBLY_EYES`): the eyeballs fly in from far apart, in front of and below the brain, and close on their places while the nerves come up under the brain to meet them; each flashes as it lands, like every other part. They are built by the game's own builders (`buildEyeballs`, `buildNerves` in `ns-brain-eyes.mjs`), so they are the same illustration the game draws. The loading picture's brain is also drawn with its two halves apart, as the game draws it (section 151), so the eyeballs, which follow their halves, sit where the game puts them. Under reduced motion the loading picture has no parts at all (a still progress bar), as before.

The brief for this work said the loading picture's brain was still the old way round. It was not: it is seen from in front, with its front toward the viewer and the strip as an arch, which is how the game's brain stands since it was turned (section 136). Nothing was turned.

Seen in pictures taken while one late pack was held back so that the loading picture kept running: the eyeballs flying in from either side and the nerves appearing, and the two joined under the brain a second and a half later.

Found and not fixed: on a slow connection the loading picture shows no parts for most of the load. At 600 kB/s, measured: the picture's worker is started only when the launcher's own scripts are in (about 12 s), the worker's scripts then arrive at about 18 s, and its copy of Three.js at about 27 s, out of a load of about 45 s. The local server sends `Cache-Control: no-cache` without validators, so the worker downloads Three.js a second time here; a host that lets the browser keep files (GitHub Pages does, for ten minutes) would serve it from the cache, and the picture would start at about 18 s. Starting the picture earlier needs it to be fed from the early loader (`early-load.mjs`) before the launcher's scripts are in; not done.

## 153. White finger and toe tendons; muscles a step darker (20 November)

The user: “Finger/toe tendons should be there and white-ish.” And: “Muscles probably a little too light now.”

**The tendons were there, in muscle colour.** The atlas's long finger and toe muscles run on as their tendons right to the fingertips and toe tips (the deep finger flexor reaches z 666 mm, the fingertip's last bone ends at 653), and so do the small muscles of the palm and the short toe muscles. The game draws a muscle's tendon parts in a pearly white where its stack rule finds them anchored on bone (`TENDON_FROM_STACK`), and the tendons along the fingers and toes lie free of bone, so they stayed orange-red. Now (`DIGIT_TENDONS`, `digitTendonKind`, `digitTendonWeights` in `ns-scene-three.mjs`) the parts of those muscles beyond the wrist or the ankle are tendon by their place: the long finger and thumb muscles below the wrist (full below z 815 mm of the atlas, none above 860; the wrist joint is at 800), the long toe muscles below the ankle's level (full below 95, none above 150; their bellies end above that), the short toe muscles and the big toe's short muscles forward of the toes' joints with the foot, and the lumbricals and interossei below the knuckles. The higher of this and the stack's own estimate is kept, so nothing that was white turns red. Seen on pictures of both hands and both feet at the start: the strands along the fingers are pale now, the bellies in the forearm and on the sole keep their colour. A display rule from the joints' places, not a dissection record of where each tendon begins; tested on the game's own body (`tests/digit-tendons.test.mjs`).

**Muscles a step darker.** Half of the lift of section 141 is taken back: each of the six muscle tones 0.035 darker (it was 0.07 lighter), and the cel look's two shade bands 0.24 and 0.49 (0.3 and 0.56 since section 141; 0.08 and 0.34 before it, which was “far too dark”).

## 154. A circle drawn while pressing turns the brain or the mirror body clockwise or anticlockwise (20 November)

The user (19 November): “And if we click and then use two fingers on our trackpad, or if we make a great big circling motion, clockwise or anti-clockwise on our trackpad or mouse whilst clicking, instead of going straight up and down and left and right, instead of orbiting and shifting forward or backwards in a particular direction, we can turn it clockwise or anti-clockwise, any object basically, any item.”

The brain and the mirror body could be turned left and right and tilted; they could not be turned in the picture's own plane. Both now have a roll: a turn about the line from your eye, positive clockwise as you see it (`orbitRoll` in `ns-brain.mjs` brainViewTransform, applied after the orbit and before the squash and the carry; `roll` in the mirror body's orbit, `mirrorOrbitRoll` in `ns-mirror.mjs`, applied about the view's own axis after the yaw and the tilt). Everything drawn on them, aimed at on them and labelled on them follows, since all of it is built from their transforms. Reset brain view puts both back.

The gesture (`CIRCLE_ROLL`, `circleRollStep` in `ns-app.mjs`): press on the brain or the mirror body and drag round in a circle. The drag's direction is followed sample by sample; once it has turned 300 degrees the same way over at least 140 px, it counts as a circle. From then on, until you let go, each further turn of the drag's direction rolls the thing by half of it (a whole circle of the pointer turns it half a turn), and the drag no longer turns it left, right, up or down. What the first 300 degrees of the circle turned it left, right, up and down is taken back at that moment. A straight drag, a zigzag, an S and a circle a few pixels across do not count. Seen on pictures: two clockwise circles on the brain turn its strip upside down with its labels; two on the mirror body stand it on its head.

Not done: the two-finger turn on a trackpad. A web page is not told about it (Safari alone reports it), so only the circle drawn with one finger or the mouse is used. Limbs are not rolled by the gesture (a press and drag on a limb turns and bends it as before).

## 155. Through the gap between the halves you see into the brain (20 November)

The user: “Through the gap, you should be able to peak into the brain's inner structures.”

Since section 151 the two halves are drawn apart, and looking down into the parting one saw only each half's inner wall of cortex and, at the bottom, the parts of the middle. Now **each half's cortex is cut away next to the gap**, and what that lays open is drawn in the colours of an anatomy atlas, the loading picture's (`ASSEMBLY_TIER_COLOURS`): the white matter cream, the lateral ventricles and the third ventricle pale blue, the deep grey parts (hippocampus, pineal, habenula) grey, the internal capsule a lighter cream, the cortex's own cut a grey-pink. Looking down into the gap one sees, from the outside in, the cut edge of the cortex, the white matter's inner face, the lateral ventricle and, in the middle, the third ventricle over the midbrain. Resting the crosshair on one of them names it in the tip (“White matter”, “Lateral ventricle”, “Third ventricle”, …); they are not motor areas and do nothing, like the eyeballs (Space there takes the brain).

- **Where.** Within 10 mm of each half's inner face (`BRAIN_GAP.cutMm` in `ns-brain-gap.mjs`), along the stretch of the gap where the ventricles lie (atlas y −128 to −62, tapering to nothing over 10 mm beyond both ends). In front of it, under the frontal lobes, nothing lies under the gap and the old edges stay; behind it are the strip's leg areas. The motor strip (both precentral gyri) is never cut, so every motor area stays whole and aimable, and so are the parts of the middle. The cut is made in the brain's own frame, so it turns, rolls and is carried with the brain. About 6 % of the cortex's vertices (3 % of the brain's) are inside it.
- **Only the cortex is cut.** The white matter, the ventricles, the internal capsule and the hippocampus are drawn whole, so their smooth faces show. Cutting them as well (a true section) was tried: in this atlas much of the inside of a half is empty (the gyri are separate shells, the white matter has hollows, and there are no thalamus, caudate or putamen meshes), so a section came out as ragged cream patches over dark gaps, and seen from above the cut slab was simply see-through.
- **The outer look is the same elsewhere.** The inner parts take their colours only inside the opening (and 10 mm round it, fading): white matter that shows between two gyri at the side of the brain keeps the flesh. The hypothalamus and the tuber cinereum, on the underside round the chiasm, keep the flesh. Deep parts of the middle seen in the opening (the midbrain, the colliculi) are not shaded as dark grooves there.
- **How, and its cost.** No new mesh and no new draw: the brain surface is one merged geometry drawn as a depth pre-pass and a shell; each vertex now carries its half and kind (`nsGap`), and both passes leave out the cortex inside the cut, so the next surface behind is drawn. Where the cut opens a gyrus, its inside is seen and drawn flat in the cut colour (the cap trick of a section view; the cap lies at the gyrus's far wall, not on the plane). The picker drops a hit on the cut cortex and goes on to what is drawn behind (what is picked is what is drawn).
- **The other way tried**: a see-through film of the cut-away cortex over the opening, clearing toward the midline (one more draw). It kept the gap's old edge but washed the blue and cream to a milky mauve and softened every edge; the plain cut is clearer and cheaper.

Frame table (standing still, looking around, down and up, limb turn), timed runs interleaved with the lead branch while other browsers ran on the machine: lead 59.9 / 59.3 / 59.7 / 59.9 and 60.0 / 59.0 / 58.0 / 51.3, this branch 60.0 / 57.8 / 58.4 / 58.6 and 60.0 / 59.4 / 60.0 / 60.0; at 1600 by 1000 with a screen density of 2 (fill-limited here), lead 60.0 / 50.8 / 58.1 / 52.4, this branch 59.9 / 58.5 / 58.1 / 58.8. No case is slower beyond the spread of the runs. The two passes' extra work is one test per fragment; a pick inverts the brain's matrix once and traces a cut gyrus again only when its nearest hit is inside the cut.

The gap's back end (package LAYOUT eases each half's step off behind the strip, on its own branch): nothing is cut or coloured outside the stretch of the ventricles, so the halves standing closer together behind the strip are untouched; checked with that change merged in a scratch copy (tests, the start picture and the view from outside).

Not done, or not as good as it should be:
- The atlas has no thalamus, caudate, putamen, pallidum or corpus callosum, so the deep grey nuclei the brief named cannot be shown; what shows is the white matter, the ventricles and the middle parts. The hippocampus and most of the internal capsule lie too far out and too deep to be seen from above.
- In the start picture the mirror body stands in front of most of the opening: the white matter and the ventricles show as bands either side of it. With the brain carried near (Space, S), from outside (E), or turned, the opening is in full view.
- The cut walls are straight: seen from above they are edge-on lines; with the brain turned the white matter's inner face fills the opening as one smooth cream surface.
- The arteries and the hand-laid veins are not picked (as before), so the tip can name an inner part behind a vessel. Near a switched-on leg area the tissue's own glow tints the inner parts too. Once, in the carried view, the tip said “Fourth ventricle” over a surface that read mauve, not blue; which of the two it was is not traced.
- The hidden-things pass (section 147) keeps its picture of the brain's surface without the cut; no difference was seen, since the cut stays inside the brain's outline.

## 156. The loading picture and the controls from the start of the load, also on a slow connection (20 November)

The user (19 November): “Currently, I can't see the models being built on the loading page, which they should be there, and the controls switch off halfway through. And the controls should stay visible the entire time while loading.”

**What was wrong.** Section 152 recorded it: on a slow connection the loading picture drew nothing for most of the load. Both the picture and the controls card were started by the launcher (`eye-view-r558.mjs`), whose module runs only once all its static imports are in, about fifty files. Measured at 600 kB/s from the local server: the card came at 17.6 s, the picture's first part at about 29 s, and the game was ready at 30.6 s. The local server also sent no validators, so the picture's worker downloaded Three.js a second time.

**What changed.**
- The page's first small script (`early-load.mjs`) now shows the controls card at once and marks the page as loading. The card stays until the game is ready, as before. The script also starts the loading picture itself, through a dynamic import, so the bar and the packs it has already started are not held up.
- The picture is fed from the packs the moment each one arrives (`onPack` in `ns-pack-loader.mjs`, `notePack` in `ns-assembly.mjs`), before the game has fetched a manifest. Where each mesh goes in the inside-out order is in a table made beforehand from the five manifests and the game's own muscle layers: its kind, its tier, its place in the tier, and for a part of the brain its name, which says which half it is in. `tools/build-assembly-parts.mjs` writes the table to `scene/src/ns-assembly-parts.mjs` (24 kB), and `tests/assembly-parts.test.mjs` checks it against the manifests and `ns-body`. So the picture needs neither the manifests (1.8 MB) nor `ns-body` (600 kB) to begin, and `ns-assembly.mjs` no longer imports `ns-body`. A mesh the table does not know, such as one from a new packet, is still drawn, later, from the manifest the launcher fetches.
- The launcher takes the SAME picture over (`startAssembly({ shared: true })`). It tells the picture the game's first view, hands it the game's own muscle layers and goes on feeding it what it fetches. Each file is drawn once: a mesh the picture has already drawn from its pack is not drawn again when the launcher hands it over. There is one picture, on one canvas, from the start of the load to the game, and no part is lost or doubled. Seen in a load at 1.5 MB/s: 611 meshes drawn from the packs, the same 611 handed over again by the launcher and left alone, one canvas until the fade.
- The packs now come one after another in the order the game builds them (the arm and the brain, the body, the head, the face, the missing muscles) instead of three at once. So the first pack is whole after its own bytes, not after three packs' worth. The next pack is asked for when the one before has less than 0.3 s of bytes left at its rate, so the line does not stand idle between packs (without that lead the last pack came 0.3 s later than with three at once). It is also asked for once the one before has been quiet for 2 s, so a stalled pack does not hold the rest back. At most three are on the line, and the total to download is the same.
- A pack brings all its files at once, and on a slow line the next one can be many seconds away. The picture used to take a wait of 5 s without a file for a stalled download and stop holding its tiers back: in a load at 600 kB/s the left arm's muscles from the first pack were drawn before the spine from the second. The packs' bytes arriving now count as news (`stillComing`, `alive` in `ns-assembly-order.mjs`), and the order holds: the brain from its core, then the spine up into the skull, then the bones out to the hands and feet, then the muscles layer by layer.
- The local server (`serve-local.mjs`) sends ETag and Last-Modified and answers an unchanged file with 304, so a second request for a file costs a round trip, not the file. The page and the picture's worker both import Three.js. GitHub Pages already lets the browser keep files for ten minutes.

Unchanged: the loading bar and its numbers (the bar counts one more script file now: the table), the guard (`ns-load-guard.mjs`), reduced motion (no parts, a still bar), the picture drawn on the page where no worker canvas can be had, and the `?case=` modes, which start neither the picture nor the packs. The launcher is still a `<script>` of the page, so a missing file is caught as before. All of these were seen working in pictures, apart from the `?case=` modes, which were checked with the launcher's boot check.

**Measured.** Page time in seconds, base 4614935 against this change, alternated under the timing lock. In the base, the first part is read from the worker's once-a-second report, so it can be up to 1 s late. The local server does not compress, so about 5.5 MB of scripts travel where GitHub Pages sends about 1.4 MB. The "Pages-like" rows come from a stand-in server for measuring only, not part of the game, that compresses text and lets the browser keep files as Pages does.

| line | controls card | first part drawn | game ready |
| --- | --- | --- | --- |
| local, 600 kB/s | 17.6 → 0.69 | ~29.4 → 12.7 | 30.6 → 28.2 |
| local, 1.5 MB/s | 7.4 → 0.69 | ~13.1 → 5.4 | 14.4 → 13.4–13.6 |
| local, no throttling (15 runs each) | 0.78–0.89 → 0.13–0.15 | ~1.5 → 0.2–0.8 | mean 4.36 → 4.35 |
| Pages-like, 600 kB/s | 6.6 → 0.69 | ~9.8 → 6.4 | 16.8–17.0 → 16.8 |
| Pages-like, 1.5 MB/s | 3.1–3.2 → 0.49–0.59 | ~4.5 → 3.1 | mean 9.0 → 9.0 (one run of 9.6) |

The page's own time spent copying the pack meshes for the picture is 9 ms in all. Frames per second (`s-perf2`): 59.9 / 59.3 / 60.0 / 60.0, against the base's 60.0 / 59.0 / 60.3 / 59.9.

**Tried and not kept.** The launcher's scripts were held back until the picture's worker had Three.js. On the local server at 600 kB/s the first part then came 2.6 s sooner still. But on a line without throttling the game was ready about 0.09 s later, because the launcher's files started 85 ms later. The guard would also have had to learn of a missing launcher file from a failed import.

**Not right yet.**
- On a slow line the first seconds still show only the controls, the bar and the empty room. The first part needs Three.js in the worker and the whole of the first pack (1.1 MB). That takes 6.4 s at 600 kB/s from a host that compresses, and 12.7 s from the local server, where Three.js shares the line with the uncompressed scripts.
- On a first load the picture does not know how long the load will take, so it paces its layers for a 5 s load. On a slow line each layer comes in quickly once its pack is in, in bursts rather than as a steady build. Later loads are paced by the time the last one took.
- The picture's arrangement is unchanged: your own body stands in the lower left, partly behind the bar.
- Not tried: the published site itself, a real slow connection, HTTP/2 (the stand-in server speaks HTTP/1.1), other browsers, the owner's own laptop.

## 157. Four faults of the start layout of section 151 (20 November)

Section 151 listed four faults of the new start picture; the owner has not been asked about them. The owner's standing wishes for the layout were kept: the strip either side of the mirror body's head “like hair”, every strip area whole and aimable at the start, the mirror body toe to toe with you at your own size, your torso in the lower part of the picture, labels sparse and never over a body, every control obvious. The look, the brain's framing and the mirror body's place did not move.

- **Labels over the mirror body (1280 by 720).** Cause: the strip's labels kept clear only of shapes worked out for your left arm as seen from the eye (`armAvoidShapes`). Since the camera stands half a metre behind and above the eye (section 140), those shapes lie far from the arm as drawn; at 1280 by 720 they covered the face areas of the brain's left half, so “Face and neck” could not sit on its areas and went into the hollow of the arch, over the mirror body's arms, where “Belly and back” already sat; the mirror body was no obstacle at all. Now the labels keep clear of both bodies as drawn (`bodyLabelBoxes` in `ns-scene-three.mjs`): every bone of your body, your left arm and the mirror body, projected with the camera as it draws, padded by 2.5 cm of flesh, gathered on a 4 px grid into a few dozen boxes; what the eye view does not draw of your own body (above the collar) is left out. Made again when the camera, a pose or the mirror body changes, at most every fourth frame while that goes on (0.2 to 0.4 ms each time, measured while looking around). The old arm shapes are used only if the bodies' boxes cannot be made. A label now tries its places in half steps (`LABEL_LAYOUT.ringFrac` 0.5), so one that touches the mirror body's head by a few pixels moves a little instead of a whole half width onto its neighbour's place; “Belly and back”, whose areas are two thin bands, moves at most one ring (`LABEL_NEAR`) or is not shown (two rings away it sat on the arm areas). Result: at 1280 by 720 “Face and neck” sits on the face areas, nothing is in the hollow, “Belly and back” is not shown; the leg labels sit just above the leg areas (beside the head there is no room). At 1600 by 900, 1920 by 1080 and 1600 by 1000 at density 2 all eight labels show, each on its own areas (at 1600 by 900 “Belly and back” was not shown before). In an upright window and at 4:3 six labels show, each on its own areas.
- **Faint turn arrows in an upright window (800 by 1200).** Cause: the mirror body's arrows were planned from the brain's placement direction (13 degrees down) while you start at 25.5 degrees down; in an upright window they came out about 170 px off in the real picture, the left and right ones over the face areas, where the rule that fades a tip over a motor colour drew them at a third of their strength. They are now planned in the opening view in an upright window (`openingPortrait` in `updateArrows`). The left and right arrows stand beside the mirror body's thighs at full strength. A landscape window keeps its plan and its own correction of the up arrow (section 146); planning the brain's arrows in the opening view in an upright window was tried and is worse (its up arrow then lies on the mirror body's head, faint), so the brain's plan was left.
- **“Optic nerve” on screen at the start (4:3 and near-square windows).** The start look rests in the gap between the halves, under the mirror body, where the chiasm shows through. On the current build the tip showed at 1280 by 1024 (measured; at 1024 by 768 the crosshair started a few pixels from the nerve). Where the chiasm lands on screen follows the brain's framing, which the layout wishes above fix; moving it out of the crosshair's way for every window shape would break one of them. So now nothing under the crosshair is named until the look first moves a degree from the start look or the view leaves the eye (`QUIET_START` in `ns-app.mjs`): no body part, eyeball or nerve. A motor area still is (the start look rests on none). Checked at 1280 by 1024 and 1024 by 768: no tip at the start; after a look of about a degree the nerve is named as before.
- **A dark notch at the back of the gap, seen from outside (E).** Cause: each half was moved 6 mm whole, so the gap ran open to the back; behind the cerebellum, whose back end is about 22 mm in front of the occipital poles, nothing lies under it, and from behind and above one looked through it into the room. Now each half's step eases off behind the motor strip (`HEMI_GAP.back` in `ns-brain-part.mjs`: the whole 6 mm in front of atlas y −38 mm, none behind y −10, a smooth step between; the precentral gyri end at y −39), so behind the cerebellum the two halves lie as close as in the atlas. The strip, its areas, the leg areas and the gap beside the mirror body's head are exactly as before (tested); behind the strip each half is bent toward the midline by up to 6 mm, a display choice like the gap itself. The loading picture uses the same function.

Checked: 357 tests; `?case=boot` at 1600 by 900, 1280 by 720, 1024 by 768, 1920 by 1080 and 1600 by 1000 at density 2 (at 800 by 1200 it fails as on the lead branch, on its lens rule); the brain-compass, mirror-compass, brain-eyes and startup browser tests, and the two compass tests also in an upright window with touch; frame table 59.9 / 59.6 / 60.0 / 59.9 against 59.8 / 59.1 / 60.1 / 57.9 on the lead branch in the same hour. Pictures looked at before and after at all six window sizes, from outside, and looking up from outside at the brain's back end.

Not right, or not done:
- In an upright window the mirror body's up and down arrows stand 112 px to the right of the mirror body's middle (above the right leg area, and beside your right thigh): the place above its head is taken by the brain's up arrow and the leg areas' tops. They are green, clear and at full strength; before, they stood 92 px to the left.
- At 1280 by 720 the leg labels stand above the leg areas, touching their top edges, not on them; at 16:9 three labels stack on each side near the head (“Left leg”, “Belly and back”, “Left arm”).
- The labels keep clear of bones plus 2.5 cm: a thick muscle (the thigh's, the shoulder's) can reach a little under a label's edge. Looking up from outside, the labels keep off your own head and stand at the brain's outer edge, partly beside it.
- The crosshair still starts beside the chiasm (on it at 1280 by 1024); only its name waits.
- From outside, the atlas's own fissure between the occipital poles (2 to 4 mm) still shows as a thin dark line at the top of the picture.
- The HUD's orientation labels (shown only in some views) still keep clear of the old arm shapes seen from the eye; not changed.

## 158. Organs in the opened chest; the neck's muscles left out of the eye view instead of cut (20 November)

The user (19 November): “Yes, it's nice to have a view within the body and the rib cage. Perhaps put some organs in there for fun, but make sure the occluding muscles, neck muscles are gone, and the transition between is smooth. So you don't just have, part of a muscle ripped off and detached.”

**The organs.** Looking down from the eyes, your body ends at the collar (section 148) and you look through the top opening of the rib cage. It was empty: the packets hold bones and muscles and no organs. Both bodies now have a heart, two lungs, the great vessels and the windpipe inside the rib cage (`ns-organs.mjs`, drawn by `makeOrgans` / `applyOrgans` in `ns-scene-three.mjs`). They are illustrations built in code and placed by proportion, not traced anatomy, and not part of the game's signal: no motor area, no activity, no link, no collision, and the crosshair cannot take them. Where they lie was chosen from the inside of the game's own rib cage, measured every 10 mm of height on its ribs, cartilages, breastbone and thoracic vertebrae; each organ keeps a few millimetres inside those walls (tested on the page's own body: `tests/organs.test.mjs`). In the start posture the whole cage moves with its sixth thoracic vertebra to within 1 to 3 mm, so the organs ride on that segment and move with the trunk as one piece (seen on a side bend from the strip).
- The heart: a rounded cone, base up, back and to the right, apex down, forward and to the left; dark red, the atria a little darker, the grooves between the chambers painted pale (the fat along the coronary vessels). It swells by 3 % with the living brain's beat (the same wave and clock, faster as areas come on) through one value given to its shader each frame; under reduced motion it does not move.
- The lungs: pink-grey, lighter at the top and greyer toward the back and the base, each one smooth body with a dome under the first rib, a base pushed up by the diaphragm and painted fissure lines; where a lung would run into the heart, a great vessel, the windpipe or the spine it is pushed back onto it, so nothing passes through anything.
- The aorta (red) rising from the heart, arching back to the left and running down beside the spine; the pulmonary trunk and its two branches and the superior vena cava (blue, the usual colour for blood low in oxygen); the windpipe, pale and ringed, parting into the two main bronchi. Every free end is rounded; the branches into the neck and the arms are left out.
- No organs of the upper belly: from the eyes and from outside the belly wall covers them entirely.

They are drawn in the bodies' cel look (the same bands and rim as the muscles, no ink strokes on them) and the outline pass gives them the trunk's code, so they get its ink lines and are never drawn as light-blue glass through the trunk (they are the trunk behind itself). About 7 200 triangles in two meshes (the heart alone, for its beat), shared by both bodies; their place is written only when the trunk moves. Frame table (timed, 1600 x 900, three runs while other browsers ran on the machine): 60.0 to 60.1 still, 57.9 to 59.7 looking round, 60.0 to 60.2 up and down, 59.1 to 60.0 with the limb turn; the lead branch in the same hour 60.0, 59.0 to 59.4, 59.0 to 60.2, 51.5 to 58.4.

What you see of them, and what you do not: through the top of the cage, looking down 40 to 85 degrees and to either side, the tops of both lungs either side of the ringed windpipe, the aortic arch in red on the left and the superior vena cava in blue on the right. **The heart is not seen in play**: from the eyes the line of sight through that opening runs down and backward, and the heart lies forward, behind the breastbone and under the arch. The mirror body is closed by its own head, neck and chest muscles, and no organ of it shows. With the muscles left out (a check only) the whole set reads clearly between the ribs.

**The neck's end.** The box that ends your body at the collar in the eye view (`EYE_COLLAR`, section 148) cut every muscle crossing it at one level plane. Among the meshes the eye view draws, measured on the drawn bodies: the upper part of the trapezius (71 % of its vertices inside the box), the two lowest neck vertebrae (92 and 65 %), the left levator scapulae (54 %), semispinalis cervicis (40 %) and the posterior scalenes (26 to 28 %). What the box left of them were torn strips with loose ink lines along the top of each shoulder and round the first thoracic vertebra. Now a mesh with at least a fifth of its vertices inside the box is not drawn at all in the eye view (`EYE_COLLAR.hide`, `collarCuts`): those muscles are gone, not cut, and the shoulders' tops show the muscles beneath. The light beams and the glow rims skip a mesh that is not drawn, and the crosshair already did. The neck's other muscles (the sternocleidomastoids, the other scalenes, longus colli, the muscles of the hyoid) lie near the eye and were never drawn in the eye view. What the box still cuts is the top 2 to 5 % of the trapezius's middle part, the rhomboid minor and the serratus posterior superior, and of the first thoracic vertebra, at the back, where it shows as their natural upper ends. Beside the first thoracic vertebra the upper slips of iliocostalis and longissimus thoracis now show as small claw-like ends: they are not cut (their tops lie under the box), they are their own attachments to the upper ribs, which the neck muscles used to cover. From outside (E) everything is drawn as before. Seen on pictures at looks down of 40, 60, 70 and 85 degrees, straight and 35 and 70 degrees to either side.

Not done: a rounded end per muscle at the box's plane (the vertex shaders of the muscles skinned on the graphics card are already at WebGL's attribute limit, and every reader of the drawn vertices, from the crosshair to the outline pass, would have to follow it); with the hidden meshes left out no torn piece was left to round.

## 159. The left arm jerks and comes part of the way back, like every other part (20 November)

The user (19 November): “They have to activate at least once, and then if you keep clicking, they continue activating and relaxing. And now we're doing it so it's with activation and relaxation, not just activation. So the neck moves and then returns, and then same for all the body parts. They move and then return. But they don't have to return fully, just partially. So we're really thinking about a bit of a jerking movement. They jerk one way and then they partially return back.”

Every body joint has done this since section 141 (`JOINT_LATCH`: driven hard to its end, held there 0.3 s, then half of its swing back, and each click again). The left arm has its own rig, and its strip movements did not: a look or a click latched the movement, the arm eased into it in a few frames and stayed, and a further click changed nothing. Section 129 listed this as not done.

**Now the left arm uses the body's own numbers** (`jerkArm` and `armJerk` in `ns-actions.mjs`). The left arm's movements are blends of a pose drive from 0 (the hand's neutral pose) to 1 (the movement's end). A press of a left-arm area, the first one or any further one, throws that drive to 1 with the body's spring (it gathers speed over a few frames, hits the end and is thrown back off it with the same rebound), holds it there for the body's 0.3 s, then eases it back the body's share, half of the movement, with the body's soft return, where it waits. A click while it is still held at the end kicks it into the end again, as the body's kick does. The opposite movement still lets it go as before: the arm goes straight back to neutral, and that click latches nothing (the stage rule). The Space grip still wins the fingers; when it lets go they ease back to where they were waiting. Under reduced motion nothing jerks: the movement eases to its end and stays, as the body's joints do under reduced motion. Reset clears it. The hold by the view, W/A/S/D, the grip, the limb turn and the look closing the hand are untouched.

**A click on a held left-arm movement now counts as moving it** (`armActionMoves` in `ns-guide.mjs`). It used to count as moving nothing, since the arm stayed where it was. So the tutorial's second step, “Click it: it jerks again, harder”, did not finish on a click on a left-arm area (it did on any other area; seen in the browser on the lead branch: after a look and a click on the left elbow it still showed 2/9), and the long card said “already there”. Now a held movement with its jerk to repeat moves; under reduced motion, where nothing jerks, it still moves nothing, and a straighten of an elbow already straight still moves nothing.

**The elbow bends 90 degrees instead of 30** (`ELBOW_ACTION_DEG`). The left elbow's movement is a bend added to whatever bend the hand's place gives. With 30 its jerk was 15 degrees and ran almost along the line of sight (the hand comes in toward the shoulder, and the shoulder is beside the eye): measured in the start view, the hand moved 2.4 % of the picture, where the right elbow's jerk moves the right hand 31 %. With 90 it moves about 15 %, and the elbow waits 45 degrees more bent than its place gives (30 before). It still stops at the elbow's own limit, so a hand already pulled in near the shoulder bends little further. This is a separate change from the jerk and can be taken back alone.

Measured in the browser, each elbow's angle frame by frame after a look and two clicks (start view, 1600 by 900):
- Right elbow (unchanged): 77 → 145 in about 0.15 s, thrown back to 118–135, in again to 141–145, held, back at 77 about 1 s after the press; every click the same.
- Left elbow before: 38.6 (8.6 plus 30) from the look, then flat through both clicks.
- Left elbow now, with 30: 8.6 → 36.5–38.6, back to 35, in to 38.2, held, back at 23.6 after about 1 s; each click 23.6 → 38.6 → 23.6. With 90: 8.6 → 89–98.6, back to 88, in to 97, held, back at 53.6; each click 53.6 → 98.6 → 53.6.
Seen on pictures taken through the jerk: at 30 the left hand hardly moves; at 90 it visibly comes down and in at the peak and goes back up, and the mirror body's arm bends and opens with it. The wrist (70 degrees) jerks visibly; one finger's jerk (the index: it folds right down at the peak and opens half way) shows when you look closely, since the hand is seen from its back, almost edge on. The four cases of the frame table stay at 59–60 frames a second.

Not done or not right:
- In the start view the left hand sits at the left edge of the strip and the area's tip card can cover it, so the wrist's and the fingers' jerk is partly hidden behind the card when you look at the wrist or finger areas.
- The punch-in of section 142 runs with every press, so at the peak of a jerk the whole picture is also 4 % tighter. Both together read as one jolt; on its own the arm's movement is smaller than it looks.
- The left elbow's jerk at 90 is still about half of the right elbow's on screen: the left elbow's bend is measured from the hand's place, and the hand mostly comes toward the eye. Going to the elbow's end (as the right elbow does) would bring the hand to the shoulder, right under the eye, and was not tried in the game.
- The body's own movements still say “already there” on the long card once they are held (`latchView` still in `ns-actions.mjs` looks at the joint's goal, which is the movement's end), although a click jerks them again and they wait half way back. Only the left arm's was changed here.

## 160. Fixes from a review of the circle roll, the limb keys, the hip range and the tendons (20 November)

A review of the day's changes, and a scripted hunt for faults by playing, found these. Each was shown first (a scenario
or a check on the game's own numbers) and checked again after the fix.

**After a circle has rolled the brain or the mirror body, drags and arrows go the way they show.** The roll was added
after the turn left and right and the tilt, so once the brain was upside down a drag to the right turned its near
surface to the left, and the side arrows turned it the wrong way. A drag or an arrow is now turned back by the roll and
split into the item's own turn and tilt (`rollOrbitRequests` in `ns-app.mjs`). Checked on the brain's own transform at
rolls of 0, 45, 90, 160 and -90 degrees (`tests/circle-roll.test.mjs`: the point nearest the eye moves the way of the
drag), and in the browser: after a roll of 160 degrees a drag of 60 pixels to the right moved the brain's near surface
to the right.

**The mirror body rolls about the line from your eye.** It rolled about a level line through its centre, and the view
looks down on it, so a roll also tipped it toward or away from you: a quarter roll left it lying slanted with its legs
hanging down. It now rolls about the line from the eye to its centre (`mirrorTransform` in `ns-mirror.mjs`); a quarter
roll lays it across the picture.

**What the crosshair is on is found again after a roll.** The area under a still crosshair was kept from before the
roll, so the line at the bottom and a click named the old area. The roll is now part of what the gaze's cache is keyed on. The area a roll brings under the crosshair is recorded silently, as after an orbit step, so rolling the brain switches
nothing on (measured: no pulse during two rolled circles).

**The circle's take-back returns the item to where the drag began.** Before the drag counted as a circle it turned the
item; that turn is taken back, but it took back what had been asked, not what the limits had let through, so a brain at
its tilt limit was left tilted the other way. It now returns to the turn and tilt the drag started from, or, when a
sharp corner in the same press started the circle's count again, to where it was at that corner (a straight drag made
before the corner was meant). A frame that
is refused and done again (the game's recovery) now also puts the circle's state and the roll back first.

**The limb keys.** While W or S was held, the look no longer carried the chosen limb: the keys' line put it back each
frame (measured: the look turned 85 degrees, the arm only 16; now 85). From a place the look had carried out of the
limb's reach, W pulled the limb in along the line to that place and folded it (reach 0.53 to 0.43 m); the first keyed
frame now starts from where the limb's end is, so W and S go along the limb's own line. And once D had swung a limb to
point straight along the body's right, A could not swing it back (there is no one way round from there); it now swings
back out through the front of the body (`limbKeyMove`, `tests/limb-hold.test.mjs`).

**The touch-free hip range when the legs are turned in.** The quick way of section 152 assumes a leg turns evenly with
the hip turn. With the leg turn of the dance away from its rest that is not so (the hips also spread a little as the
toes turn in), and it gave a range in which the feet came within 0.3 degrees of touching. The quick rotation is now also
checked at half the probe's turn and at a turn the other way; where it is more than half a millimetre off the pose
itself, every turn is posed in full (`FEET_CLEARANCE.linearMm`; about 3 ms instead of 1.3). `tests/hip-range.test.mjs`
compares the two at leg turns of -65 to 25 degrees.

**The white finger and toe tendons are found on the muscles' own source positions.** The rule of section 154 measured
on the start posture's baked positions, where the wrist and ankle are not where the rule's thresholds expect. It now
reads each muscle's source positions. A second review found that this first fix reached none of the body's muscles
(only the right hand's, the right forearm's and the neck's keep a skinning record, and the rule ran before the record was
stored), so the body's source meshes are now handed to the scene once the body is installed (`setDigitTendonSources`):
33 muscles of your body, and so of the mirror body, which shares their geometry, now have white tendons along the fingers
and toes, against none before (the left game arm's 13 as before). Seen in close pictures of both bodies' hands.

**Also:** pulling the held mirror body into you with S no longer stops the game at the near-plane check; the held body
passes through you (`MIRROR_PASS_THROUGH`). The loading picture's eyeballs and nerves were drawn once at their final
place before flying in; they are hidden until their flight begins.

**A held movement is no longer "already there".** Section 159 left this open: once a body movement was held, its line
on the long card said it was already there and a press would move nothing, although every further press kicks the
part in again and it comes half way back. With the jerk on, a movement held at its end now counts as one a press moves
(`latchView` in `ns-actions.mjs`); only a joint held further than this movement's end, by a stronger movement, is left
alone by it. Under reduced motion, where a press does not jerk, the old rule stands. The test that checked the old rule
(`tests/move-key.test.mjs`) was asynchronous and never awaited, so it passed whatever the code did; it now runs, on the
reduced-motion activity, with two new checks on the ordinary one.

Not done or not right:
- The circle's take-back still ignores a turn asked by another drag sample in the same frame before the circle counted
  (rare: two samples in one frame).
- A roll is not undone by the arrows; Esc, Reset brain view takes it back.

## 161. From outside: the look stops with the camera, every arrow can be aimed at, the brain's arrows keep off the mirror body (20 November)

Faults found by a bug hunt in the browser on the build of 20 November; none of these changes asks the owner anything new.

**The look stops where the outside camera stops** (`followReach` in `ns-camera.mjs`, used in `ns-app.mjs`). The outside camera follows the look only so far: its pitch stops 5 degrees above level and its turn 130 degrees to either side (`followMaxPitchDeg`, `followYawMinDeg`, `followYawMaxDeg`; with the 14 degrees of `followPitchBiasDeg` that is a look from 66 degrees down to 19 degrees up). The look itself ran on, unseen, to the eye view's own ends (88 degrees up, 170 round), so on the way back the mouse did nothing for up to a few hundred pixels, and E opened the eye view wherever the hidden look had got to: from 80 degrees up, a black picture. From outside the look is now kept inside the range the camera follows. The picture moves at once on the way back, and E opens the eye view facing where the camera faced (from the top stop, 19 degrees up, with the brain at the foot of the picture; from the turn's end, 130 degrees round). E then E with no look between still returns exactly to the eye view's look, also from a look the outside range does not have; while you are outside, the drawn head then stands at the range's end.

**Every arrow can be put under the crosshair from outside** (`outsideCompassAnchors` in `ns-scene-three.mjs`). The outside camera always looks through one point over your body, so an arrow can be put under the crosshair from one camera only: the one on the line from the arrow back through that point. Section 149 checked the arrows in the settled view alone. From the camera that put the brain's up arrow under the crosshair, just under the top stop, the mirror body's up arrow lay on the same line: the two chevrons were drawn on each other and the green one took every press. The check now also looks from each arrow's own camera: there no other arrow's hit area may cover the crosshair, and an arrow the camera cannot bring under the crosshair at all moves. When a brain arrow and a mirror-body arrow lie on each other, the brain's moves; the mirror body's small arrows keep to its edges. At 1600 by 900 the brain's up arrow now stands about 110 px left of the middle of the brain's top side (100 px at 1280 by 720). At 800 by 600 the green up arrow, which the camera could not bring under the crosshair, now stands just above the mirror body's head. Swept over the whole outside look at 1600 by 900, 1280 by 720, 800 by 1200, 800 by 600 and 600 by 900, all eight arrows came under the crosshair, never two at once; a click on the grey up arrow from the top stop turns the brain.

**The brain's arrows keep off the mirror body from outside**, as the eye view's plan already keeps them. In an upright window the brain's bottom arrow lay across the mirror body's chest and took the presses meant for it. It now stands at the brain's lower left (800 by 1200, 600 by 900, and after a wide window is made upright).

**Small windows.** In an upright window the information card now stands above the limb buttons and the “Simulated activity” line, which lay over its last lines (600 by 900 and 800 by 1200), and a card too long for its band fades out at its foot, as the full card does. An arrow's caption is placed by its measured width (in an 800-wide window “… the side on your right” ran 31 px past the edge) and, where no place is free, where it covers least, no longer across its own arrow.

**Words.** The controls page said E shows your body “from behind your right shoulder” and that you must let go of what Space holds first. The camera has stood straight behind your head since section 118, and E lets go by itself; the page now says so.

Checked: the unit tests (a new one: inside the reach every look moves the outside camera, past its ends none does); `?case=boot`; the brain-compass, mirror-compass, brain-eyes and startup browser tests; the outside-compass test started from the game page instead of START.html at 1600 by 900, 1280 by 720, 800 by 1200 and with a resize to 800 by 1200; the hunt's own scenarios again; the frame table at 60.0 / 59.0 / 60.1 / 60.0. Pictures looked at from outside at all five window sizes, at the top stop, and of the cards held and at the full reading level.

Not done or not right:
- From outside, the brain's up arrow now stands off the middle of its side at 16:9, on the same side as its bottom arrow (section 157 put that one to the left too): the brain's compass looks lopsided from outside.
- From the moved arrow's own camera the grey and green chevrons still touch; only the crosshair's spot is kept clear. Keeping the drawn chevrons apart from every arrow's camera pushed the brain's up arrow 170 px off its side, and was dropped.
- E back after turning far round outside leaves you looking 130 degrees round, at your own hand against the dark room.
- The check takes the boom's length as it is when the view settles. The boom grows where something is in the way, so where it does, the camera the check imagines is a little off.
- In a landscape window narrower than about 690 px (640 by 480) the card in the corner still meets the limb buttons, and the card is taller than the window. Not changed.
- `README.md` and `PREVIEW-NOTES.html` still say E shows you from behind your right shoulder.
- The outside check takes 7 to 11 ms, once, each time the outside view settles or the window changes size; about 1.5 ms of it is new, the rest was there.

## 162. The crosshair takes a hidden limb only where its glass is what is drawn there (20 November)

A code review of the hidden-things pass (section 147) found five faults. Each was shown first (a check on the module,
or a scenario in the browser) and checked again after the fix.

**Aiming follows the picture.** Only one hidden thing is drawn at a spot: the nearest one behind what is seen there.
With the legs crossed, the pelvis behind the left shank is drawn there, not the right thigh behind the pelvis; with the
mirror body behind the brain, the part of it nearest behind the brain is drawn, not a forearm hanging behind its trunk.
In both cases the crosshair took the locked-away limb that the picture did not show at that spot. It now takes a
locked-away limb's glass only where that glass is the one drawn (`seeDrawnEntry` in `ns-see.mjs`: the graphics card's
rule on the crosshair's ray; `seeTakesGhost`); elsewhere it keeps what is seen, and Shift still reaches the hidden limb.
A body behind the brain still counts as hardly seen (its glass is the strong figure of section 147), so where one of
its limbs lies behind a part of its own body outside the brain, that limb's strongly filled glass is drawn there and
takes the crosshair, as any locked-away limb's does.

**Also:** a trunk that became mostly hidden on the last frame that moved stayed hollow (an outline only) until something
moved; it is now filled at once (the pass draws its lines again when a fill rises from nothing). The bodies' glass is
cut by the same box at the collar as the outline's picture in the eye view (`ctx.clip` from `ns-outline.mjs`), so the
neck pieces left out of the picture cannot come back as glass outlines. The pass keeps one grid of tiles, for the
window's present shape, instead of one for every shape the window has had (three buffers on the graphics card each).

Not done or not right:
- The neck pieces as glass outlines were not seen in play (since section 158 only the tops of four muscles and of the
  first thoracic vertebra are still cut, at the back); the fault was shown on the module, the fix is the outline's own
  cut.
- The two aiming faults were shown on the module with the review's rays; a sweep of the crosshair over the mirror body
  behind the brain found no spot where one of its limbs lies behind its trunk in that pose.

## 163. No beam from an area out of the picture; the tutorial's first step waits for a real switch-on; the brain's vessels follow the parted halves (20 November)

Three faults found by the review and the browser hunt of updates 49 to 56.

**No beam from a key that is not in the picture.** Since section 131 the left hand's grip area keeps its colour on the hand but sends no beam while Space carries the brain or the mirror body (it stood across the picture, a wall of light once the brain was near). A press of Space on nothing still drew it: with the brain carried behind you and let go, a cyan beam a quarter of the screen wide ran from the bottom corner of the picture to the mirror body's left hand. The helper's first fix took the beam away for every Space grip; the lead kept the beam (with the brain in its place the same press draws eight beams from the hand area into your left hand and eight into the mirror body's, which is what the press is meant to show) and instead draws no beam whose key on the strip is behind the eye or more than 15 % of the picture's half size outside its edge (`LIGHT_BEAM.keyInView`, `beamKeySeen` in `ns-links.mjs`, used by `emitAreaBeams` in `ns-scene-three.mjs`). A beam is then always seen to start at its area.

**The tutorial's first step waits for a look that switches an area on** (`lookStrip` in `ns-guide.mjs`). “Look at a colour on the brain: a part moves” was done by the crosshair merely being on an area, so carrying the brain under the crosshair with Space finished it, although looks are silent while Space holds and nothing moved (the next line then said “Click it: it jerks again”). Now the step is done by the look's own switch-on of an area that moves something (an `activate` event from the look, not a click; the left shoulder area, which moves nothing of its own, does not count). The app no longer sends the bare `look` event.

**The brain's vessels follow the parted halves** (`partedOnBrain` and `partedBridging` in `ns-brain-part.mjs`, used by `setBrainVessels` in `ns-scene-three.mjs`). The vessels are still switched off (`PLAIN_GAME.vessels`); this only makes them right if they are switched on again. Since section 151 the halves are drawn apart, but the arteries stayed where the atlas has them (measured: 36 % of the middle cerebral branches lay sealed inside their moved half, 88 % of the anterior cerebral ones outside the brain, in the gap) and the veins were draped on an envelope that sank 55 to 70 mm into the gap at the midline. Now both are laid on the atlas brain and moved with it: each point of an artery by the brain under it (its own half, or the parts of the middle that stay, by their nearness, smoothed over the whole tree so that vessels that meet still meet: gaps of at most 0.3 mm, against 6 mm when each artery mesh moves by its side alone); each vein by its side, its last 2 mm bridging the gap to the superior sagittal sinus, which stays over the middle of the gap at the height of the halves' top edges. The middle cerebral branches lie in their sulci again (4 % sealed inside, as on the atlas brain), and are seen on the cortex in the pictures, where before they were hidden inside the halves. Building the vessels takes about 0.25 s longer, once.

Not done or not right:
- Seen from above, the sagittal sinus still runs down the middle of the gap, as it did before (deeper). With the vessels on it would hide part of what section 155 shows through the gap. Splitting it into two halves along the gap's edges would keep the gap clear.
- The loading picture parts each artery by its own side (it gets one part at a time and has no brain to measure against), so the arteries under the brain fly in up to 6 mm from where the game then draws them.
- A look that switches on a left-arm area finishes the first step at the switch-on, before the arm has moved (it moves once the look has rested 0.07 s).

## 164. Longer limbs, a flatter chest, a belly that comes forward; the two bodies level (20 November)

The user (19 November): “Let's make the limbs longer. And make the two bodies more level, your body and the mirror body.” And: “for you keep making a mistake with the chest and front of the torso being the abs and stomach and so forth. The chest should not be significantly in front. In fact, we want essentially the bottom of the torso to come out more and be more obvious and more visible. Not for the chest to take the whole torso as it is now. So a smaller and much flatter chest essentially, and a more observable bottom torso.” From the notes of 17 and 18 November: “limbs that do not look small in the start picture”.

**Why the limbs looked short and the chest big.** Measured on the body as the page prepares it: the source model has ordinary proportions (thigh 0.246 of its 1710 mm height, shin 0.238, forearm 0.148, against the usual 0.245, 0.246 and 0.146); only the upper arm is short (0.158 against 0.186). The start picture looks at the body from behind and above your own head, down the trunk along its own axis (about 5 degrees off it) and along the shins: at 1600 by 900 a shin is drawn at 21 px for every 100 mm of its length, the thigh at 46, the arms at 55, and the hip and the shoulder are only 51 px apart up the picture. So whatever stands out at the top of the trunk hides what lies beyond it: in an offline count of the start picture the chest and the shoulders took 40 % of the body's pixels, the arms 30, the legs 24 and the belly wall under 1 %.

**Longer limbs** (`ns-body-shape.mjs`, `BODY_SHAPE.limbs`). Upper arm 1.22 times as long (about 0.19 of the height), forearm and shin 1.15, thigh 1.1, hands and feet 1.08. It is a change to the body itself, made once on the rest meshes after the trained build and before the rig (`shapeBody` at the end of `bulkBody`, and in `bulkArmAssets` for the left game arm), so the rig's joints are found on the longer bones and everything built from them follows: skinning, the limb solve and the limb keys (a leg now reaches 0.92 m, was 0.82; an arm 0.62 to 0.67, was 0.53 to 0.57), the touch-free hip range, the contact balls, the balls a held hand is kept out of (they follow the trunk rule too: a hand pulled to the chest rests on it), picking, the mirror body, the left arm's own rig and the loading picture (which draws its bones and muscles with the same rules; a review found it had never received the limbs' rule, fixed). Each long segment gains its length along its shaft only; the joint at each end is carried whole, so no joint changes shape. A muscle that runs from the trunk onto a limb and ends there (latissimus dorsi, the chest muscle, the rotator cuff, teres major, the buttock muscles) is moved only as far as it lies on the limb's bones rather than on its own trunk bones, so its part on the trunk stays where it is; one that also crosses the elbow or the knee (the biceps, the triceps' long head, the hamstrings, rectus femoris) moves whole, since its origin lies beside the root joint where the lengthening is nil. (A review found the first rule tearing the biceps' short head and the triceps' long head, whose inner faces hang beside the ribs and the shoulder blade near the elbow; fixed.) The manifest entries' centroids and boxes are moved too (the rig takes segment centres from them), by a rule that gives the page and the tool that writes `packs/BODY-RIG.json` the same numbers; the page still checks its rig against that file and takes it. The finger and toe tendons' places move with the limbs (`DIGIT_TENDONS_DRAWN`).

**A flatter chest and a belly that comes forward** (`BODY_SHAPE.trunk`). Everything in front of a line just in front of the spine is moved toward it at the chest (by 0.4 of how far in front it lies; the breastbone comes back by up to 47 mm, the chest muscle, the ribs' fronts and the organs with it) and away from it at the belly (by 0.2), faded out toward the collar, the pubis and the sides. It is the same smooth rule for bones, muscles and the organs, and it never changes which of two points is further forward, so nothing separates from what it lies on and the organs stay inside the ribs (the heart is drawn about 0.3 thinner front to back). In the start picture's count the belly wall now takes 3.6 % of the body's pixels instead of 0.8, the chest and shoulders 35 % instead of 40; the belly shows as a band between your thighs and your chest.

**The arms' start.** With the longer arms the start posture's hands rose into the motor strip (your fingertips over the face areas, the mirror body's hands over the arm and leg areas, whose labels then had no place). The arms now start 33 degrees forward of the trunk and 5 out (37 and 8 before), the left arm's start place turned the same way and moved out by the arm's gain so its elbow is as softly bent as before.

**The two bodies are level.** The mirror body is the literal reflection of your posed body in an upright plane (section 136): every part of it is at exactly the height of the same part of yours (hips, ankles, shoulders and eyes measured in the room), neither is tilted, and its toes are 10 cm from yours (the plane moved out with your longer legs, so its toes stay there). What reads as uneven is the view: you see your own body end on, from its head, and the mirror body from its feet almost face on, so it reads as a figure standing on your toes. Nothing was changed for this; tilting or lowering the mirror body would end the literal reflection the user asked for (“toe to toe … and they're level”), and a lower camera would change the start picture.

These are display choices, illustrations of a body drawn for the game, not measurements of real bodies. Checked: the start picture at 1600 by 900 and 1280 by 720, the view from outside, each limb chosen with keys 1 to 4 and moved with W, A, S and D, the hands and feet close up, the loading picture; `?case=boot`, the four browser tests, the unit tests (new: `tests/body-shape.test.mjs`) and the frame table (60.1, 59.4, 60.0, 60.0 against the lead's 60.0, 59.4, 59.8, 59.7). Shaping costs about 85 ms of the load in the page.

Not done or not right:
- In the start picture the limbs are drawn only a little longer: the thigh 207 px instead of 193 at 1600 by 900, the shin 92 instead of 87, the upper arm 152 instead of 148, the forearm 134 instead of 136 (the longer arms lie further off and a little lower, along the line of sight). The limbs' new length shows from outside, on the mirror body, and when a limb is moved (each reaches about a sixth further).
- The belly is still only a band in the start picture: the camera looks down the trunk's axis, and a larger share of belly needs another view or posture, not a body change.
- The heart is flattened with the chest (its source numbers in `ns-organs.mjs` are unchanged).
- The loading picture weights a muscle from the trunk by its distance from the limb's axes (it has no bones to ask), so the left teres major moves 11 mm there and not in the game; the picture still shows the atlas's own build, without the trained build.
- The body's vessels stay switched off; switched on they now follow the longer limbs (bound to the meshes before the shape).
- Tests changed with the body (each says why in place): a muscle edge at the knee and the elbow, the anconeus's count of fixed vertices, the external oblique's shave (now 25 mm, was 17), the organs checked in the source body's numbers, the bulk test without the shape.

**After the review of this section.** With the longer forearm, pulling the right arm in from the start pose (4, S) lays
the forearm along the right thigh, and the limbs' push (`LIMB_PUSH`) moves the leg aside by a few degrees, as the owner
asked limbs to do (Message 174; a pushed limb stays until you move it back). The push applied the leg's joints the way
the chosen limb's are applied, which also lit the leg's motor area and put "Right hip" on the card although only the arm
was moved. A pushed limb now moves without lighting its area or taking the card (`applyLimbJoints` with light false);
the card shows the arm's own joint ("Right elbow"). Two small faults the review's mesh sweep found remain: two triangles
of the latissimus dorsi beside each armpit are folded (22 before the fixes above), and the source mesh's coarse shape
there is seen only in close views.

## 165. Labels, tips and cards no longer cover each other, at any window size or reading level (20 November)

Faults found by the second browser hunt of 20 November (H2-3 to H2-8), and the rest of what a check of eleven window sizes (1600 by 900 down to 390 by 844, wide and upright) at each reading level, with the tutorial running and finished, found of the same kind. A scripted check lists every pair of overlays that overlap; on the lead build it found 20 kinds of overlap (or of running off the window) between the cards, the labels, the chip, the prompt, the limits line and the limb buttons, and after these changes none.

**The brain's labels keep clear of the tutorial's prompt and of the tip beside the crosshair** (`readHudRects` in `ns-scene-three.mjs`). At 800 by 600 the prompt card lay on “Left leg” and “Left arm”; on the trunk, hip and right-arm areas the tip lay on “Right arm”. Both are now obstacles for the labels (not for the arrows, which keep their places while the tip comes and goes). The tip's box stays an obstacle 0.4 s after the tip goes (`TIP_ZONE`), so the labels near it do not come and go with every gap between two areas: over a slow sweep across the strip they show and hide about as often as before. The labels also keep off the limits line as drawn (two lines in a narrow window). A label that must show (the arm labels) and has no clear place now lies on the picture rather than on a card's words, and where only words are left it is not shown (`LABEL_WORDS_WEIGHT`, the `words` rule in `declutterLabels`); under the tip it stays faded, as before.

**The “Try this” chip stays where it is placed.** At the full reading level the bottom-left cards were lifted 20 px by a transform, which made the status card the frame of the chip inside it: the chip landed on the information card, over your body or under the window's edge. The lift is now part of the HUD's own placement (`cornerStackFit`), and nothing that holds the chip has a transform.

**The left forearm turn's tip names its movement** (`tipActionId` in `ns-app.mjs`): “Turn left palm down” or “Turn left palm up”, as every other area's tip does. Its two movements are not game-arm actions, so the look carried no movement id; the tip now takes the one the activity chose for where the look rests.

**Upright windows.** The short card is as tall as its words and stands on the limb buttons (at 390 by 844 its muscle lines were cut off at its foot). At the full level the colour key runs the width of the band and docks at its top; the information card starts under the key's measured height (`portraitLegendDock`). The key is lifted over the limb buttons only as far as a card of at least 100 px needs (none at 700 by 900, 19 px at 600 by 900, 90 px at 390 by 844, where the card keeps 88 px). Before, the key lay on the card in body views and, in brain views, floated over the brain, its labels and its arrows. The status card at the top is no longer lifted onto the limits line.

**Small wide windows.** The status card and the colour key stand on the “Simulated activity” line, the key directly above the card, and each has a greatest height (the card 55 % of the room, the key the rest); a card cut there fades at its foot. At 1024 by 600, 800 by 600 and 640 by 480 the key lay on the limits line and on the status card. Below 680 px wide (640 by 480) the limb buttons take two lines, so they fit between the two corner cards; the information card lay on “4 Right arm”. Below 960 px wide the short card's key hint (“R more”) has its own line at the card's top; on the narrow card it stood on the title.

Checked: the unit tests (new: `tests/hud-layout.test.mjs`); `?case=boot`; the brain-compass, mirror-compass, brain-eyes and startup browser tests; the hunt's own scenarios again; the overlap check at 1600 by 900, 1280 by 720, 1280 by 600, 1024 by 600, 800 by 600, 640 by 480, 700 by 900, 800 by 1200, 600 by 900, 420 by 820 and 390 by 844, each at the three reading levels with the tutorial running and finished, looking at the start, at a motor area, down, left, right and up; an arrow-key walk over the strip (the tip covers no label at 1600 by 900, 1280 by 720 and 1024 by 600; on the lead 0, 12 and 4 times in 48 areas); the frame table.

Not done or not right:
- The compass arrows are not part of this layout. During the tutorial the prompt card covers the mirror body's top arrow at 800 by 600 and the top edge of the brain's left arrow at 1024 by 600, 800 by 600 and 640 by 480. At the start look at 1024 by 600 and 1280 by 600 the “Right leg” label lies on the mirror body's top arrow: section 157 keeps the leg labels before an arrow. At the full level in windows 390 and 420 px wide the lifted colour key covers the mirror body's three lower arrows. At 600 and 700 px wide the brain's top arrow touches the foot of the status card, whose top no longer sits on the limits line (in upright windows the brain's arrows are drawn about 12 degrees above the view they were planned in). Arrows under a card after the look has moved are the picture moving under the card.
- In small windows the capped cards lose their last lines. At 640 by 480 the status card shows the guide line and part of “Looking at”, and the colour key shows its first rows. At 1024 by 600 and 800 by 600 the key's credit line is cut; the credits stay behind “notes and credits”.
- At the full level in an upright window the information card is small (88 to 100 px tall at 390 to 700 px wide). With More detail open it scrolls; the brain-glass card at the start loses its last line.
- At 390 and 420 px wide at the full level, the orientation word “Left half” touches the mirror body's top arrow, as it did before.

## 166. The camera steps aside from a raised arm; the limb keys never throw a hand; a slow circle rolls; a straight turn before a circle stays (20 November)

Four faults found by the second half of the browser hunt of 20 November. Each was reproduced on this build first and
checked again after the fix with the hunt's own scenario.

**The eye view's camera no longer ends up inside your own raised arm.** With the right arm chosen, a look up carries
the hand up beside and behind the head (the line of sight from the camera, which stands half a metre behind and above
the eye, passes over the arm's reach, and the arm points up at it), and a turn of the look to the other side then swung
the camera round the head into that arm: the picture went black, then filled with the arm's muscles cut open by the
near plane, the bones at point-blank range (the same with the left arm and a turn to the right). The camera is now kept
clear of your own four limbs, each taken as two rods (shoulder to elbow, elbow to a hand's length past the wrist; hip to
knee, knee to ankle): where it would come within 7 cm of a rod it is moved straight away from the rod, but only across
the line of sight (`EYE_CLEAR`, `eyeClearOfRods` in `ns-camera.mjs`; `clearEyeCamera` in `ns-app.mjs`). It is never
moved along the line of sight, so nothing in the picture grows or shrinks and a look up or down does not change its
distance (Messages 187 and 189); the move starts from nothing, and a camera place that passes an arm is taken round it,
eased (it follows within about a tenth of a second). In the hunt's scenario the camera stays 6 cm or more from the forearm's line
at every frame of a slow turn, with no step larger than 8 mm a frame (the turn itself moves it 4 to 5 mm a frame); the
hand is seen whole at the edge of the picture. The chosen limb's hold works from the camera before this move, otherwise
a hand kept in its place in the picture would follow the camera aside. In ordinary looks (20 looks with each limb
chosen, down, level and a little up, left and right) the camera is never moved.

**The limb keys never throw a hand or a foot.** After A had swung the right arm across in front of the chest, one short
tap of S moved the hand 21 cm, mostly sideways, at about 1.6 m/s. The cause was not the keys' line: from that pose the
joints cannot bring the hand in along it. The arm may cross the chest only as far as it is raised (section 139), and the
upper arm's own turn is not one of the joints the keys move, so bending the elbow swings the hand sideways and the
shoulder may not swing it back; a search over every allowed raise, crossing and bend found that staying put is the
nearest the hand can come to any place 2 to 20 cm in along the line. The solve's answer was taken whatever it did. Now,
on a frame on which the keys alone move a leg or the right arm (the look not carrying it), the end goes at most 1.25
times as far as the keys go that frame (the joints' change is cut back), and a move more than 60 degrees off the keys'
own way (in or out along the limb's line for W and S, round the shoulder or hip for A and D) is not taken: the limb waits,
as it does at the body and at a fully bent joint (`keyMost`, `keyOffDeg` in `LIMB_KEYS.view`; `limbKeyFollow` in
`ns-app.mjs`). From the start pose every key on both legs and the right arm goes as far as before (S folds the right arm
44 cm in, as before); across the chest S now leaves the hand where it is.

**A slow circle rolls the brain or the mirror body too.** A press-and-drag circle drawn in about two seconds or more
turned the thing left and right like a straight drag and never rolled it. The drag arrives once a frame in whole
pixels, so the short samples of a slow circle pointed every which way and the circle never looked steady. The drag's
direction is now taken from where the pointer was 24 pixels of travel ago to where it is, and its turning is counted in
pieces of 16 pixels of path (`CIRCLE_ROLL` `chordPx`, `chunkPx`; `circleRollStep`). Checked on the pure rule with
circles of 30 to 400 pixels' radius drawn in 20 to 800 frames a turn (also with a trembling hand): every one counts and
rolls the same amount; in the browser the hunt's slow circle now rolls the brain 108 degrees and leaves its turn and tilt
at 0.

**A turn made by a straight drag stays when the same press goes on into a circle.** When a circle counted, everything
since the press began (or since a sharp corner) was taken back, so a deliberate straight turn before a pause or a smooth
start snapped back by up to 45 degrees. The circle is now the latest stretch of the drag that turned 300 degrees the same
way, widened back over the pieces just before it that still turned its way; only what that stretch turned is taken back
(the game keeps the turn and tilt at the start of every piece; `circleMarks`). In the browser a 45-degree straight turn
stays at 45 degrees after a pause and a circle, after a smooth start and after a sharp corner.

Not done or not right:
- In a pose where the keys' way cannot be followed (the right arm across the chest), S now does nothing. The hand could
  only come in along its line if the upper arm turned about its own length, which belongs to the underside / overside
  turn and is left alone.
- Where an arm lies straight across the line of sight and the camera's place passes right through it, the camera cannot
  be taken round it across the line of sight: it changes sides in one quick slide (about 0.15 s), for a few frames close
  to the arm. Not seen in the hunt's scenario.
- A sharp corner in a drag now counts as turning (the direction is measured over 24 pixels), so a circle that follows a
  corner in its own sense counts sooner, and a drawn triangle can count as a circle (a square already did). Going back on
  yourself still starts the count again.
- The direction measured over 24 pixels trails the pointer a little: a small circle (30 pixels across) counts after
  about 350 degrees of the pointer's turn instead of 300. A circle that starts out of a smooth curve may leave up to
  about 16 pixels of its own first turn not taken back.

## 167. The Esc page says what the look and the limb keys do now; four browser tests follow the current rule (20 November)

Four of the other maintainer's browser tests had failed since Body update 49 and were not run. Three
(`browser-keyboard-aim`, `browser-limb-controls`, `browser-limb-touch`) waited for the view to turn to every newly
chosen limb, the rule the user withdrew on 19 November: “Perhaps the problem with the zoom in, zoom out fixes we look
up and down is the 3/4 height rule. Disregard that rule” (section 144). At the start look all four wrists and ankles
are inside the picture's band, so choosing a limb there turns nothing, and the tests waited forever. The game was right.
The tests now check the current rule: after a choice the limb's wrist or ankle is inside the band (`LIMB_KEYS.view`
`band` and `bandUp`), with no turn when it was inside already. To keep the turn itself tested, `keyboard-aim` and
`limb-controls` first look up until the end is out of the band; the view then turns down until it is back inside, also
under reduced motion, the pointer still takes the look back during a turn, and Reset body during a turn puts
everything back. `limb-controls` also no longer expects the view to move when the left arm's keys move the hand a few
centimetres after a reset. It did under the three-quarter-height rule; the hand now stays inside the band.

The fourth, `browser-player-focus`, expected the Esc page to say “In the eye view, 1 to 4 turn your view to the limb”.
Update 50 rightly took the turn out of that sentence, but “In the eye view” went with it, and the page then said the
chosen limb goes with your view in every view. From behind (E) the look moves no limb. The words are back in the Move
group's note, the full instructions and the Look row of the controls. The full instructions and the mouse row also
still said a look past the head's reach turns the chest and bends the trunk. A look has not done that since
`LOOK_BENDS_TRUNK` was switched off: the eyes turn further. Those words are corrected and shorter. The test checks
the new words.

Not done: the rest of the full instructions was not checked word by word against the game. One line seen in passing
still calls the beam from a switched-on area a “soft line”. `README.md` (its opening paragraph) and
`PREVIEW-NOTES.html` still say that the chest turns and the trunk bends with a look.

## 168. The raw look on everything, each muscle group in its own tone of one rose red, touching muscles apart (20 November)

The owner, Message 195: "The new look aesthetic you've provided in the recent most images is good. Apply it. But you
need more clear contrast and differentiation between muscle groups." Message 196: "New look for everything not just
body." (and the question "Will raw render look improve performance?"). Then Message 199: "Let's make the brain black
areas where there's no mapped activity, just transparent." Message 202: "And each muscle group, bundle, spindle, fiber,
whatever you want to call it, activation group, should have its own sort of shading system, such that muscles next to
each other can be obviously told apart, and you don't mix them up as one amorphous group." Three variants were built
and compared by a judge panel; this one (tones by group) was kept, with the panel's corrections below.

"The recent most images" were close-ups drawn offline by a measuring tool, not by the game: one light from up and to
the side in front of the viewer, every surface shaded 0.25 + 0.75 x |N.L| (matte, both sides alike), back faces at 0.6
of that, rose-red muscle (RGB 196, 92, 88), ivory bone (232, 224, 205), a near-black room (18, 18, 22), and nothing drawn
on top: no outline, no ink, no tone bands, no hatching, no rim light.

**The game now draws in that light.** The bodies (your own, the mirror body, the left game arm, the head in the view
from outside), the brain and its motor strip, the parts seen through the gap between the halves, the organs, the
eyeballs and optic nerves, the 3D arrows and the loading picture's models take the same one light (`RAW_LOOK`,
`patchRawShaders` in `ns-raw-look.mjs`): the scene's own lights are not computed for them at all, their colour is
multiplied by the raw shade and nothing is glossy. The light turns with the view, as in the pictures, so every look is
lit the same way. The meshes keep their smooth normals: the faceting of the pictures came from the tool's one normal per
triangle, and on the game's meshes it reads as the "rough or patchy" surface of Message 184 (both were drawn and
compared; `RAW_LOOK.flat` gives the faceted one). The bones are the pictures' ivory, the room their near-black (a
little under it, so the faint pool of light on the floor lands on it). The brain keeps a fleshy pink of its own
(Message 153), lighter and pinker than the muscles; the gloss and slime of Message 163 give way to this later note, and
its pale rim now only shows while you hold it (the held cue). The strip's areas keep their colours and are drawn in the
same light, without ink lines, hatching or dark sulcal floors inside them; a switched-on area is pure white with its
glow (Message 203). The arrows keep their colours, without highlight or rim. (Their ink was meant to be off; the
shader still drew it, a review fault: since Message 207 it is drawn on purpose, section 176.)

**The comic look is a switch away.** `RAW_LOOK.on` false brings the early comic look of 19 November back everywhere
(`BODY_STYLE` follows it); none of its code was removed.

**Each muscle group is one step of one rose red.** The groups a student learns (shoulder, chest, upper arm's flexors and
extensors, forearm's flexors and extensors, hand, neck, face, abdominal wall, back, hip and buttock, the thigh's front,
inner side and back, the shin's front and outer side, the calf, the foot) each draw one tone (`MUSCLE_GROUPS`,
`MUSCLE_GROUP_TONES`, `muscleGroupOf` in `ns-colors.mjs`): the pictures' rose (OKLCH 0.60, 0.134, hue 24) at eight steps
of lightness from 0.41 to 0.76, the hue held at 22 to 24 degrees and the chroma at 0.115 to 0.135 ('rose', the
reference itself, is the thigh's front and the shoulder). The first version turned the hue as well (coral, pink, wine,
maroon); the judges found the body a candy colour code (hue spread 12 degrees, half of the pixels leaning to magenta)
and a used muscle turning brown, so the hue is now one: on the held mirror body's torso the muscle pixels measure hue
21.9 on average with a spread of 5 degrees and none leaning to magenta (the comic look: 27 and 11). Groups that lie side
by side are 0.15 or more apart in lightness: the upper arm's flexors pale against its dark extensors, the shoulder in
the reference rose between them; the forearm's flexors darkest against its rose extensors; the chest darkest against
the shoulder and the pale abdominal wall; the thigh's front rose against its pale inner side and darkest back, the hip a
step down; the shin's front pale, its outer side darkest, the calf deep. The upper arm is not the tone of the thigh it
lies beside in the start picture; the back is two steps lighter than the upper arm's extensors. Every one of the 292
muscles of the body and the left arm's muscles has its group by its name.

**Touching muscles are told apart.** On top of its group's tone each muscle takes one of three lightness steps (-0.08,
0, +0.08, with a 4-degree turn of hue: `MUSCLE_STEP`, `assignMuscleSteps`), given out like the colours of a map from the
muscles that touch in the drawn body (`assignBodyMuscleTones`, once at load: shared cells of the rest meshes, weighted by
how much of both is seen): a muscle takes the step furthest from its touching neighbours of the same group (the
quadriceps' heads, the forearm's flexors, the pectoral's parts), and a muscle at a group's border steps away from the
group beside it, so the steps never bring two groups together. Groups still read as families; the muscles inside them
read as muscles. No line is drawn between them. A display rule for teaching; nothing is measured. (A review of Body
update 59: the optimiser compared a model lightness, not the one drawn; since section 176 it compares the drawn one.)

**A used muscle keeps its group.** A muscle that has been switched on (section 126's mark) now only darkens: its OKLab
lightness x 0.86, hue and chroma kept (`VISITED_RAW`, `visitedLightnessInto`). The faint, wide part of the tendon white
(a sheet's thin border, which laid a grey haze over the pectoral) is cut (`RAW_TENDON_CUT`); the tendon ends on bone and
the white finger and toe tendons stay.

**Lines.** (Message 207 put clear outlines on everything: section 176.) The outline pass drew no line on the bodies and no depth shading over them (`RAW_OUTLINE`, `setInk` in
`ns-outline.mjs`; the pictures with and without the strong line between limbs, Message 138, were compared: the tones
part the limbs). The motor strip keeps a thin dark contour (1.4 CSS px), so its pale bands do not melt into the pink
brain. The outline's ID picture is still drawn when something moves, because the light-blue glass that shows what is
hidden (`ns-see.mjs`) reads it. The activation light, the beams, the control glows, the limb flash and every card are
signals drawn over the scene and are unchanged. (A review of Body update 59: the HDR boost of a muscle's power-up
flash lived only in the comic patches and was lost here; section 176 puts it back.)

**No black bands on the strip.** (Message 206 made them a black abyss again: section 176.) The strip's inter-effector areas (SCAN), where no movement is mapped, were drawn near
black. They are pieces of the brain's own surface (the strip's meshes are not in the brain's shell, so leaving them out
would open a hole into the dark), so they are now drawn as the brain is: the cortex's crown colour, opaque, in the same
light, with no key bevel, press frame or dark gap of their own, and the strip's contour leaves them out
(`SCAN_AS_BRAIN`, `isScanArea` in `ns-scene-three.mjs`). Looking there still names them ("Move nothing").

**Performance.** At 1600 by 900 the frame table is the same as the comic look's: every case at 59 to 60 frames a second,
the time the script spends drawing the same within the noise between runs. On a drawing buffer too large for the test
machine's graphics card (5120 by 2880, picture quality fixed at High), where the card's work decides the frame rate, the
look itself is cheaper: with no line at all it ran still 45, looking round 40.5, up and down 46, the limb turn 43.6
frames a second against 42.5, 32.4, 36.4 and 33.6 for the comic look on the same build. The strip's contour, which the
judges asked back, runs the outline pass's line passes again whenever the view moves and costs about 15 % there
(looking round 34, up and down 40, the limb turn 39), so the shipped look is about level with the comic look on a
slow or high-density screen and the same on a fast one. `RAW_OUTLINE.strip` 0 takes the contour and its cost away.

Not right, or not done:
- The loading picture knows no muscle's name, so its bodies are drawn in the one rose red of the pictures with a step
  darker for each deeper storey, not in the game's group tones or steps.
- The map colouring leaves some touching pairs on the same step where three or four muscles all touch (about 90 of the
  contacts, nearly all where a deep muscle lies under an outer one, but also the rectus femoris against the sartorius
  near the hip); and the darkest steps go nearly black on the shaded side (since section 187 a shade floor keeps them
  dark red).
- A muscle held in a posture glows faintly in its area's colour (the activity, not the used mark): on the darkest
  tones an orange glow reads tan, as it does on the comic look's salmon. (The control mark's yellow did the same to a whole gripping forearm: it
  glows in the muscle's own hue since section 187.)
- The inner parts seen through the brain's gap keep their own darkening toward their outline (section 155).

## 169. Five small faults from a review of update 58 (20 November)

A review of the packages of sections 165 to 167 and the lead's last fixes found five faults; each was shown on the code
(and the label one in a test) and is fixed:
- While the view changed to or from outside (E), the camera's step aside from your raised arm (section 166) faded out on
  its own clock before the change of view had moved the camera, and on the way back started again from nothing, so for a
  few frames the camera passed through the arm. The step is now held while the view changes and faded by the change of
  view alone.
- A label that must be shown was hidden whenever its best-scoring place touched a card's words by a sliver, although a
  place on the picture alone had been found. The best place clear of words is now taken first (`tests/hud-layout`).
- The labels' 0.4 s hold after the crosshair's tip goes was counted from the last time the tip was seen, which a resting
  look could leave seconds back; it is now counted from when the tip is first found gone.
- The short words of the Esc page still called the beam "a soft line ... for a moment" and the honesty line "the short
  line"; both now say a cone of light. The short limb words now say "in the eye view" too.
- The preview notes said both that the eyes stay fixed in the head and that they turn further; the first is gone.

## 170. No punch-in (20 November)

The user: "Let's get rid of all zoom and punch-in effects, as they're really confusing."

The movement lens of section 142 (a press tightened the picture by 4 % for 0.3 s and let it out again, `PUNCH_IN` in
`ns-app.mjs`, drawn through `pulseFovScale` in `ns-scene-three.mjs`) is switched off (`PUNCH_IN.on` false; the code stays
for the switch). The lens is now the same at every press, in both views, with or without reduced motion. The other
maintainer's browser test of the punch (`tests/browser-punch-in.mjs`) is restated with a dated note: the lens stays at
rest through every press and through a repeated movement (it checked 0.958 to 0.975 at the peak before); everything
else it checks is unchanged.

The other camera effects were already off: the look's dolly (`EYE_DOLLY.downShare` 1, section 141), the mirror body's
magnification from outside (`MIRROR_OUTSIDE.magnifyBy` 1). What remains that can read as a zoom: below the start look the
eye view's camera, which stands half a metre behind and above the eye, swings round the eye as you look further down,
so the mirror body is drawn up to about 23 % larger at a look straight down (section 144 left it; it is the camera's
place, not a lens). Taking that away needs the camera at the eye itself or fixed in place; both were tried before and
both had faults (sections 139 and 140); the user is asked.

Also: the pack loader's timing test (`tests/pack.test.mjs`) took the next pack's start within a 150 ms window, which
the timers under the full parallel test run sometimes missed (302 ms against 290); its stalled-pack case now runs with
the job's times three times as long.

## 171. A neck without a scarf; neck movements you can see from the eyes (20 November)

The user: "Let's ensure that the human neck looks natural. Right now it looks like there's a scarf around the neck. And
let's ensure, certainly in first person view and all other views, neck movement is exaggerated, so you can see it's
moving up and down, left and right, extension, flexion, etc." Still standing: "the camera view getting locked to a
downward angle, especially when the neck is activated from the brain ... so the camera view is always flexible" (185)
and no zoom or punch-in (197).

**The scarf was the platysma.** It is the thin sheet in the skin of the neck that runs from the lower jaw over the collar
bones onto the upper chest. In the source model it is one smooth sheet. The start posture bends the neck forward 40 of
its 50 degrees, so the chin comes down toward the chest and the front of the neck is a third of its height. The sheet is
carried by the jaw at its top and by the chest at its foot, so it folded into a crumpled band along the jaw and a
thicker one round the root of the neck, in a lighter tone than the muscles round it. This was seen on the mirror body,
on your own body from outside, and in pictures of the page's body baked in the start posture. With the neck straight (a
check only) it is smooth again. A sheet pressed to a third of its height has to fold whatever its skin weights are, and
a sheet with its middle cut out would be a torn sheet. So both bodies are now drawn without the platysma (`NECK_SHEET`
and `leaveOutNeckSheet` in `ns-body.mjs`, used by `installBody` in `ns-app.mjs`), as in an anatomical figure with the
skin taken off. The neck now shows the two sternocleidomastoids running down to the breastbone and the strap muscles
between them. The platysma stays in the rig, the posture bake, the skin records and the movement map. The scene is given
no triangle of it, so it has no record, no mirror twin, no pick and no beam end. Not changed: the neck's thickness
(section 97), the thicker descending trapezius, and the start posture.

**Neck movements from the strip move the eye view** (`NECK_VIEW` and `neckViewStep` in `ns-app.mjs`, `turnEyeView` in
`ns-camera.mjs`). Since section 130 a neck movement moved only the drawn head, so in the eye view, where you cannot see
your own neck, nothing moved. Measured before this change, at the neck area's look: turning drove the drawn neck from
16.8 to 80 degrees and back to 56.8, a side tilt from 0 to 45 and back to 18, and tilting back from 30.7 to −45 and back
to −19.3. The camera did not move by a hundredth of a degree in any of them. Now the eye view swings with the movement:
- the jerk throws the view the same way as the head. A turn turns it left or right, a bend forward tips it down,
  tilting back tips it up, and tilting to a side rolls the picture. Each is a share of the neck's own movement: 0.4 of
  a turn, 1.5 times a bend forward, 0.3 of a tilt back and 0.5 of a side tilt, at most 36 degrees (24 for the roll).
  The whole 80-degree turn would throw the picture off the brain, while a bend forward has only 10 degrees left in the
  bowed start posture, so it is shown larger than it is;
- the movement's partial return brings the view part of the way back with the head;
- once the neck has been still for 0.35 s (longer than the jerk's hold at the end), the view eases back to where the
  pointer points over 0.5 s, and ends there exactly. The drawn head keeps its held angle, and the mirror body and the
  outside view show it. So the view is never left turned. The pointer's own range is not touched: during the swing the
  pointer moves the view as always, and afterwards the view is the pointer's own, reaching 88 up and 88 down with the
  neck held either way (checked);
- only the camera turns. It turns about the eye, exactly as for an ordinary look, so nothing grows or shrinks (no zoom).
  The body, the left hand and a limb's hold keep the pointer's look. The crosshair passing over the strip during the
  swing switches nothing on, because the gaze is silent meanwhile. The view does not swing from outside (E), while the
  view changes, or under reduced motion. Reset does not swing it.

Measured after this change (start view, 1600 by 900, the neck area's look and a click): turning left 0 → 80 → 40, view
+32 → +16 → 0 by about 2 s; a click 40 → 80 → 40, view +16 → 0 in about 1 s; turning right the same mirrored (−32.4 at
the click's peak); a bend forward (the head's 10 degrees), view down 15 and back, with the jerk's rebound visible as a
shudder; tilting back, view up 15 on a click (30 on the first press, since the head goes from the posture to its end);
a side tilt rolls the picture about 22 degrees, then 9, then none. Seen on pictures through each movement.

**Tilting the head back reaches the neck's own end.** The head's pose still applied the camera's old limits (85 degrees
up from the start posture) to the drawn head, from when the camera rode on the head. The view is the look alone now, so
those limits only cut the drawn head short: "Tilt head back" stopped at −45, where the neck's own end is −60. They now
apply only while the camera rides the head (`LOOK_BENDS_TRUNK`, false). The look's head reaches at most 88 up as well
(85 before), still inside the neck's range. Every other neck movement already went to its joint's end (turn 80, side
tilt 45, bend forward 50).

These are display rules of this game. The swing, its shares and its times are not measured head or eye movements.

Not right or not done:
- The cards for the mouth's corner and the lower lip still name the platysma among the muscles that pull, and it is no
  longer drawn. Their other muscles still light up.
- In the start posture the front of the neck is still short: the chin is low over the chest. Between the strap muscles a
  pale strip of the neck's vertebrae shows where a windpipe and larynx would be, because the model has neither in the
  neck.
- From outside (E) the neck areas cannot be aimed at (the outside look stops 19 degrees up), and a click there does not
  repeat a neck movement. A neck movement is seen from outside only if E is pressed right after it. Looking at the neck
  areas, the outside camera puts your own head at the picture's lower left corner, mostly hidden by the limb bar.
- The mirror body's head goes to the joints' ends, but in the start view it is about 30 pixels tall: a bend forward of
  10 degrees cannot be seen on it.
- Pressing E during a swing (within about 2 s of a neck movement) drops the swing at once: a jump of up to 36 degrees.
- While the view swings and eases back (about 1 to 2 s per press), an area the crosshair rests on is not switched on
  until the swing ends.
- During a roll the labels and the arrows turn with the picture (seen), and picks go through the crosshair, which a roll
  does not move. Only a pick with a free pointer (pointer not captured) would be off by the roll, for that second.

## 172. No muscle disappears or turns see-through: the collar box cuts nothing, the glass is lines only over a body, no halo; the eyes are never glass (20 November)

The user: "ensure, especially with the right arm, that muscles do not become transparent under certain angles, because
in previous versions, if you hold the arm up in certain angles, muscles will disappear and turn transparent. That
shouldn't be happening."

The cause. The box that ends your own body at the collar in the eye view (sections 148 and 158, `EYE_COLLAR` in
`ns-scene-three.mjs`) cut with clipping planes, and the planes were on every material of your own body; the muscles of a
class share one material, so every muscle was in it, the arm's too. Whatever came into the column over the collar was
cut away. With the right arm chosen and carried up over the head, a look to the right left two finger tips of the hand
and nothing of the forearm; a look straight down with the arm out cut the deltoid and the front of the shoulder open,
their insides showing; the arm's own deltoid and rotator cuff and the trunk muscles that a raised arm carries along (the
pectoralis major, latissimus dorsi, serratus anterior, the collar bone and the shoulder blade) went into the box the same
way. The outline's picture and the glass cut only the trunk and the head, so the cut arm kept its ink lines and its
glass over a hole: muscles that disappear and turn transparent. The left arm is the game arm, drawn with its own
materials and never cut: hence "especially with the right arm". No leg reached the box at any look tried.

The change. `EYE_COLLAR.cut` is false: the box cuts nothing, in the picture, the outline's picture and the glass. The
neck's meshes mostly inside it are still not drawn in the eye view (`hide`, section 158), so the head and neck are not
drawn and no torn muscle shows. What the box cut besides is now drawn whole, to its own attachments at the root of the
neck: the top few per cent of the trapezius's transverse part, rhomboid minor, serratus posterior superior and the first
thoracic vertebra, and at the start posture also the first ribs, the next two vertebrae and the tops of a few deep back
muscles (the trapezius's top edge now ends in a point at the spine instead of a level cut; pictures at looks all round).
A rule by part or outline group was tried and does not do: the arm's own deltoid and rotator cuff and the pectoralis are
in the trunk's outline group (they ride on the collar bone, the shoulder blade and the ribs). Also: the cap's volume counted as covering your body even with the cap not drawn (section
148's "red plate", off since then), so the top of the breastbone and the inner ends of the collar bones took no aim and
hid no label or beam; they count as seen now, and a hidden neck mesh still hides nothing.

Checked. A scripted sweep (the right arm stepped through its range with the look and W/A/S/D, 194 steps, the drawing
read after every step): the arm lay partly in the box at 181 steps and in the picture there at 83;
cut at none, and no muscle of either body dropped by the culling. Not causes: the culling with stale bounds of skinned
muscles (none of 389 muscles of both bodies dropped while on screen in four sequences), the camera's near plane after
section 166, the see-through over the brain (off since `OWN_BODY_SOLID`).

**The glass over a body part: lines only.** The glass of section 147 made a muscle in front look see-through too: with
the right arm raised in front of the strip, the areas behind it were outlined on it with a light-blue fill (0.2), and
with the arm folded over the right thigh the thigh counted as locked away (34 % of it seen, under the 35 % of the rule)
and its strong fill (0.42) lay over the forearm, which read as blue glass; a leg behind the other thigh washed that thigh
the same way. The user's word wins over the fill: wherever a body part is in front (yours, the mirror body's, the game
arm), a hidden thing is shown by its light-blue line alone (`seeFillOver` in `ns-see.mjs`; the ink pass asks the same
for each sample, `fillOver`); where the brain is in front the fill stays, so a body behind the brain is still one glass
figure (seen with the brain pulled in front of the mirror body). The fill strengths, the locked-away rule and what the
crosshair takes are unchanged; a locked-away limb is now marked by its line. Its line reads clearly on dark muscle; on
pale muscle and tendon it is thinner to the eye than the old fill was.

**The eyeballs and their nerves are never glass.** The user, a little later: "And I'm not sure how important it is to
have transparency outline effects for the eyes and their nerve cords." The eyeballs, the optic nerves with their sheaths
and the chiasm are no longer a ghost anywhere (`SEE.eyesGlass` false): not behind a body part, not behind the brain's own
surface. The two circles and the X they drew under your body in every opening picture (section 147's own "not right"
list) are gone. They still cover what lies behind them, and a body part behind an eyeball still shows through it; every
other hidden thing keeps its glass.

**A lit muscle stays solid.** Another case of a muscle that read as translucent: with the mirror body held near and the
look turning the head, the turning neck muscles, lit at the look's low glow (`HEAD_GLOW` in `ns-app.mjs`), showed as a
translucent magenta strap down the side of the neck. The muscle itself was opaque; the cause was its glow halo
(`MUSCLE_HALO`, from the first "optogenetic glow"): an additive copy of the muscle pushed 12 mm out along its normals on
the mirror body (3 mm on yours), drawn wherever its back faces lay in front of something, so the shells of neighbouring
lit muscles lay over each other and over the muscles beside and under them. `MUSCLE_HALO.on` is false: a lit muscle
shows its glow on itself, solid (its colour, its light and its rim, as before). Seen side by side: the strap is matte
muscle now; a muscle lit from the strip looks almost the same as before (the halo was faint there).

QA only: `inspect().scene.organs.neck.draw` while `globalThis.__nsLimbDraw` is true: per part of your body the meshes,
the posed vertices in the box, those cut, and the meshes the culling drops although on screen. A browser test,
`tests/browser-arm-collar.mjs` (about 20 s), carries the right arm up over the head, round and down, reads that after
each of 75 steps, and fails if anything of your body is cut or culled while on screen, or if the arm never went into the
box (it went in at 54 steps, in the picture at 11, in three runs alike; with the old cut it fails at once).

## 173. Thinner, fainter light beams (20 November)

The user: "let's have the corresponding pulses be a lot thinner and a lot less opaque. As right now they're obstructing
the view."

The cones of light from a strip area to its muscles (`LIGHT_BEAM` in `ns-links.mjs`, section 131) are now about
40 % as bright (alpha 0.12 to 0.05, core 0.1 to 0.04, rim 0.04 to 0.015, white 0.45 to 0.3), cover a third as much of
what is behind them (veil 0.3 to 0.1), and are narrower: 0.4 of the key's and the muscle's width instead of 0.85, and
never more than 5 cm across at either end (`maxHalfM`; the left hand area's beam was 0.32 m half-wide at its key). Seen
in a picture of Space closing the left hand: the beam is a thin cyan line through which the brain, the strip and the arm
show; the area it starts from and the hand it ends on still read.

**The lit area as bright as possible.** The user, the same evening: "And let's make the activation area as bright as
possible." A switched-on area's light is now pure white (`AREA_LOOK.areaWhite` 0.8 to 1) at more than twice the strength
(`areaGain` 1.3 to 3, its rim 1 to 2). In the pictures the lit part was already at display white, so the change shows
mostly as a stronger glow round it where the bloom runs (the full quality level); the earlier worry that a strong glow
hides the area's shape and its neighbours (section 132) gives way to the user's word.

## 174. Space grips with all four limbs; a click never grips (20 November)

The user: "Also, now right-click shouldn't lead to any grasping function. Let's just make spacebar grasping for all of
the limbs at once. Because it gets confusing if right hand is grasping and you're trying to see what movement is being,
it's confusing if right hand is grasping whilst you're clicking, activating specific brain areas, and you can't see what
movement is being isolated." This replaces the rule of section 124 (from Message 141: "the spacebar only grasps the left
hand, whilst clicking grasps the right hand").

- **A click grips nothing.** The mouse or trackpad button, left or right, no longer closes the right hand, curls the
  right foot's toes, lights the right hand's area or its finger benders, or lights the right hand with its control glow.
  A click does only what it did besides: it presses the area under the crosshair (the movement again, harder), taps a
  muscle, presses an arrow, chooses a limb, and with a drag turns or bends. So a click on an area now shows that area's
  own movement and nothing else.
- **Space grips with all four limbs** (`SPACE_GRIP` in `ns-app.mjs`). For as long as Space holds or keeps a grasp,
  whatever is under the crosshair, both hands close and the toes of both feet curl, with the feet pointing a little:
  the left game arm's hand through the activity's grip as before (section 81's rule for both hands is back), the right
  hand through `GRIP_BOTH`, the toes and feet through `GRIP_FEET`, all on one eased share, so they close and open
  together. The control glows (`spaceGripGlows`, `CONTROL_GLOW.hand`) light all four hands and feet, with the forearms and
  shins, on your body and on the mirror body. On the strip both hand areas and both toe areas light (the toe areas with
  their curl movements, colour only and no beam, like the right hand's), and all four show the small bloom of a held
  grip on the living brain (section 89's fifth of a bloom), not the full bloom of a switched-on area
  (`setBrainLiveHeld`; before, only the left hand's area had it). Carrying, the hold of a limb by Space, the tap that keeps a hold and the double tap that turns all limbs are
  unchanged.
- **The words.** The controls card shown while the game loads (Space: "grip", was "hold"; a click: "press"), the
  controls list (Esc page and start page), the Esc page's Space row ("hands and feet grip; tap toggles"), the keyboard
  picture's Space line, the full instructions, the grip's information card (now "Hands and feet: grip", its strip parts
  the four areas, the toe benders with the finger benders) and the player guide say that Space closes both hands and
  curls the toes, and that a click never closes a hand. The tutorial taught no click grip (its click step presses an
  area); its carry step's full line now says that both hands and feet grip. The other maintainer's browser test of the
  Esc page's Space row (`tests/browser-play-settings.mjs`) is restated with a dated note quoting the user, and so is the
  card's word in `tests/chunking.test.mjs`.

## 175. A clear movement for every motor area, both ways (20 November)

The user: "make sure there's clear movement for each brain activation area. And you can clearly identify what type of
movement it is for each area. And make sure that the movement is as precise as possible with as many activation spots
and encoded movements as possible without game destabilisation." And: "That goes both ways for when you're moving the
body and the brain area is activating. But again, without game destabilization." (The same evening the user asked for
no permanent movements: an activation contracts and returns, Message 206; how an activation runs is another change.
Here each movement is judged by its contraction.)

**The audit.** Every area's every movement was switched on from the start posture, in the game's own model (the joints'
angles at the jerk's peak, and how far the moved bones travel in millimetres, with the game's rig) and in the browser
(how far the moved bones travel on screen at 1600 by 900, on your body and on the mirror body; only the bones that
movement moves are counted, so the hand and toes that the look's pitch closes and opens are not taken for movement).
The map had 132 movements in 45 of its 54 areas. Found:
- The left shoulder area moved nothing (the look and W/A/S/D carry the left arm). Nor do the three in-between areas of
  each half and the tongue area (no tongue in the body).
- The face areas (brows, eyelids, nose, mouth corners, lips: 22 movements) show only colour: no face mesh changes
  shape. Only the jaw (opening 30 degrees, the chin travels about 5 cm) and the swallow (the throat bone 15 mm) move.
- Seven movements end where the part already is, at its end stop, and so move nothing from the start posture: clench
  the jaw, lower the throat bone, turn the right palm up, bring the right fingers together (each half's), and the left
  hand's "bring fingers together"; the left wrist's two sideways bends move nothing on the game arm (it has one wrist
  axis). Small ones: straighten a knee (6 degrees from the start), straighten the right elbow (8), swing the right arm
  in (5), bend the head forward (10: the start posture holds the neck at 40 of its 50).
- Nothing could move the right upper arm or either thigh about its own length from the strip, though a drag and the
  limb turn do.
- The reverse: a drag that turned the right palm up lit only the forearm area, not its movement; turning the upper arm
  or a thigh by drag lit only the shoulder or hip area; a turn of the trunk lit both trunk areas without a movement.
- From the start look the toe areas (each half's four movements) cannot be looked at: they lie on the brain's inner
  wall, facing the gap between the halves. One spot of the right half's "Lift big toe" was found in some 6 000 looks.
- "Swing thigh in" was thrown past its end (the legs side by side) 23 degrees on, into the other leg.

**What changed (what each area moves).**
- The left shoulder area has four movements, as the right shoulder's: raise the left arm forward, swing it down and
  back, out to the side, in across the body. They swing the whole game arm at the shoulder (`SHOULDER_ACTION_DEG` in
  `ns-actions.mjs`: 60, 45, 50 and 35 degrees) on top of where the look and the keys hold the hand (`shoulderSwing` in
  `ns-app.mjs` turns the free hand's place about the shoulder for the fit; the kept place is not turned, so the arm
  comes back to it). They light the reach keys' own shoulder muscles. In the browser the left hand travels about 90 to
  390 pixels at a press. A tap on the shoulder cap or the rotator cuff now does the matching movement.
- New spots on the strip, in the areas' own shares: "Turn right arm outward / inward" (the upper arm about its own
  length, 90 and 40 degrees: at 70 inward the range-of-motion sweep found the forearm 32 mm inside the thigh) and each
  half's "Turn thigh outward / inward" (45 and 40 degrees), with their muscles by the atlas's names. The map has 142
  movements in 46 areas.
- The left hand's "Bring fingers together" now presses the fingers together (to -5 degrees, the joints' own stop).
- "Swing thigh in" carries its end as a stop for the contraction (`jerkStop`, handed on with the action), for the code
  that runs an activation.
- Both ways: an action that ends at the joint's start angle and end stop is the movement toward that stop
  (`jointAreaIndex` in `ns-grasp.mjs` takes the joints' limits), so a drag that turns the right palm up lights "Turn
  right palm up". Turning the upper arm or a thigh lights the new turns. A trunk turn lights its own (crossed) area and
  movement, as the neck's turn does. The left arm swung by the look or the keys lights the marker of the left shoulder
  movement it makes. A test walks every joint and direction of the legs and the right arm (the keys, a drag, both
  dials) and finds its own area and movement on its own side (`tests/bodymap-moves.test.mjs`).
- Checks only: `inspect({ bonePx: true })` gives every bone's place and the camera, for measuring travel on screen.

**Not changed, and why.** The face areas still show colour only (the face meshes have no movement, and the mirror
body's face is about 40 pixels tall at the start: a lift of a few millimetres would be under two pixels). The in-between
areas still move nothing (the map's own reason: stimulation there moves no single part). The toe areas stay on the
inner wall (moving them is a change to the strip's layout on the brain). The seven movements that end where the part
already is still move nothing; with no permanent movements (Message 206) nothing is ever held for them to bring back,
so they need a rule of their own in how an activation runs (a short twitch off the end stop and back, for example) or
another movement. The two hemispheres' trunk, neck-bend, face, jaw and swallow areas move the same parts the same way
(midline muscles get input from both halves); they are not neighbours on the strip.

## 176. The strip as separate blocks over a black abyss, the toes turned up to face you, and clear outlines on everything (20 November)

The owner, Message 206: "And perhaps let's go back to making the non-active parts of the motor strip a black abyss,
and let's make the background more of a black abyss, but still with a gradient. And let's actually make the motor
strip completely segmented, so it's a bunch of slice blocks with a little bit of gap in between." Message 207: "And
everything should get clear outlines." With them, the BODYMAP audit (section 175) found the toe areas of both halves
on the brain's inner wall, facing the gap between the halves: in some 6 000 looks from the start view one spot of one
toe movement was hit, so all eight were effectively dead (Message 204: "make sure there's clear movement for each
brain activation area").

**A black abyss.** The strip's inter-effector areas, where no movement is mapped, are near-black again (`SCAN_AS_BRAIN`
false; Message 199 had them drawn as the brain, section 168). The room's darkest light is RGB about 4, 4, 5
(`RAW_LOOK.room`) with a stronger pool of light on the floor (`RAW_LOOK.roomPool`), so the picture still falls off: at
the start view the corners measure 12 to 13 (they were 20 to 21) and under the bodies about 21 (25); from outside the
corners 4 to 5 (15 to 16). The light-blue glass, the beams and the white lit area read as before.

**Blocks with a gap.** Every motor area is a block of its own. Where two areas meet along the strip, the strip's own
shader (`REGION_SLICE`, in the area pass of `ns-scene-three.mjs`) draws a gap of the abyss's black, matte, with no
glow: 0.001 of the strip coordinate a side and never under 1.0 CSS px a side, so a far strip keeps its blocks; the
gaps are anti-aliased like the old seams. The colours, the pure-white lit area (Message 203), the labels, the key
tips and the parts seen through the gap between the halves are unchanged. The picker reads the same gap
(`classifyRegionGaze` `sliceHalfS`): a look into it takes no area ('glass', via 'gap'), so the area taken is the
block drawn. The gap is a little wider in the picture than for the picker only from far away (at most about a pixel a
side, where the 1 px minimum is wider than 0.001 of the strip). It was 0.003 at first: the gap comes out of the first
and the last movement's share of an area, and the hip's six movements (section 175) have shares of 0.0036, so its
first movement kept a sixth of its share and was never hit in a scan of the start view; at 0.001 every movement is.
The blocks need no line of their own: the black gap is their outline. The strip's outer contour (1.4 CSS px) stays.

**The toes turned up over the top edge.** `MEDIAL_TURN` (`ns-brain.mjs`): the medial wall is now only the strip's
medial end (the toes, their first movement), and the first stretch of the crest continues the toe block, so the toe
block runs from the depth of the inner wall over its top edge onto the crest, where it faces you, and the rest of the
strip follows in the same order (toes, ankle, knee, hip, the in-between area, the trunk). The map from the along-gyrus
coordinate to the strip coordinate (`crestStripS`): the crest's first 0.006 of along-gyrus v (about 300 mm2 a
hemisphere next to the top edge) is the toes' core, all four movements in it; the rest of the crest up to the trunk
follows on a power curve (exponent 0.53) chosen so that the trunk's border stays exactly where it was. So nothing from
the trunk on moves, and the label "Belly and back" keeps its place (with exponent 0.45 the trunk grew toward the legs
and its label was hidden at the start view). Areas on the atlas brain, right / left half: toes 313 / 282 mm2 on the crest
(and the inner wall), ankle 349 / 365, knee 250 / 239, hip 232 / 264 (before: toes 5 / 8 on the crest, ankle 797 / 766
with the upper inner wall, knee 386 / 392, hip 266 / 289). A scan of the start view (one look every unit over the leg
blocks, 3 315 looks) now hits every leg movement of both halves: curl the big toe 132 / 142 looks, lift it 12 / 12, curl
the small toes 18 / 16, lift them 11 / 9; the fewest are hip flex 8 / 6 and ankle up 6 / 10. A coarser scan of the
whole strip hits 140 of the 142 movements; the two it does not are the left forearm's turns, which have no sub-band
of their own (they are reached another way). The position stays schematic, as the toes' text says ("the strip's
medial edge stands in for the medial wall"). `MEDIAL_TURN.on` false brings the old layout back.

**One ink for every outline.** `RAW_LOOK.ink` (`ns-raw-look.mjs`): one near-black (#0b0809), one width (1.4 CSS px on a
near thing), one opacity (0.95) for every outline of the raw look; a depth step inside a limb is lighter and thinner
(0.9 px at 0.6); a far body keeps at least 0.6 of the width, so the mirror body's limbs stay outlined.
- Both bodies, the game arm and the organs: the outline pass (`ns-outline.mjs`) draws again the strong line where one
  limb or body lies over another and the silhouette of each body against the room or the brain, so limbs never merge,
  with its old rules against specks (no ring round a small hole, thin lines round slim pieces such as fingers, the
  line tapering at tips) and its supersampled, anti-aliased coverage. No line between touching muscles (the pass can
  draw one; not tried over the tones in this round): the group tones and the steps between touching muscles (Message
  202) part them.
- The brain and its eyeballs: `setBrain` draws the brain's surface and the eyeballs into the outline pass's coverage
  picture beside the strip (one channel each, combined by MAX, tested against the bodies' depth, following the living
  brain's wobble and blooms); the edge pass marks their outlines and the ink pass draws them like the strip's, and a
  composite of their own lays them on right after the glass (drawn with the strip's line, the opaque cortex covered
  them), with the beat's swell. A body in front of the brain keeps its own line; where the brain lies over a body, the
  brain's line is drawn. The optic nerves get no line: a few pixels thick, the 1.4 px line a side covered them whole.
- The 3D arrows: the same ink, inside the V's outline; their walls lightly (0.25).
- The strip's blocks: their gaps (above).
- The lines follow what is drawn: the face's movements (section 179; checked on the mirror body held near, the same
  view at rest and during a contraction: the head's line follows the pursed lips, because a rigid face muscle's buffer
  is written and copied into the ID picture, and one skinned to the jaw carries its movement in the lift offset the ID
  skin batch reads), the heart's beat (its material scales it about its centre by up to 3 %; the ID pass now draws it
  with the same scale, `nsOutlineLocal`, where its line stood at the resting size), the living brain's wobble and
  blooms (the coverage materials take the brain's vertex rule) and the eyeballs' turn (their own matrices).

**Cost.** The frame rate on the test machine was too noisy to show the outlines' cost (the machine's load average was
9 to 28 while the other packages ran; the same build's fill-limited runs varied by up to a half). So the graphics card's
own time of the line passes was measured (`globalThis.__nsOutlineGpu`, a timer query; the ID pass is not counted, the
hidden-limb glass needs it anyway), at 5120 by 2880 with quality High: with the strip's contour only (the look as
shipped) 4.1 to 4.4 ms each time the view moves; with the bodies' lines too 4.25 to 4.6; with the brain's and the
eyeballs' too 4.4 to 5.7 (looking round 5.4 to 5.6). So the new lines cost about 0.2 ms for the bodies (their pixels
were already searched for the strip's line) and about 1 ms for the brain, whose every pixel is searched for a nearby
edge, at that size; at 1600 by 900 a tenth of that. The gaps are a few instructions in the area shader.
Frame table at 1600 by 900, back to back with the lead's server (4e7dfbb), frames a second for still / looking round /
up and down / the limb turn, two runs each: this build 59.8 / 37.2 / 40.1 / 46.0 and 59.9 / 49.5 / 54.7 / 59.4, the
lead 58.7 / 33.5 / 39.6 / 39.4 and 56.0 / 30.4 / 33.5 / 38.1 (the machine was loaded; no case was slower here;
measured before FACE was merged).

**Three faults from a review of Body update 59 (section 168's look), fixed here.**
- The arrows: the raw look set their ink's opacity to 0 but kept its width, and the arrow shader mixes the ink colour
  into the face by coverage before the opacity is applied, so a dark contour was drawn by accident. It is now drawn on
  purpose, by the one ink rule above (`ARROW_LOOK_RAW` takes `RAW_LOOK.ink`).
- The power-up flash: the HDR boost of a muscle's flash (the emission brightened by the excess of its peak over
  `HDR_BLOOM.muscleFrom`) lived only in the comic patches, which the raw look replaces, so the flash was about 1.8 times
  dimmer and might not bloom. `patchRawShaders` now carries it for a muscle with the power-up patch (Message 203: the
  activation as bright as possible).
- The steps between touching muscles: the optimiser compared a model lightness (the tone's plus step x 0.08), but the
  drawn colour is clamped to 0.35 .. 0.82, clipped to the gamut and darkened by its storey, so many contacts it counted
  as told apart were drawn nearly equal (the review: brachialis against the long head of biceps 0.003, adductor magnus
  against longus 0.003). It now compares the lightness drawn (`drawnMuscleLightness`, the same function as the colour),
  and each refining pass also tries moving both ends of a touching pair. On the game's body (522 counted contacts):
  pairs drawn nearly equal (a gap under 0.03) 44 -> 36, pairs short of their goal 215 -> 201, those two pairs 0.046 each.

Not right, or not done:
- At the start view the gaps are about 2 px: they read as thin black lines between the blocks rather than gaps; from
  close they open up. They cannot be wider in the strip coordinate without taking the edge movements' shares (above).
- The big toe's curl takes most of the toe block as seen from the start view (the inner wall is all of it), the other
  three toe movements a strip next to it; the ankle's "pull the foot up" and the hip's "lift" are the narrowest leg
  movements (6 to 10 looks in the scan).
- Touching muscles still drawn nearly equal: 36 contacts, the heaviest the internal oblique against the transversus
  (mostly hidden under it) and the lateral gastrocnemius against the soleus; three steps cannot part every cluster
  where four or more muscles touch.
- The optic nerves have no outline of their own; the brain's line is not drawn where an eyeball lies just beyond it
  (since section 187 it is, and an eyeball's line no longer shows through the brain).
- The cost was measured with a timer on the graphics card, not as frame rate (above); the three screen composites are
  not in it.

## 177. No permanent movements: every activation contracts, then simply returns (20 November)

The user: "I think it's better actually if there are no permanent movements. ... And what I mean by no permanent
movements is that when you tap any area of the brain, you activate any area, it will contract, then return to its
previous place. But in returning to its previous place, you won't see corresponding activity and muscle activation. It
will just return." This replaces Message 185's "They don't have to return fully, just partially" (section 141, and
section 159 for the left arm) and the latch the game has had since 11 November: a movement switched on from the brain
was driven to its end, eased back half way and held there until the opposite movement or Reset body.

**Contract, then return** (`JOINT_LATCH`, `contractBody`, `contractArm` and `integrate` in `ns-actions.mjs`). Every way
of switching a movement on (a look that rests on an area, a click, a muscle tap, the arrow keys' step, and a number key
in the code that still accepts one) now does the same two things:
- **the contraction**: for 0.4 seconds from the press the part is driven to the movement's end by the same spring as
  before (the electroshock of Message 154): it slams into the end at about 0.1 s, is thrown back off it, slams in again at
  about 0.25 s and has a moment there. The hold used to be 0.3 s; at 0.3 the return began right on the second slam, so
  the lit muscles could hardly be read;
- **the return**: then it goes back, on a soft spring with no wobble, to where it was just before the press, and stays.
  "Where it was" is the part's place: the start posture, or wherever the player put it with W/A/S/D, a drag, a Space
  carry or the limb turn (those place a limb and keep it: that is the player moving the body, not the brain). A
  further press during the contraction or the return drives the part again from wherever it is, so repeated clicks give
  repeated contractions and returns.

The left arm does the same on its pose drive (0 the hand's neutral pose, 1 the movement's end), so it returns to the
place the look and the keys give the hand; the left shoulder area's four swings (section 175) too. The forearm-turn
areas turn the forearm for the contraction and it turns back to the side the palm was on (only the double tap of Space
changes that side). Under reduced motion the part goes out and back on gentle springs with no bounce (0.45 s out).

**Nothing lit on the way back.** The area, its muscles, the cone of light and the activity's display level of a movement
are lit for exactly the contraction and fade out over its last 0.08 s, so they are dark from the first frame of the
return (`pulseMove`, `lightFadeS`). No antagonist lights up for a return. Three things made light without a press and
were changed so a return shows nothing:
- a look that only passes over an area (leaves it before the 0.07 s that switches it on) moved nothing, yet its area
  stayed lit for a second: its light now ends when the look leaves (`dropPendingLook`);
- a small look movement within an area relit it for another second: it now starts nothing on an area with a movement
  (its light is its contraction; a click does it again);
- the glow of the head and of the player's own movement (section 82; `headActivity` and `feedHeadMove` in
  `ns-app.mjs`) read the head's whole angle, so a neck movement's return lit the neck areas, and its speed lit the
  opposite neck area. They now read the look's own share only (`lookShareOf`). Measured in the browser: "Turn head to the
  left" 0 → 80 → back to 0 in about 1.2 s, with every area at its resting level (the look's own 0.05 on the neck area)
  from the first frame of the return.

**What went with the latch.** The stage rule (an opposing movement first brought a held part back, "first press
brings it back" on the card, `infoActionBack`, `latchView().back`, the number key's "brought the part back" line), the
faint hints on the opposing areas and their muscles (`latchView().hints`, the hint rows and links), "already there" for
a body movement (`latchView().still`: a press always moves now), the status line that a held neck movement had turned
the head and which key brought it back (`headGoalTaken`, `headBackKey`), and the held-key movement of a number key
(`MOVE_HOLD`: a held key is an ordinary press). `latchView` is replaced by `motionView` (what is contracting and what is
on its way back), and `inspect()` shows it as `motion`, with `areasShown` (the area levels drawn). The right shoulder's
rule that the later of its two planes wins (`JOINT_CONFLICTS`) now holds at the peak of a contraction: from a raised
arm, "Swing right arm out to the side" is out to the side at its peak, and both joints then return to where they were.
The used-muscle mark (Message 143) stays. "Already there" stays only where the left arm cannot move: a straighten of a
straight elbow, and its two sideways wrist bends.

**Two findings of the BODYMAP audit (section 175).**
- *No part is thrown past its movement's end.* The spring overshot an end in the middle of a joint's range by about
  40 % ("Swing thigh in" threw the thigh 23 degrees past its end into the other leg; "Turn right arm inward" reached -70
  where the forearm meets the thigh). A movement's end is now a stop for its contraction, as a joint's own limit is: the
  part slams into it and rebounds, and never passes it. That honours the map's `jerkStop` on "Swing thigh in", and every
  end now has it. Checked for all 114 body movements from the start posture: none passes its end, all return to the
  start posture, none lights anything on the way back (`tests/motion.test.mjs`).
- *A movement that ends where the part already is* (clench the jaw, relax the throat, turn the right palm up, bring
  the right fingers together, each on both halves) showed nothing at all under contract-and-return, against Message 204's
  "clear movement for each brain activation area". Its contraction now strikes the joint's stop: the part is thrown into
  it and rebounds half of the joint's range off it (at most 38 degrees), then is drawn back onto it, a short twitch
  (measured: the jaw opens 12 degrees and shuts, the right palm turns 30 degrees and back, the right fingers spread 8, the
  throat bone moves 8). Only when the whole movement would otherwise show nothing ("Purse the lips" also wants the upper
  lip at its start: the lip does not twitch). Not under reduced motion, where these show their light only.

**The words.** The Esc page (the "Switch areas on" step and the Look / Click row), the information card, the tutorial's
second step ("Click it: it moves again"), the plain notes of "Turn right palm up" and the player guide say that a
movement from the brain contracts and goes back by itself, and no longer that it stays until its opposite.

Frames looked at in the browser (start view, 1600 by 900, the right elbow's "Bend" and the left elbow's "Bend", a click
after the look's own switch-on had returned): the area white and the mirror body's and your own arm moving during the
0.4 s, the area back to its colour, no beam and no lit muscle from the first frame of the return, the arm back at its
place about 1.2 s after the press. These are display rules of this game; the times and springs are not measured
movements.

Not right or not done:
- The left wrist's two sideways bends still move nothing: the game arm has no sideways wrist joint, and a twitch on
  another axis would show the wrong movement.
- A movement is lit for 0.4 s instead of a second; a quick reader may find the lit muscles harder to catch, and the
  beam, thin since section 173, is on screen only that long.
- The return is not shown as activity, but the status line's "Arm relaxing back to rest" (the left arm's pulse line,
  for players who open it) still names it.
- The chosen limb follows the look (section 139): looking around during a contraction of that limb ends the contraction
  of its joints at once (the look places the limb, as a drag does).
- The other maintainer's `tests/browser-keyboard-aim.mjs` fails at times at its third step ("ArrowLeft did not select an
  area", from the inferior end of the strip): seen on this branch (6 of 11 runs) and on the integration branch without this
  change (4 of 9 runs, the same failure). The walk then goes on from the area the information card shows, the end of the
  walk; when the test passes, the card had taken another area on the free pointer's way to the mirror body. Since a
  look that only crosses an area no longer lights it, the card may take one less often. The test was not changed here.
- Frame table on a busy machine (other browsers running), this branch and the integration branch in turns: still
  60.1 / 60.0 / 59.3 / 60.0, looking around 48.9 / 42.2 / 37.6 / 38.3, up and down 50.0 / 39.7 / 41.3 / 39.8, limb turn
  39.7 / 39.7 / 39.0 / 37.5: no slower than the integration branch, but not the quiet machine's 60.

## 178. A limb never gets stuck (20 November)

The user: "And there are ranges of motions where the limbs get stuck. The limb should never get stuck." Still standing:
"Any limited range of motion that's unnatural needs to be fixed ... We want full range of motion on all axes" (162);
W / S along the line between the shoulder or hip and the hand or foot, A / D round that joint (186); a hand stops at your
own trunk; no limb thrown about (section 166).

**How the cases were found.** A script plays one limb hard: keys singly, in pairs and held for seconds, the look
carrying the limb far, keys while the look moves, the limb turn, Space, another limb moved into it, keys in the view from
outside, Reset body. After every step it asks whether some key still moves the limb: the key opposite to the last one
first, then the others, each held 0.3 s (a key that moves nothing leaves the pose as it was, so a failed probe tries all
four from one pose). A second script carries each limb far in eight directions with the look and brings the look back.
Offline, the hold's own rule was run from 343 poses of the right arm and 329 of each leg on a grid through the ranges
the keys' solve works in, each key held for 8 frames. Every case was then built on purpose and its cause found in code.

**What trapped a limb, and what changed.**
1. A key whose move was refused (it went too far off the keys' line, or into the folded limb) put the hold's place back
   to its last place. That could be a place the look had carried out of reach; the keys' line then latched onto it and
   every later frame was refused too. Seen with the right arm raised straight up by the look: S and A moved nothing.
   Now a refused frame puts the place on the limb's end.
2. A move more than 60 degrees off the keys' way always waited (section 166). Where the joints cannot keep to the line
   at all, that left one key or none: the right arm straight up beside the head (it may not cross over the head, so S
   could not draw it in and A could not bring it back), a straight leg lifted high and out, a straight arm pointing
   back. On the offline grid 3 arm poses and 5 of each leg had no key that moved the limb, and 13 and 16 to 18 had one.
   Now a move 60 to 85 degrees off is taken too, but slowly: its part across the keys' way at most half the keys' own
   way a frame (`keyFarDeg`, `keyLatFar` in `LIMB_KEYS.view`; `keyMoveCut`). The end curls the way the joints let it;
   across the chest S now draws the right hand in at about a third of the keys' speed instead of waiting. Only a move
   that goes nowhere the keys' way, or backward, still waits. A move under a twentieth of the keys' way is taken
   whatever its direction (joints passing through angles the drawn pose does not show must not be held there).
3. The limb solve felt each joint with a small turn. At the end of a range the combined-range rule takes (a thigh
   lifted sideways to 30 degrees while stretched back; a thigh past 100 degrees with a straight knee, where the drawn
   knee bends instead) that turn showed no move, or a move the step could never make, and the step left the joint out
   or pushed it the wrong way: A could not bring a leg back in from its sideways end, and a thigh lifted to its end
   could not be lowered. A turn the rule cuts back is now made the other way (`solveLimb` in `ns-grasp.mjs`).
4. The thighs' parting at high hip flexion (`legTurnState` in `ns-body.mjs`) was cut off at the hip's sideways limit, so
   over its last two degrees the drawn leg did not move at all. It now gives way smoothly (`spreadIn`): never past the
   limit, the same size away from it, and the drawn lift rises with the angle all the way.
5. A hand inside the trunk's keep-out or the head column was refused every key, because every place near it was inside
   too. A hand gets in from the view from outside (nothing is kept out there), by folding at the shoulder, or with the
   solve lagging its place. Now only a key that takes it deeper in is refused, and the right arm's own end after a step
   is checked the same way. The head column also ran up for ever and is as wide as the shoulders, so a right arm raised
   straight up had its hand "in your head" half a metre above it; it now ends a hand's half width above the head
   (`HEAD_COLUMN.zToMm` 1700).
6. A limb the look had carried to the end of its range was picked up again only when its place passed within 40 mm of
   it. A quick look back swept the place past it between two frames and stopped far away, and the limb stayed where it
   was (a leg left lifted with the look back at the start). Now, once the place has come to rest, one longer solve
   (`LIMB_HOLD_REACH`, at most every quarter second) asks whether the joints reach it; a place they reach is rejoined
   frame by frame at up to 1.2 m/s (`rejoinMps`) while each frame brings the end nearer.

The rules that are there for a reason stay: a hand stops at your trunk and head (it no longer gets caught inside them);
W / S keep to the line and A / D to the root wherever the joints allow it; a key never throws a limb (never faster than
1.25 times the keys, sideways at most half the keys' way when far off the line); a limb waits where the look carries its
place beyond the joints.

**Measured** (`limbfree-work` scenarios, 1600 by 900, this branch against the integration branch at the same time):
- the eight stuck poses built on purpose (right arm up beside the head from the side and from the front; right and
  left leg lifted and swung to their sideways end; each arm across the face in the outside view; right arm folded at
  the shoulder; the raised right arm folded by S): 3 of 8 free before, 8 of 8 after (the way back moves the end at least
  15 mm in 0.4 s and at least two keys move it). Before, the lifted left leg answered no key at all (5, 1, 2, 0 mm).
- the look carrying each limb 420 px in eight directions and back: before, 21 of the 29 cases that ran in the script's
  time came back with the look (the legs stayed lifted after a look up, the right arm stayed up); after, 32 of 32.
- random play: before, 489 steps, 2 limbs stuck (the left arm folded in front of the face, no key moving it in 1.2 s;
  the right arm straight up, one key only); after, 517 steps, none, and none in the 1 726 random steps on this branch
  since item 6.
- offline grid: no pose with fewer than two keys that move the limb (corners of a range, a joint at its end on two axes,
  leave two). A test keeps this (`tests/limb-hold.test.mjs`).

**Not done or left.**
- A move far off the keys' line is slow by design: across the chest S brings the right hand in at about a third of the
  keys' speed, with a sideways drift; with the arm straight up S bends the elbow and the hand comes down behind or
  beside the head, not straight down the arm's line. The upper arm's own turn would let the hand keep to the line, but
  it belongs to the limb turn (the underside / overside) and was not given to the keys.
- A hand coming down onto your head in the eye view stops at the column's top, 1.7 m up in the body's frame; with the
  head not drawn there, it stops in the air above the view.
- A limb rejoining its place takes up to about a second and a half for a full swing (1.2 m/s).
- Twice in early random play the left arm (its own rig) was stuck folded near the shoulder; one of the two came before
  item 5. Neither could be rebuilt on purpose, and in about 2 000 later random steps of the left arm it did not come
  back. Its cause was not pinned down.
- `tests/browser-keyboard-aim.mjs` failed in every run here, on this branch (8 of 8) and on the integration branch it
  was made from (7 of 7), with the failure section 177 describes ("ArrowLeft did not select an area"; once on this
  branch at its mirror-arrow step instead). The other twelve browser tests (all but `outside-compass`) pass.
- Frame table on a quiet machine, this branch then the integration branch: 60.1 / 59.9 / 60.3 / 60.0 and
  59.9 / 60.4 / 60.0 / 60.0. The new work runs only on frames of the keys (two cheap keep-out tests) and, at most every
  quarter second, for a waiting limb whose place has come to rest.

## 179. Face movements you can see (20 November)

The user: "make sure there's clear movement for each brain activation area. And you can clearly identify what type of
movement it is for each area." (Message 204; earlier, Message 154: movements "as exaggerated and obvious as possible
within reason".) Section 175 found that the face areas' 26 movements (brows, eyelids, nose, mouth corners, lips, on
both halves) only changed the colour of the face muscles: no part of the face moved.

**What the player sees now.** Each face movement moves the face's muscles, the way that movement pulls them, on your
own head (seen from outside) and on the mirror body:
- "Raise both eyebrows": the forehead muscle shortens toward its top edge; the brows and the upper ring of the eye
  muscle go up (13 mm at full strength, coming forward over the brow ridge) and the forehead bunches into ridges.
- "Frown": the inner brows come down (10 mm) and together (8.5 mm); the frown muscles bunch between the brows.
- "Close both eyes": the eyelid part of the ring muscle slides down over each eyeball (a turn about the eyeball's
  centre) until the lids meet a third of the way up the opening; the outer ring squeezes in. "Open both eyes wide":
  the upper lids slide up (6.5 mm), the lower lids down.
- "Wrinkle the nose": the side of the nose bunches up (8 mm), with the nostril wing and the upper lip beside it.
  "Flare the nostrils": the wings pull out (8.5 mm), the septum down.
- "Lift mouth corner (smile)": the corner goes up, out and back toward the cheekbone (13, 8 and 4 mm), the cheek
  rises, the smile muscle bulges. Each half's area moves mainly the corner on the OTHER side, as the map says (the other
  corner gets 30 %), so the two halves' smile areas are mirror images. "Pull mouth corner down": the corner goes down
  (13 mm), the same way one-sided.
- "Purse the lips": the lips gather (a third narrower) and push forward (8 mm). "Stretch the lips wide": the corners
  go straight out (9.5 mm) and back, the lips thin. "Lift the upper lip" (9 mm, the teeth show); "Push the lower lip
  up (pout)": the lower lip and the chin go up and out (7 and 10 mm); "Pull the lower lip down" (9 mm).
A contracting muscle also thickens (its belly stands out). The parts a muscle pulls (lips, brows, eyelids) move with
it, fading with distance, so neighbouring muscles stay together. The amounts are exaggerated on purpose so that they
read on the mirror body; they are a picture of each movement, not measured soft-tissue motion. The cards of these
areas now say what moves (and no longer that the face does not move).

**How.** The face's display joints (brow_raise, eye_close, nose_wrinkle, smile, lip_purse, upper_lip, lower_lip) were
already driven by the activity like every other joint, so the face follows each activation's contraction and return
exactly as the joints do (how an activation runs is not changed here). `ns-face-move.mjs` works out, once when the body
is installed, a head frame from the face's own meshes (across the eyes, chin to forehead), landmarks (the mouth
corners, the lips' line, each eye's opening and the eyeballs' centres, the brows, each muscle's ends) and, for 15
shapes, the vertices each moves with their displacement and normal change at full strength (about 67 000 entries).
Each pose hands the scene the shapes' strengths (|joint| / 20, each side of 0 its own shape; `faceShapeWeights`); the
scene writes the moved positions and normals into the face muscles' shared buffers only while they change
(`setFaceShape`; a muscle skinned between the skull and the jaw takes them through `skinBase`, so the jaw still carries
it). With every strength at 0 every buffer holds exactly its resting contents. `inspect().scene.faceMoves`,
`features.faceMove`.

**Checks.** `tests/face-move.test.mjs`: every shape moves the face 6 to 17 mm at its largest, no NaN, the face at rest
is exactly its rest, the strength is linear, each shape moves its part the right way (the eye's opening closes to under
1.5 mm, a smile lifts its own corner and leaves the other), every two shapes' movements differ, and at most 40
triangles (of some 58 000 over 0.15 mm^2) turn over at a shape's peak. In the browser, with section 177's contraction
and return: a face movement's strength rises to 0.75 in about 0.15 s, holds, and goes back to nothing, and the face's
buffers are then exactly their resting contents again (`restOff` 0); drawing a moving face took up to about 1 ms of a
frame (`lastMs`). Pictures of every face movement during its contraction on the mirror body held near, switched on
from its area by a look.

**Not right yet.** The mirror body's face is small at the start distance (about 40 pixels tall); the movements are
plain on the mirror body held near, small at the start and from the outside view's distance (each lasts about half a
second). Working the shapes out takes about 0.1 to 0.3 s of the loading's last steps. Some movements fold a few thin triangles at
their peak (the eyelids' rims, where the lips meet). Your own face is not drawn in the eye view (unchanged). If the
outline pass is switched back on for the body, the lips' outline will not follow the face (it draws the skinned
muscles from their source positions).

## 180. The arrow keys walk the same way whenever they are pressed: after Space, and during a neck movement (20 November)

The finding. The other maintainer's `tests/browser-keyboard-aim.mjs` failed on a busy machine at its first arrow key
after carrying the mirror body in the outside view ("ArrowLeft did not select an area", from the inferior end of the
strip, no area tried), and passed on a quiet one. Traced frame by frame, the cause is not the machine's speed as such
(nor the picture quality, a pick buffer or the brain's place: the step classifies on the brain's own geometry):

- With the look off the brain, a key goes on from the area the information card shows (`areaStep`). For
  0.6 s after Space lets go (the hands opening) the card is the grip card, whose area is the left hand's. A key pressed
  in that window walked on from the hand's area; a later one from the area looked at before the carry, here the
  inferior end of the strip, where the left key has nothing further. The test pressed its key 8 frames after the carry:
  inside the window at 60 frames a second, outside it on a busy machine. Pressed 0 ms and 1500 ms after the carry on
  the same machine, the old build gave the hand's area and the end, every time. (Section 177's reading, that the card
  took another area on the free pointer's way to the mirror body, did not hold: the card's area in passing runs was the
  grip card's.)
- A key pressed while a neck or trunk movement moves the head waits until the head is still (the camera rides on it).
  A step onto the neck area starts that area's movement, which takes about 1.6 s with its return; a waiting key ran out
  after 1 s and was dropped without a word, so the next key of a walk across the neck area did nothing.

The change.
- The grip card no longer counts as a place looked at for the walk (`areaWalkCardId` in `ns-app.mjs`): the walk goes on
  from the card that comes back when the hands are open, however soon the key comes.
- A waiting key is kept 4 s (`AREA_REQUEST_KEEP_MS`, was 1 s), and in the eye view it also waits while the view still
  swings with a neck movement (`NECK_VIEW`): the step's look is worked out without the swing, so a step during it slid
  across the next areas as the swing came back.

The test, restated with dated notes and its assertions kept: after the carry the walk starts from the area stepped to
before it (a new check) and goes right to the thumb area, as it did before the carry was added to it, passing the neck
area; the arrow tip's hover is read from the frames after the last step, because the frame finds the tip under the
crosshair before it applies the camera of the stepped look, so in the outside view the hover follows a step one frame
later (seen frame by frame; the test had read the step's own frame on a busy machine).

Checked. `tests/area-step.test.mjs` (a new case). The browser test 32 times on a busy machine (up to ten at once, load
average up to 31) and 4 times more under CPU throttling (3 times slower): all passed; the integration branch without
this change, 1 of 4 failed in the same hour. The arrow keys at the lowest picture quality ('Low') under
throttling stepped as at full quality. The other twelve browser tests, `?case=boot`, the frame table (60.0 / 60.2 /
60.1 / 59.9).

Limit. A key still waits for the head and the view, up to 4 s; a held key queues at most two steps, which can then go
at once when the head is still. The arrow tip's hover still trails a step (and any look) by one frame.

## 181. Every movement from the brain returns, unlit; a limb that rejoins its place glides (20 November)

The user: "when you tap any area of the brain, you activate any area, it will contract, then return to its previous
place. But in returning to its previous place, you won't see corresponding activity and muscle activation. It will just
return." (Message 206) and "The limb should never get stuck." (207). A review of updates 60 and 61 (each finding
confirmed by two further readers) found five places where sections 177 and 178 did not hold. Each was shown first, then
fixed, then shown fixed.

**What changed.**
1. The neck no longer lights while the trunk moves. The neck's own glow reads the look's share of the head
   (`lookShareOf`), so that a trunk movement from the brain lights nothing of its own on its way back. That share was the
   eye's neck bend plus the held trunk bend, which is the look alone only while the neck takes up the whole trunk bend.
   The bowed start posture leaves the neck 10 degrees of forward bend, so at any look more than about 40 degrees down
   (the start look included) the share followed the trunk: "Bend trunk forward" switched on while looking down at your
   belly lit both neck areas and the neck's extensors at about 0.85 through its whole return (and 0.9 while it
   contracted, although the drawn neck did not move); "Lean trunk back" did the same at the start look. The share is now
   the look's own neck bend with no held angle at all (`lookNeckFlexDeg` from `headPoseForLook`); with nothing held it
   is what it was, so the head still lights as the look turns it.
2. A trunk bend stopped at the brain or the mirror body returns. A forward bend that would bring your head into the
   brain or the mirror body stops at the share that stays clear (section 42). The stop was written as a
   `limbPose`, which since section 177 is the player placing the limb, so the trunk stayed bent for good and later
   movements returned to that bend; only Reset body brought it upright. Its angle was also counted from the start
   posture but taken as absolute, so the trunk was left 5 degrees further forward than the clear share. Now the stop is
   an activity event of its own (`contractStop`; `trunkContactStop` in `ns-app.mjs`): the trunk is held at the clear
   share, at its absolute angle, for the rest of its contraction (lit, as the contraction is), then returns to its place
   like every movement. Only a contraction is stopped: a return is never held, so the trunk always gets back.
3. The left arm comes back after a shoulder swing. The left shoulder area's four swings (section 175) turn the place
   the hand is asked for about the shoulder; the hand's kept place is not turned, so the arm comes back to it. But on
   every frame on which the swung place left the shoulder's range, the range-clamped swung place, turned back, was
   written into the kept place, and the error built up over the contraction: with the left hand held well across the
   body or behind and another limb chosen (the left hand then keeps its place), the arm ended 0.1 to 0.5 m from where it
   had been and stayed there. Now a swing never moves the kept place (`freeHandKeptPlace`): without a key it is kept
   exactly; a key still moves it, kept inside the shoulder's range on its own. Without a swing the rule is the one it was.
4. A limb that rejoins its place glides all the way (section 178, item 6). The speed limit of a rejoin (`rejoinMps`,
   1.2 m/s) was applied only on frames whose solve stayed well short of the place; the frame whose solve came near took
   its whole answer at once, so a leg left lifted by the look came back at 20 mm a frame and then jumped 380 mm and
   321 mm in its last two frames, and a short rejoin went in one frame. The limit now applies on every frame of a rejoin
   (`rejoinShare`), and the rejoin ends only on a frame whose whole move is within it.
5. A limb resting a little short of its place is not solved again on every frame. At a range end the keys leave the
   place up to 20 mm beyond the limb's reach. The quarter-second reach test of item 6 in section 178 is only for a limb
   waiting beyond its reach, but its rule ran for this limb on every still frame (about 0.03 ms each: work, not frame
   rate). Now only a limb more than 40 mm short of its place is tried again (`holdRejoinDue`).

**Shown before and after.** Node checks with the game's own rules (`tests/return-rules.test.mjs`, ten cases, keeps them)
and the game in the browser (1600 by 900), the lead branch against this one:
- Looking 66 degrees down and clicking your own left rectus abdominis ("Bend trunk forward"): the neck areas as drawn
  went from 0.22 (the look's own level that far down) to 0.90 in the contraction and 0.87 in the return (27 of its 64
  frames, about half a second, above 0.22) before; they stay at 0.22 throughout now.
- The brain carried in close with S for 1.1 s, then "Bend trunk forward": before, the trunk stopped and its place became
  0 degrees (the start posture is -5) for good; now it stops at -4.4, holds there for its contraction and returns, unlit,
  to -5, its place never changing.
- The left hand held across the body (D for 2.5 s with the left arm chosen), the left leg chosen, "Raise left arm
  forward" switched on from the left shoulder area: before, the kept place and the drawn hand ended 145 mm away; now
  0.0 mm (three runs). Offline, with the arm's own fit, the six held places and four swings of the review moved the kept
  place up to 486 mm before and not at all now.
- The left leg carried 1.43 m up by the look, the look brought back in three quick moves: before, frames of 20 to 53 mm
  and then 380 mm and 321 mm (12.8 and 11.4 m/s by the browser's frame clock); now 33 to 46 mm frames all the way (1.0
  to 1.6 m/s by the browser's clock; the limit uses the game's own frame time), the last two 27 mm and 3 mm.
- The right arm driven by W or A to its end and let go: the old rule (this build with only that line put back) solved on
  123 of 123 and 124 of 124 still frames; now on 0 of 124 (`qa().limbs.holdFrames.solves`, new for checks).
Also: 481 unit tests, `?case=boot`, the 13 browser tests (all but `outside-compass`), and the frame table on a busy
machine (load 13 to 15), this branch 60.1 / 59.1 / 60.1 / 59.4 and 60.0 / 59.9 / 60.0 / 60.0, the lead branch
60.0 / 59.7 / 59.4 / 58.9 and 60.0 / 60.0 / 59.4 / 60.0.

**Not done or left.**
- The trunk's contact stop still acts one frame late: it compares the head as drawn last frame with the activity's
  angle now, so the frame on which the trunk passes the clear share is drawn past it (seen: one frame at 5.8 degrees,
  then held at -4.4). Unchanged from before; fixing it means testing after the step within the frame.
- A trunk return is never stopped: if you move the brain into the head's way during the 0.4 s of a contraction, the
  head passes through it on the way back.
- A push from the chosen limb (`LIMB_PUSH`, section 139) during a swing still moves the left hand's kept place: the
  pushed limb stays where it was pushed, by that rule. Seen twice when the look carried the chosen leg into the swung
  hand (17 and 19 mm).
- The look's own neck glow at a steep look down (0.22, the neck at its forward end) is unchanged.

## 182. A still view is idle again; the face and the eyeballs agree with what is drawn (20 November)

From a review of updates 60 and 61 (each fault confirmed by two skeptics, each shown before and after its fix):
- Since section 176 the heart's outline followed its 3 % beat, and that counted as a change of the picture, so the
  outline's passes and the whole light-blue glass pass ran on every frame even with the view and the bodies still. A
  change of the heart's beat alone no longer counts; on every frame that redraws the outline the heart's line takes that
  frame's swell. Measured, the graphics card's time per still frame: 6.6 to 2.6 ms at 1600 by 900; 11.3-13.9 to
  9.8-10.0 ms at 1600 by 1000 with a pixel ratio of 2; 29.7 to 21.1 ms at 5120 by 2880 (31 to 43 frames a second). On a
  still frame the heart's line keeps the last redrawn swell (the heart is inside the rib cage and not seen in play).
- A lip movement (section 179) on the face muscles skinned on the graphics card never reached their processor copy, so the
  crosshair and the mirror body's measures saw the face at rest (up to 11 mm off); now they see it as drawn.
- With the eyes no longer glass (section 172), the processor and the graphics card disagreed about which hidden thing is
  drawn where an eyeball lies between a body part and the brain's surface; the crosshair now takes what is drawn there.

## 183. The right elbow bends fully without folding its muscles; S draws a hand across the chest in to the shoulder; the right wrist has a control (21 November)

The user: "Any limited range of motion that's unnatural needs to be fixed ... We want full range of motion on all axes";
"there's problems with some limbs, such as the right arm having a full range of motion, especially when you go left all the
way and it's unable to cross the body, the torso"; earlier: "You probably overdid it with the internal or medial rotation
with the arms", "arm movement range of motion can be limited when looking up whilst in internal rotation". The list of
what was not done: "the right elbow at its full bend still folds its muscles; with the right arm across the chest, S leaves
the hand where it is".

**What each control reaches** (a browser script, 1600 by 900, each probe from a fresh start: the look carried far up,
down, across and out, the keys held for seconds singly and in turn, the limb turn; the upper arm's direction read in the
chest's own axes; the joint angles from the game). Before (the lead build) and after, where they differ. Ordinary adult
ranges for comparison are textbook figures (AAOS), not measured on anyone.
- Right arm: raised forward or out to the side to 176 degrees of elevation (look up; D and look up); brought across the
  body at shoulder height to 64 degrees past straight ahead, the hand 34 to 35 cm past the midline (the look; A at lower
  raises); elbow 0 to 145 (W, S); forearm turn the whole 160 (limb turn). Short of ordinary: the arm behind the trunk's line
  with the arm low, 34 degrees (look down; ordinary 60; no key moves an arm back), behind the side line at shoulder height
  17 (ordinary about 40); the upper arm's own turn -15 to 35 before (only the limb turn moves it; ordinary 70 in, 90 out),
  -55 to 35 now (the keys, across the body; below). The wrist: no control placed it before; now a drag on the hand (below).
  A press-and-drag on the upper arm moves the shoulder's raise and the upper arm's turn through their whole joint ranges
  (section 125), including the 60 degrees back.
- Left arm (its own rig): raised forward and out to 180, behind the trunk's line to over 60, across to 68 past straight
  ahead (hand 32 cm past the midline), behind the side line at shoulder height over 80, elbow 0 to 145, forearm turn the
  whole 160. Short: the upper arm's own turn -15 to 35 (the limb turn only; no drag turns it); the wrist has no control.
  Nothing on the left arm was changed.

**The right elbow at its full bend** (looked at in close pictures offline, posed with the game's rig and skin records, and
on the mirror body brought near). Three faults, each with its own rule (`ELBOW_SKIN` in `ns-body.mjs`, used alike by the
start-posture bake, `skinBodyPositions` and the scene's processor skin):
- The far ends of the forearm's muscles kept a share of the upper arm's frame (the weights fall off slowly with the
  distance to each bone: 6 cm down the forearm the long finger and wrist flexors followed the upper arm by 15 to 30 %; the
  triceps 3 cm above the elbow followed the forearm by 35 %). At a deep bend such a vertex was pulled 2 to 4 cm toward the
  other bone, so the forearm's flexors folded back into the crease and through the biceps. A vertex shared across the
  elbow now hands its share to its own side's bone between 2 and 5 cm from the elbow; nearer the joint the weights are
  as before (attachments on the epicondyles and the olecranon keep their bone).
- The linear blend of two frames bent 145 degrees apart pulls a vertex shared half and half most of the way to the
  joint's axis: the back of the elbow came to a pinched point of crumpled triangles. Shared vertices now turn about the
  elbow's axis by their share of the bend, for half of the difference (all of it swelled the back of the elbow into a ball).
- From 50 degrees of bend (full from 100) a vertex on the inner side that has crossed the plane halving the bend, from
  the forearm's side or the upper arm's, is put back on its own side, smoothly; vertices shared about evenly are moved
  less, so nothing tears. The forearm and the biceps then meet along that plane.
Measured within 15 cm of the elbow at the game's own full bend (shoulder 24 forward, 18 across, elbow 145): triangles turned
over 2477 to 1766, vertices across the halving plane on the inner side 5043 to 3944; for the long finger flexor,
brachioradialis and brachialis the deepest vertex of one side across that plane 13, 31 and 13 mm to 0 (a test keeps this).
The five muscles across the elbow that were skinned on the graphics card (brachialis and the triceps' heads) are now
skinned on the processor, as the forearm's muscles already were, so the rules reach them.

**S with the arm across the chest.** The arm may cross the chest only as far as it is raised, and the upper arm's own turn
was not one of the joints the keys' solve moves, so bending the elbow swung the forearm out sideways (the hand ended
56 degrees off its line, offline; in the browser the forearm lay out to the right). Now the keys' solve may also turn the
upper arm about its length (`LIMB_CHAIN.rightArm.spin` in `ns-grasp.mjs`), and only there: round a bent elbow (from 20 to
70 degrees of bend), with the hand's place in across the body from the elbow, and only for a step that pushes the
shoulder's raise or sideways swing past what the range or the combined-range rule gives. Everywhere else W and S turn
nothing (the user, Message 186: "they're not rotating internally or externally while moving"); from the start position S
still folds the arm with the upper arm's turn untouched. Across the chest S now brings the hand in to 14 cm of the
shoulder, 12 degrees off its line (offline), turning the upper arm inward to between -35 and -55 (in the browser,
held or tapped; a person turns the upper arm inward to bring the hand to the other shoulder). **How the turn is shared with the limb turn:** the double tap of Space still sets the
upper arm's turn to its two ends (35 out, 15 in); the keys turn it on from wherever it is when the hand has to reach in
across the body, and the next limb turn starts from wherever the keys left it.

**The right wrist.** A press on the right hand and a drag now bends the wrist: up toward the palm (to 80), down back (to
70), left and right sideways (radial 20, ulnar 30). The hand is told from the forearm by the part pressed, or, where a
forearm muscle's tendon lies over the hand, by the pressed point lying beyond the wrist. A press on the forearm still
bends the elbow and turns the forearm. The Esc page says so in one sentence. Before, the wrist moved only with a motor
area, whose movement returns (section 177), and the same press on the hand bent the elbow.

**Checked.** 487 unit tests (new: the elbow's skin rules on three muscles; S across the chest with and without the turn;
S from the start turns nothing; a straight arm swung across is never turned). `?case=boot` ok. All 13 browser tests but
`browser-outside-compass` pass. Frame table 60.1 / 60.2 / 60.0 / 60.0 and 60.0 / 60.3 / 59.6 / 60.0 against the lead's
60.1 / 60.0 / 59.5 / 60.0 in turn; during the limb turn the skin's time per frame is 1.8 ms against 1.4.

**Not done, or not right.**
- In the browser the mirror body's folded elbow still shows a ragged edge on its inner, near side, where the forearm's
  flexors start on the humerus (the picture improves only a little); offline the elbow's tip and crease are clearly
  cleaner. Triangles still turn over in the crease (1766 in the count above); a real fix needs better weights or a
  smoothing of the posed surface, both tried and rejected here (sharper weights tore edges; smoothing broke on the
  atlas's unwelded seams).
- With the keys and the look the right arm still goes only 34 degrees behind the trunk's line (60 ordinary) and 17 behind
  the side line at shoulder height: the look cannot aim behind the shoulder and no key swings the arm back. The upper
  arm's drag reaches the whole 60.
- The upper arm's outward turn past 35 degrees is reached only by a drag on the right upper arm; the left arm's upper arm
  turns only with the limb turn (50 of the ordinary 160 degrees), and the left wrist still has no control.
- The limb turn's inward end stays 15 degrees (the user found more inward turn overdone, Message 160).

## 184. Switching movements on: only what you look at or click, and the movement you started (21 November)

The user: "when you tap any area of the brain, you activate any area, it will contract, then return to its previous
place. But in returning to its previous place, you won't see corresponding activity and muscle activation. It will just
return." (Message 206) and "make sure there's clear movement for each brain activation area. And you can clearly
identify what type of movement it is for each area." (204). A browser hunt of Body update 62, each fault reproduced by
a second player, found eight places where switching movements on did not keep to that (H1 to H8). Each was reproduced
on this branch first with the hunt's own scenario, fixed, and shown fixed with the same scenario.

**While a movement carries the view, the look stays on the area that started it** (H1, H7; `CARRIED_LOOK`,
`carriedLookStep` and stepFrame's `heldGaze` in `ns-app.mjs`). A neck or trunk movement from the brain moves the view:
the eye rides on the head as the trunk bends and turns, and the eye view swings with a neck movement (section 171). The
crosshair then slid over things the player never aimed at. During "Bend head forward" it lay on the brain's lower arrow,
and a second click turned the whole brain 15 degrees for good (every later look then landed one area off). During "Lean
back" it slid onto the trunk area's other spot, so the tip said "Bend to the right" while the card listed the lean-back
muscles, and three clicks 0.5 s apart started three different movements (lean back, bend to the right, turn the right
arm outward). Now, from the first frame of such a movement until it has returned and the view is the pointer's again,
and as long as the player leaves the look where it was:
- the look keeps naming the area and spot that started the movement: the tip and the card name the movement running;
- a click repeats that movement, and taps no muscle and takes no limb that the moving view brought under the crosshair;
- an arrow tip of the brain or the mirror body under the crosshair takes no hover and no press (also for the rest of a
  neck swing after the player has moved the look).
A look movement of the player's own, or an arrow key's step, ends the hold for the rest of that movement: the look is
the player's again, as before. Nothing new switches on during the hold.

**The neck's view dips once, without a flicker** (H1; `neckViewStep`'s `peak` and `smoothS`). "Bend head forward" has
only 10 degrees of room in the bowed start posture, so its jerk took the neck to its end in one frame, the end's stop
threw it back almost to the start, and it slammed in again: the view, which followed the neck exactly, went to its whole
15-degree dip for one frame, back up for about 100 ms, and down again. While the neck contracts the view now keeps the
furthest the neck has gone, and it eases onto its offset over 0.05 s: measured in the browser, 0, -7, -11, -13, -14, -15
degrees over the first frames, held through the contraction, then back with the return. The drawn head still shows the
jerk.

**Choosing a limb switches nothing on** (H2; `gameLookSeq` / `lookByGame`). Key 2 or 3 or a double click turns the view
just far enough to bring the chosen limb's end into the picture (section 144). Looking at the strip, that turn slid the
crosshair down it, and the area it came to rest on switched on as if looked at: key 2 on "Left ankle" made the trunk lean
back, the double click bent the left elbow. A frame on which the game turned the view by itself (to a newly chosen limb,
or after a limb the keys move) while the player left the look alone now records what is under the crosshair silently,
as a change of view does. In the browser: the turn still ends on "Left elbow", and nothing is lit and nothing moves.

**An arrow key's step lights only its area** (H3; `feedHeadMove`'s `byGame`). The step turns the look about 4.6 degrees
in one frame, and the glow of the player's own movement (section 82) read that as a fast turn of the head and a fast
swing of the left arm: a neck area went nearly white and the mirror body's left shoulder blue for 0.05 to 0.2 s at every
press (0.2 to 0.55 on every step of a 13-step walk). A step, and a turn the game makes by itself, now feed no glow of
their own. On the same walk the other areas now stay at the look's own resting neck level (at most 0.06). A real look
movement of the mouse still lights the head and the shoulder as before.

**No beam after a contraction** (H4). The look's soft link to the muscles of the area it rests on was made on 18
November, when a look only armed an area (`LOOK_ARMS`). Since a look switches the area on, that link took over the moment
the contraction's own light ended, because the look still rested there: the same cone of light to the same muscles,
about as visible as the contraction's, through the whole return and for as long as the look stayed. With the look
switching areas on, an area's link is now its contraction's alone (`LOOK_ARMS.on` gates the soft link); the reverse link
from a muscle under the crosshair stays. In the browser: links and beams 0 from the first frame of the return and at
rest 6 s later, for the throat and the left forearm's turn.

**No long frame as a trunk movement ends** (H5; `treeRaycast` in `ns-scene-three.mjs`). A trunk movement rewrites the
processor copies of many body muscles; 150 ms after the last rewrite the next crosshair pick rebuilt the box tree of
every rewritten mesh at once, before even testing whether the ray came near it (88 % of a 100 to 117 ms frame). A mesh
whose tree exists but is out of date is now picked on its live vertices with the same exact test used while it is being
rewritten, and its tree is rebuilt a few per frame (`stepPickTrees`). Measured with a frame timer only, both trunk areas,
three clicks each, this branch and the lead in turns on a busy machine: worst frame 33.4 to 50 ms here, 100 to 116.8 ms
on the lead; the count of 33 ms frames per click is the same (5 to 8).

**The first arrow key goes its own way** (H6; `areaStepStartId`). With the look on no area, the walk started from the
area nearest the crosshair whichever key was pressed; from the start view that was the throat area at the lower left, so
the right arrow turned the view to the left. It now starts from the nearest area on the key's side of the crosshair
(the nearest of all only when none lies on that side): from the start view the right key goes to the lower-right throat
area, the left key to the lower-left one. Two of the other maintainer's browser tests stepped with the right key to
reach the lower-left area; they are restated with dated notes (`browser-keyboard-aim`, `browser-punch-in`).

**The left wrist bends sideways** (H8; `wrist_dev` in `ns-rig.mjs`). The "Bend left wrist toward the thumb" and "...
toward the little finger" spots lit their area and muscles and moved nothing (section 177 listed it): the game arm's
hand had one wrist axis. It now has the second: the hand turns at the wrist about the axis across the palm, after the
flexion, to the commonly cited ends of 20 degrees toward the thumb and 30 toward the little finger (as the right wrist,
Messages 14 and 15), contracts and returns like every other movement, and the mirror body's hand follows. The words on
the card, the tip and the map say so; the "already there" dimming of these two spots and three unit tests that pinned
"moves nothing" are restated.

**Checked.** 491 unit tests (new: `tests/switch-on.test.mjs`: the neck view's dip on the slam-rebound-slam the hunt
recorded, the hold's rules, the first arrow's side, the wrist's sideways bend on the placeholder rig and in the activity).
`?case=boot` ok. All 13 browser tests but `browser-outside-compass` pass. Frame table, this branch and the lead in turns
on a shared machine: 59.8 / 59.4 / 59.4 / 59.9 and 60.1 / 59.4 / 58.1 / 59.8 against the lead's 60.0 / 59.4 / 60.1 /
60.0 (the lead's other runs in the same hour 52-60 in the moving cases). These are rules of this game's display; nothing
in them is measured.

**Not done, or not right.**
- While the look is held, the tip by the crosshair names the movement running although the crosshair drawn in the
  swung or carried picture is over something else for that moment; that is the choice made here (the tip names what a
  click does).
- After choosing a limb the crosshair rests, unlit, on whatever area the turn ended on; a small look movement inside that
  area starts nothing (section 177's rule): the player looks off and back, or clicks.
- From the start view the right key now lands on the lower-right throat area, which is the right end of the walk: a
  second right press goes on to the lower in-between area and then stops; the walk runs left from there.
- The left wrist's sideways bend is not part of the arm's hand-fit envelope (`ENVELOPE_GRID`, which keeps the hand in
  the picture); it was not checked whether the hand can leave the picture during the 0.4 s contraction at looks where
  the hand already sits at the picture's edge. Seen in the browser only at the start look, where it bends and comes back.
- A trunk area clicked while its movement is under way repeats the movement, also when the player meant to click the
  other spot the crosshair was drawn on; moving the look first gives the old behaviour.

## 185. The limb keys never whip or spin the view; no pair of keys and no brush with your chest leaves a limb stuck; a push stops when the pusher stops (21 November)

The user: "The limb should never get stuck" (Message 207); "Let's get rid of all zoom and punch-in effects" (197); the
view shifts "so that those [limbs] ... stay within the frame" (167) without the three-quarter height (190); a limb that
collides "will push them out of the way rather than going through them" (174). Five faults from the browser hunt of
update 62 (H9 to H12, H24), each reproduced on this branch first with the hunt's own scenario.

**The view's follow while the keys move a limb** (`followTurnStep`, `keepOutBy`; `LIMB_KEYS.view` `followFrom`,
`followMinGain`, `followMaxDegS`, `keepBox`, `keepFree`). The follow worked out its turn as if the camera turned where it
stands. The eye view's camera stands half a metre behind the eye and turns about the eye (section 140's stand-off), so for
a hand near your own head a turn moves it in the picture by a quarter of what was asked, or the wrong way. Below the eye
the eased follow kept asking: with the right arm drawn in and swung out, D alone took the look from 25 to 70 degrees down
and the camera 44 cm up over your head, the brain gone (H9). Behind the eye a turn toward the hand pushed it further out:
with the right arm raised overhead and the look to the left, D spun the view 120 degrees round to face behind you, an
empty dark room (H24). With the hand left out of the picture by a look straight up, one W swung the view 80 degrees in a
third of a second and the camera 58 cm (H9). Now:
- only a wrist or ankle that is in the picture (or just past its edge, `followFrom` 1.1 of the half width and height, in
  front of the camera) is kept there. One the player's own look has left outside is not fetched: the view stays where the
  player put it, as the player guide says ("it turns only when the hand or foot would leave the picture");
- each turn is measured from where the camera really stands: a trial look on each axis, the frame's own camera turned to it
  and moved as the stand-off moves (`NC.eyeDolly`). An axis on which the end moves less than `followMinGain` (0.35) of the
  turn, or the wrong way, does not turn at all (the end may then reach the edge of the picture or leave it);
- the follow turns at most `followMaxDegS` (75) degrees a second, eased as before;
- a turn of the follow never takes the brain's middle or the mirror body's middle out of `keepBox` (0.85) of the picture's
  half width and height, nor further out than it is; an item already well out (`keepFree`) binds nothing. Where the end and
  these cannot all be kept, the brain and the mirror body win.
- the frame after a follow turn records the area under the crosshair silently, as a neck movement's swing does: an
  automatic turn is not the player's look. (In the one case tried, the follow sweeping the crosshair 40 degrees across the
  strip, nothing was switched on in the lead build either.)
The look still carries the chosen limb, the camera still steps aside from a raised arm (section 166), and nothing zooms.

**Two keys at once at one key's end** (H10). With the right arm at the end of its D swing, S + D moved the hand 0 to 4 mm
in 2 s although S alone drew it in at once; the same with S + A at the A end. The pair asks for the sum of the two keys'
ways; the swing being at its end, the joints can only go the reach's way, and that move is more than `keyFarDeg` off the
sum, so the frame waited (`offWay`) on every frame. Now a pair that waits tries each key's own way, the reach (W / S)
first, then the swing (A / D), each with the same cut as a single key (`keyTake` inside `stepLimbHold`; the reach or swing
taken is in `qa().limbs.lastSolve.dbg.pair`).

**A hand against your chest** (H11; in about one run in sixteen of the hunt's steps). The right arm folded and swung
across the chest by A could end with its hand 3 mm inside the trunk's keep-out. W's step out along the limb's line went a
little deeper (the line grazes the chest) and was refused on every frame; the place then stayed where the swing had left
it, 22 mm off the hand, the keys' line latched onto it, and W, S and A moved nothing (only D did). Now a refused step that
grazes the body slides over its surface (`keepOutSlide`: the step taken out to the keep-out's surface, as the look's carry
already was, when what is left still goes the step's way within `keyOffDeg`); a step straight into the body still moves
nothing (the hand stops at the body); and a refused frame puts the place on the hand itself, so the keys' line starts
from where the hand is.

**A push that goes on after the pusher has stopped** (H12; `stepLimbPush`, `pushApproach`, `pushGivesWay`;
`LIMB_PUSH` `approachM`, `giveOffDeg`, `giveShare`). The left leg held D against the bent right leg at the end of its range;
for the 1.3 s the key stayed down after the left leg had stopped, the right leg rose from 70 to 110 degrees at the hip,
its foot 37 cm, knee to chest. Three faults: the mover counted as moving when its end moved 0.4 mm, and a key held at a
range end jitters it by about a millimetre a frame; after a push the overlap left was stored as the overlap less the step
whether or not the push had removed any of it, so the same overlap read as grown on the next frame and was pushed again;
and the pushed leg, already at its sideways end, gave way upward. Now only the mover's own approach is pushed away (its
point of contact must come at least `approachM`, 1 mm, nearer the other limb that frame, and no more than that is pushed),
and a pushed limb gives way only along the push (its end within `giveOffDeg`, 50 degrees, of the push and at least
`giveShare`, 0.3, of it); otherwise it is passed through, as a limb that cannot give way at all already was.

**Measured** (1600 by 900, the hunt's scenarios on this branch; before = this branch before the change):
- H9, the look straight up and W: before, the look swung from 88 up to 14 up and 81 to the right, 49 degrees in 200 ms,
  the camera 586 mm; after, the view does not move (the hand moves 10 mm out of the picture, as it was).
- H9, S, A, D, then W + A from the start: before, D took the look from -25.5 to -69.6 degrees, W + A swung it to 113 to the
  right; after, the look stays at -25.5 (the pitch's measured share 0.14 to 0.19: 'weak'), the hand ends 8 % up from the
  picture's bottom after D, and W + A takes it out of the top right; the brain and the mirror body stay.
- H24: before, yaw 59 to 184 and pitch to -76, a dark room; after, the view stays at 61 / -31, the brain at the right edge.
- The follow where it should act: the right arm's D from the start turns the view 27 degrees right (the brain's middle at
  0.51 of the half width); after a look up, D turns it until the brain's middle reaches 0.84 and stops there.
- The left arm drawn in and swung across (D, W, S, A): before (the lead build) the look went to -56 degrees; after, -25.5.
- H10: S + D from the D end 3 mm before, 491 mm in 2 s after; S + A from the A end 0 mm before, 571 mm after.
- H11: an offline copy of the hold's key rules on the game's own body (S 3 s, A 2 to 3.4 s, then each key 1.2 s, at 60, 50
  and 40 frames a second) left W, S and A dead in 28 of 42 runs before and none after; there W slides out over the chest
  on its first frames and moves 482 to 489 mm. In the browser the stuck runs are rare (the hunt: 4 of 64): in 12 runs of
  the hunt's scenario on the lead build none stuck today; in 18 on this branch none stuck, and in 6 of them W slid over
  the chest on one or two frames and then moved 484 to 490 mm.
- H12: after, the right leg goes from 71 / 26 to 74 / 31 (hip flexion / sideways) while the left leg comes on, and does not
  move again once it stops; a right leg at its sideways end (45) is passed through, where before it was pushed 6 degrees
  further up. The steps that build the hunt's pose also changed: before, the right leg's A had already pushed the left
  leg to its sideways end and back to -30 degrees at the hip by the same fault.
- Section 178's sweeps, re-run: the eight trap poses 8 of 8 free; the look carrying each limb 420 px in eight directions
  and back 32 of 32; random play of each limb with two seeds, 679 steps, none stuck and none with fewer than two keys
  that move it.
- Frame rates while the keys move the right arm and the view follows: this branch 56 / 60 / 60, the lead 54 / 56 / 59.
  A first version that built the whole camera for each trial look ran at 40 / 48 / 49.

**Checked.** 495 unit tests (new: `tests/limb-follow.test.mjs` on a camera built like the eye view's: no fetch of a hand
out of the picture, a turn just far enough and never faster than `followMaxDegS`, no chase below or behind the eye, the
keep rule; `tests/limb-pair-push.test.mjs`: the pair at the D end on the game's own body, the slide, the push's approach
and give-way rules). `?case=boot` ok. All 13 browser tests but `browser-outside-compass` pass. Frame table 60.0 / 58.6 /
60.2 / 59.9 and 60.0 / 59.2 / 60.1 / 60.0 against the lead's 60.1 / 58.0 / 56.1 / 57.8 between them (other browsers were
running on the machine). Under reduced motion the follow skips its ease but keeps its speed limit, so a large catch-up
is never one jump.

**Not done, or not right.**
- A hand that the follow cannot keep (near your head, where a turn hardly moves it) may now sit at the edge of the picture
  or leave it while the keys move it; before, the view chased it. Bringing it back is the player's look.
- A hand the player's look has left outside the picture is not brought back by the keys (the hunt's H24 asked that the
  hand stay in the picture; there it was already outside, behind the camera).
- The turn to a newly chosen limb (`stepLimbView`, 1 to 4 and the double click) still works out its turn as a camera that
  turns in place; it is the activation package's ground this round (H2). `followTurnStep` could serve it too.
- H9's side effect, the left shoulder's area and muscles shown blue while only the right arm moves, was not traced: it shows
  as the view turns (also on the lead build, with no movement switched on) and looks like the crosshair's own mark.
- With the right arm in the hunt's pose across the chest, W may still wait 0.1 to 0.2 s before it moves (the arm's own end
  check, a millimetre deeper); A there still moves nothing (it would push the hand into the chest), D and W do.
- At a range end with a key held a leg still creeps a few degrees in its other joint (the left leg 3 degrees of hip flexion
  in 1.4 s at its inward end): the keys' rule takes a move under a twentieth of the keys' way whatever its direction.

## 186. Words, labels, cards and the tutorial: each says what is there, where it is drawn (21 November)

Faults from the browser hunt of Body update 62 (H13, H15 to H23), each reproduced by a second agent, reproduced again on
this branch first, and shown fixed with the same scenario and pictures. Nothing here changes a control.

**The strip's labels keep off the limb buttons** (H13, H23). With the look 16 to 20 degrees up the strip lies at the foot
of the picture, and its labels were placed under the "1 Left arm ... 4 Right arm" bar: cut through by its edge, or lost
behind its chips. The bar (a child of the HUD beside the cards, not a card) was never among the things the labels keep
clear of; now it is, as drawn (`readHudRectsNow`; for the labels only, so the arrows keep their places). Swept from the
start look to 27 degrees up at 1600 by 900 and 1280 by 720: no label touches the bar; at 18 degrees up "Left leg" and
"Right leg" stand just above it beside their blocks.

**A label names the area it sits on** (H17). At 800 by 600 "Left leg" and "Right leg" lay squarely on the blue and orange
arm areas, 22 px from the arm areas' anchors and 113 px from their own; after a resize the two "Belly and back" did the
same. Two causes. The arm labels' boxes were reckoned with their second line ("brain's right half"), which the short and
the off reading levels do not draw: 124 by 38 px for a label drawn 96 by 26, too wide for the room between the brain's
arrow and the mirror body, so they went out onto the face areas and the leg labels took the places left on the arm areas.
Their boxes now follow the reading level (the app root's `data-ns-read`), and the two-line box is as wide as drawn (it was
18 px too wide). And a label is no longer placed where another part's anchor is clearly nearer than its own: nearer than
three quarters of the way to its own (`LABEL_LAYOUT.ownArea`, `ownAreaRatio` 0.75, in `declutterLabels`; the twin on the
other half is the `side` rule's). The faults measured 0.19 (the leg labels above), 0.26 ("Belly and back"), 0.43 ("Right
arm" on the yellow leg block looking 15 degrees up at 1600 by 900) and 0.56 (the arm labels on the face areas); a leg
label just beside its own small block, a little nearer the big arm area's anchor (0.94), stays. The required left-arm
label goes there only when nothing else is left, faded. At 800 by 600 the arm labels now sit on their own areas at every
reading level; with the tutorial's line at the top the leg labels have no place by their blocks and are not shown (at the
full level, where that line gives way to the cards, they stand above their blocks). Counted over eight window sizes, the
three reading levels, the tutorial running and finished and six looks each (2 304 label places, `s-labstat.mjs` in the
package's work folder), lead and here: labels shown 708 and 646; clearly nearer another part's anchor (the rule above) 174
and 4 (the four: the required arm pair, faded, in one view, 390 by 844 looking down at the full level); nearer at all 212
and 73; faded 67 and 92 (a required arm-label pair with no clean place on its own areas is now drawn faded there, where the
lead drew it plainly on a neighbour's area).

**The left / right / back words are drawn where they were placed** (H19). Since the brain was turned half round (section
136) each word extends away from the brain the other way (`ORIENTATION_ALIGN`: "Brain's right half" to the left of its
anchor, "Back" upward), but the style sheet still drew them the old way round, so every word was drawn mirrored about its
anchor, beside the box that had been found clear: across the brain's turn arrows at 1600 by 900 and 1280 by 720, on the
colour key at 800 by 600, under the arm labels from outside. The HUD now sets each word's offset from the same table.
Drawn where they are tested, three more faults showed, now fixed: with the brain's front or back out of sight there was no
midline, and a side word with no free place on its own side slid across the middle onto the other one (a line halfway
between the two side anchors stands in); the words were never tested against each other; and in a small wide window the
colour key and the status card, which stand where section 165's stack puts them, were not among the places the words keep
off. Rested on 81 looks round each half's face areas at 800 by 600 with the full reading level: on the lead 40 looks put a
word on a card, the key or the other word; now none. There the side words are not shown (no free place on their own side);
"↑ Back" shows where it is clear.

**The brain's up arrow stays on its top side** (H15). Let go of the mirror body after lifting it over the brain, and the
arrows are planned again with it there: the brain's up arrow went 146 px down its centre line into the gap between the
halves, beside the crosshair and just above the mirror body's down arrow. That depth was allowed for the brain's BOTTOM
arrow, which goes up the strip's hollow (section 59); the top arrow now keeps the ordinary limit (`BRAIN_TIP_RULES`
`inwardMaxFracBy`), and with no place on its centre line it moves along the top side past the mirror body, to where it
stood before the carry. The arrows at the start look and from outside are unchanged (compared tip by tip with the lead at
eight window sizes and three outside views).

**Space on one of your limbs** (H16). Space there chooses the limb; nothing holds it. The grip card said "Nothing is held:
put the crosshair on the brain, the mirror body or one of your limbs, then press Space", which the player had just done.
It now says "Your right leg is chosen: W A S D and your look move it."

**The tutorial's first step on an area that moves nothing** (H18). At 800 by 600 the first area a look up reached was the
right half's Tongue, which has no movement in this body yet; the line stayed at "1/9 Look at a colour on the brain: a part
moves", the strict tutorial counted nothing that followed, and nothing said why. After an area that moved nothing (the
Tongue, a black in-between area, a turn the forearm has already made) the line says "Nothing moved: look at another
colour" until an area that moves is switched on. (A few words more, shown only then.)

**Under the Esc page** (H20, H21). The tutorial's line was hidden only by the game's own frame, which does not run while the
game is paused, so it stayed, cut by the Esc card's edge; it now hides when the game stops playing. In a wide window the
card ran to 16 px from the bottom and the "Simulated activity · experimental preview · notes and credits" line, which stands
above everything, lay across its Space key at 800 by 600; the card now ends above that line in every window shape.

**W, S, A and D in words** (H22). Message 186 and section 145: W and S move the hand or foot straight out along the limb and
back in, A and D swing the limb. The Esc page's Move rows said "move it forward or back" and "move it left or right", and the
full Controls rows "forward", "left/right" and "back/closer"; for a limb that points up or aside W does not move the hand
forward. They now say "reach it out or draw it in" and "swing it left or right", as the note under them did; the same in the
start page's short rows, the hint lines, the tutorial's W / S lines and the key card's titles ("Reach out", "Draw the hand
in"). Root's `browser-player-focus` test is restated for the Move rows.

Checked: the unit tests (new: `tests/hud-words.test.mjs`); `?case=boot`; the 13 browser tests (all but the outside
compass, which needs the publish tree); the hunt's own scenarios on this branch before and after; the label sweep looking up
at two window sizes; the overlay audit of section 165 (eight window sizes, three reading levels, the tutorial running and
finished, six looks each) on the lead and on this branch: overlaps 99 and 77, those with an orientation word 21 and 0, with
a strip label 14 and 6 (the six: a label touching a compass arrow, which the labels' layout gives way to, section 165); the
frame table, four runs each alternating with the lead on a shared, busy machine: no case slower beyond the runs' own spread
(this branch 47.8 to 60.1 frames a second, the lead 48.3 to 60.3).

Not done or not right:
- At 800 by 600 with the tutorial's line showing, the leg labels and "Belly and back" are not shown at the start look:
  there is no place by their blocks that is clear of the line, the mirror body and the arm labels.
- In the face views at 800 by 600 and from outside after R then E at 600 by 900, the side words ("Brain's right half",
  "Right half") are not shown: no clear place on their own side. Before they were shown, on the cards or each other.
- A label's area is judged by the label anchors, one point per part and half, with an allowance (0.75); a label beside the
  edge of a big area can still be left out though it would be right, and one within the allowance can sit on the edge of a
  neighbour. Fewer labels show (646 against 708 in the count above) and more required arm labels are faded (92 against 67):
  looking 15 degrees up at 1600 by 900 both arm labels are faded on their own areas (the lead: one faded, "Right arm" plain
  on the yellow leg block).
- The Tongue still moves nothing (the area has no movement in this body); only the tutorial says so. The key card's
  movement rows for W and S still describe the start pose ("The arm lifts forward (shoulder flexion)").
- `PLAYER-GUIDE.md` already says W reaches out and S draws in, but the Controls list of `PREVIEW-NOTES.html` still says
  "W/S move the left hand forward and back; A/D move it left and right" (the lead writes that page).

## 187. Five faults of the look: the brain's eyeballs in a roll, the pick tint, a rod in the right fist, a lit forearm, a black forearm (21 November)

A browser hunt of Body update 62 found these, each reproduced by a second agent (H14, H25 to H28); each was shown again on
this branch, fixed, and shown fixed with the same scenario. The owner's matte look, the group tones and the outlines
stay.

**The eyeballs stay on the brain while it rolls (H14).** During a quick circle roll an eyeball sank into the brain, and its
dark outline ring was drawn across the brain's surface. Two causes. The eyeballs' vertices were kept about each eye's
own centre (so it can turn with your look), but the living brain moves every vertex of the brain by a rule of its rest
position in the brain's own millimetres (`nsLiveMove`, the wobble and beat of section 89): an eyeball's vertices read as
points next to the atlas's origin, about 1.5 m from the brain, so the wobble of a quick roll threw them tens of
millimetres off the brain while the brain and the nerves moved a few (and every beat moved them about 4 mm). The
vertices are now in the brain's millimetres like every brain mesh, and the turn with your look is a matrix about the eye's
centre (`eyeTurnMatrix`); in the roll the moving and the held pictures agree. The second cause: the outline's picture of
the brain and its eyes (section 176) held no depth between the brain's surface and the eyes, so the line round an eyeball
behind the brain was drawn across it, in still views too. That picture now carries how near each is
(`patchCoverageNear`, 8 bits over the brain's size, about a millimetre a step): an eye's line is drawn only where the eye
is in front. Where an eyeball goes behind the brain, the brain's own line now crosses it (176 listed it as not drawn).

**The pick tint is faint (H25).** Message 177's whole-brain light in the picked area's colour (`BRAIN_PICK_TINT`, section
137) added 6 % of the area's saturated glow colour to the cortex. On the matte brain, pale and mostly in shade, that
turned the cortex lilac on a violet area and grey-blue on a cyan one: its hue (OKLCH) moved up to 20 degrees where the
brain faced the light and 15 to 150 in deep shade. It is now a gain on the cortex's own colour (`BRAIN_PICK_LOOK`, `brainPickGainInto` in
`ns-brain-ink.mjs`), the same in light and shade: a little lighter (it lights up), a faint cast toward the area's own hue,
and never greyer than 0.85 of the cortex's own colour. The change is a fifth or less of the old one in shade, and the hue
moves at most 12 degrees anywhere. Across a muscle of your own body (the reverse link) a patch of the brain went from 104, 77, 77 to
116, 81, 99 before and goes to 113, 82, 86 now; on the cyan thumb area the brain stays pink.

**No rod out of the right fist (H26).** The thin grey rod at the curled right hand's thumb was the extensor indicis: its
tendon runs into the index finger's extensor expansion over the middle and distal phalanges, but its skin candidates
ended at the proximal phalanx (its hint), so in a fist that part stood straight out of the knuckle, up to 54 mm off the
finger. The extensor indicis and the extensor digiti minimi now take their finger's middle and distal phalanges as
candidates (`EXPANSION_RE` in `ns-body.mjs`; the little finger's extensor does not reach past its first phalanx, so only
the index changes); the rig file is rebuilt. In a fist its tendon now lies on the finger like the extensor digitorum beside
it.

**A lit limb stays rose red (H27).** During a Space grip (and while a limb key moves a limb) the control mark of section
139 (`PART_GLOW`) added the mark's warm yellow as light and as a broad rim; on the darkest rose tones, the forearm's
flexors, that read as a flat tan or khaki, another material. In the raw look a marked muscle now glows in its own hue:
the light added is its own colour at full brightness with 15 % of the mark's yellow, and the rim keeps more of the
yellow, narrower (`PART_GLOW_RAW`). A gripping forearm measured 116, 75, 59 (hue 17) and now 115, 38, 42 (hue 357)
against 90, 18, 28 at rest: lit rose muscle, with the hand areas' own cyan and yellow on the finger benders as before.
The comic look keeps the old mark.

**No black forearm in shadow (H28).** Section 168 listed it: the raw light's deepest shade, a quarter of the colour (0.15
on a back face), left the darkest rose tones at 10 to 27 red, darker than the room. A muscle's shade is now kept, with a
soft knee, from taking its colour under a small brightness (`RAW_LOOK.muscleFloor`, about 53, 13, 14 on the darkest
tone, twice the room's light); the colour is only scaled, so the hue stays, and what faces the light is not changed. The
lighter tones are hardly touched (the reference rose at the ambient shade 45 to 51 red). The raised right forearm's
darkest points went from 27, 4, 5 to 53, 13, 14. Muscles only: the brain, the bones, the strip's black abyss and the
room have no floor.

**Checked.** 498 unit tests (eleven new, `tests/look-fixes-r26.test.mjs`). `?case=boot` ok. The 13 browser tests other than
`browser-outside-compass` pass; `browser-punch-in` failed twice in ten runs on this branch, both while the machine's load
was 27 to 29 (its movement had ended when the test read it), and passed the other eight; the lead passed six of six, three
of them at that load. The eyes' fix was also looked at with the OpenGL back end. Frame table (frames a second, still /
looking round / up and down / the limb turn, runs taken in turn with the lead's on a busy machine): this branch 60.0 /
58.5 / 59.1 / 55.9, 60.0 / 58.9 / 60.0 / 59.9, 60.0 / 58.8 / 60.2 / 59.9, 60.1 / 59.2 / 60.1 / 60.0; the lead 60.1 / 59.5 /
60.2 / 60.0, 60.0 / 59.2 / 57.8 / 44.4, 60.1 / 59.1 / 60.1 / 59.9, 60.0 / 59.6 / 35.5 / 43.0. The time the script spends
drawing a still frame measured 2.9 to 5.1 ms here against 2.9 to 3.3 on the lead: a small cost cannot be told from the
noise of the other browsers running at the time.

**Not done, or not right.**
- The pick tint is faint by design: side by side it shows, at a glance it may not. If it should show more, raise
  `BRAIN_PICK_LOOK.lift` (the lighting up) before the cast.
- In the deepest shade every dark muscle group now meets at the same dark red, so the groups differ there by little.
- The eyeball's own turn with your look also turns the small move the brain's wobble gives it (a few millimetres at
  most, at the eyes' largest turn); not seen.
- The extensor indicis' entry in the fallback blends for meshes not yet loaded (`REFERENCE_MUSCLE_BLENDS`) is the old
  one; nothing uses it while the source meshes are there.

## 188. Touching muscles told apart on the screen, in light and in shade (21 November)

The owner, Message 195: "The new look aesthetic you've provided in the recent most images is good. Apply it. But you
need more clear contrast and differentiation between muscle groups." Message 202: "each muscle group, bundle, spindle,
fiber, whatever you want to call it, activation group, should have its own sort of shading system, such that muscles
next to each other can be obviously told apart, and you don't mix them up as one amorphous group." Section 168 gave each
group a tone and each muscle one of three lightness steps; sections 176 and 187 left two things open: clusters of four
or more touching muscles, and the deepest shade, where every dark group met at the same dark red. The work was done in
two parts on the same day; the second measured the first again with its own views and went on from what was left.

**Measured first, on the screen.** A check reads the colours DRAWN on both sides of every visible contact between two
muscles (a QA probe, `globalThis.__nsShadeProbe`: for one frame the canvas and the outline pass's picture of which mesh
is drawn where, `shadeProbe` in `ns-scene-three.mjs`, `qaIdPicture` in `ns-outline.mjs`; nothing runs without the flag).
For every screen boundary between two muscles of one body the colour is taken 3 to 5 CSS px inside each side, past the
ink line, so the line between them is not counted; the two are compared as an OKLab distance, and each pair of muscles
gets the median over its boundary. A pair under 0.03 is drawn nearly equal (a fault), under 0.06 weak. Seventeen views a
player meets are measured at 1600 by 900, the full picture: the start view and looks down, left and right; the view from
outside; the mirror body held near, turned twice and tilted; the right arm raised by its keys, in shadow and looked up
at; the left arm reached out and swung; the left leg lifted and swung. Before this section, in those views: 2 469
contacts, 116 nearly equal, 483 weak; in the deepest shade nearly every dark group was one colour. The worst: the raised
right forearm's flexors in shadow (flexor carpi radialis against pronator teres 0.006, against palmaris longus 0.013),
the triceps' long and medial heads (0.018, both on the same step), pronator teres against flexor carpi radialis (0.02:
the darkest tone's lower step was cut short by the clamp at 0.35), the pectoral's parts and the serratus (0.015 to
0.03), the quadriceps' heads and the sartorius (0.025 to 0.04), and pairs that never touch at rest but lie side by side
on the screen (the arm on the chest or on the hip, the calf over the thigh in the start view).

**A second step, at the same lightness.** Each muscle takes, besides its lightness step, a warm step (`MUSCLE_STEP.warm`
in `ns-colors.mjs`): a fuller rose (chroma x 1.4) or a quieter one (chroma x 0.7, hue 4 degrees toward crimson; on the
two darkest tones x 0.75 and 8 degrees, because a quieter dark red reads brown), its lightness kept. The groups are told
apart by lightness (section 168) and the warm step leaves it, so a muscle never takes another group's colour; every
muscle colour stays in the one rose red, hue 10 to 28 degrees and chroma 0.08 to 0.19 (OKLCH). The steps are given out
like the colours of a map (`assignMuscleSteps`), as pairs: touching muscles of one group must be 0.10 apart in the whole
colour drawn (`drawnMuscleLab`), muscles of two groups 0.15 apart in lightness, as before, and 0.10 in the whole colour.
The darkest tone's lower step is whole again (`minL` 0.35 -> 0.33). Tried and dropped, each drawn and looked at: a turn
of hue of 8 degrees with the chroma (muscles read orange and pink, the candy code of section 168); a quieter step of x
0.65 on every tone (the chest read grey-brown); a fuller second step (x 1.8: fire-engine red). A fibre texture or a
pattern per muscle was not tried in the game: the clusters that failed are parallel-fibred (the forearm's flexors, the
triceps, the quadriceps), so a texture along the fibres would not part them, and a striped or smooth pattern is the
"rough or patchy" surface of Message 184.

**The muscles seen side by side count too.** The steps were given out only from the muscles that touch in the drawn
start posture (shared cells of the meshes). A table of the pairs the game's own pictures show side by side, from the
seventeen views, counts as contacts as well (`MUSCLE_SEEN_CONTACTS`, `seenContactMap` in the new `ns-muscle-seen.mjs`:
323 pairs, 163 of them not among the touching pairs). `tests/browser-muscle-shades.mjs` with `NS_SEEN_OUT=<file>` visits
the views again and writes the table; a pair seen once is kept when the table is written again; after a change to the
body it should be written again.

**The steps survive the shade.** Section 187's floor kept a muscle's shade from taking its colour under one luminance,
so every dark muscle in the deepest shade met at the same dark red (the raised forearm's flexors 0.007 to 0.013 apart).
The floor now keeps the colours' ratios (`RAW_LOOK.muscleFloorKeep` 1, `muscleFloorRef` in `ns-raw-look.mjs`): it is one
floor on the shade for every muscle, the old floor of the darkest tone over that tone's luminance, so the darkest tone
in its deepest shade is exactly as in section 187 (about RGB 53, 13, 14) and every other muscle keeps its step there.
The cost, not small (an earlier version of this section called it a little lighter): the shade never goes under about
0.16 of the colour, so the deepest shade of every colour lighter than the darkest tone is lifted about twice in the
screen's numbers. Where the surface turns fully away from the light: the reference rose 51, 19, 18 -> 87, 37, 35, the
pale tone 59, 31, 30 -> 110, 63, 61, the tendon white 53, 54, 55 -> 101, 103, 104 (2.9, 3.6 and 3.7 times the light; on
a back face more). The shaded side of the light groups is that much flatter. The darkest tone's lower step goes the
other way, 58, 6, 14 -> 41, 3, 7. `muscleFloorRef` stays 0.0621: a lower one lifts every muscle further (0.031: the rose
121, 54, 51) and flattens the shading of all of them. The lit side and the room are not changed. In the shader the floor
is now a constant (a division less per muscle fragment).

**After the first part** (the second part's own measurement of it, the same seventeen views): 2 444 contacts, 29 nearly
equal (116 before), 231 weak (483). The contacts in shade before, matched pair by pair: 550, of them nearly equal 54 ->
5 and weak 152 -> 70. The first part's own table, from its timed views, read 2 472 -> 2 451 contacts, 118 -> 25 and 495
-> 256: confirmed. From the pictures (the whole body from the start view, the mirror body held near, the view from
outside, the raised right arm in shadow, before and after side by side): touching muscles were plainly parted, in light
and in shade, but two things were not right. The largest muscles had taken the quieter step (the chest's sternocostal
part read a dusky wine-rose, the least rose of the colours, and so did two of the forearm's flexors), and 71 of the 164
muscles had taken the fuller one, which was nearly free.

**Why 29 were left: the light (second part).** The probe now also records the light on each side of every contact (the
shade factor: the drawn luminance over the muscle's resting colour's). Between the two sides of a contact the one light
differs by a factor of 1.6 at the median (2.4 at the 75 % mark, 3.6 at 90 %), and a lightness step of 0.08 is cancelled
by a factor of about 1.45. So where the muscle with the lighter step is the less lit one, the step is gone on the
screen: flexor carpi radialis (light 0.84) against flexor digitorum superficialis (one step lighter, light 0.55) was
0.014 to 0.026 along 7 to 93 px in six views; 16 of the 28 worst contacts had the same warm step on both sides.

**The steps follow the light the pictures show** (`MUSCLE_STEP.light` { goal 0.09, weight 8 } in `ns-colors.mjs`;
`seenLightMap` in `ns-muscle-seen.mjs`). Each pair of the table of seen pairs now also carries up to six samples of the
light on its two sides, [light on the first muscle, light on the second] in hundredths of the full light, one per view,
the longest contacts first, a view left out when its light is nearly that of one already kept (997 samples for 299
pairs; a sample over 1.1 is dropped: there the boundary lies on a muscle's white tendon end). `assignMuscleSteps` scores
a seen pair, besides the rules above, by the distance of its two colours AS DRAWN under each of those lights (colour x
light, which in OKLab is the colour's vector x the cube root of the light): the mean squared shortfall from
`light.goal`, x `light.weight`. So a lightness step goes the way the light goes, and where the light falls both ways (a
left and a right muscle share one colour, Message 15) the pair takes a warm step instead. Counted before it was built,
from the recorded lights (each probed contact's screen distance predicted for any choice of steps; the prediction's
error against the measured distances is 0.014 to 0.018 rms): with the lights 4 nearly equal and 103 weak where the first
part had 20 and 225; and held out, the lights taken from half of the views and the contacts counted in the other half,
four splits summed: 35 nearly equal and 319 weak against 40 and 450. So the lights help most in the views they come
from, which are the views a player sees first and most; what they do in other views was then measured on the screen
(below). Tried and dropped, each counted the same way: a term for the distance two colours keep when the light makes
their lightness equal (their chroma over their lightness: 19 to 26 nearly equal against 20, 218 to 279 weak against
225); a quieter step that costs more the more of a muscle is seen (more nearly equal contacts in the held-out views); no
quieter step on the dark tones (52 against 40 held out).

**Every warm step has a cost** (`MUSCLE_STEP.warm.cost` 1e-4 -> 0.03, `costLow` 0.01 -> 0.03). With the lights and the
old costs the body was drawn and looked at: 74 muscles on the fuller step, the chest crimson (RGB 141, 7, 30), the whole
body redder than the group tones the owner approved. Now a muscle takes a warm step only where a long contact needs it:
25 muscles the quieter one, 30 the fuller one, 109 of 164 their group's own colour (the first part: 28, 71 and 65). The
chest's sternocostal part was a rose red again (about RGB 169, 45, 43), not dusky (and see the check of the colours
below). Counted on both sets of recorded lights (4 890 contacts): 24 nearly equal and 302 weak, against 29 and 298 with
the fuller step free and 85 and 529 without the lights. The cost is paid in separation, and that is a choice of look,
not a limit: held out (the lights from half of the views, the contacts of the other half, four splits summed, about
9 800 contacts) the costs of the first part with the lights give 54 nearly equal and 604 weak with 115 muscles on a warm
step; 0.01 and 0.01 give 66 and 680 with 82 muscles; the 0.03 and 0.03 chosen give 84 and 732 with 55 muscles; no lights
145 and 1 024. Lower `warm.cost` and `warm.costLow` for more separation and a redder, duskier body.

**The optimiser works from tables.** Every contact's term for each pair of candidate colours (9 x 9) is worked out once,
and the search adds table entries; without lights the steps are those of before to the last muscle (compared on the
game's 164 muscles: with the table of seen pairs, without it, with lightness alone: no difference). In Node, on a busy
machine, 166 to 287 ms before and 35 to 100 ms after; in the game see "Checked".

**The check itself.** The first part's browser test failed in the last run of its author. Two causes, both seen again.
With the saved setting 'auto' the game lowers its picture when frames are slow, and on a busy machine it drew 1280 by
720 at the cheap level half-way through the test: the same view then measures differently from run to run (150 contacts
and none nearly equal in the start view at the full picture; 123 and 2 in a run that failed). And its views were reached
by timed holds; the frame step is capped at 0.1 s, so with slow frames a hold moves less, and one read of what the
crosshair is on can be a frame late (once the brain was taken instead of the mirror body). The test now fixes the full
picture (the saved setting 'high') and says what was drawn, and reaches every view by the game's own state: the
crosshair on the mirror body in two reads a few frames apart, the mirror body drawn in with S until its centre is 1.0 m
from the eye, a limb key held until the limb's end has gone a set way or stops. The second cause of the failure was in
the game: at the full picture the first part still had your own right flexor carpi radialis against flexor digitorum
superficialis at 0.019 along 33 px with the mirror body held near; the lights mended it (0.165 there now, and 0.10 to
0.18 in every view that shows the pair).

**After the second part.** The same seventeen views, nearly equal / weak, before -> first part -> second part: all views
116 / 483 -> 29 / 231 -> 18 / 150 of about 2 470 contacts; the start view 3 / 29 -> 0 / 17 -> 0 / 11; from outside 1 / 7
-> 0 / 1 -> 0 / 3; the mirror body held near 9 / 44 -> 2 / 16 -> 0 / 9, turned 13 / 45 -> 1 / 22 -> 1 / 12; the raised
right arm in shadow 16 / 41 -> 4 / 25 -> 2 / 11; the left leg lifted 7 / 30 -> 3 / 21 -> 2 / 11. The contacts in shade
before, matched pair by pair (about 550): nearly equal 54 -> 5 -> 6, weak 152 -> 70 -> 42. The muscle pixels at the
start view: hue 22.4 degrees on average with a spread of 4.1, chroma 0.100, before; 21.4, 3.6 and 0.108 after the first
part; 20.3, 3.7 and 0.106 now. Of the 18 left, 7 are not contacts of two colours at all: where the inner sheet of the
abdominal wall shows through the outer one in ragged patches (external against internal oblique, 0.004 to 0.02; six of
the seven, the seventh the same at the hip), the picture of which mesh is drawn says "internal" and the colour drawn is
the outer sheet's (the light there reads over 1.1); equal colours are the better picture there. The other 11 are
contacts where the light differs by a factor of two or more the wrong way in that one view (the lifted left thigh's
rectus femoris, fully lit, against the sartorius, one step lighter and less lit: 0.018 along 241 px; the chest against
the front of the deltoid with the arm reached out) or where both sides lie in the deepest shade (the raised arm's
brachialis against the short head of the biceps, 0.022). The activation flash, the lit white, the area colours, the
outlines and the used mark are not changed (a used muscle still loses only lightness, now from its own colour); a
display rule for teaching, nothing is measured.

**Two looks outside the table** (down to the left and down to the right at your own body, at angles the seventeen views
do not have; 299 contacts; measured on the lead's colours, the first part and the second): nearly equal 14 -> 7 -> 11,
weak 55 -> 36 -> 32; 5 or 6 of each count are the abdominal wall's sheets showing through. So outside its views the
second part is no better than the first in nearly equal contacts and a little better in weak ones, and one contact there
is its own doing: with the look down and to the left, your right forearm at the right of the picture, its flexor carpi
ulnaris against the flexor digitorum superficialis, 0.027 along 175 px. The seventeen views always show the two under
very different light (0.15 to 0.5 against 0.5 to 0.9), so the steps gave them nearly one colour (a warm step apart, 0.03
in equal light) and left the rest to the light; in this look the light on the two is nearly the same.

**Not relying on the light alone: built, measured, left off** (`MUSCLE_STEP.light.even` 0). With `even` a pair with
lights is also scored for the SAME light on both sides (its plain distance against `light.goal`, x `even`). With 2, on
the screen: the forearm contact above 0.047, the two looks outside the table 8 nearly equal and 33 weak; but the
seventeen views 21 nearly equal and 132 weak instead of 18 and 150, the contacts in shade 15 nearly equal instead of 6,
and the largest muscles took the fuller step again (the chest and the front of the thighs crimson, the body redder than
the group tones: drawn and looked at beside the other two). Which muscles take a warm step changes a good deal with
every such setting; the one kept is the one whose pictures are nearest the group tones. The better mend for the forearm
contact is more views in the table, those two looks among them.

**Against the abyss of section 190.** The same afternoon the background became an abyss: the room (floor, pool of light,
wall, lamps, shadows) is no longer drawn, and the background is one black of RGB 2, 2, 2 (`ROOM.abyss.black` in
`ns-room.mjs`) with a faint light round the brain and the bodies. `RAW_LOOK.room` and the muscles' floor are not changed
by it. (A first check here set the abyss's draft numbers on `RAW_LOOK.room` in a copy; section 190 did not land that
way, so this was measured again on what landed: a copy of this branch with section 190's changes to `scene/` applied;
nothing of them is in this change.) The raised right arm in shadow, two runs in the abyss: 167 and 159 contacts, 3 and 2
nearly equal, 11 and 13 weak, in shade 3 of 59 and 4 of 55 nearly equal; in the present room, three runs: 169, 158 and
162 contacts, 2, 2 and 1 nearly equal, 11, 14 and 11 weak, in shade 4 of 59, 0 of 52 and 3 of 56: the same within what
one run differs from the next. The start view and the view from outside measure the same in both (150 contacts, none
nearly equal, 11 weak; 68, none, 4). The muscles' edges against the background, about 2 900 samples (the colour 3 to 5
CSS px inside the muscle against the background 5 to 7 px outside): in the abyss an OKLab distance of 0.30 and 0.34 at
the median, 0.13 at the 5 % mark, 0.08 at the 1 % mark, 2 and 0 samples under 0.03, the background beside the arm about
grey 5; in the present room 0.22 and 0.24, 0.06 and 0.07, 0.055, 1 and 3, the room about grey 22. So in the abyss the
shaded muscles stay apart from each other as in the room and stand off the background better. The darkest muscles: the
first part's floor keeps the ratios with the darkest TONE as its reference, so that tone's LOWER step in its deepest
shade is about RGB 41, 3, 7, half the luminance of section 187's floor (53, 13, 14). In the room (13 to 22 grey) it was
level with the background in luminance and told apart by its red and its ink line; in the abyss it is far above the
black. The darkest twentieth of the muscle pixels of the arm in shadow (its darkest hundredth is mostly ink line): 36,
7, 11 in the room and 35, 6, 11 in the abyss with these colours, 49, 8, 13 with the lead's in the room (about half the
luminance; section 190 read 55, 6, 13 for the lead's colours by its own measure). The same view with the lead's colours:
162 contacts, 16 nearly equal, 43 weak, in shade 13 of 69.

**A check of the colours, and what changed (22 November).** An independent check, confirmed by a second reviewer, found
the quieter warm step breaking the owner's colour rule (rose red; no pink, grey or brown): the big pale muscles a pale
PINK (the rectus abdominis 246, 175, 172, where update 63 had 216, 120, 124; the tibialis anterior, the gracilis, the
short head of the biceps), the dark ones a dusty MAUVE that went grey-brown in shade (the clavicular and abdominal
pectoral and the palmaris longus 139, 75, 78, the pronator quadratus 105, 48, 55); and the fuller step drove the dark
tones to the screen's limit, a blood crimson with the green channel at 0 to 8 (the flexor carpi radialis 141, 7, 30, the
sternocleidomastoid 175, 8, 45; Message 22 asks for 'clinical', not 'bloody'). Changed in `MUSCLE_STEP`
(`ns-colors.mjs`): a light colour's quieter step (`warm.lowLight` [-0.2, 0] above a drawn lightness of 0.64) loses less
chroma and its hue never goes under the rose's 22 degrees (`warm.lowLightHue`): the pale pink 246, 175, 172 becomes a
pale salmon 252, 172, 164, the 198, 131, 136 becomes 205, 128, 125. A dark colour's quieter step (`warm.lowDark` [-0.25,
-8] -> [-0.12, -6], `warm.lowFrom` now compared with the lightness drawn, 0.56) is a wine red: 139, 75, 78 -> 145, 70,
72, and the rose tones' darker step 152, 81, 87 -> 162, 73, 85. A fuller step stays under 0.85 of the most chroma the
screen shows at its lightness and hue (`gamut`; the group's own chroma is never lowered): 141, 7, 30 -> 134, 28, 37,
175, 8, 45 -> 166, 37, 53; on the darkest tone's lower step, where the screen has no room, the fuller step is the
group's own colour. And `sameGoal` 0.1 -> 0.12 (below). Counted first on the recorded light (two sets of probes of the
seventeen views and the looks outside them, about 10 700 contact instances) and drawn as swatches; dropped: `warm.low`
[-0.2, -4] and `maxL` 0.78 as the check proposed (the pale pink stayed and the steps at the top of the range vanished),
no quieter step at all (no pink, but 161 nearly equal with the crimson capped), `warm.high` [0.3, 0], a band of
lightness outside which there is no quieter step (`warm.lowBand`, kept as an option, off), and quieter light steps
turned 4 or 5 degrees toward salmon (the rose tones' light steps went tan). All drawn colours now keep a hue of 12 to 28
degrees and a chroma at least 0.115 of their lightness (0.19 on the dark ones); the first part's had 56 of 1 539 colours
under that.

**The cost of the colour rule, on the screen.** Separation is paid for the colours. With the darker forearm flexors now
nearly out of colours, the start view drew your right pronator teres against the flexor digitorum superficialis at 0.019
along 20 px (both the darkest tone's lower step, 0.008 apart in equal light); `sameGoal` 0.12 parts them, but that pair
flips with small changes (0.11 and 0.13 leave it), so it is a fragile mend. The browser test with the final colours: the
start view 150 contacts, none nearly equal, 12 weak (the second part 0 and 11); from outside 70, none, 6 (0 and 4); the
mirror body held near 175, 1, 18 (0 and 8 to 9); the raised right arm in shadow 161, 1, 21, in shade 0 of 50 nearly
equal and 11 weak (169, 2, 11; in shade 4 of 59 and 13). The table run with the new colours and the earlier table,
eighteen views: 2 535 contacts, 32 nearly equal, 245 weak (the second part, seventeen views: 18 and 150 of 2 472; the
lead's colours 116 and 483). So the weak contacts are about two thirds more than with the second part's colours and
about half as many as with the lead's.

**The forearm contact outside the table, and the table.** The look down and to the left is now one of the views the
table of seen pairs is written from, and the writer always keeps the view where the light on the two sides of a pair is
most nearly the same (it kept the longest contacts before, and a pair the longer contacts showed only under very
different light relied on that light). The humeral head of flexor carpi ulnaris against the flexor digitorum
superficialis: 0.027 -> 0.061 along 175 px in that look, and in the other look 0.19; the two looks: 299 contacts, 9
nearly equal (7 of them the abdominal wall's sheets showing through), 31 weak. The table: 339 pairs, 318 with light,
1 027 samples. The raised right arm in shadow is now a third strict view of `tests/browser-muscle-shades.mjs`, with a
count of the contacts in shade. A muscle the table names that the body does not have is counted (`seenUnknown` in the
steps' report, the scene state's `muscleLook.stepWorst`): the browser test asserts it is 0, so a renamed or removed
muscle cannot make the table fall away unseen; `seenWeight` 0 now switches the table off (it was read as 1).

**Checked.** 523 unit tests pass (the lead's 517 and six in `tests/shades-r27.test.mjs`: the first part's four, two of
them restated for the cost of a warm step, and two new ones: the light on the two sides of a pair, and the writer of the
table). The browser test `tests/browser-muscle-shades.mjs` passes at the full picture (its last run on the final tree:
the start view 150 contacts, none nearly equal, 11 weak; from outside 70, none, 4; the mirror body held near, stopped at
1.00 m, 175, none, 8; a run before, with the mirror body stopped at 0.85 m, 178, 1 and 9). `browser-startup` and
`browser-keyboard-aim` pass. `?case=boot` ok. The frame table, each run alone on the processor, this change and the lead
in turns (frames a second, still / look / up and down / limbs turning): 59.5 / 37.7 / 43.0 / 44.6 and 59.9 / 30.9 / 40.5
/ 46.8; 60.0 / 37.9 / 46.7 / 55.2 and 58.0 / 36.4 / 46.8 / 51.4: no slower. The steps at load (the touching cells, the
tones and the steps together, `inspect().scene.glow.muscleLook.toneMs`), each build alone on the processor in the same
run: 92 ms, the first part 208 ms (the first part read 83 ms for itself on a machine with its processors free; with
seven browsers at once 640 ms were read here). No change to `ns-body.mjs`; no new script file (the count in
`early-load.mjs` is the first part's 59). On 22 November, after the check of the colours: `tests/shades-r27.test.mjs` (6
tests, now also the gamut limit, the light quieter step's hue, the unknown seen keys, `seenWeight` 0 and the kept
equal-light view) and `tests/look-fixes-r26.test.mjs` (11 tests; its floor test now runs over every colour drawn, each
group, storey, lightness and warm step, against section 190's black and the glow beside a body, with the bound that a
deepest shade is at most 0.18 of its colour and at most 4 times section 187's) pass; the browser test passes with its
three strict views; `?case=boot` ok. Not run again then: the whole unit suite, the other browser tests, the frame table
(nothing per frame changed: the colours are given out at load).

**Not done, or not right.**
- The colour rule costs separation. The second part's colours had 18 nearly equal and 150 weak of 2 472 contacts in the
  seventeen views; with the colours of 22 November the table run (eighteen views, the earlier table) had 32 and 245 of
  2 535, and the browser test's four views with the final table 2 nearly equal and 57 weak of 556 (the second part 2 and
  34 of 564 there). The seventeen views were not measured again as a whole with the final table. Nine colours a muscle
  cannot part every pair under every light: a step that goes with the light in one view goes against it in another (the
  lifted thigh above), and a left and a right muscle share one colour while the light falls the other way on the other
  side.
- The darkest group, the forearm's flexors, has the fewest colours now (on its lower step the screen has no room for a
  fuller red). Your right pronator teres against the flexor digitorum superficialis in the start view is parted by
  `sameGoal` 0.12, and that mend is fragile (0.11 and 0.13 leave the pair at 0.011 predicted).
- The table now holds the look down and to the left too (the forearm contact there 0.061 along 175 px), so no view
  outside it was measured with the final colours; in other poses the steps are as good as chance against the light
  there. The limbs turned to their overside (Space tapped twice) were not measured at all: the double tap was not taken
  by the game in the scripted run.
- The pale group at its lighter step stays very pale: the gracilis, the short head of the biceps and the internal
  oblique are a pale salmon 252, 172, 164 (L 0.82), only a little warmer than the 246, 175, 172 the check called pink;
  the rectus abdominis now takes the pale group's darker, fuller step, a rose 237, 102, 112. A lower `maxL` would darken
  the lighter step (0.78 as the check proposed: the pale group's lighter step nearly vanishes, and more contacts fail).
- The fuller step on the dark tones is still a strong red (the sternocostal pectoral 134, 28, 37, the
  sternocleidomastoid 166, 37, 53), redder than update 63's maroon (106, 23, 35); the dark quieter step is a wine red
  (119, 47, 55; the long head of the triceps 139, 58, 67). The owner should judge how red is too red: `gamut` lower for
  less.
- The darkest tone's lower step in its deepest shade (about RGB 41, 3, 7) is darker than section 187's floor: the first
  part's floor keeps the ratios from the darkest tone, not from its darkest step. Against the abyss of section 190 it is
  well above the black, and in the pictures of the raised arm it reads as a very dark wine red held by its outline. A
  lower `RAW_LOOK.muscleFloorRef` would lift it and flatten the shading of every muscle; it stays 0.0621.
- A left and a right muscle share one colour (Message 15), so where a pair meets at the midline (the rectus abdominis,
  the frontalis, the lips, the upper serratus posterior) the two halves are one colour; they are left out of the counts.
- The light groups' shaded side and the tendons' are flatter than in section 168's pictures: their deepest shade is
  lifted about twice (the floor that keeps the ratios, above).
- The check measures mean colours; a pattern or a line between touching muscles would not show in its numbers. Its
  pictures of which mesh is drawn are wrong where two sheets poke through each other (the abdominal wall above).
- The probe and the table hold for the full picture at 1600 by 900. At the cheap picture level (drawn smaller) the first
  part measured 3 nearly equal of about 150 with the mirror body held near; not measured again.

## 189. Every movement of the strip moves from the start look, the way it is named, and rests at its end long enough to read (21 and 22 November)

The user: "make sure there's clear movement for each brain activation area. And you can clearly identify what type of
movement it is for each area. And make sure that the movement is as precise as possible with as many activation spots
and encoded movements as possible without game destabilisation." (Message 204) "That goes both ways for when you're
moving the body and the brain area is activating." (Message 205) Still standing: an activation contracts, then returns
to where the part was, with nothing lit on the way back (Message 206); no zoom or punch-in of any kind (Message 197);
neck movements exaggerated in every view (Message 200).

All 142 movements of the body map were switched on one by one in the browser, on Body update 63 as published and on
this branch, and the travel of the moved part was measured on screen, on your own body and on the mirror body, in the
start view and in the outside view (how: "Measured", below). That found faults in update 63. Each is fixed here.

**Twelve movements moved nothing when switched on from the start look (a tap on one of their muscles), and from the lower
part of their areas.** From a look resting on their own spot, five of them already moved in update 63 ("Open left hand",
"Straighten left little finger", both big toes' lift, the left small toes' lift; by an independent check, and the first
helper's look sweep found the right small toes' lift moving from its spot too); six were dead from there as well (the
left index, middle and ring finger's straighten, the left thumb's straighten and swing out, "Turn left palm up").
- *Seven of the left hand* ("Open left hand", "Straighten left index / middle / ring / little finger", "Straighten
  left thumb at the knuckle", "Move left thumb out from the palm"), whenever the look was more than 8 degrees under
  level. The rule of 19 November that closes the fingers as you look down ("as we look down, the fingers close") drew,
  per joint, the more closed of the look's pose and the pose the movement asked for. The closing begins 8 degrees
  under level, and every left-hand area lies across that line (the looks of their spots run from 14 to 5 degrees under
  level), so from the lower half of those areas the look's pose, the relaxed hand closed by less than 2 %, beat every
  straightening: the movement's pose drive rose to 0.97 and no joint changed. A finger's width higher the same
  movement worked. (Looking up past 8 degrees the opening rule cancelled every bend the same way.) Now the look's pose
  is the place a movement starts from: `LOOK_HAND` and `lookHandPose` in `ns-actions.mjs` (rule `'under'`: per joint,
  pose + (look's pose − rest) × (1 − the share of that joint the movements under way command)), called where
  `ns-app.mjs` composes the left hand's pose. With nothing under way the hand is exactly where the look puts it, as
  before; a movement at full drive is exactly at its own end, whatever the look; in between it is a straight blend, so
  the joints stay inside their limits; the Space grip still wins. The old rule is kept as rule `'max'`.
- *Four of the toes* ("Lift toes" and "Lift big toe" of each foot), whenever they were switched on while the look was
  more than 8 degrees under level (the start look is 25 under): the same kind of rule for the toes drew the more curled
  of the two. A toe movement now goes from the look's toe pose to its own end and back (`digitUnderMove` in
  `ns-app.mjs`, pure); the Space grip's curl still wins.
- *"Turn left palm up"*: the palm is up at the start, so the turn had nowhere to go. Like a body joint that is at the
  stop its movement ends at (section 177: the right palm, the jaw), the left forearm now strikes its stop: it is thrown
  38 of its 160 degrees off it and eased straight back (`strikeTurn` in `ns-actions.mjs`, with `JOINT_LATCH`
  `stopBounceShare` / `stopBounceMaxDeg`). Not under reduced motion, as for the body. The card's words for a palm that
  is already turned said "so nothing moves now"; they say "so it does not turn further" (`ns-text.mjs`).

**Five movements (eight with both halves) were thrown the wrong way.** A movement with little room is kicked into its end
so that it shows (section 177), and the kick then threw it back off the end past where it had started. With the game's
own activity at 60 frames a second: "Straighten left / right knee" straightened 6 degrees and was thrown 11.6 degrees
into a bend; "Straighten right elbow" 8 its own way, 9.8 the other; "Swing right arm in" 5 and 12.5; "Swing left / right
thigh in" 7 and 4.7; "Bend head forward" 10 and 7.1. For the knee the wrong way was by far the larger movement on screen
(33 px of bend on your body against 6 of straightening), so "Straighten" read as "Bend", its neighbour on the strip.
`JOINT_LATCH.backStop: true` (`ns-actions.mjs`): the place a part starts from is a stop for the throw back; the part
stops dead there and is driven in again. Not for a stop strike, which has no room on its own side.

**No one-frame flash (22 November).** An independent check found that backStop made those movements flash: the kick
(0.8 × the swing, at least 70 degrees, × omega) crossed the end inside the press frame, the end threw the part back and
backStop stopped it dead where it had started, so the part stood at its end for one frame between two at its start
("Straighten left knee" 6.0, 0.0, 0.3, 1.3 … 6.0 degrees frame by frame; your right arm in "Swing right arm in" 0, 42.7,
0, 2.5 … 42.7 px). Before backStop the throw back past the start had hidden it. `JOINT_LATCH.kickRoomOmega` 1: with
backStop on, a kick is at most the movement's room × omega. At 60 frames a second the part now covers 0.37 of its room in
the first frame and arrives in the third (the knee 2.2, 4.5, 6.0 degrees), is thrown back about a third of the way and
slams in again; a further press during the contraction no longer jumps it from its end to its start. Twenty-four joint
movements were capped (the five, both ankles' "Pull foot up", "Swing thigh down and back", and the right hand's open,
fingers' and thumb's straighten and thumb out), none with more than 30 degrees of room. At 30 frames a second the capped
ones cover three quarters of their room in the first frame and arrive in the second, without turning back.

**A movement rests at its end for 0.3 s more, unlit, before it returns.** `JOINT_LATCH.holdS` 0 → 0.3 (`ns-actions.mjs`).
The lit contraction is 0.4 s as before (`driveS`): how long and how brightly an activation is lit is not changed here.
In those 0.4 s the part slams into its end, is thrown back and slams in again, and the return began about 0.15 s after
that: the part was within 80 % of its largest displacement for 0.40 s (the median of the 142; 16 movements for under
0.3 s). With the hold it is 0.70 s. During the hold the part stands at its end with nothing lit, and the return is as
before: unlit, to where the part was. Body joints, the game arm's movements and the left forearm's turn (its own note,
`rotation.move`) hold the same way, under reduced motion too. A click during the hold is a further press. `holdS: 0`
gives the behaviour before. (Tried and dropped: `driveS` 0.4 → 0.7, which also lit everything for 0.7 s.)

**The eye view keeps its swing through a neck movement's hold.** The view's swing with a neck movement (section 171)
eases back to the pointer once the neck has stood still for 0.35 s (`NECK_VIEW.settleS`, unchanged). At the 0.3 s hold the
neck is still moving until about 0.35 s, so the view keeps its swing as it is; this was first written here as a fault, and
it is not one (an independent check showed the view frame for frame the same with and without the rule below).
`neckViewStep` (`ns-app.mjs`) does not count the stillness of a neck that is still in its movement (`how.contracting`:
the contraction and the hold). It changes nothing at 0.3 s and keeps a longer hold right: at 0.45 s the view eased back
up to 3 degrees during "Bend head forward"'s hold, at 0.6 s it was carried 9 degrees past the pointer when "Tilt head
back" returned and 8 after a side tilt. Kept, with a test at both holds that fails without it. (Tried and dropped:
`settleS` 0.8, which also delayed the view's return from a neck held by other means.)

**Face shapes are whole at the movement's end, and about a quarter larger.** The map's face movements end at 15 degrees
of their display joints and a shape was whole only at 20, so every face movement stopped at three quarters of its
strength: `FACE_MOVE.fullDeg` 20 → 15 (`ns-face-move.mjs`). The amounts at full strength grew by about a quarter (brows
up 13 → 16 mm, a smile's corner 13 up / 8 out → 15 / 10, a corner down 13 → 16, lips stretched 9.5 → 12, an upper or lower
lip 9 → 11.5, frown, wide eyes, nose and nostrils likewise): exaggerated on purpose, at the far end of what a face does.

**Two ranges of the left thumb, to match the right thumb.** The thumb's tip joint straightens to 20 degrees past straight
(5 before), for "Straighten left thumb at the knuckle" (`thumb_mcp_extension`, which now also takes the tip joint
there), and the thumb swings 15 out from the palm (0 before; the right thumb's −15), for "Move left thumb out from the
palm" (`thumb_reposition`: it ended 12 units from the relaxed thumb's place, hardly a movement; now 27):
`JOINT_LIMITS` and `ACTION_TARGETS` in `ns-actions.mjs`, `POSE_RANGES` and `ENVELOPE_GRID` in `ns-arm.mjs`. (Tried and
dropped: a finger's "Straighten" to 30 past straight at the knuckle, like the right hand's fingers. Your left hand is
seen palm up from above, so a finger tipped 30 degrees back went out of sight behind the palm: in pictures of the start
view the finger vanished instead of straightening. A finger's "Straighten" ends as in the open hand, 10 past straight,
as before.)

**Your own left hand turns its face toward the eye for its movements (22 November).** An independent check found that
"Straighten" and "Open" of your own left hand read as the fingers disappearing: the hand is seen from above along the
forearm, palm up, so a straightened finger lies flat, pointing away from the eye. `LEFT_HAND_TILT` (`ns-app.mjs`): while
the look rests on an area of the left hand or of one of its fingers, or while one of the hand's own movements is driven
(its contraction and its hold at the end, 0.7 s; not its way back), the wrist is drawn tilted 15 degrees so the hand's
face turns toward the eye; with the palm up that is a bend toward the palm (wrist flexion), with the palm down toward the
back of the hand, in between by the forearm's turn. Eased in (time constant 0.12 s) and out (0.3 s), inside the wrist's
range and the hand-fit envelope's levels; drawn only, nothing lit, latched or held. The side was chosen on pictures of
the start view, 0.3 s into "Open left hand": without the tilt the opened fingers vanish, with it they spread as a fan,
and the other way (extension) hides them further. Update 65 (a check of update 64): at 25 degrees, and wanted until the
movement's note was dropped (about 1.9 s), the tilt read as an unlit "Bend left wrist" added to every hand movement, and
the whole hand turned back by itself about 0.6 s after the finger had settled. Now 15 degrees, only while the movement
is driven, out over 0.3 s: in the game's own activity at 60 frames a second the finger is at 22 % of its drive at 1.02 s
with the tilt at 4.9 degrees, and at 5 % at 1.22 s with the tilt at 2.5; the hand turns back with the finger. In pictures
of the start view at 0.3 s "Open left hand" still spreads as a fan, "Straighten left index finger" stands tall where
"Bend" folds it short, and with "Straighten left thumb" the four other fingers stand up less than at 25. The tip beside
the crosshair keeps off your own left hand's box on the screen when a placement is clear of it (`tipSides` in
`ns-quiet.mjs`, with the box the region labels already keep off, `armAvoidShapes`, now worked out once a frame for both);
before, it covered the palm and thumb at the hand's areas.

**"Bend head forward" bows the upper body with the neck, seen from outside (22 November; Message 200).** `NECK_BOW`
(`ns-app.mjs`): while the neck is bent forward beyond its start angle by its movement (nothing else holds it there), the
upper body bows with it, 15 degrees at the neck's end, in proportion to how far the neck has come (its 10 degrees of
room), and returns with it. It is drawn as the trunk's bend under the head (`headPoseForLook`'s `bowDeg`, in `bendDeg`,
ns-body `lookBendDeg`), inside the trunk's range, and the left arm's shoulder follows it, so the arm stays on its
shoulder. The eye never takes it: the camera stands where the activity's own angles put it (`eyeHeadPose`, which
`headAttachment` uses). Update 65 (a check of update 64): the bow was drawn in the eye view too, where it did not do what
was written here. "The mirror body moves 47.5 px in the start view" was measured with the camera at rest (both places
put on screen through the camera before the view's dip); during the hold the eye view dips 15 degrees (section 171),
the mirror body's head and trunk are then above the top edge, and the bow only lifted the cut-open top of your own rib
cage (collarbones, upper ribs, lungs, great vessels) into the bottom of the picture for 0.7 s, shaking with the neck's
spring (11, 15, 12.7, 11, 10 degrees and back within 0.2 s). Now the bow is drawn only from outside (`outsideOnly`, in
proportion to the camera's way out of the eye, so it fades with the change of view) and eased (`easeS` 0.08 s, so the
neck's spring does not shake the trunk; in the activity its largest step is under 3 degrees a frame and its dip at the
top under 3 degrees), handed to the head pose by the frame (`neckBowStep`, the offset `neck_bow`); no other head pose
(the eye, the hold, the camera trials) gets one. From outside at 0.4 s your skull comes up 89.9 px and the mirror body
moves 24.9 px; in the eye view during the hold the pectorals show again where the open chest rose. The eye camera's place
changes by 148 mm during the movement with the bow and without it: that is the eye view's own dip, a turn about the eye
with the camera standing behind it. (Asked in the round: keep the bow out of the left shoulder's frame. Tried in a
picture from outside at 0.4 s: the left arm's shoulder then stays behind while the bowed trunk's shoulder goes on, and a
bone shows between them; the shoulder follows the bow as before. The hand's kept place no longer moves for it: the bow
is not drawn in the eye view, where the look carries the hand, and the rule below counts the bow as part of the
trunk.)

**The chosen limb keeps its place through your own neck and trunk movements and through E (update 65; Message 206).**
A check of update 64 found the left hand left moved after "Bend head forward" with the bow (16.5 mm, twice 31 mm, with
Space during the hold 8.9 mm), and, on every build since the free hand, after "Bend trunk forward" alone (38 mm; neck then
trunk 112 mm; the wrist ended at −12 against −9.6, its clamp at the hand's new distance). The cause is the view's hold of
the chosen limb (LIMB_KEYS): it keeps the end where it is in the room while your trunk moves, and the pointer's look
carries the end from its place in the picture. That place was taken with the camera as it stood before the movement;
the first look during the movement (any look; the check set the same look again) used it with the moved camera and round
the moved shoulder, so the end jumped (with a look turning, 105 to 236 mm in one frame) and stayed there when the trunk
came back. `HOLD_BODY` (`ns-app.mjs`): the place keeps the trunk it was taken with (its reference: the trunk's held bend,
turn and side bend and the neck's drawn bow, the shoulder's place and the bend of the limb then). While the trunk is not
as in the reference (`holdBodySame`), a look carries the end in the reference: the line is drawn with the new look from
the camera with the trunk as it was (a camera trial), round the shoulder as it was (`holdCarryPoint`, pure). The end so
moves by the look's own turn only and otherwise stays where it is in the room, and when the trunk is back it stands
where the same look would have put it with no movement: its place in the picture is kept. The reference is taken anew
only while the trunk is at rest and the look still. The neck's own movements are not counted: they move neither the
hold's camera (it stands on the look's own neck) nor the shoulders.

A second check of this round found two faults of the place's camera. The first version also took the place again on
every frame the neck or trunk moved, with no regard to the view, so after a neck or trunk movement seen from outside (E)
the first look back in the eye view threw your left hand 330 mm in one frame, and it stayed there; and since update 63 a
look turned outside did the same (316 mm). The place is now taken only from the eye view's camera: outside it is left as
it was, and it is taken once on the first frame back in the eye view, before the look carries anything
(`holdPlaceRule`, pure, which `stepLimbHold` follows; `holdReframe` takes nothing outside the eye view). That first
version also stopped the look from carrying the limb for 1.65 to 1.93 s on every neck and trunk movement, which left a
limb whose look turned in that time off its place for good (about 10 px a degree); that stop is gone.

Measured in the browser, every bone of both bodies, start look: the check's eight sequences (then 5 s; the same with the
bow switched off), before and after: neck then trunk 111.6 → 0 mm, neck then Space 8.9 → 0, trunk alone 38.3 → 0, Space
alone 0 → 0, neck alone 16.5 → 0, trunk then neck 24.0 → 0, trunk then Space 20.4 → 0, neck twice 31.3 → 0 (the wrist
ends at −9.6 every time; update 64 left 112.2, 38.3, 38.3 and 20.4). The second check's 47 sequences: a trunk movement
with E at 0.2 s and back at 3 s, then a look: 0 mm (330 before); "Bend head forward" from outside, E back, a look: 0 mm
(330); E, a look turned 4 degrees outside, E back, a look: 0 mm (316 here and in update 64; the end stays where it is in
the room, since outside the look moves no limb). All twelve neck and trunk movements with the look turned 6 degrees
during the movement: the end moves 86.9 mm with its place in the picture kept within 0.001 of the screen, as with no
movement at all (86.9, 0.001), for the left arm; the legs and the right arm likewise (139.2, 146.2 and 82.3 mm, against
139.2, 146.2 and 81.3 with no movement, places within 0.001); the largest one-frame step 23.3 mm, which the trunk's turn
makes with no look too. Each movement alone: 0 mm for the left arm and the legs; the right arm 1.4 mm after "Bend trunk
forward", as in update 64. W during "Bend trunk forward" moves the hand 11.8 mm (W alone 9.3; update 64 137).

**Space and a change of limb during a trunk movement (update 66; Message 206).** A check of update 65 pinned down two
older faults (both in update 64 as well). While Space holds the brain or the mirror body, your left hand is not held by
the view and rides with your body; letting go during "Bend trunk forward" handed its place in the room back in one
frame, a throw of 107.6 mm. Now it goes back to that place at most `HOLD_BODY.rejoinMps` (0.6 m a second, 10 mm a frame
at 60 frames a second; `holdRejoinStep`, pure), and the place stays the goal of the hold meanwhile. And a limb chosen or
let go while the trunk was bent kept the place the bent trunk gave it: "Bend trunk forward", the left leg chosen at
0.3 s and the left arm again at 2.5 s, left your left hand raised 273 mm for good. Now the left hand let go while the
trunk is not at rest stays held where it is in the room until the trunk is (and chosen again before that, it takes that
hold back, its place to be taken anew); and an arm (its shoulder rides on the trunk) newly chosen while the trunk is
not at rest is taken up by the view only when the trunk is at rest (`holdTakeUpWaits`, pure): until then it rides with
your body, as an arm not chosen does. The legs are taken up at once, as before (their hips do not ride on the trunk).
Measured (every frame at 60 frames a second, each sequence against the same inputs with no movement): Space let go during
"Bend trunk forward": largest step 15.7 mm, the trunk carrying the hand while Space holds (107.6 before), back at its
place 0.0 mm off; the left leg chosen during the movement and the left arm at 2.5 s: 0.0 mm (273.1); the right arm
chosen at 0.3 s with the look turned 6 degrees during the return: it ends at its own place, 0.0 mm from where it
started, with no step after it was chosen (before: 179.5 mm off with one step of 72.7), but 82.2 mm from the same
sequence with no movement, since the look turned before the arm was taken up does not move it; the left leg chosen
at 0.3 s with that look: 3.3 mm, as before. The round-3 check's 47 sequences and the eight left-hand sequences are as
above; only these two changed.

**The face's two edge codes in the hidden-part pass (update 65).** Codes 15 and 31 (the face's moving edges) were no
thing in the see-through pass (`ns-see.mjs`): its JavaScript rule and its graphics card rule disagreed for a part of the
mirror body's head behind its lips or eyelids. They are the head's now in `seeThingOfGroup`, `nsLimbOf`, `nsThingOf` and
`SEE_JOIN_MASKS` (joined to what the head joins).

**The face's moving edges get the ink line (22 November).** The mirror body's face was in the outline pass as one group,
so only its silhouette was inked, and its muscles are closed volumes with no open borders an outline could follow. The
eyelids' part of the ring muscle round each eye (the eyelid margins) and the lips' ring muscle now have an outline code
of their own (`OUTLINE_FACE_EDGE_GROUP` 15, 31 on the mirror body, in
`ns-outline.mjs`; `FACE_EDGE_INK` in `ns-scene-three.mjs`), adjacent to no other group, so the raw look's one ink line
(one near-black, one width) is drawn where they border the rest of the face, on the mirror body and on your head seen
from outside. The outline follows the face's shapes: the processor's buffers of the upper face, and the jaw's skinned
lips through their lift offsets (section 179's remark that the lips' outline would stay at rest is out of date). In
pictures of the start view a smile tilts the dark lip line, a purse shrinks it to a small ring, closing the eyes changes
the eye rings and opening the jaw stretches the lips' outline down; without the ink these read only by the lit muscle.
No light, colour or shading of the face is changed, and nothing is added in the eye view (no lid or brow cue: the
owner's no-blink rule). Update 65: the forehead muscle (the brow line) is out again. It is thin and the head's own parts
poke through it in small spots; in a code of its own each spot became a strong line (the two codes do not join), so a
check found the mirror body's forehead dotted dark in every frame, at rest too. In pictures of the start view the
forehead is clean again and "Raise both eyebrows" reads by its light and the forehead's bulge.

**Measured.** In the browser, at 1600 by 900, through the game's own checks interface with its fixed 60 frames a second
clock (switched on, for the checks only, by rewriting the page's launcher on the way in; the served files are not
changed). Each of the 142 movements is switched on at the start look by the game's own press event (what a tap on one of
its muscles sends), with your body reset before each. Its travel is the largest distance on screen (CSS pixels) that
any bone's centre of your body, and of the mirror body, moves from its place before the press, put on screen with two
fixed cameras: the eye view at the start look ("start view") and the view over your shoulder at the start look
("outside view"). A face movement moves the skin, not a bone: there the most-moved point of each face shape counts, on
the mirror body's face (your own face is not drawn in the eye view and is turned away in the outside view). The part
is sampled at its end four times in the 0.4 s of the contraction; 29 movements on the branch and 33 on update 63 (the
faults, the stop strikes, the movements with little room, the neck, and one or two of every body part) were also
followed frame by frame for 0.9 s and then to 2.1 s. Times and wrong-way angles come from the game's own activity run in
Node at 60 frames a second. The machine was shared by seven jobs all evening, which is why the frames between the
samples are not drawn (the bones' places do not depend on the drawing: checked on five movements, the same numbers to
the decimal) and why a first sweep that switched each movement on by a look resting on its own spot was given up after
19 movements on update 63. Those 19 agree with the press to a few pixels ("Straighten left knee" 32.8 / 29.9 px by a
look, 32.8 / 30.3 by the press), except where the look itself is the fault: "Lift left big toe" moved 14.5 px from a look
on its own spot, which is above the point where the toes' closing begins, and nothing when pressed at the start look.

| what | update 63 | this branch |
|---|---|---|
| movements that move nothing from the start look, on either body, in either view | 12 | 0 |
| movements thrown against their own way (largest angle) | 8 (knee 11.6, right arm in 12.5, right elbow 9.8, neck 7.1, thigh in 4.7 degrees) | 0 |
| the part within 80 % of its largest displacement (median of 142) | 0.40 s | 0.70 s |
| the area lit above half (every movement) | 0.33 s | 0.33 s |
| under 12 px in the start view on both bodies, and no swing of the eye view | 58 | 50 |
| under 12 px on the mirror body in the start view | 69 | 63 |
| under 12 px in the outside view on both bodies | 78 | 73 |
| rows the same to 0.3 px in all four columns | | 103 of 142 |

The twelve that moved nothing, now (start view, you / mirror body, px): "Open left hand" 39.5 / 35.7; "Straighten left
index / middle / ring / little finger" 38.2 / 28.5, 39.5 / 35.2, 38.6 / 35.7, 35.3 / 31.4; "Straighten left thumb at
the knuckle" 22.8 / 9.2; "Move left thumb out from the palm" 18.8 / 9.4; "Turn left palm up" 30.9 / 16.1 (the twitch,
38 degrees); "Lift left / right big toe" 14.3 / 15.0 and 14.4 / 14.9; "Lift left / right small toes" 7.1 / 11.5 and 7.2 /
11.3. The wrong-way ones (your body, start view): "Straighten left knee" 32.8 px of bend before, 6.3 px of straightening
now; "Straighten right elbow" 30.7 (a bend) → 10.6; "Swing right arm in" 113.9 (outward) → 43.3; "Swing left thigh in" and
"Bend head forward" keep their own travel (56.1 px; 6.0 px on the mirror body, 18.2 px on your head from outside, and the
eye view dips 15 degrees) without the throw the other way. The stop strikes, frame by frame: "Clench the jaw" 2.2 px on
the mirror body and 4.3 on your jaw from outside (the jaw opens 11.7 degrees and shuts), "Lower the throat bone again"
1.6, "Turn right palm up" 28.2 / 15.8, "Bring right fingers together" 7.6 / 4.1, as before. Every movement followed to
2.1 s ended with every bone of both bodies exactly where it was (0.0 mm), nothing lit after the contraction's light, and
the eye view back at the pointer (after "Tilt head back" 0.6 degrees of its swing were still easing out). No value was
not a number. The table of all 142, before and after, is with the round's notes (`seemove-table.md`).

Pictures, each opened: the start view at rest and 0.3 s after the press, update 63 beside this branch, cut round the
moved part, for "Straighten left index finger", "Open left hand", "Lift left big toe", "Turn left palm up" (0.07 s),
"Move left thumb out from the palm", "Straighten left knee" (0.083 s: the bend before, the straight knee now), "Raise
both eyebrows", "Smile", "Purse the lips" and "Bend head forward"; the outside view for the knee, the index finger, the
head and the eyebrows; and two full pictures of the look resting on a left-hand area.

**Checked.** `tests/seemove.test.mjs`, sixteen tests: no movement of the map is thrown back past where its part started (and
the knee, the right elbow and the right arm end exactly their own 6, 8 and 5 degrees away; without the rule the knee bends
more than 10); moving a joint lights its own area and spot (116 directions); the look's closing or opening never cancels a
hand movement (every one of the sixteen moves its joints at least 12 degrees at six looks, 5 for the fingers coming
together; under the old rule the seven straightenings move 0), a movement at full drive ends at its own end whatever the
look, half way it is half way, the grip wins, the limits hold; the fingers' and the thumb's ends and the hand-fit ranges
agree; the left forearm's stop strike (0.2 to 0.26 of its turn, back on the stop, lit as every movement, none under
reduced motion); the hold (every body movement near its end for at least 0.5 s, lit exactly as long as without the hold,
dark through the hold and the return, back where it was; the game arm and the forearm's turn likewise; a press during the
hold; reduced motion); the eye view through a neck movement's hold, at holds of 0.3 and 0.6 s (kept above nine tenths of
its swing until the return, never past the pointer the other way, ends at 0; with the rule for a neck still in its
movement taken out it fails at 0.6 s: 9.08 degrees past the pointer); no flash (for every movement of the map at 60
frames a second: at most half its room in the first frame, no turning back before its end, no frame that jumps half its
room, also after a further press; without the kick's cap the five movements with little room fail on both halves); the
face shapes whole at their movements' ends; the toe rule; the left hand's tilt (wanted for the six hand and finger
areas and the hand's movements while driven, not on their way back and not for the wrist's; eased, never a fifth of the
way in one frame; for four hand movements from the activity, nearly gone when the finger is back, which fails with the
update-64 rule; the side by the forearm's turn); the tip's placement off a box; the neck's bow (only what the frame hands
in, none in the eye view, eased with no step of 3 degrees and no dip of 3 at the top, back to 0; the head the eye stands
on is the same with and without it, which fails with the bow left in); the face's edge code (its own, adjacent to itself
only, the forehead out); codes 15 and 31 in the hidden-part pass; the hold through a trunk movement and E (the old place
with the moved camera moves the hand 30 mm and more with no turn of the look; the carry in the reference leaves it where
it is, and a real turn carries it with its place in the picture kept; a place taken from the outside camera would throw
it more than 100 mm; the rule at the end of each frame: nothing taken outside the eye view, taken once on the way back,
kept while the trunk moves and the look is still, taken anew at rest; and the wiring of the rule into the hold read from
the source). `tests/arm-jerk.test.mjs` (two tests restated for the hold), `tests/small-fixes.test.mjs` (the knee),
`tests/face-move.test.mjs` and `tests/see.test.mjs` (code 15 is a group now) follow. Update 65: the package's file with
the see, see-pass, outline-idle, face-move, head-hold, neck, limb-hold, limb-follow, limb-keys, look-taken, arm-jerk,
small-fixes, hold-move, quiet, limb-pair-push and fix63 files, 136 tests, pass; the start check prints `"ok":true`;
browser tests `startup`, `keyboard-aim` and `limb-controls` pass; both checks' hold sequences as above. The whole unit suite: 526 pass (517 on the lead, nine new), on 21 November; after the
changes of 22 November only the package's own and the touched test files were run (the round's processor): the
package's file with the outline, see, limb-hold, face-move, shader-safe, neck, head-hold, look-range, look-fixes,
hud-layout and quiet files, all pass. The start check prints `"ok":true`. Browser tests `startup`,
`keyboard-aim`, `punch-in` and `limb-controls` pass. Frame table (frames a second: still / look / up and down / limb turn),
this branch and update 63 timed in turns inside one run, each alone on the shared processor: update 63 37.7, 41.3, 40.0
for the look, 49.4, 37.5, 38.7 up and down, 54.6, 49.6, 45.7 in the limb turn; this branch 38.0, 40.2, 39.2, then 41.8,
45.2, 39.0, then 50.4, 42.1, 43.8; still 56 to 60 on both. The look and up-and-down phases are the same; the limb turn
averages 45 here against 50, inside a spread of 42 to 55 on both that follows the drawing's time, which nothing here
touches. The simulation's own share of a frame is the same on both (1.1 to 1.4 ms still, 1.3 to 1.7 looking, 1.35 to 1.6 in
the limb turn). Seven separate runs minutes apart varied more than that (limb turn 33 to 56 here, 52 to 55 there). The
look rule for the left hand runs every frame while the look is off level; timed in Node it takes about 4 millionths of a
second with a still look and 45 with a moving one, where the rule it replaced took about 75.

**Not done, or not right.**
- *The face, the jaw and the throat stay small at the start view.* All 36 of their movements travel 0.8 to 5.5 px on the
  mirror body's face there (0 to 4.3 before), because that face is about 40 px tall and no zoom is allowed; your own
  face is not drawn in the eye view. The ink on the brow line, the eyelids and the lips (22 November) makes the brows,
  eyelids, mouth corners, lips and the jaw's opening readable by contrast; the nose's two movements, "Move jaw to the
  side" (1.6 px) and the throat's two (the throat bone under the jaw, 0 to 4.2 px) still read only by the lit muscle,
  and nothing honest makes them larger without zoom. The ink also gives the mirror body's eyes dark rims and its lips a
  dark outline at rest. "Purse the lips" measures 0.8 px where it measured 2.5 (one point at the lips' middle); with the
  ink it reads as the lips' outline shrinking.
- *Fourteen more movements stay under 12 px in the start view on both bodies*: "Turn left / right sole outward" 3.3 and
  3.4, "Turn left / right sole inward" 8.6 and 8.4, "Straighten left / right knee" 6.3 (6 degrees of room), "Straighten
  left elbow" 8.8, "Straighten right elbow" 10.6 (8 degrees), "Bring left fingers together" 3.5 (5 degrees), "Bring right
  fingers together" 7.6 (a stop strike), "Straighten right thumb" 7.1, "Curl left big toe" 11.8, "Lift left / right small
  toes" 11.5 and 11.3. They are small parts far from the eye or movements with little room in the start posture; none
  was made larger, since a larger end would not be a plausible one.
- *"Bend head forward"*: the bow of the upper body makes it plain from outside only. In the eye view it is the view's
  own dip (section 171) and the mirror body's legs, as in update 63, since the mirror body's head is above the top edge
  during the hold; the view's dip shows the open top of your rib cage at the bottom of the picture. The other neck
  movements were not given a bow: they already travel 41 to 51 px on the mirror body.
- *During a trunk movement the chosen limb stays where it is in the room* (as before), so its place in the picture moves
  with the camera for the moment of the movement and is back when the trunk is; the arm stretches and bends with the
  trunk. A look in that time moves it by the look's own turn, worked out with a camera trial of the trunk as it was
  (0.45 ms a call, measured by a check over 940 calls; about one a frame, only while the trunk is not where it was and
  the look moves; none on other frames). A key during a trunk movement takes the place anew in the trunk as it was; when
  the view then follows the keys, the place is taken with the trunk as it is, and the look carries the limb round that
  until the trunk is back at rest (with a look turned meanwhile, the hand ended 17 to 72 mm from the same inputs with no
  movement in a check, 12.7 mm for the right arm with D). An arm chosen during a trunk movement is not moved by the look
  until the trunk is at rest, so a look turned in that time leaves it where it was.
- *A look turned outside the eye view moves no limb* (as before): back in the eye view the limb is where you left it,
  so its place in the picture is the one the turned look gives it.
- *Your own left hand's tilt* (22 November) was judged on the start view. At the look on a hand area the arm, the limb
  the look carries, stands wherever the look has brought it: in runs where the look settled for 0.8 s it was raised
  across the right half of the picture with the hand at the top right corner, partly beyond the frame or out of view,
  and there the tilt cannot help; in runs where it settled for 0.25 s it was on the left near the area. The tip's
  keeping off the hand is tested on its own (tipSides) and was not seen in a picture, since in my runs the hand was not
  under the tip. The tilt still bends the wrist visibly during every hand movement (15 degrees, while the movement is
  driven), which a player might read as a wrist movement; the wrist's area is not lit.
- *The hold is unlit.* For 0.3 s the part stands at its end with no light on its area or muscles. Lengthening the
  light was not this package's to do.
- *Under reduced motion* the seven stop-strike movements do not move at all (as before for six; "Turn left palm up" is
  the seventh), and a movement with little room goes its few degrees without a kick.
- "Open left hand" moves nothing when the look is 60 degrees or more above level, where the look has already opened the
  hand fully. No strip area is looked at from there in the start place.
- *How it was measured has limits.* The movements were switched on by the press event at the start look, not by a look
  resting on each spot (only 19 were, on update 63). The largest travel at 100 ms samples misses what happens between
  them for the 113 movements not followed frame by frame. Three movements of the right shoulder carry the arm past the
  eye, where the travel on screen has no meaning ("1000+" in the table). "Both ways" (moving a part lights its own area
  and spot) was checked on the pure index only (`jointAreaIndex`: 116 joint directions light their own movement, the
  twelve of the whole hand's open and close light the finger's own), not by keys and drags in the browser.

## 190. The background is an abyss: a deep black, faintly lit round the brain and the bodies (21 November)

The owner, Message 208, after looking at Body update 63: "Background should still be more of an abyss." (Its second
sentence, the edge glow of the strip's black blocks, is section 191.) Before it, Message 206: "let's make the background
more of a black abyss, but still with a gradient"; Message 135: "far more black of a background, but with a little bit
of a gradient. So not exactly pitch black, with the gradient changing as you go further or closer away"; Message 89:
"perhaps something should be done about the endless black space".

Where it stood (Body update 63, measured on the screen at 1600 by 900; the numbers are RGB steps of 255): behind
everything was the room of 18 November, a dark operating theatre out of focus, since section 176 with a black of 4, 4, 5
and a pool of light on its floor. The start view's corners measured 10 to 21 and the background beside the brain rose
from 14 at the picture's edge to 30 at the brain's outline: a dark grey haze, not a black. A look straight down showed
one flat grey of 13 to 20, the floor's pool: a floor under you. A look straight up was one flat 4, 4, 5. The page's very
first paint, before the loading picture, was a grey of 15 to 33 with rings in it.

**No room any more.** `ROOM.abyss` (`ns-room.mjs`), on by default: no floor, pool of light, wall, horizon, lamps or
shadows are drawn. The backdrop is one black, `ROOM.abyss.black` (RGB 2, 2, 2; the scene's clear colour under it follows,
`roomClearHex`), and the only light in it is the dark round the things, faintly lit. Nothing in it has an edge, a shape
or a place of its own. `ROOM.abyss.on` false brings the room back exactly as it was: its black (`RAW_LOOK.room`), its
pool and its shader are not changed.

**A glow close round each thing.** `ROOM.abyss.glow`: behind the brain, the mirror body and your own body seen from
outside, the dark is lit by the old halo's rule, without its rim and fainter: brightest behind the thing's middle, falling
off through its outline into the black over about one of its sizes (brain 0.008 of white in linear light with a spread of
1.1 of its size; a body 0.0025 with a spread of 1). It is measured in the thing's own size, so in the picture it grows as
the thing comes nearer and shrinks as it goes away (Message 135). Its tint is a cool grey (0.86, 0.93, 1).

**A wide, faint light round the brain.** `ROOM.abyss.far`: with the glow alone (the variant the first helper left,
"a2"), every look past the things was one flat, dead black: straight up 2 everywhere, straight down 3, a look to the
left 3 over two thirds of the picture, from outside 2 down both edges. So the brain, the largest thing, also lights the
whole side of the dark it stands on: 0.003 x the brain's size in the view (its radius over its distance, 0.45 at the
start, at most 1) x (1 + cos a) / 2, where a is the angle between the line of sight and the line to the brain's middle.
That is the evenest falloff there is (it has no edge and no shape anywhere): full toward the brain, half at right angles
to it, nothing straight away from it. A look that shows no thing is now lighter toward the side the brain is on, and the
brain coming nearer lights more of the dark.

**The body you are in lights nothing.** The eye view's camera stands a little behind your eyes, 1.05 to 1.56 of your
body's radius from its middle, and the halo's rule ("none from inside a thing", from 0.7 to 1.6 of its size) let most of
your own body's glow through there: in a2 half of the light in the start view's corners was a broad lift from the body
you sit in. A glow row can now say how near the view point may come (`[light, spread, core, from, full]`): your own
body's starts at 1.4 and is full from 2.1, so the eye view has none of it and the view from outside (2.2 to 2.5) all of
it. The brain's and the mirror body's keep 0.7 and 1.6.

**The loading picture and the page are the same abyss.** The loading picture (`ns-assembly-core.mjs`) drew the room as
the game's first picture sees it. It now draws the abyss as its OWN viewer sees it, lit round its own brain and its two
bodies (`ASSEMBLY.abyss`: their sizes as balls). (The first helper's draft hung the glow of the game's first brain in
the loading picture: a grey haze of 17 to 20 across the middle with no thing in it, lighter than the room it replaced.)
The page's very first paint (`.ns-app` in `assembly.css`) is the abyss's tones (11 in the middle to 2 at the edges)
instead of the old room's greys, and the loading canvas before its first frame shows the same (it was one flat #05070b):
the first paint, the canvas and the loading picture follow each other without a grey flash or a flat step.

**What the screen shows now** (quality "full", 1600 by 900; update 63 in brackets; the offline arithmetic, `roomLight`,
agrees with the game within one step):
- the start view: corners 5 to 7 (10 to 21); from the left edge to the brain's outline, half way up, 6 -> 14 (14 -> 30),
  rising all the way; low at the left 5 -> 9 (19 -> 27);
- a look straight up: 2 to 3 at the upper edge, 4 to 5 at the lower (one flat 4);
- a look straight down: 7 to 9 at the upper edge, 4 at the lower (one flat grey of 13 to 20);
- a look 62 degrees to the left: 3 to 4 at the left edge, 16 by the brain; 100 degrees to the left and 15 up: 2 to 5;
- the mirror body held near (1.3 m from the camera, the look on it): the corners 7 to 10, and from the left edge to the
  brain's outline 9 -> 18; pushed away (4.4 m), the same look: 5 to 6, and 6 -> 15: a near body lights more of the dark;
- the brain carried away (17 m from the camera): its glow shrinks with it, 10 beside it and 3 in the corners; carried
  nearer (6.0 m): 16 beside it, 5 at the far side of the picture; turned about 60 degrees by a drag: the same on both
  of its sides (6 -> 15 on the left, 6 -> 14 on the right);
- from outside (E): the edges 5 (6 to 10); looking down from outside 4 to 5 (8 to 10, and a grey patch of 27 to 32
  under you: the floor);
- the loading picture: corners 2 to 3 (5 to 15), 10 to 12 between the bodies, 13 by the brain;
- at the hand-over the far corners go from 2 to 3 (loading picture) to 5 to 7 (the game): the game's brain is much
  larger and nearer. In update 63 they went from 5 to 12.
No banding: the backdrop's dither (plus or minus 0.75 of a step) is unchanged, the black stands above it (1.65 steps), and
the mean of boxes of 40 pixels along the slow gradients rises evenly at every quality level (a look straight up, from
top to bottom: 2.5, 2.8, 3.0, 3.2, 3.5, 3.8 in red).

**The dark muscles and the outlines against it.** The dark shade floor of section 187 was set to about twice the room's
light. On the raised right arm in shadow (the path of that section's fault, at twice the pixels) the darkest twentieth
of the muscle pixels measures 55, 6, 13 on both builds: 1.7 times the light of the room's background (median 16, 18, 20)
and 6 times the abyss's (4, 4, 5). So the dark muscles stand further off the background than before, and the floor needs
no change for it (`RAW_LOOK.muscleFloor` and section 188's two constants are not touched). The ink line of a silhouette
(drawn 14, 9, 10) was darker than the room behind it; against the abyss (10, 10, 11 beside that arm, 3 to 7 far from the
things) it is about as dark as the background, so there a body's edge is the edge of its colour, as on any black. The
lines where one limb lies over another, and the brain's, are as before.

**Cost.** The backdrop is drawn as before: one triangle at the far depth, shaded only where nothing covers it; no new
pass and no texture; one more uniform (the three things' sizes). Its shader is the room's three glow rows plus one row
for the wide light (a length, a dot product and a minimum), without the floor, the wall, the lamps, the tile lines, the
shadows and the gloss: in the text 3 exponentials against 13, no sine, arc tangent, power or screen derivative, no loop
(1 815 characters against 4 347). The backdrop alone, drawn over the whole of a 1600 by 900 picture with nothing in
front of it and timed by the graphics card's own timer (300 draws a run, six runs each in turn, the things where the
start view has them): the abyss 0.044 ms a draw, the room 0.058 ms (medians; every run of the abyss 0.042 to 0.045,
of the room 0.056 to 0.059). In the game the brain and the bodies cover most of it.
Frame table at 1600 by 900 (frames a second, still / looking round / up and down / the limb turn; each run alone on the
test slot, in turn with the lead's server, in this order): this branch 43.9 / 14.1 / 28.7 / 19.2, the lead 60.1 / 27.0 /
31.7 / 28.1; this branch 57.5 / 38.3 / 46.5 / 53.4, the lead 57.0 / 31.5 / 40.0 / 47.1; this branch 60.0 / 38.3 / 50.3 /
53.5, the lead 59.1 / 26.0 / 34.9 / 32.1. The first run of this branch was slow in every part of the frame, also in
those this change cannot reach (in the still view the simulation took 1.9 ms against 1.2 to 1.4 in the other runs, the
HUD 0.74 against 0.21 to 0.30, the draw call 11.1 against 5.1 to 6.3): the one processor was busy with something else.
In the second and the third pair this branch is the faster in all four cases. The same build varies widely from run to
run (the lead's limb turn 28.1, 47.1 and 32.1), so the table shows no cost and cannot show the small gain the card's
timer measures.

**Checked.** Ten new unit tests (`tests/abyss.test.mjs`: no place in any direction, the start view's corners and its
rise to the brain, no flat black looking up, down, aside and from outside, the wide light's even slope and no edge
anywhere (under a fifth of a screen step per quarter degree), nearer and further, your own body from the eyes and from
outside, the shader's numbers and what it no longer holds, the loading picture and the page's two backgrounds); the
room's own tests now read the room's rule (`ROOM` with the abyss off) and pass unchanged. `?case=boot` ok. Looked at in
pictures at quality "full" and at the lowest quality (drawn "lite-0.6": the same numbers within one step, no band) and
under reduced motion (the same picture; the light is steady in every mode): the start view, looks straight up and down
and to the left, the mirror body held near and pushed away, the brain carried and turned, the view from outside level,
up, down and to the left, the raised right arm in shadow at twice the pixels, the loading picture, the page's first
paints and the hand-over; the start view, the looks up and down, the view from outside, the arm and the loading
picture beside the same view of update 63. The whole unit suite, run alone: 527 tests pass (517 and these ten). Browser
tests: `browser-startup` passes; `browser-keyboard-aim`, `browser-play-settings` (it changes the picture quality) and
`browser-punch-in` under reduced motion pass, each run alone. (Earlier in the evening, with six other jobs on the one
processor, those three failed at their own time limit for the game to start, on this branch and on the unchanged lead
alike, and one real-time test of the pack loader failed on both.)

**Not done, or not right.**
- Away from the things the gradient is there in numbers and hardly to the eye: a look straight up runs from 2 to 3 at
  the top to 4 to 5 at the bottom, a look far to the left from 2 to 5. On most screens that is a black, a little less
  black toward the brain. A stronger wide light shows more and greys the start view: `ROOM.abyss.far.light` 0.005
  gives 3 to 6 looking up and 8 to 9 in the start view's corners, 0.007 gives 3 to 7 and 10 to 12 (worked out with
  `roomLight`, not looked at in the game). 0.003 is a choice for the black, and the owner may want the other.
- By the brain's outline the start view now measures 14 where the room measured 30. If the gradient should show more
  there, raise the brain's glow (`ROOM.abyss.glow.brain`, its first number) before the wide light.
- A body held nearer than about 1.4 m loses its glow again (the rule "none from inside a thing" starts at 1.6 of its
  radius and ends at 0.7), so "nearer lights more" holds for the mirror body from far away down to about there. From
  outside, looking up, the camera comes to 1.7 radii of your own body and its glow is at about a third.
- The loading picture's far corners are the bare black (2 to 3) and the game's first picture has 5 to 7 there: the two
  cross over in the 0.8 s fade. The glows in the loading picture are balls round its brain and bodies, not their shapes.
- The page keeps the old blue-black (#05070b, `--ns-bg`) as the colour under everything and in its cards and text
  shadows; it is not seen behind the picture. The page's own gradient (the first paint, and the loading canvas before
  its first frame) is plain CSS without the game's dither: for that moment its nine steps from 11 to 2 are rings.
- That the shader and `roomLight` agree is known from the pictures (within one step at every point measured), not from a
  test: the unit tests check the arithmetic in JavaScript and the numbers in the shader's text.
- All of it was judged on screenshots of one machine. How deep a black of 2 to 7 looks depends on the screen and the
  room it stands in.

## 191. A glow that is there on every machine, in each area's own colour, and never too much; the black blocks' edge glow (21 November)

The owner, 21 November, evening: "The glow needs to be fixed, and the glow for the black parts of the motor strip also
need to be fixed. Right now, there's essentially no glow, and it's too much before as well." Message 208: "The black
motor parts should have some edge glow." Still standing: Message 2 ("an optogenetic glow activation but with different
colors/shades for each are with the same corresponding color/shade across all 3 items"), Message 159 ("let's make brain
activation almost bright white"), Message 177 ("have the whole brain light up slightly, faintly, with whatever color
area is being picked"), Message 203 ("as bright as possible"), and the three times it was too much (Message 133, the
blinking; Message 170, "way too bright"; Message 198, "obstructing the view").

What was wrong, measured before anything was changed. The only thing that spread light beyond a lit block was the
full-screen bloom pass, and that pass is the first thing the automatic picture quality gives up (`HDR_BLOOM.offFromLevel`
1, section 144): on a large or slow display a lit block was a flat white patch for 0.4 s, its own colour gone
(`AREA_LOOK.areaWhite` 1), nothing round it. Between activations the area under the look had only a weak light
multiplied by its own colour: on an area tried before, darker than its untried neighbours; on a black block, nothing.
The whole-brain tint lived for the 0.4 s of a contraction. A black block showed black, or full white for a second,
again at every small look movement.

One rule for the player now: the block you look at glows softly in its own colour; when it switches on it flares
white-hot at its core with a clear halo of its own colour round it for the 0.4 s of the contraction; then the soft glow
of the look remains. The black blocks have a quiet glowing edge, which brightens under the look. The same at every
picture quality level.

**The halo is worked out in the materials that are drawn anyway (`AREA_HALO`, new module `scene/src/ns-area-halo.mjs`).**
A lit or looked-at block lights the surface round it in its own glow colour: the neighbouring blocks and the brain
tissue beside the strip, strongest at the block's edge, at a quarter half way out and gone at the reach. The cortex
shader and the area shader both ask one small function, `nsHaloAt`, how much of each halo lands on the fragment's place
on the brain (its rest position in the brain's own millimetres), so the pool lies ON the surfaces: it is behind the
bodies in front of them, it follows the folds, it is the same at every quality level and it needs no extra pass and no
`HDR_BLOOM`. While no halo is on, the shaders skip it (one uniform, `nsHaloN`); at most six halos at once (`slots`: the
look, a lit area, both hands' and both feet's areas of a Space grip).
The block's shape (`haloShape`): a block is a band across the gyrus, over the crown and down both banks, often bent
like a V. Its shape for the halo is a line of five points through the middle of that band (the end of one bank, a
shoulder of the crown, the crown's middle, the other shoulder, the end of the other bank) with the radius of half the
block's width, so the halo starts at the block's own edges all the way round. The points come from the strip's own
triangles, sampled by the same owner runs the area shader draws with (`blockSamplePoints`); the width is the block's
run of the strip coordinate over how fast that coordinate rises on the crown, held to the strip's own scale
(`haloFitWidths`: near the midline, where the strip turns over the brain's edge, the plain measure gave an ankle block
16 mm and a toes block 1 mm). All 54 blocks come out as bands 1.9 to 10.7 mm wide. The reach is two block widths, never
under 9 mm nor over 10 (`reachWidths`, `reachMinMm`, `reachMaxMm`; with 16 the look's pool of the wide neck block lay
over four of the narrow finger blocks beside it and turned them from teal to lilac for as long as the look rested
there): the eye takes about one block width for the pool.
Strengths: a contraction 1 (`lit`, times the area's own glow strength, so the halo rises and ends with the area's light
and nothing of it stays on the way back); the look 0.8 (`look`; 0.4 at first, then 0.55: two independent checks
found the pool round a looked-at block only next to its edge, +1 to +8 of 255 in the band round it, and the lead asked
for a glow seen at a glance at normal size); a Space grip's areas 0.4 (`held`); a held posture's calm light (the neck
while the head is turned) none.
On the tissue the pool takes the halo's colour and keeps the tissue's own light and shade (`tissue.mix` 0.6 at the
block's edge, `gain` 1.12, `lift` 0.12, plus `add` 0.3 of added light so the pool also shows in the shade of a fold;
0.2 before the second check),
cut at display white. (At first `mix` 0.85 and `add` 0.1: the check saw the pool in a shadowed fold beside the gold
hand block as a dull olive stain, the tissue's colour replaced by the glow's but its darkness kept.) The neighbouring
blocks take the LIT part of a halo whole, as added light (`strip.add` 0.45), and of the look's part only a narrow band
past the block's edge (`strip.look` 0.6 within `strip.lookReachMm` 1.5 mm): under a look they keep their own colour
beyond a soft fringe over the gap. (At first they took the look's part at the full reach: with the look resting on the
wide neck block the check saw the cyan thumb and finger blocks beside it turn violet for as long as the look stayed;
then none of it, and with the look at 0.8 a block among blocks, the elbow, showed no glow round it at all, +1 of 255.) The gaps between blocks and the
black blocks take none.
Tried and dropped: the halo as more slots of the living brain's tissue bloom (`BRAIN_LIVE.bloom`, section 89): its
slots carry the swell of the vertices, a disc, and fade over 0.8 s, so the tissue stayed tinted long after the
contraction (a browser hunt of update 63 saw it "turn lilac and fade only slowly"). The bloom keeps its swell, its
dimple, its rosy flush and its ring; its own spill of the key's hue and its light above white (seen only where the
bloom pass runs) give way to the halo. One capsule on the crown: the visible band is the crown and the banks (the brain
surface is cut away over the strip), so the pool sat on the crown only. The along-strip direction from regressing
position on the strip coordinate: wrong for a bent block, widths from 2 to 39 mm.

**The lit block keeps its white-hot core and shows its colour (`AREA_LIT`).** Its middle is white (Messages 159, 203:
`areaWhite` stays 1). Toward its two borders along the strip (5 CSS pixels in, at most a third of the block's width
from each side; the outer two fifths of that the colour whole, `rimFull`, the rest running into the white) and down
its banks (from 1.5 to 5 mm of relief depth) its light is the area's own vivid colour at 1.15
times display white on its brightest channel, the colour whole; its fresnel rim is that colour too (it was white x 2).
The keys' "white-hot frame" added twice the emission's own colour on top (`BRAIN_KEYS.frameGain` 2): past white per
channel, where the screen cuts each channel off, so an azure key's frame showed cyan-white and an orange key's yellow.
`frameGain` is 0: the rim is the frame.
`AREA_LOOK.areaGain` 3 -> 1.6. On the screen the white core is white either way (anything at or above 1 is cut at
white), so this changes nothing where the bloom pass does not run; where it runs, light above white is what it
spreads, and at 3 (7.5 at the flash's peak) that was a white halo over the neighbours on the full quality level only
(sections 101 and 132 each cut the gain, from 2.4 and from 1.8, because the lit key's bloom hid its shape and its
neighbours). The halo is now the materials' at every level, and the bloom adds a little softness to the white core.

**The look's own soft glow (`LOOK_GLOW`).** While the look rests on an area, lit or not, tried before or not, the area
shows its full colour and its full self-light (`unvisit`: the "visited" dimming of section 126 is lifted for as long as
the look is on it and comes back when the look leaves; the marking itself is untouched) and throws the halo at the
look's strength, steadily: eased in and out over 0.15 s (`AREA_HALO.easeS`), no pulse, at once under
`prefers-reduced-motion`. It is a pointer light, not activity: it starts no movement, no beam and no muscle light.

**The whole-brain tint follows the look (`BRAIN_PICK_TINT.look`, `pickTintWant`).** Message 177's faint cast followed
only the strongest link that draws a line, and since the look's own link went (section 184) that was the 0.4 s of a
contraction, hardly eased in before it eased out. It now takes the colour of the area the look rests on for as long as
the look stays (a lit area during its contraction first, as before), eased over 0.18 s as before. How much is unchanged:
the gain of section 187 (`BRAIN_PICK_LOOK`). A black block has no colour of the body's code and tints nothing.

**The black blocks (`ABYSS_EDGE`, `areaFlares`).** At rest each of the six in-between blocks carries a soft glow along
the INSIDE of its borders: brightest at the inner edge of its black border, gone 9 CSS pixels in (a linear falloff,
`falloffPower` 1), constant in screen pixels, in one cool light blue on both halves of the brain (sRGB 120, 160, 235
at 0.9 of its strength): it reads as light. Its borders are the two ends of its run along the strip
(exact, from the strip coordinate, as the gap between blocks is). At most 0.38 of the block's width from each side, so
a narrow block keeps a black middle. Under the look the glow is 13 pixels deep at full strength, and the block's
frame is drawn in the same light blue, 1.4 CSS pixels wide (`framePx`), in place of the white hover frame (2.8 px);
the block throws the look's halo in that colour at 0.6 of the look's strength, on the tissue only. (At first: sRGB
150, 170, 205 at half strength, 4 pixels in, and also a glow along the gyrus's outline as seen, where the surface
turns from the eye. The check saw a thin steel-grey line with a streak along the lower bank, and under the look a hard
white outline; the owner, Message 146: "much darker blacks instead of ugly grays". The outline term is off, `face` 0.
Then 0.6 of the colour, 6 pixels, falloff (1 - t)^2: a second check still saw at rest a thin dark-blue line, its peak
66, 89, 133, darker than the pink beside it, because the brightest part of the squared falloff lay under the ink and
the gap's cover.)
A black block moves nothing, so it is never drawn switched on (`shownActivity`): no white fill, no one-second flash,
no relight at each small look movement. The activity itself (`ns-actions.mjs`) is not changed: the area is still
marked as tried. Its card says what it shows now: "Nothing: its edge glows brighter while you look at it, and it
gets marked." (it said "it only lights up"; the three longer texts the same). The gaps between blocks stay matte black.
The edge glow is added after the keys' press and focus rules: it never reacts to another area's activity, and nothing
in what is picked changed. The unfinished draft of this morning (`ABYSS_EDGE` with 40 samples of the outline pass's ink
picture per fragment and a distance field per block) was read and not used: the area shader already has both
distances, and the draft was never run.

**The tissue ring is calmer (`BRAIN_LIVE.bloom`).** The ring of a movement being switched on and the bloom now take
the area's own glow colour (they took the area's emission, near white while lit). In that colour the old ring was a
wide wave over 41 mm of cortex that ran on for 0.4 s after the contraction had ended: it now ends with the contraction
(`pulseS` 0.8 -> 0.45), runs half as far (`pulseTo` 2.4 -> 1.3, 22 mm), takes a third of the tissue's colour (`pulse`
0.75 -> 0.25; at 0.4 it was still a pale-blue band right across the cortex beside a lit elbow area) and carries no
light above white (`pulseGlow` 0.3 -> 0).

**No dark dip at the end of an activation (`KEY_PRESS`, `keyPressed`).** The keys' press of section 83 (the key
darkens and a dark frame closes in for 0.2 s at each new activation count) came, for a look, 0.5 s after the look
started, when its 0.4 s of light had just ended: between the lit block and the look's glow it was a dark dip of about
0.1 s (the check measured the block's middle 221 lit, 99, then 170 under the look; 254, 74, 139 on update 63), one
blink per activation (the owner, Message 133). The key is now pressed by the count's SOURCE (`KEY_PRESS.bySource`):
ns-app hands `updateRegions` the step's activation marks (`ns-actions` `stepGated`), and a key is pressed when its
count rose and a click was marked on its area in the same step (a click, a tap on a muscle, a number key), never for
the look's count. So the light falls from lit to the look's glow without a dip, on every area. (The first version told
them apart by time, no press for a count within 0.3 s after the light ended; a second check found it lost the press of
a click late in its frame 0.1 to 0.3 s after the light, 4 of 20 frame phases at 60 frames a second and 11 of 20 at
144, and still pressed at the look's count on the tongue and the black blocks, which never light: a 5-frame dip half a
second into the look. The time rule stays for an app that hands no marks.)

**The tongue areas do not flare (`NO_FLARE.noMovement` true).** The two tongue areas are coloured but move nothing:
they lit for about a second on a click (violet with a white core) and could relight at small look movements. Like the
black blocks they are now never drawn switched on: under the look they glow in their own colour like any block, a
click presses the key and gives a soft glow (below), and they keep their mark. Their card now says "No tongue movement or muscle colour change. It
glows while you look at it and keeps a mark once tried." (it said "This area can still light up"), and the three
longer texts say "marks" for "can light and mark". `tests/browser-punch-in.mjs` read the tongue's light rising on a
click; it now reads that it does not rise (restated with the lead's agreement).

**A click on an area that does not flare glows softly (`CLICK_GLOW`, `clickGlow`).** With no flare, a click on the
tongue or a black block showed only the key's press (the second check: the block's middle 185, then 137 for about six
frames); a player could think it did not register. A click now gives the area's halo a soft rise and fall in the
area's own colour (a black block: its edge glow's light blue) for the 0.4 s a contraction lasts, at half a
contraction's strength (`lit` 0.5, sin over the 0.4 s, steady under reduced motion): no white core, no flare, and only
a click starts it (the activity's click mark), so a small look movement relights nothing. `tests/browser-punch-in.mjs`
now also reads that the click on the tongue pressed its key once.

**The colour key says "Black in-between areas"** (`ns-text.mjs`; it said "Grey" since update 61).

**Muscles: looked at, not changed.** At the cheapest quality level (no bloom pass) a lit muscle of the mirror body
reads plainly in its area's colour: the elbow bender is a pale azure among rose-red muscles for the lit time and rose
again after it. Nothing was changed: no halo shell (`MUSCLE_HALO` stays off, section 172), no see-through muscle,
nothing lit on the way back.

**Measured.** Pictures at 1600 by 900 with the same look path on the lead (`e489c67`) and on this branch, so
the looked-at block lies on the same pixels in both; the page's clock was slowed twelve times while a contact sheet of
every drawn frame was recorded, so the 0.4 s of a contraction is seen frame by frame on a machine that draws a few
frames a second. The block's mask is the lead's lit block (white), used on both builds; "ring" is the pixels 3 to 12
pixels outside it. Colours are sRGB 0..255 means. "Low" is the cheapest quality level (no bloom pass), "high" the full
level with the bloom pass.

| what | quality | before | now |
|---|---|---|---|
| Left elbow area (azure): the ring while lit | low | 73, 87, 120 | 68, 118, 166 |
| | high | 72, 89, 125 | 57, 105, 153 |
| the ring under the look alone, the area tried before | low | 57, 74, 115 | 70, 108, 156 |
| | high | 57, 72, 116 | 58, 87, 133 |
| the block under the look, tried before | low | 105, 162, 204 | 115, 194, 235 |
| | high | 100, 149, 181 | 110, 182, 210 |
| the block while lit (the region that was all white) | low | 253, 253, 254 | 183, 229, 250 |
| | high | 255, 255, 255 | 190, 237, 251 |
| the cortex far from the block, under the look (the tint) | low | 134, 97, 99 | 136, 101, 105 |
| | high | 135, 97, 99 | 135, 100, 105 |
| Right elbow area (orange): the ring while lit | low | 126, 80, 49 | 170, 101, 48 |
| | high | 148, 97, 70 | 169, 103, 53 |
| the ring under the look alone, tried before | low | 131, 84, 50 | 152, 95, 51 |
| | high | 135, 80, 51 | 148, 93, 53 |
| the block under the look, tried before | low | 211, 162, 129 | 239, 196, 148 |
| | high | 199, 155, 124 | 224, 193, 146 |
| the cortex far from the block, under the look (the tint) | low | 178, 133, 134 | 185, 134, 131 |
| | high | 178, 133, 133 | 187, 135, 132 |
| A black block at rest: its edge band (4 px) / its middle / the ring outside it | low | 6, 5, 6 / 4, 4, 5 / 154, 95, 133 | 36, 39, 49 / 4, 5, 5 / 153, 95, 134 |
| | high | 4, 3, 4 / 4, 4, 5 / 155, 95, 134 | 30, 33, 41 / 5, 5, 6 / 156, 96, 136 |
| under the look: the band inside the white frame / its middle | low | 8, 8, 9 / 7, 7, 8 | 34, 38, 47 / 7, 7, 8 |
| | high | 8, 7, 8 / 7, 7, 8 | 47, 54, 65 / 7, 7, 8 |
| under the look: the ring outside it | low | 114, 85, 97 | 125, 104, 117 |

Read: before, the bloom pass added almost nothing round a lit block even on the full level (the azure ring 73, 87, 120
without it and 72, 89, 125 with it): the lit block was a white patch at every level. Now the ring takes the area's own
colour by 30 to 45 of 255 at both levels, and the two levels agree within about 13. Under the look the area tried
before is as bright as an untried one (it was darker than its neighbours), with a pool of 20 to 40 round it. The tint
moves the cortex far from the block by 3 to 9 of 255 toward the area's colour (azure: green +3, blue +6; orange: red
+7 to +9, blue -1 to -3). The black block's middle stays black; before, it turned white for a second under the look
(block mean 254, 254, 254 in the first second), now never. Frame times of the sheets and the pictures are in the
work folder of the round (not in the repository).

After the independent check (the changes above), at the game's real speed, the same look path as before (the
lead / this branch before the check / now; "ring" as above, "annulus" the band 28 to 70 px round the crosshair):

| what | quality | lead | before the check | now |
|---|---|---|---|---|
| Left elbow under the look: the ring | full | 57, 73, 116 | 58, 87, 134 | 70, 95, 145 |
| | low | 58, 75, 116 | 71, 109, 157 | 70, 98, 146 |
| the annulus 28 to 70 px (mostly the neighbouring blocks) | full | 64, 99, 117 | 66, 104, 124 | 67, 104, 123 |
| the block's middle (brightest channel), frame by frame from lit to the look's glow | low | 254, 74, 139 (the check's patch) | not taken | 231, 227, 215, 186, 188, 189, 190 |
| | full | | 225, 223, 207, 193, 108, 108 | 226, 226, 210, 182, 184, ... (rising by 1 a frame) ..., 193 |
| A black block in the start view: its edge band (4 px) / middle | full | 4, 3, 4 / 4, 4, 5 | 32, 34, 42 / 4, 5, 5 | 27, 36, 56 / 5, 6, 8 |
| The middle black block under the look: edge band / middle | low | 8, 8, 9 / 7, 7, 8 | 34, 38, 47 / 7, 7, 8 | 39, 52, 78 / 8, 8, 10 |

With the look on the neck the cyan thumb and finger blocks beside it keep their colour (the pool is on the tissue
only); in a shadowed fold beside the lit gold hand block the pool is a warm gold light; a click on the tongue lights
nothing but its key's press. The annulus round a looked-at block hardly changes now that the neighbouring blocks take
none of the look: the look's pool shows in the ring next to the block and on the tissue.

After the second check, real speed, cheapest level, the same look path (the lead / after the first check / now):

| what | lead | after the first check | now |
|---|---|---|---|
| Left elbow under the look: the ring / the annulus 28 to 70 px | 58, 75, 116 / 64, 99, 117 | 70, 98, 146 / 67, 102, 121 | 71, 100, 149 / 68, 104, 123 |
| Right elbow under the look: the ring / the annulus | 132, 85, 51 / 150, 125, 75 | 153, 96, 52 / 159, 129, 76 | 167, 114, 69 / 162, 135, 83 |
| A black block in the start view: edge band / middle | 4, 3, 4 / 4, 4, 5 | 35, 41, 62 / 5, 6, 8 | 50, 62, 94 / 19, 25, 36 |
| The middle black block under the look: edge band / middle | 8, 8, 9 / 7, 7, 8 | 39, 52, 78 / 8, 8, 10 | 64, 85, 126 / 24, 31, 45 |
| The tissue beside the tongue after a click (brightest channel) | white for a second | 106, flat | 106, rising to 152 at 0.2 s, back to 106 by 0.4 s |
| The left elbow's middle from lit to the look's glow | 254, 74, 139 | 225, 223, 207, 193, 108 (full level) | 231, 230, 225, 197, 198, ... 201 |

**Checked.** 529 unit tests pass (twelve new, `tests/area-halo.test.mjs`: the strengths, the black blocks' states, the
block's shape, the halo's state, the lit and the looked-at block's colours, the tint that follows the look, the shader
text composed on the real area shader). `?case=boot` ok. Browser tests, each alone on the processor: `browser-startup`,
`browser-keyboard-aim` and `browser-punch-in` pass (a first try of all three, with the load at 17, ended at their own
60 s page waits before the game had loaded). Frame table (frames a second, still / looking round / up and down / the
limb turn; this branch and the lead in turn): this branch 47.5 / 23.1 / 29.5 / 34.1 (taken while two other suites of
unit tests were still running: every part of the frame was slower, the parts this change does not touch too, and the
load took 15.6 s against 11 to 12), the lead 58.8 / 31.5 / 36.6 / 40.2, this branch 60.3 / 36.5 / 41.4 / 47.1, the
lead 59.2 / 35.6 / 50.1 / 18.9. The machine was shared with other work throughout, so single numbers jump (the lead's
18.9 and 50.1 are in one run); nothing in them says this branch is slower. The script's time to draw a still frame:
4.9 ms here against 6.0 and 5.1 on the lead in the three quieter runs. While nothing is lit or looked at the halo
costs one comparison per area and nothing is written; a still view stays idle.
After the check: `tests/area-halo.test.mjs` (17 tests, five new) and the files whose words or constants changed
(`area-words`, `hud-words`, `bodymap-moves`, `brain-live`): 41 pass; `browser-punch-in` passes with its tongue
expectation restated; `?case=boot` ok (on the last commit); the whole unit suite and the frame table were left to the
lead's run on the merged work. After the second check: `area-halo` (19 tests), `area-words`, `hud-words`,
`bodymap-moves` pass; `browser-punch-in` passes (the tongue's click pressed its key once, its drawn light did not rise); `?case=boot` ok. Pictures looked at, real speed,
cheapest level: the left elbow, the right elbow and the neck under the look beside the lead and the first check's
version, the start view's black block, the tongue's click sheet. Pictures looked at, real speed, full and cheapest level: the elbow's, the neck's, the
gold hand's and the middle black block's contact sheets and resting looks, the tongue's click, the start view's black
block beside the lead's and the earlier one.
Before the check: pictures looked at: the contact sheets of the left elbow, the right elbow and the middle in-between area at the low
and the full quality level on the lead and on this branch; the lit and the looked-at block side by side at both
levels; the same three areas at real speed on the full level, and two of them at real speed on the cheapest level
under reduced motion; close pictures at twice the pixel density of a looked-at block and of a black block at rest and
under the look; the start view, the outside view and the view after
two presses of R, lead above this branch (the same but for the black blocks' edge glow); the mirror body's lit muscle
at the low level.

**Not done, or not right.**
- Seen at the game's real speed in five runs (the full and the cheapest level, reduced motion once) and by the
  independent check. The first table's numbers were taken with the page's clock slowed twelve times, before the
  check's changes. The owner's display was not examined.
- The look's glow round a block now shows at a glance where tissue lies beside it (the right elbow's band 28 to 70 px
  +12 to +17 of 255 over the lead, the gold hand block) and as a soft fringe over the gaps; round a block among blocks
  (the left elbow) the band is still only +4 to +6 over the lead: more would hide the neighbours' colours.
- Under the look the neck's narrow fringe lies as a pink edge across the first 1.5 mm of the cyan finger blocks
  beside it; beyond it they keep their teal.
- With the longer, linear edge glow a black block's middle is no longer quite black: 19, 25, 36 at rest, 24, 31, 45
  under the look (dark navy), with the light blue at its edges.
- After a look's light the right elbow's middle falls from 195 to 180 for two frames and comes back to 191 over 0.15
  s: no dark dip, but a small undershoot.

- A click on an area with no movement (the black blocks, the tongue) gives only the key's press and the soft click
  glow round it: no light of its own on the block. That "only what moves lights up" is this package's rule (the
  brief's and the lead's decision), not the owner's; he was not asked.
- A black block's edge glows along its two ends on the strip only; at the strip's outline (its other two sides) the
  strip's dark ink line is all there is. Both halves of the brain use the one cool light blue (the colour table's own
  pale glow colour for the left half's black blocks is a warm one, unused).
- The pool on the tissue is small where the tissue next to a block lies deep (the brain surface is cut away over the
  strip, so what is beside a block on the screen can be 10 mm or more from it in the brain): round the elbow blocks it
  shows mostly on the neighbouring blocks. The reach is never under 9 mm, so round a 3 mm block the pool is about one
  and a half block widths, not one.
- Next to a lit light-coloured block (the cream and pale-orange blocks of the right arm) the white core stands out
  less than next to a deep one: the neighbours are light themselves.
- The blocks' shapes were looked at in pictures for the elbow, neck and middle in-between blocks only; the other 50
  were checked by their measured widths (1.9 to 10.7 mm), not by picture.
- The whole-brain tint is as faint as section 187 left it (3 to 9 of 255 on the cortex); it now lasts as long as the
  look does. If it should show more, raise `BRAIN_PICK_LOOK.lift` first.
- The living brain's rosy flush and dimple round a looked-at or lit block (section 89) still ease out over 0.8 s
  (`BRAIN_LIVE.bloom.outS`): after a contraction the tissue next to the block stays a little rosier for about a
  second. Its coloured part is gone (that is the halo now, which ends with the light); the flush was left.
- `PREVIEW-NOTES.html` has no entry for this change: its entries are numbered by published update.
- Muscles on the full quality level still flash white with the bloom pass at switch-on (not touched here).

## 192. The electrical map: M shows the nervous system as lines of light, and the signals are seen to travel, brain to body and body to brain (21 November)

The owner, 21 November: "Let's continue working on the neurosurge game. And let's try an electrical mapping view, like
you see in functional neuroscience, connectomic live maps, dynamic maps." And on 20 November: "we want a view of brain
activity, a very specific view of brain activity, like a connectomic activity map, or something like that, or a
functional neuroscience map where we can actually see activity, color-coded, etc. And that's probably what we want to
update the neuroscience game with, rather than just a simple motor strip, so we can actually see electrical storms and
electrical activity and neural activity and networks and pathways, etc., etc., throughout the entire body, from brain to
body and body to brain. And then we can tie that to muscle contraction."

**What the player gets.** Press M: the picture goes dim and the nervous system appears over it as fine lines of light:
fibres fanning from every block of the motor strip down through the brain to the brainstem, a cord down the mirror
body's spine and down your own, nerves into the limbs, the trunk and the face. At rest the wiring glows faintly and a
few slow sparks drift along it. Switch an area on as always, with a look or a click: a bright front in the area's own
colour runs from its block down its own route, crossing sides where the real fibres cross, out along the nerve to the
muscles of that movement, each of which gets a soft mark of light as the front arrives; paler beads then run back up on
their own line beside it to the sensory strip just behind the block, where a soft patch glows and fades; fainter pulses
run from the block to the brain regions it is linked with. Move a limb with the keys, grip with Space or turn the limbs
and the same routes carry traffic both ways. Press M again: the ordinary view is back as it was.

**A view of its own, on M** (`EMAP_CODE`, `toggleEmap` and the `onEmap` option in `ns-controls.mjs`; `setEmap` /
`toggleEmap` / `emapFrame` in `ns-app.mjs`). The key is wired like R, a page command: one `{ type: 'emap' }` request
per press, taken from the browser, never on auto-repeat or with Alt, Ctrl or Meta, only while playing. The state is
`data-ns-emap="on|off"` on the app root; off at the start of every session; it stays through a pause and through the
outside view (E); Reset body clears the lit routes and leaves the map as the player set it. It changes no camera, no
control and no movement, and with the map off the ordinary picture is not changed in any way: nothing of the map is
drawn and its part of a frame does not run. The map is a separate picture with its own light rules: traces, travelling
beads and the report on the way back are allowed here, although the ordinary view shows nothing on a movement's way
back (Message 206, section 177). M is on every list of keys: the Shift rationale in `ns-controls.mjs`, the Esc page's
rows and its "Views and reading" group, the keyboard picture (`KEYBOARD_PICTURE_ROWS`: right of N), the capture line ("Click to look around · M: electrical map · Esc: controls"),
`PLAYER-GUIDE.md` and `PREVIEW-NOTES.html`.

**The dark ground** (`EMAP.dim` 0.68, `EMAP.easeS` 0.3 in `ns-emap.mjs`). One clip-space quad drawn after everything
of the ordinary picture (order 200; the 3D arrows are at 100) multiplies the finished picture by 0.32, eased in and
out over 0.3 s, so the bodies and the brain stay as a dim setting. No existing material is touched, there is no new
render target and no dependence on the bloom pass.

**One geometry, one shader, drawn twice** (`ns-emap-three.mjs`: `createEmapView`, `emapShaders`, `EMAP_LOOK`). Every
wire is a ribbon of two vertices per node and every mark a small quad, all in one static geometry (1427 lines, 566
marks and 49 278 vertices with the wiring data of section 193). A vertex carries its rest place in the atlas's
millimetres, what it rides, and its coordinate along the route; the graphics card poses it from a small texture of
world matrices (the "palette", 253 rows: the big brain, then the 104 segments of the body rig and the 22 of the left
game arm for the mirror body, then the same for your own body; written when the dark ground is about to be drawn, and
sent to the graphics card only when a matrix changed, so a still view with the map on sends nothing but the clock),
and lights it from two more small textures (which lit area has which wire; each lit area's colour, level and start
time) and a clock. The lines are drawn once in front of what is there at full strength and once where something stands
in front of them, weaker (`EMAP.light.hidden` 0.4 for the resting wiring, `hiddenLit` 0.68 for a lit route, which must
still read inside the brain), so the whole wiring is seen and the picture keeps its depth. The light is screened onto
the picture and clamped at display white: the map looks the same at picture quality High and Low, with and without
the bloom. The lines are not registered with the outline pass and are never picked. A line's half width is its width
in the world at its distance, kept between 0.55 and 1.7 CSS pixels; it fades out nearer than 0.42 m to the eye; in the
eye view the wires of your own head and neck, which are not drawn there, are not drawn either.

**The routes** (`buildEmap` in `ns-emap.mjs`; `EMAP_STATIONS`, `EMAP_NUCLEI`, `EMAP_BRAIN_MESH`). Typical, simplified,
laid by hand; nothing is traced from a scan.
- In the big brain: from each movement's own part of the block (the area's key points, `rec.keys`) a twig to a hub
  7 mm under the block, then one fibre per area through the internal capsule of the same half, the midbrain, the pons
  and the medulla, each placed as a share of that mesh's own box, the leg's fibres behind the face's in the capsule and
  outside them in the brainstem. An area whose way out is the cord gets a tail that crosses to the other side low in
  the medulla, and a second, uncrossed tail where a muscle of its own side needs one (drawn weaker by the area's
  `laterality` field: `EMAP.sameSide`); an area of the face, jaw, tongue or throat gets a tail to the place of each
  head nerve it needs in the brainstem, on that nerve's side; the in-between areas get no fibre down at all, only
  links. Which ways out an area gets comes from the muscles the game itself lights for its movements.
- A drawn bridge joins each way out of the big brain to the same place of the mirror body (the top of its cord's
  strand, or the first point of a head nerve): the big brain is that body's own brain, drawn large and outside it, and
  the legend's detail says so. The sixteen bridges leave the big brain as ONE bundle through a point under the
  medulla and part only near the mirror body's head: drawn each on its own straight way they fanned across the
  picture like a kite once the brain was turned (seen in a picture). Each rests at 0.25 of the idle light
  (`EMAP.idle.bridge`; 0.6 and 0.45 made the bundle the brightest thing of the resting picture).
- In each body: the cord as two strands in the canal, 2.6 mm either side of the canal's centre line as section 193's
  data gives it (`cordCourse`, `caudaCourse`), down to the cord's tip; the roots from the strand at their levels along
  the data's own root courses (`rootCourse`: the low ones run down inside the column first, each leaves through its
  own opening); every nerve and branch of the data on both sides; one twig per muscle from the data's course point for
  that muscle to its point in the belly. Posed places come from the pose's own segment matrices
  (`poseBodyDetailed().segments`, rest to drawn). Nothing is re-skinned.
- Where a line passes from one bone to the next it changes what it rides within 24 mm either side of the joint between
  them (`EMAP.jointMm`; over more where the line passes far from the joint), where both bones put it at the same
  place. The first build blended all along the stretch between two course points, which bent the lit lines into
  zigzags on bent limbs (seen in the first Space-grip picture). Where the joint lies beside or beyond that stretch the
  change was at first squeezed against the stretch's end, into one node step: with W held the lit nerves of your own
  raised arm were stair steps at the shoulder (seen in a picture; measured in Node with the arm's bones turned 80
  degrees about the shoulder: one 9 mm step of the plexus became 39 mm with a 91 degree turn, one of the nerve to the
  latissimus 104 mm). The change now keeps its width, up to the whole stretch (`jointBlend`; the same case: 25 mm and
  57 degrees, and 44 mm).
- The left arm is the game arm's rig: the left side's course points on the upper arm, forearm, radius, hand and digits
  ride that rig's segments, on your own arm and on the mirror body's.
- Back up: per area and way out one fibre from that way out up the back of the brainstem, across where the way down
  crossed, past a point inside the capsule's inner face (the atlas has no thalamus) to the point of the postcentral
  gyrus nearest to 11 mm behind the block.
- Links: from the block along the wiring data's links of its precentral gyrus (to the sensory strip behind it, the
  same block of the other half over the middle, the frontal gyri in front, the cerebellum's other half by the capsule
  and the pons); links between other regions are drawn as the resting network.

**The nerve data is section 193's** (`ns-wiring-data.mjs`, merged into this work). The courses, the level of each
nerve and the nerve of each muscle are that module's: 89 nerves and branches a side, six head nerves a side that
leave the brainstem, the canal, the roots, 292 muscle rows and the brain's 53 links. The map takes it as one object (`NERVE_TRUNKS`,
`nerveForMuscle`, `MUSCLE_NERVE_BY_ID`, `mirrorTrunk`, `CORD_LEVELS`, `cordLevelAt`, `cordCourse`, `rootCourse`,
`BRAIN_LINKS`, `rootWay`) and `ns-app.mjs` fetches the module at the first M press, not with the page (187 kB that
the game needs for the map only). In the data's final shape every nerve id says its side (`r_…`; `mirrorTrunk` gives the left
twin as a record of its own, `l_…`, whose points on the left arm name the game arm's segment as `armSeg`), and
`nerveForMuscle` answers with the nerve of the muscle's own side; the builder takes both that shape and the
stand-in's. With it the model has 178 nerves and branches, and all 337 muscles (the 292 of the body rig and the 45 of
the left game arm) hang on their data nerve, with no warning. Each root of a nerve of the cord ends at the point
where the data says it joins its nerve (`rootWay`; at first every root ran to the nerve's first point, which drew the
lower roots of a plexus climbing up to it), and the nerve's time coordinate is its middle root's at that root's own
join point; the accessory nerve's roots leave the cord's side inside the canal, so it is drawn as a nerve of the
cord. A
muscle whose name the data did not know would take the nearest nerve of its own side (a head nerve only for a muscle
of the head). A plain stand-in in the same shapes stays as the fallback when the module cannot be loaded
(`ns-emap-standin.mjs`, `makeStandinWiring`: one run per body part along the rig's joint centres; the legend then
says so); the model's tests run with both.

**Colour says which area** (`EMAP.colours`). A lit route is in its area's own glow colour (`ns-colors`
`areaGlowColor`, scaled to full brightness and 22 % toward white, `whiteLit`: the violets and blues would not read on
the dark ground); the resting wiring is one cool grey-blue; the report keeps the hue, 62 % toward white (`paleUp`),
with smaller, closer beads, and runs on its own lane beside the command's line (the command on the right of its
direction of travel, like traffic), so the two directions are told apart without colour. The front's head and the
strongest light go toward white.

**What moves, and when** (`emapStep`, `emapLightAt` and the shader built from the same constants). Every node has one
time coordinate: the display time at which a front that entered the cord at 0 reaches it. A volley is then a start
time, a start coordinate, a level and a colour, and each lit wire how far the route uses it and when the report
enters it; fronts, beads, marks and pulses are worked out per pixel from those.
- Speed. Real large nerve fibres conduct at some tens of metres a second: the clinical values for human limb nerves
  are about 50 to 60 m/s in the arm and 40 to 50 m/s in the leg, and the fastest fibre class of the textbooks is
  quoted at 70 to 120 m/s (standard teaching values, written from memory here, not looked up again). `EMAP.realMmS`
  takes 50 m/s. The command's front runs at one display speed, at least `speedMmS` 12.5 m/s and raised by the build so
  the farthest muscle of any movement is reached within `arriveMaxS` 0.16 s of the start (the game starts the movement
  at once; its timing is not changed). The farthest is a short flexor of the left big toe at 2.22 m of route, so the
  speed is 13.9 m/s: 3.6 times slower than real. The report runs at 0.3 of that (`upShare`): the farthest is back at
  the strip half a second after its muscle lit; 12 times slower than real. The legend states
  both in round numbers, worked out from the model (`emapSlowLine`). The bridge counts as 150 mm (`bridgeMm`).
- A volley. The front leaves the block at the activation; behind it the route keeps a steady light (`light.hold`
  0.42) with soft beads flowing down (1.0 a second past a point, long tails, `EMAP.bead`); when the movement's own
  light ends the route fades over 0.8 s (`fadeS`). A muscle's mark comes up as the front arrives (`EMAP.dot`). The
  report starts at each muscle when its front arrives and flows up (1.2 beads a second, paler, smaller); its patch on
  the sensory strip glows when it arrives. Pulses run out along the block's links in 0.7 s and are gone within a
  second (`EMAP.link`).
- The player's own movements (links whose source is keys, Space or the limb turn, the limb turn's and the
  head-following links): the same routes at their level, traffic both ways while they last. A look or a click sends a
  new front each time, also while the last one is still fading; a held movement whose light comes and goes with its
  speed rejoins the light that is there without a new front (no flicker of fronts). The crosshair on a muscle shows
  that muscle's route as a steady faint hint.
- Rest: at most six sparks (`EMAP.spark`), one starting about every 0.7 s, each on a line chosen at random, rising
  and fading over 1.5 to 2.8 s while it drifts a little.
- Focus: while a route is lit the resting wiring is drawn 60 % weaker (`EMAP_LOOK.focusDim`, in over 0.12 s, back over
  0.5 s), so the lit route is the brightest thing in the picture (the game's own rule for its keys, section 83).
- Calm: nothing goes bright, dark and bright faster than three times a second (beads at 1.5 and 2.2 a second on a
  steady light that never drops to dark between them); the brightest things are small. Under
  `prefers-reduced-motion`: lit routes without travel and without beads, steady, and no sparks.

**Words** (`EMAP`, `emapRouteLines`, `emapSlowLine` in `ns-text.mjs`; `ns-emap-card.mjs`; `.ns-emap-*` in
`quiet.css`). One small card at the top right, away from the other cards, only while the map is on, following the R
key's levels. Short card: the title, "Command: brain to muscle", "Report: muscle back to brain", each with its mark,
and "A drawn picture, slowed down. Not a recording." More detail: the route of the area under the look (the area's
own sentence about its fibres from `plainDetail` where it has one, without its bracketed terms, else one plain
sentence from its pathway and laterality; how the signal goes on, down the cord or straight out along a nerve of the
head or upper neck; the report; "A typical route, simplified."), and, until an area has been looked at since M was
pressed, what kind of picture this is instead (the big brain is the mirror body's own; the paths typical and
simplified, not traced from a scan; the signal made up by the game, and by how much the travel is slowed). The last
area's route stays while the look is elsewhere, so no text comes and goes as the crosshair crosses a gap. Hidden
level: nothing.
The first More detail was 26 lines of small type under the short card (about 1070 letters; the card 590 px tall) and
lay ON the game's own information panel, which at that level stands at the bottom right and is up to 66 % of the
window high: two texts on top of each other (seen in a picture). The owner's standing note is "Way too much text
now". At "more" the legend is now one low, wide card above that panel (532 px wide, More detail a column to the left
of the short card, which keeps the right edge; never taller than the room above the panel), and its words are at most
nine short lines (at most 311 letters for an area's route, 406 for the general words). The bracketed anatomical terms
of an area's sentence are left to the information panel beside it, which gives the area's text in full.

**Cost** (`EMAP_BUILD` in `ns-app.mjs`; `buildEmapSteps`). Off: nothing is drawn and nothing runs in a frame.
Nothing of the map is fetched or built before the first M press (`EMAP_BUILD.onPress`): neither its nerve data (a
module of about 200 kB) nor, since 22 November, its own modules (`ns-emap-three` with `ns-emap` and `ns-emap-storm`,
`ns-emap-standin`, `ns-emap-card`, about 188 kB: a checker found every player loading them at the start); a player
who never presses M loads none of it, and the page's count of scripts at the start (`PAGE_SCRIPTS`) is as without the
map. At the first press the data is fetched and
the model is built 7 ms a frame (or a quarter of a slow frame's own time), 89 to 145 ms of work in all in the
browser, in 3 to 9 slices; the map eases in when it is done. The first way stays behind the switch: the data fetched
and the model built in idle time (2 ms a frame, from 150 frames into play), so the first press found it ready; it was
dropped the same day because every player then loaded the data. On: per frame the processor steps the state machine (no allocation:
300 000 frames in the unit test without a garbage collection) and multiplies about 250 matrices; the palette is sent
to the graphics card only when a matrix changed; nothing is written per vertex. The graphics card draws three more
draw calls. A failure anywhere in the map (the build, a frame, the palette, which is written inside the game's own
draw) switches the map off for the session and keeps the reason in `inspect().emap.error`: the game goes on.

### Part 3: the map becomes a live brain scan with electrical storms (22 November)

The owner, 22 November about 01:25, about the map as it was (a dark veil, faint grey wiring, one lit route per
movement): "I mean like a live brain scan map where you have electrical wire, electrical storm activity going
everywhere." What is above stays (the key, the veil, the routes, the report, the legend, the load at the first press);
the scan and the storms are added and are now the map's main picture. Everything in them is made up for the game.

**The brain as a live scan** (`emapScanShaders`, `scanSurfaces` in `ns-emap-three.mjs`; `EMAP_STORM`, `SCAN_STOPS`
in the new `ns-emap-storm.mjs`). The brain's surface (the glass in one piece, its geometry shared, not copied, and the
motor areas merged once into one geometry) is drawn a second time over the dimmed picture, pushed out 1.8 mm along
its normals (`EMAP_LOOK.scanInflateMm`: the living brain swells up to 1.6 mm round a key, and the copy must stay in
front of it), coloured on a scan scale: deep violet where nothing happens, through blue, cyan, green, yellow and
orange, to near white only at the hottest cores (`scanRamp`; above a heat of 0.7 the shown heat rises at half the
rate, `scanTone`, so near white needs a heat of 1.3: one storm's core alone stays orange, near white is where a
storm, its hops and a lit area meet). It is screened onto the picture, at most 0.74 strong (`scanAmount`), weaker
where the surface turns away (the square of how much it faces the eye) and in the grooves (the glass's own groove
depth), so the brain's shape and folds stay readable. The heat at a point is one sum, worked out per pixel by the
graphics card from a few small arrays the processor fills once a frame: 12 resting sources on the surface that swell,
drift 16 mm and fade over 36 mm, each with periods of 5 to 15 s (`EMAP_STORM.base`), the live storms (the sums stop at
their count), and the activations. A depth
pass of the same copy comes first and the colour pass tests for the same depth, so only the nearest layer is
coloured. Four draw calls.
What was seen and changed on the way: where pieces of the brain meet, their pushed-out copies overlapped and the colour
was laid on twice (a bright seam along every gyrus: the depth pass); without shading the scan was a flat blue
silhouette (the facing and groove terms); close up with an area lit, the heats summed to near white over most of the
brain, a white-out (storms 0.7 to 1 with a 20 mm core and a 0.6 wave at first, now 0.55 to 0.85, 18 mm and 0.45, the
tone knee and the 0.74 cap); many storms were on the brain's far side, unseen (a storm now starts on the point of its
region nearest the eye of six drawn at random, a point near the midline counting as farther: seen face-on through
the gap between the halves a storm there was a bright block behind the mirror body).

**Wires everywhere, with traffic** (`EMAP.scan`, `buildEmapSteps` in `ns-emap.mjs`). Every link of the nerve data
(53) is drawn as a bundle of six fine fibres, each from its own point of the two regions' surfaces, so the bundle fans
at its ends and is tight in its middle, through the link's stations and, where its fibres change sides, through the
data's two meshes of the crossing (`crossesAt`; over the middle for the great bridge between the halves);
neighbouring surface regions of one half are joined by two short fibres each (86 pairs), sunk a little toward the
half's middle. 492 fibres in all, generated by these rules and stated as drawn, not traced; they rest at 0.35 and
0.3. The areas' own links now rest at 0.3 instead of 0. On every wire of both bodies and the brain small
pulses run at all times (`EMAP_STORM.traffic`): 0.6 to 1.1 pulses a second pass any point, 22 mm apart in the brain,
60 mm on the bodies and 34 mm on the bundles (which therefore run fastest), each wire with its own rate and phase, in
the scan's colours (cyan where it is calm, toward yellow near a storm). Worked out per pixel from the wire's own
numbers and the clock: no object per pulse; on the mirror body's wiring at 0.35 and on your own at 0.6
(`EMAP_LOOK.trafficMirror`, `trafficOwn`: the mirror body's dense, small wiring screened to a white figure at full
traffic). The network's fibres inside the brain, behind its surface, are drawn at 0.5 (`EMAP_LOOK.netHidden`; the
other hidden lines at 0.4; 0.7 at first drew the fibres behind the mirror body over it as a tangle).

**Storms** (`createStorms`, `stormAt`, `stepStorms`). Every one to three seconds a storm starts on a region (a third
of them on the area the look rests on, the others on the side of the brain the player sees): a hot core swells over
0.3 s and calms over 1 to 2 s, and a wave rolls out over the surface at 50 mm/s for 70 mm. Its links fire: on two
of its links a front runs along the fibres at 160 mm/s, and when it arrives the region at the other end flares,
weaker (0.55), and fires on once more (0.3). About a third of the storms also send a volley down the mirror body's
cord. Up to 16 storms (with their hops) are alive at once. The fronts and the volley are lit in the scan's hot
colours, and the wires near a storm take its heat's colour.

**Tied to the muscles** (`stormActs`; the existing routes). When a movement switches on, a storm starts on its block
and fires its links, the block is the hottest spot of the scan while it is lit (0.75 of its level, with the storm's
core), the regions it is linked with warm to 0.3 of its level, the route carries its volley down the cord to the muscles as before, each contracting muscle glows
as a soft spot in the scan's colours (`EMAP_LOOK.muscleScale` 1.6, up to 24 px), and the feeling strip behind the
block warms when the report comes back.

**Calm.** Each curve of light rises and falls smoothly: a storm's light rises once and falls once; the wave's ring is
32 mm wide, so a point under it brightens and darkens once in about 0.64 s; a front's head passes a point in about
0.15 s and leaves it at the storm's steady light; the traffic passes a point at most 1.1 times a second. Under
reduced motion the scan stands still (the resting sources at their places, no storms, no traffic): a steady heat map,
the routes steady as before.

**Words.** The short card gains the scan's colour bar, "Activity: calm to stormy", and its honesty line is now "Made-up
activity, drawn like a live brain scan. Not a recording." (it was "A drawn picture, slowed down. Not a recording.";
that the travel is slowed, and by how much, is said under More detail).

### After an independent check, for update 65 (22 November)

A checker and a reviewer found three major faults; the lead decided how to mend them. These replace the numbers of
part 3 above where they differ.
- **The strip's blocks vanished under the scan**, the game's main targets. The motor areas are no longer in the scan's
  copy (it was the glass and the areas merged; now the glass only, and of the glass only its outer pieces:
  `scanSurfaces`, 62 198 triangles). A second draw of the blocks after the dark ground in their own materials broke
  every block into dark triangles and stripes; a second checker found why: it drew each area's own meshes
  (`regionMeshes`), but each area's patch leaves out the parts its FILL meshes draw (`rec.fillMeshes`), which were not
  drawn again. That draw is gone. Instead nothing of the map is drawn over a pixel of a visible block: the dark ground
  and both passes of the scan read the stencil mark the strip's own depth pass already writes (ns-scene-three
  `STRIP_CUT`; stencil test "not equal", write mask 0, as the brain's surface and the vessels do), with no draw added.
  The blocks keep their full colour, halo, edge glow and the game's own activation light over the dimmed picture;
  where the mirror body stands in front of a block, the strip writes no mark there and the body stays dimmed. Without a
  stencil buffer the test passes and the map is drawn as before. The deep pieces of the glass (white
  matter, ventricles, the small middle parts) are out of the copy too: pushed out 1.8 mm they came through the cortex
  in triangle-sized patches.
- **A flat yellow bar in the gap between the halves.** The scan's heat above its floor fades to nothing toward the
  midline, from 22 to 6 mm off it (`EMAP_STORM.midFadeMm`, in the scan's vertex shader, and in `scanHeatAt`); the copy
  keeps the brain's own cut next to the gap (`ns-brain-gap`: not coloured and no depth where the glass is cut open);
  a storm never starts on a point nearer the midline than 25 mm while its region has another (`pointOf`). Measured
  in the page every half second: the share of yellow pixels in a box 80 px wide round the gap, at most 0.0013 over
  30 s at rest and 0.0027 over 10 s of the Space grip (the checker's pictures had the bar over most of that box).
- **The fibres buried the mirror body's torso.** Three fibres a link instead of six (`EMAP.scan.fibres`), resting at
  0.2 instead of 0.35 and 0.3 (`idle.bundle`, `idle.local`), and a link with no station of its own bends through a
  middle point sunk toward its own half's middle by 0.3 of its length (`scan.bundleSink`) instead of running straight
  through the brain's centre; 333 network fibres. Where something stands in front of them the network's fibres are
  drawn at 0.15 instead of 0.5 (`EMAP_LOOK.netHidden`) and the big brain's other lines at 0.18 instead of 0.4
  (`brainHidden`: the mirror body stands in front of the brain's middle, where every area's fibres and links meet);
  the areas' links rest at 0.15 instead of 0.3. The mirror body's outline reads at the start view and from outside.
- **A throw in the frame step** left the dark ground and a frozen map for the session: the step is guarded, and a
  failure switches the map off and hides every mesh of it, as a failure in the palette does.
- **Lanes and traffic in one pixel came to four a second.** Beads at 1.0 a second down and 1.2 up instead of 1.5 and
  2.2 (`EMAP.bead`); the lead asked for 1.2 and 1.4, which still summed to four in the test of the summed lanes.
- **Large stacked discs on contracting muscles**: up to 14 px instead of 24, 1.1 times the mark instead of 1.6.
- **Every player loaded the map's code at the start**: its modules are fetched at the first press of M beside its
  data (`PAGE_SCRIPTS` stays as without the map).
- **Objects made every frame**: none any more in the storms' step, the activations or the view's call.
- **Words**: the legend's head says "Press M to hide" (it said "M: off" while the map was on); the Esc page's M row
  says the scan and its storms are made up and drawn like a brain scan, not a recording; M is off the five-second
  controls card again (the owner's own four chunks).

A second checker then went through that round (the yellow bar gone, the mirror body readable, the merge whole, the
lazy load safe) and found more; the third pass, also 22 November:
- **The blocks too dim** with the map on: the stencil above (and the cause of the broken second draw).
- **The strip's outer rim shimmered at rest** (at low quality 94 pixels rose and fell four or more times a second at a
  32-level step, the worst ten times): the scan's depth pass was an opaque material, so it was drawn before the
  strip's own transparent depth pass, and its still copy raced the beating strip for the depth at the rim. It is
  transparent now (drawn after the strip's), and both scan passes read the strip's stencil mark.
- **The mirror body's own wiring was a white web** with a bright cord down its middle: at rest it is drawn at 0.6
  (`EMAP_LOOK.idleMirror`; lit routes unchanged), and the big brain's lines behind things at 0.1 instead of 0.18.
- **The midline fade took heat off the leg and foot areas' own activation** (a toes area kept 42 to 52 % of it): only
  the resting sources and the storms fade; the activation is added after the fade.
- **The test of the summed lanes checked a lucky case.** It now runs along a nerve at three places and at six levels
  of the cord's two strands for four pairs of areas (both knees; the left half's hand with the right half's toes, and
  the other way; both hands), with the traffic weighted as drawn. It found four a second, so: beads 1.0 a second both
  ways (`EMAP.bead.upHz` 1.2 to 1.0), the beads' phase taken from the map's clock and the place only (not from each
  volley's own start), so every lit wire at one place beats together and the cord's two strands in one pixel beat as
  one; and on a lit route the resting pulses give way to its own beads.

A third checker passed the map for update 65 and left four follow-ups; the fourth pass (22 November, for update 66):
- **The brain under the map kept 80 to 100 % of its light and read as a lilac brain**, not a live scan: the scan's
  depth pass, drawn at 200.4, came after the brain's glass. It has its own draw order now, 4.8
  (`EMAP_LOOK.orderScanDepth`): after the strip's own depth pass (1.5, so the rim stays out of the race) and before
  the glass (5 and 6), so the glass is not drawn under the scan and the deep-blue resting scan is back; still
  transparent and still kept off the blocks by the stencil. What lies behind the pushed-out copy is hidden again
  under the scan: with the map on the ordinary beams of light from an area (orders 12 and 12.5) are hidden near the
  brain, where they run along its surface (a fourth checker saw none of the left hand's beam); the map's own route and
  muscle marks stand in for them, and in update 65 the beams were already lost under the dark ground and the scan. At rest the picture had one or two soft clouds at a time: between the
  storms, small short flares of their own now start every 0.45 to 1.1 s on the side the player sees (`EMAP_STORM.minor`:
  0.3 to 0.5 strong, fading over 0.6 to 1 s, no cascade, no volley; each rises once and falls once).
- **A few wire pixels shimmered at frame rate at low quality**: the front pass of the lines (depth test "less or
  equal") and the hidden pass ("greater") are exact complements, and a line lying on a surface flipped between them.
  The front pass is drawn a little nearer (polygon offset -1, -4: `EMAP_LOOK.frontOffset`).
- **Fine network lines crossed the full-colour blocks**: the front pass is drawn in two parts, the routes and the
  bodies' wiring over everything, and the network's lines (the bundles, the short fibres and the areas' links) kept off
  a block by the strip's stencil; the hidden pass is kept off the blocks too (what lies behind a block is not drawn over
  it). One draw more.
- **The mirror body read as a back view with a bright cord down its middle**: its own wiring rests at 0.45 instead of
  0.6 (`idleMirror`) and its cord at 0.7 of that (`cordMirror`).

A fourth checker passed that pass at no measurable frame cost and found more; the fifth pass (22 November, for update
66):
- **A blink at every M off** (the brain faded from blue to black, then the whole pink brain came back in one frame) and
  a sudden drop at M on: the scan's depth pass at 4.8 kept the glass away for the whole ease while only the scan's
  colour faded. The depth pass is at 4.8 only while the map is wholly on; while it eases in or out it is drawn after
  the glass, and the scan's colour pass covers the glass by the map's own amount (its alpha, `uCover`), so the brain
  fades from its own colours to the scan and back, and at the moment the map is wholly on both ways give the same
  picture. Measured in two boxes of the brain in every frame through M on and M off: see the checks.
- **The small flares stopped after M off and on** for as long as the map had been on: the map's clock starts at 0
  again, the storms' clocks did not. They are set back with it (`restartStorms`: the next storm at 0.6 s, the next
  flare at 0.3 s).
- **The mirror body's cord was hardly dimmer** (4 %): its traffic did not take `cordMirror`. It does now, and
  `cordMirror` is 0.5. That alone left the strip down its middle as bright as before (the roots of the cord and the
  bridges from the big brain, which meet at its neck, lie along the same line): the roots carry a flag of their own
  now and take `cordMirror` with the cord, and so do the bridges. The strip the checker measured (8 by 90 pixels, High)
  went from 110 to 91, beside it 67; the line still shows, about as bright as the nerves over the shoulders and flanks.
- **The polygon offset moved the shimmer to other wire pixels**: a wider band, -2 and -16 (`frontOffset`). Paired runs
  at low quality, 4 s each, counts per second at the 16- and 32-level steps: the two new spots behind the mirror's
  raised left hand are steady again (873,277 at 2/1, 877,268 at 1/1; they were 12/7 and 13/7), the three old ones stay
  steady, but 782,338 (15/5 and 14/7) and 817,340 (16/10 and 11/0) are still fast. Pixels fast only with the map on, at
  the 32-level step with a pixel of shift: 19 and 18, against 32 between two map-off runs.

Checks of the fifth pass:
- The brain's light read in every frame in two boxes (the left half's side, the top of the right half) through M on and
  M off: the largest step from one frame to the next was 3 and 6 levels at High on M on, 1 and 6 on M off; 1 and 4,
  2 and 4 at low. Bursts of pictures through both presses at High and low show the brain fading from pink through
  lilac to the deep blue scan and back, with no black frame.
- The unit tests, the browser tests `emap`, `startup` and `keyboard-aim`, and the start check pass.
- Frame table at High, look part (frames a second): the lead build 39.0 and 38.0; this build with the map off 39.0 and
  33.4 (a third run, 17.9, was spoilt: 3 frames a second at the still part, the outline alone 180 ms), with the map on
  37.8, 34.6 and 29.8. Paired, the map on is 3 to 11 % below off on the look part; the up-and-down and limb parts swing
  both ways by more than that. The cost stays open.

**Checked.**
- Unit tests in Node (`tests/emap.test.mjs`, 26 tests; with the stand-in and with the nerve data): the model builds
  with no warning; each of the 142 movements has a complete route to each of its muscles, in order (1137 routes with
  the data); crossing follows `laterality` and the muscle's side; a head nerve never passes the cord, and the throat
  area's strap muscles go by the cord (C1 to C3) while its other muscles go by head nerves; a twig may leave its
  nerve at the nerve's first point (56 of the 1137 routes: the coracobrachialis, the quadratus lumborum); the
  in-between areas send nothing down; the farthest muscle is reached within 0.16 s; a volley's front, marks, report
  and fade come at their times; the report never lights the command's lane; calm (beads at most three a second, no
  dark between them, no negative light); reduced motion is steady; at most six sparks; the step makes no garbage
  (300 000 frames, no collection); the build in small steps gives the same model; M is one request per press, never
  on repeat or with Alt, and moves nothing; M is on every list of keys; the words are short and claim nothing; the
  card replaces its lines; the shader text has no `pow` and guards every lookup; the joint rule. The whole suite:
  569 of 569 pass on the final code (one run before it failed one timer test of the pack loader, 905 ms against a
  limit of 870, which passed alone).
- The browser test `tests/browser-emap.mjs` (real keys and mouse, 1600 x 900): nothing of the map is fetched or built
  240 frames into play; at the first M press the nerve data is asked for once and the model is built with no warning;
  the camera, the look and the joints do not change; the game's picture, read small, differs by 36.4 of 255 on
  average with the map on and by 0.06 after M off; a look at an area sends a volley whose route passes the bridge
  and arrives in time; at "more" the legend shows the area's route, does not lie on the information panel and
  nothing of it is cut; at the hidden level there is no legend and the map stays; the map stays through the outside
  view and a pause. Passed. `startup` and `keyboard-aim`: both passed. The start check printed `"ok":true`.
- Frame rate before part 3, alone on the processor, frames a second for still / look / updown / limbturn (the lead's
  table, twice each, in turns): the game's own ground (18930) 60.2 / 35.9 / 48.3 / 55.5 and 60.0 / 40.3 / 43.6 / 52.7; this work with the
  map off 60.1 / 39.6 / 45.0 / 52.3 and 60.0 / 39.8 / 50.1 / 55.4 (the same: off, the map costs nothing); with the map
  on 60.0 / 37.1 / 43.1 / 49.9 and 60.0 / 41.0 / 46.7 / 46.9 (a still view stays at 60 and idle; in the limb turn,
  with 12 routes lit, about 5 frames a second fewer than with the map off).
- The map's own processor time in a frame (`inspect().emap.meanMs`): the step 0.03 to 0.06 ms, the palette 0.02 to
  0.35 ms. The first M press: the map was built 0.69 s after it and fully shown after 1.06 s.
- The fourth pass, on the final code: the map's test files with `chunking` and `wiring-data`, 60 of 60 (new: the view
  test checks the three line passes, which keep off a block and which are drawn nearer, and the depth pass's order;
  the storm test counts the small flares); the start check `"ok":true`; the browser tests `emap`, `startup` and
  `keyboard-aim` passed. The third checker's paired measure at low quality (its frame-by-frame measure and its
  pixel-by-pixel comparison, read only), the map off, on, off, on for 4 s each at the start view: pixels that rose and
  fell four or more times in a second at a 32-level step only with the map on (one pixel of shift allowed) 42 and 10
  (16-level step: 84 and 39), against 97 (142) between the two map-off runs; they lie scattered on the strip's rim and
  the mirror body, as the map-off-only ones do. The frame table at High, twice each in turns: 18930 60.0 / 40.6 / 41.2 /
  46.0 and 59.7 / 42.6 / 46.5 / 51.8; map off 59.4 / 39.1 / 44.2 / 52.3 and 59.5 / 41.1 / 44.9 / 50.5; map on 59.8 /
  39.5 / 49.6 / 54.0 and 60.0 / 35.3 / 49.0 / 53.5 (the look 14 % below in the second pair, level in the first).
  Pictures at real speed, High and low: rest (the deep-blue scan, the blocks clean, no network line across them), a
  storm with flares, a lit block.
- The third pass, on the final code: the map's test files with `chunking` and `wiring-data`, 60 of 60; the start check
  `"ok":true`; the browser tests `emap`, `startup` and `keyboard-aim` passed. The rim measured frame by frame at low
  quality, at rest, the look still, 3.5 s (`s-shimmer`; a crop of the brain's middle): pixels that rose and fell four
  or more times in a second, map on 107 at a 16-level step and 23 at a 32-level step (the worst 9 a second), map off
  100 and 33 (the worst 17); the worst pixels lie on the mirror body's edge in both, which the map does not draw. Not
  the 0 the lead asked for: the ordinary view's own shimmer is as large. The frame table at High, twice each in turns:
  18930 59.8 / 38.5 / 38.6 / 49.7 and 60.0 / 41.0 / 44.7 / 54.0; map off 58.3 / 36.3 / 50.3 / 47.6 and 60.0 / 33.6 /
  44.5 / 51.7; map on 58.8 / 37.4 / 44.0 / 37.1 and 60.0 / 38.3 / 28.5 / 47.3 (the look as fast as with the map off,
  so the storm slots and the hidden network were left as they are; single up-and-down and limb-turn runs read low).
  Pictures at real speed, High and low: rest (the blocks in full colour, the mirror body readable) and a lit block
  (the left hand's area: its own glow, the storm round it).
- After the independent check, on the final code: the map's test files (`tests/emap.test.mjs`, `tests/emap-storm.test.mjs`,
  `tests/emap-view.test.mjs`) with `tests/chunking.test.mjs` and `tests/wiring-data.test.mjs`: 60 of 60 pass. New: the
  view built with three.js in Node (its meshes, the scan on the glass only, nothing shown while off, a throw in the
  step hiding every mesh and staying hidden, nothing left after dispose); the summed lanes (down, up and traffic at a
  nerve's point while a knee area is held, and at one level of the cord's two strands while both knees' areas are:
  three a second at most); the midline (within 6 mm of it the scan stays at its floor through 30 s of storms; 20 and
  more storms over a minute, none started near the midline). The start check printed `"ok":true`; the browser tests
  `emap`, `startup` and `keyboard-aim` passed. The frame table at High, still / look / updown / limbturn, twice each
  in turns: 18930 60.0 / 40.0 / 43.8 / 52.8 and 59.7 / 38.7 / 42.5 / 51.1; this work with the map off 60.0 / 40.0 /
  42.1 / 46.5 and 60.1 / 41.5 / 39.2 / 50.7; with the map on 58.8 / 35.5 / 51.0 / 53.8 and 60.0 / 37.2 / 43.0 / 49.0
  (the look 10 to 11 % below the map-off runs, the other parts within the noise). Pictures at real speed (opened):
  map off and on at the start view, a storm (a burst of 2.5 s), the Space grip, a movement by look (the left hand's
  area) and by click (the left knee's), the outside view.
- Part 3 in Node (`tests/emap-storm.test.mjs`, 11 tests): the network (every link a bundle between two regions, the
  neighbouring surface regions joined, each fibre's vertices carrying its regions and its place along it); the brain
  boxes' surface points; the colour scale (violet at rest, near white only at the top, never more than 0.74 laid on,
  the tone knee); storms over two minutes (one every one to three seconds, a quarter to a half of them where the look
  rests, hops, several at once, cord volleys in a sixth to a half); a hop flares when its front arrives, weaker, and
  the front is dark ahead and lit behind from either end; the owner's rule on the curves: through a minute of storms
  no point of 60 on the brain brightens and darkens more than three times in any second, the traffic passes a point
  at most twice in a second, a fibre's point under a storm every two seconds at most three; the resting sources'
  periods; reduced motion: no storms and a scan that does not change at all over ten seconds; a lit area the hottest
  spot (0.9 or more), its linked region warmer than a far point by 0.2 or more; the shader texts.
- Part 3 in the browser, alone on the processor: the scan drawn with 101 672 triangles of the brain's copy, 44
  regions, 141 links and 492 fibres; the browser test passed on the final code (picture change 35.9 of 255 with the
  map on, 0.97 after M off); the start check printed `"ok":true`.
- Part 3's cost. With every storm summed at every pixel and a `discard` in the scan's shader (which turned off the
  early depth test, so the sum ran for every hidden layer of the brain's pieces) a frame with the map on took about
  77 ms: 13.1 / 8.7 / 11.1 / 9.0 frames a second at High, 49.1 / 15.3 / 19.9 / 15.0 at Low. Without the discard, the
  sums stopping at the live storms, then the heat summed at the copy's vertices, the final code, twice each in turns
  (still / look / updown / limbturn): the game's own ground (18930) 60.0 / 37.5 / 44.0 / 49.7 and 59.4 / 38.1 / 42.7 /
  51.7; this work with the map off at High 60.1 / 33.5 / 45.6 / 51.0 and 35.2 / 18.6 / 24.7 / 22.5 (the machine was
  disturbed during that run: the Low run right after it read low too); with the map on at High 58.0 / 30.5 / 37.9 /
  54.4 and 57.2 / 36.9 / 41.0 / 35.8; with the map off at Low 51.4 / 37.5 / 47.1 / 47.2 and 32.3 / 26.9 / 37.0 / 34.7;
  with the map on at Low 60.0 / 39.5 / 45.0 / 55.3 and 60.0 / 39.4 / 57.6 / 57.8.
- Part 3 seen in pictures at real speed (opened and judged): the rest and two-second bursts at High (a storm rolls over
  a half in about a second, yellow to orange with a small near-white core, the network everywhere, the folds of the
  brain readable under the colour), the brain close while looking at a hand area (the area the hottest spot,
  yellow-orange, no white-out; the hand's muscles glowing), Low (the same look), reduced motion (two pictures a second
  apart identical to the pixel at 2 % tolerance), W held, the outside view.
- Seen in pictures (opened and judged): the resting map at picture quality High and Low (the same look); a hand
  area's route a third of a second after the look (its colour from the block through the brain, the bridge and the
  mirror body, and up your own left arm with marks on the forearm's muscles); the front on your own arm in a burst
  of frames; an eyelid area and the throat area (to the mirror body's face and neck); W held; the Space grip (four
  routes in four colours down all four limbs: the clearest picture of the view); reduced motion (the route steady, no
  beads, no sparks); the mirror body turned by a drag (its wiring turns with it); the outside view; the "more" level
  at 1600 x 900 and at 1366 x 768 and the hidden level; M off (the ordinary picture as it was).

**Not done, or not right.**
- The blocks' edges are a little jagged at low quality (the stencil follows the canvas's own pixels).
- The cost on the look part of the frame table with the map on is not settled: in the fourth pass's two pairs it was
  level once and 14 % below once; the storm slots and the hidden network were not cut to find out.
- Wire pixels that shimmer at low quality only with the map on remain, about as many as the noise between two map-off
  runs; each change of the front pass's offset moved the flip to other spots (the fifth pass's numbers are below).
- With one half hot and the other calm, the midline fade makes a straight edge between the halves along the gap.
- The network in the middle of the picture, behind the mirror body, is still the busiest part; the mirror body's
  outline reads, its own nerves on it, but less cleanly than with the map off.
- Part 3's cost: with the map on, the look part of the frame table read 10 to 11 % below the map-off runs in the last
  pair of runs (35.5 and 37.2 against 40.0 and 41.5 frames a second); a still view loses about one frame a second; the
  other parts were within the noise of a machine whose own runs vary by more than that. Where the time goes was not
  measured.
- Part 3 (the live scan) was looked at in four runs of pictures at real speed after the last changes of its look
  (high, low, reduced motion; the start view and the brain close, looking at a hand area), not played by a person, and
  not at all on narrow or upright windows. Whether it reads as "electrical storm activity going everywhere" is the
  owner's call: at rest the brain is mostly deep blue with one or two storms rolling over it at a time, and the dense
  network in the middle of the picture is the busiest part.
- The network's fibres in front of and behind the mirror body still cross it as a fine tangle (behind it at 0.5 of
  their light); the mirror body is harder to read with the map on than without.
- The scan is a copy of the brain's surface pushed out 1.8 mm. It does not follow the living brain's wobble while the
  brain is carried (up to 4.2 mm): during a carry the colour can slip a little off the surface or be cut by it. At the
  silhouette the copy stands 1.8 mm outside the brain, a thin rim of colour. Its depth pass also hides lines lying
  within 1.8 mm of the surface behind it (they are drawn at the hidden lines' strength).
- The storms start where the processor chooses (a region near the side the eye sees), not where the game's simulated
  activity is: at rest they are decoration of the made-up kind the legend states, not a picture of the simulation.
  The resting sources and the network's fibres are generated by rules (stated in EMAP.scan and EMAP_STORM), not drawn
  from data.
- A storm's front runs from the region's end of every fibre of a fired link, also on links whose real fibres run one
  way only; the cord volley runs down the mirror body's cord and bridge only, not on into the roots and nerves.
- Each root now ends where the data says it joins its nerve, but the nerve's light still starts at the nerve's first
  point: the part of a plexus above a lower root's join lights with the rest, not from the join on.
- The three-times-a-second rule is tested on single curves (one point of the scan, one wire). Where several wires
  cross in one pixel their pulses add; that sum was not measured.
- The scan's heat is summed at the vertices of the brain's copy (101 672 triangles) and laid between them, not at each
  pixel: the JS sum the tests check (scanHeatAt) is exact at a vertex only.
- No person has played the map; nothing here says how it feels in the hand. Until 22:55 every picture was taken while
  seven helpers shared one processor (a frame took 0.3 to 2.3 s): the bursts that show the front travelling were taken
  then, with the page's clock slowed to the frame time. The later pictures were taken alone on the processor, in real
  time, and only ONE run of pictures was taken after the nerve data's final state and the last changes of this
  section; the bursts of a face area, the trunk area and an in-between block, and the mirror body turned, are from
  before them.
- At your own shoulder with the arm raised (W, the first key a player presses) the lit nerves are a tangle, not a
  route: the plexus, four nerves and their straight twigs cross in a small space seen from above, the twigs as bright
  as the nerves. Part of it is the binding: a line rides rigid bones and changes bone inside ONE stretch between two
  course points, so with the arm turned 80 degrees a 9 mm step of the plexus is still 25 mm with a 57 degree turn
  (the nerve to the latissimus: 44 mm), and with a knee bent 70 degrees 66 of 4670 node turns of that leg's wires are
  sharper than 75 degrees, most of them in twigs. The cure is a change of bone spread over several stretches, with
  the twigs and the child nerves following their nerve's blend; not done. On the inner side of a deep bend a line can
  also pass through bone or a short way outside the muscles.
- With the map on, frames are slower where much moves and much is lit: in the limb turn with 12 routes lit, 49.9 and
  46.9 frames a second against 52.3 and 55.4 with the map off (about 2 ms more a frame, most of it in drawing); in
  the up-and-down look 43.1 and 46.7 against 45.0 and 50.1. A still view is not changed. Where the time goes was not
  measured further (the two passes over the 49 278 vertices, or the palette sent each frame while a limb moves).
- The front is fast by rule: 0.16 s to the farthest muscle, so it crosses the big brain within two frames. What reads
  as travel is the front along a limb of your own body, the beads behind it and the report's slower way back.
- On the mirror body at its start size a nerve is about a pixel wide. Its route lights and its marks show, but the
  beads there cannot be told apart; they read on your own body and in the big brain.
- Two lit areas that share a wire (one side's strand of the cord, a plexus) show ONE of them on it: the newer takes
  the wire, since colours are never blended. The older route then has a stretch in the other's colour, and if the
  newer one ends first that stretch is dark until the older one ends too.
- The brain's lines do not follow the living brain's small motions (the beat, the wobble while it is carried, the
  blooms round a key): they stand still while the tissue moves a little under them. With the outer muscles lifted
  (the Body Worlds setting) the twigs and marks end where the muscles lie unlifted.
- The report is a drawn convention, not anatomy of its own: it uses the command's nerves and roots (the data has no
  sensory nerves), a typical way up the back of the brainstem, a point where the atlas has no thalamus, and the
  nearest point of the postcentral gyrus behind the block. It starts when the front arrives.
- The game's own lights of an activation (the white block, the cone of light, the muscles' colour) are still there
  under the dimmed picture, so an activation is drawn twice: dimly by the game and brightly by the map.
- The real conduction speed (50 m/s) is a textbook value written from memory, not looked up for this work.
- The first M press is not instant any more: the map's modules and its data are fetched and the model built then, and
  the map is fully shown about 0.9 to 1.3 s after the press (a second checker: built after 0.88 s and shown after
  1.2 s at High; 1.3 s at low with three presses while it loaded; before the modules were fetched lazily, 0.69 s). During those frames each frame carries up
  to 7 ms of building; the frame rate in that third of a second was not measured. The way that had the map ready
  before the first press is behind `EMAP_BUILD.onPress`.
- More detail shows what kind of picture this is (the bridge, typical paths, simulated, how much slower) only until
  the first area has been looked at after M; to read it again the player must switch the map off and on. In a window
  lower than about 760 px the last line of More detail can be cut at the card's foot; in narrow or upright windows
  (under 901 px wide, or taller than wide) the first layout is still in force (More detail under the short card, cut
  at 30 % of the height) and was never looked at. At "more" the wide card covers the top right of the picture and
  can lie on an orientation label of the brain (one was seen under its edge).
- If a body pose comes without segment matrices (the path without the hand skin), only the brain's wiring is drawn.
- Not tried: a lost and restored graphics context while the map is on; a software renderer; a browser other than
  Chromium; a touch screen; a screen reader on the legend.

## 193. The data of the drawn nerves: which nerve serves each muscle, from which level, along which course; and the brain's typical links (21 November)

The owner, 20 November: "we want a view of brain activity ... so we can actually see electrical storms and electrical
activity and neural activity and networks and pathways, etc., etc., throughout the entire body, from brain to body and
body to brain. And then we can tie that to muscle contraction." 21 November: "let's try an electrical mapping view, like
you see in functional neuroscience, connectomic live maps, dynamic maps." (Neither message has a number in the notes.)

The atlas the game draws has muscles, bones and a brain, but no spinal cord and no nerves (section 192 draws the map).
This section is the DATA those drawn routes come from: one pure module, `scene/src/ns-wiring-data.mjs` (no imports, no
three.js, no page), its generator `tools/build-wiring-courses.mjs` with `tools/wiring-geometry.mjs`, and
`tests/wiring-data.test.mjs`. It draws nothing and no page loads it yet on this branch.

**One readable row per muscle (`MUSCLE_ROWS`, 152 rows).** Each row: the muscle's name (and the other spellings the
game's meshes use), its nerve, its spinal or cranial levels, the main one, why that one, its sources, a note, and other
nerves that share the muscle (`also`: the deep finger bender's ulnar half, the back belly of digastric, the hamstring
part of adductor magnus ...). A muscle with two nerves is drawn from the first. The main level (`main`) follows the
table of the Medical Research Council's booklet where it prints a root in bold (36 rows, `by: 'M'`); the level the
ISNCSCI examination tests that movement for where the booklet marks two roots or none (8 rows, `'K'`: the hip benders
L2, the knee straighteners L3, the calf S1); the bold root of the brachial plexus table for three shoulder muscles
(`'W'`); the only level there is for the 31 muscles of the cranial nerves and of C1 (`'S'`); and for the other 74 rows
(`'C'`) a choice whose reason is in the row's note, because the sources read mark no main root: the middle of the listed
levels in most, a neighbour's bold root in some. The page's own example is kept: biceps brachii, musculocutaneous
nerve, C5 C6, main C6 (the booklet prints neither in bold; ISNCSCI tests elbow bending as C5; the row says both).
`MUSCLE_NERVE` holds the result for each of the rig's 287 muscle names, `MUSCLE_NERVE_BY_ID` for each of its 292 muscle
meshes (two meshes are both named "right digastric": by id the front belly has the nerve to mylohyoid, the back belly
the facial nerve). `nerveForMuscle(name)` resolves a rig name, an alias, a movement's muscle name, a mesh id or a
game-arm catalogue key (`BIC`), on either side; the name rule is the game's own (`ns-bodymap` `muscleNameMatches`: the
same words, or only extra "part words"), copied so the module stays free of game state, without "hand" and "foot" as
part words (the hand's and the foot's little-finger and little-toe muscles share names and have different nerves).

**The nerves (`NERVE_TRUNKS`, 89, right side).** The cranial nerves that move muscles: III (the rig has the lid lifter;
it has no muscle that turns the eyeball, so IV and VI are left out), V3 with its nerve to mylohyoid, VII with its
posterior auricular branch and its five face branches, IX, X and XII, and XI, the accessory nerve, whose fibres begin
in the top of the cord (C1 to C5): its roots leave the cord's side inside the canal and its strand climbs beside the
cord into the skull through the great opening and out by the jugular opening (`rootsLeave: 'cord'`); the cervical
plexus with the ansa cervicalis, the phrenic nerve and the C1 fibres that ride with the hypoglossal nerve; short
muscular branches of the cervical nerves; the brachial plexus with the dorsal scapular, long thoracic, suprascapular,
two pectoral, two subscapular, thoracodorsal, axillary, musculocutaneous, radial (and its deep branch), median (its
forearm branch and its twig to the thumb's ball) and ulnar (and its deep branch) nerves; the eleven intercostal nerves
and the subcostal nerve; the back branch of every spinal nerve from C2 to L5; the lumbar plexus with the
iliohypogastric, femoral and obturator nerves; the sacral plexus with both gluteal nerves, the nerves to obturator
internus and to quadratus femoris, the sciatic nerve, the tibial nerve with both plantar nerves, and the common, deep
and superficial fibular nerves. Each has its anatomical name, a plain name ("the main nerve of the front of the
thigh"), its levels, its parent, where it starts (`origin`: the cord, or the midbrain, pons or medulla), its sources,
the rule its course was laid by, and the course: 2 to 13 points `{ seg, p }` from the cord or the brainstem outward
(485 points in all). A branch's first point IS a point of its parent's course (`from` is its index). A plexus is drawn
as ONE bundle; each of its roots joins it at its own point (`rootJoin`, below). Six nerves serve no muscle of this rig
and are wiring only, which their notes say: IX, X, XII, the phrenic nerve (no diaphragm), the lateral plantar nerve,
and the bundles themselves.

**The frame is the rig's rest frame, which is NOT the atlas's untouched frame.** The page prepares the body before the
rig is built (the bulkier build of section 97, the longer limbs of section 164): the right wrist's pivot is at z =
705.6 mm in `packs/BODY-RIG.json`, the atlas's own capitate bone at about 790. Vertebrae, skull and pelvis are unmoved;
the limbs are. Every point here is in the rig's rest frame (`WIRING_FRAME`), which is what the rig's segment matrices
take in, and `seg` is the rig segment the point rides. **After any change of the body's rest shape the courses are
stale and `node tools/build-wiring-courses.mjs` must be run again**; the generated block records six pivots of the rig
it was laid over, and the test fails when they no longer match.

**How a course is laid.** By a stated rule on things the atlas has, never freehand: the rig's joint pivots; the bones'
and muscles' own shapes (the middle of a cross-section at a height, a bone's knob, a muscle's belly); the limb arteries'
centre lines of `packets/bodyparts3d-body-vessels-r1`, carried from the atlas's frame to the rest frame by the
displacement of the eight nearest atlas vertices, as the game rivets its vessels (the median nerve with the brachial
artery, the ulnar nerve with the ulnar artery in the forearm, the tibial nerve behind the popliteal and with the
posterior tibial artery, the deep fibular nerve with the anterior tibial artery, the femoral nerve on the outer side
of the femoral artery at the groin); and rules from the bones for the rest (the radial nerve behind the humerus at
mid-arm and in front of the elbow's outer knob; the ulnar nerve 7 mm behind the inner knob; the sciatic nerve between
the sitting bone and the great knob of the thigh bone, then 62 % of the way from the thigh bone to the hamstrings; the
common fibular nerve round the neck of the fibula; an intercostal nerve 8 mm under its rib, the lower six running on
between the two inner flat muscles into rectus abdominis, T10 at the navel's level). The cranial nerves start on the
brain atlas's own brainstem: that atlas is in the same frame as the skull (medulla z 1464 to 1506, pons 1502 to 1531,
midbrain 1528 to 1546; the joint between skull and neck at 1478), so its coordinates say where the brainstem sits in
this skull. Their openings in the skull (the jugular opening, the oval opening, the hypoglossal canal, the inner ear
opening) are NOT measured from the skull meshes: they are placed by millimetres from landmarks that are (the styloid
and mastoid processes from the muscles that hang from them, the jaw's joint, the occipital condyle), which is the
weakest part of the courses.

**Every point is checked on the real meshes.** "Inside the body" is measured, since the body has no skin to test
against: 14 rays (the six axes and the eight diagonals) are marched from the point through a 4 mm occupancy grid of
every surface of the prepared body; all 55 joint pivots score 13 or 14 of 14, points in the open air beside a limb 2 to
7, the gap between the thighs 10. A point passes at 12 or more, or at 10 with a surface within 4 mm. Of the 372 points
laid (41 more are shared branch points), 352 score 14, 17 score 13, two 12 and one 11; 11 points failed at first and
were moved 2.5 to 9 mm toward the nearest part of the body (four of them the femoral nerve under the groin, where the
atlas's artery lies in an open hollow between the thigh muscles), 6 of those had started inside a long bone and were
stepped out of it; none is outside now. Only POINTS are checked, not the straight lines between them.

**The cord.** `VERTEBRAL_PIVOTS` gives one coordinate down the spine: 0 at the rig's `atlanto_occipital` pivot, 7 at
`cervicothoracic`, then one per joint to 24 at `lumbosacral` (the rig has no pivot between the cervical vertebrae).
`CORD_SEGMENT_V` places each of the cord's 29 segments (C1 to S4) on it by the taught rule that the cord is shorter than
the column: the cord's tip at the joint between L1 and L2 (20), the five lumbar segments behind the tenth to twelfth
thoracic vertebrae, the sacral ones behind L1, T6 behind T5, C8 behind C7; between those anchors an even
spread. `ROOT_EXIT_V`: C1 between skull and atlas, C2 to C7 above their own vertebra, C8 under C7, thoracic and lumbar
nerves under their own vertebra, S1 to S4 spaced down the front of the sacrum. `cordLevelAt(level)` returns
`{ fromPivot, toPivot, t }` as the contract asks, and also the point itself. The canal was measured, not offset by a
guess: rays from front to back through each vertebra mesh find the back wall of the vertebral body and the front of the
arch, and the canal's centre is midway (for the atlas, which has no body, 64 % of the way back, behind the dens).
Finding: the rig's vertebral pivots, being midpoints of whole-vertebra centroids, already lie INSIDE the canal, 0.7 to
4.5 mm from its measured centre (12.6 mm at the skull joint, where the pivot is on the atlas's facets). The canal's
half-width came out at 7.4 to 13 mm (17.8 in the atlas). A root exit is the canal's centre moved sideways by that
half-width (at most 13) plus 4 mm, and where that spot is inside bone, the nearest free spot in a small search (11
exits moved 2 to 3 mm): all lie 13 to 18 mm from the midline. `cordCourse()`, `caudaCourse()` (the "horse's tail"
below the tip) and `rootCourse(level, side)` (down the canal from the segment to the exit: 30 mm for T6, over 170 mm
for S2) give ready polylines.

**Where a nerve ends in its muscle.** A third of the way along the muscle from its end nearer the START of its nerve
(its fleshy upper end, not its tendon), in the middle of its cross-section there; where that middle is outside the
muscle's own surface (a curved sheet; 49 of 292), the nearest piece of the muscle itself. Muscles served level by
level (the deep back muscles, the flat belly muscles) and five broad sheets whose nerve runs along them (trapezius,
sternocleidomastoid, latissimus dorsi, serratus anterior, platysma) take the piece nearest the nerve's course (48).
The twig leaves the nerve at its course point nearest the muscle (`at`); a cranial nerve gives no twig inside the
skull (`twigFrom`). The longest twig is 105 mm (vastus lateralis), the median 18 mm. Two first tries were wrong and are
gone: "the end nearer the nearest course point" put the finger straighteners' points in the hand (their meshes include
the tendons), and letting the point ride the mesh's own rig segment made the belly of tibialis posterior swing with the
foot (its mesh hangs mostly from the foot): the point now rides the bone its belly lies on.

**The left side is the mirror of the right, and every id says its side.** `NERVE_TRUNKS` holds the right side under
ids `r_...` (`r_femoral`); `mirrorTrunk('r_femoral')` is the left twin, a record of the same shape with the id
`l_femoral`, its parent `l_...`, and every course point mirrored (`mirrorPoint`: x to -x; the segment `r_...` to
`l_...`). `nerveForMuscle` answers with the nerve of the muscle's own side (`l_musculocutaneous` for "left biceps
brachii"), and `trunkById` gives either side's record. The body rig has no left forearm or hand (the left arm is the
game arm, its own rig), so a mirrored arm point also says `rig: 'arm'` and the game arm's own name for its segment
(`armSeg`: `l_forearm` is its `ulna`, `l_radius` its `forearm`, `l_hand` its `hand`, the finger bones alike,
`l_upperarm` its `upperarm`). `nervePathForMuscle(id)` gives the whole drawn way to one muscle mesh on its own side:
its main root's exit (or the brainstem), the nerve up to the twig, the muscle's point; for a mesh of the left game arm
that the body rig does not hold (`FJ1478M`), its right twin's way mirrored. These shapes are the ones the map's model
of section 192 was written against (ids and segments that swap `r_` and `l_`): built with this module in place of its
stand-in, that model takes all 178 trunks and finds every one of its 337 muscles' nerves in the data, with no warning.

**The brain's links (`BRAIN_LINKS`, 53).** Between meshes the brain atlas has, the motor and sensory strips first: to
each other; from the superior, middle and inferior frontal gyri to the motor strip; from the sensory strip to the
superior parietal lobule and the supramarginal gyrus; the three parts of the superior longitudinal bundle; the strips
and the supplementary motor areas of the two halves through the corpus callosum; the motor strip down through the
internal capsule, midbrain and pons to the medulla; to the opposite half of the cerebellum by way of the pons, and
back; the corticobulbar route from the motor strip to the motor nuclei of the cranial nerves in the pons and medulla
(one link on its own side and one crossing: most of those nuclei are driven from both halves, the lower face only from
the opposite one); the report of touch up from the medulla to the opposite sensory strip, and the report of pain and
temperature (already crossed in the cord) up the same way. Then the arcuate bundle, the cingulum, the uncinate bundle,
the inferior longitudinal and inferior fronto-occipital bundles, the occipito-parietal fibres, the fornix, and four
more links between the same lobes of the two halves. Each has `from`, `to`, `name`, `plain`, `crosses`, sometimes
`via`, and its sources. Where the fibres change sides is DATA, so a view can draw the crossing: `crossing` = `{ in,
when, share, name, plain }` and `crossesAt` = the two halves of the region they cross in. The motor route says `when:
'at the end'` in the medulla (the pyramidal decussation, below the last mesh, as the fibres go on down the cord), the
touch route `'on the way'` inside the medulla, pain and temperature `'before the start'` in the cord, the routes to and
from the cerebellum in the pons and the midbrain. The right half's links do not speak of speech (it is made on the left
in most people): "the lower frontal area in front of the mouth part of the motor strip". The atlas has no corpus
callosum, thalamus, superior temporal gyrus, temporal pole or orbital gyri: a link between the halves says `drawnAs:
'arc'`, and a bundle whose true end has no mesh is tied to the nearest mesh and says so in `note` (the arcuate bundle
to the middle temporal gyrus, the uncinate bundle to the inferior temporal gyrus).

**Sources (`WIRING_SOURCES`; facts only, in the game's words; nothing copied).** Read on 21 November: the Medical
Research Council's *Aids to the examination of the peripheral nervous system* (1976), table "Nerve and main root
supply of muscles" (pages 60 and 61, read as pictures of the pages so the bold roots could be seen); OpenStax *Anatomy
and Physiology 2e*, sections 13.2, 13.4, 14.2, 14.3; the ISNCSCI worksheet's key muscles; Wikipedia: the list of
skeletal muscles (nerve column), brachial, lumbar and sacral plexus, spinal cord, six nerve articles and nine tract
articles. Every row, nerve and link names its source keys. Not reachable on the day: the 1918 Gray's Anatomy
(bartleby is retired, another host refused) and the NCBI Bookshelf (StatPearls); so the levels of the deep back
muscles, which the list gives only as "posterior branch of spinal nerve", rest on the spans those muscles are taught
to have, and are the least certain rows.

**Words.** `WIRING_NOTE` holds plain sentences a view can show: typical adult routes as taught; simplified, laid by
rule over this one atlas body, not traced from a scan, not measured in anyone, real bodies vary; the "main" level of a
muscle is this game's pick where books give several; the brain's links are tied to the nearest part the brain model
has, which has no thalamus. The map of section 192 has its own words on screen (in `ns-text.mjs`); the first pass of
this package had put a sentence of its own there, which nothing used, and it was taken out again.

**Checked** (on the first pass; the second pass, below, added four tests). `tests/wiring-data.test.mjs`, 11 tests in
half a second: the page's examples; every one of the rig's 292 muscles by id, name and alias, every muscle name of the
142 movements, the 25 catalogue keys and the 51 left-arm and 54 face mesh names resolve to a nerve; rows are well
formed and sourced (17 of the booklet's bold roots are pinned); every nerve's parents lead without a loop to the cord
or the brainstem, every level is known, a branch starts on its parent; every course point and muscle point rides a real
rig segment and lies within that segment's reach of its skeleton as the rig file gives it; the taught places of some
twenty nerves hold against the rig's own joints (the radial nerve behind the humerus, the ulnar nerve behind the
elbow's inner side, the median nerve in front of the elbow, the sciatic nerve behind the thigh bone, the tibial nerve
behind the inner ankle, the five face branches in their order ...); cranial nerves start on their part of the brainstem
inside the skull, keep more than 6 mm from the cord and give no twig inside the skull; the cord's segments are in
order, each at or above its exit, with roots that get longer downward; the left side mirrors the right and every
mirrored segment exists; every link names brain meshes that exist with the atlas's own names; every source key exists
and is used; no private strings. A twelfth test runs the tool with `--check`: the body is prepared exactly as the page
prepares it, every course is laid and measured again on the real meshes, and the committed block must equal the fresh
build (about 7 s on a free processor; `NS_WIRING_FAST=1` skips it). Each of four deliberate faults (biceps given to the
radial nerve, the rig's wrist pivot recorded 20 mm off, a face muscle given a spinal level, a link to a brain mesh that
does not exist) fails a test. The whole unit suite: 529 tests (517 before this package), none failing; in the one run
of the whole suite the twelfth test was still switched off, and it passes on its own. The start check prints
`"ok":true`; the browser tests `startup` and `keyboard-aim` pass (their first runs, with the shared processor at a load
of 14 to 23, ran into their own 60-second waits, as `startup` did in the unchanged checkout at the same minute). The
frame table, still / look / up-down / limb turn in frames a second, this branch then the unchanged one, in turns: 59.4,
32.4, 41.2, 42.0 (the processor still busy); 60.1, 33.1, 48.5, 50.6; 59.1, 36.2, 48.6, 55.2; 60.0, 37.1, 49.0, 45.4: no
difference beyond the spread between runs, as expected, since the package puts no code into the page (a module nothing
imports yet). (These runs were made on the first pass; the second pass, below, changed only this module, its tool and
its test.)

**The second pass, after two independent checks (22 November).** One checker read every row against anatomy sources,
the other the code, the tests and the courses' geometry. Neither found a wrong nerve. What they found, and what was
done:
- **Two points rode the wrong bone** (the generator had given them the segment of the nearest bone): the nerve to
  latissimus dorsi's point in the back wall of the armpit rode the humerus, and the obturator nerve's points in the
  thigh rode the pelvis. They now ride `r_girdle` and `r_thigh`. A **pose test** was added (`poseStretch` and
  `WIRING_POSES` in `tools/wiring-geometry.mjs`, used by the test): twelve turns of one joint each (the shoulder
  forward and sideways, the elbow, the forearm both ways, the wrist both ways, the hip bent and spread, the knee, the
  ankle up and down), each turning the segments that hang from that joint about the rig's own pivot and axis. Every
  straight piece of a nerve or of a twig whose ends ride segments on the two sides of that joint is measured. The
  largest stretch is now **34 mm** (the bundle in the armpit and the musculocutaneous nerve's first piece, arm raised
  sideways 60 degrees). Before it was 83 mm (the twig to adductor brevis, hip bent 60 degrees) and 70 mm (the nerve to
  latissimus). The test fails above 40 mm.
- **Every root used to join its bundle at the bundle's first point**, so the lower roots of the lumbar, sacral and
  neck bundles ran 15 to 97 mm upward and back down. Each root now joins at its own point: `rootJoin` in the generated
  block (and on each trunk that starts at the cord), the course point the root reaches most directly from its opening
  without climbing more than a few millimetres. The largest climb is now **7.9 mm**. `trunkRootLines`, the new
  `rootWay(id, level)` (the whole root from its cord segment, down the canal, out through its opening, to the join
  point) and `nervePathForMuscle` use it. The map's builder must attach each root wire there; until now it attached
  every root at the first point.
- **The median nerve's forearm points** rode the radius above the ulna; they now ride the ulna (`r_forearm`) down the
  forearm and the radius only just above the wrist, so a turned forearm takes them the right way.
- **Pieces through bone.** The generator now samples every straight piece, every millimetre, against EVERY bone (a
  ray-parity test through each bone's own triangles), not only its points against six long bones. Where a piece runs
  through bone it adds one point beside it, the smallest step aside (2 to 24 mm) that clears it and stays inside the
  body: **54 such detours**. The winding places got a point of their own: the common fibular nerve round the neck of
  the fibula, the tibial nerve round behind the inner ankle knob with its artery, the deep fibular nerve in front of
  the tibia. The five face branches and the posterior auricular branch, which lie under the skin, are now laid on the
  outer surface every 28 mm or less (`surfaceRun`; the atlas has no skin, so they lie just on the outermost muscle or
  bone: 31 points). Points laid on purpose in the skull's own passages (the facial canal, the jugular and oval
  openings, the hypoglossal canal, the slit into the eye socket) are marked and left alone.
  - **In bone:** 188 of 13,737 mm (1.4 %). Of that, 128 mm is in pieces that end in one of those passages; the rest is
    four face and scalp pieces with about 5 mm each. Before: 837 of 13,433 mm (6.2 %; the checker measured 890 mm).
  - **Points inside a bone:** 1, down from 21.
  - **Points moved** to pass the checks: 23, by 1 to 9 mm (16 had started inside a bone). None is outside the body.
- **Code.**
  - `WIRING_GENERATED` is frozen (a write to it had moved the cord).
  - Unknown keys, `'constructor'` and `'__proto__'` among them, give null or an empty list everywhere.
  - Each end of a name shared by two meshes carries its own nerve (the two bellies of "right digastric": its `at` had
    pointed into the wrong nerve).
  - "transverse" or "abdominal" alone names no muscle.
  - The block's comment says its points are CC BY 4.0, and CC BY-SA 4.0 where laid on or in Z-Anatomy muscles.
- **Tests.**
  - **The three faults** the checker found to pass the fast tests are now caught:
    - a point moved off the limb, by a new test against the limb's outline measured on its meshes (`outline` in the
      block: 24 stations along each limb's axis, 24 sectors round it). Not to every side, as the third checker found:
      it allowed the largest radius of three sectors plus 4 mm, so a point moved 60 mm off the shin passed. Corrected
      in the third pass, below;
    - a point on the wrong segment, by the pose test (a shin point on the thigh stretches its twig 45 mm at the knee);
    - a wrong nerve for a well-known muscle, by a pinned list of 42 textbook rows (both sides).
  - **Not caught by a fast test:** a point moved 60 mm but still inside the calf. Only the rebuild test catches that,
    as "DIFFERS". (Still true after the third pass: the outline test catches moves off the limb, not within it.)
  - The tests went from 12 to 16.
- **Anatomy.**
  - **Sternocostal part of pectoralis major:** now drawn from the lateral pectoral nerve, which carries its main level
    C7, with the medial one second.
  - **Accessory nerve:** its fields and course start in the cord, as above.
  - **Nerve to mylohyoid:** named as a branch of the inferior alveolar nerve.
  - **Wordings:** "a nerve of the lowest part of the belly wall" for the iliohypogastric nerve; "outer side" for the
    lateral plantar nerve.
  - **Rows taught both ways:** the other commonly taught value is now in each such row's note (16 rows).
  - **Fibularis longus and brevis:** main level now S1. The charts of what each level moves give turning the sole
    outward to S1; the booklet marks neither.
  - **Flexor digitorum profundus:** marked a choice.
  - **Honesty sentences:** the two added to `WIRING_NOTE` (the main level is this game's pick; the brain's links are
    tied to the nearest part, no thalamus).
  - **Brain links:** the two textbook routes and the crossings as data, as above.
  - **Text slip:** the comment and this section now put the sacral segments behind L1, as the numbers do.

**The third pass, after a third check (22 November).** The checker measured the courses in poses and found what the
rest pose hides. What was found, and what was done:
- **The forearm turned.** The anterior interosseous nerve's first point rode the ulna and its second the radius, so
  with the forearm turned 80 degrees 45 to 70 mm of its first piece lay inside the radius; the twigs to pronator teres
  passed 15 to 19 mm through bone at 150 degrees. The pose test now also turns the forearm to 160 degrees (the game's
  own start), bends the elbow to 140 and the hip to 100, opens the jaw 30 degrees and bends and turns the neck: 19
  poses. A new check (`poseBone`) measures, in each pose, how much of every straight piece passes through the six long
  bones (capsules round each bone's axis, the shaft's radius, the ends trimmed by a tenth) beyond what it does at rest.
  - All the anterior interosseous nerve's points now ride the ulna, a third of the way across the membrane from it.
    Leaving the median nerve where it is taught to (just below pronator teres), its first piece was still crossed by
    the radius in every choice of segments tried (27 to 47 mm). It is now drawn **leaving the median nerve near the
    middle of the forearm, lower than taught**, and its rule says so.
  - **Muscle points move as the game moves the muscle.** The game moves each vertex of a muscle with the two nearest
    of the segments in its rig blend (`ns-body`). A muscle's point now rides the nearest bone among those segments.
    Pronator teres, brachioradialis and the long radial wrist extensor get the piece of the muscle nearest their nerve
    as their point (the median nerve passes between the two heads of pronator teres; the radial nerve runs between
    brachioradialis and brachialis), not a belly point a third down that lay against the radius. Tried and dropped:
    keeping each forearm twig on its nerve's bone, and each twig of 12 mm or less on its nerve's segment. That kept the
    twigs out of bone, but left 16 muscle points 27 to 75 mm off the muscle the game draws, in the game's start pose
    or with the neck turned or the jaw open.
  - **The largest extra length in a long bone** is now **19 mm** (the twig to extensor carpi ulnaris, which runs from a
    nerve on the radius to a point on the ulna, at 160 degrees). The twigs to pronator teres pass 13 mm, the ulnar nerve
    above the wrist 15 mm. The test fails above 20 mm. Left out of that bound: the ends of the ranges (elbow 140, knee
    120, hip 100), where the forearm folds onto the arm and flesh gives way where rigid points cannot. The median
    nerve's piece across the elbow passes 28 mm into the humerus's capsule at 140 degrees.
  - **The largest stretch** is 39 mm (the twig to omohyoid, neck turned 45 degrees; bound 40). At the ends of the
    ranges, where the bound is 60 mm, it is 53 mm: the sciatic nerve behind the hip bent 100 degrees. Its point behind
    the hip now rides the pelvis. On the thigh, the piece from the pelvis's notch to it passed 15 to 20 mm through the
    hip bone with the hip bent.
- **The outline test.** It now uses the limb's own bin only: the point's station (32 along the axis) and its 10-degree
  sector (36 round it), with a 3 mm margin, and an empty bin allows nothing. Each bin holds the farthest the limb's
  mesh surfaces lie from the axis, every triangle sampled every 3 mm (the vertices alone left thin bins empty). Beyond
  a limb's ends it also takes in the next segment's meshes, and it takes in the meshes of muscles whose points ride the
  limb: the hamstrings' meshes ride the shank in the rig. One point is named as lying in a hollow of the meshes, with
  its bin bridged from two sectors to either side: the tibial nerve behind the knee, between the hamstring tendons. The
  test checks that the bin really is a hollow.
  - **What it catches.** Each of the 105 limb course points was moved 20, 40 and 60 mm to each of eight sides, square
    to the axis: 2,520 moves. All 1,245 that take a point more than 5 mm past the limb's surface in its own bin fail.
  - **What it misses.** The other 1,275 moves stay inside the limb, across it or along it, and pass. That needs the
    meshes. The checker's own case is one of them: the tibial nerve's mid-calf point moved 60 mm outward still lies
    inside the calf, whose back is 84 mm behind the shin's axis there. Moved 4 mm past the calf's surface, it fails.
- **Detours and kinks.** A detour point may now turn the nerve at most 60 degrees, and a piece gets one detour. The
  exception is a place a recipe marks as hooking round a bone: the nerve to obturator internus round the spine of the
  ischium (99 degrees). The largest other detour turn is 59 degrees, and the 136-degree hairpin in the C7 back branch
  is gone. Four pieces that no point within 60 degrees clears are left in bone: the posterior auricular branch 21 mm,
  the C3 and C4 back branches 13 mm each, T2's 17 mm. The bends within the recipes were looked at too, and five were
  smoothed:
  - the posterior auricular branch ends at the back of the scalp muscle, without turning back 147 degrees;
  - the lower-jaw and neck branches lost a point laid on the angle of the jaw that swung them in and out;
  - the neck branch's sheet points sit on the neck's side;
  - the suprascapular nerve has one point in supraspinatus, not an inner one and then an outer one.
  9 bends over 90 degrees remain within the 316 bends of the courses: the suprascapular nerve round the blade's spine,
  the T7 intercostal nerve's end, the deep ulnar branch round the hook of the hamate, the subcostal nerve, the
  obturator internus hook, the deep fibular nerve onto the foot, the accessory nerve through the jugular opening, the
  facial nerve's bend in its canal, and the superior gluteal nerve. Most are real bends.
- **The left side.** Every point and piece is now checked against the mirrored left side's own bones as well, and root
  openings are placed clear of bone on both sides (C1, C7, C8 and T6 moved 3 to 4 mm). The bundle of the brachial
  plexus was lowered 3 mm, so the C8 root still climbs only 7.6 mm. In bone:
  - right: 222 of 13,614 mm (1.6 %; 113 mm of it in the skull's passages);
  - left, mirrored onto its own bones (not the game arm): 199 of 11,210 mm (1.8 %);
  - the same pieces on the right: 222 of 11,210 mm (2.0 %).
  The right side's share is up from 1.4 %: the turn bound leaves the four pieces above in bone.
- **Smaller fixes.**
  - **Platysma:** its point rides the neck. On the jaw, it swung 41 mm when the jaw opened.
  - **Temporal branch:** laid every 8 mm, 1.5 mm out. Its points lie 1.6 to 2.9 mm off the nearest mesh, and the middles of its pieces up to 2.9 mm. One piece, at the upper edge of the cheekbone's arch, is 5 mm off at its middle.
  - **Quadratus lumborum:** its way ran back up the lumbar bundle. A muscle's way now runs only outward: the root
    joins at its own point, or at the point where the muscle's branch leaves if that lies above it. A twig on the
    bundle itself leaves no higher than its root's join point. A test walks every muscle's whole way.
  - **S3 and S4:** their joins were the far points because the join rule charges 3 mm for every millimetre a root
    would climb past 3 mm. A point beside the S3 opening and one on the bundle's lower edge, in front of the S4
    opening, now take them: 19 and 31 mm, before 75 and 79.
- **Anatomy.**
  - **Trapezius:** main level now C4. The charts of what each level moves give shrugging the shoulder to C4. Other
    tables give C3, and the row's note says so.
  - **Sternocleidomastoid and trapezius:** their notes now justify the level by where the accessory nerve's cells
    lie (about C1 to C3 for sternocleidomastoid, C2 to C5 for trapezius), as their way is drawn. Before, they cited
    the cervical plexus.
  - **The crossing corticobulbar link** now ends at the opposite half of the pons, where the face's nerve centre lies,
    not at the medulla.
  - **Link 7:** its right-half wording is shorter.
  - **Reading dates:** the three sources read on the second pass say 22 November.

**Not done, or not right.**
- Nothing here has been SEEN in the game: no view draws it on this branch. The pictures looked at are from a plotter
  of this work (bones as dots, courses as lines), front and side, which shows gross errors only.
- 74 of 152 main roots are choices, not readings; 16 rows are "taught both ways" and say so with the other value. The
  rows least certain: the deep back muscles' levels (11 rows: no open table gives them per part).
- A plexus is one bundle: the brachial plexus's trunks, divisions and cords, the median nerve's two roots and the
  sciatic nerve's two halves in the thigh are not drawn apart. Branch points are where the rule put them, not measured.
- The cranial nerves' openings in the skull are placed by offsets from landmarks, not found in the skull meshes; the
  intracranial stretches run through bone as drawn (128 mm, in pieces that end in one of those passages).
- Every point rides ONE rigid segment. The belly wall, the neck and the shoulder are skinned between several bones, so
  when the trunk bends or the shoulder moves, a drawn nerve there will slide against the muscles beside it.
- The left arm's nerves are the right arm's mirrored, not laid on the game arm's own meshes. Measured once, by hand
  (not in a test): on the left game arm as the page prepares it (`bulkArmAssets`), all 56 mirrored arm course points lie
  within 11 mm of one of its vertices (median 2.9 mm), and the mirrored elbow and wrist pivots within 3.5 mm.
- The map of section 192 has to follow two changes of the third pass. The crossing corticobulbar link now ends at
  the opposite pons, not the medulla. The way to a muscle (`nervePathForMuscle`) may start at a lower join point than
  before: it never runs back up a bundle. Its twigs' `at` changed for 92 muscles, and 23 muscle points ride another
  segment, as the game moves their muscle. The courses' point indices changed too (the anterior interosseous nerve now
  leaves the median nerve at its point 5). A view that stores indices must take them from the data, not from this
  text.
- The map of section 192 has to follow three changes of the second pass: draw each root to its join point
  (`rootJoin`, `rootWay`), not to the bundle's first point; draw the accessory nerve's roots from the cord's side
  inside the canal (`rootsLeave: 'cord'`), not through the openings between the vertebrae; and use `crossing` and
  `crossesAt` to draw where the brain's routes change sides. A copy of the map's own 26 tests (its branch at `e826d11`,
  read only) run with this second-pass data passes 25. The one that fails counts seven head nerves a side, but the
  accessory nerve now starts at the cord, so there are six.
- Left out: cranial nerves IV and VI and the eye-turning branches of III (no such muscles in the rig), the pudendal
  nerve, S5 and the coccygeal segment, the sympathetic chain, all skin nerves, the sensory side as its own routes (the
  report up is the view's, along the same nerves).
- The module is about 200 kB (the generated block 94 kB, of which the limbs' outline 22 kB; the tables and their notes
  most of the rest). It is loaded by
  nothing here; a view that imports it adds one script to the page's count (`PAGE_SCRIPTS`) and should load it on
  first use, not at the start.

## 194. The faults a review and a play-through found in Body update 63 (21 November, evening)

The user: W and S "are not rotating internally or externally while moving" (Message 186); "in returning to its previous
place, you won't see corresponding activity and muscle activation. It will just return." (206); a look or a click
switches on what the crosshair is on (148); a limb that collides "will push them out of the way rather than going
through them" (174). Body update 63 was read by a review (three findings confirmed by two readers each, C1 to C3;
twelve more that nobody had checked, U1 to U12) and played by testers (two findings seen by one tester). Each was
shown here first (offline on the game's own body, in the browser, or, for U1 and U3, from the code and by arithmetic:
said where it applies), then fixed in the function it was in, with a test that fails on update 63. A check of the
package the same night showed C3 and U1 in the browser, before and after, and found eight more things; what was done
about them is in the paragraphs marked "after the check".

**S on a hanging arm no longer turns the upper arm** (C1; `LIMB_CHAIN.rightArm.spin.across.elbowMm` in `ns-grasp.mjs`).
Section 183 let the keys turn the right upper arm about its length "only with the arm brought across the front of the
body". The test for that asked only that the hand's place lie 20 mm toward the body's other side of the elbow. A
hanging elbow sits 5 to 11 cm to the outside of the shoulder that S draws the hand toward, so the test held there too;
the low arm has no sideways swing left under the combined-range rule, the step counted as blocked, and S turned the
upper arm inward. Offline, on the game's own body, 90 frames of S as the game runs the keys: from raise 20 / swing 0
the turn went 35 to -15.8 degrees, from 0 / 0 to -16.5, from 20 back to -13.8, from 34 back to -5.8; with the arm
raised out to the side and the elbow at a right angle, A turned it outward to as much as 55. Of 150 poses the body
takes, S turned the upper arm in 24: 4 across the chest (meant), 1 by the body's own range rule (not the keys) and 19
that were not meant; A in 5 that were not meant. The turn's leave is now given only with the upper arm itself brought
across: the elbow at least `elbowMm` (80 mm, a quarter of the upper arm's length) toward the body's other side of the
shoulder. In every wrongly turned pose the elbow was 57 to 327 mm to the outside when the leave was given; in the arms
across the chest (raise 40 to 90, across 20 to 45) 110 to 251 mm to the inside. After: S turns the 4 across the chest
by the same amounts as before (-39 to -55) and the range rule's 1; A none of its 5; the arms across the chest of section
183's tests are unchanged (the hand in to 14 cm of the shoulder). Two low arms just inside (raise 20 and 30, across 15,
the hand in front of its own side of the chest) were turned 67 degrees before and are not now. The test is made when the
leave is given, not while it lasts: as S draws the hand in, the elbow itself goes back out past the shoulder.
After the check, two residues, both shown offline with the check's own probes (`across.handMm`, `across.again`):
- The leave lasted until the look next carried the limb, so the keys alone could take it out to the side: across the
  chest 43 / -31, S for 1.5 s, W, D, then S again turned the upper arm from -49.0 to -56.1 with the elbow 29 cm outside
  the shoulder (4 of 24 such runs, 2 to 7 degrees). The leave now ends, and none is given, once the hand's place is
  level with the shoulder or outside it (`handMm` 0): 0 of 24. While S draws a hand in from across the chest its place
  stays inside, and those runs end as before.
- The app takes the leave away whenever the look carries the limb. At raise 70 / across 30, after half a second of S
  and a small look movement, the elbow was 79 mm inside (under `elbowMm`), no leave was given again, and S ended with
  the hand 28 degrees off its line and the turn stuck at -19. An upper arm that the keys have turned, and that nothing
  else has turned since (the solve keeps the turn's value before and after the last frame that turned it, and the next
  frame's value must lie between them), is given the leave again without the elbow's test while the hand's place is
  inside: the run now ends 9 degrees off at -44, as the uninterrupted one. A second such run (raise 90 / across 20)
  ended 27 degrees off at +4 on update 63 as well and now ends 11 off at -28. A first version gave the leave again to
  any upper arm turned inward of 12 degrees; the limb turn's own overside end is -15, so after a double tap of Space
  it would have turned the low arms that `elbowMm` refuses (a test now keeps that). A second check then found that the
  record outlives the look's carry (the carried arm is solved with no spin, so the turn and the record stay): S across
  the chest, the look carried the arm down to a low pose, then S turned the upper arm 3 to 20 degrees more in 65 of 96
  such poses, with elbows from 97 mm outside to 55 mm inside the shoulder. The renewed leave now keeps part of the
  elbow's test (`againElbowMm`, 60 mm inside, against 80 for a first leave): 0 of 96, and the case above (79 mm) is
  still given it. Of the check's 129 poses the same 17 turn by the same amounts and the same 6 low arms are refused.

**The view's follow of a keyed limb is the game's turn again** (C2; `followLimbView` in `ns-app.mjs`). Section 184 made
a turn the game makes by itself feed no glow and switch nothing on (`gameLookSeq`); section 185 rewrote the follow.
After the merge the count stood only in the old follow's branch, which no longer runs, so every turn of the live follow
(up to 75 degrees a second) was read on the next frame as the player's own look. In the browser (key 4, then D held):
while the view turned 26 degrees to keep the right hand in the picture, the neck area rose to 0.69 and the LEFT
shoulder's area to 0.61, and the left shoulder of your body and of the mirror body were drawn blue, with only the right
arm moving. One line (the count, after the follow's turn). After: the right shoulder's area 1 (the limb the key moves),
the neck at the turned head's own resting level 0.07, the left shoulder's area not shown, nothing blue. This is also
the review's U2 and U10, and section 185's "H9's side effect ... was not traced".

**A movement started while another still carries the view holds the look on its own spot** (C3; `CARRIED_LOOK.chain`,
`carriedLookStep`). The hold of section 184 was decided once, when the view began to be carried, and "no hold" then
stood until nothing carried it any more. A second neck or trunk movement begun in that time (within about 1.5 s) got no
hold. In the browser it happens through a click (while the trunk moves the look is recorded silently) and, as the check
found, through the look itself in the moment the trunk stands still at its end: "Lean back" by a look, the look moved at
once to a neck spot, then a click there or the look's own rest. On update 63 the click started "Tilt head back", the
view swung 30 degrees up, the tip by the crosshair went blank, then said "Right middle finger", then "Right thumb", and
a second click 12 frames later did not repeat the movement (the check's run: the tip said "In-between area", nothing,
"Eyelids", and a second click 0.47 s later did nothing; on this branch the look stayed on Neck through the swing and the
second click repeated the movement). Now a movement begun while the view is still carried (the activity's count of
movements, `moveSeq`, has gone up) is decided afresh by the same first-frame rule; a hold that is on stays the same hold
when a click repeats its movement.

**The hold ends with E and with a turn of the look by the game** (U1; `CARRIED_LOOK.viewEnds`). The hold stood for "the
player left the look where it was" and told that from the pointer alone. E changes the view, and choosing a limb or
moving one with the keys lets the game turn the look: the crosshair is then on something else by the player's own doing,
while the look went on naming the old spot and a click repeated the old movement (read from the code: nothing ended the
hold but the pointer and an area key; shown in the browser by the check: on update 63, after E, with the crosshair on
bare brain in the outside view, the tip still said "Neck" and a click repeated "Bend head forward", and with key 4 and D
held the follow turned the look 8 degrees, the hold stayed and a click repeated; on this branch the tip follows the
crosshair and the click does nothing in both). A change of the view (the count of E presses) or a turn by the game since
the hold began now ends it, like the player's own look.

**A look that arrives on an area during a neck or trunk movement switches it on when the movement is over** (after the
check, its one major finding, an old fault; `CARRY_ARRIVAL`, `carryArrivalStep` in `ns-app.mjs`, the gaze event's
`arrivedFrom` in `ns-actions.mjs`). While a neck or trunk joint moves, or the eye view still swings, the gaze is
recorded silently: the view slides by itself then, and what it slides onto must not switch on (section 184). The
player's own pointer can move the look in that time too, and the area it came to rest on was recorded just as silently,
so once the movement was over the area counted as already looked at and stayed dead until the look left and came back.
In the browser, on update 63 and on this branch before the change: "Lean back" by a look, the look moved in one move
onto the left toes' area while the trunk contracted, the trunk at rest 1.3 s later, the look resting 3.7 s: nothing (the
count of movements 4 to 4 and 7 to 7). Now, when the PLAYER moved the look during such a movement, the frame remembers
the area the look was on before, and the first frame after the movement tells the activity so: an area other than that
one is met as an arrival and switches on after the usual rest. After: the left big toe curled about 0.35 s after the
trunk was at rest (7 to 8), with no look off and back. What does not count, and switches nothing on as before:
- the player left the look alone (the view only slid and came back: section 184's case);
- the look is held on the movement's own spot, or a click took the area under the crosshair;
- the frame was silent for another reason as well (the game turned the look, a limb or the mirror body is carried, the
  view was changed);
- the look ends on the area it started from. That covers a nudge of the mouse during the head's own swing, which would
  otherwise make the same area fire again each time; it also covers a look that went away and came back within the
  movement, which is judged by where it rests when the view is the pointer's again (during a swing of 15 to 30 degrees
  what is under the crosshair says nothing of where the look is).
The check's suggestion, to give the silent frames to the activity as empty space, was not taken: a click during the
movement acts on the area the activity has under the look and would have found none, and the nudge above would have
fired the area again.

**A push asks for the same approach speed at every refresh rate** (U3; `LIMB_PUSH.frameRefS`, `pushFrameShare`). The
push's three small distances (the mover's end moved 0.4 mm, the overlap grown 0.5 mm, and section 185's `approachM`, the
point of contact come 1 mm nearer) are per frame. At 60 frames a second the keys move a limb's end 10 mm a frame, and
1 mm is an approach of 6 cm a second; at 240 frames a second the same 1 mm asks for 24 cm a second, so a contact near
the mover's root or at a slant (a quarter of the keys' speed is 0.6 mm a frame there) never counted and the limb was
passed through (by arithmetic: the browser here draws 60 frames a second at most). On a frame shorter than a sixtieth
of a second each distance is now taken in proportion. At 60 frames a second and below nothing changes.

**One quick look move from an arrow onto an area switches it on** (the play-through; `PICK_LAG`, `overrideChangeSilent`,
stepFrame). The crosshair's pick (what is seen there: an arrow tip, a body) is asked of the picture drawn the frame
before, and since 19 November its answer serves two more frames while no input event arrives. After one quick move from
an arrow tip onto a nearby area the pick went on saying "arrow" for up to three frames, and the gaze was blanked; when
the fresh pick came the look had not moved, so the change counted as "only an override changed under the same look" (the
rule that no area switches on because a body or an arrow tip moved off it) and was recorded silently. The area was then
only seeded: it could not switch on however long the look rested, until the look left and came back. In the browser,
from the arrow at the top of the strip in one move onto the left toes' and the right toes' area: on update 63 neither
switched on in 90 frames of rest (2 of 2; each did after looking off and back). A change of the override within
`PICK_LAG.frames` (3) frames of the look's last movement is now taken as the pick catching up with the player's own look
and is not silenced; later than that it is silent as before. After: both switch on (2 of 2), as does the same move from
bare glass (the check: 0 of 3, then 3 of 3, two of them at the game's own 56 frames a second). After the check: the 3 is
no longer a number of its own. `PICK_LAG.reuse` (2) is the count of frames a pick's answer goes on serving, read by the
frame's pick itself, and `frames` is reuse + 1: the pick is of the picture drawn the frame before, so that is the exact
longest lag (the third still frame), not a margin. And the window opens after the PLAYER's look only: a look or a view
that changes on a frame that is silent for its own reason (the game turned the look, E, the head carried the view, the
brain turned a step) starts the count past the window (`stillFramesNext`), so a late pick after such a change is
silenced as it was before this rule. The lag the other way stays: after one quick look move ONTO an arrow tip the area
behind the tip is looked at for up to three frames, which under about 43 frames a second is longer than the 0.07 s rest,
so that area could switch on (by arithmetic; neither the check nor this package could stage it: the arrow tips at the
start view have no area behind them). Asking the pick afresh whenever the picture it was taken from is no longer the
last one drawn would cut the lag to one frame both ways (`PICK_LAG.fresh`, built and left off). It was taken only if it
cost no frame time while the look moves, and it does: measured in turns on one page while the look moved as in the frame
table's "look" case, the pick asked on nine frames of ten instead of one in three, and its own time went from 1.3 ms a
frame to 3.3 to 4.5 ms (the whole frame's mean from 19 to 21 ms to 21 to 22 ms in the quiet pairs; the frames a second
differed by less than the runs' own spread).

**Words** (U4 to U9, U12). With a free pointer over one of your limbs the tip said "Space holds your right hand"; Space
there chooses the limb (section 186 corrected the card, not this tip): now "Space chooses your right arm"
(`TIP.spaceAim`). The grip card's "Your right leg is chosen" named the limb the press of Space had chosen; with Space
kept by a tap, key 1 to 4 or a double click chose another limb and the card went on naming the old one: it now names
the limb chosen now (`gripChosenLimb`). The tutorial's drag line and the player guide said every sideways drag on a
limb turns it; on the right hand it bends the wrist (section 183): both say so. The player guide said W and S never
turn a limb; it now names the one exception, the right arm across the chest. The preview notes' Controls list said both
"Press a number, 1 to 9, to do the movement" and "1 to 4 choose a limb", that Space takes hold of a limb and "Your left
hand closes", that a click does "the highlighted movement", and that E "does nothing while Space holds something"; and
its limits said the left wrist's sideways bends "only light their area" (they move the hand since section 184). Each
now says what the control does.
After the check, each first read against the code (the numbers 1 to 4 choose a limb and 5 to 9 do nothing; Space on a
limb chooses it; the areas with no movement are the tongue and the three in-between areas of each half, the left
shoulder has four): the preview notes no longer say that a movement stays until its opposite is switched on, that a
number key moves a body part, that held movements do not add up or need a key to come back, or that Space holds a limb
and closes the left hand; the README's paragraph on the areas no longer says that keys 1 to 9 do the movements, that a
part stays where it was driven until the opposite area is switched on, or that W, A, S and D move the left hand only;
in `ns-text.mjs` the keyboard picture's spoken label, the line under it about Space and the older one-line hint say
that 1 to 4 choose a limb, that Space on a limb chooses it and that a look does the movement. (A second check: after a
tap that keeps a hold of the brain or the mirror body the hands stay closed with Space up, so the line under the picture
and the preview notes say "while Space is down, or keeps a hold after a tap". The one-line hints are put in the HUD's
hint slot, which the style sheet hides; their comment says so.)

**Looked at and not changed.**
- U11 (the review: the gate of section 184 "removes the looked-at link that drives ... the whole-brain pick tint").
  True: the tint follows the strongest glow link, and since `LOOK_ARMS.on` gates the soft link of the area the look
  rests on, an area that is only looked at has no link once its contraction's light has ended (in the browser, the look
  resting on the right toes' area: no glow link). The whole brain's faint light in the area's colour (Message 177)
  therefore shows for the 0.4 s of a contraction and for a muscle under the crosshair, no longer for an area the look
  rests on. Left to the package that is rebuilding that light.
- The play-through's second finding ("as a toes area's return begins, the brain tissue next to it turns lilac and fades
  only slowly"). Shown as numbers on update 63, and it is the tissue's own light (`BRAIN_LIVE.bloom` and the area loop
  of `ns-scene-three.mjs`), by two of its rules. The tissue round the area under the crosshair keeps a bloom of
  `lookLevel` 0.35, with a dimple of 0.8 mm, for as long as the look rests there (read 4 s after the area's own movement
  had ended, and 1.9 to 5.7 s after a click: strength 0.35), so when a contraction's light ends the bloom falls from 1
  only to 0.35 and stays. And a bloom that is let go eases out with `outS` 0.8 s: after the look had left, 0.14, 0.10,
  0.05 and 0.03 were read about 0.3, 0.8, 1.5 and 3 s later. Both belong to the light another package is rebuilding;
  nothing was changed here.
- The arrow keys from the start view (the right key steps to the Throat, then to the lower in-between area, then finds
  no area). The walk does end there. The areas are one chain (`areaChain`: one half's lowest face area up to its toes,
  then the other half's toes down to its lowest face area); the brain is drawn turned, so the right key walks toward the
  chain's start, which is the strip's lower right end, and from the start view the nearest area to the right of the
  crosshair is the Throat, one from that end (section 184 said so under "not right"). The other key walks the whole
  strip from there (below).

**Each arrow press lands on the next area, both ways** (after the check; `areaStepTries` in `ns-app.mjs`). On update 63
the left key walked 52 areas from the lower right end to the lower left one and passed over one, the right middle
finger's, coming from the index finger's; the right key landed on it coming from the ring finger's. A narrow area has no
point with the area all round it, and then only the first point seen was tried: when the look found for that one point
came out on a neighbour (the eye moves as the head turns to it) the area was passed over, although
`AREA_STEP.looksPerArea` allows three looks. Every point seen is kept now and up to three are tried, the one with the
area all round it first. In the browser on this branch, one press at a time and each one settled: from the start view
the right key took two presses to its end, then the left key landed on 53 areas in 53 presses, every press on the next
area of the chain and none passed over, and the right key back the same; all 54 areas. The player guide's paragraph on
the keys says in two sentences that the strip is one line and which key walks which way.

**Checked.** 528 unit tests on the first pass (eleven new; each fails on update 63's files); on the second, the test
files of this package and the ones beside them (104 tests in 14 files, all pass): `tests/fix63.test.mjs` has 13 tests
now (new: the arrival after a carry, as the activity sees it and as the frame tells it; the pick-lag window after the
game's own changes; the walk's tries) and `tests/limb-hold.test.mjs` two of this package (new: the two residues of C1).
`?case=boot` ok. Offline, on the game's own body: the keys' turn of the upper arm from 150 poses for each of W, A, S and
D, before and after, and the check's two probes after its residues. In the browser, on update 63 and on this branch with
the same scenario: the follow's lights (C2), the look move from an arrow (0 of 2, then 2 of 2), the check's scenario 2
(the arrival after a carry: 7 to 7, then 7 to 8; the look move from an arrow 3 of 3; C3's second click during the swing
repeated the movement; U1's follow turn ended the hold), the arrow keys' walk to both ends. The browser tests
`browser-startup` and `browser-keyboard-aim` pass on the second pass (on the first, `startup` timed out at its own 60 s
wait on the busy machine, on this branch and on update 63 alike); the other twelve are left to the merge's checks. The
first pass ran on a machine shared with six other packages (one to three minutes to load the game, a frame every half
second to two seconds); the second ran one job at a time at the game's own speed. The frame table was not taken (the
lead runs it on the merged work); the only frame-time question of the second pass, the fresh pick, was measured as above
and left off. None of the changes taken adds work to a frame beyond a few counts and comparisons, and on a frame of the
keys' solve of the right arm one more point of the posed arm.

**Not done, or not right.**
- The lag of the pick the other way (one quick look move onto an arrow tip; below about 43 frames a second the area
  behind the tip can switch on) stays: its fix costs about 2 ms a frame while the look moves. Not staged in the browser.
- U3 was not tried on a display faster than 60 frames a second.
- The tests of the arrival after a carry and of the pick-lag window check the pure rule and the activity; the wiring in
  the frame is shown by the check's browser scenario, not by a unit test. The C2 test still reads the source (now
  without its comments); a behavioural test would be a browser run, not written.
- The keyboard picture still lights the number keys 5 to 9, which do nothing since the numbers choose a limb (its rows
  take the movement keys' list); the README's opening paragraphs on the update of 11 November still say Space takes
  hold of a limb; the README's and the preview notes' sentences on the lights were left to the package rebuilding them.
- U11 and the tissue's light (above) are handed over, not changed.
- The keys' record of their own turn (`spinTurn`) is in the solve's memo, which the app keeps for the whole game: a
  turn the keys left in place gives the leave again in a later hold of the same arm too, while the hand's place is on
  the body's other side of the shoulder, the elbow at least 60 mm inside it, and nothing else turned the arm in between.
  Shown offline only, not in the browser.

## What is left, and whose it is

**For the project's independent review and release, not for the author of these changes.**
- Independent browser review of the whole build, including other browsers, touch and screen readers. The author's scripted checks and three readings by other instances of the same model do not replace it.
- `SHA256SUMS` and `release-manifest.json` in this working copy predate these changes. They are regenerated over the published files at each upload.
- Publication. Since 12 November the user asks for each finished version to be uploaded to the project's GitHub repository, and that is done. An upload is not an independent review.

**Limits of this build that were looked at and left, each with its reason in the section named.**
- Touching muscles: with the colour rule of 22 November (no pink, mauve or blood crimson) about 1 in 80 visible contacts between two muscles is drawn nearly equal and about 1 in 10 is weak (the lead's colours: 1 in 21 and 1 in 5); the darkest forearm flexors have the fewest colours; the left and right muscle of a pair share one colour at the midline; the pairs seen side by side, and the light on them, are known from eighteen views only (188).
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
- An area that moves nothing (the black blocks, the tongue) shows no light of its own on a click, only the key's press and a soft glow round it: this package's rule (the brief's and the lead's), not asked of the owner (191).
- The glow of the strip was looked at frame by frame mostly with the page's clock slowed, on a machine drawing a few frames a second; at real speed in two runs; never on the owner's display (191).
- At the start view the face, jaw and throat movements travel under 6 pixels on the mirror body's face (the ink on the eyelids and lips makes most of them readable; the brows, the nose, the jaw's sideways move and the throat read by their light), and fourteen other small movements under 12 pixels; at the look on a hand area your own left arm stands wherever the look has brought it, sometimes with the hand beyond the frame (189).
- The nerve data for the electrical map is typical and simplified: 74 of its 152 main roots are choices where the sources read mark none, a plexus is one bundle, the cranial nerves' openings in the skull are placed by offsets, and 1.4 % of the drawn length still lies in bone (most of it in the skull's own passages); nothing of it has been seen drawn in the game on its own branch (193).

**Asked for in the user's notes and not done yet.** These stay with the author of these changes.
- The electrical map (the owner's notes of 20, 21 and 22 November: "a live brain scan map where you have electrical wire, electrical storm activity going everywhere"). It is there on M, as a live scan with storms, and no person has played it. The strip's blocks show under the dark ground, not over it as the lead asked (a second draw broke them into dark triangles); an activated block is not the brightest spot. The lit nerves at your own raised shoulder are a tangle, and lines kink at strongly bent joints; the beads cannot be told apart on the small mirror body; two lit areas that share a wire show one colour; the report's way up is a drawn convention; the first M press takes about 0.7 s (192).
- Performance (Messages 42, 48 and 50). Holding and carrying the mirror body, the slow limb turn and the view over the shoulder still fall below 60 frames a second on the test machine (66, 71).
- Part-way positions from the brain (Message 47). An activation takes a part to the end of its movement (59).
- Controls (Message 46). Replaced on 17 November: a held thing follows the pointer across the view (80). The mirror body's top and bottom arrows turn it (73).
- Limbs knocking each other about (Message 39). Your own limbs are not checked against each other and can pass through one another (33).
- From the notes of 17 and 18 November, not done yet: limbs that do not look small in the start picture, with bulkier muscles, wider far ends of the limbs and chunky fingers and toes; a thicker neck; the mirror body magnified and nearer; a down arrow for the brain that is always reachable; vessels laid out as anatomy and a brain plainly different in shade from muscle; a neon blinking, shuddering effect on activity; muscles that swell as they contract; the colour code of the strip and the body redone from scratch with visible links between an area and its part; grouping ("chunking") of every overlay; a pass over all earlier notes for small fixes; collision effects and one limb pushing another; a limb hidden behind another limb staying visible; what the sweep of 87 still shows (the kneecap and the lower end of rectus femoris at a fully bent knee) and a rule for joint angles in combination; the move from the Borderlands look toward a more detailed, glossy, fleshy graphic-novel look.
- Arrow places (Messages 7 and 31). The brain's bottom arrow is off the middle of its side (59).
- The graphics as a whole (Message 41), and the review of earlier notes and versions asked for in Message 48, are done in part only.
