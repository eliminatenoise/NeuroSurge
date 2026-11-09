# NeuroSurge: player guide

## 1. What NeuroSurge is

NeuroSurge is a small first-person game that runs in your web browser. You look out through the eyes of a body with
no skin: you see its bones and the muscles attached to them. A very large see-through brain floats in front of you.
When you look at one of the brain's movement areas (motor areas), that area lights up, and the muscles it controls
light up in the same colours and move the body. A soft glow joins the area to those muscles. Behind the brain stands
a mirror image of your body that copies everything you do.

Please keep these points in mind:

- **It is a simulation.** Every brain signal and muscle level in the game is made up by the computer. It is a number
  from 0 to 1 used for colours and movement, with no real-world unit. Nothing is measured from anyone's brain or
  muscles.
- **Your mouse, clicks and keys are game controls only.** Looking at a brain area does not send signals into a real
  brain, and nothing reads or decodes brain signals.
- **"NeuroTranslate 0.0" is only the name of a research model** that NeuroSurge is a companion to. No trained or
  validated model runs in this game, and the game does not translate brain activity into movement.
- **The brain map is simplified.** In real brains the areas for different body parts overlap and differ from person
  to person. The areas in the game are a rough map, not exact points for single muscles.
- **The glow is only a picture, not a nerve.** It shows which muscles an area moves in this game. Real signals travel
  from the brain down the spinal cord and along nerves to the muscles (for the head and face, from the base of the
  brain).
- **The body is one reference body** from the BodyParts3D anatomy collection, with face and chewing muscles from a
  second free anatomy atlas, Z-Anatomy. It is not you, any real measured person, or an average person. The bones move
  as stiff pieces, and the muscles are bent to follow them. This is a picture of movement, not a model of how real
  muscles contract.
- **The mirror body is only a picture too.** It copies your body's moves and colours. It is not a second person, and
  nothing is measured from it.
- NeuroSurge is not a medical device. Do not use it for diagnosis, treatment or clinical training.

Everything runs on your own computer. The small server that comes with the game only answers your own computer, and
it tells the browser not to let the game page contact any other website. Nothing is uploaded.

## 2. How to run it on your computer

You need:

