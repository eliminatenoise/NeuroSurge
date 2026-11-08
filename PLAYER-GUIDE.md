# NeuroSurge: player guide

## 1. What NeuroSurge is

NeuroSurge is a small first-person game that runs in your web browser. You look out through the eyes of a body with
no skin: you see its bones and the muscles attached to them. A very large see-through brain floats in front of you.
When you look at one of the brain's movement areas, that area lights up, and the muscles it controls light up in the
same colours and move the body.

Please keep these points in mind:

- **It is a simulation.** Every activity level in the game is made up by the game. It is a number from 0 to 1 used
  for colours and movement, with no real-world unit. Nothing is measured from anyone's brain or muscles.
- **Your mouse, clicks and keys are game controls only.** Looking at a brain area does not stimulate a real brain,
  and nothing reads or decodes brain signals.
- **"NeuroTranslate 0.0" is the name of a research model** that NeuroSurge is a companion to. No trained or validated
  model runs in this game, and the game does not translate brain activity into movement.
- **The brain map is simplified.** In real brains the areas for different body parts overlap and differ from person
  to person. The areas in the game are representative, not exact points for single muscles.
- **The body is one reference body** from the BodyParts3D anatomy collection. It is not you, any real measured
  person, or an average person. Bones and muscles move as stiff pieces, so they slide rather than bend or bulge.
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

1. Get the folder: either `git clone https://github.com/eliminatenoise/NeuroSurge`, or download the ZIP from the
   GitHub page and unzip it. The folder is called `NeuroSurge` (after `git clone`) or `NeuroSurge-main` (after the ZIP
   download).
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
HTTPS. The game checks its files with a browser feature (`crypto.subtle`) that only works on such addresses.

### Checking your copy

- Linux: `sha256sum -c SHA256SUMS`. macOS: `shasum -a 256 -c SHA256SUMS`. Any system: `node serve-local.mjs --verify`.
- In a copy taken from GitHub, `--verify` also lists the repository's own files (`README.md`, `LICENSE`,
  `PROJECT-CONTEXT.json`, `.gitignore`, `.gitattributes` and, after `git clone`, the `.git` folder) as "not listed in
  SHA256SUMS". That is expected: those files are not part of the game. Any "sha256 mismatch" or "missing" line is a
  real problem.
- `release-manifest.json` lists every game file with its size and sha256, and the build time. Its `content_sha256`
  is the fingerprint of this build.
- While it loads, the game itself checks the movement map, the arm-and-brain mesh list and the full-body mesh list
  against sha256 values written into the game code, and checks every mesh file against its list. If anything differs
  it stops with a message instead of showing changed data.

## 3. Controls

When the game starts it shows its instructions for 2 seconds. Click the scene to start straight away; the click also
"captures" the mouse, so moving the mouse turns your view. Press **Esc** at any time to pause and see the
instructions and controls again; press **Esc** again (or **Resume**) to go back to the game.

| Input | What it does |
| --- | --- |
| Mouse or trackpad | Look around. The body stays where it is; the left shoulder follows your view, so the left arm comes along. |
| Click the scene | Start, and capture the mouse. |
| **A** / **D** | Move the left hand left / right on the screen. |
| **W** / **S** | Move the left hand forward / back. |
| Two keys together (for example **W**+**D**) | Move the hand diagonally. |
| Hold **Space** | Close all five fingers into a fist. Let go to open the hand. |
| Double-tap **Space** | Turn the forearm over: palm down to palm up, and back. |
| Look at a coloured brain area | Activates that area for 1 second. Looking at empty space activates nothing. |
| Click (left or right button) | Activates the area under the crosshair again, for another second. |
| Hold **Space** while looking at the brain | Grab the brain. Look around to drag it, then let go of Space to leave it there (for example lower down, so you can see the legs and the brain together). |
| Curved arrows around the brain | Click one to swing your view a little around the brain (forward, back, left or right). Click and hold it to keep swinging. The brain itself stays put. |
| **Esc** | Pause, with the instructions, the controls, **Reset body**, **Reset brain view** and the settings. |
| Look far down | See the torso and the legs. |
| Look far right | See the right arm. |
| Look far up | See the face layer. |

**Reset body** puts the body back in its starting pose, turns the forearm back and clears the marks on activated
areas. The brain stays where you left it. **Reset brain view** undoes any dragging and swinging of the brain.

**Settings** (on the Esc page): look sensitivity, invert Y (up/down) for looking, and how the face is shown (a
see-through "ghost" layer, a small inset picture, or off). The game remembers them in your browser.

After you press Esc, most browsers wait about one second before they let the page capture the mouse again. If the
mouse is not captured, click the scene again, or hold a mouse button down and drag to look around.

## 4. What you see

- **The body:** bones and muscles without skin, seen from the inside through the eyes. Your whole left arm is in
  view, and the hand stays about three quarters of the way up the screen.
- **The brain:** a very large glassy brain in front of you, out of reach, with its front towards the top of the
  screen. Its movement areas are labelled ("Left arm", "Trunk", "Face & neck" and so on, with the half of the brain
  each one is in). The areas for the left arm (in the right half of the brain) are marked in cyan, apart from the
  areas for the legs, trunk, right arm and face. Small labels show which way is front, back and your right.
