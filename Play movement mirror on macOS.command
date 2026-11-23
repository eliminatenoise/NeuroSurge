#!/bin/sh
set -eu
cd -P -- "$(dirname -- "$0")"
exec "${NEUROTRANSLATE_PYTHON:-python3}" -B play-joint.py "$@"
