# Where will the rat be next?

A camera followed one male Long–Evans rat, JS14, while electrodes recorded spikes from two brain regions. Justin Shin and Shantanu Jadhav released these data in *Single Day W-Track Learning* (2024), DANDI version 0.240511.0307. The source file is session 01. The forecasts use its third running period (epoch ID 5). The separate frame-by-frame guide uses trip 0 from an earlier period. [Versioned dataset](https://doi.org/10.48324/dandi.000978/0.240511.0307) · [Archive asset](https://api.dandiarchive.org/api/assets/4b7c7959-04b3-4817-8f96-1af6f41888c1/) · [Earlier trip in the Interoceptomics guide](https://github.com/eliminatenoise/Interoceptomics/blob/deae82caa73858466269392f10dc31f9d2fbd763/docs/stages/recording/MAZE-NOTICE.md)

The measurements, counts, example inputs, fitted weights and data-derived forecasts retain Creative Commons Attribution 4.0 International. Keep the author and dataset credit, the versioned DOI and the licence link, and state what you changed. The project dedicates the original viewer code and explanatory text to the public domain under CC0 1.0. [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) · [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)

The NeuroSurge game embeds the Interoceptomics inspector with the same recording, fitted values, forecast calculations and plots. The game adds a tab, a source disclosure and a colour theme. [Original inspector at the selected revision](https://github.com/eliminatenoise/Interoceptomics/blob/deae82caa73858466269392f10dc31f9d2fbd763/docs/stages/recording/wtrack/view.js)

## How the examples were chosen

The forecasters learned from 201 usable windows in 24 whole training trips, IDs 55–78. The viewer takes the first eligible window in each of the first three eligible trips, in time order. Eligibility follows the study’s camera timing and validity rules. Neither forecast error nor firing activity enters the choice. The target is the first camera position at or after the requested time, within 50 ms of that time. Measurements originate in the archive’s tracking pipeline, whose processing delay is unknown. Times below are rounded for display. The packet retains the source numbers. [Data and model packet](packet.json)

| Training trip | Input cutoff (s) | Later camera row | Later sample (s) |
| --- | ---: | ---: | ---: |
| 55 | 5972.043333 | 144537 | 5972.312767 |
| 56 | 5998.033200 | 145270 | 5998.283233 |
| 57 | 6014.872733 | 145747 | 6015.122900 |

The pale map points come from the remaining 21 training trips, IDs 58–78. Within each occupied 2 cm by 2 cm square we plot the first measured position. This gives 1,081 points. It shows where the rat travelled in the track plane. The archive gives no wall outlines in these files. Both axes use centimetres in the archive’s centre-well reference frame. The map and the measured outcome are excluded from prediction.

## What goes into a forecast?

The model asks where the rat will be 250 milliseconds after the cutoff. To predict it, the browser takes the last camera frame at or before each of five nominal times, spaced a quarter-second apart. From each consecutive pair it calculates velocity from the change in X and Y and the actual elapsed seconds. This yields four rows, each containing the later position, velocity and the age of the later frame at its nominal query time. Each fit also uses the elapsed trip and running-period clocks, 16 spatial terms based on the last known position, and their products with the last velocity components.

The positions-plus-spikes model adds the square roots of four counts for each of 72 units in the archive’s original order. Each quarter-second bin excludes its left edge and includes its right edge. The recording associates 41 units with prefrontal cortex (PFC) and 31 with hippocampal CA1. Thirteen unit IDs had zero archived events across the 34 extracted training and test trips. The source supplies no per-unit observation intervals. The count at zero cannot distinguish silence, a missed spike or an unavailable unit.

For both models the browser subtracts the training feature means and divides by their training standard deviations. It multiplies by the fitted ridge coefficients, adds the fitted displacement mean, then adds the last observed X/Y position. Separate X and Y outputs give the forecast endpoint. The later camera time and position enter the comparison only when the visitor reveals the reading. The page loads local files once and predicts on the device. [Browser calculation](ridge.js)

Across 123 forecasts from nine later trips of this same rat in this same running period, the positions-only ridge model had a mean endpoint error of 2.010 cm, and the positions-plus-spikes model had a mean of 2.237 cm. Each trip counted equally. The study’s prespecified test for improvement from the spikes failed. The three training examples illustrate the calculation. They cannot provide a separate estimate of performance. [Study, scores, fitted weights and source files](https://github.com/eliminatenoise/NeuroTranslation/tree/0f3b3ab02e812a3f242c139c682fde57caa0df5e/benchmarks/wtrack-neural-motion)

## Rebuild the packet

The original asset is `4b7c7959-04b3-4817-8f96-1af6f41888c1`. It stores X, Y and timestamps under `/processing/behavior/Position/SpatialSeries`, trial boundaries in `/intervals/trials`, and sorted spikes in `/units`. The unit’s electrode lookup and the referenced electrode group agree on each region. The dataset asset’s published SHA-256 is `6b8cf8ce3bbe34374e10a8a310592d1ae9762b20554569bc3c45fcfecdcf67b6`. The source extraction verified the selected byte ranges. [Source archive metadata](https://api.dandiarchive.org/api/assets/4b7c7959-04b3-4817-8f96-1af6f41888c1/)

Download the linked rebuild script beside the packet. Download the linked study, including its `recording/` and `fitted/` directories. With Python and NumPy installed, run the command below from the directory containing this notice. Replace `/path/to/study` with that study’s directory. It reads the training files, verifies the data and weights, and compares the reconstructed packet with the shipped file. It also runs the original Python prediction function. Use `--oracle reference.json` to save its six forecast pairs. [Rebuild script](https://github.com/eliminatenoise/Interoceptomics/blob/deae82caa73858466269392f10dc31f9d2fbd763/docs/stages/recording/wtrack/build_packet.py)

```sh
python build_packet.py /path/to/study/recording /path/to/study
```

| Item | SHA-256 |
| --- | --- |
| Source manifest | `51ccfcad7973ed6978abd322861f775b1f46ab52401804153195fb8bb672dffc` |
| Frozen model protocol | `0b5f0a4b59fea1869af9d3fe5c8834ff0eed4e55b0c76b5b463821d8b1c28997` |
| Positions-only ridge weights | `2dceeb605b5182ea118d7aa581af2422b012d957875a270e5bc7645e67c58f3a` |
| Positions-plus-spikes ridge weights | `4b60a4137aa9591da67af6c5a22aa894a773023b1ebc2c3f4c7831f0da6c90b4` |
| Shipped browser packet | `6a683b82dea7260977c3464f7468943d21915633daf4ec81c7ee1a9926965d21` |

To integrate this inspector elsewhere in the guide, load its stylesheet and call the exported `mountWTrack(container)` once on a container with a unique HTML ID. The view uses only these local files and the adjacent `read-packet.js` integrity helper. The prediction function can also be imported on its own. [Mountable inspector](view.js)
