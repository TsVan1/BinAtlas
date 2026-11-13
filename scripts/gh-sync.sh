#!/usr/bin/env bash
# BinAtlas · GitHub 同步包装器
# 安全设计：token 只在内存中，经 GIT_ASKPASS 传递，不落 .git/config、不进日志、不进参数
set -euo pipefail
set +x

CONF="${GITHUB_ENV_FILE:-$HOME/.config/binatlas/github.env}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }
info() { printf '\033[36m· %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }

# ---------- 凭证 ----------
load_env() {
  [ -f "$CONF" ] || die "缺少凭证文件：$CONF（格式：GITHUB_TOKEN=... / GITHUB_REPO=owner/repo）"
  # shellcheck disable=SC1090
  set -a; . "$CONF"; set +a
  [ -n "${GITHUB_TOKEN:-}" ] || die "GITHUB_TOKEN 为空"
  [ -n "${GITHUB_REPO:-}" ]  || die "GITHUB_REPO 为空（格式 owner/repo）"
}

# 用临时 askpass 脚本喂密码，避免 token 出现在命令行参数或 .git/config
with_askpass() {
  local f; f="$(mktemp "${TMPDIR:-/tmp}/binatlas-askpass.XXXXXX")"
  cat > "$f" <<'EOS'
#!/bin/sh
case "$1" in
  *[Uu]sername*) printf '%s\n' "x-access-token" ;;
  *[Pp]assword*) printf '%s\n' "$GITHUB_TOKEN" ;;
  *) printf '\n' ;;
esac
EOS
  chmod 700 "$f"
  local rc=0
  GIT_ASKPASS="$f" GIT_TERMINAL_PROMPT=0 "$@" || rc=$?
  rm -f "$f"
  return $rc
}

# ---------- 安全闸门 ----------
secret_scan() {
  info "密钥扫描…"
  local hits
  hits="$(grep -rEn 'ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|gho_[A-Za-z0-9]{20,}' \
          --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist \
          --exclude-dir=inbox --exclude='*.md' . 2>/dev/null || true)"
  if [ -n "$hits" ]; then
    printf '%s\n' "$hits" >&2
    die "检测到疑似凭据，已中止（移除后重试）"
  fi
  ok "未发现凭据泄露"
}

check_remote_url() {
  local url
  url="$(git config --get remote.origin.url 2>/dev/null || true)"
  [ -n "$url" ] || die "未配置 remote.origin.url，先跑：bash scripts/gh-sync.sh setup"
  case "$url" in
    *@github.com*) die "remote URL 含凭据段（xxx@github.com），必须改成裸 https 地址" ;;
  esac
  ok "remote URL 干净：$url"
}

# ---------- 子命令 ----------
cmd_setup() {
  load_env
  local url="https://github.com/${GITHUB_REPO}.git"
  if git config --get remote.origin.url >/dev/null 2>&1; then
    git remote set-url origin "$url"
    ok "已更新 remote → $url"
  else
    git remote add origin "$url"
    ok "已添加 remote → $url"
  fi
}

cmd_doctor() {
  load_env
  info "凭证文件：$CONF"
  echo "  权限：$(stat -f '%Sp' "$CONF" 2>/dev/null || echo '未知')"

  info "校验 token…"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H 'Accept: application/vnd.github+json' \
    https://api.github.com/user || echo 000)"
  case "$code" in
    200) ok "token 有效" ;;
    401) die "token 无效或已过期（HTTP 401）" ;;
    *)   warn "无法确认 token 状态（HTTP $code）" ;;
  esac

  info "校验仓库访问：$GITHUB_REPO"
  code="$(curl -sS -o /dev/null -w '%{http_code}' \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H 'Accept: application/vnd.github+json' \
    "https://api.github.com/repos/${GITHUB_REPO}" || echo 000)"
  case "$code" in
    200) ok "仓库可访问" ;;
    404) die "仓库不存在，或 token 未授权该仓库（HTTP 404）" ;;
    403) die "权限不足（HTTP 403），检查 Contents / Workflows 权限" ;;
    *)   warn "仓库检查返回 HTTP $code" ;;
  esac

  check_remote_url
  secret_scan
  echo
  ok "doctor 通过"
}

cmd_status() {
  load_env
  check_remote_url
  echo "分支：$(git branch --show-current)"
  echo "提交：$(git log --oneline -1)"
  echo "工作区：$(git status --porcelain | wc -l | tr -d ' ') 个未提交改动"
  echo "tag：$(git tag -l | tail -5 | tr '\n' ' ')"
  echo
  with_askpass git fetch origin --quiet || warn "fetch 失败（网络或权限）"
  local ahead behind
  ahead="$(git rev-list --count 'origin/'"$(git branch --show-current)"'..HEAD' 2>/dev/null || echo '?')"
  behind="$(git rev-list --count 'HEAD..origin/'"$(git branch --show-current)" 2>/dev/null || echo '?')"
  echo "相对远端：领先 $ahead / 落后 $behind"
}

