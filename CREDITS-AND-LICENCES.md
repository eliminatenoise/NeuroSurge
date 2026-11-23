# NeuroSurge: credits and licences

NeuroSurge releases its own code under CC0. Third-party materials keep their original terms. BodyParts3D anatomy carries CC BY 4.0. Z-Anatomy muscle meshes carry CC BY-SA 4.0.

| Material | Where in the distribution | Licence | Rights holder |
| --- | --- | --- | --- |
| NeuroSurge project code: game modules, game page and stylesheet, release kit (`serve-local.mjs`, build and export tools) | `scene/src/`, `scene/example/`, `serve-local.mjs` | CC0 1.0 Universal (public-domain dedication) | NeuroSurge project contributors |
| Project-authored data: mesh manifests, movement map, attribution index | `inputs/`, `ASSET-ATTRIBUTION-INDEX.md` | CC0 1.0 for project-authored content. Quoted third-party notices and cited literature remain their authors'. | NeuroSurge project contributors |
| three.js r170 (3D engine) | `vendor/three.module.js`, `vendor/LICENSE` | MIT | three.js authors |
| BodyParts3D 4.0 anatomy meshes | `packets/pov-demo-assets/meshes/`, `packets/pov-demo-assets-r2/meshes/`, `packets/bodyparts3d-fullbody-r1/meshes/`, `packets/missing-muscles-r1/meshes/` (`FJ*.obj`) | CC BY 4.0 | The Database Center for Life Science (DBCLS) |
| Z-Anatomy face and chewing muscle meshes (round 5) | `packets/face-muscles-r1/meshes/` (`zf-*.obj`, 54 files) | CC BY-SA 4.0 (share-alike) | Z-Anatomy (built on BodyParts3D, DBCLS) |
| BodyParts3D 4.0 cranium and eye meshes (R558) | `packets/bodyparts3d-head-r1/meshes/` (`FJ*.obj`, 10 files) | CC BY 4.0 | The Database Center for Life Science (DBCLS) |
| BodyParts3D 4.0 cerebral artery meshes (18 November) | `packets/bodyparts3d-cerebral-arteries-r1/meshes/` (`FJ*.obj`, 80 files) | CC BY 4.0 | The Database Center for Life Science (DBCLS) |
| Centre lines of 40 BodyParts3D 4.0 limb vessels (18 November; derived data) | `packets/bodyparts3d-body-vessels-r1/BODY-VESSEL-CENTRELINES.json` | CC BY 4.0 (derivative, as its source) | The Database Center for Life Science (DBCLS); derivation by NeuroSurge contributors |
| Z-Anatomy back, belly and foot muscle meshes (R558) | `packets/missing-muscles-r1/meshes/` (`zm-*.obj`, 18 files) | CC BY-SA 4.0 (share-alike) | Z-Anatomy (built on BodyParts3D, DBCLS) |
| Simplified copies of the meshes above, which are what the game draws (19 November; adaptations made by NeuroSurge contributors, see section 1a) | `packs/arm-brain.nspack`, `packs/fullbody.nspack`, `packs/head.nspack`, `packs/missing-muscles.nspack` (its 93 BodyParts3D files) | CC BY 4.0 (adaptations, as their sources) | The Database Center for Life Science (DBCLS); simplification by NeuroSurge contributors |
| The same for the Z-Anatomy meshes (19 November; adaptations, see section 1a) | `packs/face-muscles.nspack`, `packs/missing-muscles.nspack` (its 18 Z-Anatomy files) | CC BY-SA 4.0 (share-alike; an adaptation of a CC BY-SA 4.0 work stays CC BY-SA 4.0) | Z-Anatomy (built on BodyParts3D, DBCLS); simplification by NeuroSurge contributors |
| Body rig data derived from the BodyParts3D and Z-Anatomy meshes (19 November; joint pivots, axes and which bone each muscle follows; no mesh geometry) | `packs/BODY-RIG.json` | CC BY 4.0 and, for the rows of Z-Anatomy muscles, CC BY-SA 4.0 (derived data, as its sources) | DBCLS; Z-Anatomy; derivation by NeuroSurge contributors |
| Nerve-route points derived from the BodyParts3D and Z-Anatomy meshes and the vessel centre lines (21 November; the points of typical nerve courses, of the vertebral canal and one point in each muscle; no mesh geometry) | the generated block `WIRING_GENERATED` of `scene/src/ns-wiring-data.mjs` | CC BY 4.0 and, for the points laid on or in Z-Anatomy muscles, CC BY-SA 4.0 (derived data, as its sources); the rest of that module (tables, rules, code) is project code, CC0 1.0 | DBCLS; Z-Anatomy; derivation by NeuroSurge contributors |

