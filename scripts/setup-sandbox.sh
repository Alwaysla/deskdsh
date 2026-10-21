#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SANDBOX="$ROOT/node_modules/electron/dist/chrome-sandbox"

if [[ ! -f "$SANDBOX" ]]; then
  printf '未找到 %s，请先运行 npm install。\n' "$SANDBOX" >&2
  exit 1
fi

printf '将配置 Electron SUID sandbox：\n  %s\n' "$SANDBOX"
printf '需要 sudo 将其设为 root:root、权限 4755。npm 重新安装 Electron 后可能需要再次执行。\n'
sudo chown root:root "$SANDBOX"
sudo chmod 4755 "$SANDBOX"

owner="$(stat -c '%U:%G' "$SANDBOX")"
mode="$(stat -c '%a' "$SANDBOX")"
if [[ "$owner" != "root:root" || "$mode" != "4755" ]]; then
  printf '配置失败：当前为 %s %s\n' "$owner" "$mode" >&2
  exit 1
fi
printf '配置完成：%s %s %s\n' "$owner" "$mode" "$SANDBOX"
