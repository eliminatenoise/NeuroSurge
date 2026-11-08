# NeuroSurge: credits and licences

NeuroSurge ships three kinds of material, each under its own licence. The CC0 dedication for the project's code
does **not** extend to the third-party material. In particular, the BodyParts3D anatomy is never relabelled CC0.

| Material | Where in the distribution | Licence | Rights holder |
| --- | --- | --- | --- |
| NeuroSurge project code: game modules, game page and stylesheet, release kit (`serve-local.mjs`, build and export tools) | `scene/src/`, `scene/example/`, `serve-local.mjs` | CC0 1.0 Universal (public-domain dedication) | NeuroSurge project contributors |
| Project-authored data: mesh manifests, movement map, attribution index | `inputs/`, `ASSET-ATTRIBUTION-INDEX.md` | CC0 1.0 for project-authored content. Quoted third-party notices and cited literature remain their authors'. | NeuroSurge project contributors |
| three.js r170 (3D engine) | `vendor/three.module.js`, `vendor/LICENSE` | MIT | three.js authors |
| BodyParts3D 4.0 anatomy meshes | `packets/**/meshes/*.obj` | CC BY 4.0 | The Database Center for Life Science (DBCLS) |

This is the round-4 public build of NeuroSurge (the round-2 build was the first public release). Exact hashes for
every file are in `SHA256SUMS` and `release-manifest.json`. The full CC0 1.0 legal code is in the `LICENSE` file at
the top of the NeuroSurge repository on GitHub.

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
- At run time the bones are moved rigidly, the muscles are bent to follow them (a geometry-only skinning of each
  muscle's vertices to the nearby bones, with no muscle volume or contraction model), and colours showing the
  simulated activity are added. This happens only in the browser's memory; the OBJ files are not changed.
- On Picture quality Low, simplified copies of the meshes are drawn (the game's own words). The Auto setting also
  switches to these copies when a computer draws very slowly. The copies are made in the browser's memory by merging
  nearby points of the brain-glass and body meshes (vertex clustering); the OBJ files are not changed. On High, and
  on Auto at full quality, the meshes are drawn as they are.
- The shipped packet file `packets/bodyparts3d-fullbody-r1/ATTRIBUTION-AND-LICENCES.txt` still describes the run-time
  changes as "whole-mesh rigid transforms". That wording is out of date; the statement above replaces it. The packet
  file is covered by the packet's `SHA256SUMS.txt` and was left byte-identical in this build.
- For publication, the absolute local file paths recorded in the project's own provenance fields
  (`inputs/MESH-MANIFEST.json`, `inputs/FULLBODY-MESH-MANIFEST.json`, `inputs/MOVEMENT-MAP.json` and
  `packets/bodyparts3d-fullbody-r1/ACQUISITION-RECORD.json`) were replaced by the placeholders `<claude-dev-root>/`
  and `<neurosurge-project-root>/`. Nothing else in those files changed. The sha256 values recorded inside these
  provenance fields (for example `complements.sha256` and the acquisition record's `outputs.manifest.sha256`) describe
  the original files before this path replacement; the shipped files' own hashes are in `SHA256SUMS`.

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

Acquired by the Root integration owner from the official archive. Contents: 50 left upper-limb muscles, 32 left
upper-limb bones and 59 brain meshes (including the left and right precentral gyri, FJ1800 and FJ1801, used as motor
landmarks).

- Combined manifest shipped with the game: `inputs/MESH-MANIFEST.json` (142 entries covering this packet and the next).
- Immutable source manifest (Root's frozen packet, not shipped): `pov-demo-assets/MESH-MANIFEST.json`, sha256
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
- **2 official files were excluded:** FJ1469M ("Right flexor pollicis brevis") failed the laterality check (its
  geometry lies on the left side), and FJ2772 (hyoid bone) duplicates the geometry of FJ3201.
- **2 included files have recorded source anomalies** (kept byte-exact, not repaired): FJ3345 (right seventh costal
  cartilage, 6 of 1538 vertices across the midline band) and FJ1595 (right sternocleidomastoid, 56 of 6642 vertices
  across the midline band).

## 2. three.js (MIT)

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

## 3. NeuroSurge project code (CC0 1.0)

The project-owned NeuroSurge code and project-authored data listed in the table above are dedicated to the public
domain under **CC0 1.0 Universal**: https://creativecommons.org/publicdomain/zero/1.0/. To the extent possible under
law, the contributors waive all copyright and related or neighbouring rights to that material. The repository's
`LICENSE` file holds the full CC0 1.0 legal code, and the repository's `PROJECT-CONTEXT.json` records the same rule:
project-owned contributions are CC0-1.0, while third-party materials keep their own licences and notices. The
dedication does not cover three.js, BodyParts3D or any quoted third-party text.

## 4. Scientific sources

The movement map (`inputs/MOVEMENT-MAP.json`) and the in-game information panel describe published functional
neuroanatomy. Examples include Penfield's motor homunculus and Gordon et al., 2023, *Nature*, on inter-effector regions
of the motor cortex. These sources are cited, not bundled. Their citation manifest (sha256
`2e4bd3c0e2947310065cd56aadf62d14734d9ead67e4ba44c5e69a614f6d62b1`) is held with the project's functional-map
records. The map is a representative, source-informed educational simulation. It is not a measured or learned
neural-to-muscle decoder.

## 5. Not included

- No fonts (the game uses the system font), no images, no audio, no analytics, no trackers and no remote resources.
- The reference images used by independent reviewers (section 1.1) are not included.
- Files rejected during acquisition (section 1.3) are not included and are never loaded.
- Development tests, test harnesses and acquisition evidence are not part of the player distribution.
