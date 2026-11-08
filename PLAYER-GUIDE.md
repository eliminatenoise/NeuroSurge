# NeuroSurge: player guide

## 1. What NeuroSurge is

NeuroSurge is a small first-person game that runs in your web browser. You look out through the eyes of a body with
no skin: you see its bones and the muscles attached to them. A very large see-through brain floats in front of you.
When you look at one of the brain's movement areas (motor areas), that area lights up, and the muscles it controls
light up in the same colours and move the body.

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
- **The body is one reference body** from the BodyParts3D anatomy collection. It is not you, any real measured
  person, or an average person. The bones move as stiff pieces, and the muscles are bent to follow them. This is a
  picture of movement, not a model of how real muscles contract.
- NeuroSurge is not a medical device. Do not use it for diagnosis, treatment or clinical training.

Everything runs on your own computer. The small server that comes with the game only answers your own computer, and
it tells the browser not to let the game page contact any other website. Nothing is uploaded.

## 2. How to run it on your computer

You need:

- [Node.js](https://nodejs.org/) **18 or newer**. It is only used to run the small local server that comes with the
  game (`serve-local.mjs`).
- A desktop web browser with **WebGL 2**, such as a current Chrome, Edge, Firefox or Safari. (This build was only
  tested in Chromium; see section 6.)
- A keyboard and a mouse or trackpad.

**Why you cannot just double-click `index.html`:** browsers do not let a page opened straight from your disk
(an address starting with `file://`) load the game's code files and data files. The game has to be opened from a web
address, which the local server provides.

### Steps

1. Get the folder: either clone the repository with git (the `git clone` command is in the README's "Play it"
   section), or download the ZIP from the repository's GitHub page and unzip it. The folder is called `NeuroSurge`
   (after `git clone`) or `NeuroSurge-main` (after the ZIP download).
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

You can use another static web server instead, as long as it serves this folder as the top of the site (the game
asks for `/vendor`, `/inputs` and `/packets`), sends `.mjs` files as JavaScript, and uses `localhost`, `127.0.0.1` or
HTTPS. The game checks its files with a browser feature (`crypto.subtle`) that only works on such addresses. Serving
the game from a sub-folder of a website (for example a GitHub Pages project page) does not work in this build.

### Checking your copy

- Linux: `sha256sum -c SHA256SUMS`. macOS: `shasum -a 256 -c SHA256SUMS`. Any system: `node serve-local.mjs --verify`.
- In a copy taken from GitHub, `--verify` names the repository's own files (`README.md`, `LICENSE`,
  `PROJECT-CONTEXT.json`, `.gitignore`, `.gitattributes` and, after `git clone`, the `.git` folder) as "not part of
  the game". They are not checked, and that is expected. `sha256sum -c SHA256SUMS` simply ignores them. Any
  "sha256 mismatch", "missing" or "not listed" line is a real problem.
- `release-manifest.json` lists every game file with its size and sha256, and the build time. Its `content_sha256`
  is the fingerprint of this build.
- While it loads, the game itself checks the movement map, the arm-and-brain mesh list and the full-body mesh list
  against sha256 values written into the game code, and checks every mesh file against its list. If anything differs
  it stops with a message instead of showing changed data.
- The repository's `.gitattributes` file stops git from changing line endings (for example on Windows), because a
  changed line ending would change a file's sha256 and the game would refuse to start.

## 3. Controls

When the game starts it shows its "How to play" page for 2 seconds. Click to start straight away; the click also
"captures" the mouse, so moving the mouse turns your view. Press **Esc** at any time to pause and see the page
again. Pressing Esc during the first 2 seconds keeps the page open.

