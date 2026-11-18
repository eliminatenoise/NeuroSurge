# BodyParts3D vessels of the limbs, as centre lines (bodyparts3d-body-vessels-r1)

The centre lines and radii of 40 named vessels of the legs and arms, computed from BodyParts3D 4.0 meshes (CC BY 4.0,
DBCLS), in the BodyParts3D 4.0 whole-body millimetre frame: the great and small saphenous veins, the femoral artery and
vein, the popliteal artery and vein, the anterior and posterior tibial arteries, the dorsalis pedis artery, the
superficial epigastric vein, the axillary artery and vein, the brachial, radial and ulnar arteries, the cephalic,
basilic, median cubital and median antebrachial veins and the dorsal venous network of the hand, both sides.

Why: the owner asked on 18 November 2026 to get the vascularity right "for all other items as well". The bodies had no
vessels at all.

Why centre lines and not the meshes: the atlas's meshes of these vessels are 24.6 MB (the great saphenous vein alone
2 MB a side), far too heavy for thin tubes. The game rebuilds light round tubes from these lines (8 sides, a ring every
3 mm) and RIVETS each point to the nearest vertices of the drawn muscles and bones of its side, so the vessels follow
the body through every pose, the per-vertex skinning and the Body Worlds lift (`scene/src/ns-vessels.mjs`).

How the lines were made: [BODY-VESSEL-CENTRELINES.json](BODY-VESSEL-CENTRELINES.json) `derivation` (the medial axis of
each mesh, from rays along the vertex normals to the opposite wall; the coarse femoral meshes by slices). Downloads,
checks and the byte-exact source members' sha256: [ACQUISITION-RECORD.json](ACQUISITION-RECORD.json). Licence:
[ATTRIBUTION-AND-LICENCES.txt](ATTRIBUTION-AND-LICENCES.txt).

Not here: the neck (the atlas's common carotid and internal jugular pieces are 6 to 65 mm stubs; the external jugular
vein is not in BodyParts3D 4.0), the intercostal vessels (under the ribs). In the game, the vessels of YOUR left arm
are not drawn: that arm is the game arm, posed by its own rig, not by the full body these lines are riveted to.

A teaching picture: typical anatomy of one atlas body, not this or any person's vessels.