- [Node.js](https://nodejs.org/) **18 or newer**. It is only used to run the small local server that comes with the
  game (`serve-local.mjs`).
- A desktop web browser with **WebGL 2** (3D graphics), such as a current Chrome, Edge, Firefox or Safari. (This
  build was only tested in Chromium; see section 6.)
- A keyboard and a mouse or trackpad.

**Why you cannot just double-click `index.html`:** browsers do not let a page opened straight from your disk
(an address starting with `file://`) load the game's code files and data files. The game has to be opened from a web
address, which the local server gives you.

### Steps

1. Get the folder, in one of two ways:
   - **Download:** on the repository's GitHub page, click **Code**, then **Download ZIP**, and unzip it. The folder is
     called `NeuroSurge-main`.
   - **Clone with git:** the `git clone` command is in the README's "Play it" section. The folder is called
     `NeuroSurge`.
2. Open a terminal in that folder and start the server:

   **Linux or macOS (Terminal):**

   ```sh
   cd ~/NeuroSurge            # or wherever the folder is, for example ~/Downloads/NeuroSurge-main
   node serve-local.mjs
   ```

   **Windows, PowerShell:**

   ```powershell
   cd $env:USERPROFILE\Downloads\NeuroSurge-main     # or: cd ~\Downloads\NeuroSurge-main
   node serve-local.mjs
   ```

   **Windows, Command Prompt (cmd.exe):**

   ```bat
   cd %USERPROFILE%\Downloads\NeuroSurge-main
   node serve-local.mjs
   ```

3. The server prints a line like `Open  http://127.0.0.1:53127/  ...`. Copy that address into your browser. The
   number at the end (the port) is different each time.
4. When you are finished, go back to the terminal and press **Ctrl+C** to stop the server.

If you need Node.js on a Mac, you can install it from nodejs.org or with Homebrew (`brew install node`).

### Server options

| Option | What it does |
| --- | --- |
| *(none)* | Your computer picks a free port, and the server prints it. |
| `--port 8080` | Use that port instead. If it is already taken, the server says so and stops. |
| `--root FOLDER` | Serve another copy of the game from that folder. |
| `--quiet` | Do not print a line for every file the browser asks for. |
| `--verify` | Check every game file against `SHA256SUMS`, then stop without serving. |

The server only accepts connections from your own computer (`127.0.0.1`). It never lists folders, never sends hidden
files or anything outside the game folder, and tells the browser that the page may only load files from this server.

### Other ways to serve it

Every address the game uses is relative to its own page. So the folder also works from any web folder: at the top of
a website, or in a sub-folder such as `/NeuroSurge/`. Any ordinary web server can serve it, as long as:

- it sends `.mjs` files as JavaScript, and
- the address is `localhost`, `127.0.0.1` or starts with `https://`. The game checks its files with a browser
  feature (`crypto.subtle`) that only works on such addresses.

There is no online copy to play: GitHub Pages (GitHub's free web hosting) is not switched on for the NeuroSurge
repository, and whether to switch it on is the repository owner's decision. To play, run the game on your own
computer as described above.

### Checking your copy

- Linux: `sha256sum -c SHA256SUMS`. macOS: `shasum -a 256 -c SHA256SUMS`. Any system: `node serve-local.mjs --verify`.
- In a copy taken from GitHub, `--verify` names the repository's own files (`README.md`, `LICENSE`,
  `PROJECT-CONTEXT.json`, `.gitignore`, `.gitattributes`, `.nojekyll` and, after `git clone`, the `.git` folder) as
  "not part of the game". They are not checked, and that is expected. (`.nojekyll` is an empty file. It only matters
  if GitHub Pages is ever switched on: it makes Pages serve the files exactly as they are.) `sha256sum -c SHA256SUMS`
  simply ignores these files. Any "sha256 mismatch", "missing" or "not listed" line is a real problem.
- `release-manifest.json` lists every game file with its size and sha256, and the build time. Its `content_sha256`
  is the fingerprint of this build.
- While it loads, the game itself checks the movement map and its three mesh lists (arm and brain, full body, face
  muscles) against sha256 values written into the game code, and checks every mesh file against its list. If anything
  differs it stops with a message instead of showing changed data. (If only the face muscles fail, the game says so and
  goes on without them.)
- The repository's `.gitattributes` file stops git from changing line endings (for example on Windows), because a
  changed line ending would change a file's sha256 and the game would refuse to start.

## 3. Controls

When the game starts it shows its "How to play" page for 2 seconds. While the rest of the body is still loading, the
2 seconds start only once it has loaded. Click to start straight away; the click also "captures" the mouse, so moving
the mouse turns your view. Press **Esc** at any time to pause and see the page again. Pressing Esc during the first
2 seconds keeps the page open.

| Input | What it does |
| --- | --- |
| Mouse or trackpad | Look around. The body stays where it is; your left shoulder follows your view, so the left arm comes along. |
| Click the scene | Start, and capture the mouse. |
| **A** / **D** | Move the left hand left or right on the screen. It is your LEFT arm, so the hand reaches past the middle of the screen, but not to the right edge. |
| **W** / **S** | Move the hand forward or back. |
| Two keys together (for example **W**+**D**) | Move the hand diagonally. |
| Hold **Space** | Make a fist with all five fingers. Let go to open the hand. |
| Double-tap **Space** | Turn the palm over: palm down to palm up, and back. **New:** your upper arm turns at the shoulder with it, and your shoulder and body follow a little, the way a real arm moves. The mirror body does the same. |
| Look at a coloured brain area | Switches that area on for 1 second. Looking at empty space, or at brain glass that is not a motor area, switches nothing on. |
| Keep looking at the area for half a second | The area gets a gold edge (a mark) that stays until you press Reset body. A quick glance does not mark it. A very small area also gets a small gold ring, so you can still see its mark. |
| Click (left or right button) | Switches the area under the crosshair on again, for another second, and marks it at once. |
| Hold **Space** while looking at the brain | Grab the brain. Its outline changes while you hold it. Look around to drag it, then let go of Space to leave it there (for example lower down, so you can see the legs and the brain together). |
| **New:** click one of the four arrows around the brain | Your view turns a small step around the brain (15 degrees). The brain itself stays put. |
| **New:** hold one of the four arrows | After a short moment (about a third of a second) your view keeps turning slowly (about 12 degrees per second). It stops when you let go. The view can turn at most 60 degrees to each side and 30 degrees toward the front or back. |
| **New:** **E** | See your own body from behind (third person). Press **E** again to go back to your own eyes. |
| **New:** click or hold an arrow of the mirror body | Turn the mirror body behind the brain. First move the brain out of the way (see "The mirror body" below). |
| **I** | Show or hide "More detail" in the panel on the right, while you play. |
| **Esc** | Pause and show the "How to play" page, with **Reset body**, **Reset brain view** and the settings. |
| Look far down | See your body and legs. |
| Look far right and a little down | See your right arm. Near eye level the game reminds you to look down a little. |
| Look high up | See your face (as a see-through layer). |

**The 3D compass arrows (new).** Four arrows sit around the brain like the points of a compass: one at the top, one at
the bottom, one on the left and one on the right. Each one sticks out from the brain and then bends toward you, to
show that it turns your view. The top arrow turns your view toward the front of the brain, the bottom arrow toward
the back, and the side arrows to the sides. When you point at an arrow, the line at the top left says "Looking at: an
arrow (click or hold it to turn your view)". With the mouse captured you have to aim the crosshair at the arrow, which
can mean a big look to the side. It is easier with a free mouse pointer: press **Esc** twice, then click or hold an
arrow while you keep watching the brain. Where an arrow sits over your left arm, the part over the arm is drawn
see-through.

**Seeing your own back (new).** Press **E** and the view moves out behind your body (third person). Move the mouse to
look around your body. The brain areas still work: aim the crosshair at an area to switch it on. Press **E** again to
go back to your own eyes. **E** does nothing while you are dragging the brain with Space; let go first.

**The mirror body (new).** Behind the brain stands a mirror image of your body, facing you. You can see it through the
glass brain. It copies everything your body does, at the same time and in the same made-up colours, like a real
mirror: your left arm shows on the same side of the screen. It has its own small green arrows, close to it, behind the
brain. To turn it:

1. Move the brain out of the way: look at the brain, hold **Space**, look away (for example down or to the side), and
   let go of Space.
2. Click or hold one of the mirror body's arrows. Each click turns it 15 degrees; 12 clicks show its back. Holding
   keeps it turning. It can turn all the way round, and up or down.

While the brain is still in front of a mirror arrow, that arrow is grey and a look or click there goes to the brain
instead; the panel then tells you how to move the brain. Look at the mirror body to read about it in the panel.
**Reset brain view** (on the Esc page) puts the brain back and also turns the mirror body back to face you.

**The glow (new).** When a brain area is switched on, a soft glow joins it to the muscles it moves in the game, on your
body and, a little fainter, on the mirror body. The glow fades with the area after its second. Some in-between areas
move no muscles; the panel then says "No glow: this area drives no muscles in the game."

**The "Try this" guide.** When you first play, a short line in the card at the top left gives you one small task at
a time, for example "Try this (2 of 10): Press W, A, S or D to move your left hand." When you do the task, the next
one appears. There are ten tasks: switch on a light-blue (left-arm) area, move the hand, make a fist, flip your palm,
switch on a grey area for another body part, see the glow, turn your view with an arrow, drag the brain, press E to see
your back, and turn the mirror body. The guide never stops the game, and it moves out of the way so that it does not
cover the brain. You can hide it, show it again or start it again on the Esc page (under Settings). The game remembers
where you got to.

**Switching between areas.** After a click, the area stays on for its full second even if the crosshair passes over
other areas on the way (for example when you turn to look at the body part it moves). To switch to a new area, rest
the crosshair on it for a moment (about a third of a second), or click it.

**Reset body** puts your arm and palm back the way they started and clears the gold marks. The brain stays where you
left it. **Reset brain view** puts the brain back where it started, undoing any dragging and turning, and turns the
mirror body back. If you lose the brain, or turn far round it, the game tells you to press Esc and then Reset brain
view.

**Reading "More detail".** The "What is happening" panel on the right has a **More detail** part with the technical
names. Press **I** while you play to show or hide it. With a free mouse pointer (press **Esc** twice) you can also
click **More detail**. Click the scene when you want to capture the mouse again. The **Resume** button on the Esc page
also captures the mouse again.

**Settings** (on the Esc page):

- **Look speed**, and **flip up and down when looking** (invert Y).
- **Face view:** how your face is shown (a see-through layer when you look up, a small box, or off).
- **Picture quality:** **Auto** (the starting choice) keeps the game smooth: if your computer draws the picture
  slowly, the game makes the picture simpler until it runs smoothly again (the mirror body is simplified first).
  **High** always draws the full picture. **Low (for slow computers)** draws a simpler, less sharp picture. The
  colours and what they mean stay the same in every setting. If the page was opened with Low chosen, reload it after
  switching to High to get the sharpest edges.
- **New: Lifted outer muscles (Body Worlds style):** **On** (the starting choice) lifts the outer muscles a little so
  that you can see the deeper ones; **Off** shows them lying flat, as in a real body.
- **Try this guide:** hide or show the guide, or start it again.

The game remembers your settings in your browser.

After you press Esc, most browsers wait about one second before they let the page capture the mouse again. If the
browser does not capture the mouse, click the scene again, or hold a mouse button down and drag to look around. If it
refuses again, the Esc page offers **Resume without locking the mouse**.

## 4. What you see

- **The brain (bigger in this build):** a very large glassy brain in front of you, out of reach, seen from straight
  above with its front at the top of the screen. The coloured movement strip (motor strip) now fills most of the
  screen's width, so the motor areas are big and easy to aim at. The front and back ends of the brain may be off the
  screen at the start: turn your view with the arrows, or drag the brain, to see the rest. A small label shows which
  way is the front ("↑ Front (anterior)"), and stays at the edge of the screen when the front itself is off screen.
- **See-through glass (new):** the parts of the brain glass that are not motor areas are much more see-through than
  before, but it still looks like a brain. Through it you can see the mirror body standing behind.
- **Two kinds of areas:** light-blue areas, in the brain's right half, are for your left arm. Grey areas are for every
  other body part. Some in-between spots move nothing.
- **Motor areas behind your arm:** where your left arm covers part of the motor strip, the areas behind it are drawn
  see-through over the arm, so you can still see them.
- **The body:** bones and muscles without skin, seen from the inside through the eyes. Your whole left arm is in
  view, and the hand stays about three quarters of the way up the screen. Looking down shows the chest, belly and
  legs.
- **Lifted outer muscles (new, "Body Worlds" style):** the outer muscles stand out a few millimetres from the deeper
  ones, like the bodies in a Body Worlds exhibit, so you can see the deeper muscles in the gaps. It shows most on the
  arms, legs and face. In a real body the outer muscles lie right on top of the deeper ones. You can switch it off on
  the Esc page.
- **Your body in front of the brain:** where your own body (legs, chest, right arm, neck) would cover the brain, it is
  drawn see-through, so you can still see the brain areas behind it. Your left arm is drawn normally.
- **Colours:** the signal goes from dark (0, resting) to yellow (1, strongest). The brain areas and the muscles use the
  same colours. An area you have marked keeps a gold edge (plus a small gold ring on a very small area) until you
  press Reset body. The colours were checked for good contrast and for the common kinds of colour blindness (by
  simulation).
- **The left arm** moves with the keys and also when you switch on its brain areas. **Every other body part moves only
  through the brain**, never through keys.
- **The face, now with its muscles (new):** from inside a body you cannot see your own face, so it is shown as a
  see-through layer when you look up (or in a small box, if you choose that in the settings). It now shows the face and
  chewing muscles too: 27 muscles on each side, such as the forehead muscle, the muscles around the eyes and lips,
  the smiling muscles and the jaw muscles. They come from Z-Anatomy, a second free anatomy atlas (see
  `CREDITS-AND-LICENCES.md`). When you switch on a face or jaw area, the matching face muscles light up and a small
  labelled box shows your face for a moment. On the face only the colour changes; the jaw areas also move the jaw, and
  the chewing muscles bend with the jawbone.
- **Your back (new, press E):** from behind you see your back, shoulders and the back of your head. The 3D skull has
  no back part yet, so from behind you look into the inside of the face and skull, which is drawn dark.
- **The mirror body (new):** behind the brain, facing you, with the label "Mirror body" ("a mirror image of you") and
  its own green arrows.
- **The glow (new):** a soft glow joins a switched-on area to the muscles it moves, on your body and on the mirror
  body.
- **The "What is happening" panel** on the right (at the bottom in a tall, narrow window) explains, in plain words,
  the area you are looking at or last clicked: which body part it moves, which muscles pull and which work the other
  way, how the signal travels from the brain to the muscles, and what is simulated versus what is known. The card for
  the last area you used shows its signal as it changes. **More detail** (or the **I** key) shows the technical
  names.
- **The colour key** explains the colours and says that the map is rough. Click **"Sources and rights"** under it to
  see the links to the anatomy licences and sources, including the face muscles' licence (CC BY-SA 4.0) and source.
- If your computer or browser asks for less movement on screen (the "reduce motion" setting), the game turns off its
  page animations, such as the start page's timer bar and the pulsing hint on the arrows, and the view changes (E,
  Body Worlds on or off) happen at once instead of gliding.

