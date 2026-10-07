/**
 * 唯一的写入实现。
 * CLI（bin/bip.mjs）和 API（server/api.mjs）都调这里，不要各写一份。
 *
 * 这些函数只做「校验 + 落库 + 返回结构化结果」，不打印、不认识 HTTP。
 * 终端上色归 CLI，状态码归 API。
 *
 * 为什么存在：以前 CLI 直接调 repo，网页端如果再抄一份校验，两条写路径
 * 必然漂移——shared/domain.mjs 就是为同样的原因抽出来的。
 */

import * as repo from './repo.mjs';
import { addDays, periodKeyFor, todayKey } from '../shared/domain.mjs';

/** 校验失败。调用方据此回 400 而不是 500。 */
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

const bad = (msg) => {
  throw new ValidationError(msg);
};

export const CADENCES = ['daily', 'weekly', 'monthly', 'event'];
export const RULE_TYPES = ['checkin', 'violation'];
export const VISIBILITIES = ['public', 'masked', 'hidden'];

/** 规则允许写入的字段。白名单之外一律拒绝——以前是透传，打错 --titel 会静默存进去。 */
const RULE_FIELDS = new Set([
  'id', 'title', 'short', 'cadence', 'type', 'amount',
  'proof', 'detail', 'startDate', 'holidayExempt', 'active', 'order',
]);

export const rid = () =>
  Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

/** 把用户输入的日期简写解析成 YYYY-MM-DD */
export function resolveDate(input) {
  if (!input || input === 'today') return todayKey();
  if (input === 'yesterday') return addDays(todayKey(), -1);
  if (/^-\d+$/.test(input)) return addDays(todayKey(), Number(input));
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  if (/^\d{2}-\d{2}$/.test(input)) return `${new Date().getFullYear()}-${input}`;
  if (/^\d{8}$/.test(input)) return `${input.slice(0, 4)}-${input.slice(4, 6)}-${input.slice(6)}`;
  bad(`无法解析日期：${input}（支持 YYYY-MM-DD / MM-DD / today / yesterday / -3）`);
}

/** 按 id → short → id 前缀 → title 包含 的顺序模糊匹配，CLI 和 admin 都能用中文名定位 */
export function findRule(rules, idOrShort) {
  if (!idOrShort) return null;
  const q = String(idOrShort).toLowerCase();
  return rules.find((r) => r.id.toLowerCase() === q)
    || rules.find((r) => r.short?.toLowerCase() === q)
    || rules.find((r) => r.id.toLowerCase().startsWith(q))
    || rules.find((r) => r.title.includes(idOrShort))
    || null;
}

async function mustFindRule(idOrShort) {
  const rules = await repo.getRules();
  const rule = findRule(rules, idOrShort);
  if (!rule) {
    const avail = rules.map((r) => r.id).join(', ') || '(库里还没有规则)';
    bad(`找不到规则：${idOrShort ?? '(未指定)'}\n可用：${avail}`);
  }
  return rule;
}

/**
 * 证明媒体。接受两种形态：
 *   - 已经是 [{type,url}]（网页 admin 直接传）
 *   - { img, douyin, link, media } 的逗号分隔串（CLI 的 --img 等）
 */
export function normalizeMedia(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input
      .filter((m) => m && typeof m.url === 'string' && m.url.trim())
      .map((m) => {
        const url = extractUrl(m.url);
        return {
          type: m.type || guessType(url),
          url,
          ...(m.caption ? { caption: m.caption } : {}),
        };
      });
  }

  const media = [];
  const push = (val, type) => {
    if (!val || val === true) return;
    for (const u of String(val).split(',').map((s) => s.trim()).filter(Boolean)) {
      const url = extractUrl(u);
      media.push({ type: type || guessType(url), url });
    }
  };
  push(input.img, 'image');
  push(input.image, 'image');
  push(input.douyin, 'douyin');
  push(input.link, 'link');
  push(input.media, null);
  return media;
}

/**
 * 从分享文案里抠出真正的 URL。
 *
 * 抖音「复制链接」给的是一整段：
 *   2.35 复制打开抖音，看看【…作品】 https://v.douyin.com/xxx/ 12/11 c@N.WM HvF:/
 * 整段存下来既当不了 href，又会把 `c@N.WM` 这种抖音口令显示给访客。
 * 小红书、B 站的分享文案同理。
 *
 * 没找到 URL 就原样返回——可能是本地图片路径之类，不该在这里吞掉。
 */
