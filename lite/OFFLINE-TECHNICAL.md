# NeuroSurge Lite offline package

## Launch

Extract the ZIP. In `lite/`, open `Play NeuroSurge Lite on Windows.cmd` on Windows, open `Play NeuroSurge Lite on macOS.command` on macOS, or run `sh "Play NeuroSurge Lite on Linux.sh"` on Linux. From the main extracted folder you can also run `node lite/launch.mjs`. Node.js 18+ serves the game at a local address using the loopback interface. Open the printed address in a desktop browser with WebGL and choose **Play Lite**. Use a keyboard and pointer. **Ctrl+C** stops the server.

## Capture and replay

Press **C** for the Movement mirror and set **Body follows**. Camera access begins with **Start camera**. Video and stills use files on the device. Tracking estimates visible movement, and the game simulates electrical activity. Press **F** for the Command box.

**Save take** retains up to eight seconds of pose estimates in tab memory. Choose **Open Command box** or press F after closing the mirror. Enter **replay my take**.

**Timestamped stills** uses at least two local images with times within an eight-second span. Use **Track keyframes** and **Save take**. Replay uses those poses and animates between them.

**Named takes** provides **Save last take**, **Download** and **Open a take file**. The version 1 JSON format contains timestamps, tracked joint angles, projected arm positions when available, tracking gaps and a name. It carries no media. Import asks for confirmation when a saved name matches one in use.

Join two to four named replays with **then**, as in **replay take named warm up then replay first 1 second of take named reach**. A comma before **then** fixes the end of an ambiguous name. The game checks all steps before playing. A range needs a visible pose. It includes its start and excludes its end. The game releases the previous movement controls between takes. **Stop replay** and **Esc** end playback.

## Forecast and build

The 120 ms image-point forecast uses the included NeuroTranslate 0.0 weights. **Measurements and limits** links to a recorded-image comparison. The optional **Play fingertip touch** launcher uses `joint-game.json`, the separate model beside the game folder, Python 3.10+ and NumPy.

The archive keeps Lite's compressed anatomy packs, the shared scene files and licences. The pack index and body rig retain their SHA-256 hashes. The source repository holds the original meshes, Full packs, development tools and tests.

The archive stores the exact source-inventory SHA-256 in `release-manifest.json` and verifies its entries with `SHA256SUMS`. To rebuild from the corresponding source checkout, use Python 3.10 or later. Run `python -m pip install --require-hashes -r tools/lite-build-requirements.txt` in a virtual environment, then run `python tools/build-lite-offline.py NeuroSurge-Lite.zip`. The build dependency renders the browser versions of the player guides. [NeuroSurge source](https://github.com/eliminatenoise/NeuroSurge)