## 5. Known issues in this build

These come from the automated checks run on this exact build (see `release-manifest.json` for its fingerprint), from
the developers' own list of open problems, and from the anatomy data itself.

**Automated checks.** An automated test suite plays the built game in a headless Chromium browser and checks 52 of
the game's requirements. In its test mode (fixed time steps and simulated inputs) **47 passed, 4 failed and 1 could
not be decided**. A second run used real mouse and keyboard events in real time: **45 passed, 5 failed and 2 could
not be decided**. The failed checks are about the first three points below. The game's own unit tests (891) all
passed.

- **The motor strip is big, but not quite as big as planned.** The goal was for the motor strip to fill 80 % of the
  screen's width (the part not covered by the panel on the right). It fills about three quarters (77 to 79 %), and on
  most wide screens it is not exactly in the middle. Making it wider would put its ends too far to the side to look at
  comfortably, or squeeze the panel so that its notes no longer fit. Two checks fail because of this.
- **The compass arrows are not always in the middle of their side.** On some tall (portrait) windows and phone-sized
  windows, the left and right arrows sit higher than the middle of the side, and the bottom arrow moves in toward the
  middle; on a 4:3 window the side arrows are shifted. They still work. Two checks fail because of this.
- **The lifted outer muscles uncover a little less than planned.** Looking down at your body, switching the lift on
  should show at least 1.2 times as much of the deeper muscles as switching it off. In test mode it showed 1.29 times
  as much, but in the run with real mouse and keyboard only 1.19 times, so that one check fails there. A bigger lift was
  tried, but then a check of the belly view failed instead.
