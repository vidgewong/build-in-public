/** 站点数据的类型与派生逻辑。数据本身在运行时从 API 拉取（见 lib/api.ts） */
import {
  buildSlots,
  summarize,
  toDateKey,
  type Calendar,
  type Claim,
  type Entry,
  type Rule,
  type RuleSummary,
} from './domain';

export interface Metric {
  key: string;
  label: string;
  unit: string;
  value: number | string | null;
  /** public=正常显示，masked=打码成 ***，hidden=整行不渲染 */
  visibility: 'public' | 'masked' | 'hidden';
  maskedHint?: string;
  target?: number;
  derive?: string;
  /** 悬停时显示的补充说明，例如「非实际年龄」 */
  hint?: string;
  history?: { date: string; value: number }[];
}

export interface Profile {
  name: string;
  handle: string;
  birthday: string;
  startDate: string;
  tagline: string;
  contact: string;
}

/** API /api/snapshot 的返回结构 */
export interface Snapshot {
  rules: Rule[];
  entries: Entry[];
  claims: Claim[];
  metrics: Metric[];
  calendar: Calendar;
  profile: Profile | null;
  claimWindowDays: number;
  currency: string;
}

export function ageFrom(birthday: string, today: string): number {
  const [by, bm, bd] = birthday.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age--;
  return age;
}

export interface OverviewRow {
  rule: Rule;
  /** 周期类规则有 summary；事件类没有 */
  summary?: RuleSummary;
  openAmount: number;
  openCount: number;
  /** 事件类：历史被抓次数 */
  caughtCount: number;
  paidAmount: number;
}

export interface SiteState {
  today: string;
  summaries: RuleSummary[];
  eventRules: Rule[];
  overview: OverviewRow[];
  metrics: Metric[];
  /** 原始数据透传，页面里需要直接用 claims 的地方从这里取 */
  claims: Claim[];
  profile: Profile;
  claimWindowDays: number;
  currency: string;
  totals: {
    openCount: number;
    openAmount: number;
    paidAmount: number;
    paidCount: number;
    keptCount: number;
    keepRate: number;
    daysSinceStart: number;
    /** 等级：每守住 10 个周期升一级。只在这里算，页面不要各算各的 */
    level: number;
  };
}

/** 数据库还空着时的兜底 profile，保证站点不至于白屏 */
const FALLBACK_PROFILE: Profile = {
  name: '—',
  handle: '',
  birthday: '1970-01-01',
  startDate: toDateKey(new Date()),
  tagline: '',
  contact: '',
};

export function buildSiteState(snapshot: Snapshot, now = new Date()): SiteState {
  const today = toDateKey(now);
  const { rules, entries, claims, calendar, claimWindowDays, currency } = snapshot;
  const profile = snapshot.profile ?? FALLBACK_PROFILE;
  const activeRules = rules.filter((r) => r.active);

  const summaries = activeRules
    .filter((r) => r.cadence !== 'event')
    .map((rule) => {
      const slots = buildSlots(rule, entries, claims, calendar, {
        today,
        claimWindowDays,
        settleHour: 23,
        nowHour: now.getHours(),
      });
      return summarize(rule, slots, claims);
    });

  const eventRules = activeRules.filter((r) => r.cadence === 'event');

  const metrics = snapshot.metrics.map((m) =>
    m.derive === 'age' ? { ...m, value: ageFrom(profile.birthday, today) } : m
  );

  const openCount = summaries.reduce((a, s) => a + s.openCount, 0);
  const openAmount = summaries.reduce((a, s) => a + s.openAmount, 0);
  const keptCount = summaries.reduce((a, s) => a + s.keptCount, 0);
  const settledCount = summaries.reduce((a, s) => a + s.settledCount, 0);

  const ms = new Date(today).getTime() - new Date(profile.startDate).getTime();

  // 总览按规则定义顺序排，让访客一眼看完全部约定；可领的排版上再高亮
  const paidOf = (ruleId: string) =>
    claims.filter((c) => c.ruleId === ruleId).reduce((a, c) => a + c.amount, 0);

  const overview: OverviewRow[] = activeRules.map((rule) => {
    const summary = summaries.find((s) => s.rule.id === rule.id);
    return {
      rule,
      summary,
      openAmount: summary ? summary.openAmount : 0,
      openCount: summary ? summary.openCount : 0,
      caughtCount: claims.filter((c) => c.ruleId === rule.id).length,
      paidAmount: paidOf(rule.id),
    };
  });

  return {
    today,
    summaries,
    eventRules,
    overview,
    metrics,
    claims,
    profile,
    claimWindowDays,
    currency,
    totals: {
      openCount,
      openAmount,
      paidAmount: claims.reduce((a, c) => a + c.amount, 0),
      paidCount: claims.length,
      keptCount,
      keepRate: settledCount ? keptCount / settledCount : 1,
      daysSinceStart: Math.max(0, Math.round(ms / 86400000)) + 1,
      level: Math.max(1, Math.floor(keptCount / 10) + 1),
    },
  };
}
