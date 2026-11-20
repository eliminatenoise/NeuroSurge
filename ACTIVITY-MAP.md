# Wrist recording and game pathways

Run `node serve-local.mjs`, follow its loopback address and press **M**. The map opens with the game paused. **Recorded wrist** plays one right-wrist pointing movement. **Game pathways** uses the current game's motor map and sends the chosen movement back through its ordinary avatar controller. Esc returns focus to the canvas. The code requests no camera, microphone or network account. C remains a separate opt-in right-shoulder and elbow control.

## What moved?

The participant pointed at a visual target by moving the right wrist in an exoskeleton. A visual go marker sets zero on the replay clock. “Bend the right wrist toward the palm” describes the observed movement in our words. The experiment supplies no spoken command or report of private intent. Wrist extension went from +2.63° at the go cue to −49.30° at +2.50 s. Radial deviation was −2.17° at both endpoints. This one recorded wrist task is relevant to the NeuroHandler dexterity research direction in Small Vision. Skill acquisition, transfer to a new body, and capture of arbitrary body parts remain open questions.

The four traces are scalp voltage at C3 in µV, the software difference between the M3L and M3R electrodes over the right flexor carpi radialis in µV, and wrist extension and radial deviation in degrees. EMG measures surface electrical activity, with possible contributions from nearby muscles. The device measures joint angle. Along the depicted motor and sensory pathways, spinal and peripheral nerve firing, muscle force and sensory feedback were unmeasured. Game regions, arrows, muscle assignments and avatar poses remain schematic or simulated. The recorded waveform never drives a body, device or biological tissue.

## Compare with the actual wrist-angle model

Inside the map, open **Compare a 250 ms forecast with the encoder**. Six targets span +0.75 to +2.00 s after the cue. Choosing a target moves the trace cursor there. The browser authenticates the trial features and runs the six existing temporal fits locally. Compare a last-angle hold, the three-seed mean from wrist history and cue time, and the mean from wrist history, cue time and scalp EEG. Each model takes only the published historical input window. Signed error is forecast minus the angle measured at the target. At +1.00 s the EEG-inclusive extension forecast is −26.08° and the encoder shows −16.14°, an error of −9.94°. The visualized surface EMG is outside this temporal model's input contract.

The six targets come from one development trial. On the existing three-person development comparison, motion and cue alone scored 4.053° two-axis RMSE, versus 4.523° with EEG added. Final held-out performance remains open. This replay does not assess clinical control, whole-body transfer, individual spinal pathways or the recovery of a person's intended words. [Published temporal benchmark](https://github.com/eliminatenoise/NeuroTranslation/tree/73c32c9816c72b27eaf7933a1686f0af1c8a54fc/benchmarks/wrist-pointing-temporal)

## Data and rights

Jorge German Perez Blanco and Javier Mauricio Anteliz Ortiz deposited *EEG-EMG-WristMotion Dataset*, version 3. This excerpt uses publicly available, de-identified sub-41, run 03, task block 1, trial 1, Figshare file 62570998. The data and derived input features in this game retain **CC BY 4.0**. The edits consist of selecting the interval and channels, subtracting M3R from M3L, decoding and signing the encoder coordinates in degrees, and serializing the data with the published forecast features. No text, illustrations or figures from the descriptor were reproduced. [Data and terms](https://doi.org/10.6084/m9.figshare.29666735.v3) · [Licence](https://creativecommons.org/licenses/by/4.0/) · [Primary study](https://doi.org/10.1038/s41597-026-07287-z)

The replay contains 1,537 consecutive stored rows at 512 Hz, original zero-based rows 2331 through 3867. The recorded `TrialInitMovStam` edge is at row 2587. Target code 1 is preserved. The two angles use the experiment’s 100 Hz encoder values held on that 512 Hz grid. Time alignment is at the stored row. Physical sensor and filter delay remain unverified. Sampled signals and stage labels are kept separate from simulated avatar actions. The game’s diagram follows the active region's corticospinal, corticobulbar or mixed route.

## Reproduce the clip

Download the [example recording](https://ndownloader.figshare.com/files/62570998) and the [existing converter](https://github.com/eliminatenoise/NeuroTranslation/raw/73c32c9816c72b27eaf7933a1686f0af1c8a54fc/benchmarks/wrist-pointing-temporal/WristMotion-Recorded-Trial-Converter.zip). Both ZIPs must remain intact. Use Python with NumPy 2 and run this command from the game checkout.

```sh
OPENBLAS_NUM_THREADS=1 python -B tools/extract-wrist-activity.py sub-41.zip WristMotion-Recorded-Trial-Converter.zip wrist-rebuild.json
```

The extractor checks both archives against their SHA-256 pins, the EDF and encoder member hashes, electrode identities and units, angle validity, shared-row parity and trial markers through the published converter. The verifier in the model checks its own trial commitment. The rebuilt JSON should have SHA-256 `e50331490f2f2f33208e89c9a5f2679f08349c1030b9e5d2424e6bce955db59d`. Rebuild or remove the local scratch copy before using distribution verification. The CC0 model script in `scene/src/activity/temporal-r1.js` is an unchanged copy of the published browser runner, SHA-256 `8d5d08586ee2979138c5b86ad504725bf73422baf3228fc26631958bb8c46aff`. The source data are never fitted in this replay. [Official model runner](https://github.com/eliminatenoise/NeuroTranslation/blob/73c32c9816c72b27eaf7933a1686f0af1c8a54fc/docs/wrist-replay/wrist-recorded.js)

## Game-lead handoff

Base commit `c35d7877f1e3aca996809c36f384a889f9bae571` is the existing action-chat/camera proposal in [NeuroSurge draft PR 2](https://github.com/eliminatenoise/NeuroSurge/pull/2). The present commit is local. The game lead can review the delta to that base and port the dialog hookup in `ns-app.mjs` and `preview.html` if either has moved. Opening either dialog uses the same shell pause, pointer release, unlocked resume and raw movement dispatch. The chooser covers the 48 effector entries in both motor strips, with 132 mapped actions across 45 entries. The left shoulder explains its existing W/A/S/D control, and the two tongue entries report the rig limitation. Choosing a mapped action can start an actual avatar movement. Returning without a movement preserves the existing pose. The release manifest and checksum list apply to the complete integrated worktree and need regeneration if anything else changes. Programme terminology uses registry revision 38, SHA-256 `aaa13b2301381eb8de8d548d08664cf24a66c594782822c4a3d2fb5d121b705d`; earlier embedded study provenance retains its original revision.

## Checks on this checkout

The normal Linux loopback launcher loaded the 3D game in Chromium. From a captured pointer, M paused the game and released the pointer. The trace cursor advanced, paused and moved to an exact sample from the keyboard. At +1.00 s, the browser produced the signed extension error shown above. Selecting a simulated left-knee flexion moved the drawn left knee from about −12° to −104° while the right knee held its angle. The narrow-screen overlay scrolled within its viewport. A missing clip showed an unavailable state while the game pathways remained playable. The test requested zero cameras and microphones.

Run `node serve-local.mjs --verify`, `node --test --test-concurrency=2 tests/*.test.mjs`, and `node tests/browser-activity-map.mjs` from the checkout. The browser test requires Playwright and Chromium and accepts `NS_PLAYWRIGHT_MODULE`, `NS_CHROMIUM` and `NS_ANGLE`. Local decoding used one process and a one-thread BLAS limit. The browser builds the four trace paths once and moves their cursors with its animation frame clock only while playing. The software-rendered Chromium check does not qualify a physical GPU, consumer hardware frame rate, macOS, Windows or a native camera. This preview makes no speedup claim.