- **The skull has no back part yet, and the back has few deep muscles.** From behind (E) you look into the dark
  inside of the face and skull, and a few thin bright curves (the edges of the eye sockets) still show. The anatomy
  set has few deep back muscles, so lifting the outer muscles shows little on the back. Both are planned for the next
  round.
- **Speed.** On a fast graphics card the game draws about 60 pictures (frames) per second while you stand still, but
  about 51 to 54 per second while you look around (the previous build kept about 60). Without a graphics card
  (software drawing) it is slow; see section 7.
- **Mouse direction:** the test mode cannot check that moving the mouse right turns you right and moving it down looks
  down, because that needs real mouse movement, so it left this check undecided. The run with real mouse events
  confirmed it (the view is not upside down).
- **Not every area was reached in the real-input run.** In test mode all 44 brain areas were reached by looking around
  and turning the view with the arrows, on every tested screen size. The real-input run cannot aim that precisely, so
  it only counted the areas it found in the starting view and left that check undecided. It also could not see one
  very thin sliver of an area in the 1280 x 720 window (43 of 44), so a second check stayed undecided there. To reach
  every area, look around, turn the view with the arrows or drag the brain.
- **Small screens.** On phone-sized windows the "Mirror body" label has no free place at the very start (it shows
  in other views), and in the view from behind (E) the colour key covers part of the body. Phone-sized windows also
  show only the start of each "How to play" step, ending in "...". The full text is on the Esc page.