cmd_push() {
  load_env
  [ -z "$(git status --porcelain)" ] || warn "工作区有未提交改动，只会推送已提交内容"
  secret_scan
  check_remote_url
  local br; br="$(git branch --show-current)"
  info "推送 $br → $GITHUB_REPO"
  with_askpass git push -u origin "$br"
  ok "推送完成"
}

cmd_release() {
  local tag="${1:-}"
  [ -n "$tag" ] || die "用法：bash scripts/gh-sync.sh release v0.1.0"
  [[ "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+ ]] || die "tag 必须形如 v0.1.0"
  load_env
  secret_scan

  [ -z "$(git status --porcelain)" ] || die "工作区有未提交改动，先提交再发布"
  [ "$(git branch --show-current)" = "main" ] || warn "当前不在 main 分支"

  if git rev-parse "$tag" >/dev/null 2>&1; then
    info "tag $tag 已存在，复用"
  else
    info "创建 tag $tag"
    git tag -a "$tag" -m "release $tag"
  fi

  cmd_push
  info "推送 tag"
  with_askpass git push origin "$tag"

  local body
  body="$(git log --pretty='- %s' "$(git describe --tags --abbrev=0 "$tag^" 2>/dev/null || git rev-list --max-parents=0 HEAD)"..HEAD 2>/dev/null | head -40 || true)"
  [ -n "$body" ] || body="- 首次发布"

  info "创建 GitHub Release…"
  local payload resp
  payload="$(python3 - "$tag" "$body" <<'PY'
import json, sys
tag, body = sys.argv[1], sys.argv[2]
print(json.dumps({"tag_name": tag, "name": tag, "body": body,
                  "draft": False, "prerelease": False}))
PY
)"
  resp="$(curl -sS -X POST \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H 'Accept: application/vnd.github+json' \
    -H 'X-GitHub-Api-Version: 2022-11-28' \
    -d "$payload" \
    "https://api.github.com/repos/${GITHUB_REPO}/releases" || true)"

  local upload_url
  upload_url="$(printf '%s' "$resp" | python3 -c \
    'import json,sys;d=json.load(sys.stdin);print(d.get("upload_url","") or d.get("message",""))' 2>/dev/null || true)"
  case "$upload_url" in
    *"{?name,label}"*) : ;;
    *) die "创建 Release 失败：$upload_url" ;;
  esac
  ok "Release 已创建：$tag"

  local base="${upload_url%%\{*}"
  local count=0
  for f in public/graph/graph.json dist/knowledge-base-"$tag".tar.gz; do
    [ -f "$f" ] || continue
    info "上传资产：$f"
    curl -sS -X POST \
      -H "Authorization: Bearer ${GITHUB_TOKEN}" \
      -H 'Content-Type: application/octet-stream' \
      --data-binary @"$f" \
      "${base}?name=$(basename "$f")" >/dev/null && count=$((count+1))
  done
  [ "$count" -gt 0 ] || warn "没有找到可上传的构建产物（先跑 pnpm build）"

  echo
  ok "发布完成：https://github.com/${GITHUB_REPO}/releases/tag/${tag}"
}

cmd_help() {
  cat <<'EOF'
BinAtlas GitHub 同步器

  bash scripts/gh-sync.sh setup            绑定 remote（读 GITHUB_REPO）
  bash scripts/gh-sync.sh doctor           体检：token / 仓库权限 / remote / 密钥扫描
  bash scripts/gh-sync.sh status           远端领先落后、tag、工作区状态
  bash scripts/gh-sync.sh push             推送当前分支（推送前自动密钥扫描）
  bash scripts/gh-sync.sh release v0.1.0   打 tag + 推送 + 建 Release + 传产物

凭证：~/.config/binatlas/github.env（chmod 600），格式
  GITHUB_TOKEN=github_pat_xxx
  GITHUB_REPO=owner/repo

fine-grained PAT 需具备 Contents:write 与 Workflows:write
EOF
}

case "${1:-help}" in
  setup)   cmd_setup ;;
  doctor)  cmd_doctor ;;
  status)  cmd_status ;;
  push)    cmd_push ;;
  release) shift; cmd_release "$@" ;;
  help|-h|--help) cmd_help ;;
  *) die "未知子命令：$1（试 bash scripts/gh-sync.sh help）" ;;
esac
