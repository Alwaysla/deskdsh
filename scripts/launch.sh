#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ELECTRON="$ROOT/node_modules/.bin/electron"
LOG_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/deskdsh"
LOG_FILE="$LOG_DIR/launcher.log"

mkdir -p "$LOG_DIR"
if [[ ! -x "$ELECTRON" ]]; then
  printf '%s Electron 未安装：请在 %s 运行 npm install\n' "$(date -Is)" "$ROOT" >> "$LOG_FILE"
  exit 1
fi

# Ubuntu 24.04 restricts Chromium user namespaces through AppArmor. Prefer the
# configured SUID helper; fall back to --no-sandbox so menu launches still work.
SANDBOX="$ROOT/node_modules/electron/dist/chrome-sandbox"
ARGS=(--ozone-platform=x11)
if [[ ! -u "$SANDBOX" || "$(stat -c '%U:%G' "$SANDBOX" 2>/dev/null || true)" != "root:root" ]]; then
  ARGS=(--no-sandbox "${ARGS[@]}")
  printf '%s chrome-sandbox 未配置，使用 --no-sandbox 启动。运行 npm run setup:sandbox 可修复。\n' "$(date -Is)" >> "$LOG_FILE"
fi

cd "$ROOT"
exec "$ELECTRON" "${ARGS[@]}" "$ROOT" >> "$LOG_FILE" 2>&1