- **Some side labels can hide.** The small "your left" and "your right" labels are only shown where there is a clear
  place for them outside the glass on their own side. Where there is none, the label is hidden rather than drawn in
  the wrong place.
- **Reach limits.** The left hand cannot go all the way to the right. When a key cannot move the hand any further,
  the game says so, because the whole hand has to stay on the screen.
- **A gold mark and a bright area look alike in colour.** The gold of a mark is close to the yellow of a strongly lit
  area. Look at the shape: a mark is an edge or a ring.
- **The face muscles are one model.** They come from a second atlas and were fitted onto this body's skull and jaw
  with one overall move; they may sit a few millimetres off. The left and right sides are exact mirror copies (a real
  face is not quite symmetric). The small muscles around the ears are missing from the source file.
- **Old wording in one licence file.** The attribution file inside `packets/bodyparts3d-fullbody-r1/` still describes
  the run-time changes as "whole-mesh rigid transforms". The correct description (bones moved as stiff pieces, muscles
  bent to follow them, outer muscles lifted and tilted a little, a mirror-image copy, colours added, and simplified
  copies drawn on Picture quality Low) is in the game and in `CREDITS-AND-LICENCES.md`. That packet file is protected
  by checksums, so it was not changed in this build.
- **Plain language was checked by a formula.** The game's text was checked with a readability score, not tested with
  real players.
