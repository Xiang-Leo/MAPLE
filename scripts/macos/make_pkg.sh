#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

APP_PATH="dist/MAPLE.app"
OUT_PKG="dist/MAPLE.pkg"

if [[ ! -d "$APP_PATH" ]]; then
  echo "ERROR: $APP_PATH not found. Run scripts/macos/build_app.sh first."
  exit 1
fi

rm -f "$OUT_PKG"

# Install MAPLE.app into /Applications
pkgbuild --install-location "/Applications" --component "$APP_PATH" "$OUT_PKG"

echo ""
echo "Created: $OUT_PKG"
