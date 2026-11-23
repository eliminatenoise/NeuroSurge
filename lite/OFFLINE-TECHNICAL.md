# NeuroSurge Lite offline package

Extract the ZIP. In `lite/`, open `Play NeuroSurge Lite on Windows.cmd` on Windows, open `Play NeuroSurge Lite on macOS.command` on macOS, or run `sh "Play NeuroSurge Lite on Linux.sh"` on Linux. You can also run `node lite/launch.mjs` from the extracted folder. Node.js 18+ serves the shared game over loopback. Open the printed address with a desktop browser, WebGL, keyboard and pointer and choose **Play Lite**. **Ctrl+C** stops the server.

The archive keeps the Lite packs, the shared engine, the remaining runtime assets and the asset licences. Original OBJ files covered by the pack index, Full transport files, tools and tests are available from the source repository. The pack index and body rig retain their SHA-256 hashes. The local model route uses `joint-game.json`. F runs virtual commands. C opens live capture or local video playback. Camera access starts with the separate Start camera action. Tracker output estimates visible movement; electrical activity is simulated.

For forecasts, place the separate NeuroTranslate model beside the game and use a movement mirror launcher with Python 3.10+ and NumPy.

The archive stores the exact source-inventory SHA-256 in `release-manifest.json` and verifies its entries with `SHA256SUMS`. To rebuild from the corresponding source checkout, use Python 3.10 or later. Run `python -m pip install --require-hashes -r tools/lite-build-requirements.txt` in a virtual environment, then run `python tools/build-lite-offline.py NeuroSurge-Lite.zip`. The build dependency renders the browser versions of the player guides. [NeuroSurge source](https://github.com/eliminatenoise/NeuroSurge)