function extractUrl(raw) {
  const s = String(raw).trim();
  if (/^https?:\/\/\S+$/.test(s)) return s; // 本来就是干净的链接
  const m = s.match(/https?:\/\/[^\s，。、）)】」""']+/);
  // 结尾的标点不属于 URL，分享文案里很常见
  return m ? m[0].replace(/[.,;:!?]+$/, '') : s;
}

/**
 * 猜证明的类型。站点靠它决定是渲染缩略图还是一个「链接」方块
 * （src/components/RuleBlock.tsx），猜错了照片就会变成灰方块。
 * CLI 的 --img / --douyin 是显式指定，不会走到这里。
 */
const guessType = (u) =>
  /douyin|iesdouyin/.test(u) ? 'douyin'
    : /\.(jpe?g|png|gif|webp|avif|heic|bmp|svg)(\?|#|$)/i.test(u) ? 'image'
      : /^https?:/.test(u) ? 'link' : 'image';

/* ---------- 打卡 ---------- */

/**
 * 打卡。同一规则同一周期只保留一条，重复提交视为补充证明。
 * @returns {{created: boolean, rule: object, period: string, entry: object, hasMedia: boolean}}
 */
export async function checkIn({ rule: ruleRef, date: dateInput, period: periodInput, media, note }) {
  const rule = await mustFindRule(ruleRef);
  if (rule.type === 'violation') {
    bad(`「${rule.title}」是事件类规则，用 violate 记录，而不是 check。`);
  }

  const date = resolveDate(dateInput);
  const period = periodInput || periodKeyFor(rule.cadence, date);
  const normalized = normalizeMedia(media);

  const { created, entry } = await repo.putEntry({
    id: rid(),
    ruleId: rule.id,
    period,
    date,
    note: typeof note === 'string' && note ? note : undefined,
    media: normalized,
  });

  return { created, rule, period, entry, hasMedia: normalized.length > 0 };
}

export async function deleteEntry(id) {
  if (!id) bad('需要记录 id');
  const removed = await repo.deleteEntry(id);
  if (!removed) bad(`找不到打卡记录：${id}`);
  return { id };
}

/* ---------- 违约赔付 ---------- */

/**
 * 记一笔违约赔付（钱已经给出去了，这里只是记账）。
 * 事件类规则可以同一天记多笔，周期类一个周期只能被领一次。
 */
export async function recordViolation({ rule: ruleRef, date: dateInput, claimant, amount, note }) {
  const rule = await mustFindRule(ruleRef);
  const date = resolveDate(dateInput);

  // 事件类没有自然周期，用「日期#随机」保证多次违约互不覆盖
  const period = rule.cadence === 'event'
    ? `${date}#${rid().slice(0, 4)}`
    : periodKeyFor(rule.cadence, date);

  if (rule.cadence !== 'event' && await repo.hasClaim(rule.id, period)) {
    bad(`「${rule.title}」${period} 已经被领走了，一个周期只能被领一次。`);
  }

  const paid = Number(amount ?? rule.amount);
  if (!Number.isFinite(paid) || paid < 0) bad(`金额不合法：${amount}`);

  const claim = {
    id: rid(),
    ruleId: rule.id,
    period,
    claimant: (typeof claimant === 'string' && claimant.trim()) || '匿名朋友',
    amount: paid,
    paidAt: new Date().toISOString(),
    ...(typeof note === 'string' && note ? { note } : {}),
  };
  await repo.addClaim(claim);
  return { rule, claim };
}

export async function deleteClaim(id) {
  if (!id) bad('需要赔付 id');
  const removed = await repo.deleteClaim(id);
  if (!removed) bad(`找不到赔付记录：${id}`);
  return { id };
}

/* ---------- 规则 ---------- */

/** 只保留白名单字段，并把字符串转成正确类型 */
function sanitizeRulePatch(input) {
  const patch = {};
  for (const [k, v] of Object.entries(input ?? {})) {
    if (!RULE_FIELDS.has(k)) bad(`规则没有这个字段：${k}（可用：${[...RULE_FIELDS].join(', ')}）`);
    if (v === undefined) continue;
    if (k === 'amount' || k === 'order') {
      const n = Number(v);
      if (!Number.isFinite(n)) bad(`${k} 必须是数字，收到：${v}`);
      patch[k] = n;
    } else if (k === 'holidayExempt' || k === 'active') {
      patch[k] = v === true || v === 'true';
    } else {
      patch[k] = String(v);
    }
  }
  if (patch.cadence && !CADENCES.includes(patch.cadence)) {
    bad(`cadence 只能是 ${CADENCES.join(' / ')}，收到：${patch.cadence}`);
  }
  if (patch.type && !RULE_TYPES.includes(patch.type)) {
    bad(`type 只能是 ${RULE_TYPES.join(' / ')}，收到：${patch.type}`);
  }
  if (patch.startDate) patch.startDate = resolveDate(patch.startDate);
  return patch;
}

/** 新建规则。id 必填且不能重复。 */
export async function createRule(input) {
  const patch = sanitizeRulePatch(input);
  const id = patch.id;
  if (!id) bad('需要 id');

  const rules = await repo.getRules();
  if (rules.some((r) => r.id === id)) bad(`规则 ${id} 已存在`);

  const cadence = patch.cadence || 'daily';
  const title = patch.title || id;
  const rule = {
    id,
    title,
    short: patch.short || title.slice(0, 4),
    cadence,
    type: patch.type || (cadence === 'event' ? 'violation' : 'checkin'),
    amount: patch.amount ?? 28,
    proof: patch.proof ?? '',
    detail: patch.detail ?? '',
    startDate: patch.startDate || todayKey(),
    holidayExempt: patch.holidayExempt ?? false,
    active: patch.active ?? true,
    // 新规则排在最后
    order: patch.order ?? (rules.length ? Math.max(...rules.map((r) => r.order ?? 0)) + 1 : 0),
  };
  await repo.upsertRule(rule);
  return rule;
}

/** 更新已有规则。id 是主键，不给改。 */
export async function updateRule(ruleRef, input) {
  const rule = await mustFindRule(ruleRef);
  const patch = sanitizeRulePatch(input);
  delete patch.id;
  if (!Object.keys(patch).length) bad('没有要改的字段');

  // cadence 改了但 type 没跟上时，type 会和周期矛盾（event 必须是 violation）
  if (patch.cadence === 'event' && (patch.type ?? rule.type) !== 'violation') {
    bad('event 周期的规则 type 必须是 violation');
  }

  const saved = await repo.patchRule(rule.id, patch);
  return saved;
}

export async function toggleRule(ruleRef, active) {
  const rule = await mustFindRule(ruleRef);
  const saved = await repo.patchRule(rule.id, { active: !!active });
  return saved;
}

/**
 * 删除规则。它的打卡和赔付记录会一起删掉——留着会变成找不到归属的孤儿数据。
 */
export async function deleteRule(ruleRef) {
  const rule = await mustFindRule(ruleRef);
  const { entries, claims } = await repo.deleteRuleCascade(rule.id);
  return { rule, removedEntries: entries, removedClaims: claims };
}

/* ---------- 指标 ---------- */

export async function saveMetric({ key, value, label, unit, visibility, target, hint }) {
  if (!key) bad('需要指标 key');
  if (value === undefined) bad(`请给出数值：metric ${key} <value>`);

  const metrics = await repo.getMetrics();
  const metric = metrics.find((m) => m.key === key);
  const prev = metric?.value ?? null;

  const vis = (typeof visibility === 'string' && visibility) || metric?.visibility || 'public';
  if (!VISIBILITIES.includes(vis)) {
    bad(`visibility 只能是 ${VISIBILITIES.join(' / ')}，收到：${vis}`);
  }

  // 数字就存数字，存不下的（比如血型 "O"）原样留字符串
  const parsed = value === '' || value === null ? null
    : Number.isNaN(Number(value)) ? value : Number(value);

  const patch = {
    key,
    value: parsed,
    label: (typeof label === 'string' && label) || metric?.label || key,
    unit: typeof unit === 'string' ? unit : (metric?.unit ?? ''),
    visibility: vis,
  };
  if (target !== undefined && target !== null && target !== '') {
    const t = Number(target);
    if (!Number.isFinite(t)) bad(`target 必须是数字，收到：${target}`);
    patch.target = t;
  }
  if (hint !== undefined) patch.hint = String(hint);

  const saved = await repo.setMetric(key, patch);
  if (!saved) {
    // setMetric 用的 findOneAndUpdate 没开 upsert，指标不存在时补一条
    await repo.upsertMetric({ ...patch, history: [] });
  }
  // 只有数值型才进历史，字符串画不出曲线
  if (typeof parsed === 'number') {
    await repo.pushMetricHistory(key, { date: todayKey(), value: parsed });
  }

  return { metric: patch, prev, created: !saved };
}

export async function deleteMetric(key) {
  if (!key) bad('需要指标 key');
  const removed = await repo.deleteMetric(key);
  if (!removed) bad(`找不到指标：${key}`);
  return { key };
}

/* ---------- 豁免 ---------- */

export async function setExemption(dateInput, reason, { remove = false } = {}) {
  const date = resolveDate(dateInput);

  if (remove) {
    const removed = await repo.removeExemption(date);
    return { date, removed, added: false };
  }

  const added = await repo.addExemption(date, reason || '手动豁免');
  if (!added) bad(`${date} 已有豁免记录`);
  return { date, added: true, removed: false, reason: reason || '手动豁免' };
}

/* ---------- 个人档案 ---------- */

const PROFILE_FIELDS = new Set(['name', 'handle', 'birthday', 'startDate', 'tagline', 'contact']);

export async function saveProfile(input) {
  const patch = {};
  for (const [k, v] of Object.entries(input ?? {})) {
    if (!PROFILE_FIELDS.has(k)) bad(`档案没有这个字段：${k}`);
    if (v !== undefined) patch[k] = String(v);
  }
  if (!Object.keys(patch).length) bad('没有要改的字段');
  if (patch.birthday) patch.birthday = resolveDate(patch.birthday);
  if (patch.startDate) patch.startDate = resolveDate(patch.startDate);
  return repo.saveProfile(patch);
}
