# build-in-public — 设计基准

## 命题
这是一张**公开的账单**：每个空格子都是一笔钱，缺席是可见的，而且标着价。
设计的想法：**账本里的价格与时间，变成纯字体的陈述**。大字、整块的色场、旧账本与旧物的真实图片，不加任何装饰件。

## 方向
"Type and nothing else"：先留白，再把一句话立在轴线上。文案一字不改，只动排版、色彩、布局与动效。

## 字体
- 展示：Bodoni Moda Variable（中文回落 Noto Serif SC Variable）
- 正文：Jost Variable
- 最多两套字体；正文 16px 起、用满墨色；字号阶梯约五级。

## 色彩：沙与苔
| token | 值 | 用途 |
|---|---|---|
| `--bg` | #ddd6c6 | 页面底 |
| `--bg-2` / `--panel` | #d2cab8 / #c7bea9 | 次级底、图框 |
| `--ink` / `--ink-2` / `--ink-3` | #2a2a26 / #36352f / #3e3c34 | 正文、次要、注释 |
| `--accent` / `--field` | #4f6238 / #3f5a2a | 按钮、整块绿色场（页脚、数据带） |
| `--open` | #c8232c | 只给钱和缺口 |
| `--kept` / `--claimed` | #98a97b / #cfa24a | 守约、已领 |

深色主题有对应的一组（见 `src/styles.css`）。

## 禁用
无标签小字（eyebrow）、胶囊徽章、等宽字、序号、细线框、渐变、静止阴影、毛玻璃、悬浮胶囊导航、图标卡片。
所有动效都有 `prefers-reduced-motion` 降级。

## 图片
六张大都会博物馆 CC0 藏品，位于 `public/art/`，署名在 `src/lib/art.ts` 的 `FOOT_CREDIT`。

## 校验
`node .claude/skills/design-taste-frontend/scripts/inspect.mjs <url>`，五个公开页 0 FAIL；
`lint.mjs src --app` 通过。

## admin
工作台布局：桌面左右分栏各自滚动，手机分段切换。沿用同一套色彩与字体，不用毛玻璃、渐变与静止阴影。
