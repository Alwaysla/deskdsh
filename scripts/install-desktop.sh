#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ELECTRON="$ROOT/node_modules/.bin/electron"
# Always install into the real per-user XDG location. IDEs launched through
# Snap can override XDG_DATA_HOME with a private sandbox path that GNOME does
# not scan for desktop applications.
APPLICATIONS="$HOME/.local/share/applications"
DESKTOP="$APPLICATIONS/deskdsh.desktop"
LAUNCHER="$ROOT/scripts/launch.sh"

if [[ ! -x "$ELECTRON" ]]; then
  printf 'Electron 尚未安装。请先运行：cd %q && npm install\n' "$ROOT" >&2
  exit 1
fi

mkdir -p "$APPLICATIONS"
chmod +x "$LAUNCHER"
cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=DeskDSH
Comment=DSH 桌面宠物与快捷对话
Exec=$LAUNCHER
Icon=$ROOT/assets/deskdsh.png
Terminal=false
Categories=Utility;Development;
StartupNotify=true
StartupWMClass=DeskDSH
EOF
chmod +x "$DESKTOP"
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPLICATIONS" >/dev/null 2>&1 || true
fi
printf '已安装桌面入口：%s\n' "$DESKTOP"