- **Colours:** activity goes from dark (resting) to yellow (strongest). The brain areas and the muscles use the same
  colour scale. An area you have activated stays a little more solid, with a gold edge, until you press Reset body.
- **The left arm** moves with the keys and also when you activate its brain areas. **Every other body part moves only
  through the brain**, never through keys.
- **The face:** in first person you cannot normally see your own face, so it is shown as a labelled see-through
  layer (or an inset picture, if you choose that in the settings).
- **The panel on the far right** explains, in plain words, the area you are looking at or last clicked: which body
  part it moves, which muscles work and which ease off, how the signal travels from the brain to the muscles, and
  what is simulated versus what is known.
- **The colour key** at the bottom right explains the colours. Click **"Sources and rights"** under it to see the
  links to the anatomy licence and source.

## 5. Known issues in this build

These come from the automated checks run on this exact build (see `release-manifest.json` for its fingerprint) and
from the anatomy data itself.

**Automated checks.** An automated test suite plays the built game in a headless Chromium browser and checks 29 of
the game's requirements. In its test mode (fixed time steps and simulated inputs) **27 passed, 1 failed and 1 could
not be decided**. A second run used real mouse and keyboard events in real time: **26 passed, 2 failed and 1 could
not be decided**. The differences between the two runs are explained below.

- **The curved orbit arrows can sit on top of the edge of the brain.** The brain is so large that it does not fit on
  the screen, and the arrows are kept on the screen, so three of the four overlap its glassy edge in the starting view.
  They still work. This check failed in both runs.
- **The forward arrow needs a long look up.** To put the crosshair on the forward (top) arrow you have to look far up,
  about 73 degrees. The back (bottom) arrow needs a look of about 42 degrees down, and the side arrows about 45 to 60
  degrees to the side. When you play without capturing the mouse (holding a button and dragging to look), you can
  also click the arrows directly with the pointer. The Esc page covers them while it is open.
- **Mouse direction:** the test mode cannot check that moving the mouse right turns you right and moving it down
  looks down, because that needs real mouse movement, so it left this check undecided. The run with real mouse
  events confirmed it (the view is not inverted).
- **The elbow hardly bends with A and D.** Moving the hand sideways comes mostly from the shoulder and the wrist; the
  elbow bends by only about 1 to 3 degrees. In the real-input run the elbow moved 0.97 degrees for A, just under the
  check's 1 degree minimum, so that check failed there (it passed in test mode).
- **Not every brain area is in the starting view.** In test mode all 44 brain areas were reached by looking around
  and by swinging the view with the arrows. The real-input run cannot aim that precisely, so it only counted the areas
  it found in the starting view (17 of 44) and left that check undecided. To reach the others, look around, swing the
  view with the arrows or drag the brain; a few areas sit on the inner faces of the brain's two halves.
- **Missing anatomy.** The BodyParts3D 4.0 set used here has no facial-expression muscles (for example around the
  eyes and mouth, or the muscles you smile with), no chewing muscles (masseter, temporalis), no rectus abdominis (the
  "six-pack" muscle), no latissimus dorsi (the broad back muscle), no coccyx (tailbone) and no tongue. So:
  - activating the face areas (raise the eyebrows, close the eyes, purse the lips, smile) lights up the brain area,
    but nothing on the face moves or changes colour;
  - clenching the jaw colours no muscle; opening the jaw swings the jaw and colours the small muscles under the chin;
  - bending the trunk forward colours only the external oblique muscles at the sides of the belly.
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
| Memory | In testing the page used about 110 to 120 MB of JavaScript memory with the full body (the default), plus graphics memory for the meshes. 4 GB of RAM or more is recommended. |
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
| "crypto.subtle is unavailable" | Use the `http://127.0.0.1:<port>/` address the server prints (or `localhost`, or HTTPS). |
| The game stops with a sha256 or file-size message | A file is damaged or was changed, for example by a tool that changed line endings. Run `node serve-local.mjs --verify` and get a fresh copy. |
| "WebGL context lost" | The graphics driver restarted. Wait a few seconds; if the scene does not come back, reload the page. |
| The mouse is not captured | Click the scene, or hold a mouse button and drag to look. W/A/S/D, Space and clicks work either way. |
| `port ... is already in use` | Leave out `--port`, so the server picks a free port. |

Extra options can be added to the end of the address and are passed on to the game: `?fullbody=0` shows only the
left arm and the brain (no torso, legs, right arm or face); `?placeholder=1` shows a labelled stand-in scene with no
anatomy; `?qa=1` turns on the test controls used by the automated checks. Join several with `&`, for example
`?fullbody=0&qa=1`.

## 9. Credits

Anatomy: **BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International**
(https://creativecommons.org/licenses/by/4.0/). The mesh files are unmodified; the game selects a subset and moves and
colours whole meshes while it runs. The dataset's authors do not endorse NeuroSurge. The 3D engine is three.js
(MIT licence). The project's own code is dedicated to the public domain under CC0 1.0. See
`CREDITS-AND-LICENCES.md` and `ASSET-ATTRIBUTION-INDEX.md` for the full credits.
