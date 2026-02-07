#!/bin/sh
set -e

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

python3 "$SCRIPT_DIR/build_sprites.py" \
  --config "$SCRIPT_DIR/spritesgg.local.config.json" \
  --rebuild-all \
  --precheck \
  --stitch append \
  "$@"
