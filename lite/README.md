# NeuroSurge Lite

[Play Lite](index.html) · [Download the offline preview](https://github.com/eliminatenoise/NeuroSurge/releases/download/lite-forecast-timing-2026-11-24/NeuroSurge-Lite.zip) · [Open NeuroSurge Full](../) · [Technical guide](technical.html) · [Simple guide](simple.html)

Both editions use the same game, 3D shapes and controls. Lite compresses the mesh packs without changing their decoded bytes. The five packs, index and body rig use 4,999,707 bytes in Lite and 5,995,969 bytes in Full. When the browser needs the local 142,385-byte Brotli module, the Lite total for those assets and the module is 5,142,092 bytes.

To play offline, extract **NeuroSurge-Lite.zip**. It includes the game and one set of packs. With Node.js 18 or later installed, open the Windows or macOS launcher in `lite`. On Linux, run `sh "Play NeuroSurge Lite on Linux.sh"` from that directory. You can also run `node lite/launch.mjs` from the extracted folder. If the browser stays closed, use the printed local address in a browser with WebGL. Choose **Play Lite**. Keep the terminal open during play and press **Ctrl+C** there to stop it. [Simple offline instructions](OFFLINE.md) · [Technical offline instructions](OFFLINE-TECHNICAL.md)

The mesh records, source hashes, source file lengths, comments, object IDs, positions, triangles and rig bytes are identical to Full after decoding. Run `node tools/build-lite-packs.mjs --check` from the repository to rebuild the encoding and compare it with the stored files. The checked build uses Node.js 26.8.2 with Brotli 1.2.0. The [asset attribution index](../ASSET-ATTRIBUTION-INDEX.md), [credits and licences](../CREDITS-AND-LICENCES.md) and [decoder licences](BROTLI-THIRD-PARTY.txt) identify the original work.
