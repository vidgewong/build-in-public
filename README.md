# build-in-public

VIDGE 的人生公测 · 行为准则篇。我用钱给自己的行为标价，朋友抓到我没做到，这笔钱就是他的。

站点：`open.vidge.me`

## 架构

```
MongoDB  ←→  server/repo.mjs  ←→  server/api.mjs  →  GET /api/snapshot
                     ↑                                      ↓
                 bin/bip.mjs (CLI，唯一写入口)        React 前端运行时拉取
```

- **没有登录**。站点只读，所有写入都走本机 CLI。
- 判定逻辑（周期、缺口、豁免）在 `src/lib/domain.ts`，站点和 CLI 共用同一套规则。

### 集合

| 集合 | 内容 |
|---|---|
| `rules` | 规则定义，`order` 控制站点展示顺序 |
| `entries` | 打卡记录，含证明（图片 / 抖音链接） |
| `claims` | 赔付记录 |
| `metrics` | 人物指标，带 `history` |
| `config` | 单文档配置：`_id` 为 `profile` / `calendar` / `settings` |

## 本地跑起来

```bash
npm install
npm run db:up        # 起 MongoDB（brew services，开机自启）
npm run db:seed      # 写入 profile / settings 骨架，规则留空

npm run api          # API 服务 → http://127.0.0.1:8787
npm run dev          # 前端 → http://localhost:5173（/api 已代理到 8787）
```

想先用 `data/*.json` 里的测试数据看看效果：

```bash
node server/seed.mjs --from-json           # 导入
node server/seed.mjs --from-json --reset   # 清空后重新导入
```

### 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `MONGODB_URI` | `mongodb://127.0.0.1:27017` | 连接串 |
| `MONGODB_DB` | `buildinpublic` | 数据库名 |
| `API_PORT` | `8787` | API 端口 |
| `API_HOST` | `127.0.0.1` | API 监听地址 |
| `VITE_API_BASE` | 空（同源） | 前端请求前缀，跨域部署时用 |

本机用 `brew install mongodb-community@7.0` 装的 MongoDB。如果更想用容器，仓库里的 `docker-compose.yml` 可以直接 `docker compose up -d`，连接串不变。

## CLI

```bash
npm run bip -- <command>      # 或 npx bip <command>
```

| 命令 | 作用 |
|---|---|
| `bip today` | 今天还差哪些打卡 |
| `bip status [--days 30]` | 全部规则的守约率与缺口 |
| `bip check <rule> [date] --img <url>` | 打卡，附证明 |
| `bip violate <rule> [date] --to <朋友>` | 记一笔赔付（别名 `bip claim`） |
| `bip metric <key> <value>` | 更新指标，自动留历史 |
| `bip exempt <date> [理由] [--rm]` | 手动豁免某天 |
| `bip rule list\|add\|set\|on\|off` | 管理规则 |

date 支持 `YYYY-MM-DD` / `MM-DD` / `today` / `yesterday` / `-3`。

朋友在微信上抓到我，而我拿不出证明——先发红包，再：

```bash
npm run bip -- violate 早起 yesterday --to 老王
```

## 新增一条约定

```bash
npm run bip -- rule add --id no-sugar \
  --title "不喝含糖饮料" --short 戒糖 \
  --cadence event --amount 100 \
  --detail "当场被看见就算" --proof "朋友的现场照片"
```

`cadence` 取 `daily` / `weekly` / `monthly` / `event`。`event` 是非周期的「抓现行」规则，没有缺口，只能当场被抓。
