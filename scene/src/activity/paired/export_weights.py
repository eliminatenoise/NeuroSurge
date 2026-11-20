"""Pack the three original numeric state dictionaries, without fitting a model."""
import argparse
import hashlib
import json
from pathlib import Path
from shutil import copyfile

import numpy as np

COMMIT = "117ffa001fb10086854ae4ec4d365c7c2121786f"
MANIFEST = "ad99f03d12db630792bc83e3934481230e837cee393694c6edf768a4c025a954"
MODES = ("motion", "emg", "full")
SOURCE_FILES = ("predict.py", "study_model.py", "broader_learner.py", "aligned_forecast.py",
                "model-sources.json", "protocol.json", "normalizers.json", "LICENSE", "NOTICE.md",
                *(f"weights/{mode}.npz" for mode in MODES))


def digest(blob):
    return hashlib.sha256(blob).hexdigest()


def verified_inputs(folder):
    raw = (folder / "SHA256SUMS").read_bytes()
    if digest(raw) != MANIFEST:
        raise ValueError("Study source manifest differs from the pinned release")
    pins = dict(reversed(line.split("  ", 1)) for line in raw.decode().splitlines())
    for name in SOURCE_FILES:
        if digest((folder / name).read_bytes()) != pins[name]:
            raise ValueError(f"Source hash mismatch for {name}")
    return {name: pins[name] for name in SOURCE_FILES}


def export(source, out):
    inputs = verified_inputs(source)
    (out / "weights").mkdir(parents=True, exist_ok=True)
    hashes = {}
    layout = None
    for mode in MODES:
        packed = bytearray()
        current = {}
        with np.load(source / "weights" / f"{mode}.npz", allow_pickle=False) as archive:
            for name in sorted(archive.files):
                tensor = archive[name]
                if tensor.dtype != np.dtype("<f4") or not np.isfinite(tensor).all():
                    raise ValueError(f"Unsupported tensor at {mode}/{name}")
                current[name] = [len(packed) // 4, *tensor.shape]
                packed.extend(tensor.astype("<f4", copy=False).tobytes(order="C"))
        if len(current) != 81 or (layout is not None and layout != current):
            raise ValueError("Unexpected tensor layout in frozen weights")
        layout = current
        (out / "weights" / f"{mode}.bin").write_bytes(packed)
        hashes[mode] = digest(packed)

    norm = json.loads((source / "normalizers.json").read_text())
    js = "// Generated from the pinned study by export_weights.py. Offsets count float32 elements.\n"
    for key, obj in (("layout", layout), ("weightHashes", hashes), ("normalizers", norm)):
        js += f"export const {key} = " + json.dumps(obj, sort_keys=True, indent=2) + ";\n"
    (out / "tensors.mjs").write_text(js, encoding="utf-8")
    manifest = {"upstream_git_commit": COMMIT, "release_manifest_sha256": MANIFEST,
                "upstream_sha256": inputs, "browser_weight_sha256": hashes,
                "browser_format": "All 81 original tensors per mode, key-sorted, contiguous little-endian IEEE float32",
                "bytes_per_mode": len(packed), "tensor_index_and_normalizers_sha256": digest(js.encode())}
    (out / "provenance.json").write_text(json.dumps(manifest, sort_keys=True, indent=2) + "\n")
    copyfile(source / "LICENSE", out / "LICENSE")
    copyfile(source / "NOTICE.md", out / "UPSTREAM-NOTICE.md")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("study", type=Path, help="Root of the pinned paired-wrist-forecast benchmark")
    parser.add_argument("destination", type=Path, help="Output folder for numerical assets")
    args = parser.parse_args()
    export(args.study, args.destination)