| Input | What it does |
| --- | --- |
| Mouse or trackpad | Look around. The body stays where it is; your left shoulder follows your view, so the left arm comes along. |
| Click the scene | Start, and capture the mouse. |
| **A** / **D** | Move the left hand left or right on the screen. It is your LEFT arm, so the hand reaches only a little past the middle of the screen to the right. |
| **W** / **S** | Move the hand forward or back. |
| Two keys together (for example **W**+**D**) | Move the hand diagonally. |
| Hold **Space** | Make a fist with all five fingers. Let go to open the hand. |
| Double-tap **Space** | Flip the forearm: palm down to palm up, and back. |
| Look at a coloured brain area | Switches that area on for 1 second. Looking at empty space, or at brain glass that is not a motor area, switches nothing on. |
| Keep looking at the area for half a second | The area gets a gold edge (a mark) that stays until you press Reset body. A quick glance does not mark it. |
| Click (left or right button) | Switches the area under the crosshair on again, for another second, and marks it at once. |
| Hold **Space** while looking at the brain | Grab the brain. Look around to drag it, then let go of Space to leave it there (for example lower down, so you can see the legs and the brain together). |
| Click a curved arrow next to the brain | Your view turns a small step around the brain (15 degrees). Your view turns; the brain itself stays put. |
| Hold a curved arrow | After a short moment your view keeps turning slowly (about 12 degrees per second). It stops when you let go. The view can turn at most 60 degrees to each side and 30 degrees toward the front or back. |
| **Esc** | Pause and show the "How to play" page, with **Reset body**, **Reset brain view** and the settings. |
| Look far down | See your body and legs. |
| Look far right and a little down | See your right arm. Near eye level the game reminds you to look down a little. |
| Look high up | See your face (as a see-through layer). |

**Clicking an arrow.** With the mouse captured, put the crosshair on an arrow and click. With a free mouse pointer
you can also click the arrows directly. A pressed arrow stays in the same spot on the screen while your view turns,
so you can click it again or keep holding it.

**Switching between areas.** After a click, the area stays on for its full second even if the crosshair passes over
other areas on the way (for example when you turn to look at the body part it moves). To switch to a new area, rest
the crosshair on it for a moment (about a third of a second), or click it.

**Reset body** puts your arm and palm back the way they started and clears the gold marks. The brain stays where you
left it. **Reset brain view** puts the brain back where it started, undoing any dragging and turning. If you lose the
brain, the game says "Lost the brain? Press Esc, then Reset brain view to bring it back."

**Reading "More detail".** The "What is happening" panel on the far right has a **More detail** button. While the
mouse is captured you cannot click it. Press **Esc** (the game pauses and frees the mouse), then press **Esc** again
to go back to the game with a free mouse pointer, and click **More detail**. Click the scene when you want to capture
the mouse again. The **Resume** button on the Esc page also captures the mouse again.

**Settings** (on the Esc page): look speed, flip up and down when looking (invert Y), and how your face is shown (a
see-through layer when you look up, a small box, or off). The game remembers them in your browser.

After you press Esc, most browsers wait about one second before they let the page capture the mouse again. If the
browser does not capture the mouse, click the scene again, or hold a mouse button down and drag to look around. If it
refuses again, the Esc page offers **Resume without locking the mouse**.

## 4. What you see

- **The body:** bones and muscles without skin, seen from the inside through the eyes. Your whole left arm is in
  view, and the hand stays about three quarters of the way up the screen. Looking down shows the chest, belly and
  legs as solid shapes.
- **The brain:** a very large glassy brain in front of you, out of reach, seen from above with its front toward the
  top of the screen. The coloured movement strip (motor strip) runs across the brain and fills about 60 % of the
  screen's width in a normal window. Small labels show which way is the front and which way is your right.
- **Two kinds of areas:** light-blue areas, in the brain's right half, are for your left arm. Grey areas are for every
  other body part. Some in-between spots move nothing.
- **Your body in front of the brain:** where your own body (legs, chest, right arm, neck) would cover the brain, it is
  drawn see-through, so you can still see the brain areas behind it. Your left arm is drawn normally.
- **Colours:** the signal goes from dark (0, resting) to yellow (1, strongest). The brain areas and the muscles use the
  same colours. An area you have marked keeps a gold edge until you press Reset body.
- **The left arm** moves with the keys and also when you switch on its brain areas. **Every other body part moves only
  through the brain**, never through keys.
- **The face:** from inside a body you cannot see your own face, so it is shown as a see-through layer when you look
  up (or in a small box, if you choose that in the settings). It shows the skull, jawbone and neck muscles.
