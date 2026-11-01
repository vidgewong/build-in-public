import type { AdminSnapshot } from '../../lib/admin-api';
import { periodKeyFor, todayKey, type Rule } from '../../lib/domain';

/** 今天的待办：哪些打卡类约定当前周期还没打，其中哪些已豁免（豁免的不算「还差」） */
export function todayBoard(snap: AdminSnapshot) {
  const today = todayKey();
  const checkinRules = snap.rules.filter((r) => r.active && r.type === 'checkin');
  const periodOf = (r: Rule) => periodKeyFor(r.cadence, today);
  const todo = checkinRules.filter(
    (r) => !snap.entries.some((e) => e.ruleId === r.id && e.period === periodOf(r))
  );
  const isWaived = (r: Rule) =>
    (snap.calendar.waivers ?? []).some((w) => w.ruleId === r.id && w.period === periodOf(r));
  return { today, checkinRules, todo, isWaived, owed: todo.filter((r) => !isWaived(r)) };
}
