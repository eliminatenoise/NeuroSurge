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
        from archive_features import decode_edf

        eeg, angle, valid, markers, pin = read_block(archive, block_number=1)
        cue = int(markers[1][0])
        end = int(markers[2][0])
        first, last = cue - 256, min(cue + 1280, end)
        window = slice(first, last + 1)
        if first < markers[0][0] or last < cue + 1024 or not valid[window].all():
            raise ValueError("Clip coverage or encoder validity changed.")
        with zipfile.ZipFile(archive) as recording:
            signal, _ = decode_edf(recording.read(STEM))
        # Both electrodes belong to the same right forearm. Widen before subtraction.
        emg = signal[window, 12].astype("int32") - signal[window, 13].astype("int32")
        packet = work / "packet.json"
        subprocess.run([sys.executable, "-B", str(work / "convert.py"), "make-archive",
                        "--archive", str(archive), "--block", "1", "--trial", "1",
                        "--output", str(packet)], check=True)
        record = {
            "format": "neurosurge-wrist-replay-v1", "subject": "sub-41", "run": "03", "trial": 1,
            "task": "right wrist visual pointing", "sourceDoi": "10.6084/m9.figshare.29666735.v3",
            "sourceFileId": 62570998, "archiveSha256": ARCHIVE, "members": pin,
            "sourceSampleRateHz": 512, "encoderUpdateRateHz": 100,
            "cueSourceRow": cue, "firstSourceRow": first, "lastSourceRow": last,
            "cueChannel": "TrialInitMovStam", "targetCodeAtCue": int(signal[cue, 19]),
            "series": {
                "scalpC3_uV": eeg[window, 0].astype(int).tolist(),
                "forearmM3LminusM3R_uV": emg.tolist(),
                "wristExtension_deg": angle[window, 0].tolist(),
                "wristRadialDeviation_deg": angle[window, 1].tolist()
            },
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
