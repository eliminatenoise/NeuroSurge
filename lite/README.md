# NeuroSurge Lite

[Play Lite](index.html) · [Open NeuroSurge Full](../) · [Technical guide](technical.html) · [Simple guide](simple.html)

Both editions use the same game, 3D shapes and controls. Lite compresses the mesh packs without changing their decoded bytes. The five packs, index and body rig use 4,999,707 bytes in Lite and 5,995,969 bytes in Full. When the browser needs the local 142,385-byte Brotli module, the Lite total for those assets and the module is 5,142,092 bytes.

To run a local copy, [download the repository ZIP](https://github.com/eliminatenoise/NeuroSurge/archive/refs/heads/main.zip) and extract it. With Node.js 18 or later installed, open the Windows or macOS launcher in `lite`. On Linux, run `sh "Play NeuroSurge Lite on Linux.sh"` from that directory. You can also run `node lite/launch.mjs` from the repository root. If the browser stays closed, use the printed local address in a browser with WebGL. Choose **Play NeuroSurge Lite**. Keep the terminal open during play and press **Ctrl+C** there to stop it.

The mesh records, source hashes, source file lengths, comments, object IDs, positions, triangles and rig bytes are identical to Full after decoding. Run `node tools/build-lite-packs.mjs --check` from the repository to rebuild the encoding and compare it with the stored files. The checked build uses Node.js 26.8.2 with Brotli 1.2.0. The [asset attribution index](../ASSET-ATTRIBUTION-INDEX.md), [credits and licences](../CREDITS-AND-LICENCES.md) and [decoder licences](BROTLI-THIRD-PARTY.txt) identify the original work.
