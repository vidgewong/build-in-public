/**
 * 共享领域逻辑：把「规则 + 记录 + 领取」推导成「周期格子」。
 *
 * 这里是唯一的实现。网站（src/lib/domain.ts）和 CLI（bin/bip.mjs）都从这里取，
 * 保证两边判定完全一致——以前 CLI 抄了一份，结果 settleHour 的处理漏掉了，
 * 导致开站第一天就凭空显示 ¥80 敞口。
 *
 * 纯 JS 无依赖，Node 和浏览器都能直接跑。类型见同目录的 domain.d.mts。
 */

/** daily 规则的结算时刻：当天 23:00 之前不判定为缺失 */
export const SETTLE_HOUR = 23;

/* ---------- 日期工具：全部按本地日历字符串处理，避免时区漂移 ---------- */

export function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

export function daysBetween(a, b) {
  const ms = parseDateKey(b).getTime() - parseDateKey(a).getTime();
  return Math.round(ms / 86400000);
}

export function todayKey() {
  return toDateKey(new Date());
}

/** ISO 周键：YYYY-Www，周一为一周之始 */
export function isoWeekKey(key) {
  const d = parseDateKey(key);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNum = (target.getDay() + 6) % 7; // 周一=0
  target.setDate(target.getDate() - dayNum + 3); // 移到当周周四
  const isoYear = target.getFullYear();
  const firstThursday = new Date(isoYear, 0, 4);
  const firstDayNum = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDayNum + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/** 某个 ISO 周键对应的周一 */
export function isoWeekStart(weekKey) {
  const [yStr, wStr] = weekKey.split('-W');
  const year = Number(yStr);
  const week = Number(wStr);
  const jan4 = new Date(year, 0, 4);
  const jan4DayNum = (jan4.getDay() + 6) % 7;
  const week1Monday = new Date(year, 0, 4 - jan4DayNum);
  week1Monday.setDate(week1Monday.getDate() + (week - 1) * 7);
  return toDateKey(week1Monday);
}

export function monthKey(key) {
  return key.slice(0, 7);
}

export function periodKeyFor(cadence, dateKey) {
  switch (cadence) {
    case 'daily':
      return dateKey;
    case 'weekly':
      return isoWeekKey(dateKey);
    case 'monthly':
      return monthKey(dateKey);
    default:
      return dateKey;
  }
}

/** 周期键 → 该周期的起始日 */
export function periodStart(cadence, period) {
  switch (cadence) {
    case 'weekly':
      return isoWeekStart(period);
    case 'monthly':
      return `${period}-01`;
    default:
      return period;
  }
}

/** 周期键 → 该周期的结束日（含） */
export function periodEnd(cadence, period) {
  switch (cadence) {
    case 'weekly':
      return addDays(isoWeekStart(period), 6);
    case 'monthly': {
      const [y, m] = period.split('-').map(Number);
      return toDateKey(new Date(y, m, 0));
    }
    default:
      return period;
  }
}

export function formatPeriod(cadence, period) {
  switch (cadence) {
    case 'weekly': {
      const s = periodStart(cadence, period);
      const e = periodEnd(cadence, period);
      return `${s.slice(5).replace('-', '/')} – ${e.slice(5).replace('-', '/')}`;
    }
    case 'monthly':
      return `${period.slice(0, 4)} 年 ${Number(period.slice(5))} 月`;
    default:
      return period.slice(5).replace('-', '/');
  }
}

/* ---------- 豁免 ---------- */

export function exemptionFor(calendar, dateKey) {
  const manual = calendar.manualExemptions?.find((e) => e.date === dateKey);
  if (manual) return { reason: manual.reason };
  const year = dateKey.slice(0, 4);
  if (calendar.legalHolidays?.[year]?.includes(dateKey)) {
    return { reason: '法定节假日' };
  }
  return null;
}

/* ---------- 核心：展开周期格子 ---------- */

/**
 * 展开一条规则从 startDate 到 today 的所有周期格子。
 * event 类规则没有周期，返回空数组（它们只有违约记录）。
 */
export function buildSlots(rule, entries, claims, calendar, opts) {
  if (rule.cadence === 'event') return [];

  const { today, claimWindowDays } = opts;
  const settleHour = opts.settleHour ?? SETTLE_HOUR;
  const nowHour = opts.nowHour ?? SETTLE_HOUR;

  const entryByPeriod = new Map();
  for (const e of entries) {
    if (e.ruleId === rule.id) entryByPeriod.set(e.period, e);
  }
  const claimByPeriod = new Map();
  for (const c of claims) {
    if (c.ruleId === rule.id) claimByPeriod.set(c.period, c);
  }

  const slots = [];
  const windowStart = addDays(today, -claimWindowDays);

  // 按周期粒度迭代
  const seen = new Set();
  let cursor = rule.startDate;
  // 周/月规则从所属周期的起始日开始迭代
  while (daysBetween(cursor, today) >= 0) {
    const period = periodKeyFor(rule.cadence, cursor);
    if (!seen.has(period)) {
      seen.add(period);
      slots.push(makeSlot(rule, period, entryByPeriod, claimByPeriod, calendar, {
        today,
        windowStart,
        settleHour,
        nowHour,
      }));
    }
    cursor = addDays(cursor, 1);
  }

  return slots;
}

function makeSlot(rule, period, entryByPeriod, claimByPeriod, calendar, ctx) {
  const start = periodStart(rule.cadence, period);
  const end = periodEnd(rule.cadence, period);
  const entry = entryByPeriod.get(period);
  const claim = claimByPeriod.get(period);

  const base = { ruleId: rule.id, period, date: start, status: 'future', entry, claim };

  if (entry) return { ...base, status: 'kept' };

  // 豁免：daily 看当天；weekly/monthly 整个周期都豁免才算豁免（过于宽松反而失真，所以只对 daily 生效）
  if (rule.holidayExempt && rule.cadence === 'daily') {
    const ex = exemptionFor(calendar, start);
    if (ex) return { ...base, status: 'exempt', exemptReason: ex.reason };
  }

  if (claim) return { ...base, status: 'claimed' };

  // 周期尚未结束 → 还有机会补记录
  if (daysBetween(ctx.today, end) > 0) return { ...base, status: 'pending' };

  // 今天这一格：未到结算时刻前不算缺失
  if (end === ctx.today && ctx.nowHour < ctx.settleHour) {
    return { ...base, status: 'pending' };
  }

  // 滚动窗口：以周期结束日判断是否还在可领取期内
  if (daysBetween(ctx.windowStart, end) < 0) return { ...base, status: 'expired' };

  return { ...base, status: 'open' };
}

/* ---------- 汇总 ---------- */

export function summarize(rule, slots, claims) {
  const ruleClaims = claims.filter((c) => c.ruleId === rule.id);
  const open = slots.filter((s) => s.status === 'open');
  const kept = slots.filter((s) => s.status === 'kept');
  const settled = slots.filter((s) =>
    s.status === 'kept' || s.status === 'open' || s.status === 'claimed' || s.status === 'expired'
  );

  // 连续守约：从最后一个已结算周期往回
  let streak = 0;
  for (let i = settled.length - 1; i >= 0; i--) {
    if (settled[i].status === 'kept') streak++;
    else break;
  }
  let bestStreak = 0;
  let run = 0;
  for (const s of settled) {
    if (s.status === 'kept') {
      run++;
      bestStreak = Math.max(bestStreak, run);
    } else run = 0;
  }

  return {
    rule,
    slots,
    openCount: open.length,
    openAmount: open.length * rule.amount,
    keptCount: kept.length,
    totalDue: ruleClaims.reduce((a, c) => a + c.amount, 0),
    settledCount: settled.length,
    keepRate: settled.length ? kept.length / settled.length : 1,
    streak,
    bestStreak,
  };
}
