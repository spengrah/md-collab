#!/usr/bin/env bash
set -euo pipefail

# Rebuild + package + (optionally) reinstall md-collab VS Code extension.
# Run from anywhere; script resolves its own directory.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

PACKAGE_JSON="$EXT_DIR/package.json"
if [[ ! -f "$PACKAGE_JSON" ]]; then
  echo "ERROR: package.json not found at $PACKAGE_JSON" >&2
  exit 1
fi

PUBLISHER="$(node -p "require('$PACKAGE_JSON').publisher")"
NAME="$(node -p "require('$PACKAGE_JSON').name")"
VERSION="$(node -p "require('$PACKAGE_JSON').version")"
EXT_ID="${PUBLISHER}.${NAME}"
VSIX_FILE="${NAME}-${VERSION}.vsix"

DO_REINSTALL=false
if [[ "${1:-}" == "--reinstall" ]]; then
  DO_REINSTALL=true
fi

echo "==> Building + packaging ${EXT_ID} v${VERSION}"
cd "$EXT_DIR"

npm install
npm run compile
npx @vscode/vsce package --allow-missing-repository

echo "==> Packaged: $EXT_DIR/$VSIX_FILE"

if [[ "$DO_REINSTALL" == true ]]; then
  if ! command -v code >/dev/null 2>&1; then
    echo "WARN: 'code' CLI not found; skipping reinstall step."
    echo "      Install manually from VSIX: $EXT_DIR/$VSIX_FILE"
    exit 0
  fi

  echo "==> Reinstalling via code CLI"
  # Uninstall may fail if not currently installed; don't stop on that.
  code --uninstall-extension "$EXT_ID" || true
  code --install-extension "$EXT_DIR/$VSIX_FILE" --force

  echo "==> Done. If needed, run: Developer: Reload Window"
else
  echo "==> Skipping reinstall (pass --reinstall to do it automatically)."
fi
