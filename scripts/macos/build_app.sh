#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

# Keep PyInstaller cache inside the repo to avoid permission issues on macOS
# (and to make builds reproducible in restricted environments).
export PYINSTALLER_CONFIG_DIR="$ROOT_DIR/.pyinstaller"
mkdir -p "$PYINSTALLER_CONFIG_DIR"

python -m PyInstaller maple-macos.spec --noconfirm

echo ""
echo "Built: dist/MAPLE.app"