- **Missing anatomy.** The 3D body has no rectus abdominis (the "six-pack" muscle), no latissimus dorsi (the broad back
  muscle), no coccyx (tailbone), no tongue muscles and no back of the skull. So bending the trunk forward colours only
  the belly muscles at the sides (external obliques), and the shoulder card says the latissimus is missing.
- **Only one browser was tested:** headless Chromium on Linux with an AMD graphics card. Other browsers and operating
  systems should work but have not been tested.

## 6. System requirements

| | What you need |
| --- | --- |
| Browser | A desktop browser with WebGL 2 and import maps, for example Chrome or Edge 89+, Firefox 108+ or Safari 16.4+. **Only headless Chromium on Linux was actually tested.** Touch-only devices are not supported. |
| Graphics | A graphics card (GPU) with **hardware-accelerated** WebGL 2 is best. Slower computers can use Picture quality Auto or Low. See section 7. |
| Input | Keyboard plus mouse or trackpad. |
| Screen | 1280 x 720 or larger is best. Smaller and portrait windows work, with shorter labels. |
| Download | About 119 MB, mostly the 490 anatomy mesh files (436 from BodyParts3D, 54 face muscles from Z-Anatomy). |
| Memory | In testing the page used about 130 MB of JavaScript memory with everything on (full body, face muscles, mirror body), plus graphics memory for the meshes. 4 GB of RAM or more is recommended. |
| Start-up | On the development machine the game was ready, with the whole body, face muscles and mirror body, after about 2 seconds. |
| Local server | Node.js 18 or newer. |

## 7. If it runs slowly

NeuroSurge draws hundreds of 3D pieces every frame (more than before, because of the mirror body), so it works best
when your browser uses the graphics card. On the development machine (AMD Radeon 8060S) it ran at the screen's limit of
60 frames (pictures) per second while standing still, and at about 51 to 54 frames per second while looking around.

When the browser has to draw in software instead (no graphics card), the **Auto** picture quality makes the picture
simpler step by step, starting with the mirror body. In testing this gave about 19 to 34 frames per second while
standing still, depending on what is shown, and only a few frames per second while turning the view. If the game
feels slow, it shows "Your computer draws only a few pictures a second, so the game moves slowly." Then try **Picture
quality: Low** on the Esc page, and check that your browser uses the graphics card:

- **Chrome or Edge:** open `chrome://gpu` (or `edge://gpu`) and look for "WebGL2: Hardware accelerated". If it says
  "Software only", turn on *Settings > System > Use graphics acceleration when available*, update your graphics
  driver and restart the browser. On Linux some Chromium builds also need the `--ignore-gpu-blocklist` option.
