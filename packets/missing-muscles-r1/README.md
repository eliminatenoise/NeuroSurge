# packets/missing-muscles-r1

The muscles the NeuroSurge body packets lacked, so that the lower back, the belly, the inner thigh and the outer shin
are no longer bare and every muscle the game's motor map names has a mesh. 111 OBJ files:
93 byte-exact BodyParts3D 4.0 files (`FJ*.obj`, CC BY 4.0) and 18 documented Z-Anatomy
derivatives (`zm-*.obj`, CC BY-SA 4.0, share-alike) for the muscles BodyParts3D 4.0 does not have.
36,303,140 bytes, 393,594 vertices, 608,776 triangles.

## Contents (BodyParts3D element ids, or zm- ids for Z-Anatomy; right first)

- Back: iliocostalis lumborum (FJ1527, FJ1527M); iliocostalis thoracis (FJ1528, FJ1528M); longissimus thoracis (FJ1535, FJ1535M); spinalis thoracis (FJ1544, FJ1544M); rhomboid major (FJ1536, FJ1536M); rhomboid minor (FJ1537, FJ1537M); serratus posterior inferior (FJ1541, FJ1541M); serratus posterior superior (FJ1542, FJ1542M); semispinalis thoracis (FJ1540, FJ1540M); latissimus dorsi (zm-latissimus-dorsi-r, zm-latissimus-dorsi-l); quadratus lumborum (zm-quadratus-lumborum-r, zm-quadratus-lumborum-l)
- Belly: rectus abdominis (zm-rectus-abdominis-r, zm-rectus-abdominis-l); internal oblique (zm-internal-oblique-r, zm-internal-oblique-l); transversus abdominis (zm-transversus-abdominis-r, zm-transversus-abdominis-l)
- Chest: pectoralis minor (FJ1456, FJ1456M)
- Neck and throat: iliocostalis cervicis (FJ1526, FJ1526M); longissimus cervicis (FJ1534, FJ1534M); longissimus capitis (FJ1533, FJ1533M); splenius capitis (FJ1545, FJ1545M); semispinalis capitis (FJ1538, FJ1538M); scalenus anterior (FJ1592, FJ1570); scalenus medius (FJ1593, FJ1571); scalenus posterior (FJ1594, FJ1572); omohyoid (FJ1586, FJ1565); sternohyoid (FJ1596, FJ1574); sternothyroid (FJ1597, FJ1575); stylohyoid (FJ1598, FJ1576); thyrohyoid (FJ1599, FJ1577); semispinalis cervicis (FJ1539, FJ1539M); levator scapulae (FJ1532); longus colli (zm-longus-colli-r, zm-longus-colli-l)
- Eye socket: levator palpebrae superioris (FJ1357, FJ1306)
- Hip and thigh: gracilis (FJ1421, FJ1421M); adductor longus (FJ1402, FJ1402M); adductor brevis (FJ1401, FJ1401M); pectineus (FJ1427, FJ1427M); tensor fasciae latae (FJ1438, FJ1438M); gluteus minimus (FJ1420, FJ1420M); piriformis (FJ1428, FJ1428M); obturator internus (FJ1426, FJ1426M); obturator externus (FJ1425, FJ1425M); gemellus superior (FJ1417, FJ1417M); gemellus inferior (FJ1416, FJ1416M); quadratus femoris (FJ1432, FJ1432M)
- Knee and leg: fibularis longus (FJ1410, FJ1410M); fibularis brevis (FJ1409, FJ1409M); fibularis tertius (FJ1411, FJ1411M); tibialis posterior (FJ1440, FJ1440M); popliteus (FJ1430, FJ1430M); plantaris (FJ1429, FJ1429M)
- Foot: extensor hallucis brevis (FJ1407, FJ1407M); flexor digitorum brevis (FJ1413, FJ1413M); abductor hallucis (FJ1400, FJ1400M); extensor digitorum brevis (zm-extensor-digitorum-brevis-r, zm-extensor-digitorum-brevis-l); medial head of flexor hallucis brevis (zm-flexor-hallucis-brevis-medial-r, zm-flexor-hallucis-brevis-medial-l); lateral head of flexor hallucis brevis (zm-flexor-hallucis-brevis-lateral-r, zm-flexor-hallucis-brevis-lateral-l)

## Files

- `MISSING-MUSCLES-MESH-MANIFEST.json`: every file with id, names, side, region, rig hint, source member or source object,
  licence, byte count, sha256, vertex and face counts, bounds and laterality check. The game pins this manifest's
  sha256 in its code (ns-app `PINNED_SHA256.missingMusclesManifest`, ns-assets `PACKET_SPECS['missing-muscles-r1']`)
  and checks every OBJ's bytes against it before parsing.
- `ACQUISITION-RECORD.json`: the requests (BodyParts3D range requests, the Z-Anatomy download), licence checks, the
  conversion route (it reproduces the face packet's 54 files exactly), the frame registration evidence, the per-foot
  correction and what was left out.
- `ATTRIBUTION-AND-LICENCES.txt`: required credits, licences and the changes made.
- `LICENSES/`: the Z-Anatomy notices and licence, unchanged.
- `SHA256SUMS.txt`: per-file sha256.

## Frame

BodyParts3D 4.0 whole-body millimetres (+x subject left, +y posterior, +z superior), the same frame as
`packets/bodyparts3d-fullbody-r1`. The BodyParts3D files are unchanged archive members, so they are in this frame by
construction. The Z-Anatomy files were moved by the face packet's recorded similarity; against the same structures in
BodyParts3D they lie within about 2 to 5 mm (median) on the front, sides and low back of the trunk and at the neck;
the three foot objects also got one rigid correction per foot (about 1 mm median afterwards).

## Not included

Muscles still not drawn anywhere in the game: multifidus and the rotatores (Z-Anatomy only; its deep upper back sits about 8 to 11 mm behind the BodyParts3D deep back, see ACQUISITION-RECORD.json, so it would cut into the BodyParts3D columns without a regional fit), the interspinales and intertransversarii, the suboccipital muscles, subclavius, the small sole muscles other than flexor digitorum brevis, abductor hallucis and flexor hallucis brevis (quadratus plantae, lumbricals, interossei, adductor hallucis, abductor and flexor digiti minimi of the foot), the pelvic floor, the diaphragm and the intercostals.

## Cautions

- One reference model for education (BodyParts3D warns of errors and artist-made parts); not a measured person, not a population average, not validated.
- The zm- files come from a second atlas placed on this body by one similarity fitted at the head and neck: on the front and sides of the trunk and at the low back they lie within about 2 to 5 mm (median) of the same BodyParts3D structures, on the deep upper back about 8 to 11 mm (ACQUISITION-RECORD.json); they are not re-fitted per muscle, except the two short foot muscles (one rigid correction per foot, fitted to BodyParts3D extensor hallucis brevis and flexor digitorum brevis).
- Right-side BodyParts3D files (no M suffix) have header bounds up to 0.48 mm off their own vertices (header_bounds_max_deviation_mm); the mirrored M files match exactly. Kept as found.
- Names, what_it_does, rig_hint and bodymap_region are display metadata, not validated anatomy, mechanics or neural mapping.
