# Mesh packs

What the game loads instead of 611 OBJ text files (157 MB): five packs and one small rig file, **6.0 MB** together.
The packs hold **coarser copies** of the source meshes: 1 048 620 triangles instead of 2 395 434 (43.8 %). Since 19 November 2026 the 54 face muscles and the six parts of the head's two eyes are kept as their source files: their coarse copies dipped under the skull in patches and broke the eyes' nested shells.

| pack | source packet(s) | files | triangles in the sources | triangles in the pack | size |
| --- | --- | --- | --- | --- | --- |
| `arm-brain.nspack` | `pov-demo-assets`, `pov-demo-assets-r2` | 142 | 463238 | 197198 | 1.11 MB |
| `fullbody.nspack` | `bodyparts3d-fullbody-r1` | 294 | 1081946 | 370126 | 1.90 MB |
| `head.nspack` | `bodyparts3d-head-r1` | 10 | 135582 | 97644 | 0.61 MB |
| `face-muscles.nspack` | `face-muscles-r1` | 54 | 105892 | 105892 | 0.73 MB |
| `missing-muscles.nspack` | `missing-muscles-r1` | 111 | 608776 | 277760 | 1.38 MB |
| `BODY-RIG.json` | (all of the above; see "The rig file") | | | | 0.22 MB (about 25 kB compressed by the host) |

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
   - move a point of an open rim off the rim (a rim's own points may be removed along the rim: the five-edged rim of a
     small gap in each internal oblique became three-edged);
   - make an edge longer than the kind's limit (the muscles bend at the joints and need vertices along their length);
   - leave **any vertex of the source file further from the coarse surface than the kind's limit**. This is measured,
     not estimated: every removed vertex is measured against the triangles that replace its own, again each time
     those triangles are about to change.
3. **The bulk is kept.** 0.5 mm per surface is a lot for a muscle 2 mm thick: with the kind's limit alone, 19 small
   closed meshes (face and neck muscles, small muscles of the hand and foot) kept less than 90 % of their volume, the
   worst 51 %. A closed mesh whose coarse copy encloses less than 93 % of the source's volume is therefore made again
   with a smaller limit (0.6 times, repeatedly) until it does; its record in the pack carries the limit used.
4. The kept vertices are rounded to 0.01 mm, **except the corners of a triangle that the rounding would leave without
   area**: those keep their source coordinates as they are (rounding alone had made 506 such triangles in 95 meshes;
   now only the 4 that are flat in the source files themselves remain). The triangles are written in a walking order
   (which makes the pack small; the surface is the same).

Five kinds of mesh, by what the game does with them (`COARSE` in `tools/build-mesh-packs.mjs`):

| kind | meshes | furthest a source vertex may lie from the surface | longest edge made | triangles kept |
| --- | --- | --- | --- | --- |
| body | muscles (275 files) | 0.5 mm | 10 mm | 21 to 52 % by packet |
| bone | the body's bones except the finger and toe bones, the cranium and eyes (139) | 0.5 mm | 10 mm | about 20 %, the cranium's plates 7 % |
| brain | the brain except the two precentral gyri (57) | 0.3 mm | 5 mm | 30 % |
| cut | 14 meshes the game itself reshapes in cells of 5 to 6 mm: the obliques and transversus (the opened rectus sheath), rectus abdominis (the belly's midline), pectoralis major (the flattened chest) | 0.4 mm | 5 mm | 36 to 71 % |
| source | 138 meshes kept **exactly as the source file** (78 until 19 November 2026; since then also the 54 face muscles and the six parts of the head's two eyes) (nothing joined, removed or rounded): the 32 bones of the left game arm (its joints are estimated from their vertices: on a coarse capitate the fitted wrist centre moved 17 mm), the two precentral gyri (the motor areas are laid out on their vertices), the two lacrimal bones (the eye point is taken from their vertices), the 42 finger and toe bones (the game draws them from a rounded copy it makes from their own vertices; on coarse bones the fingers came out thin and knobbly) | 0 | | 100 % |

So the silhouettes, the muscles' ends where they attach and the bones' joint surfaces are all within 0.5 mm of the
source (about half a pixel in the game's view), and small parts keep more of their triangles than large smooth ones.

## The rig file

The game's body rig is estimated from where the meshes' vertices lie: the joints' pivots and axes from centroids,
contact patches and sphere fits of the bones; the bone each muscle rides from an average over its vertices. Estimated
from the coarse meshes alone, 53 pivots lie more than 1 mm from where the source meshes put them (the spine's by 4 to
5 mm) and 40 muscles ride another bone. So `tools/build-mesh-packs.mjs` also builds the rig **from the source meshes**,
prepared exactly as the page prepares them (`tools/page-body.mjs`), and writes it to `BODY-RIG.json`. The game builds
its rig from the meshes it has with that rig's pivots and muscle rows, then checks that the result equals the file,
datum for datum (`ns-body` `bodyRigFromFile`, `bodyRigMatchesFile`); if the file is missing or is not this code's rig
for exactly these meshes, the rig is estimated from the meshes loaded, as before.
**Whoever changes the rig's code** (`ns-body`: limits, segments, pivot rules, the display edits made before the rig)
**must run `node tools/build-mesh-packs.mjs` again**; `tests/rig-file.test.mjs` fails until they do.

## How it is checked (`tests/pack.test.mjs`, against the source packets, on every test run)

- Hash chain: `PACK-INDEX.json` (its SHA-256 is pinned in `scene/src/ns-pack.mjs`) lists each pack's size and SHA-256;
  inside a pack every mesh records the size, the SHA-256 and the vertex count of the OBJ file it was made from; the
  game compares all three with its pinned manifests before it uses the mesh, exactly as it does for a fetched OBJ file.
- The committed packs equal a fresh build from the source packets.
- For every mesh: each kept vertex is a source vertex (to 0.01 mm); every source vertex is measured again against the
  coarse surface (at most the limit used for the mesh, plus the rounding); the mesh has the same number of pieces and the same Euler number
  as its source, closed surfaces stay closed, no rim or crowded edge is new; a closed mesh encloses a volume of the
  same sign and at least 93 % of the source's; it has no triangle without area that the source does not have;
  triangles that face against the source surface are counted and compared with the source's own.
- `tests/rig-file.test.mjs`: the rig file equals the rig built from the source meshes now; from the coarse meshes with
  the file the rig equals it datum for datum; without the file it does not.
- The format itself is lossless (exact packs built in the test decode to exactly the parser's result).

## If a pack cannot be used

If a pack is missing, damaged, stalls or cannot be read by the browser, the game fetches that packet's OBJ files as
before (slower, full detail). Nothing else changes.
