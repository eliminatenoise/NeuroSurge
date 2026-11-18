# BodyParts3D cerebral arteries (bodyparts3d-cerebral-arteries-r1)

Eighty byte-exact members of the official BodyParts3D 4.0 ISA OBJ archive (99 % polygon reduction), in the same
BodyParts3D 4.0 whole-body millimetre frame as the brain the game draws (`inputs/MESH-MANIFEST.json`; +x subject left,
+y posterior, +z superior): the cortical branches of the middle cerebral artery (the arteries of the precentral, central
and postcentral sulci, the anterior and posterior parietal, angular, prefrontal, temporal and temporo-occipital
branches, the orbitofrontal (lateral frontobasal) branches, the insular trunks and M1), of the anterior cerebral artery
(A1, the anterior communicating artery, the pericallosal and callosomarginal arteries and their paracentral,
intermediomedial, posteromedial and precuneal branches) and of the posterior cerebral artery (P1, P2, the lateral and
medial occipital arteries and the temporal branches of the lateral occipital artery), with the posterior
communicating, basilar and superior cerebellar arteries. Both sides; the left side's files are the atlas's own mirror
copies (`FJ....M`).

Why: the owner asked on 18 November 2026 to "get the vascularity right, especially with the cerebral veins and etc.".
The brain's vessels had been noise lines in its shader that followed no anatomy.

Registration: the files are used exactly as they are. Measured against the game's brain, the median distance of a
cortical branch's vertices from the nearest brain vertex is 0.8 to 4.4 mm (they lie in and over the sulci, as in
life). The game draws them as one mesh on the brain, moving with its simulated beat.

Not here (and why): the internal carotid and vertebral arteries (they leave the brain downward; drawn here they would
hang below it as cut stumps), the medial frontobasal arteries (about 10 mm off this brain's orbital surface), the
splenial arteries, the deep perforators and the small cerebellar branches (inside or under the brain, never seen).
BodyParts3D 4.0 has no cerebral veins and no dural sinuses: the game lays those out by hand along this brain's
landmarks (`scene/src/ns-vessels.mjs`, `VEIN_COURSES`, typical anatomy after Rhoton 2002 and Gray's Anatomy).

How it was fetched and checked: [ACQUISITION-RECORD.json](ACQUISITION-RECORD.json) (range requests against the
official archive, ZIP CRC32 and byte count against the live central directory, sha256, header and bounds checks; the
licence page was checked on 2026-11-18). Per-file records: [CEREBRAL-ARTERIES-MESH-MANIFEST.json](CEREBRAL-ARTERIES-MESH-MANIFEST.json).
Licence and attribution: [ATTRIBUTION-AND-LICENCES.txt](ATTRIBUTION-AND-LICENCES.txt) (CC BY 4.0, DBCLS).

Three originals (FJ1664, FJ1665: arteries of the central sulcus; FJ1719: posterior temporal branches of the lateral
occipital artery) leave the name, concept and compatibility lines of their own header blank in the archive; their names
come from the archive's element list. Kept as found.

A teaching picture: the courses are one atlas's typical anatomy, not this or any person's angiogram.
