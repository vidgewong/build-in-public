#!/usr/bin/env bash
#
# 安装 nginx 站点配置和 systemd 服务。
# 在 provision.sh 跑完、代码已经传上去之后执行一次：
#
#   bash ~/apps/build-in-public/deploy/install-services.sh
#
set -euo pipefail

log()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32m✓\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR=/home/vidge/apps/build-in-public

sudo -v || die "需要 sudo"

# ---------- 前置检查 ----------
log "0/4 前置检查"
command -v node >/dev/null 2>&1 \
  || die "Node 没装。先跑：curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"
[[ $(node -v | sed 's/v\([0-9]*\).*/\1/') -ge 20 ]] \
  || die "Node 版本太老（$(node -v)），需要 20+"
ok "Node $(node -v)"

systemctl is-active -q mongod || die "mongod 没在跑。先跑 provision.sh"
ok "mongod 运行中"

[[ -f "$APP_DIR/server/api.mjs" ]] \
  || die "找不到 $APP_DIR/server/api.mjs。先在本地跑 npm run deploy"
[[ -d "$APP_DIR/node_modules/mongodb" ]] \
  || die "找不到 mongodb 依赖。先在本地跑 npm run deploy"
ok "代码和依赖就位"

# ---------- admin 口令 ----------
log "1/4 admin 口令"
ENV_FILE=/etc/bip-api.env
if sudo test -f "$ENV_FILE"; then
  ok "$ENV_FILE 已存在，不动它"
  printf '    \033[2m要换口令：node %s/deploy/gen-admin-secret.mjs，把两行贴进去再 sudo systemctl restart bip-api\033[0m\n' "$APP_DIR"
else
  # 口令只在这里打印一次。服务器上只留哈希，捡不回来，只能重新生成。
  GEN=$(cd "$APP_DIR" && node deploy/gen-admin-secret.mjs)
  echo "$GEN"
  printf '%s\n' "$GEN" | grep -E '^BIP_(ADMIN_HASH|SESSION_SECRET)=' | sudo tee "$ENV_FILE" >/dev/null
  sudo chmod 600 "$ENV_FILE"
  sudo chown root:root "$ENV_FILE"
  [[ $(sudo grep -c '^BIP_' "$ENV_FILE") == 2 ]] || die "写 $ENV_FILE 失败"
  ok "已写入 $ENV_FILE（600）"
  printf '    \033[33m↑ 上面的口令只显示这一次，现在就存进密码管理器\033[0m\n'
fi

# ---------- systemd ----------
log "2/4 systemd 服务"
[[ -f "$HERE/bip-api.service" ]] || die "找不到 bip-api.service"
# node 的实际路径不一定是 /usr/bin/node，按 which 的结果替换
NODE_BIN=$(command -v node)
sudo sed "s#^ExecStart=.*#ExecStart=$NODE_BIN server/api.mjs#" \
  "$HERE/bip-api.service" | sudo tee /etc/systemd/system/bip-api.service >/dev/null
ok "ExecStart=$NODE_BIN server/api.mjs"
sudo systemctl daemon-reload
sudo systemctl enable -q bip-api
sudo systemctl restart bip-api
sleep 2
if systemctl is-active -q bip-api; then
  ok "bip-api 已启动"
else
  sudo journalctl -u bip-api -n 20 --no-pager
  die "bip-api 启动失败"
fi

# API 自检
if HEALTH=$(curl -sf http://127.0.0.1:8787/api/health); then
  ok "API 健康检查通过"
  # admin 为 false 说明 EnvironmentFile 没被读到，这时 /admin 进不去
  if grep -q '"admin":true' <<<"$HEALTH"; then
    ok "admin 已启用"
  else
    printf '    \033[33m! admin 未启用，检查 /etc/bip-api.env 和 journalctl -u bip-api\033[0m\n'
  fi
else
  die "API 没响应，看日志：journalctl -u bip-api -n 50"
fi

# ---------- 免密 sudo（只给重启 API 这一条）----------
log "3/4 部署用的免密 sudo"
RULE='vidge ALL=(ALL) NOPASSWD: /bin/systemctl restart bip-api'
if sudo test -f /etc/sudoers.d/bip-deploy; then
  ok "已存在"
else
  echo "$RULE" | sudo tee /etc/sudoers.d/bip-deploy >/dev/null
  sudo chmod 0440 /etc/sudoers.d/bip-deploy
  sudo visudo -cf /etc/sudoers.d/bip-deploy >/dev/null || {
    sudo rm -f /etc/sudoers.d/bip-deploy
    die "sudoers 语法检查失败，已回滚"
  }
  ok "已配置（仅限重启 bip-api）"
fi

# ---------- nginx ----------
log "4/4 nginx"
[[ -f "$HERE/open.vidge.me.conf" ]] || die "找不到 open.vidge.me.conf"

# 证书路径里有通配符，nginx 不展开，得先解析成真实路径
CERT_DIR=$(ls -d /home/vidge/.acme.sh/*.vidge.me_ecc 2>/dev/null | head -1)
[[ -n "$CERT_DIR" ]] || die "找不到 *.vidge.me 证书目录"
KEY=$(ls "$CERT_DIR"/*.vidge.me.key 2>/dev/null | head -1)
[[ -n "$KEY" ]] || die "找不到私钥"

sudo sed \
  -e "s#/home/vidge/.acme.sh/\*.vidge.me_ecc/fullchain.cer#$CERT_DIR/fullchain.cer#" \
  -e "s#/home/vidge/.acme.sh/\*.vidge.me_ecc/\*.vidge.me.key#$KEY#" \
  "$HERE/open.vidge.me.conf" | sudo tee /etc/nginx/sites-available/open.vidge.me >/dev/null

sudo ln -sfn /etc/nginx/sites-available/open.vidge.me /etc/nginx/sites-enabled/open.vidge.me

# nginx 要能读到 vidge 家目录下的证书
sudo chmod o+x /home/vidge /home/vidge/.acme.sh "$CERT_DIR"
sudo chmod o+r "$CERT_DIR/fullchain.cer" "$KEY"

if sudo nginx -t 2>&1 | grep -q 'successful'; then
  # nginx 可能没被 systemd 接管（有过脱离的 master 进程），reload 会失败，退回 restart
  if systemctl is-active -q nginx; then
    sudo systemctl reload nginx
    ok "nginx 已重载"
  else
    sudo pkill -f 'nginx: master' 2>/dev/null || true
    sleep 1
    sudo systemctl start nginx && sleep 1
    systemctl is-active -q nginx && ok "nginx 已启动" || die "nginx 起不来，看 journalctl -u nginx"
  fi
else
  sudo nginx -t
  sudo rm -f /etc/nginx/sites-enabled/open.vidge.me
  die "nginx 配置有误，已回滚"
fi

log "完成"
printf '    \033[36mhttps://open.vidge.me\033[0m\n'
printf '    \033[36mhttps://open.vidge.me/admin\033[0m\n'
printf '    日志：journalctl -u bip-api -f\n\n'
