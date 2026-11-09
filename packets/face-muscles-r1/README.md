# Facial atlas assets

This packet contains 54 OBJ files representing 27 paired structures or parts. It includes facial-expression, scalp, platysma and chewing structures from Z-Anatomy. A file may represent a muscle, a belly, a head, a part or one side of a midline structure. Counting files does not count distinct biological muscles.

Each entry in [FACE-MESH-MANIFEST.json](FACE-MESH-MANIFEST.json) keeps its source model ID, geometry ID, hierarchy, name and file hash. Those links let you follow an exported object back to the pinned source atlas. The original mesh bytes, including their attribution headers, are unchanged in this metadata revision.

## What the conversion establishes

The conversion applies the source node’s inherited transform, then one shared rotation, translation and uniform scale into the recorded BodyParts3D coordinate frame. It reverses triangle winding for reflected source instances and writes coordinates to four decimal places. The fixed scale already includes the recorded source-to-target relation; adding another factor of ten or a second axis map would apply a change twice.

A fixed-input check reproduced the ordered coordinate tokens, triangle indices, counts, winding convention and bounds for all 54 stored files. Three equal-data baselines and eight deliberate mutations checked that the comparison could accept equality and detect the tested changes. [ACQUISITION-RECORD.json](ACQUISITION-RECORD.json) records the method, fixed transform and result; [SOURCES.json](SOURCES.json) pins the upstream files and notices.

That match establishes reproduction of this conversion. Registration accuracy, anatomical attachments, outward normals, surface quality and facial deformation or function have not been independently validated. Four decimal places are a file format choice, not measurement accuracy. The conversion uses the producer’s own FBX interpretation rather than an independently implemented decoder.

## Reading the model

Coordinates are labelled in millimetres in the BodyParts3D frame: +X is the subject’s left, +Y posterior and +Z superior. The fit places one atlas representation beside another; it is not a measured person or a population average. Physical frame calibration remains unvalidated.

The source uses mirrored instances for paired geometry. Action descriptions, `rig_hint`, `attachment_bone` and `bodymap_regions` retain the recorded illustration and game-rig hints. They do not establish validated soft-tissue insertions, muscle forces or neural mappings. The recorded fit residuals and bone-distance diagnostics are not held-out anatomical accuracy tests.

The packet is incomplete. Auricular muscles are missing from this export, and the selected packet excludes eye-moving, tongue and soft-palate structures. Some relevant skull bones were absent from the recorded bone checks. Alternative fits, rejected correspondences and their reported sensitivity remain in the conversion record. The upstream export also warns that its models may be out of date.

The embedded comments retain the original conversion notices. Matching their winding convention does not establish anatomically outward normals. Current whole-scene rendering, normal joint mechanics, timing, resource-enforcement and production checks remain incomplete.

## Credits and reuse

The mesh derivatives retain CC BY-SA 4.0. Keep the supplied credits, source and licence notices; identify changes; and share adapted mesh material under CC BY-SA 4.0. The exact source notices and licence text are in [ATTRIBUTION-AND-LICENCES.txt](ATTRIBUTION-AND-LICENCES.txt) and [LICENSES/](LICENSES/).

Project-owned game code keeps its separate CC0 terms, and Three.js keeps its MIT terms. Neither software licence changes these anatomy-asset terms. Other separately licensed atlas material is outside this selected packet; its terms must be checked before any different selection.

This revision changes explanatory metadata and documentation only. It preserves the recorded selection, fixed transform, numerical diagnostics and mesh hashes. The historical conversion records remain preserved separately.
