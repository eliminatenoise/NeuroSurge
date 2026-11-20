"""Build the one attributed development clip from the public example and its frozen converter."""
import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ARCHIVE = "764e3105193dda5d0694897de3342805d12307be0ff33be4d86478ad3520f8c0"
CONVERTER = "bf8b00a520abf9df3bf7dc23dc30cec1a9e382ad1b7954566e154630606cc8e6"
PREFIX = "wrist-recorded-trial-converter-v1/"
FILES = ("archive_features.py", "archive_source.py", "convert.py", "features.py",
         "DEVELOPMENT-ARCHIVE-PINS.json", "wrist-recorded-development-sha256.txt", "SOURCE-PINS.json")
STEM = "sub-41/eeg/sub-41_task-WristPointingTask_run-03_eeg.edf"
CHANNELS = "sub-41/eeg/sub-41_task-WristPointingTask_channels.tsv"
POSITIONS = "sub-41/eeg/sub-41_electrodes.tsv"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def make(archive, converter, output):
    if sha(archive) != ARCHIVE or sha(converter) != CONVERTER:
        raise ValueError("This extractor supports only the published example and pinned converter.")
    with tempfile.TemporaryDirectory() as folder:
        work = Path(folder)
        with zipfile.ZipFile(converter) as release:
            for name in FILES:
                (work / name).write_bytes(release.read(PREFIX + name))
        sys.path.insert(0, folder)
        from archive_source import read_block
        from archive_features import EEG, EMG, decode_edf, read_dictionary

        _, angle, valid, markers, pin = read_block(archive, block_number=1)
        cue = int(markers[1][0])
        end = int(markers[2][0])
        first, last = cue - 256, min(cue + 1280, end)
        window = slice(first, last + 1)
        if first < markers[0][0] or last < cue + 1024 or not valid[window].all():
            raise ValueError("Clip coverage or encoder validity changed.")
        with zipfile.ZipFile(archive) as recording:
            signal, _ = decode_edf(recording.read(STEM))
            channels = read_dictionary(recording, CHANNELS)
            positions = read_dictionary(recording, POSITIONS)
            metadata_hashes = {name: hashlib.sha256(recording.read(name)).hexdigest()
                               for name in (CHANNELS, POSITIONS)}
        if [c["name"] for c in channels] != list(EEG + EMG) or any(c["status"] != "good" for c in channels):
            raise ValueError("Electrode identity or acquisition quality label changed.")
        if [c["name"] for c in positions] != [*EEG, "REF", "GND"] or any(
                c[k] != "n/a" for c in positions for k in ("x", "y", "z")):
            raise ValueError("The source montage no longer matches this schematic.")
        # A 1:1 EDF scale was validated by decode_edf. Widen before differencing.
        samples = signal[window, :16].astype("int32")
        series = {f"scalp{label}_uV": samples[:,i].tolist() for i,label in enumerate(EEG)}
        series.update({f"forearm{label}_uV": samples[:,i].tolist() for i,label in enumerate(EMG, 8)})
        for i in range(0, len(EMG), 2):
            left, right = EMG[i:i+2]
            series[f"forearm{left}minus{right}_uV"] = (samples[:,8+i] - samples[:,9+i]).tolist()
        series["wristExtension_deg"] = angle[window, 0].tolist()
        series["wristRadialDeviation_deg"] = angle[window, 1].tolist()
        packet = work / "packet.json"
        subprocess.run([sys.executable, "-B", str(work / "convert.py"), "make-archive",
                        "--archive", str(archive), "--block", "1", "--trial", "1",
                        "--output", str(packet)], check=True)
        record = {
            "format": "neurosurge-wrist-replay-v2", "subject": "sub-41", "run": "03", "trial": 1,
            "task": "right wrist visual pointing", "sourceDoi": "10.6084/m9.figshare.29666735.v3",
            "sourceFileId": 62570998, "archiveSha256": ARCHIVE, "members": pin,
            "sourceSampleRateHz": 512, "encoderUpdateRateHz": 100,
            "cueSourceRow": cue, "firstSourceRow": first, "lastSourceRow": last,
            "cueChannel": "TrialInitMovStam", "targetCodeAtCue": int(signal[cue, 19]),
            "montage": {"scalp": list(EEG), "rightForearm": list(EMG),
                        "participantCoordinates": None, "sourceMetadataSha256": metadata_hashes},
            "series": series,
            "forecastInput": json.loads(packet.read_bytes()),
        }
        output.write_text(json.dumps(record, separators=(",", ":"), allow_nan=False) + "\n")
        print(f"{last-first+1} source rows, cue at row {cue}, target code {record['targetCodeAtCue']}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("archive", type=Path)
    ap.add_argument("converter", type=Path)
    ap.add_argument("output", type=Path)
    args = ap.parse_args()
    make(args.archive, args.converter, args.output)
