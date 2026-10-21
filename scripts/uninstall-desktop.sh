#!/usr/bin/env bash
set -euo pipefail
DESKTOP="$HOME/.local/share/applications/deskdsh.desktop"
# Also remove the old Snap/IDE-private installation if it exists.
LEGACY_DESKTOP="${XDG_DATA_HOME:-$HOME/.local/share}/applications/deskdsh.desktop"
rm -f "$DESKTOP" "$LEGACY_DESKTOP"
printf '已移除桌面入口：%s\n' "$DESKTOP"
