#!/usr/bin/env bash
# Build a Chrome Web Store-ready zip of the extension.
# Only ships the runtime files — no .git, no dev tooling, no icon source.

set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(grep -E '"version"' manifest.json | head -1 | sed -E 's/.*"version": *"([^"]+)".*/\1/')
OUT="dist/woolies-protein-tags-${VERSION}.zip"

mkdir -p dist
rm -f "$OUT"

zip -qr "$OUT" \
  manifest.json \
  content.js \
  inject.js \
  styles.css \
  icons/

echo "Built $OUT"
ls -lh "$OUT"
