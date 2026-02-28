#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/public/wasm"
GO_MAIN="$ROOT_DIR/wasm/ccu_pathfinder/main.go"
GOROOT_DIR="$(go env GOROOT)"

mkdir -p "$OUT_DIR"

GO111MODULE=off GOOS=js GOARCH=wasm go build -trimpath -o "$OUT_DIR/ccu-pathfinder.wasm" "$GO_MAIN"
cp "$GOROOT_DIR/lib/wasm/wasm_exec.js" "$OUT_DIR/wasm_exec.js"

echo "WASM artifacts written to $OUT_DIR"
