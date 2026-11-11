# BodyParts3D cranium and eyes (bodyparts3d-head-r1)

Ten byte-exact members of the official BodyParts3D 4.0 ISA OBJ archive (99 % polygon reduction), in the same
BodyParts3D 4.0 whole-body millimetre frame as `packets/bodyparts3d-fullbody-r1` (+x subject left, +y posterior,
+z superior): both parietal bones, the occipital bone and the sphenoid, which close the cranium that the full-body
packet left open behind the frontal and temporal bones, and the sclera, iris and lens of each eye.

Why: without them the head was a hollow mask. From behind (third person) you saw the inside of the facial skull, the
scalp muscles of the Z-Anatomy face packet (`packets/face-muscles-r1`) floated over empty space like horns and plates,
and the orbits were empty.

How it was fetched and checked: [ACQUISITION-RECORD.json](ACQUISITION-RECORD.json) (range requests against the
official archive, ZIP CRC32 and byte count against the live central directory, sha256, header File ID / concept /
compatibility 4.0 / bounds checks). Per-file records: [HEAD-MESH-MANIFEST.json](HEAD-MESH-MANIFEST.json). Licence and
attribution: [ATTRIBUTION-AND-LICENCES.txt](ATTRIBUTION-AND-LICENCES.txt) (CC BY 4.0, DBCLS).

The eye parts are listed with `kind: "bone"` only because the game's body rig poses the kinds bone and muscle; their
`tissue` is `eye` and the game draws them with eye materials, never as bone. The cornea (a clear surface) is not
included.
