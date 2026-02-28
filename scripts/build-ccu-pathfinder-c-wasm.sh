#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/public/wasm"
C_MAIN="$ROOT_DIR/wasm/ccu_pathfinder_c/main.c"

if ! command -v emcc >/dev/null 2>&1; then
  echo "emcc is required to build the C WASM pathfinder." >&2
  echo "Install Emscripten from https://emscripten.org/docs/getting_started/downloads.html" >&2
  exit 1
fi

# Some environments place emscripten cache under a non-writable location.
if [[ -z "${EM_CACHE:-}" ]]; then
  export EM_CACHE="${TMPDIR:-/tmp}/emscripten-cache"
fi
mkdir -p "$EM_CACHE"

mkdir -p "$OUT_DIR"

emcc "$C_MAIN" \
  -O3 \
  -s WASM=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=0 \
  -s ENVIRONMENT=web \
  -s EXPORT_NAME=createCcuPathfinderCModule \
  -s EXPORTED_FUNCTIONS='["_ccuReset","_ccuSetConfig","_ccuAddNode","_ccuAddEdge","_ccuAddStart","_ccuFindAllPathsC","_ccuFreeCString"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","UTF8ToString"]' \
  -o "$OUT_DIR/ccu-pathfinder-c.js"

echo "C WASM artifacts written to $OUT_DIR"