- **The "What is happening" panel** on the far right (at the bottom in a tall, narrow window) explains, in plain
  words, the area you are looking at or last clicked: which body part it moves, which muscles pull and which work the
  other way, how the signal travels from the brain to the muscles, and what is simulated versus what is known.
  **More detail** shows the technical names.
- **The colour key** explains the colours and says that the map is rough. Click **"Sources and rights"** under it to
  see the links to the anatomy licence and source.

## 5. Known issues in this build

These come from the automated checks run on this exact build (see `release-manifest.json` for its fingerprint), from
the developers' own list of open problems, and from the anatomy data itself.

**Automated checks.** An automated test suite plays the built game in a headless Chromium browser and checks 38 of
the game's requirements. In its test mode (fixed time steps and simulated inputs) **36 passed, 1 failed and 1 could
not be decided**. A second run used real mouse and keyboard events in real time: **35 passed, 1 failed and 2 could
not be decided**. The failed check and the undecided ones are explained below. The game's own unit tests (481) all
passed.

- **The back of the brain is hidden in the starting view.** You see the brain from above at a slant, so its back end
  is hidden behind its top. A check that wants both the front and the back end visible fails for this reason (in both
  runs, at all three tested window sizes). A flatter view would show the back, but then some face, jaw and tongue
  areas would need an extra turn to reach. Use the curved arrows to look at the back.
- **Very wide screens show a smaller strip.** In an ultra-wide window (21:9) the movement strip fills only about 40 %
  of the width, and about 56 % in a 1920 x 1080 window. The checks want 60 %, so the 21:9 part of the same check fails.
- **The strip is not centred up and down.** It sits in the lower third of the view. Centring it would cut off the front
  of the brain or put some areas out of easy reach.
- **Mouse direction:** the test mode cannot check that moving the mouse right turns you right and moving it down looks
  down, because that needs real mouse movement, so it left this check undecided. The run with real mouse events
  confirmed it (the view is not upside down).
- **Not every area was reached in the real-input run.** In test mode all 44 brain areas were reached by looking around
  and turning the view with the arrows. The real-input run cannot aim that precisely, so it only counted the areas it
  found in the starting view (17 of 44) and left that check undecided. It also could not see a few very thin slivers of
  areas in the 1280 x 720 window, so a second check stayed undecided there. To reach every area, look around, turn the
  view with the arrows or drag the brain.
- **Your right arm is lower than your eyes.** Looking far right at eye level shows only your left arm. Look down a
  little (the game tells you).
- **Reach limits.** The left hand cannot go far to the right. At the far left edge it fits on the screen only when the
  arm is reached almost fully forward, so **W** and **S** do little there; the game then shows "Reach limited so the
  whole hand stays on screen".
- **One orbit arrow can sit on the forearm.** In a normal wide window the left arrow sits over your forearm in the
  starting view. It is drawn faint there, becomes bright when you point at it, and still works.
- **Short overlaps.** In a very wide window, right after the panel grows, an arrow can show over the panel for a split
  second.
- **Tall, narrow windows** leave an empty band below a short panel.
- **Colours under the keys.** While the keys drive a low signal, the light-blue left-arm areas show other colours, and
  only their thin light-blue outline remains.
- **Start-up** takes about 2 seconds on the test computer. One start-up step is not yet saved for reuse, so it is
  repeated every time.
- **Old wording in one licence file.** The attribution file inside `packets/bodyparts3d-fullbody-r1/` still describes
  the run-time changes as "whole-mesh rigid transforms". The correct description (bones moved as stiff pieces, muscles
  bent to follow them, colours added) is in the game and in `CREDITS-AND-LICENCES.md`. That packet file is protected
  by checksums, so it was not changed in this build.
- **Plain language was checked by a formula.** The game's text was checked with a readability score, not tested with
  real young readers.
- **Missing anatomy.** The BodyParts3D 4.0 set used here has no facial-expression muscles (for example around the
  eyes and mouth, or the muscles you smile with), no chewing muscles that close the jaw (masseter, temporalis), no
  rectus abdominis (the "six-pack" muscle), no latissimus dorsi (the broad back muscle), no coccyx (tailbone) and no
  tongue. So:
  - switching on the face areas (raise the eyebrows, close the eyes, purse the lips, smile) lights up the brain area,
    but nothing on the face moves or changes colour;
  - the jaw areas light up only the muscles that exist in the set (for example the small muscles under the chin);
  - bending the trunk forward colours only the belly muscles at the sides (external obliques).
