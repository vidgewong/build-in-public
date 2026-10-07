#!/usr/bin/env bash
#
# 部署到 open.vidge.me。在本地仓库根目录执行：
#
#   npm run deploy            构建 + 传前端 + 传服务端
#   npm run deploy -- --web   只传前端（改了样式/文案时用）
#   npm run deploy -- --pull  把生产库拉回本地做备份
#
# 数据流向在 admin 上线后反过来了：生产库是唯一真相源，
# 打卡走 /admin 或 bip（两者都写生产），本地库只是只读副本。
# 所以这里不再有「把本地库推上去」这条路——那会抹掉手机上打的卡。
#
# 前提：服务器已经跑过 deploy/provision.sh。
#
set -euo pipefail

HOST=${DEPLOY_HOST:-vidge.me}
APP_DIR=/home/vidge/apps/build-in-public
WEB_DIR=/var/www/open.vidge.me
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32m✓\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

do_web=1 do_server=1 do_pull=0
case "${1:-}" in
  --web)    do_server=0 ;;
  --server) do_web=0 ;;
  --pull)   do_web=0; do_server=0; do_pull=1 ;;
  # 以前 --data 是「本地覆盖生产」。现在那是毁数据的操作，直接拦住。
  --data)   die "--data 已废弃：生产库现在是唯一真相源，推本地库上去会抹掉手机上打的卡。\n  要备份请用：npm run deploy -- --pull" ;;
  "")       ;;
  *)        die "未知参数：$1（--web / --server / --pull）" ;;
esac

cd "$ROOT"

ssh -o ConnectTimeout=10 "$HOST" true 2>/dev/null || die "连不上 $HOST"

# ---------- 前端 ----------
if [[ $do_web == 1 ]]; then
  log "构建前端"
  npm run build
  [[ -f dist/index.html ]] || die "dist/index.html 不存在，构建失败？"
  ok "$(du -sh dist | cut -f1)"

  log "上传前端 → $WEB_DIR"
  # --delete 清掉上一版带 hash 的旧 assets，不然会越堆越多
  rsync -az --delete dist/ "$HOST:$WEB_DIR/"
  ok "已同步"
fi

# ---------- 服务端 ----------
if [[ $do_server == 1 ]]; then
  log "上传服务端 → $APP_DIR"
  ssh "$HOST" "mkdir -p $APP_DIR"
  rsync -az \
    server/ "$HOST:$APP_DIR/server/"
  # server/actions.mjs 要 import shared/domain.mjs，漏传 API 会起不来
  rsync -az shared/ "$HOST:$APP_DIR/shared/"
  rsync -az bin/ "$HOST:$APP_DIR/bin/"
  rsync -az deploy/ "$HOST:$APP_DIR/deploy/"
  rsync -az package.json package-lock.json "$HOST:$APP_DIR/"
  ok "已同步"

  log "安装依赖（本地装好再传，服务器内存小不跑 npm ci）"
  # 服务端只依赖 mongodb 这一个包，在本地干净地装到临时目录再同步过去
  DEPS=$(mktemp -d)
  cp package.json package-lock.json "$DEPS/"
  (cd "$DEPS" && npm ci --omit=dev --silent >/dev/null 2>&1)
  rsync -az --delete "$DEPS/node_modules/" "$HOST:$APP_DIR/node_modules/"
  rm -rf "$DEPS"
  ok "node_modules 已同步"

  log "重启 API"
  if ssh "$HOST" "systemctl list-unit-files bip-api.service --no-legend 2>/dev/null | grep -q bip-api"; then
    ssh "$HOST" "sudo systemctl restart bip-api && sleep 2 && systemctl is-active bip-api"
    ok "bip-api 已重启"
  else
    printf '    \033[33m! bip-api 服务还没安装\033[0m\n'
    printf '    \033[2m到服务器上跑：bash ~/apps/build-in-public/deploy/install-services.sh\033[0m\n'
  fi
fi

# ---------- 备份：生产 → 本地 ----------
if [[ $do_pull == 1 ]]; then
  command -v mongorestore >/dev/null 2>&1 || die "本地没有 mongo tools。装一下：brew install mongodb-database-tools"

  log "导出生产数据库"
  ssh "$HOST" "mongodump --uri='mongodb://127.0.0.1:27017/buildinpublic' --archive=/tmp/bip.archive --gzip --quiet"
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT
  scp -q "$HOST:/tmp/bip.archive" "$TMP/bip.archive"
  ssh "$HOST" "rm -f /tmp/bip.archive"
  ok "$(du -h "$TMP/bip.archive" | cut -f1)"

  # 顺手留一份带时间戳的，本地库被覆盖后还能翻出上一次
  STAMP=$(date +%Y%m%d-%H%M%S)
  mkdir -p "$HOME/backups/bip"
  cp "$TMP/bip.archive" "$HOME/backups/bip/$STAMP.archive"
  ok "存档 ~/backups/bip/$STAMP.archive"

  log "导入本地数据库（覆盖本地 buildinpublic）"
  mongorestore --archive="$TMP/bip.archive" --gzip --drop --quiet
  ok "已导入"
fi

# ---------- 验证 ----------
log "验证"
code=$(curl -s -o /dev/null -w '%{http_code}' https://open.vidge.me/ || echo 000)
[[ $code == 200 ]] && ok "页面 $code" || printf '    \033[33m! 页面 %s\033[0m\n' "$code"

rules=$(curl -s https://open.vidge.me/api/snapshot 2>/dev/null \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).rules.length)}catch{console.log('?')}})" 2>/dev/null || echo '?')
[[ $rules =~ ^[0-9]+$ ]] && ok "API 返回 $rules 条规则" || printf '    \033[33m! API 异常\033[0m\n'

printf '\n    \033[36mhttps://open.vidge.me\033[0m\n\n'
