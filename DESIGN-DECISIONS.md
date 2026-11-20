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
- **The whole brain takes the picked colour, faintly** (`BRAIN_PICK_TINT`). While an area is looked at or switched on the cortex gets 6 % of that area's glow colour added, a little more on its lit side, eased in and out over about a fifth of a second. One uniform in the cortex shader; no new pass.
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
- Part-way positions from the brain (Message 47). An activation takes a part to the end of its movement (59).
- Lowering the left arm from the strip (Message 48). The left shoulder area has no movements of its own (61).
- Controls (Message 46). Replaced on 17 November: a held thing follows the pointer across the view (80). The mirror body's top and bottom arrows turn it (73).
- Limbs knocking each other about (Message 39). Your own limbs are not checked against each other and can pass through one another (33).
- From the notes of 17 and 18 November, not done yet: limbs that do not look small in the start picture, with bulkier muscles, wider far ends of the limbs and chunky fingers and toes; a thicker neck; the mirror body magnified and nearer; a down arrow for the brain that is always reachable; vessels laid out as anatomy and a brain plainly different in shade from muscle; a neon blinking, shuddering effect on activity; muscles that swell as they contract; the colour code of the strip and the body redone from scratch with visible links between an area and its part; grouping ("chunking") of every overlay; a pass over all earlier notes for small fixes; collision effects and one limb pushing another; a limb hidden behind another limb staying visible; what the sweep of 87 still shows (the kneecap and the lower end of rectus femoris at a fully bent knee) and a rule for joint angles in combination; the move from the Borderlands look toward a more detailed, glossy, fleshy graphic-novel look.
- Arrow places (Messages 7 and 31). The brain's bottom arrow is off the middle of its side (59).
- The graphics as a whole (Message 41), and the review of earlier notes and versions asked for in Message 48, are done in part only.
