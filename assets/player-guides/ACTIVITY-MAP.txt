# Movement recordings and game pathways

In the game, select **Recorded activity and forecasts** to open the recorded data and model examples. **Recorded wrist** plays a measured right-wrist movement. **Game pathways** sends the selected movement through the game’s avatar controller. Esc returns focus to play. Press **M** for the electrical map. Press **C** and select **Start camera** when you want to follow visible arms or knees.

## Rat brain activity

Open **Rat brain activity**. Choose a training trip and mark either forecast on the track. Reveal the next camera reading to see how far each prediction missed. Scroll the two coloured tables to inspect the spikes for each of 41 prefrontal and 31 hippocampal units over four quarter-seconds. The experiment recorded the rat’s location in the plane of the track. The human recordings elsewhere in the map come from separate experiments.

Each example shows one window used in fitting. Across nine later trips of this rat in the same run, the model using positions alone missed by 2.010 cm on average. Adding spikes increased the miss to 2.237 cm. Each trip counted equally. [Recording, study and data licence](scene/src/activity/wtrack/NOTICE.md)

## Find a recorded hand action

Press **F**, type “press the button” and choose **Find hand recording**. **Hand search** opens the same view. The models compare your words with five intervals from one printer task. Select a time to inspect the 26 tracked joints. Unknown words, tied ranks and missing hand measurements are shown explicitly. The timing comparison uses the description, duration, progress through the recording and tracking coverage; it does not use hand coordinates. Keeping typed searches separate from avatar movement lets you compare the guesses before deciding what to play. [Evidence and source data](https://github.com/eliminatenoise/NeuroTranslation/tree/fde458e21b4885e4bddd7614ed2c326374c87253/benchmarks/hand-language-retrieval)

## Forecast one second after an instruction

In **Hand search**, open **Forecast how far the wrist moves after an instruction**. Four earlier positions define a wrist path in centimetres. Choose the retained words and compare the fitted estimates with simply repeating the previous one-second displacement. The default examples are invented; you can enter your own positions. An optional later reading is used only when you choose to compare distances. The study’s held-out aggregate is available separately. [Open the small standalone calculator](https://eliminatenoise.github.io/NeuroTranslation/hand-search/forecast.html) · [Source and fitted models](https://github.com/eliminatenoise/NeuroTranslation/tree/d32fd9f57c706fb52ad11c6a10239166e5b25088/benchmarks/preceding-instructions)

## Watch a whole body move through the lab

Press **F**, type “hop on my left foot” and press Enter. Choose **Hop on the left foot** to inspect the lab’s marker paths. The search uses words in the three catalogue titles and descriptions. “Hop on my right foot” finds no recording. To browse every title, leave the box empty and choose **Find body recording**.

Open **Whole-body motion** in the recordings panel. Choose an arm lift (02_06), a forward jump (13_11) or a hop on the left foot (132_23). Press **Play movement**, or move the time slider one frame at a time with the arrow keys. **Turn** and **Tilt** rotate the view. You can also drag the picture. **Recenter view** restores the starting angle and the fixed lab camera.

The floor grid is half a metre across each square. Blue markers are on the person's left, amber markers on their right. Light grey marks the remaining locations. **Connect nearby markers** draws guides across the visible positions. **Follow the waist** moves the camera horizontally with a tracked waist marker, so you can follow the person across the room and still see how high they jump. Under **Read a marker’s position**, choose a marker to see its original lab X, Y and Z in millimetres. Its coordinates stay the same as you turn the view. Missing samples leave gaps. The horizontal camera holds its last position if its waist marker goes missing.

Each recording contains 41 named marker paths. The replay samples every fourth frame of the original 120 Hz capture, giving 30 displayed frames per second. The clock starts at the first displayed frame of each trial. Coordinates have been rounded to 0.1 mm. The archive includes processed positions, and the hop has a zero quality value at every selected source point. The hop file omits screen-axis labels. The head and heel heights indicate that Z points up. The file precision gives no estimate of tracking accuracy. The capture contains no simultaneous brain, nerve or muscle signals. The wrist recording belongs to a separate experiment. [CMU capture methods](http://mocap.cs.cmu.edu/info.php) · [Original recordings and data terms](http://mocap.cs.cmu.edu/faqs.php)

## Recorded wrist movement

The participant pointed at a visual target by moving the right wrist in an exoskeleton. A visual go marker sets zero on the replay clock. “Bend the right wrist toward the palm” describes the observed movement in our words. The experiment supplies no spoken command or report of private intent. Wrist extension went from +2.63° at the go cue to −49.30° at +2.50 s. Radial deviation was −2.17° at both endpoints. This one recorded wrist task is relevant to the NeuroHandler dexterity research direction in Small Vision. Skill acquisition, transfer to a new body, and capture of arbitrary body parts remain open questions.

## Follow the movement across sensors

At +1.00 s the wrist has flexed to −16.14° on the extension axis. At that same stored row, the eight scalp voltages range from +1 µV at C4 and CP4 to +19 µV at CP3. Each scalp dot carries its electrode name and signed voltage. Blue marks negative voltage, orange positive, and the shared scale spans −60 to +60 µV. The top view uses the names of standard 10–10 positions. The participant’s electrode-coordinate file has no measured x, y or z values. Blank spaces on the map therefore stay blank. The map shows sensor potentials relative to the right earlobe. AFz was the ground. [Recording methods and placement, Fig. 3](https://doi.org/10.1038/s41597-026-07287-z) · [ACNS electrode nomenclature](https://pubmed.ncbi.nlm.nih.gov/27482794/)

Choose **Scalp trace** to follow C3, C1, Cz, C2, C4, CP3, CPz or CP4 over time. **Forearm trace** offers both recorded contacts over each of four sites and the difference between them. M1 is extensor carpi radialis longus, M2 extensor carpi ulnaris, M3 flexor carpi radialis and M4 palmaris longus. L and R label two contacts on the same right forearm. The study describes monopolar acquisition with an elbow reference and computes bipolar EMG by subtracting a pair. We display L minus R. At +1.00 s the M1 contacts read +7 and +40 µV, giving −33 µV. Surface measurements can include nearby muscle activity. The placement names alone cannot identify a contraction or give its force. [Source montage and methods](https://doi.org/10.1038/s41597-026-07287-z) · [SENIAM electrode-placement recommendations](https://pubmed.ncbi.nlm.nih.gov/11018445/)

The wrist plot uses the same angular scale in both directions. Extension is positive to the right, radial deviation positive upward. The line covers the entire observed trajectory and a ring marks the selected instant. Across this clip radial deviation varies by about 0.02°, so the trace looks almost horizontal. The original encoder measured two joint angles. Hand position in space, a third rotation axis, individual joint force and participant-specific tracking error are unavailable here.

Along the depicted motor and sensory pathways, spinal and peripheral nerve firing, muscle force and sensory feedback were unmeasured. Game regions, arrows, muscle assignments and avatar poses remain schematic or simulated. The recorded waveform never drives a body, device or biological tissue.

## Compare with the actual wrist-angle model

Open **How far will the wrist move in a quarter of a second?** Choose any of six moments between 0.75 and 2 seconds after the go cue. The trace cursor moves to the chosen moment. Each model predicts two angles from the half-second of readings ending a quarter-second earlier. Extension measures bending the hand back. Radial deviation measures bending toward the thumb.

**Wrist transformer** runs three trained models on your device. The first uses the earlier wrist angles and cue timing. The second also receives muscle voltages recorded from the forearm. The third also receives scalp voltages. At +1.00 s the sensor read −16.14° extension and −2.17° radial deviation. Using all three signal sources, the model predicted −17.28° and −6.48°. This trial was excluded from training, scoring and signal substitution in the development study. It provides a way to inspect an individual forecast. [Model, training code and development results](https://github.com/eliminatenoise/NeuroTranslation/tree/117ffa001fb10086854ae4ec4d365c7c2121786f/benchmarks/paired-wrist-forecast)

**Earlier wrist model** averages three independently trained versions for each input choice. At +1.00 s, using wrist angles and scalp voltages, it predicted −26.08° extension, a signed error of −9.94°. Across three previously assessed people, the earlier wrist-only model scored 4.053° average error across both axes (root mean square). The new transformer scored 5.432° using wrist angles, 5.866° with forearm recordings added, and 5.822° with scalp recordings as well. Smaller is better. Performance on the six people reserved for a later test remains unknown. [Earlier benchmark](https://github.com/eliminatenoise/NeuroTranslation/tree/73c32c9816c72b27eaf7933a1686f0af1c8a54fc/benchmarks/wrist-pointing-temporal)

## Data and rights

Jorge German Perez Blanco and Javier Mauricio Anteliz Ortiz deposited *EEG-EMG-WristMotion Dataset*, version 3. This excerpt uses publicly available, de-identified sub-41, run 03, task block 1, trial 1, Figshare file 62570998. The data and derived input features in this game retain **CC BY 4.0**. The edits consist of selecting the interval and channels, subtracting each same-site forearm contact pair, decoding and signing the encoder coordinates in degrees, and serializing the data with the published forecast features. No text, illustrations or figures from the descriptor were reproduced. [Data and terms](https://doi.org/10.6084/m9.figshare.29666735.v3) · [Licence](https://creativecommons.org/licenses/by/4.0/) · [Primary study](https://doi.org/10.1038/s41597-026-07287-z)

The replay contains 1,537 consecutive stored rows at 512 Hz, original zero-based rows 2331 through 3867. The recorded `TrialInitMovStam` edge is at row 2587. Target code 1 is preserved. The two angles use the experiment’s 100 Hz encoder values held on that 512 Hz grid. Time alignment is at the stored row. EDF physical and digital limits for the 16 bioelectric channels both run from −32768 to +32767, giving one stored count per µV with zero offset. The recording hardware applied a 0.1–200 Hz band-pass and a 58–62 Hz notch. All 16 channel entries have the depositor’s “good” status. No additional smoothing, baseline subtraction, interpolation or artifact rejection was applied for this replay. Residual motion, muscle and electrical noise remain possible. The trials provide no measured noise floor here. The source converter maps each unsigned encoder count to radians by multiplying by 25/65535 and subtracting 12.5, then converts to degrees and reverses the sign of the second axis. The two encoder columns match the same-row auxiliary EDF coordinates. Physical sensor and filter delay remain unverified. Sampled signals and stage labels are kept separate from simulated avatar actions. The game’s diagram follows the active region's corticospinal, corticobulbar or mixed route.

## Reproduce the clip

Download the [example recording](https://ndownloader.figshare.com/files/62570998) and the [existing converter](https://github.com/eliminatenoise/NeuroTranslation/raw/73c32c9816c72b27eaf7933a1686f0af1c8a54fc/benchmarks/wrist-pointing-temporal/WristMotion-Recorded-Trial-Converter.zip). Both ZIPs must remain intact. Use Python with NumPy 2 and run this command from the game checkout.

```sh
OPENBLAS_NUM_THREADS=1 python -B tools/extract-wrist-activity.py sub-41.zip WristMotion-Recorded-Trial-Converter.zip wrist-rebuild.json
```

The extractor checks both archives against their SHA-256 pins, the EDF and encoder member hashes, electrode identities and units, angle validity, shared-row parity and trial markers through the published converter. The verifier in the model checks its own trial commitment. The rebuilt JSON should have SHA-256 `578184a108d7682c37a4f409ce4cd7535b33d203007f39ca0f5d28831ffde41f`. Rebuild or remove the local scratch copy before using distribution verification. The CC0 model script in `scene/src/activity/temporal-r1.js` is an unchanged copy of the published browser runner, SHA-256 `8d5d08586ee2979138c5b86ad504725bf73422baf3228fc26631958bb8c46aff`. The source data are never fitted in this replay. [Official model runner](https://github.com/eliminatenoise/NeuroTranslation/blob/73c32c9816c72b27eaf7933a1686f0af1c8a54fc/docs/wrist-replay/wrist-recorded.js)

## Checks on this checkout

The normal Linux loopback launcher loaded the 3D game in Chromium. From a captured pointer, M paused the game and released the pointer. The trace cursor advanced, paused and moved to an exact sample from the keyboard. Selecting CP3, M1R and the M4 pair exposed their correct recorded voltages at the forecast cursor. The four pair differences passed sample-for-sample comparison with the raw contacts. A separate direct EDF read matched all 24,592 stored bioelectric samples and both encoder axes. The previous four traces and frozen forecast packet were identical to the preceding edition. At +1.00 s, the browser produced the signed extension error shown above. Selecting left-knee flexion moved the drawn left knee while the right knee held its angle. The narrow-screen overlay scrolled within its viewport. A missing clip showed an unavailable state while the game pathways remained playable. The test requested zero cameras and microphones.

Run `node serve-local.mjs --verify`, `node --test --test-concurrency=2 tests/*.test.mjs`, and `node tests/browser-activity-map.mjs` from the checkout. The browser test requires Playwright and Chromium and accepts `NS_PLAYWRIGHT_MODULE`, `NS_CHROMIUM` and `NS_ANGLE`. Local decoding used one process and a one-thread BLAS limit. The browser builds each selected trace when the choice changes. During playback its animation-frame clock moves the cursors and updates the sensor values and wrist ring. The software-rendered Chromium check does not qualify a physical GPU, consumer hardware frame rate, macOS, Windows or a native camera. This preview makes no speedup claim.

The integrated browser test compares all 18 transformer forecasts (six target times and three models) with the rounded Python predictions. A separate numerical check uses the unrounded angles, estimated variances and historical inputs. Corrupting a model file leaves the recording and the earlier model available. After the original file becomes available again, reselecting the transformer restores its forecasts.

## Human finger cues

**Recorded cortex** compares the power recorded on the surface of one participant’s left cortex during a finger cue and its following blank. Choose a finger or pool all 88 trials, then compare the two bands across six sampled areas. The checked range shows the middle half of individual trial values in dB. F also opens this view with “show recorded brain activity”. The game’s own motor strip remains a schematic of the simulated body.

The reader carries the regional summaries locally and opens the full [3D recording map](https://eliminatenoise.github.io/Interoceptomics/recorded-cortex/) on request. See **How the comparison was made** in the reader for the analysis, licence and ethics statement.

## Compare a usual walk with a fast walk

Choose **Walking instructions**. Toggle between “as usual” and “fast but not running” to see how the selected instruction changes each forecast for the same marker history. The table also gives the separately trained model's forecast without the instruction. In **F**, “forecast my usual walk” and “forecast fast walking without running” open the respective choices. [Measurement and source](scene/src/activity/walking-instruction/SOURCES.md)

Choose **Visual balance** to predict head and sacrum marker travel 125 ms after the observation ends. The controls change a visual rotation, prior head travel and scalp voltage amplitude in an invented walking event. The two forecasts use separately fitted models. [Source and model details](scene/src/activity/visual-balance/SOURCES.md)

Choose **Muscle and movement** to forecast eight lower-leg voltages (RMS, µV) and a sacrum path over the next 125 ms. You can switch posture and visual rotation, or scale the invented voltage history. [Experiment and model](scene/src/activity/muscle-motion/SOURCES.md)

## Wrist and pelvis

Choose **Wrist and pelvis**, or enter **forecast my wrist lift** or **forecast my pelvis path** in F. Both fitted models run locally on the same invented event. Each shows the available muscle amplitudes and all 32 predicted marker displacements across the next 125 ms. [Experiments, units and model comparison](scene/src/activity/cross-limb/SOURCES.md)
