#!/usr/bin/env bash
# 本地自用生产模式启动：next start（局域网可访问）+ 调度器。
# 前提：已执行 npm run build。停止：Ctrl+C（两个进程一并退出）。
set -euo pipefail

PORT="${PORT:-3000}"

echo "[start-local] 启动 next start（0.0.0.0:${PORT}）..."
npx next start -H 0.0.0.0 -p "${PORT}" &
APP_PID=$!

cleanup() {
  echo ""
  echo "[start-local] 正在停止..."
  kill "${APP_PID}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

sleep 2
echo "[start-local] 启动调度器..."
exec npx tsx scripts/scheduler.mts