- **Firefox:** open `about:support` and look at the *WebGL 2 Driver Renderer* line. It should name your graphics card,
  not "llvmpipe" or "SwiftShader".
- **Laptops with two graphics chips:** let the browser use the faster (discrete) one.

You can also leave out the mirror body by adding `?mirror=0` to the address (see section 8); that makes the picture
lighter on slow computers. 60 frames per second was the display's limit, not a full performance test. Very old or
low-power graphics may be slower.

## 8. Troubleshooting

| What you see | What to do |
| --- | --- |
| A page saying the game must be opened over http | You opened the file from your disk. Run `node serve-local.mjs` and open the address it prints. |
| "crypto.subtle" is blocked or unavailable | Use the `http://127.0.0.1:<port>/` address the server prints (or `localhost`, or an `https://` address). |
| The game stops with a sha256 or file-size message | A file is damaged or was changed, for example by a tool that changed line endings. Run `node serve-local.mjs --verify` and get a fresh copy. |
| "The face muscles could not be loaded, so they are not shown." | A face muscle file is missing or changed. The game goes on without them. Run `node serve-local.mjs --verify` and get a fresh copy. |
| "The graphics stopped (WebGL context lost)" | The graphics driver restarted. Wait a few seconds; if the scene does not come back, reload the page. |
| The game moves slowly | Press Esc and choose **Picture quality: Low**. See section 7. |
| The edges look a bit rough in High after the game was started in Low | Reload the page. |
| The mouse is not captured | Click the scene, or hold a mouse button and drag to look. W/A/S/D, Space, E, I and clicks work either way. |
| You cannot find the brain | Press Esc, then **Reset brain view**. |
| You cannot reach a compass arrow | Press Esc twice for a free mouse pointer, then click the arrow. |
| A mirror body arrow is grey and does nothing | The brain is in front of it. Hold Space on the brain, look away to drag it aside, let go, then click the arrow. |
| **E** does nothing | Let go of Space first (E does not switch while you drag the brain), and make sure the game is playing (not on the Esc page). |
| `port ... is already in use` | Leave out `--port`, so the server picks a free port. |

Extra options can be added to the end of the address and are passed on to the game: `?fullbody=0` shows only the
left arm and the brain (no torso, legs, right arm or face); `?face=0` leaves out the face muscles; `?mirror=0` leaves
out the mirror body; `?placeholder=1` shows a labelled stand-in scene with no anatomy; `?qa=1` turns on the test
controls used by the automated checks. Join several with `&`, for example `?mirror=0&qa=1`.

## 9. Credits

Anatomy: **BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International**
(https://creativecommons.org/licenses/by/4.0/). The mesh files are unmodified; the game selects a subset, moves the
bones as stiff pieces, bends the muscles to follow them and adds colours while it runs. It also moves the outer muscles
out a little and tilts them slightly (the Body Worlds layers), draws a mirror-image copy of the body behind the brain,
and on Picture quality Low draws simplified copies of the meshes. The dataset's authors do not endorse NeuroSurge.

Face and chewing muscles (`packets/face-muscles-r1/`, 54 mesh files): **"Z-Anatomy - The open source atlas of anatomy -
CC-BY-SA 4.0"** and **"BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan"** (the credit the
source asks for). Licence: CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Source:
https://github.com/LluisV/Z-Anatomy/tree/6c7f9016bd5899ac8edafd31b9900c151df42ed6/Resources/Models/FBX. Only these
muscles were taken, converted and moved to fit this body. While the game runs it colours them, bends the jaw muscles
with the jawbone, moves the outer ones out a little and draws a mirror-image copy. These 54 mesh files stay under
CC BY-SA 4.0 (share-alike) wherever they go; the NeuroSurge code is CC0 and is not relicensed by them. Neither
Z-Anatomy, its authors nor DBCLS endorse NeuroSurge.

The 3D engine is three.js (MIT licence). The project's own code is dedicated to the public domain under CC0 1.0. See
`CREDITS-AND-LICENCES.md` and `ASSET-ATTRIBUTION-INDEX.md` for the full credits.
