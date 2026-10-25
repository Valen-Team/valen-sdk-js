#!/usr/bin/env bash
set -euo pipefail
sdk_root="$(cd "$(dirname "$0")/../.." && pwd)"
: "${PILLOW_SOURCE:?Set PILLOW_SOURCE to the Pillow source directory}"
python3 "$sdk_root/native/pillow/extract_nearest.py" "$PILLOW_SOURCE" "$sdk_root/native/pillow/nearest.inc"
emcc -O3 --no-entry -I"$sdk_root/native/pillow/include" -I"$PILLOW_SOURCE/src/libImaging" \
 "$sdk_root/native/pillow/adapter.c" "$PILLOW_SOURCE/src/libImaging/Resample.c" \
 -sSTANDALONE_WASM=1 -sALLOW_MEMORY_GROWTH=1 -sMALLOC=emmalloc \
 -sEXPORTED_FUNCTIONS='["_pillow_resize","_malloc","_free"]' \
 -o "$sdk_root/src/wasm/pillow_resize.wasm"
cp "$PILLOW_SOURCE/LICENSE" "$sdk_root/native/pillow/PILLOW-LICENSE.txt"
