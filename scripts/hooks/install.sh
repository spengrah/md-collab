#!/bin/bash
# Install git hooks by creating symlinks from .git/hooks to scripts/hooks

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

HOOKS_DIR=".git/hooks"
HOOKS_SOURCE="scripts/hooks"

if [[ ! -d ".git" ]]; then
  echo "Error: Not a git repository" >&2
  exit 1
fi

mkdir -p "$HOOKS_DIR"

# Install pre-push hook
if [[ -L "$HOOKS_DIR/pre-push" ]]; then
  echo "pre-push hook symlink already exists"
elif [[ -f "$HOOKS_DIR/pre-push" ]]; then
  echo "Warning: $HOOKS_DIR/pre-push exists and is not a symlink"
  echo "Backing up to pre-push.backup"
  mv "$HOOKS_DIR/pre-push" "$HOOKS_DIR/pre-push.backup"
  ln -s "../../$HOOKS_SOURCE/pre-push" "$HOOKS_DIR/pre-push"
  echo "Installed pre-push hook"
else
  ln -s "../../$HOOKS_SOURCE/pre-push" "$HOOKS_DIR/pre-push"
  echo "Installed pre-push hook"
fi

echo "Git hooks installed successfully"