- **Only one browser was tested:** headless Chromium 155 on Linux with an AMD graphics card. Other browsers and
  operating systems should work but have not been tested.

## 6. System requirements

| | What you need |
| --- | --- |
| Browser | A desktop browser with WebGL 2 and import maps, for example Chrome or Edge 89+, Firefox 108+ or Safari 16.4+. **Only headless Chromium 155 on Linux was actually tested.** Touch-only devices are not supported. |
| Graphics | A graphics card (GPU) with **hardware-accelerated** WebGL 2. See section 7. |
| Input | Keyboard plus mouse or trackpad. |
| Screen | 1280 x 720 or larger is best. Smaller and portrait windows work, with shorter labels. |
| Download | About 115 MB, mostly the 436 anatomy mesh files. |
| Memory | In testing the page used about 110 to 130 MB of JavaScript memory with the full body (the default), plus graphics memory for the meshes. 4 GB of RAM or more is recommended. |
| Start-up | On the development machine the game was ready about 2 to 3 seconds after opening. |
| Local server | Node.js 18 or newer. |

## 7. If it runs slowly

NeuroSurge draws hundreds of 3D pieces every frame, so it needs your browser to use the graphics card. On the
development machine (AMD Radeon 8060S) it ran at the screen's limit of 60 frames per second. When the browser falls
back to drawing in software, the same scene ran at about 4 frames per second.

If the game feels slow or laggy:

- **Chrome or Edge:** open `chrome://gpu` (or `edge://gpu`) and look for "WebGL2: Hardware accelerated". If it says
  "Software only", turn on *Settings > System > Use graphics acceleration when available*, update your graphics
  driver and restart the browser. On Linux some Chromium builds also need the `--ignore-gpu-blocklist` option.
- **Firefox:** open `about:support` and look at the *WebGL 2 Driver Renderer* line. It should name your graphics card,
  not "llvmpipe" or "SwiftShader".
- **Laptops with two graphics chips:** let the browser use the faster (discrete) one.

60 frames per second was the display's limit, not a full performance test. Very old or low-power graphics may be
slower.

## 8. Troubleshooting

| What you see | What to do |
| --- | --- |
| A page saying the game must be opened over http | You opened the file from your disk. Run `node serve-local.mjs` and open the address it prints. |
| "crypto.subtle" is blocked or unavailable | Use the `http://127.0.0.1:<port>/` address the server prints (or `localhost`, or HTTPS). |
| The game stops with a sha256 or file-size message | A file is damaged or was changed, for example by a tool that changed line endings. Run `node serve-local.mjs --verify` and get a fresh copy. |
| "The graphics stopped (WebGL context lost)" | The graphics driver restarted. Wait a few seconds; if the scene does not come back, reload the page. |
| The mouse is not captured | Click the scene, or hold a mouse button and drag to look. W/A/S/D, Space and clicks work either way. |
| You cannot find the brain | Press Esc, then **Reset brain view**. |
| `port ... is already in use` | Leave out `--port`, so the server picks a free port. |

Extra options can be added to the end of the address and are passed on to the game: `?fullbody=0` shows only the
left arm and the brain (no torso, legs, right arm or face); `?placeholder=1` shows a labelled stand-in scene with no
anatomy; `?qa=1` turns on the test controls used by the automated checks. Join several with `&`, for example
`?fullbody=0&qa=1`.

## 9. Credits

Anatomy: **BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International**
(https://creativecommons.org/licenses/by/4.0/). The mesh files are unmodified; the game selects a subset, moves the
bones as stiff pieces, bends the muscles to follow them and adds colours while it runs. The dataset's authors do not
endorse NeuroSurge. The 3D engine is three.js (MIT licence). The project's own code is dedicated to the public domain
under CC0 1.0. See `CREDITS-AND-LICENCES.md` and `ASSET-ATTRIBUTION-INDEX.md` for the full credits.
