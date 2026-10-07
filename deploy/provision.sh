#!/usr/bin/env bash
#
# 服务器初始化：在 open.vidge.me 这台机器上执行一次。
#
#   bash ~/apps/build-in-public/deploy/provision.sh
#
# 做的事：装 MongoDB 7 → 装 Node 22 → 建目录。
# 不用 Docker——这机器 1.6G 内存，dockerd 和镜像解压的开销省下来更实在。
# 幂等：每一步都先检测再动手，重复执行安全。
#
set -euo pipefail

log()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32m✓\033[0m %s\n' "$*"; }
skip() { printf '    \033[2m·\033[0m %s\n' "$*"; }
warn() { printf '    \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] && die "别用 root 跑，用 vidge 用户（脚本内部会按需 sudo）"

APP_DIR=/home/vidge/apps/build-in-public
WEB_DIR=/var/www/open.vidge.me

log "0/4 确认 sudo"
sudo -v || die "需要 sudo 权限"
ok "sudo 可用"

# 上一版脚本可能留下没启用的 swapfile
if [[ -f /swapfile ]] && ! swapon --show=NAME --noheadings 2>/dev/null | grep -q '^/swapfile'; then
  sudo rm -f /swapfile
  sudo sed -i '/^\/swapfile/d' /etc/fstab
  ok "已清理残留的 /swapfile"
fi

# ---------- 1. 内存 ----------
log "1/4 内存"
free -m | sed 's/^/    /'
AVAIL=$(free -m | awk '/^Mem:/{print $7}')
if [[ $AVAIL -lt 600 ]]; then
  warn "可用内存 ${AVAIL} MB 偏紧，mongod 缓存已限制在 256M"
else
  ok "可用 ${AVAIL} MB，够跑 mongod + node + nginx"
fi

# ---------- 2. MongoDB ----------
log "2/4 MongoDB 7"
if command -v mongod >/dev/null 2>&1; then
  skip "已安装：$(mongod --version | head -1)"
else
  # Ubuntu 官方源里没有 MongoDB（SSPL 协议），得加官方源
  curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc \
    | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
  echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/7.0 multiverse" \
    | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq mongodb-org
  ok "已安装 $(mongod --version | head -1)"
fi

# 配置：只听回环 + 限制缓存
log "    配置 mongod"
sudo tee /etc/mongod.conf >/dev/null <<'YAML'
# 数据和日志
storage:
  dbPath: /var/lib/mongodb
  wiredTiger:
    engineConfig:
      # 1.6G 内存的机器，默认会按 (RAM-1G)/2 去要，必须手动压下来
      cacheSizeGB: 0.25

systemLog:
  destination: file
  logAppend: true
  path: /var/log/mongodb/mongod.log

# 只绑回环：API 跟它同机，不需要让公网或安全组看见 27017
net:
  port: 27017
  bindIp: 127.0.0.1

processManagement:
  timeZoneInfo: /usr/share/zoneinfo
YAML
ok "bindIp=127.0.0.1  cacheSizeGB=0.25"

sudo systemctl enable -q mongod
sudo systemctl restart mongod
sleep 3

if mongosh --quiet --eval 'db.runCommand({ping:1}).ok' 2>/dev/null | grep -q 1; then
  ok "mongod 已就绪（127.0.0.1:27017）"
else
  sudo journalctl -u mongod -n 20 --no-pager
  die "mongod 没起来"
fi

# ---------- 3. Node ----------
log "3/4 Node 22"
if command -v node >/dev/null 2>&1 && [[ $(node -v | sed 's/v\([0-9]*\).*/\1/') -ge 20 ]]; then
  skip "已安装：$(node -v)"
else
  # 不吞错误——境外源在国内可能连不上，失败要立刻看得见
  curl -fsSL --connect-timeout 15 --retry 3 https://deb.nodesource.com/setup_22.x \
    | sudo -E bash - \
    || die "NodeSource 源配置失败（境外源连不上？）。手动装：https://github.com/nodesource/distributions"
  sudo apt-get install -y -qq nodejs
  command -v node >/dev/null 2>&1 || die "Node 装了但找不到，检查 PATH"
  ok "已安装 Node $(node -v) / npm $(npm -v)"
fi

# ---------- 4. 目录 ----------
log "4/4 目录"
mkdir -p "$APP_DIR"
sudo mkdir -p "$WEB_DIR"
sudo chown -R vidge:vidge "$WEB_DIR"
ok "$APP_DIR"
ok "$WEB_DIR"

# ---------- 汇总 ----------
log "完成"
free -m | sed 's/^/    /'
printf '\n'
systemctl is-active mongod | sed 's/^/    mongod: /'
printf '\n    \033[33m下一步\033[0m：回到本地执行  \033[36mnpm run deploy\033[0m\n'
printf '    然后再回来跑  \033[36mbash ~/apps/build-in-public/deploy/install-services.sh\033[0m\n\n'
