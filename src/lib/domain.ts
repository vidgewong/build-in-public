/**
 * 领域逻辑的前端入口。
 *
 * 实现不在这里——在 shared/domain.mjs，CLI（bin/bip.mjs）也 import 同一份。
 * 这个文件只做转发，保证站点和 CLI 永远用同一套判定。
 * 不要在这里加逻辑；要改判定规则，改 shared/domain.mjs。
 */

export type {
  Cadence,
  RuleType,
  Rule,
  Entry,
  Claim,
  Calendar,
  SlotStatus,
  Slot,
  BuildOptions,
  RuleSummary,
} from '../../shared/domain.mjs';

export {
  SETTLE_HOUR,
  toDateKey,
  parseDateKey,
  addDays,
  daysBetween,
  todayKey,
  isoWeekKey,
  isoWeekStart,
  monthKey,
  periodKeyFor,
  periodStart,
  periodEnd,
  formatPeriod,
  exemptionFor,
  buildSlots,
  summarize,
} from '../../shared/domain.mjs';
