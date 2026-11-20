# The right-wrist forecast

These three NeuroTranslate models predict where a person's right wrist will point a quarter-second after the last observation. The first reads earlier wrist angles. The second also reads electrical activity from the forearm muscles. The third takes both and adds scalp voltage. Every model returns two angles in degrees and its estimated variance for each angle in degrees squared. The first angle measures extension and the second measures radial deviation, a tilt towards the thumb. The horizon follows the recording clock. The models were fitted to six participants performing a wrist-pointing task. [Original models and study results](https://github.com/eliminatenoise/NeuroTranslation/tree/117ffa001fb10086854ae4ec4d365c7c2121786f/benchmarks/paired-wrist-forecast)

## Load one fit

Serve the folder through the game's local HTTP server on localhost or an HTTPS static site. The first call for a mode reads its 82,208-byte weight file and checks its SHA-256 digest. Subsequent calls reuse the same fit. The caller can pass a different history to each prediction. Inference runs in the browser.

```js
import {loadPairedPredictor} from './predictor.mjs';

const model = await loadPairedPredictor('motion'); // 'motion', 'emg' or 'full'
const {angle_deg, variance_deg2} = model.predict(payload);
```

Supply `anchor_deg` (two angles at the cutoff), `mean_angles_deg` (16 earlier bins × 2 axes) and `target_offset_after_cue_ticks` (384, 512, 640, 768, 896 or 1024 on the stored 512 Hz clock). For `emg` and `full`, supply `emg_rms_uv` (16 × 4 nonnegative forearm amplitudes). For `full`, also supply `eeg_mean_uv` (16 × 8 scalp voltages). The published protocol defines the bin edges, sources, channel order and units. [Input protocol](https://github.com/eliminatenoise/NeuroTranslation/blob/117ffa001fb10086854ae4ec4d365c7c2121786f/benchmarks/paired-wrist-forecast/REPRODUCE.md)

## Reproduce the export

Check out the linked NeuroTranslation revision. With NumPy installed, run the following command from this folder, substituting the path to the benchmark. The exporter checks the original source-file hashes. It stores all 81 tensors from each published fit as contiguous little-endian float32 values and copies the fitted training scales into the index. The format change preserves every parameter. The provenance file records the SHA-256 digests of the source files and browser weights. [Exporter](export_weights.py) · [Provenance](provenance.json)

```sh
python -B export_weights.py /path/to/NeuroTranslation/benchmarks/paired-wrist-forecast exported
```

## Sources and licences

Jorge German Perez Blanco and Javier Mauricio Anteliz Ortiz released the **EEG-EMG-WristMotion Dataset, version 3**, under CC BY 4.0. NeuroTranslation averaged encoder angles and scalp voltages, computed amplitudes from pairs of forearm electrodes, and fitted and tested the wrist forecasts. The fitted numerical parameters and scales retain that attribution and the source's CC BY 4.0 terms wherever applicable. This edition repacks the fitted parameters, ports the inference calculation to JavaScript and runs it on the supplied window. [Dataset](https://doi.org/10.6084/m9.figshare.29666735.v3) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) · [Original notice](UPSTREAM-NOTICE.md)

The project's original code, documentation and invented inputs are dedicated to CC0. The browser module has no third-party library dependency. NumPy and PyTorch retain their respective licences in the separate Python export and reference environments. [CC0 dedication](LICENSE) · [NumPy](https://numpy.org/) · [PyTorch](https://pytorch.org/)