See `SHA256SUMS` and `release-manifest.json` for the exact files in this build. The repository’s `LICENSE` contains the full CC0 1.0 text.

## 1. BodyParts3D (anatomy)

**Required attribution:**

> BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.

- Official source: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
- Current licence page: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html (page dated 2025-02-27; checked
  again for this project on 2026-11-08: the CC BY 4.0 statement is present)
- Licence: https://creativecommons.org/licenses/by/4.0/
- Archive: `isa_BP3D_4.0_obj_99.zip`, the official ISA-tree OBJ set with 99 % polygon reduction (ETag
  `"8848a5a-4dd48ec9df000"`, Last-Modified Wed, 22 May 2013 06:46:24 GMT, 142,903,898 bytes).

**Changes (CC BY 4.0 section 3(a)(1)(B)):**
- A subset of the archive's meshes was selected (listed per mesh in `ASSET-ATTRIBUTION-INDEX.md`).
- The OBJ files themselves are unmodified. Each one is a byte-exact member of the official archive, verified by its
  ZIP CRC32, byte count and SHA-256. Nothing was centred, mirrored, renamed, re-meshed, unit-converted or
  header-edited.
- **Since 19 November 2026 the game does not draw those OBJ files directly. It draws simplified copies of them, made
  beforehand and shipped in `packs/`** (section 1a). The copies are adaptations: fewer triangles, coordinates rounded
  to 0.01 mm. The OBJ files stay in the distribution unchanged and are what the game falls back to when a pack cannot
  be used.
