# Reach recordings and camera comparison

Rhesus macaque C guided a robot handle between targets in two workspaces. The game excerpts come from the September 14, 2017 recording, a week after the training session. The dataset was released by Raeed H. Chowdhury, Joshua I. Glaser and Lee E. Miller under CC0. [Dataset and licence](https://doi.org/10.5061/dryad.nk98sf7q7) · [Original area 2 study](https://doi.org/10.7554/eLife.48198)

The MATLAB member `C_20170914_TRT_TD.mat` has SHA-256 `4456c7bf8cda177f31c849e3fe794100269ca951c741c1718dd5c750d5432a76`. Trial numbers and time rows restart in each physical block. Within each block and workspace the excerpt rule takes the first eligible window and the first with an earlier eligible distinct original sequence in that workspace at the same cue ordinal. The following fixed trial identifiers allow the cases to be located without any player information.

| Block | Workspace | Trial | Go cue ordinal | Row k (1-based) |
| --- | --- | --- | --- | --- |
| 1 | 1 | 7 | 2 | 2592 |
| 1 | 1 | 9 | 2 | 3561 |
| 1 | 2 | 2 | 2 | 722 |
| 1 | 2 | 6 | 2 | 2088 |
| 2 | 1 | 1 | 2 | 576 |
| 2 | 1 | 4 | 2 | 1527 |
| 2 | 2 | 7 | 2 | 2639 |
| 2 | 2 | 8 | 2 | 3127 |

Each path contains 30 consecutive shoulder-relative Marker_1 positions in metres (X, Y, Z), rows k−20 to k+9, 10 ms apart. Row k falls five bins after the selected go cue. At ⅛ speed a 10 ms recording step lasts 80 ms. The 3D view centres the trajectory on its initial point. Text gives the original position relative to the shoulder in millimetres. The following ten bins, rows k+10 to k+19, each sum the spikes in every exported sort column at each of the 37 contacts with sort-zero coverage across the three training and test blocks. Counts describe area 2 in the selected macaque trial. The two study dates do not establish individual neuron identity.

Only the two-dimensional path is matched. A valid on-device arm pose yields the image-plane wrist offset from its own shoulder, using square pixels divided by video height. A frontal subject's outward displacement gives positive horizontal motion for each arm and upward gives positive vertical motion. Each candidate uses its recorded X and Y coordinates in source order as a comparison convention. These coordinate frames have no anatomical registration across species or cameras. Starting position, absolute scale and duration are removed. Rotation, temporal reversal and direction are retained. The score is the square root of the mean squared Euclidean separation at 30 equally spaced relative times. Finite ties within 1e−10 count equally. Depth is available only in the study replay. Camera tilt, movement toward the lens, perspective, clothing, landmark error and occlusion can all change the score. An eight-case nearest match supplies no estimate of identity, skill, intent or human neural activity.

Arm takes store frame times, game pose and visible wrist offsets in this page’s memory. The dialog reads the most recent finished take. **Try a recorded example** queries the catalogue with the first recorded path itself. Its zero distance demonstrates the matching rule.
