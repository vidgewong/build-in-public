#!/usr/bin/env bash
#
# 每天备份生产库。在服务器上跑一次装进 cron：
#
#   bash ~/apps/build-in-public/deploy/install-backup.sh
#
# 为什么必须有：admin 上线后生产库是唯一真相源，
# 本地那份只是 `npm run deploy -- --pull` 拉下来的只读副本，
# 误删一条规则会连带删掉它所有的打卡和赔付，没有别的后悔药。
#
set -euo pipefail

log()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32m✓\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

BACKUP_DIR=/home/vidge/backups/bip
SCRIPT=/home/vidge/apps/build-in-public/deploy/backup.sh
KEEP_DAYS=14

command -v mongodump >/dev/null 2>&1 || die "服务器上没有 mongodump：sudo apt-get install -y mongodb-database-tools"

log "1/3 备份脚本"
mkdir -p "$BACKUP_DIR"
cat > "$SCRIPT" <<EOF
#!/usr/bin/env bash
# 由 install-backup.sh 生成，直接改这里会被下次安装覆盖。
set -euo pipefail
DIR=$BACKUP_DIR
STAMP=\$(date +%Y%m%d-%H%M%S)
mongodump --uri='mongodb://127.0.0.1:27017/buildinpublic' \\
  --archive="\$DIR/\$STAMP.archive" --gzip --quiet
# 只有确实生成了非空文件才算成功，不然轮转会把好备份删掉换成空的
[[ -s "\$DIR/\$STAMP.archive" ]] || { echo "备份为空，没有轮转" >&2; exit 1; }
find "\$DIR" -name '*.archive' -type f -mtime +$KEEP_DAYS -delete
EOF
chmod +x "$SCRIPT"
ok "$SCRIPT"

log "2/3 先跑一次"
"$SCRIPT"
LATEST=$(ls -t "$BACKUP_DIR"/*.archive 2>/dev/null | head -1)
[[ -n "$LATEST" ]] || die "备份没产出文件"
ok "$(basename "$LATEST") $(du -h "$LATEST" | cut -f1)"

log "3/3 装进 cron"
# 凌晨 4:17 —— 避开整点，那会儿各种定时任务扎堆
LINE="17 4 * * * $SCRIPT >> /home/vidge/backups/bip.log 2>&1"
if crontab -l 2>/dev/null | grep -qF "$SCRIPT"; then
  ok "cron 里已经有了"
else
  { crontab -l 2>/dev/null || true; echo "$LINE"; } | crontab -
  ok "每天 04:17 自动备份，保留 $KEEP_DAYS 天"
fi

log "完成"
printf '    备份目录：%s\n' "$BACKUP_DIR"
printf '    恢复：mongorestore --archive=%s/<文件> --gzip --drop\n\n' "$BACKUP_DIR"
