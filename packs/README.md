# Mesh packs

What the game loads instead of 691 OBJ text files (166 MB): six files, 20 MB together.

| pack | source packet(s) | files | licence of the sources |
| --- | --- | --- | --- |
| `arm-brain.nspack` | `pov-demo-assets`, `pov-demo-assets-r2` | 142 | BodyParts3D, CC BY 4.0 |
| `fullbody.nspack` | `bodyparts3d-fullbody-r1` | 294 | BodyParts3D, CC BY 4.0 |
| `head.nspack` | `bodyparts3d-head-r1` | 10 | BodyParts3D, CC BY 4.0 |
| `face-muscles.nspack` | `face-muscles-r1` | 54 | Z-Anatomy, CC BY-SA 4.0 |
| `missing-muscles.nspack` | `missing-muscles-r1` | 111 | per file: BodyParts3D, CC BY 4.0 (93) and Z-Anatomy, CC BY-SA 4.0 (18) |
| `cerebral-arteries.nspack` | `bodyparts3d-cerebral-arteries-r1` | 80 | BodyParts3D, CC BY 4.0 |

A pack is a **lossless** compact copy of what the game reads from each OBJ file of its source packet: the vertex
positions and the triangles (and the file's comment lines, which carry its own licence notice). Nothing is simplified,
moved or left out: for every file the decoded mesh is identical, bit for bit, to what the game's parser reads from the
source file. The format is described in `scene/src/ns-pack.mjs`.

- Made by `node tools/build-mesh-packs.mjs` from the files under `packets/` (the same command with `--check` compares
  the committed packs with a fresh build). The build is deterministic.
- The source packets stay in the repository unchanged, with their manifests, `SHA256SUMS.txt`, acquisition records and
  licence files. Each pack keeps the licence of its sources (a CC BY-SA 4.0 source stays CC BY-SA 4.0); the required
  attributions are in `CREDITS-AND-LICENCES.md`, `ASSET-ATTRIBUTION-INDEX.md` and each packet's
  `ATTRIBUTION-AND-LICENCES.txt`. Changes made: the vertex normals of the OBJ files are not stored (the game never read
  them) and the numbers are stored in binary form.
- Hashes: `PACK-INDEX.json` lists every pack's size and SHA-256 and the files it holds; its own SHA-256 is pinned in
  `scene/src/ns-pack.mjs`. Inside a pack every mesh records the size and SHA-256 of the OBJ file it was made from, and
  the game compares both with its pinned manifests before it uses the mesh, exactly as it does for a fetched OBJ file.
- `tests/pack.test.mjs` decodes every pack and compares every mesh with the parsed source file.
- If a pack is missing, damaged or cannot be read by the browser, the game fetches that packet's OBJ files as before.
