#!/usr/bin/env bash
# DesignWeave 开发启动：先停旧进程，再启动 web + agent
# 兼容 macOS / Linux / Windows Git Bash
# 用法：
#   bash scripts/dev.sh          # 停旧后启动（默认）
#   bash scripts/dev.sh stop     # 仅停止
#   pnpm dev / pnpm stop
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

WEB_PORT="${WEB_PORT:-3100}"
AGENT_PORT="${AGENT_PORT:-${PORT:-8787}}"
ACTION="${1:-start}"

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

stop_all() {
  echo "==> 清理旧进程"
  kill_port "${AGENT_PORT}"
  kill_port "${WEB_PORT}"

  # Unix 兜底；Windows 靠端口清理即可
  if ! is_windows && command -v pgrep >/dev/null 2>&1; then
    local pids
    pids="$(normalize_pids $(pgrep -f "${ROOT}/apps/agent.*tsx src/index.ts" 2>/dev/null || true))"
    if [[ -n "${pids}" ]]; then
      echo "停止旧的 agent (tsx): ${pids}"
      # shellcheck disable=SC2086
      kill_pids 0 ${pids}
    fi
    pids="$(normalize_pids $(pgrep -f "next dev -p ${WEB_PORT}" 2>/dev/null || true))"
    if [[ -n "${pids}" ]]; then
      echo "停止旧的 web (next): ${pids}"
      # shellcheck disable=SC2086
      kill_pids 0 ${pids}
    fi
  fi
}

case "${ACTION}" in
  stop)
    stop_all
    echo "已停止 DesignWeave 开发进程"
    ;;
  start|*)
    stop_all
    sleep 0.4
    echo "==> 启动 DesignWeave（Web :${WEB_PORT} · Agent :${AGENT_PORT}）"
    # 不用 exec：Windows Git Bash 下 pnpm 常为 .cmd，exec 易踩坑
    pnpm -r --parallel --filter @designweave/agent --filter @designweave/web dev
    ;;
esac
