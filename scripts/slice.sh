#!/bin/bash
# slice.sh — run OrcaSlicer headless via Xvfb
# Usage: slice.sh <input.3mf> <output_dir> [extra_orca_args...]

set -e

INPUT="$1"
OUTPUT_DIR="$2"
shift 2

# Find a free display number
DISP=99
while [ -f /tmp/.X${DISP}-lock ]; do
  DISP=$((DISP + 1))
done

Xvfb :${DISP} -screen 0 1024x768x24 -ac +extension GLX +render -noreset &
XVFB_PID=$!
export DISPLAY=:${DISP}

# Give Xvfb a moment to start
sleep 0.5

cleanup() {
  kill $XVFB_PID 2>/dev/null || true
}
trap cleanup EXIT

/usr/local/bin/orcaslicer-bin \
  --slice 0 \
  --export-3mf "${OUTPUT_DIR}" \
  "$@" \
  "${INPUT}"

EXIT_CODE=$?
cleanup
exit $EXIT_CODE
