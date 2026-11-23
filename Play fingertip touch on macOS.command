#!/bin/sh
set -eu
cd -P -- "$(dirname -- "$0")"
exec /bin/sh "./Play movement mirror on macOS.command" --touch "$@"
