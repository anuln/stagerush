#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROLLBACK_ID="${1:-}"

if [[ -z "$ROLLBACK_ID" ]]; then
  if [[ -f "$ROOT_DIR/.rollback/ui-overhaul-last-id.txt" ]]; then
    ROLLBACK_ID="$(cat "$ROOT_DIR/.rollback/ui-overhaul-last-id.txt")"
  else
    echo "No rollback id provided and no latest snapshot found." >&2
    exit 1
  fi
fi

SNAPSHOT_DIR="$ROOT_DIR/.rollback/$ROLLBACK_ID"
MANIFEST_PATH="$SNAPSHOT_DIR/manifest.txt"

if [[ ! -f "$MANIFEST_PATH" ]]; then
  echo "Snapshot manifest not found: $MANIFEST_PATH" >&2
  exit 1
fi

while IFS= read -r file; do
  src="$SNAPSHOT_DIR/$file"
  dst="$ROOT_DIR/$file"
  if [[ -f "$src" ]]; then
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    echo "Restored $file"
  fi
done < "$MANIFEST_PATH"

echo "Rollback complete using snapshot: $ROLLBACK_ID"
