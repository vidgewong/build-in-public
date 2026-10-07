#!/usr/bin/env bash
#
# 把 nginx 从 8443 搬回标准 443，停掉 sslh。
# 在服务器上执行一次：
#
#   bash ~/apps/build-in-public/deploy/migrate-443.sh
#
# 背景：原来公网 443 被 sslh 占着做协议复用（SSH 走 22、TLS 转 8443）。
# sshd 本身已经同时听 22 和 443，而当前 SSH 会话走的是 22，
# 所以摘掉 sslh 不会断连接——但 443 上的 SSH 后门会没掉，这是预期的。
#
# 幂等：重复执行安全。改动前自动备份到 /etc/nginx.bak-<时间戳>。
#
set -euo pipefail

log()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32m✓\033[0m %s\n' "$*"; }
skip() { printf '    \033[2m·\033[0m %s\n' "$*"; }
warn() { printf '    \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

sudo -v || die "需要 sudo"

# ---------- 0. 确认当前 SSH 不是走 443 ----------
log "0/5 安全检查"
# SSH_CONNECTION 格式：<客户端IP> <客户端端口> <服务端IP> <服务端端口>
SSH_PORT=$(awk '{print $4}' <<<"${SSH_CONNECTION:-}" 2>/dev/null || true)
if [[ "$SSH_PORT" == "443" ]]; then
  die "当前 SSH 会话走的是 443 端口。停掉 sslh 会把你自己踢下线。
     先用 22 端口重连：ssh -p 22 vidge@vidge.me
     再跑这个脚本。"
fi
ok "当前会话走 ${SSH_PORT:-未知} 端口，不受影响"

# 22 端口确实开着，不然改完连不回来
ss -tln | grep -qE ':22\s' || die "22 端口没在监听，中止——改完会连不上"
ok "22 端口在监听，退路没问题"

# ---------- 1. 备份 ----------
log "1/5 备份 nginx 配置"
BAK="/etc/nginx.bak-$(date +%Y%m%d-%H%M%S)"
sudo cp -a /etc/nginx "$BAK"
ok "$BAK"

# ---------- 2. 停掉 sslh，腾出 443 ----------
log "2/5 停掉 sslh"
if systemctl is-active -q sslh; then
  sudo systemctl disable -q --now sslh
  ok "sslh 已停止并取消开机自启"
else
  skip "sslh 没在跑"
fi

# 443 上残留的 IPv6 sshd 监听也得让路（sshd 的 Port 443）
if grep -qE '^[[:space:]]*Port[[:space:]]+443[[:space:]]*$' /etc/ssh/sshd_config; then
  sudo sed -i -E 's/^([[:space:]]*Port[[:space:]]+443[[:space:]]*)$/# \1  # 443 让给 nginx/' \
    /etc/ssh/sshd_config
  sudo sshd -t || die "sshd 配置检查失败，已备份在 $BAK，手动恢复 /etc/ssh/sshd_config"
  sudo systemctl reload ssh
  ok "sshd 不再监听 443（22 保持不变）"
else
  skip "sshd 本来就没听 443"
fi

# 确认 443 真的空了
sleep 1
if ss -tln | grep -qE ':443\s'; then
  ss -tlnp 2>/dev/null | grep ':443 ' | sed 's/^/    /'
  die "443 还被占着，上面是占用者。处理完再跑一次"
fi
ok "443 已空出"

# ---------- 3. 把所有站点从 8443 改到 443 ----------
log "3/5 nginx 配置 8443 → 443"
CHANGED=0
# 只动 nginx 实际加载的文件：conf.d/*.conf 和 sites-enabled 指向的目标
mapfile -t FILES < <(
  ls /etc/nginx/conf.d/*.conf 2>/dev/null
  for link in /etc/nginx/sites-enabled/*; do
    [[ -e "$link" ]] && readlink -f "$link"
  done
)
for f in "${FILES[@]}"; do
  grep -qE '^\s*listen\s+(\[::\]:)?8443\b' "$f" || continue
  sudo sed -i -E 's/^(\s*listen\s+(\[::\]:)?)8443\b/\1443/' "$f"
  ok "$(basename "$f")"
  CHANGED=$((CHANGED + 1))
done
[[ $CHANGED -gt 0 ]] || skip "没有文件需要改（可能已经是 443）"

# ---------- 4. 校验并重启 ----------
log "4/5 重启 nginx"
sudo nginx -t 2>&1 | sed 's/^/    /'
sudo nginx -t >/dev/null 2>&1 || {
  sudo rm -rf /etc/nginx
  sudo mv "$BAK" /etc/nginx
  die "nginx 配置检查失败，已回滚"
}

# 7 月那个 master 进程是脱离 systemd 的孤儿，unit 显示 failed。
# 必须杀干净再 start，否则 systemd 接管不了、443 也会被它抢走。
sudo systemctl stop nginx 2>/dev/null || true
sudo pkill -f 'nginx: master' 2>/dev/null || true
sleep 2
pgrep -f 'nginx: master' >/dev/null && { sudo pkill -9 -f 'nginx:' ; sleep 1; }

sudo systemctl start nginx
sleep 2
if systemctl is-active -q nginx; then
  ok "nginx 已由 systemd 接管"
else
  sudo journalctl -u nginx -n 30 --no-pager
  die "nginx 没起来。配置备份在 $BAK"
fi
sudo systemctl enable -q nginx

# ---------- 5. 验证 ----------
log "5/5 验证"
ss -tlnp 2>/dev/null | grep -E ':(443|80|22)\s' | sed 's/^/    /'

printf '\n'
for host in open.vidge.me vidge.me; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://$host/" || echo 000)
  if [[ $code =~ ^(200|301|302|304)$ ]]; then
    ok "https://$host → $code"
  else
    warn "https://$host → $code"
  fi
done

api=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://open.vidge.me/api/snapshot || echo 000)
[[ $api == 200 ]] && ok "https://open.vidge.me/api/snapshot → 200" \
                  || warn "https://open.vidge.me/api/snapshot → $api"

log "完成"
printf '    配置备份：%s\n' "$BAK"
printf '    \033[33m注意\033[0m：443 上的 SSH 后门没了，以后只能用 22 端口连。\n'
printf '    本地 ~/.ssh/config 里的 \033[36mvidge443\033[0m 这条可以删了。\n\n'