- At run time the bones are moved rigidly, the muscles are bent to follow them (a geometry-only skinning of each
  muscle's vertices to the nearby bones, with no muscle volume or contraction model), and colours showing the
  simulated activity are added. This happens only in the browser's memory; the OBJ files are not changed.
- On Picture quality Low, still simpler copies of the meshes are drawn (the game's own words). The Auto setting also
  switches to these copies when a computer draws very slowly. They are made in the browser's memory by merging
  nearby points of the brain-glass and body meshes (vertex clustering); the OBJ files are not changed. On High, and
  on Auto at full quality, the meshes of the packs (section 1a) are drawn as they are.
- New in round 5, changed in R558 (the game's own words: "The outer muscles are lifted out a little, like in a Body
  Worlds exhibit. That lets you see the deeper muscles under them. Their ends stay on the bones. Every muscle is drawn a
  little fuller."; and a mirror-image copy of the body is drawn behind the brain):
  - **Body Worlds layers:** the outer (superficial) muscles are lifted outward from the long axis of their limb or of
    the trunk, at most 20 mm, and a middle layer by half as much, so that the deeper muscles show in the gaps, like
    the plastinated bodies of a Body Worlds exhibit. The parts of a lifted muscle that touch bone at its two ends stay
    where they are, so the tissue between is drawn stretched and longer than it is; where a muscle meets bone is
    estimated from the mesh shapes, not measured. Every muscle is also drawn up to about 1.6 mm fuller along its
    surface (never on its attachment ends), and the front of the external oblique is drawn smooth near the midline
    (the atlas shapes the rectus abdominis into it). R558: when rectus abdominis is loaded (section 2a), the part of
    the external oblique's flat tendon sheet that lies in front of it (the front of the rectus sheath) is not drawn,
    as if the sheath were opened in a dissection (the strip between the two recti, the linea alba, stays). All of this is
    a display choice made in the browser's memory; in a real
    body the outer muscles lie directly on the deeper ones. It can be switched off on the Esc page ("Lifted outer
    muscles (Body Worlds style)").
    On the fingers, the thumb and the toes nothing is lifted (R558: within about 4 mm of a finger, thumb or toe
    phalanx the lift is zero, and it comes back over about 14 mm toward the palm and the sole), so the long tendons
    there are drawn where the atlas has them, on their bones.
  - **Finger and toe bones (R558 display copies, a documented derivative):** the phalanges of the fingers, the thumbs
    and the toes (source ids: every BodyParts3D phalanx mesh in the packets, e.g. FJ3183, FJ3188, FJ3189, FJ3192) are
    drawn from a smoothed copy made in the browser's memory: six rounds of Taubin smoothing (a shrink step of 0.5 and
    an inflate step of 0.53 toward the mean of each point's neighbours, on the mesh welded by position), which irons
    out the spurs and creases left by the archive's 99 % polygon reduction, and, on each distal phalanx, the free tip
    is rounded: over the last 45 % of its length no point lies closer to the bone's axis than a capsule a little wider
    than the shaft (1.1 times the shaft's mean radius, 1.8 to 4.5 mm; a real ungual tuft is as wide as the shaft or
    wider), ending in a round cap. Points are only pushed outward from the
    axis, never along it, so the bones keep their length and their joint ends; the largest movement measured on these
    meshes is about 2.5 mm. Reason: the reduced distal phalanges (112 to 440 triangles) had lost the rounded ungual
    tuft of a real fingertip and toe tip and were drawn as pointed needles and claws. Tool: the game's own code
    (ns-scene-three boneTipDisplay); the OBJ files are not changed; licence of the derivative as the source (CC BY 4.0).
  - **Cranium and eyes (R558):** packet `packets/bodyparts3d-head-r1` adds ten more byte-exact members of the same
    official archive (both parietal bones FJ3274 / FJ3380, the occipital bone FJ3309, the sphenoid FJ3394, and the
    sclera FJ1317 / FJ1368, iris FJ1297 / FJ1348 and lens FJ1305 / FJ1356 of each eye), fetched on 2026-11-11 by range
    requests and checked by ZIP CRC32, byte count, sha256 and header (packet `ACQUISITION-RECORD.json`). They close the
    head the full-body packet left open behind the frontal and temporal bones. The files are unchanged; the eye parts
    are listed with kind "bone" only because the game's rig poses bones and muscles, and are drawn with eye colours. The
    licence page was checked again on 2026-11-11 (CC BY 4.0 statement present). The source's right sclera has 12
    vertices on the left side that form zero-area points; kept as found (nothing is drawn there).
  - **Cerebral arteries (18 November):** packet `packets/bodyparts3d-cerebral-arteries-r1` adds eighty more byte-exact
    members of the same official archive: the cortical branches of the middle, anterior and posterior cerebral arteries
    with a small circle of Willis, both sides (the left side's files are the atlas's own mirror copies, `FJ....M`),
    fetched on 2026-11-18 by range requests and checked by ZIP CRC32, byte count, sha256 and header (packet
    `ACQUISITION-RECORD.json`; licence page checked again the same day, CC BY 4.0 statement present). They are drawn on
    the game's brain in their own coordinates (the same source frame), move with its simulated beat and wobble, swell a
    little with the beat, are coloured, and are not drawn where a motor area of the game covers them. Three originals
    (FJ1664, FJ1665, FJ1719) have blank name lines in their own headers; their names come from the archive's element
    list. The files are unchanged. BodyParts3D 4.0 has no cerebral veins or dural sinuses: the veins and sinuses on the
    brain are the game's own drawing (project code, CC0), laid along typical anatomy, not BodyParts3D data.
  - **Vessels of the limbs (18 November):** packet `packets/bodyparts3d-body-vessels-r1` holds the CENTRE LINES and radii
    of 40 named vessels of the legs and arms (the saphenous, femoral, popliteal, tibial, axillary, brachial, radial, ulnar,
    cephalic, basilic and median veins and arteries and the dorsal venous network of the hand), computed by the project's
    own tool from byte-exact members of the same official archive (fetched 2026-11-18, checked by ZIP CRC32, byte count
    and sha256; each line names its source member and its sha256). The meshes themselves (24.6 MB) are not distributed.
    This is a modification of the BodyParts3D data: a derivative, licensed CC BY 4.0 as its source. At run time the game
    draws round tubes along these lines, fastens them to its drawn muscles and bones so they follow every pose, and
    colours them.
  - **Mirror body:** a mirror-image copy of the whole body (bones and muscles) is drawn behind the brain. It copies the
    body's pose and colours.
  - When the palm is turned (double-tap Space), the upper arm also turns at the shoulder and the trunk follows a
    little. This uses the same rigid bone movement and muscle bending described above.
  - All of this happens only in the browser's memory; the OBJ files are not changed.
- The shipped packet file `packets/bodyparts3d-fullbody-r1/ATTRIBUTION-AND-LICENCES.txt` still describes the run-time
  changes as "whole-mesh rigid transforms". That wording is out of date; the statement above replaces it. The packet
  file is covered by the packet's `SHA256SUMS.txt` and was left byte-identical in this build.

**Disclaimer:** BodyParts3D is offered by its licensor as-is. As stated in CC BY 4.0, section 5, the licensor gives
no warranties of any kind concerning the material and is not liable for its use.

**Legacy notice:** the comment header inside each OBJ file still carries the older Creative Commons
Attribution-Share Alike 2.1 Japan notice. These headers are kept byte-exact. The current official licence for the
archive is CC BY 4.0.

**No endorsement:** the dataset authors (DBCLS) do not endorse NeuroSurge or NeuroTranslate 0.0. Do not attribute
biological, clinical or functional validation to these meshes or to the game.

**Official cautions** (quoted from the BodyParts3D information page): "There are still many concepts not represented in
the data. There could be many ERRORS to be used as ANATOMICAL EDUCATION. Some parts were made from scratch by artists or
distorted to fit into the environment. Segmentation into finer pieces may cause confusion in assignment of concepts."
The geometry is a single reference body: it is not the player, any measured person, or a population average.

### 1.1 Packet `packets/pov-demo-assets/` (141 meshes)

From the official archive. The packet contains 50 left upper-limb muscles, 32 left
upper-limb bones and 59 brain meshes (including the left and right precentral gyri, FJ1800 and FJ1801, used as motor
landmarks).

- Combined manifest shipped with the game: `inputs/MESH-MANIFEST.json` (142 entries covering this packet and the next).
- Source manifest for the original packet: `pov-demo-assets/MESH-MANIFEST.json`, sha256
  `719c40f6783af9056d0d0ff55bf1d8e365a3868f7899f423a0d6f9d74c4e5510`.
- Source attribution file (not shipped; its BodyParts3D section is reproduced in this section):
  `pov-demo-assets/ATTRIBUTION-AND-LICENCES.txt`, sha256 `2a8fa39569da5fd594514b60343f40a8e4aeae3a30498856bd71f4d8ac4c4791`.
  The same file credits public-domain Gray's Anatomy plates (Henry Vandyke Carter, 1918) and two Wikimedia Commons
  photographs (CC BY-SA 3.0 and CC BY-SA 4.0). Independent reviewers used them as visual references. They are **not**
  part of this distribution.

### 1.2 Packet `packets/pov-demo-assets-r2/` (1 mesh)

FJ1466M (FMA37397, BP8737), the abductor digiti minimi of the left hand. Exact original OBJ member, unchanged; the
legacy embedded notice is retained.

- Listed in `inputs/MESH-MANIFEST.json`.
- Immutable source manifest (not shipped): `pov-demo-assets-r2/ADDITIONAL-MESH-MANIFEST.json`, sha256
  `6251b2af483b8a0016f00be3d90cc8a917edfd4fbfedbc426fa946450d5d03b8`.
- Source attribution file (not shipped, reproduced here): `pov-demo-assets-r2/ATTRIBUTION-AND-LICENCE.txt`, sha256
  `2e07bae9b2a926760507f0884ef8ad557ec7b8fb77ed42962aeb04a7cdf9fd15`.

### 1.3 Packet `packets/bodyparts3d-fullbody-r1/` (full body; 294 meshes when this file was written)

Acquired on 2026-11-08 with the user's explicit authorisation, from the official host only, using the same rules. It
contains the right arm, torso, pelvis, both legs, neck and head/face bones and muscles. The left arm and the brain stay
in the packets above, and nothing is duplicated.

When this file was written, the packet held 294 meshes: right arm 30 bones and 50 muscles; torso 60 bones and 16
muscles; pelvis 3 bones; each leg 30 bones and 22 muscles; neck 8 bones and 11 muscles; head and face 12 bones.
`ASSET-ATTRIBUTION-INDEX.md` is generated at build time and lists the exact meshes in **this** build.

Shipped with the packet:
- `packets/bodyparts3d-fullbody-r1/ATTRIBUTION-AND-LICENCES.txt`: attribution, changes and cautions.
- `packets/bodyparts3d-fullbody-r1/ACQUISITION-RECORD.json`: the acquisition record (requests, licence check, archive
  central-directory check, missing, rejected and anomalous parts).
- `packets/bodyparts3d-fullbody-r1/SHA256SUMS.txt`: per-file hashes. The build verifies them.
- Manifest: `inputs/FULLBODY-MESH-MANIFEST.json`.

Recorded limitations (from the packet's own records):
- **20 requested structures do not exist** in the BodyParts3D 4.0 lists and were not substituted: both latissimus
  dorsi and both rectus abdominis, the coccyx, and the masseter, temporalis, orbicularis oculi, zygomaticus major,
  frontal belly of occipitofrontalis and buccinator on each side, plus the orbicularis oris and both paracentral lobules.
  (Round 5 adds the missing face and chewing muscles from a second source, Z-Anatomy; see section 2. R558 adds
  latissimus dorsi and rectus abdominis from Z-Anatomy too, with more BodyParts3D muscles; see section 2a.)
- **2 official files were excluded:** FJ1469M ("Right flexor pollicis brevis") failed the laterality check (its
  geometry lies on the left side), and FJ2772 (hyoid bone) duplicates the geometry of FJ3201.
- **2 included files have recorded source anomalies** (kept byte-exact, not repaired): FJ3345 (right seventh costal
  cartilage, 6 of 1538 vertices across the midline band) and FJ1595 (right sternocleidomastoid, 56 of 6642 vertices
  across the midline band).

## 1a. Simplified copies of the meshes (packs/), 19 November 2026

What the game loads and draws is not the OBJ files of the packets but `packs/`: five pack files and one small rig
file, 4.8 MB together instead of 157 MB. They are **adaptations** of the BodyParts3D and Z-Anatomy meshes, made by
NeuroSurge contributors with `tools/build-mesh-packs.mjs` and `tools/simplify-mesh.mjs`; `packs/README.md` has the
full account and the numbers per pack.

**Changes made (CC BY 4.0 and CC BY-SA 4.0 section 3(a)(1)(B)):**
- Fewer triangles: 878 440 instead of the 2 395 434 of the 611 source files (36.7 %). Vertices are removed one at a
  time by sliding each onto a neighbour. Every vertex that is kept is a vertex of the source file; no vertex is moved.
  A removal is refused when it would change how the surface is connected, turn a triangle over, move an open rim, or
  leave any vertex of the source file further from the simplified surface than 0.5 mm (0.4 mm for the 14 belly and
  chest muscles the game reshapes, 0.3 mm for the brain; less for a small thin muscle, so that every closed mesh
  keeps at least 93 % of its volume); that distance is measured for every source vertex.
- Vertices that the source file repeats at exactly the same position are joined, and the kept coordinates are rounded
  to 0.01 mm (a few are left as they are where the rounding would flatten a triangle).
- 78 meshes are kept exactly as their source files: the 32 bones of the left game arm, the two precentral gyri, the
  two lacrimal bones and the 42 finger and toe bones.
- Only vertex positions and triangles are kept (which is all the game ever read from the OBJ files). The comment
  lines of each OBJ file, including the legacy licence notice of the BodyParts3D files, are carried in the pack with
  the mesh.
- `packs/BODY-RIG.json` holds no mesh. It is data derived from the source meshes by the game's own code: where each
  joint pivots, about which axes, and which bone each muscle follows.

**Licences of the copies.** Each pack holds the files of its own source packet or packets and keeps their licence:
`arm-brain`, `fullbody`, `head` and the 93 BodyParts3D files of `missing-muscles` are adaptations of BodyParts3D,
© The Database Center for Life Science, licensed under CC BY 4.0, with the attribution and links of section 1.
`face-muscles` and the 18 Z-Anatomy files of `missing-muscles` are adaptations of Z-Anatomy meshes and **stay under
CC BY-SA 4.0 (share-alike)**, with the required credit of sections 2 and 2a. If you share these packs, or changed
versions of them, share them under the same licences with the same credits and a note of what you changed. The
NeuroSurge code that makes and reads the packs is CC0 and is not relicensed by them. Neither DBCLS nor Z-Anatomy
endorses NeuroSurge or these simplified copies.

**How the copies are tied to their sources.** Inside a pack every mesh records the size and SHA-256 of the OBJ file
it was made from, and the game compares both with its pinned manifests before it uses the mesh, as it does for a
fetched OBJ file. `packs/PACK-INDEX.json` lists each pack's size and SHA-256, and its own SHA-256 is fixed in the
game's code. The project's tests rebuild the packs from the source packets and compare them with the shipped ones.
The source packets, their manifests, hash lists, acquisition records and licence files are unchanged.

## 2. Face and chewing muscles (packets/face-muscles-r1)

Round 5 adds 54 mesh files (27 facial-expression and chewing muscles, left and right) taken from **Z-Anatomy**, the
open source 3D atlas of anatomy, which is itself built on BodyParts3D. BodyParts3D 4.0 has no facial-expression or
chewing muscles (except the platysma), so these meshes come from Z-Anatomy. They were downloaded after the user chose
"Download open models" for the missing face muscles, from the source's own repository, after a licence check.

**Required credit (quoted exactly as the source asks):**

> "Z-Anatomy - The open source atlas of anatomy - CC-BY-SA 4.0"
>
> "BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan"

- Z-Anatomy authors named by the source: Gauthier Kervyn (design, 3D, anatomy), Lluis Vinent (Unity app and the FBX
  export), Marcin Zielinski (Blender add-on), Kousaku Okubo (original BodyParts3D model).
- BodyParts3D's own licence page now says "BodyParts3D, © The Database Center for Life Science licensed under CC
  Attribution 4.0 International" (section 1). The Z-Anatomy text still names the older CC BY-SA 2.1 Japan licence;
  both notices are kept, as the packet's attribution file does.
- Licence of these 54 mesh files: **Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)**,
  https://creativecommons.org/licenses/by-sa/4.0/ (legal code: https://creativecommons.org/licenses/by-sa/4.0/legalcode).
- Source, at the pinned commit:
  https://github.com/LluisV/Z-Anatomy/tree/6c7f9016bd5899ac8edafd31b9900c151df42ed6/Resources/Models/FBX
  (file `MuscularSystem100.fbx`, 37,343,180 bytes, SHA-256
  `4c19df534d5d84aabbce08604306aa0485b43e8a2483c72a95b569e1dfea2279`, commit
  `6c7f9016bd5899ac8edafd31b9900c151df42ed6`, retrieved 2026-11-08 UTC).

**Changes (CC BY-SA 4.0 section 3(a)(1)(B)):**
- Selection: only the 27 facial-expression and chewing muscles x 2 sides were taken (listed per mesh in
  `ASSET-ATTRIBUTION-INDEX.md` and `packets/face-muscles-r1/FACE-MESH-MANIFEST.json`); everything else in the FBX file
  was left out.
- Conversion: FBX to Wavefront OBJ, positions and triangles only (normals, materials and hierarchy dropped; polygons
  split into triangles; coordinates rounded to 0.0001 mm).
- Registration: every vertex was moved by one similarity transform for the whole source (one uniform scale, one
  rotation, one translation; this includes the change from centimetres to millimetres) into the BodyParts3D 4.0 body
  frame, so the muscles sit on the BodyParts3D skull and jawbone.
- Left side: Z-Anatomy draws each left face muscle as a mirror copy of the right one; the left files are those mirror
  copies (face order reversed so the surfaces still face outward).
- Names: each file got a NeuroSurge id (`zf-...`), a plain name and a technical name; the source object name is kept in
  the file header and in the manifest.
- In the game (the game's own words): "only the face and chewing muscles were taken, converted and moved to fit this
  body; in the game they are coloured by the made-up signal, the jaw muscles bend with the jawbone, they are drawn a
  little fuller (part of the Body Worlds display; none of them is lifted) and a mirror-image copy is drawn on the
  mirror body". New in R558 (the game's own words: "parts of the scalp muscles are drawn lifted onto the skull"): with
  the BodyParts3D parietal and occipital bones added (section 1), parts of the occipital belly, the temporoparietalis
  and the upper temporalis would lie inside those bones (up to about 8.5 mm), because the skull these muscles were
  modelled on is a little smaller there. Those parts are drawn moved outward onto the bone surface (0.6 mm above it),
  each sheet as a whole so its thickness and shape stay, fading out over a few rings of the mesh; nothing else moves.
  The face muscles are also drawn with no tendon tint (except a little on masseter and temporalis) and no lengthwise
  streaks on the ring muscles around the eye and the mouth. Like the
  BodyParts3D meshes, they are also drawn as simplified copies on Picture quality Low, and the surfaces facing the
  inside of the head are drawn in a plain dark colour. All of this happens only in the browser's memory; the shipped
  OBJ files are the converted files described above.
- Since 19 November 2026 the game draws simplified copies of these 54 meshes, made beforehand and shipped as
  `packs/face-muscles.nspack` (section 1a: fewer triangles, every kept vertex a vertex of the converted file, the
  surface within 0.5 mm of it, coordinates rounded to 0.01 mm). That pack is an adaptation of these meshes and is
  under CC BY-SA 4.0 like them.

**These 54 mesh files stay under CC BY-SA 4.0 (share-alike) wherever they go; the NeuroSurge code is CC0 and is not
relicensed by them.** If you share changed versions of these meshes, share them under CC BY-SA 4.0 too, with the credit
above, a link to the licence and a note of what you changed.

Shipped with the packet:
- `packets/face-muscles-r1/ATTRIBUTION-AND-LICENCES.txt`: the full attribution, licence, changes and the verbatim
  source licence texts (shipped unchanged).
- `packets/face-muscles-r1/FACE-MESH-MANIFEST.json`: the 54 meshes with their sizes, sha256 values, names and the
  registration. The game checks this file against a sha256 written into its code before it reads it, and every mesh
  against the manifest.
- `packets/face-muscles-r1/ACQUISITION-RECORD.json`: how and from where the file was downloaded, and the checks made.
- `packets/face-muscles-r1/SHA256SUMS.txt`: per-file hashes. The build verifies them.

Other parts of the Z-Anatomy source have other licences (for example a non-commercial inner ear and kidney model);
none of them is in this packet. In the game, the "Sources and rights" links under the colour key also name the face
muscles' licence and source. **No endorsement:** neither Z-Anatomy, its authors nor DBCLS endorse NeuroSurge or
NeuroTranslate 0.0. The face muscles are one reference model for learning: not a measured person and not validated.
One muscle group is missing from the source file: the muscles around the ear (auricular muscles).

## 2a. Missing muscles (packets/missing-muscles-r1)

R558 adds 111 mesh files for the large muscles the body packets lacked (the lower back, the belly, the inner thigh and
the outer shin looked bare) and for every other muscle the game's motor map names that had no mesh: 93 BodyParts3D 4.0
files and 18 Z-Anatomy derivatives. A Z-Anatomy derivative supplies each muscle with no matching BodyParts3D 4.0 file.

**BodyParts3D 4.0 files (93, `FJ*.obj`, CC BY 4.0).** Byte-exact members of the official archive
`isa_BP3D_4.0_obj_99.zip`, fetched by HTTP range requests from the official host in two runs on 2026-11-11 (ZIP CRC32,
size and sha256 checked; no change at all). Required attribution as in section 1:

> BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.

They are: the erector spinae columns (iliocostalis lumborum, thoracis and cervicis; longissimus thoracis, cervicis and
capitis; spinalis thoracis), semispinalis thoracis, cervicis and capitis, splenius capitis, the rhomboids, serratus
posterior superior and inferior, pectoralis minor, the right levator scapulae (the left one was already in the
left-arm packet), the scalenes, the throat strap muscles (sternohyoid, omohyoid, sternothyroid, thyrohyoid) and
stylohyoid, levator palpebrae superioris, gracilis, adductor longus and brevis, pectineus, tensor fasciae latae,
gluteus minimus, piriformis, obturator internus and externus, the gemelli, quadratus femoris, popliteus, plantaris,
fibularis longus, brevis and tertius, tibialis posterior, extensor hallucis brevis, flexor digitorum brevis and
abductor hallucis (both sides unless stated).

**Z-Anatomy derivatives (18, `zm-*.obj`, CC BY-SA 4.0).** Latissimus dorsi, rectus abdominis, the internal oblique,
transversus abdominis, quadratus lumborum, longus colli, extensor digitorum brevis and the two heads of flexor hallucis
brevis, each side: BodyParts3D 4.0 has no file for these. Same source, file and commit as section 2
(`MuscularSystem100.fbx`, SHA-256 `4c19df534d5d84aabbce08604306aa0485b43e8a2483c72a95b569e1dfea2279`, commit
`6c7f9016bd5899ac8edafd31b9900c151df42ed6`).

**Required credit for the Z-Anatomy files (quoted exactly as the source asks):**

> "Z-Anatomy - The open source atlas of anatomy - CC-BY-SA 4.0"
>
> "BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan"

Authors as in section 2. Licence: **CC BY-SA 4.0**, https://creativecommons.org/licenses/by-sa/4.0/.

**Changes to the Z-Anatomy files (CC BY-SA 4.0 section 3(a)(1)(B)):** selection of the 18 objects; FBX to OBJ
(positions and triangles only, polygons fan-triangulated, unused vertices dropped, face order reversed on mirrored
left-side instances, coordinates rounded to 0.0001 mm); moved into the BodyParts3D 4.0 frame by the face packet's own
recorded similarity (the conversion reproduces all 54 face-packet files exactly); the three foot objects then moved by
one rigid correction per foot (fitted to the same foot muscles in BodyParts3D); NeuroSurge ids, plain names and labels
added, source object names kept. **These 18 files stay under CC BY-SA 4.0 (share-alike); the NeuroSurge code is CC0
and is not relicensed by them.**

In the game (display only, in browser memory): the muscles are coloured by the simulated signal, lifted and filled a
little like the other muscles (Body Worlds display), follow their nearest bones, are copied onto the mirror body, and
the obliques' tendon sheets in front of rectus abdominis (part of the BodyParts3D external oblique mesh and of the
Z-Anatomy internal oblique and transversus abdominis meshes) are not drawn, as if the rectus sheath were opened in a
dissection; the external oblique's strip between the two recti (the linea alba) stays. The game's "Sources and rights" text adds the Z-Anatomy credit when these files are loaded.

Since 19 November 2026 the game draws simplified copies of this packet's 111 meshes, made beforehand and shipped as
`packs/missing-muscles.nspack` (section 1a). The copies of the 18 Z-Anatomy files in that pack are adaptations under
CC BY-SA 4.0; the copies of the 93 BodyParts3D files are adaptations under CC BY 4.0.

Shipped with the packet:
- `packets/missing-muscles-r1/ATTRIBUTION-AND-LICENCES.txt`: credits, licences, changes.
- `packets/missing-muscles-r1/MISSING-MUSCLES-MESH-MANIFEST.json`: the 111 files with ids, names, sides, source member or
  object, licence and sha256. The game checks this file against a sha256 written into its code before reading it, and
  every mesh against the manifest.
- `packets/missing-muscles-r1/ACQUISITION-RECORD.json`: requests, licence checks, conversion, frame registration
  evidence (median distances to the same structures in BodyParts3D) and what was left out.
- `packets/missing-muscles-r1/LICENSES/`: the Z-Anatomy notices and licence, unchanged.
- `packets/missing-muscles-r1/SHA256SUMS.txt`: per-file hashes.

**No endorsement:** neither DBCLS, Z-Anatomy nor their authors endorse NeuroSurge or NeuroTranslate 0.0. One reference
model for learning: not a measured person and not validated. Still not drawn anywhere: multifidus and the other small
deep spine muscles, the suboccipital muscles, subclavius, most small muscles of the sole, the pelvic floor, the
diaphragm and the intercostal muscles.

## 3. three.js (MIT)

`vendor/three.module.js` is three.js release 170, unmodified. Its licence ships alongside it as `vendor/LICENSE`:

```
The MIT License

Copyright © 2010-2024 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## 4. NeuroSurge project code (CC0 1.0)

The project-owned NeuroSurge code and project-authored data listed in the table above are dedicated to the public
domain under **CC0 1.0 Universal**: https://creativecommons.org/publicdomain/zero/1.0/. To the extent possible under
law, the contributors waive all copyright and related or neighbouring rights to that material. The repository's
`LICENSE` file holds the full CC0 1.0 legal code, and the repository's `PROJECT-CONTEXT.json` records the same rule:
project-owned contributions are CC0-1.0, while third-party materials keep their own licences and notices. The
dedication does not cover three.js, BodyParts3D, the Z-Anatomy face muscles or any quoted third-party text.

## 5. Scientific sources

The movement map (`inputs/MOVEMENT-MAP.json`) and the in-game information panel describe published functional
neuroanatomy. Examples include Penfield's motor homunculus and Gordon et al., 2023, *Nature*, on inter-effector regions
of the motor cortex. These sources are cited, not bundled. Their citation manifest (sha256
`2e4bd3c0e2947310065cd56aadf62d14734d9ead67e4ba44c5e69a614f6d62b1`) is held with the project's functional-map
records. The map is a representative, source-informed educational simulation. It is not a measured or learned
neural-to-muscle decoder.

The nerve data of the electrical map (`scene/src/ns-wiring-data.mjs`, 21 November 2026) states typical anatomy as it is
taught: which nerve serves each muscle and from which level, the usual course of each nerve, where the segments of the
spinal cord lie, and the best-known links between regions of the brain. Only facts were taken, in the game's own
words; no text, table or figure was copied. The sources are cited in the module (`WIRING_SOURCES`), not bundled: the
Medical Research Council's *Aids to the examination of the peripheral nervous system* (Memorandum No. 45, 1976);
OpenStax *Anatomy and Physiology 2e* (CC BY 4.0); the ISNCSCI worksheet of the American Spinal Injury Association and
the International Spinal Cord Society; and Wikipedia articles (CC BY-SA 4.0) read on 21 November 2026. The drawn routes
are typical and simplified, laid by rule over this atlas. They are not traced from a scan.

## Camera and recording sources

- NeuroSurge bundles Google’s MediaPipe Pose Landmarker Lite and Tasks Vision runtime under Apache 2.0. The camera estimates arm and knee poses in the browser. [Camera and test-image sources](scene/src/camera/README.md#sources-and-licences) · [Apache 2.0 licence and notices](scene/src/camera/vendor/LICENSE)
- The Movement mirror’s browser forecast uses the released NeuroTranslate 0.0 landmark and next-unit parameters. [Original checkpoint, recording sources and licences](scene/src/joint/model/NOTICE.html)
- The whole-body marker replays use Carnegie Mellon Graphics Lab trials 02_06, 13_11 and 132_23. Funding came from NSF EIA-0196217. CMU permits copying, modifying and redistributing the data, including in commercial products. Its terms prohibit direct resale of the data, including converted copies. [CMU terms](https://mocap.cs.cmu.edu/faqs.php)
- Hand frames and descriptions from HoloAssist retain CDLA-Permissive-2.0. The source page describes how the recording was converted. [Hand data and credits](assets/hand-search/hand-source-credits.html)
- The rat and wrist replays and model comparisons carry the source terms and derived-data credits listed with each recording. The cortex summaries retain CC BY-SA 4.0 and the archive’s participant-privacy terms. [Recording and forecast credits](ACTIVITY-MAP.md)
- The game uses system fonts. The launch page includes a game image, and the test suite includes credited camera fixture images.

## Lite mesh decoder and game image

NeuroSurge Lite may load Brotli.js and base64-js to open compressed mesh packs. The bundled decoder retains its original copyright and licence notices. [Decoder notices](lite/BROTLI-THIRD-PARTY.txt)

The game image in the README and on the launch page shows BodyParts3D and Z-Anatomy geometry drawn in NeuroSurge. The image is available under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), with the anatomy credits above.
