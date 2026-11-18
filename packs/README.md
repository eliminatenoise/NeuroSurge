# Mesh packs

What the game loads instead of 611 OBJ text files (157 MB): five files, **3.2 MB** together, holding **coarser copies**
of the source meshes: 652 084 triangles instead of 2 395 434 (27 %).

| pack | source packet(s) | files | triangles in the sources | triangles in the pack | size |
| --- | --- | --- | --- | --- | --- |
| `arm-brain.nspack` | `pov-demo-assets`, `pov-demo-assets-r2` | 142 | 463238 | 105516 | 0.52 MB |
| `fullbody.nspack` | `bodyparts3d-fullbody-r1` | 294 | 1081946 | 305100 | 1.51 MB |
| `head.nspack` | `bodyparts3d-head-r1` | 10 | 135582 | 10054 | 0.05 MB |
| `face-muscles.nspack` | `face-muscles-r1` | 54 | 105892 | 21734 | 0.11 MB |
| `missing-muscles.nspack` | `missing-muscles-r1` | 111 | 608776 | 209680 | 1.02 MB |

Licences: BodyParts3D (© The Database Center for Life Science), CC BY 4.0, for `arm-brain`, `fullbody`, `head` and 93
files of `missing-muscles`; Z-Anatomy, CC BY-SA 4.0, for `face-muscles` and 18 files of `missing-muscles`. Each pack
holds the files of its own source packet(s) only and keeps the licence of its sources (an adaptation of a CC BY-SA 4.0
work stays CC BY-SA 4.0). The required attributions are in `CREDITS-AND-LICENCES.md`, `ASSET-ATTRIBUTION-INDEX.md` and
each packet's `ATTRIBUTION-AND-LICENCES.txt`; every mesh in a pack also carries the comment lines of its own source
file. **Changes made to the source meshes are stated here**: see "How a coarse mesh is made".

## The source files are untouched

The source packets stay in the repository unchanged, with their manifests, `SHA256SUMS.txt`, acquisition records and
licence files. A pack is a derivative made from them by `node tools/build-mesh-packs.mjs` (deterministic: the same
sources give the same bytes; `--check` compares the committed packs with a fresh build; `--exact --out DIR` writes
lossless packs, every mesh exactly as the game's parser reads it, 19 MB, for comparison).

## How a coarse mesh is made (`tools/simplify-mesh.mjs`)

1. Vertices of the source file at exactly the same position are joined (the atlas files repeat vertices along seams;
   the game already shades such seams as one surface), and triangles with a repeated corner are dropped.
2. Vertices are removed one at a time, each by sliding it along one of its edges onto its neighbour (a half-edge
   collapse), always the removal that changes the surface least (quadric error). **Every vertex that is kept is a
   vertex of the source file**; nothing is moved. A removal is refused when it would
   - change how the surface is connected (so no hole opens, nothing is pinched, nothing is joined);
   - turn a triangle over, or make a sliver;
   - move a point of an open rim off the rim;
   - make an edge longer than **10 mm** (the muscles bend at the joints and need vertices along their length);
   - leave **any vertex of the source file more than 0.5 mm from the coarse surface**. This is measured, not
     estimated: every removed vertex is measured against the triangles that replace its own, again each time those
     triangles are about to change.
3. The kept vertices are rounded to 0.01 mm, and the triangles are written in a walking order (which makes the pack
   small; the surface is the same).

So the silhouettes, the muscles' ends where they attach and the bones' joint surfaces are all within 0.5 mm of the
source (about half a pixel in the game's view), and small parts keep more of their triangles than large smooth ones
(the finger bones keep about half, the skull's large plates about a twentieth).

## How it is checked (`tests/pack.test.mjs`, against the source packets, on every test run)

- Hash chain: `PACK-INDEX.json` (its SHA-256 is pinned in `scene/src/ns-pack.mjs`) lists each pack's size and SHA-256;
  inside a pack every mesh records the size, the SHA-256 and the vertex count of the OBJ file it was made from; the
  game compares all three with its pinned manifests before it uses the mesh, exactly as it does for a fetched OBJ file.
- The committed packs equal a fresh build from the source packets.
- For every mesh: each kept vertex is a source vertex (to 0.01 mm); every source vertex is measured again against the
  coarse surface (at most 0.5 mm, plus the rounding); the mesh has the same number of pieces and the same Euler number
  as its source, closed surfaces stay closed, no rim or crowded edge is new; a closed mesh encloses a volume of the
  same sign; triangles that face against the source surface are counted and compared with the source's own.
- The format itself is lossless (exact packs built in the test decode to exactly the parser's result).

## If a pack cannot be used

If a pack is missing, damaged, stalls or cannot be read by the browser, the game fetches that packet's OBJ files as
before (slower, full detail). Nothing else changes.
