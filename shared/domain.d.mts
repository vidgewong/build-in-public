/**
 * shared/domain.mjs 的类型声明。
 * 实现是纯 JS（CLI 要直接 import），类型在这里单独维护。
 * 改实现时记得同步这里——签名不一致 tsc 不会报，只会悄悄骗你。
 */

export type Cadence = 'daily' | 'weekly' | 'monthly' | 'event';
export type RuleType = 'checkin' | 'violation';

export interface Rule {
  id: string;
  title: string;
  short: string;
  cadence: Cadence;
  type: RuleType;
  amount: number;
  proof: string;
  detail: string;
  startDate: string;
  active: boolean;
  /** 展示顺序。老数据可能没有，按 0 处理 */
  order?: number;
}

export interface Entry {
  id: string;
  ruleId: string;
  /** 所属周期键：daily=YYYY-MM-DD, weekly=YYYY-Www, monthly=YYYY-MM */
  period: string;
  date: string;
  note?: string;
  media?: { type: 'image' | 'douyin' | 'link'; url: string; caption?: string }[];
  createdAt: string;
}

export interface Claim {
  id: string;
  ruleId: string;
  period: string;
  claimant: string;
  amount: number;
  paidAt: string;
  note?: string;
  /** 图片证明（转账截图）。key 对应 GET /api/media/:key。老数据可能没有。 */
  proof?: { key: string; type: 'image' }[];
}

export interface Calendar {
  /** 豁免赔付：按「规则 + 周期」。仍算失约、计入守约率，只是不可领取 */
  waivers?: { ruleId: string; period: string; reason: string }[];
}

export type SlotStatus =
  | 'kept'       // 有记录，守约
  | 'open'       // 缺记录，在滚动窗口内，可领取
  | 'claimed'    // 缺记录且已被领走
  | 'expired'    // 缺记录但超出滚动窗口，作废
  | 'waived'     // 豁免赔付（生病 / 节假日等）：算失约、计入统计，但不可领取
  | 'future'     // 还没到
  | 'pending';   // 今天，还没到结算时刻

export interface Slot {
  ruleId: string;
  period: string;
  /** 周期的起始日，用于排序和定位 */
  date: string;
  status: SlotStatus;
  entry?: Entry;
  claim?: Claim;
  waiverReason?: string;
}

export interface BuildOptions {
  today: string;
  claimWindowDays: number;
  /** daily 规则的结算时刻（小时）。当天此刻之前不判定为缺失。 */
  settleHour?: number;
  /** 当前小时，仅用于判断今天是否已过结算时刻 */
  nowHour?: number;
}

export interface RuleSummary {
  rule: Rule;
  slots: Slot[];
  openCount: number;
  openAmount: number;
  keptCount: number;
  totalDue: number;
  /** 应计周期总数（不含 future/pending；waived 计入） */
  settledCount: number;
  keepRate: number;
  /** 连续守约（从最近已结算周期往回数） */
  streak: number;
  /** 历史最长连续守约 */
  bestStreak: number;
}

/** daily 规则的结算时刻：当天 23:00 之前不判定为缺失 */
export declare const SETTLE_HOUR: number;

export declare function toDateKey(d: Date): string;
export declare function parseDateKey(key: string): Date;
export declare function addDays(key: string, n: number): string;
export declare function daysBetween(a: string, b: string): number;
export declare function todayKey(): string;
export declare function isoWeekKey(key: string): string;
export declare function isoWeekStart(weekKey: string): string;
export declare function monthKey(key: string): string;
export declare function periodKeyFor(cadence: Cadence, dateKey: string): string;
export declare function periodStart(cadence: Cadence, period: string): string;
export declare function periodEnd(cadence: Cadence, period: string): string;
export declare function periodsInRange(cadence: Cadence, from: string, to: string): string[];
export declare function formatPeriod(cadence: Cadence, period: string): string;
export declare function buildSlots(
  rule: Rule,
  entries: Entry[],
  claims: Claim[],
  calendar: Calendar,
  opts: BuildOptions
): Slot[];
export declare function summarize(rule: Rule, slots: Slot[], claims: Claim[]): RuleSummary;
