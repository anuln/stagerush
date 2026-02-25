#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SNAPSHOT_ID="ui-overhaul-$(date +%Y%m%d-%H%M%S)"
SNAPSHOT_DIR="$ROOT_DIR/.rollback/$SNAPSHOT_ID"
MANIFEST_PATH="$SNAPSHOT_DIR/manifest.txt"

mkdir -p "$SNAPSHOT_DIR"

FILES=(
  "src/styles.css"
  "src/ui/ScreenOverlayController.ts"
  "src/ui/ScreenViewModels.ts"
  "src/rendering/HudRenderer.ts"
  "src/rendering/DeliveryFeedbackRenderer.ts"
  "src/rendering/ComboFeedbackRenderer.ts"
  "src/rendering/HazardOverlayRenderer.ts"
  "src/audio/AudioManager.ts"
  "src/game/GameRuntime.ts"
  "src/ui/AdminPanel.ts"
  "src/main.ts"
  "src/config/FestivalConfig.ts"
  "src/maps/MapLoader.ts"
  "public/assets/maps/govball/config.json"
  "public/assets/admin/sprite_catalog.json"
  "public/assets/admin/audio_catalog.json"
  "package.json"
  "index.html"
)

for file in "${FILES[@]}"; do
  src="$ROOT_DIR/$file"
  if [[ -f "$src" ]]; then
    dst="$SNAPSHOT_DIR/$file"
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    echo "$file" >> "$MANIFEST_PATH"
  fi
done

cp "$MANIFEST_PATH" "$ROOT_DIR/.rollback/ui-overhaul-last-manifest.txt"
printf '%s\n' "$SNAPSHOT_ID" > "$ROOT_DIR/.rollback/ui-overhaul-last-id.txt"

echo "Created rollback snapshot: $SNAPSHOT_ID"
echo "Manifest: $MANIFEST_PATH"
