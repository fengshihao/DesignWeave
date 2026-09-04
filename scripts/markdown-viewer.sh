#!/usr/bin/env bash
# 启动墨览本地 Markdown 工作室（tools/markdown-viewer）
# 兼容 macOS / Linux / Windows Git Bash
# 用法：
#   bash scripts/markdown-viewer.sh          # 停旧后启动并打开浏览器
#   bash scripts/markdown-viewer.sh stop     # 仅停止
#   pnpm molan / pnpm molan:stop
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VIEWER_DIR="${ROOT}/tools/markdown-viewer"
PORT="${MOLAN_PORT:-5500}"
BIND="${MOLAN_BIND:-0.0.0.0}"
ACTION="${1:-start}"
URL="http://127.0.0.1:${PORT}/"

is_windows() {
  case "$(uname -s 2>/dev/null || echo unknown)" in
    MINGW*|MSYS*|CYGWIN*) return 0 ;;
    *) return 1 ;;
  esac
}

normalize_pids() {
  # grep 无匹配退出码为 1，pipefail 下需吞掉
  # shellcheck disable=SC2086
  echo $* | tr -s '[:space:]' '\n' | grep -E '^[0-9]+$' | sort -u | tr '\n' ' ' | sed 's/[[:space:]]*$//' || true
}

pids_on_port() {
  local port="$1"
  local raw=""

  if is_windows; then
    raw="$(
      netstat -ano 2>/dev/null \
        | tr -d '\r' \
        | grep -E "[:.]${port}[[:space:]].*LISTENING" \
        | awk '{print $NF}' \
        || true
    )"
  elif command -v lsof >/dev/null 2>&1; then
    raw="$(lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null || true)"
  elif command -v ss >/dev/null 2>&1; then
    raw="$(
      ss -lptn "sport = :${port}" 2>/dev/null \
        | grep -oE 'pid=[0-9]+' \
        | cut -d= -f2 \
        || true
    )"
  elif command -v fuser >/dev/null 2>&1; then
    raw="$(fuser "${port}/tcp" 2>/dev/null || true)"
  fi

  normalize_pids ${raw}
}

kill_pids() {
  local force="${1:-0}"
  shift || true
  local pids
  pids="$(normalize_pids "$@")"
  [[ -z "${pids}" ]] && return 0

  local pid
  for pid in ${pids}; do
    if is_windows; then
      if [[ "${force}" == "1" ]]; then
        taskkill //PID "${pid}" //F >/dev/null 2>&1 || true
      else
        taskkill //PID "${pid}" >/dev/null 2>&1 || taskkill //PID "${pid}" //F >/dev/null 2>&1 || true
      fi
    else
      if [[ "${force}" == "1" ]]; then
        kill -9 "${pid}" 2>/dev/null || true
      else
        kill "${pid}" 2>/dev/null || true
      fi
    fi
  done
}

kill_port() {
  local port="$1"
  local pids
  pids="$(pids_on_port "${port}")"
  if [[ -z "${pids}" ]]; then
    echo "端口 ${port} 空闲"
    return 0
  fi

  echo "停止占用端口 ${port} 的进程: ${pids}"
  # shellcheck disable=SC2086
  kill_pids 0 ${pids}
  sleep 0.6

  pids="$(pids_on_port "${port}")"
  if [[ -n "${pids}" ]]; then
    echo "强制结束仍占用 ${port} 的进程: ${pids}"
    # shellcheck disable=SC2086
    kill_pids 1 ${pids}
    sleep 0.3
  fi
}

open_browser() {
  if is_windows; then
    cmd.exe /c start "" "${URL}" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then
    open "${URL}" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "${URL}" >/dev/null 2>&1 || true
  fi
}

serve_viewer() {
  if command -v node >/dev/null 2>&1; then
    MOLAN_ROOT="${VIEWER_DIR}" MOLAN_SERVE_PORT="${PORT}" MOLAN_BIND="${BIND}" node "${VIEWER_DIR}/serve.mjs"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -m http.server "${PORT}" --bind "${BIND}" --directory "${VIEWER_DIR}"
  elif command -v python >/dev/null 2>&1; then
    python -m http.server "${PORT}" --bind "${BIND}" --directory "${VIEWER_DIR}"
  else
    echo "需要 Node.js 或 python3 才能启动静态服务" >&2
    exit 1
  fi
}

vendor_vditor() {
  local sync="${ROOT}/apps/vscode-molan/scripts/sync-media.mjs"
  if [[ ! -f "${sync}" ]]; then
    echo "未找到 ${sync}" >&2
    exit 1
  fi
  if ! command -v node >/dev/null 2>&1; then
    echo "需要 Node.js 才能同步墨览资源" >&2
    exit 1
  fi
  if ! command -v pnpm >/dev/null 2>&1; then
    echo "需要 pnpm 才能构建 molan-core / molan-host" >&2
    exit 1
  fi
  echo "==> 构建并同步墨览资源（molan-core → studio + vditor）"
  node "${sync}"
}

case "${ACTION}" in
  stop)
    echo "==> 停止墨览 Markdown 工作室"
    kill_port "${PORT}"
    echo "已停止 :${PORT}"
    ;;
  start|*)
    if [[ ! -f "${VIEWER_DIR}/index.html" ]]; then
      echo "未找到 ${VIEWER_DIR}/index.html" >&2
      exit 1
    fi
    echo "==> 清理旧进程"
    kill_port "${PORT}"
    sleep 0.3
    vendor_vditor
    echo "==> 启动墨览 Markdown 工作室  ${URL}"
    echo "    局域网可用本机 IP，例如 http://192.168.x.x:${PORT}/ （MOLAN_BIND=${BIND}）"
    echo "    侧栏「打开文件夹」打开本地目录；Chrome / Edge 可写回，Cursor 内置浏览器自动走兼容选择。Ctrl+C 停止。"
    (
      sleep 0.5
      open_browser
    ) &
    serve_viewer
    ;;
esac
