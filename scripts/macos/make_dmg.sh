#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

APP_PATH="dist/MAPLE.app"
OUT_DMG="dist/MAPLE.dmg"
STAGE_DIR="dist/dmg-stage"

if [[ ! -d "$APP_PATH" ]]; then
  echo "ERROR: $APP_PATH not found. Run scripts/macos/build_app.sh first."
  exit 1
fi

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

cp -R "$APP_PATH" "$STAGE_DIR/"
ln -s /Applications "$STAGE_DIR/Applications"

rm -f "$OUT_DMG"
hdiutil create -volname "MAPLE" -srcfolder "$STAGE_DIR" -ov -format UDZO "$OUT_DMG"

echo ""
echo "Created: $OUT_DMG"
