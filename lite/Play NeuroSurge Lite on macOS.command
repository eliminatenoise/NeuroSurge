#!/bin/sh
cd -P -- "$(dirname -- "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
    printf '%s\n' 'Install Node.js 18 or later, then open this launcher again.' >&2
    exit 1
fi
exec node launch.mjs "$@"
