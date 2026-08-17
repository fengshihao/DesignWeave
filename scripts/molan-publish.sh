#!/usr/bin/env bash
# 发布墨览：腾讯云网站 + Cursor（Open VSX）；VS Code 商店打开管理页人工上传。
# 用法：
#   bash scripts/molan-publish.sh
#   pnpm molan:publish
#
# 需要环境变量 OVSX_PAT（Open VSX 令牌，可写在 ~/.zshrc）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXT_DIR="${ROOT}/apps/vscode-molan"
UPLOAD="${ROOT}/tools/markdown-viewer/deploy/upload.sh"
MARKET_URL="https://marketplace.visualstudio.com/manage/publishers/fengshihao"

cd "${ROOT}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "需要 ${1}" >&2
    exit 1
  fi
}

need pnpm
need npx
need node

if [[ ! -x "${UPLOAD}" ]]; then
  echo "找不到上传脚本：${UPLOAD}" >&2
  exit 1
fi

if [[ -z "${OVSX_PAT:-}" ]]; then
  echo "未设置 OVSX_PAT。请在本机导出 Open VSX 令牌后再运行。" >&2
  echo "  export OVSX_PAT=\"…\"" >&2
  exit 1
fi

VERSION="$(node -p "require('${EXT_DIR}/package.json').version")"
echo "==> 墨览 ${VERSION}"

if command -v git >/dev/null 2>&1 && git -C "${ROOT}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  local_ahead="$(git -C "${ROOT}" rev-list --count "@{upstream}..HEAD" 2>/dev/null || echo 0)"
  if [[ "${local_ahead}" != "0" ]]; then
    echo "注意：本地比远程超前 ${local_ahead} 个提交。发版前建议先 git push。"
  fi
fi

echo "==> 1/4 打包 .vsix"
bash "${ROOT}/scripts/vscode-molan.sh" package
VSIX="$(ls -t "${EXT_DIR}"/molan-markdown-*.vsix | head -n 1)"
echo "    ${VSIX}"

echo "==> 2/4 同步腾讯云 https://molan.guoyoutech.cn/"
bash "${UPLOAD}"

echo "==> 3/4 发布 Cursor / Open VSX"
set +e
OVSX_OUT="$(npx --yes ovsx publish "${VSIX}" -p "${OVSX_PAT}" 2>&1)"
OVSX_CODE=$?
set -e
printf '%s\n' "${OVSX_OUT}"
if [[ "${OVSX_CODE}" -ne 0 ]]; then
  if printf '%s' "${OVSX_OUT}" | grep -q "isn't active"; then
    echo "    Open VSX 已收到 ${VERSION}，正在激活，稍后可见。"
  else
    exit "${OVSX_CODE}"
  fi
fi
echo "    https://open-vsx.org/extension/fengshihao/molan-markdown"

echo "==> 4/4 打开 VS Code Marketplace（需人工上传）"
echo "    安装包：${VSIX}"
echo "    ${MARKET_URL}"
case "$(uname -s 2>/dev/null || echo unknown)" in
  Darwin) open "${MARKET_URL}" ;;
  MINGW*|MSYS*|CYGWIN*) cmd.exe /c start "" "${MARKET_URL}" ;;
  *) xdg-open "${MARKET_URL}" >/dev/null 2>&1 || true ;;
esac

echo "完成。"
