# NeuroSurge Lite offline package

Extract the ZIP. In `lite/`, open `Play NeuroSurge Lite on Windows.cmd` on Windows, open `Play NeuroSurge Lite on macOS.command` on macOS, or run `sh "Play NeuroSurge Lite on Linux.sh"` on Linux. You can also run `node lite/launch.mjs` from the extracted folder. Node.js 18+ serves the shared game over loopback. Open the printed address with a desktop browser, WebGL, keyboard and pointer and choose **Play Lite**. **Ctrl+C** stops the server.

The archive keeps the Lite packs, shared engine, runtime assets and licences. Original OBJ files covered by the pack index, Full transport files, tools and tests are available from the source repository. The pack index and body rig retain their SHA-256 hashes. F opens virtual commands. C opens the Movement mirror. Camera access begins with **Start camera**. Tracking estimates visible movement. Electrical activity is simulated.

**Save take** retains up to eight seconds of pose estimates in tab memory. Choose **Open Command box** or press F after closing the mirror. Enter **replay my take**.

**Timestamped stills** uses at least two local images with times within an eight-second span. Use **Track keyframes** and **Save take**. Replay uses those poses and animates between them.

The 120 ms point forecast runs in the browser from the included NeuroTranslate 0.0 weights. The optional **Play fingertip touch** launcher uses `joint-game.json`, the separate model beside the game folder, Python 3.10+ and NumPy.

The archive stores the exact source-inventory SHA-256 in `release-manifest.json` and verifies its entries with `SHA256SUMS`. To rebuild from the corresponding source checkout, use Python 3.10 or later. Run `python -m pip install --require-hashes -r tools/lite-build-requirements.txt` in a virtual environment, then run `python tools/build-lite-offline.py NeuroSurge-Lite.zip`. The build dependency renders the browser versions of the player guides. [NeuroSurge source](https://github.com/eliminatenoise/NeuroSurge)
