#!/usr/bin/env bash
# The final 3D deliverables in artifacts/realistic-3d/final/:
#   shots/            desktop hero, close and actuated for all seven, phone heroes (JPEG, half the device pixels)
#   contact-*.jpg     each instrument next to its reference photograph (only CC0 / public-domain
#                     references are put in committed sheets; see final/README.md)
# Needs a dev or preview server: BASE=http://localhost:5311 scripts/final-3d.sh
set -euo pipefail
cd "$(dirname "$0")/.."
BASE=${BASE:-http://localhost:5311}
OUT=artifacts/realistic-3d/final
RAW=$(mktemp -d)
mkdir -p "$OUT/shots"
run() { # retry once: a dev server can reload mid-run
  "$@" || "$@"
}
run env OUT="$RAW" BASE="$BASE" DSF=2 VIEWS=hero,close,act node scripts/review-3d.mjs
run env OUT="$RAW" BASE="$BASE" DSF=2 VIEWS=detail,scroll ONLY=cello node scripts/review-3d.mjs
run env OUT="$RAW" BASE="$BASE" PHONE=1 VIEWS=hero ONLY=grand,cello,violin,trumpet node scripts/review-3d.mjs
python3 scripts/contact-sheet.py "$RAW" "$OUT/contact-bowed.jpg" --only violin,viola,cello --views hero,close --free
python3 scripts/contact-sheet.py "$RAW" "$OUT/contact-pianos.jpg" --only grand,upright --views hero,close,act --free
# flute and trumpet: their reference photographs are CC BY-SA (credited in final/README.md; the
# sheet is CC BY-SA 4.0 in turn)
python3 scripts/contact-sheet.py "$RAW" "$OUT/contact-winds.jpg" --only flute,trumpet --views hero,close,act --free --bysa
cp "$RAW"/*.png "$OUT/shots/"
python3 scripts/shots-compress.py "$OUT/shots" > /dev/null
ls "$OUT" "$OUT/shots"
